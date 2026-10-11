/**
 * The survivors run (S0, src/run/run.ts): grabs and rescues, the wool cushion, the cap on
 * sheep taken at once, Gafoop's presence and the bucket, the shearing booths, strays, saucers,
 * level-ups, the hearing, determinism.
 */
import { describe, expect, test } from 'vitest';
import { meadowField } from '../src/run/field';
import { Run, Sheep, Pickup } from '../src/run/run';
import { Phase } from '../src/run/enemies';
import { RUN, SAUCER } from '../src/run/config';
import type { RunOptions } from '../src/run/config';
import { playOut } from '../src/run/bot';

const field = meadowField();

function run(options: Partial<RunOptions> = {}, seed = 1): Run {
  const r = new Run(field, { seed, options: { grazing: false, ...options } });
  // past the first minute, when Gloops go for Gafoop only; Gafoop parked far away
  r.time = 61;
  r.gafoop.x = r.gafoop.px = 110;
  r.gafoop.y = r.gafoop.py = 80;
  return r;
}

/** Step without the director adding monsters (keeps a scenario to the ones it set up). */
function steps(r: Run, n: number): void {
  r.spawning = false;
  for (let k = 0; k < n; k++) r.step();
}

/** Put flock sheep j down at (x, y). */
function put(r: Run, j: number, x: number, y: number): void {
  r.model.hold(j);
  r.model.place(j, x, y);
  r.model.release(j);
}

/** n Gloops right beside sheep j, heading for it. */
function gloopsOn(r: Run, j: number, n: number): number[] {
  const o = r.model.out;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = r.enemies.spawn('gloop', o.x[j] + 0.3 * Math.cos(k * 2), o.y[j] + 0.3 * Math.sin(k * 2), 1);
    r.enemies.target[i] = j;
    r.enemies.retarget[i] = 99;
    out.push(i);
  }
  return out;
}

