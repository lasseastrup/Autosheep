/**
 * The run's items (src/run/items.ts): one scenario for each, set up by hand with the director
 * off. Gafoop's starting stamp is taken away where it would do the item's work for it.
 */
import { describe, expect, test } from 'vitest';
import { meadowField } from '../src/run/field';
import { Run, Sheep } from '../src/run/run';
import { RUN } from '../src/run/config';
import { ITEMS, SLOTS, type ItemId } from '../src/run/items';
import type { RunOptions } from '../src/run/config';

const field = meadowField();

/** Past the first minute, no monsters coming, Gafoop parked far off, holding only `items`. */
function run(items: Partial<Record<ItemId, number>> = {}, options: Partial<RunOptions> = {}): Run {
  const r = new Run(field, { seed: 1, options: { grazing: false, ...options } });
  r.time = 61;
  r.spawning = false;
  r.items.clear();
  for (const [id, l] of Object.entries(items)) r.items.set(id as ItemId, l!);
  park(r, 110, 80);
  return r;
}

function park(r: Run, x: number, y: number): void {
  r.gafoop.x = r.gafoop.px = x;
  r.gafoop.y = r.gafoop.py = y;
}

function seconds(r: Run, s: number): void {
  for (let k = 0; k < s / r.dt; k++) r.step();
}

function put(r: Run, j: number, x: number, y: number): void {
  r.model.hold(j);
  r.model.place(j, x, y);
  r.model.release(j);
}

/** A Gloop at (x, y) going after sheep j. */
function gloopAt(r: Run, x: number, y: number, j?: number): number {
  const i = r.enemies.spawn('gloop', x, y, 1);
  if (j !== undefined) {
    r.enemies.target[i] = j;
    r.enemies.retarget[i] = 99;
  }
  return i;
}

describe('armaments', () => {
  test('paper planes home in on a monster going for a sheep', () => {
    const r = run({ planes: 1 });
    const o = r.model.out;
    park(r, o.x[0], o.y[0] - 6);
    const i = gloopAt(r, o.x[0] + 8, o.y[0], 0);
    seconds(r, 3);
    expect(r.planes.high).toBeGreaterThan(0);
    expect(r.enemies.alive[i] === 0 || r.enemies.hp[i] < 8).toBe(true);
  });

  test('red tape slows and hurts what crosses it', () => {
    const r = run({ tape: 1 });
    park(r, 30, 20);
    r.input.move.x = 1;
    seconds(r, 1.6);
    r.input.move.x = 0;
    r.items.delete('tape');
    park(r, 35, 8);
    // after Gafoop, so across the tape
    const i = gloopAt(r, 35, 21.5, -1);
    let slowest = 1;
    for (let k = 0; k < 1.5 / r.dt && r.enemies.alive[i]; k++) {
      r.step();
      slowest = Math.min(slowest, r.enemies.slow[i]);
    }
    expect(slowest).toBeLessThan(1);
    expect(r.enemies.alive[i] === 0 || r.enemies.hp[i] < 8).toBe(true);
  });

  test('the hole punch goes for the toughest monster in reach', () => {
    const r = run({ punch: 1 });
    park(r, 30, 30);
    const big = r.enemies.spawn('bigGloop', 33, 30, 1);
    const small = r.enemies.spawn('gloop', 31.5, 31, 1);
    seconds(r, 0.3);
    expect(r.enemies.hp[big]).toBeCloseTo(140 - 30, 3);
    expect(r.enemies.hp[small]).toBe(8);
  });

  test('a filing cabinet lands on the thickest crowd', () => {
    const r = run({ cabinet: 1 });
    park(r, 30, 30);
    for (let k = 0; k < 5; k++) r.enemies.spawn('gloop', 37 + (k % 2) * 0.6, 30 + k * 0.4, 1);
    seconds(r, 2.2);
    expect(r.stats.kills).toBeGreaterThanOrEqual(3);
  });

  test('rams butt whatever comes too close', () => {
    const r = run({ rams: 1 });
    seconds(r, 0.1);
    const ram = [...r.horns].findIndex((h, j) => h === 1 && r.status[j] === Sheep.Flock);
    expect(ram).toBeGreaterThanOrEqual(0);
    const o = r.model.out;
    const i = gloopAt(r, o.x[ram] + 1.3, o.y[ram], ram);
    seconds(r, 0.5);
    expect(r.enemies.alive[i]).toBe(0);
  });

  test('ear tags zap the monster that grabs, until it lets go', () => {
    const r = run({ tags: 1 }, { cushion: false });
    const o = r.model.out;
    const i = gloopAt(r, o.x[0] + 0.3, o.y[0], 0);
    seconds(r, 0.2);
    expect([Sheep.Grabbed, Sheep.Flock]).toContain(r.status[0]);
    seconds(r, 1.5);
    expect(r.enemies.alive[i]).toBe(0);
    expect(r.status[0]).toBe(Sheep.Flock);
  });

  test('a torn fleece bursts like flak', () => {
    const r = run({ flak: 1 }, { cushion: true });
    r.wool[3] = 1;
    const o = r.model.out;
    const i = gloopAt(r, o.x[3] + 0.3, o.y[3], 3);
    seconds(r, 0.3);
    expect(r.stats.torn).toBe(1);
    expect(r.enemies.alive[i]).toBe(0);
  });
});