describe('the run', () => {
  test('starts with the flock out and the strays waiting where they graze', () => {
    const r = new Run(field, { seed: 1 });
    expect(r.flockCount).toBe(RUN.startFlock);
    const strays = r.strays();
    expect(strays.length).toBe(RUN.strays.groups.length);
    // a held stray does not wander off
    const before = strays.map((s) => ({ ...s }));
    for (let k = 0; k < 90; k++) r.step();
    r.strays().forEach((s, k) => expect(Math.hypot(s.x - before[k].x, s.y - before[k].y)).toBeLessThan(0.01));
  });

  test('in the first minute the Gloops go for Gafoop, not the sheep', () => {
    const r = new Run(field, { seed: 2, options: { cushion: false } });
    for (let k = 0; k < 50 / r.dt; k++) r.step();
    expect(r.stats.lost + r.takenCount).toBe(0);
    expect(r.enemies.countOf('gloop')).toBeGreaterThan(0);
  });

  test('three Gloops lift a bare sheep and carry it off; with nobody holding it, it is free', () => {
    const r = run({ cushion: false });
    const ids = gloopsOn(r, 0, 3);
    steps(r, 6);
    expect(r.status[0]).toBe(Sheep.Carried);
    const o = r.model.out;
    const x0 = o.x[0];
    const y0 = o.y[0];
    steps(r, 30);
    expect(Math.hypot(o.x[0] - x0, o.y[0] - y0)).toBeGreaterThan(0.5);
    // its takers deported (removed here): it drops back into the flock
    for (const i of ids) r.enemies.remove(i);
    steps(r, 2);
    expect(r.status[0]).toBe(Sheep.Flock);
    expect(r.stats.rescued).toBe(1);
  });

  test('one Gloop only pins a sheep; it takes three to lift it', () => {
    const r = run({ cushion: false });
    gloopsOn(r, 1, 1);
    steps(r, 6);
    expect(r.status[1]).toBe(Sheep.Grabbed);
  });

  test('a sheep carried out over the wall is lost, and its takers go with it', () => {
    const r = run({ cushion: false });
    // a sheep near the west wall
    r.model.hold(2);
    r.model.place(2, 3, 46);
    r.model.release(2);
    gloopsOn(r, 2, 3);
    for (let k = 0; k < 30 / r.dt && r.status[2] !== Sheep.Lost; k++) steps(r, 1);
    expect(r.status[2]).toBe(Sheep.Lost);
    expect(r.stats.lost).toBe(1);
    expect(r.enemies.countOf('gloop')).toBe(0);
  });

  test('a woolly sheep\'s fleece takes the first grab, and lies there to be picked up', () => {
    const r = run({ cushion: true });
    r.wool[3] = 1;
    gloopsOn(r, 3, 1);
    steps(r, 6);
    expect(r.status[3]).toBe(Sheep.Flock);
    // torn off (and just starting to grow back)
    expect(r.wool[3]).toBeLessThan(0.05);
    expect(r.stats.torn).toBe(1);
    let tufts = 0;
    for (let k = 0; k < r.pickups.high; k++) if (r.pickups.alive[k] && r.pickups.kind[k] === Pickup.Tuft) tufts++;
    expect(tufts).toBe(3);
  });

  test('no more sheep can be taken at once than one in eight of the flock (at least two)', () => {
    const r = run({ cushion: false });
    for (let j = 0; j < RUN.startFlock; j++) gloopsOn(r, j, 3);
    steps(r, 20);
    expect(r.takenCount).toBe(RUN.carry.min);
  });

  test('sheep move off as Gafoop comes at them', () => {
    const r = run();
    r.spawning = false;
    const f0 = r.flockCentre();
    r.gafoop.x = r.gafoop.px = f0.x - 12;
    r.gafoop.y = r.gafoop.py = f0.y;
    for (let k = 0; k < 5 / r.dt; k++) {
      const f = r.flockCentre();
      r.input.move.x = f.x - r.gafoop.x > 3 ? 1 : 0;
      r.input.move.y = 0;
      r.step();
    }
    expect(r.flockCentre().x - f0.x).toBeGreaterThan(1.5);
  });

  test('holding the bucket does nothing without a Feed Bucket; with one, the flock comes to him', () => {
    const call = (bucket: boolean) => {
      const r = run();
      if (bucket) r.items.set('bucket', 1);
      const f0 = r.flockCentre();
      r.gafoop.x = r.gafoop.px = f0.x + 8;
      r.gafoop.y = r.gafoop.py = f0.y;
      r.input.bucket = true;
      steps(r, 6 / r.dt);
      const f = r.flockCentre();
      return Math.hypot(f.x - r.gafoop.x, f.y - r.gafoop.y);
    };
    expect(call(false)).toBeGreaterThan(7);
    expect(call(true)).toBeLessThan(6);
  });

  test('Gafoop does not shear: a full fleece beside him stays on', () => {
    const r = run();
    const o = r.model.out;
    r.wool[4] = 1;
    r.gafoop.x = o.x[4];
    r.gafoop.y = o.y[4] + 0.5;
    steps(r, 30);
    expect(r.wool[4]).toBe(1);
    expect(r.stats.sheared).toBe(0);
  });

  test('a shearing booth calls in a woolly sheep from its mouth, shears it, lets it off at the side, and the wool is experience', () => {
    const r = run();
    const b = r.booths[0].site;
    r.wool[4] = 1;
    put(r, 4, b.mx, b.my);
    steps(r, 1);
    expect(r.status[4]).toBe(Sheep.Booth);
    // still Gafoop's while it is in there
    expect(r.flockCount).toBe(RUN.startFlock);
    for (let k = 0; k < 4 / r.dt && r.status[4] !== Sheep.Flock; k++) steps(r, 1);
    expect(r.status[4]).toBe(Sheep.Flock);
    expect(r.wool[4]).toBeLessThan(0.01);
    expect(r.stats.sheared).toBe(1);
    const o = r.model.out;
    expect(Math.hypot(o.x[4] - b.ox, o.y[4] - b.oy)).toBeLessThan(1);
    // the wool flies to Gafoop, wherever he is
    steps(r, 10 / r.dt);
    expect(r.stats.xpWool).toBeCloseTo(RUN.wool.value, 0);
  });

  test('a booth shears one sheep at a time, and leaves sheep with too little wool alone', () => {
    const r = run();
    const b = r.booths[0].site;
    r.wool[4] = r.wool[5] = 1;
    r.wool[6] = 0.1;
    put(r, 4, b.mx + 1, b.my);
    put(r, 5, b.mx - 1, b.my);
    put(r, 6, b.mx, b.my + 1);
    steps(r, 1);
    const inside = [4, 5, 6].filter((j) => r.status[j] === Sheep.Booth);
    expect(inside.length).toBe(1);
    expect(inside[0]).not.toBe(6);
    steps(r, 6 / r.dt);
    expect(r.stats.sheared).toBe(2);
    expect(r.status[6]).toBe(Sheep.Flock);
    expect(r.wool[6]).toBeGreaterThan(0.1);
  });

  test('strays join the flock when Gafoop finds them, and walk back to it', () => {
    const r = run();
    const s = r.strays()[0];
    r.gafoop.x = s.x + 1;
    r.gafoop.y = s.y;
    steps(r, 2);
    expect(r.flockCount).toBe(RUN.startFlock + s.n);
    expect(r.stats.found).toBe(s.n);
    expect(r.strays().length).toBe(RUN.strays.groups.length - 1);
  });

  test('a saucer marks a sheep, then beams it up; shot down mid-beam, it drops the sheep', () => {
    const r = run();
    const f = r.flockCentre();
    const i = r.enemies.spawn('saucer', f.x, f.y, 1);
    r.enemies.z[i] = SAUCER.height;
    steps(r, 10);
    expect(r.enemies.phase[i]).toBe(Phase.Telegraph);
    let beamed = -1;
    for (let k = 0; k < (SAUCER.telegraph + 2) / r.dt && beamed < 0; k++) {
      steps(r, 1);
      for (let j = 0; j < r.n; j++) if (r.status[j] === Sheep.Beamed) beamed = j;
    }
    expect(beamed).toBeGreaterThanOrEqual(0);
    steps(r, 50);
    expect(r.lift[beamed]).toBeGreaterThan(0.5);
    // shot down mid-beam: the sheep falls back to the flock
    r.deport(i);
    expect(r.status[beamed]).toBe(Sheep.Flock);
    steps(r, 30);
    expect(r.lift[beamed]).toBe(0);
  });

  test('level-ups offer three different cards, and the run waits for a pick', () => {
    const r = run({ levelups: 'pause' });
    r.choices = r.deal();
    r.pending = 1;
    expect(r.choices.length).toBe(3);
    const names = r.choices.map((c) => JSON.stringify(c));
    expect(new Set(names).size).toBe(3);
    const t = r.time;
    steps(r, 10);
    expect(r.time).toBe(t);
    const c = r.choices[0];
    r.choose(0);
    expect(r.choices).toBeNull();
    if ('item' in c) expect(r.lvl(c.item)).toBe(c.level);
  });

  test('with level-ups banked, the run goes on until a supply drop is opened', () => {
    const r = run({ levelups: 'bank' });
    // a crate's worth
    r.pending = 1;
    const t = r.time;
    steps(r, 5);
    expect(r.time).toBeGreaterThan(t);
    expect(r.choices).toBeNull();
    r.openSupplies();
    expect(r.choices?.length).toBe(3);
  });

  test('when the Bureau reconvenes every monster is deported and every sheep let go', () => {
    const r = run({ cushion: false });
    gloopsOn(r, 0, 3);
    steps(r, 6);
    expect(r.status[0]).toBe(Sheep.Carried);
    r.time = RUN.length - r.dt / 2;
    steps(r, 1);
    expect(r.over).toBe('won');
    expect(r.enemies.countOf()).toBe(0);
    expect(r.status[0]).toBe(Sheep.Flock);
  });

  test('is deterministic', () => {
    const play = (seed: number) => {
      const r = new Run(field, { seed });
      playOut(r, 90);
      return `${r.model.hash()} ${r.stats.kills} ${r.level} ${r.flockCount}`;
    };
    expect(play(5)).toBe(play(5));
    expect(play(5)).not.toBe(play(6));
  });

  test('the bot holds the flock for the whole ten minutes', () => {
    const r = new Run(field, { seed: 3 });
    playOut(r);
    expect(r.over).toBe('won');
    expect(r.flockCount).toBeGreaterThanOrEqual(8);
    expect(r.level).toBeGreaterThanOrEqual(12);
  });
});