describe('tools', () => {
  test('the dog whistle brings a split flock back together', () => {
    const gap = (whistle: boolean) => {
      const r = run(whistle ? { whistle: 1 } : {});
      const f = r.flockCentre();
      for (let j = 4; j < 8; j++) put(r, j, f.x + 16 + (j % 2), f.y + (j - 6));
      seconds(r, 6);
      const o = r.model.out;
      const mid = (a: number, b: number) => {
        let x = 0;
        for (let j = a; j < b; j++) x += o.x[j];
        return x / (b - a);
      };
      return mid(4, 8) - mid(0, 4);
    };
    expect(gap(true)).toBeLessThan(gap(false) - 2);
  });

  test('the Woof-Woof blows a monster away from Gafoop', () => {
    const r = run({ woof: 1 });
    park(r, 30, 30);
    const i = r.enemies.spawn('gloop', 31.5, 30, 1);
    seconds(r, 0.5);
    expect(Math.hypot(r.enemies.x[i] - 30, r.enemies.y[i] - 30)).toBeGreaterThan(3.5);
  });

  test('a clockwork collie comes to the flock and bites a monster at it', () => {
    const r = run({ collie: 1 });
    const f = r.flockCentre();
    park(r, f.x - 6, f.y);
    seconds(r, 0.1);
    expect(r.collies.length).toBe(1);
    const o = r.model.out;
    const i = gloopAt(r, o.x[0] + 2.5, o.y[0] + 2.5, 0);
    seconds(r, 4);
    expect(r.enemies.alive[i] === 0 || r.enemies.hp[i] < 8).toBe(true);
  });

  test('a salt lick goes down where Gafoop is, and the flock gathers at it', () => {
    const r = run({ lick: 1 });
    const f = r.flockCentre();
    park(r, f.x + 7, f.y);
    seconds(r, 2.5);
    const k = [...r.licks.alive].indexOf(1);
    expect(k).toBeGreaterThanOrEqual(0);
    park(r, 110, 80);
    const before = Math.hypot(r.flockCentre().x - r.licks.x[k], r.flockCentre().y - r.licks.y[k]);
    seconds(r, 6);
    const after = Math.hypot(r.flockCentre().x - r.licks.x[k], r.flockCentre().y - r.licks.y[k]);
    expect(after).toBeLessThan(before - 1.5);
  });

  test('an inflatable sheep draws a Gloop, and bursts on it', () => {
    const r = run({ decoys: 1 });
    seconds(r, 1.2);
    const k = [...r.decoys.alive].indexOf(1);
    expect(k).toBeGreaterThanOrEqual(0);
    const f = r.flockCentre();
    const dx = r.decoys.x[k] - f.x;
    const dy = r.decoys.y[k] - f.y;
    const d = Math.hypot(dx, dy);
    const i = r.enemies.spawn('gloop', r.decoys.x[k] + (dx / d) * 1.5, r.decoys.y[k] + (dy / d) * 1.5, 1);
    seconds(r, 2);
    expect(r.decoys.alive[k]).toBe(0);
    expect(r.enemies.alive[i]).toBe(0);
    expect(r.stats.lost + r.takenCount).toBe(0);
  });

  test('a shearing drone shears full fleeces in the flock, one sheep at a time', () => {
    const r = run({ drone: 1 });
    const f = r.flockCentre();
    park(r, f.x + 5, f.y);
    seconds(r, 8);
    expect(r.stats.sheared).toBe(1);
    seconds(r, 10);
    expect(r.stats.xpWool).toBeGreaterThan(0);
  });
});

describe('provisions', () => {
  test('composure training adds a pip, filled', () => {
    const r = run();
    r.choices = [{ item: 'composure', level: 1 }, { extra: 'snack' }, { extra: 'salvage' }];
    r.pending = 1;
    r.choose(0);
    expect(r.composureMax).toBe(RUN.gafoop.composure + 1);
    expect(r.gafoop.composure).toBe(RUN.gafoop.composure + 1);
  });

  test('an expense account pays more for every pickup', () => {
    const r = run({ expense: 2 });
    park(r, 30, 30);
    const i = r.enemies.spawn('gloop', 30.5, 30, 1);
    r.deport(i);
    seconds(r, 1);
    expect(r.xp).toBeCloseTo(0.6 * 1.2, 3);
  });

  test('a calm flock has lambs in lambing season', () => {
    const r = run({ lambs: 1 });
    seconds(r, 22);
    expect(r.flockCount).toBe(RUN.startFlock + 1);
  });

  test('a stubborn sheep kicks itself free', () => {
    const r = run({ stubborn: 4 }, { cushion: false });
    const o = r.model.out;
    for (let k = 0; k < 3; k++) gloopAt(r, o.x[0] + 0.3 * Math.cos(k * 2), o.y[0] + 0.3 * Math.sin(k * 2), 0);
    seconds(r, 0.3);
    expect(r.status[0]).toBe(Sheep.Carried);
    for (let k = 0; k < 15 / r.dt && r.status[0] !== Sheep.Flock; k++) r.step();
    expect(r.status[0]).toBe(Sheep.Flock);
    expect(r.stats.lost).toBe(0);
  });

  test('homing instinct: strays join from further away', () => {
    const found = (homing: number) => {
      const r = run(homing ? { homing } : {});
      const s = r.strays()[0];
      park(r, s.x + 12, s.y);
      seconds(r, 0.5);
      return r.stats.found > 0;
    };
    expect(found(0)).toBe(false);
    expect(found(4)).toBe(true);
  });
});

describe('dealing', () => {
  test('until Gafoop has a tool, one card in three is a tool', () => {
    const r = new Run(field, { seed: 2 });
    for (let k = 0; k < 20; k++) {
      const cards = r.deal();
      expect(cards.some((c) => 'item' in c && ITEMS[c.item].kind === 'tool')).toBe(true);
    }
  });

  test('a kind with its slots full offers only what is held', () => {
    const r = new Run(field, { seed: 3 });
    r.items.set('bucket', 1).set('whistle', 1).set('woof', 1);
    expect(SLOTS.tool).toBe(3);
    for (let k = 0; k < 40; k++) {
      for (const c of r.deal()) {
        if ('item' in c && ITEMS[c.item].kind === 'tool') expect(['bucket', 'whistle', 'woof']).toContain(c.item);
      }
    }
  });

  test('every item has card lines for every level', () => {
    for (const def of Object.values(ITEMS)) {
      expect(def.lines.length).toBe(def.max);
      for (const [a] of def.lines) expect(a.length).toBeGreaterThan(0);
    }
  });
});
