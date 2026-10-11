import type { FlockModel, Stimulus } from '../sim/contract';
import { SheepherdingV1 } from '../sim/models/sheepherding-v1';
import { GrassField } from '../sim/grass';
import { cluster } from '../sim/scenarios';
import { Rng } from '../engine/rng';
import { DEFAULT_OPTIONS, DIRECTOR, ENEMY, FIELD, HP_PER_MINUTE, MINUTES, MODEL_PATCH, RUN, SAUCER, xpToNext, type EnemyKind, type RunOptions } from './config';
import { Enemies, EnemyGrid, KIND, KINDS, Phase } from './enemies';
import { EXTRAS, ITEM_IDS, ITEMS, SLOTS, STATS, type Card, type Extra, type ItemId } from './items';
import type { BoothSite, RunField } from './field';

/** Where each sheep is in the story of a run. */
export const Sheep = {
  /** a spare, kept out of play off the field */
  Reserve: 0,
  /** grazing on its own somewhere, not yet found */
  Stray: 1,
  /** one of the flock */
  Flock: 2,
  /** pinned by a monster (fewer than a full team to lift it) */
  Grabbed: 3,
  /** lifted and being carried off */
  Carried: 4,
  /** rising into a saucer */
  Beamed: 5,
  /** gone: to a very nice farm on Zorblax 9 */
  Lost: 6,
  /** in a shearing booth: hopping up, being shorn, or hopping off */
  Booth: 7,
} as const;

/** What can be picked up. */
export const Pickup = { Wool: 0, Salvage: 1, Tuft: 2, Crate: 3 } as const;

/** Things that happened during a step, for the view to show and play. */
export type RunEvent =
  | { kind: 'poof'; x: number; y: number; z: number; enemy: EnemyKind; escaped: boolean }
  | { kind: 'stamp'; x: number; y: number; r: number }
  | { kind: 'bell'; x: number; y: number; r: number }
  | { kind: 'zap'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'crook'; x: number; y: number; angle: number; arc: number; r: number }
  | { kind: 'staple' }
  | { kind: 'grab'; sheep: number }
  | { kind: 'free'; sheep: number }
  | { kind: 'lost'; sheep: number; beamed: boolean; x: number; y: number }
  | { kind: 'fleece'; sheep: number; x: number; y: number }
  | { kind: 'shear'; sheep: number; x: number; y: number }
  | { kind: 'claim'; n: number; x: number; y: number }
  | { kind: 'strays'; x: number; y: number }
  | { kind: 'sheep'; n: number; x: number; y: number }
  | { kind: 'level'; level: number }
  | { kind: 'hurt' }
  | { kind: 'ko' }
  | { kind: 'mark'; enemy: number }
  | { kind: 'beam'; enemy: number }
  | { kind: 'pickup'; crate: boolean }
  | { kind: 'first'; what: 'grab' | 'saucer' | 'carried' | 'elite' | 'lost' | 'claim' | 'gloop' | 'booth' }
  | { kind: 'hearing' }
  | { kind: 'dismissed' };

/** A shearing booth at work: the sheep it has called in, and the one hopping off. */
export interface Booth {
  site: BoothSite;
  /** the sheep called in (hopping up, then being shorn), or -1 */
  cur: number;
  /** seconds since it was called: it lands after `hop` and is shorn `RUN.booths.shear` later */
  t: number;
  hop: number;
  /** where it was called from, and the wool it had */
  fromX: number;
  fromY: number;
  wool0: number;
  /** the sheep hopping off (-1: none), and seconds since it set off */
  off: number;
  offT: number;
  /** sheep shorn here this run */
  shorn: number;
}

export interface RunInput {
  /** where Gafoop wants to go: a direction on the ground, length up to 1 (full speed) */
  move: { x: number; y: number };
  /** the bucket is held */
  bucket: boolean;
}

/**
 * One run of the survivors prototype (S0): the flock behind the flock contract, Gafoop, the
 * monsters, his stationery and the flock's gear, wool and salvage, level-ups and the clock.
 * Headless and deterministic from its seed; the view (runGame.ts) only reads it and feeds it
 * input. Advances in the flock model's fixed steps.
 */
export class Run {
  readonly model: FlockModel;
  /** the meadow's grass; the flock eats it only with the grazing option on */
  readonly grass: GrassField;
  readonly options: RunOptions;
  readonly rng: Rng;
  readonly dt: number;
  readonly n = RUN.capacity;
  time = 0;

  // ---- the sheep, by index (the flock model's)
  readonly status = new Uint8Array(RUN.capacity);
  /** 0 just shorn .. 1 a full fleece */
  readonly wool = new Float32Array(RUN.capacity);
  /** long-term fright, which slows wool (it fades over half a minute) */
  readonly stress = new Float32Array(RUN.capacity);
  /** how high off the ground: carried, beamed up, or falling back */
  readonly lift = new Float32Array(RUN.capacity);
  /** which stray group a stray belongs to (-1: none) */
  readonly strayGroup = new Int16Array(RUN.capacity).fill(-1);
  /** wears a bell (Bell Collars) and the seconds until it rings */
  readonly collar = new Uint8Array(RUN.capacity);
  readonly bellIn = new Float32Array(RUN.capacity);
  /** where the monsters carrying it are heading */
  readonly exitX = new Float32Array(RUN.capacity);
  readonly exitY = new Float32Array(RUN.capacity);
  /** monsters holding it, and how much lifting they add up to (last step's) */
  readonly hands = new Uint8Array(RUN.capacity);
  private readonly liftSum = new Float32Array(RUN.capacity);
  private readonly handCount = new Uint8Array(RUN.capacity);

  readonly gafoop = {
    x: RUN.gafoopStart.x, y: RUN.gafoopStart.y, px: RUN.gafoopStart.x, py: RUN.gafoopStart.y,
    vx: 0, vy: 0, facing: 0,
    composure: RUN.gafoop.composure, invulnerable: 0, ko: 0, calm: 0,
  };

  /** the shearing booths (the field's), and what each is doing */
  readonly booths: Booth[];

  readonly enemies = new Enemies(360);
  private readonly grid = new EnemyGrid(FIELD.width, FIELD.height, 360);

  // ---- staples in flight
  readonly staples = {
    cap: 160, high: 0,
    alive: new Uint8Array(160), x: new Float32Array(160), y: new Float32Array(160), px: new Float32Array(160), py: new Float32Array(160),
    vx: new Float32Array(160), vy: new Float32Array(160), damage: new Float32Array(160), pierce: new Uint8Array(160), life: new Float32Array(160),
    hitA: new Int32Array(160), hitB: new Int32Array(160),
  };

  // ---- things to pick up
  readonly pickups = {
    cap: 400, high: 0,
    alive: new Uint8Array(400), kind: new Uint8Array(400), x: new Float32Array(400), y: new Float32Array(400), px: new Float32Array(400), py: new Float32Array(400),
    value: new Float32Array(400), life: new Float32Array(400), home: new Uint8Array(400), speed: new Float32Array(400),
  };

  // ---- progress
  level = 1;
  xp = 0;
  /** level-ups not yet taken */
  pending = 0;
  /** the cards on offer, while a level-up is open (the run waits) */
  choices: Card[] | null = null;
  readonly items = new Map<ItemId, number>();
  private readonly cooldown: Record<string, number> = { stamp: 0.5, stapler: 0, crook: 0, static: 0 };
  over: 'won' | 'lost' | null = null;
  readonly stats = { kills: 0, found: 0, rescued: 0, lost: 0, sheared: 0, torn: 0, peak: RUN.startFlock, xpWool: 0, xpKills: 0 };

  /** the middle of the screen, which spawns ring round (the view keeps it up to date) */
  readonly viewCentre = { x: RUN.start.x, y: RUN.start.y };
  spawnRadius = RUN.spawnRadius;
  /** monsters come in (off for tests and tooling that set up their own) */
  spawning = true;
  readonly input: RunInput = { move: { x: 0, y: 0 }, bucket: false };
  private events: RunEvent[] = [];
  private readonly firsts = new Set<string>();
  private readonly startles: Stimulus[] = [];
  private stimuli: Stimulus[] = [];
  private readonly director = { credits: 0, nextClump: 1, lastSaucer: 150 - SAUCER.every, losses: [] as number[], easeUntil: -1, done: new Set<string>() };
  private strayGroups: { id: number; members: number[] }[] = [];
  private nextStrayGroup = 0;
  private nextStrays = RUN.strays.from;

  /** @param opts.grass  a field to reuse (the view keeps drawing the same one), refilled */
  constructor(field: RunField, opts: { seed?: number; options?: Partial<RunOptions>; grass?: GrassField } = {}) {
    const seed = opts.seed ?? 1;
    this.options = { ...DEFAULT_OPTIONS, ...opts.options };
    this.rng = new Rng(seed * 7919 + 13);
    this.grass = opts.grass ?? new GrassField(FIELD.width, FIELD.height);
    this.grass.fill(field.cap);

    // every sheep the run will ever have is in the model from the start: the flock where it
    // grazes, and everyone else (strays, spares) held until they come into play
    const N = RUN.capacity;
    const start = cluster(RUN.startFlock, RUN.start.x, RUN.start.y, seed, 1.5);
    const sheep: { x: number; y: number }[] = [...start];
    // the rest stand in two rows along the south wall until they are held and moved away
    for (let i = sheep.length; i < N; i++) sheep.push({ x: 2 + ((i * 1.7) % 116), y: i % 2 ? 87.5 : 89 });
    const model = new SheepherdingV1(MODEL_PATCH);
    model.init({ seed, width: FIELD.width, height: FIELD.height, sheep });
    model.setObstacles(field.obstacles);
    this.booths = field.booths.map((site) => ({ site, cur: -1, t: 0, hop: 0, fromX: 0, fromY: 0, wool0: 0, off: -1, offT: 0, shorn: 0 }));
    model.setGrass(this.options.grazing ? this.grass : null);
    this.model = model;
    this.dt = model.dt;
    for (let i = 0; i < N; i++) {
      this.wool[i] = 1;
      if (i < RUN.startFlock) {
        this.status[i] = Sheep.Flock;
        continue;
      }
      this.status[i] = Sheep.Reserve;
      model.hold(i);
      model.place(i, RUN.offstage.x, RUN.offstage.y);
    }
    for (const [x, y, n] of RUN.strays.groups) this.addStrays(x, y, n, false);
    this.items.set('stamp', 1);
  }

  // ------------------------------------------------------------------ reading

  /** Everything that happened since the last call (the view drains these each frame). */
  drain(): RunEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** An item's level (0: not owned). */
  lvl(id: ItemId): number {
    return this.items.get(id) ?? 0;
  }

  /** The sheep that are Gafoop's: the flock, any in a shearing booth, and any being carried off (not lost yet). */
  get flockCount(): number {
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.status[i];
      if (s === Sheep.Flock || s === Sheep.Grabbed || s === Sheep.Carried || s === Sheep.Beamed || s === Sheep.Booth) n++;
    }
    return n;
  }

  /** Sheep being taken right now. */
  get takenCount(): number {
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.status[i];
      if (s === Sheep.Grabbed || s === Sheep.Carried || s === Sheep.Beamed) n++;
    }
    return n;
  }

  /** No more sheep than this may be taken at once (plan §7.2). */
  get takeCap(): number {
    return Math.max(RUN.carry.min, Math.floor(this.flockCount / RUN.carry.per));
  }

  get timeLeft(): number {
    return Math.max(0, RUN.length - this.time);
  }

  /** The run is waiting: a level-up is open, or it is over. */
  get paused(): boolean {
    return this.choices !== null || this.over !== null;
  }

  /** Where the flock is: the middle of the sheep that are Gafoop's and on the ground. */
  flockCentre(): { x: number; y: number; n: number } {
    const o = this.model.out;
    let x = 0;
    let y = 0;
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.status[i] !== Sheep.Flock) continue;
      x += o.x[i];
      y += o.y[i];
      n++;
    }
    return n ? { x: x / n, y: y / n, n } : { x: this.gafoop.x, y: this.gafoop.y, n: 0 };
  }

  /** The wool at or above which a sheep's fleece takes a grab. */
  get cushion(): number {
    return RUN.wool.cushion - 0.075 * this.lvl('fleece');
  }

  /** Stray groups not yet found: where they are and how many. */
  strays(): { x: number; y: number; n: number }[] {
    const o = this.model.out;
    return this.strayGroups.map((g) => {
      let x = 0;
      let y = 0;
      for (const m of g.members) { x += o.x[m]; y += o.y[m]; }
      return { x: x / g.members.length, y: y / g.members.length, n: g.members.length };
    });
  }

  // ------------------------------------------------------------------ the step

  /** Advance one fixed step (nothing happens while the run is paused). */
  step(): void {
    if (this.paused) return;
    const dt = this.dt;
    this.time += dt;
    this.trail();
    this.moveGafoop(dt);
    this.direct();
    this.strayStep();
    this.grid.build(this.enemies);
    this.enemyStep(dt);
    this.flockStep(dt);
    this.boothStep(dt);
    this.woolStep(dt);
    this.grid.build(this.enemies);
    this.weaponStep(dt);
    this.stapleStep(dt);
    this.pickupStep(dt);
    this.stats.peak = Math.max(this.stats.peak, this.flockCount);
    this.checkEnd();
  }

  private emit(e: RunEvent): void {
    // a busy field should not bury the view; the few that matter always get through
    if (this.events.length < 400 || e.kind !== 'bell') this.events.push(e);
  }

  private first(what: Extract<RunEvent, { kind: 'first' }>['what']): void {
    if (this.firsts.has(what)) return;
    this.firsts.add(what);
    this.emit({ kind: 'first', what });
  }

  /** Remember where everything was, so the view can draw between steps. */
  private trail(): void {
    const g = this.gafoop;
    g.px = g.x;
    g.py = g.y;
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) { e.px[i] = e.x[i]; e.py[i] = e.y[i]; }
    const s = this.staples;
    for (let i = 0; i < s.high; i++) { s.px[i] = s.x[i]; s.py[i] = s.y[i]; }
    const p = this.pickups;
    for (let i = 0; i < p.high; i++) { p.px[i] = p.x[i]; p.py[i] = p.y[i]; }
  }

  // ------------------------------------------------------------------ Gafoop

  private moveGafoop(dt: number): void {
    const g = this.gafoop;
    const G = RUN.gafoop;
    if (g.ko > 0) {
      g.ko -= dt;
      if (g.ko <= 0) {
        g.composure = G.composure;
        g.invulnerable = 1.5;
      }
    }
    g.invulnerable = Math.max(0, g.invulnerable - dt);
    g.calm += dt;
    if (g.ko <= 0 && g.calm >= G.regen && g.composure < G.composure) {
      g.composure++;
      g.calm = 0;
    }
    let mx = this.input.move.x;
    let my = this.input.move.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const speed = g.ko > 0 ? 0 : G.speed * (1 + 0.1 * this.lvl('disc'));
    const k = 1 - Math.exp(-dt * G.accel);
    g.vx += (mx * speed - g.vx) * k;
    g.vy += (my * speed - g.vy) * k;
    g.x = Math.max(-G.beyond, Math.min(FIELD.width + G.beyond, g.x + g.vx * dt));
    g.y = Math.max(-G.beyond, Math.min(FIELD.height + G.beyond, g.y + g.vy * dt));
    if (Math.hypot(g.vx, g.vy) > 0.6) g.facing = Math.atan2(g.vy, g.vx);
  }

  private hurtGafoop(): boolean {
    const g = this.gafoop;
    if (g.invulnerable > 0 || g.ko > 0) return false;
    g.composure--;
    g.invulnerable = RUN.gafoop.invulnerable;
    g.calm = 0;
    this.emit({ kind: 'hurt' });
    if (g.composure <= 0) {
      g.composure = 0;
      g.ko = RUN.gafoop.knockedOut;
      this.emit({ kind: 'ko' });
    }
    return true;
  }

  // ------------------------------------------------------------------ spawning

  private get minute(): number {
    return Math.min(MINUTES.length - 1, Math.floor(this.time / 60));
  }

  private hpScale(): number {
    return 1 + HP_PER_MINUTE * (this.time / 60);
  }

  /** The minute table, its scripted moments, and the director on top. */
  private direct(): void {
    if (!this.spawning) return;
    const dt = this.dt;
    const min = this.minute;
    const M = MINUTES[min];
    const into = this.time - min * 60;
    const d = this.director;
    for (const ev of M.events ?? []) {
      const key = `${min}:${ev.at}:${ev.kind}`;
      if (into < ev.at || d.done.has(key)) continue;
      d.done.add(key);
      if (ev.kind === 'ring') this.ring(ev.n ?? 16);
      else {
        const p = this.spawnPoint(true);
        this.enemies.spawn('bigGloop', p.x, p.y, this.hpScale());
        this.first('elite');
      }
    }
    // the table: at least `min` Gloops about, topped up a few at a time, and a clump every
    // `every` seconds whatever
    const gloops = this.enemies.countOf('gloop');
    if (gloops < M.min) this.clump(Math.min(3, M.min - gloops));
    d.nextClump -= dt;
    if (d.nextClump <= 0) {
      d.nextClump += M.every;
      this.clump(1 + Math.floor(this.rng.next() * 3));
    }
    // the director: a bigger flock draws more of them; heavy losses ease it off
    const ease = this.time < d.easeUntil ? DIRECTOR.ease : 1;
    const flock = Math.max(0.5, this.flockCount / DIRECTOR.flock);
    d.credits += dt * DIRECTOR.rate * (1 + DIRECTOR.perMinute * min) * flock * ease;
    if (d.credits >= DIRECTOR.clump) {
      d.credits -= DIRECTOR.clump;
      if (!M.breather) this.clump(3);
    }
    if (this.enemies.countOf('saucer') < M.saucers && this.time - d.lastSaucer >= SAUCER.every) {
      d.lastSaucer = this.time;
      const p = this.spawnPoint(false);
      const i = this.enemies.spawn('saucer', p.x, p.y, this.hpScale());
      if (i >= 0) this.enemies.z[i] = SAUCER.height;
    }
  }

  /**
   * Where monsters come in: on a ring just off the screen. Ones after sheep come in on the far
   * side of the flock from Gafoop, so he has to circle it like a dog; the first minute's, which
   * are after him, come in ahead of where he is going.
   */
  private spawnPoint(forSheep: boolean): { x: number; y: number } {
    const c = this.viewCentre;
    const g = this.gafoop;
    let a = this.rng.range(0, Math.PI * 2);
    if (forSheep) {
      const f = this.flockCentre();
      if (Math.hypot(f.x - g.x, f.y - g.y) > 2) a = Math.atan2(f.y - g.y, f.x - g.x) + this.rng.range(-1.2, 1.2);
    } else if (Math.hypot(g.vx, g.vy) > 1) {
      a = Math.atan2(g.vy, g.vx) + this.rng.range(-1, 1);
    }
    return { x: c.x + Math.cos(a) * this.spawnRadius, y: c.y + Math.sin(a) * this.spawnRadius };
  }

  private clump(n: number): void {
    const p = this.spawnPoint(this.time >= 60);
    for (let k = 0; k < n; k++) {
      const i = this.enemies.spawn('gloop', p.x + this.rng.range(-1.5, 1.5), p.y + this.rng.range(-1.5, 1.5), this.hpScale());
      if (i >= 0) this.enemies.retarget[i] = this.rng.range(0, 0.4);
    }
    this.first('gloop');
  }

  /** A ring of Gloops all round the flock, closing in. */
  private ring(n: number): void {
    const f = this.flockCentre();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.enemies.spawn('gloop', f.x + Math.cos(a) * this.spawnRadius, f.y + Math.sin(a) * this.spawnRadius, this.hpScale());
    }
  }

  // ------------------------------------------------------------------ strays

  /** A group of `n` stray sheep grazing round (x, y), out of the spares. */
  private addStrays(x: number, y: number, n: number, announce = true): void {
    const at = cluster(n, x, y, this.nextStrayGroup + 101, 1.6);
    const members: number[] = [];
    for (let i = 0; i < this.n && members.length < n; i++) {
      if (this.status[i] !== Sheep.Reserve) continue;
      const p = at[members.length];
      this.status[i] = Sheep.Stray;
      this.strayGroup[i] = this.nextStrayGroup;
      this.wool[i] = 1;
      this.model.place(i, p.x, p.y);
      members.push(i);
    }
    if (!members.length) return;
    this.strayGroups.push({ id: this.nextStrayGroup++, members });
    if (announce) this.emit({ kind: 'strays', x, y });
  }

  private strayStep(): void {
    const S = RUN.strays;
    if (this.time >= this.nextStrays) {
      this.nextStrays = Math.max(this.nextStrays + S.every, this.time);
      if (this.strayGroups.length >= S.max) return;
      const f = this.flockCentre();
      for (let tries = 0; tries < 24; tries++) {
        const x = this.rng.range(10, FIELD.width - 10);
        const y = this.rng.range(10, FIELD.height - 10);
        if (Math.hypot(x - f.x, y - f.y) < S.away) continue;
        if (this.booths.some((b) => Math.hypot(x - b.site.x, y - b.site.y) < 8)) continue;
        this.addStrays(x, y, S.size[0] + Math.floor(this.rng.next() * (S.size[1] - S.size[0] + 1)));
        break;
      }
    }
    if (!this.strayGroups.length) return;
    const o = this.model.out;
    const g = this.gafoop;
    // the flock finding them costs more to check, so only every few steps
    const byFlock = Math.round(this.time / this.dt) % 6 === 0;
    for (const grp of [...this.strayGroups]) {
      let found = false;
      for (const m of grp.members) {
        if (Math.hypot(o.x[m] - g.x, o.y[m] - g.y) < S.byGafoop) { found = true; break; }
        if (!byFlock) continue;
        for (let i = 0; i < this.n && !found; i++) {
          if (this.status[i] === Sheep.Flock && Math.hypot(o.x[m] - o.x[i], o.y[m] - o.y[i]) < S.byFlock) found = true;
        }
        if (found) break;
      }
      if (found) this.claim(grp);
    }
  }

  /** A stray group joins the flock. */
  private claim(grp: { id: number; members: number[] }): void {
    const o = this.model.out;
    let x = 0;
    let y = 0;
    for (const m of grp.members) {
      x += o.x[m];
      y += o.y[m];
      this.model.release(m);
      this.status[m] = Sheep.Flock;
      this.strayGroup[m] = -1;
    }
    this.strayGroups = this.strayGroups.filter((g) => g !== grp);
    this.stats.found += grp.members.length;
    this.emit({ kind: 'claim', n: grp.members.length, x: x / grp.members.length, y: y / grp.members.length });
    this.first('claim');
  }

  /** Spares into the flock, beside it (the +3 SHEEP card). */
  private addSheep(n: number): void {
    const f = this.flockCentre();
    const at = cluster(n, f.x + 2, f.y + 2, Math.floor(this.time * 10) + 7, 1.6);
    let k = 0;
    for (let i = 0; i < this.n && k < n; i++) {
      if (this.status[i] !== Sheep.Reserve) continue;
      this.model.place(i, Math.max(1, Math.min(FIELD.width - 1, at[k].x)), Math.max(1, Math.min(FIELD.height - 1, at[k].y)));
      this.model.release(i);
      this.status[i] = Sheep.Flock;
      this.wool[i] = 1;
      k++;
    }
    if (k) this.emit({ kind: 'sheep', n: k, x: f.x, y: f.y });
  }

  // ------------------------------------------------------------------ monsters

  private enemyStep(dt: number): void {
    const e = this.enemies;
    this.liftSum.fill(0);
    this.handCount.fill(0);
    const decay = Math.exp(-dt * 6);
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      e.flash[i] = Math.max(0, e.flash[i] - dt);
      e.shred[i] = Math.max(0, e.shred[i] - dt);
      e.kx[i] *= decay;
      e.ky[i] *= decay;
      if (e.kind[i] === KIND.saucer) this.saucerStep(i, dt);
      else this.gloopStep(i, dt);
    }
    this.separate();
    this.carryStep(dt);
    this.hands.set(this.handCount);
  }

  /** What a Gloop is after: a grab that needs hands, a sheep of its own, or Gafoop. */
  private chooseTarget(i: number): number {
    const e = this.enemies;
    const g = this.gafoop;
    // the first minute is Gafoop's: moving and hitting come before protecting
    if (this.time < 60) return -1;
    const o = this.model.out;
    const x = e.x[i];
    const y = e.y[i];
    const big = e.kind[i] === KIND.bigGloop;
    let best = -2;
    let bd = 12;
    if (!big) {
      for (let j = 0; j < this.n; j++) {
        const s = this.status[j];
        if ((s !== Sheep.Grabbed && s !== Sheep.Carried) || this.hands[j] >= 3) continue;
        const d = Math.hypot(o.x[j] - x, o.y[j] - y);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) return best;
    }
    bd = 45;
    if (this.takenCount < this.takeCap || g.ko > 0) {
      for (let j = 0; j < this.n; j++) {
        if (this.status[j] !== Sheep.Flock) continue;
        const d = Math.hypot(o.x[j] - x, o.y[j] - y);
        if (d < bd) { bd = d; best = j; }
      }
    }
    const dg = Math.hypot(g.x - x, g.y - y);
    if (best >= 0 && !(g.ko <= 0 && dg < 4 && dg < bd)) return best;
    return -1;
  }

  private gloopStep(i: number, dt: number): void {
    const e = this.enemies;
    const spec = ENEMY[KINDS[e.kind[i]]];
    if (e.phase[i] === Phase.Attached) {
      const j = e.carry[i];
      const s = j >= 0 ? this.status[j] : -1;
      if (s === Sheep.Grabbed || s === Sheep.Carried) {
        this.liftSum[j] += spec.lift;
        this.handCount[j]++;
        return;
      }
      e.phase[i] = Phase.Seek;
      e.carry[i] = -1;
      e.retarget[i] = 0;
    }
    e.retarget[i] -= dt;
    if (e.retarget[i] <= 0) {
      e.retarget[i] = 0.5 + this.rng.next() * 0.2;
      e.target[i] = this.chooseTarget(i);
    }
    // a Gloop that has just been knocked back is reeling (t < 0) and cannot touch anything
    e.t[i] += dt;
    const reeling = e.t[i] < 0;
    const o = this.model.out;
    const g = this.gafoop;
    let tgt = e.target[i];
    if (tgt >= 0) {
      const s = this.status[tgt];
      if (s !== Sheep.Flock && s !== Sheep.Grabbed && s !== Sheep.Carried) {
        tgt = e.target[i] = -1;
        e.retarget[i] = 0;
      }
    }
    const tx = tgt >= 0 ? o.x[tgt] : g.x;
    const ty = tgt >= 0 ? o.y[tgt] : g.y;
    const dx = tx - e.x[i];
    const dy = ty - e.y[i];
    const d = Math.hypot(dx, dy);
    if (d > 1e-3) {
      e.vx[i] = (dx / d) * spec.speed;
      e.vy[i] = (dy / d) * spec.speed;
    }
    e.x[i] += (e.vx[i] + e.kx[i]) * dt;
    e.y[i] += (e.vy[i] + e.ky[i]) * dt;
    if (reeling) return;
    if (tgt === -1) {
      if (d < RUN.gafoop.radius + spec.radius && this.hurtGafoop()) {
        this.knock(i, -dx / (d || 1), -dy / (d || 1), 2);
        e.t[i] = -0.6;
      }
    } else if (d < spec.radius + 0.5) {
      this.touchSheep(i, tgt, dx / (d || 1), dy / (d || 1));
    }
  }

  /** A Gloop reaches a sheep: the fleece takes it, or it grabs, or it lends a hand. */
  private touchSheep(i: number, j: number, ux: number, uy: number): void {
    const e = this.enemies;
    const big = e.kind[i] === KIND.bigGloop;
    if (this.status[j] === Sheep.Flock) {
      if (this.takenCount >= this.takeCap) {
        e.target[i] = -1;
        return;
      }
      if (this.options.cushion && this.wool[j] >= this.cushion) {
        this.tearFleece(j);
        this.knock(i, -ux, -uy, 2.5);
        e.t[i] = -0.8;
        return;
      }
      this.model.hold(j);
      this.status[j] = Sheep.Grabbed;
      this.setExit(j);
      this.emit({ kind: 'grab', sheep: j });
      this.first('grab');
    }
    const s = this.status[j];
    if ((s === Sheep.Grabbed || s === Sheep.Carried) && (big || this.hands[j] < 3)) {
      e.phase[i] = Phase.Attached;
      e.carry[i] = j;
      this.hands[j]++;
      this.liftSum[j] += ENEMY[KINDS[e.kind[i]]].lift;
      this.handCount[j]++;
    }
  }

  /** The fleece takes the grab: torn off in tufts worth picking up, and the sheep bolts. */
  private tearFleece(j: number): void {
    const o = this.model.out;
    const x = o.x[j];
    const y = o.y[j];
    const value = this.wool[j] * RUN.wool.value;
    this.wool[j] = 0;
    for (let k = 0; k < 3; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      this.drop(x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9, value / 3, Pickup.Tuft, false);
    }
    this.startles.push({ id: 0, kind: 'startle', x, y, strength: 1, radius: 4 });
    this.stats.torn++;
    this.emit({ kind: 'fleece', sheep: j, x, y });
  }

  /** Where the monsters that took sheep j carry it: out over the nearest wall. */
  private setExit(j: number): void {
    const o = this.model.out;
    const x = o.x[j];
    const y = o.y[j];
    const W = FIELD.width;
    const H = FIELD.height;
    const d = [x, W - x, y, H - y];
    const k = d.indexOf(Math.min(...d));
    const out = RUN.carry.exit;
    this.exitX[j] = k === 0 ? -out : k === 1 ? W + out : x;
    this.exitY[j] = k === 2 ? -out : k === 3 ? H + out : y;
  }

  /** Sheep being taken move with their takers; a sheep with nobody left holding it is free. */
  private carryStep(dt: number): void {
    const e = this.enemies;
    const o = this.model.out;
    const slow = 1 - 0.12 * this.lvl('fleece');
    for (let j = 0; j < this.n; j++) {
      const s = this.status[j];
      if (s !== Sheep.Grabbed && s !== Sheep.Carried) continue;
      if (this.handCount[j] === 0) {
        this.free(j, true);
        continue;
      }
      const power = this.liftSum[j];
      const lifted = power >= 0.999;
      if (lifted && s === Sheep.Grabbed) {
        this.status[j] = Sheep.Carried;
        this.first('carried');
      } else if (!lifted) this.status[j] = Sheep.Grabbed;
      const speed = RUN.carry.speed * Math.min(1, power) * (lifted ? 1 : 0.5) * slow;
      let x = o.x[j];
      let y = o.y[j];
      const dx = this.exitX[j] - x;
      const dy = this.exitY[j] - y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-3) {
        x += (dx / d) * Math.min(d, speed * dt);
        y += (dy / d) * Math.min(d, speed * dt);
      }
      this.model.place(j, x, y);
      this.lift[j] += ((lifted ? 0.7 : 0.1) - this.lift[j]) * (1 - Math.exp(-dt * 6));
      const beyond = Math.max(-x, x - FIELD.width, -y, y - FIELD.height);
      if (beyond >= RUN.carry.lost) this.lose(j, false);
    }
    // the takers hang on round their sheep
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.phase[i] !== Phase.Attached) continue;
      const j = e.carry[i];
      const a = e.uid[i] * 2.39996;
      const r = e.kind[i] === KIND.bigGloop ? 0.75 : 0.55;
      e.x[i] = o.x[j] + Math.cos(a) * r;
      e.y[i] = o.y[j] + Math.sin(a) * r;
    }
  }

  /** Sheep j is gone for this run. Whatever took it goes with it. */
  private lose(j: number, beamed: boolean): void {
    const e = this.enemies;
    const x = this.model.out.x[j];
    const y = this.model.out.y[j];
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.carry[i] !== j || e.kind[i] === KIND.saucer) continue;
      this.emit({ kind: 'poof', x: e.x[i], y: e.y[i], z: 0.5, enemy: KINDS[e.kind[i]], escaped: true });
      e.remove(i);
    }
    this.status[j] = Sheep.Lost;
    this.lift[j] = 0;
    this.collar[j] = 0;
    this.model.place(j, RUN.offstage.x, RUN.offstage.y);
    this.stats.lost++;
    const d = this.director;
    d.losses.push(this.time);
    d.losses = d.losses.filter((t) => this.time - t <= DIRECTOR.window);
    if (d.losses.length >= DIRECTOR.losses) d.easeUntil = this.time + DIRECTOR.rest;
    this.emit({ kind: 'lost', sheep: j, beamed, x, y });
    this.first('lost');
  }

  /** Sheep j is let go (its takers beaten, hooked off, or the hearing called): back in the flock. */
  private free(j: number, rescued: boolean): void {
    const s = this.status[j];
    if (s !== Sheep.Grabbed && s !== Sheep.Carried && s !== Sheep.Beamed) return;
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.carry[i] !== j) continue;
      e.carry[i] = -1;
      if (e.kind[i] !== KIND.saucer) {
        e.phase[i] = Phase.Seek;
        e.retarget[i] = 0.6;
      }
    }
    const o = this.model.out;
    // over the wall it hops back in
    this.model.place(j, Math.max(1, Math.min(FIELD.width - 1, o.x[j])), Math.max(1, Math.min(FIELD.height - 1, o.y[j])));
    this.model.release(j);
    this.status[j] = Sheep.Flock;
    this.hands[j] = 0;
    if (rescued) {
      this.stats.rescued++;
      this.emit({ kind: 'free', sheep: j });
    }
  }

  private knock(i: number, ux: number, uy: number, metres: number): void {
    const e = this.enemies;
    if (e.phase[i] === Phase.Attached || e.kind[i] === KIND.saucer) return;
    e.kx[i] += ux * metres * 6;
    e.ky[i] += uy * metres * 6;
  }

  /** Gloops do not stand in each other. */
  private separate(): void {
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.kind[i] === KIND.saucer || e.phase[i] === Phase.Attached) continue;
      const ri = ENEMY[KINDS[e.kind[i]]].radius;
      this.grid.near(e.x[i], e.y[i], 2, (j) => {
        if (j <= i || !e.alive[j] || e.kind[j] === KIND.saucer || e.phase[j] === Phase.Attached) return;
        const dx = e.x[j] - e.x[i];
        const dy = e.y[j] - e.y[i];
        const d = Math.hypot(dx, dy);
        const min = ri + ENEMY[KINDS[e.kind[j]]].radius;
        if (d >= min || d < 1e-5) return;
        const push = (min - d) / 2 / d;
        e.x[i] -= dx * push;
        e.y[i] -= dy * push;
        e.x[j] += dx * push;
        e.y[j] += dy * push;
      });
    }
  }

  /** The middle of the thickest bunch of the flock (a saucer's mark). */
  private densest(): { x: number; y: number } | null {
    const o = this.model.out;
    let best = -1;
    let bn = -1;
    const stride = Math.max(1, Math.floor(this.flockCount / 20));
    let k = 0;
    for (let a = 0; a < this.n; a++) {
      if (this.status[a] !== Sheep.Flock) continue;
      if (k++ % stride) continue;
      let c = 0;
      for (let b = 0; b < this.n; b++) {
        if (this.status[b] === Sheep.Flock && Math.abs(o.x[a] - o.x[b]) < 4 && Math.abs(o.y[a] - o.y[b]) < 4) c++;
      }
      if (c > bn) { bn = c; best = a; }
    }
    return best >= 0 ? { x: o.x[best], y: o.y[best] } : null;
  }

  /** The flock sheep nearest (x, y), not further than `within`. */
  private nearestSheep(x: number, y: number, within: number): number {
    const o = this.model.out;
    let best = -1;
    let bd = within;
    for (let j = 0; j < this.n; j++) {
      if (this.status[j] !== Sheep.Flock) continue;
      const d = Math.hypot(o.x[j] - x, o.y[j] - y);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  /** A saucer: find the thickest bunch, mark a sheep, beam it up. */
  private saucerStep(i: number, dt: number): void {
    const e = this.enemies;
    const o = this.model.out;
    const speed = ENEMY.saucer.speed;
    const moveTo = (tx: number, ty: number, v: number) => {
      const dx = tx - e.x[i];
      const dy = ty - e.y[i];
      const d = Math.hypot(dx, dy);
      if (d > 1e-3) {
        const step = Math.min(d, v * dt);
        e.x[i] += (dx / d) * step;
        e.y[i] += (dy / d) * step;
      }
      return d;
    };
    e.t[i] += dt;
    switch (e.phase[i]) {
      case Phase.Seek: {
        e.retarget[i] -= dt;
        if (e.retarget[i] <= 0) {
          e.retarget[i] = 2;
          const c = this.densest();
          e.gx[i] = c ? c.x : this.gafoop.x;
          e.gy[i] = c ? c.y : this.gafoop.y;
        }
        const d = moveTo(e.gx[i], e.gy[i], speed);
        if (d < 1.5 && this.takenCount < this.takeCap) {
          const v = this.nearestSheep(e.x[i], e.y[i], SAUCER.reach * 2);
          if (v >= 0) {
            e.phase[i] = Phase.Telegraph;
            e.t[i] = 0;
            e.target[i] = v;
            this.emit({ kind: 'mark', enemy: i });
            this.first('saucer');
          }
        }
        break;
      }
      case Phase.Telegraph: {
        const v = e.target[i];
        if (v < 0 || this.status[v] !== Sheep.Flock) {
          e.phase[i] = Phase.Seek;
          e.retarget[i] = 0;
          break;
        }
        moveTo(o.x[v], o.y[v], 1.5);
        if (e.t[i] < SAUCER.telegraph) break;
        const d = Math.hypot(o.x[v] - e.x[i], o.y[v] - e.y[i]);
        if (d <= SAUCER.reach && this.takenCount < this.takeCap) {
          this.model.hold(v);
          this.status[v] = Sheep.Beamed;
          e.carry[i] = v;
          e.phase[i] = Phase.Beam;
          e.t[i] = 0;
          this.emit({ kind: 'beam', enemy: i });
        } else {
          // it got away: try the nearest again, quicker this time
          const w = this.nearestSheep(e.x[i], e.y[i], SAUCER.reach * 2);
          if (w < 0) {
            e.phase[i] = Phase.Seek;
            e.retarget[i] = 0;
          } else {
            e.target[i] = w;
            e.t[i] = SAUCER.telegraph - SAUCER.retry;
          }
        }
        break;
      }
      case Phase.Beam: {
        const v = e.carry[i];
        if (v < 0 || this.status[v] !== Sheep.Beamed) {
          e.phase[i] = Phase.Rest;
          e.t[i] = 0;
          break;
        }
        this.model.place(v, e.x[i], e.y[i]);
        const k = Math.min(1, e.t[i] / SAUCER.lift);
        this.lift[v] = k * k * (SAUCER.height - 0.8);
        if (k >= 1) {
          e.carry[i] = -1;
          this.lose(v, true);
          e.phase[i] = Phase.Rest;
          e.t[i] = 0;
        }
        break;
      }
      case Phase.Rest: {
        moveTo(e.gx[i] + 6, e.gy[i] - 4, speed * 0.5);
        if (e.t[i] >= SAUCER.rest) {
          e.phase[i] = Phase.Seek;
          e.retarget[i] = 0;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ the flock

  /** A pool of stimulus objects, reused every step (the model copies what it needs). */
  private stim(k: number): Stimulus {
    let s = this.stimuli[k];
    if (!s) this.stimuli[k] = s = { id: 0, kind: 'threat', x: 0, y: 0, strength: 0, radius: 0 };
    return s;
  }

  private flockStep(dt: number): void {
    const e = this.enemies;
    let k = 0;
    const out: Stimulus[] = [];
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const kind = e.kind[i];
      // a saucer frightens the flock while it marks and beams; monsters always do
      if (kind === KIND.saucer && e.phase[i] !== Phase.Telegraph && e.phase[i] !== Phase.Beam) continue;
      const spec = ENEMY[KINDS[kind]];
      const s = this.stim(k++);
      s.id = 1000 + e.uid[i];
      s.kind = 'threat';
      s.x = e.x[i];
      s.y = e.y[i];
      s.strength = spec.threat.strength;
      s.radius = spec.threat.radius;
      out.push(s);
    }
    // Gafoop: the flock moves off as he comes; with the bucket he is mostly forgiven, and called to
    const g = this.gafoop;
    if (g.ko <= 0) {
      const p = this.input.bucket ? RUN.withBucket : RUN.presence;
      out.push({ id: 1, kind: 'threat', x: g.x, y: g.y, strength: p.strength, radius: p.radius });
      if (this.input.bucket) out.push({ id: 2, kind: 'lure', x: g.x, y: g.y, strength: RUN.bucket.strength, radius: RUN.bucket.radius });
    }
    for (const s of this.startles) out.push(s);
    this.startles.length = 0;
    this.model.step(out);
    if (this.options.grazing) this.grass.grow(dt);
    // a sheep let go falls back to the ground
    for (let j = 0; j < this.n; j++) {
      if (this.status[j] === Sheep.Flock && this.lift[j] > 0) this.lift[j] = Math.max(0, this.lift[j] - dt * 7);
    }
  }

  /**
   * The shearing booths: each calls in the woolly sheep nearest its board from round its mouth,
   * one at a time. It hops up, is shorn, and hops off at the side, back into the flock; its wool
   * flies to Gafoop.
   */
  private boothStep(dt: number): void {
    const B = RUN.booths;
    const quick = 1 + 0.3 * this.lvl('shears');
    for (const b of this.booths) {
      const s = b.site;
      if (b.off >= 0) {
        const j = b.off;
        b.offT += dt * quick;
        const k = Math.min(1, b.offT / B.off);
        this.model.place(j, s.x + (s.ox - s.x) * k, s.y + (s.oy - s.y) * k);
        this.lift[j] = B.board * (1 - k) + Math.sin(Math.PI * k) * 0.45;
        if (k >= 1) {
          this.lift[j] = 0;
          this.model.release(j);
          this.status[j] = Sheep.Flock;
          b.off = -1;
        }
      }
      if (b.cur >= 0) {
        const j = b.cur;
        b.t += dt * quick;
        if (b.t < b.hop) {
          const k = b.t / b.hop;
          this.model.place(j, b.fromX + (s.x - b.fromX) * k, b.fromY + (s.y - b.fromY) * k);
          this.lift[j] = B.board * k + Math.sin(Math.PI * k) * 0.6;
        } else {
          this.model.place(j, s.x, s.y);
          this.lift[j] = B.board;
          const k = Math.min(1, (b.t - b.hop) / B.shear);
          this.wool[j] = b.wool0 * (1 - k);
          // shorn (once the last one is off the board): the wool to Gafoop, the sheep off
          if (k >= 1 && b.off < 0) {
            this.wool[j] = 0;
            this.drop(s.x, s.y, b.wool0 * RUN.wool.value, Pickup.Wool, true);
            this.stats.sheared++;
            b.shorn++;
            this.emit({ kind: 'shear', sheep: j, x: s.x, y: s.y });
            b.off = j;
            b.offT = 0;
            b.cur = -1;
          }
        }
      }
      if (b.cur < 0) this.callIn(b);
    }
  }

  /** A booth calls in the woolly sheep nearest its board from round its mouth, if there is one. */
  private callIn(b: Booth): void {
    const B = RUN.booths;
    const s = b.site;
    const o = this.model.out;
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < this.n; j++) {
      if (this.status[j] !== Sheep.Flock || this.wool[j] < B.least || this.lift[j] > 0) continue;
      if (Math.hypot(o.x[j] - s.mx, o.y[j] - s.my) > B.intake) continue;
      const d = Math.hypot(o.x[j] - s.x, o.y[j] - s.y);
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) return;
    this.model.hold(best);
    this.status[best] = Sheep.Booth;
    b.cur = best;
    b.t = 0;
    b.hop = Math.min(B.hopMax, Math.max(0.25, bd * B.hop));
    b.fromX = o.x[best];
    b.fromY = o.y[best];
    b.wool0 = this.wool[best];
    this.first('booth');
  }

  /** Everyone in a booth back on the grass beside it (the hearing). */
  private emptyBooths(): void {
    for (const b of this.booths) {
      for (const j of [b.cur, b.off]) {
        if (j < 0) continue;
        this.model.place(j, b.site.ox, b.site.oy);
        this.model.release(j);
        this.status[j] = Sheep.Flock;
        this.lift[j] = 0;
      }
      b.cur = b.off = -1;
    }
  }

  /** Wool grows on fed, calm sheep (the booths shear it). */
  private woolStep(dt: number): void {
    const o = this.model.out;
    const W = RUN.wool;
    const rate = (1 + 0.2 * this.lvl('merino')) / W.grow;
    const fade = Math.exp(-dt / W.forget);
    for (let j = 0; j < this.n; j++) {
      if (this.status[j] !== Sheep.Flock) continue;
      this.stress[j] = Math.max(this.stress[j] * fade, o.fear[j]);
      const h = this.options.grazing ? o.hunger[j] : 0;
      const fed = h < W.hungry ? 1 : Math.max(0, (1 - h) / (1 - W.hungry));
      this.wool[j] = Math.min(1, this.wool[j] + rate * fed * (1 - W.cost * this.stress[j]) * dt);
    }
  }

  // ------------------------------------------------------------------ weapons

  private hurt(i: number, damage: number): void {
    const e = this.enemies;
    if (!e.alive[i]) return;
    e.hp[i] -= damage;
    e.flash[i] = 0.12;
    if (e.hp[i] <= 0) this.kill(i);
  }

  /**
   * For the perf test on a phone (plan §11's exit criterion): `sheep` spares into the flock and
   * `monsters` more Gloops on the way.
   */
  stressTest(sheep: number, monsters: number): void {
    this.addSheep(sheep);
    for (let k = 0; k < monsters; k += 3) this.clump(3);
  }

  /** Deport monster i now (as a weapon would): for tooling and tests. */
  deport(i: number): void {
    if (this.enemies.alive[i]) this.kill(i);
  }

  /** A monster deported: a poof, its salvage, and whatever it was holding let go. */
  private kill(i: number): void {
    const e = this.enemies;
    const kind = KINDS[e.kind[i]];
    const x = e.x[i];
    const y = e.y[i];
    this.emit({ kind: 'poof', x, y, z: kind === 'saucer' ? e.z[i] : 0.4, enemy: kind, escaped: false });
    if (kind === 'saucer') {
      const v = e.carry[i];
      if (v >= 0 && this.status[v] === Sheep.Beamed) this.free(v, true);
      for (let k = 0; k < 3; k++) this.drop(x + this.rng.range(-1, 1), y + this.rng.range(-1, 1), ENEMY.saucer.xp / 3, Pickup.Salvage, false);
    } else if (kind === 'bigGloop') {
      this.drop(x, y, 0, Pickup.Crate, false);
      for (let k = 0; k < 4; k++) this.drop(x + this.rng.range(-1.2, 1.2), y + this.rng.range(-1.2, 1.2), ENEMY.bigGloop.xp / 4, Pickup.Salvage, false);
    } else {
      this.drop(x, y, ENEMY.gloop.xp, Pickup.Salvage, false);
    }
    e.remove(i);
    this.stats.kills++;
  }

  /** Everything within `r` of (x, y) takes `damage` and is knocked away. */
  private area(x: number, y: number, r: number, damage: number, knock: number): void {
    const e = this.enemies;
    this.grid.near(x, y, r + 1.6, (i) => {
      if (!e.alive[i]) return;
      const dx = e.x[i] - x;
      const dy = e.y[i] - y;
      const d = Math.hypot(dx, dy);
      if (d > r + ENEMY[KINDS[e.kind[i]]].radius) return;
      this.hurt(i, damage);
      if (e.alive[i] && knock > 0 && d > 1e-3) this.knock(i, dx / d, dy / d, knock);
    });
  }

  private weaponStep(dt: number): void {
    const g = this.gafoop;
    if (g.ko > 0) return;
    const might = 1 + 0.1 * this.lvl('medal');
    const quick = 1 - 0.08 * this.lvl('expedite');
    const cd = this.cooldown;
    const e = this.enemies;
    const o = this.model.out;

    const stamp = this.lvl('stamp');
    if (stamp) {
      cd.stamp -= dt;
      if (cd.stamp <= 0) {
        const S = STATS.stamp(stamp);
        cd.stamp += S.cooldown * quick;
        this.area(g.x, g.y, S.radius, S.damage * might, S.knock);
        this.emit({ kind: 'stamp', x: g.x, y: g.y, r: S.radius });
      }
    }

    const stapler = this.lvl('stapler');
    if (stapler) {
      cd.stapler -= dt;
      if (cd.stapler <= 0) {
        const S = STATS.stapler(stapler);
        let best = -1;
        let bd = S.range;
        this.grid.near(g.x, g.y, S.range, (i) => {
          if (!e.alive[i]) return;
          const d = Math.hypot(e.x[i] - g.x, e.y[i] - g.y);
          if (d < bd) { bd = d; best = i; }
        });
        if (best >= 0) {
          cd.stapler += S.cooldown * quick;
          const a0 = Math.atan2(e.y[best] - g.y, e.x[best] - g.x);
          for (let k = 0; k < S.count; k++) this.fire(g.x, g.y, a0 + (k - (S.count - 1) / 2) * 0.14, S.speed, S.damage * might, S.pierce, S.life);
          this.emit({ kind: 'staple' });
        } else cd.stapler = 0;
      }
    }

    const shredder = this.lvl('shredder');
    if (shredder) {
      const S = STATS.shredder(shredder);
      for (let b = 0; b < S.blades; b++) {
        const a = this.time * S.spin + (b / S.blades) * Math.PI * 2;
        const bx = g.x + Math.cos(a) * S.radius;
        const by = g.y + Math.sin(a) * S.radius;
        this.grid.near(bx, by, 2, (i) => {
          if (!e.alive[i] || e.shred[i] > 0) return;
          if (Math.hypot(e.x[i] - bx, e.y[i] - by) > 0.55 + ENEMY[KINDS[e.kind[i]]].radius) return;
          e.shred[i] = S.every;
          this.hurt(i, S.damage * might);
        });
      }
    }

    const crook = this.lvl('crook');
    if (crook) {
      cd.crook -= dt;
      if (cd.crook <= 0) {
        const S = STATS.crook(crook);
        cd.crook += S.cooldown * quick;
        const inArc = (x: number, y: number, r: number) => {
          const dx = x - g.x;
          const dy = y - g.y;
          const d = Math.hypot(dx, dy);
          if (d > S.range + r) return false;
          let da = Math.atan2(dy, dx) - g.facing;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          return d < 0.8 || Math.abs(da) <= S.arc / 2;
        };
        // carried sheep in reach are hooked free first, so their takers can be knocked away
        for (let j = 0; j < this.n; j++) {
          const s = this.status[j];
          if ((s === Sheep.Grabbed || s === Sheep.Carried) && inArc(o.x[j], o.y[j], 0.6)) this.free(j, true);
        }
        this.grid.near(g.x, g.y, S.range + 1.6, (i) => {
          if (!e.alive[i] || !inArc(e.x[i], e.y[i], ENEMY[KINDS[e.kind[i]]].radius)) return;
          this.hurt(i, S.damage * might);
          const dx = e.x[i] - g.x;
          const dy = e.y[i] - g.y;
          const d = Math.hypot(dx, dy) || 1;
          if (e.alive[i]) this.knock(i, dx / d, dy / d, S.knock);
        });
        this.emit({ kind: 'crook', x: g.x, y: g.y, angle: g.facing, arc: S.arc, r: S.range });
      }
    }

    const bells = this.lvl('bells');
    if (bells) {
      const S = STATS.bells(bells);
      // keep the collars on the flock: any lost go to sheep without one
      let worn = 0;
      for (let j = 0; j < this.n; j++) if (this.collar[j] && this.status[j] === Sheep.Flock) worn++;
      for (let j = 0; j < this.n && worn < S.collars; j++) {
        if (this.status[j] !== Sheep.Flock || this.collar[j]) continue;
        this.collar[j] = 1;
        this.bellIn[j] = this.rng.range(0.5, S.every);
        worn++;
      }
      for (let j = 0; j < this.n; j++) {
        if (!this.collar[j] || this.status[j] !== Sheep.Flock) continue;
        this.bellIn[j] -= dt;
        if (this.bellIn[j] > 0) continue;
        this.bellIn[j] += S.every * quick;
        this.area(o.x[j], o.y[j], S.radius, S.damage * might, S.knock);
        this.emit({ kind: 'bell', x: o.x[j], y: o.y[j], r: S.radius });
      }
    }

    const stat = this.lvl('static');
    if (stat) {
      cd.static -= dt;
      if (cd.static <= 0) {
        const S = STATS.static(stat);
        cd.static += S.cooldown * quick;
        const flock: number[] = [];
        for (let j = 0; j < this.n; j++) if (this.status[j] === Sheep.Flock) flock.push(j);
        for (let k = 0; k < S.arcs && flock.length > 1; k++) {
          const a = flock[Math.floor(this.rng.next() * flock.length)];
          // a neighbour close enough to arc to, looked for from a random place in the flock
          const off = Math.floor(this.rng.next() * flock.length);
          let b = -1;
          for (let q = 0; q < flock.length; q++) {
            const c = flock[(off + q) % flock.length];
            const d = Math.hypot(o.x[c] - o.x[a], o.y[c] - o.y[a]);
            if (c !== a && d > 0.8 && d < S.reach) { b = c; break; }
          }
          if (b < 0) continue;
          this.arc(o.x[a], o.y[a], o.x[b], o.y[b], S.width, S.damage * might);
          this.emit({ kind: 'zap', ax: o.x[a], ay: o.y[a], bx: o.x[b], by: o.y[b] });
        }
      }
    }
  }

  /** Lightning between two points: everything near the line takes `damage`. */
  private arc(ax: number, ay: number, bx: number, by: number, width: number, damage: number): void {
    const e = this.enemies;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const ex = bx - ax;
    const ey = by - ay;
    const l2 = ex * ex + ey * ey || 1;
    this.grid.near(mx, my, Math.sqrt(l2) / 2 + width + 1.6, (i) => {
      if (!e.alive[i]) return;
      let t = ((e.x[i] - ax) * ex + (e.y[i] - ay) * ey) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(e.x[i] - (ax + ex * t), e.y[i] - (ay + ey * t));
      if (d <= width + ENEMY[KINDS[e.kind[i]]].radius) this.hurt(i, damage);
    });
  }

  private fire(x: number, y: number, angle: number, speed: number, damage: number, pierce: number, life: number): void {
    const s = this.staples;
    let i = -1;
    for (let k = 0; k < s.high; k++) if (!s.alive[k]) { i = k; break; }
    if (i < 0) {
      if (s.high >= s.cap) return;
      i = s.high++;
    }
    s.alive[i] = 1;
    s.x[i] = s.px[i] = x;
    s.y[i] = s.py[i] = y;
    s.vx[i] = Math.cos(angle) * speed;
    s.vy[i] = Math.sin(angle) * speed;
    s.damage[i] = damage;
    s.pierce[i] = pierce;
    s.life[i] = life;
    s.hitA[i] = s.hitB[i] = -1;
  }

  private stapleStep(dt: number): void {
    const s = this.staples;
    const e = this.enemies;
    for (let k = 0; k < s.high; k++) {
      if (!s.alive[k]) continue;
      s.life[k] -= dt;
      if (s.life[k] <= 0) {
        s.alive[k] = 0;
        continue;
      }
      s.x[k] += s.vx[k] * dt;
      s.y[k] += s.vy[k] * dt;
      this.grid.near(s.x[k], s.y[k], 1.8, (i) => {
        if (!s.alive[k] || !e.alive[i]) return;
        const uid = e.uid[i];
        if (uid === s.hitA[k] || uid === s.hitB[k]) return;
        if (Math.hypot(e.x[i] - s.x[k], e.y[i] - s.y[k]) > 0.3 + ENEMY[KINDS[e.kind[i]]].radius) return;
        this.hurt(i, s.damage[k]);
        if (s.pierce[k] === 0) s.alive[k] = 0;
        else {
          s.pierce[k]--;
          if (s.hitA[k] < 0) s.hitA[k] = uid;
          else s.hitB[k] = uid;
        }
      });
    }
  }

  // ------------------------------------------------------------------ pickups and levels

  private drop(x: number, y: number, value: number, kind: number, home: boolean): void {
    const p = this.pickups;
    let n = 0;
    for (let k = 0; k < p.high; k++) n += p.alive[k];
    if (n >= RUN.pickup.max && kind !== Pickup.Crate) {
      // too many lying about: this one's worth goes into the nearest like it
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < p.high; k++) {
        if (!p.alive[k] || p.kind[k] === Pickup.Crate) continue;
        const d = Math.hypot(p.x[k] - x, p.y[k] - y);
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) {
        p.value[best] += value;
        return;
      }
    }
    let i = -1;
    for (let k = 0; k < p.high; k++) if (!p.alive[k]) { i = k; break; }
    if (i < 0) {
      if (p.high >= p.cap) return;
      i = p.high++;
    }
    p.alive[i] = 1;
    p.kind[i] = kind;
    p.x[i] = p.px[i] = x;
    p.y[i] = p.py[i] = y;
    p.value[i] = value;
    p.life[i] = kind === Pickup.Tuft ? RUN.wool.tuftLife : Infinity;
    p.home[i] = home ? 1 : 0;
    p.speed[i] = home ? 4 : 0;
  }

  private pickupStep(dt: number): void {
    const p = this.pickups;
    const g = this.gafoop;
    const radius = RUN.pickup.radius;
    for (let k = 0; k < p.high; k++) {
      if (!p.alive[k]) continue;
      p.life[k] -= dt;
      if (p.life[k] <= 0) {
        p.alive[k] = 0;
        continue;
      }
      const dx = g.x - p.x[k];
      const dy = g.y - p.y[k];
      const d = Math.hypot(dx, dy);
      if (!p.home[k] && d < radius && g.ko <= 0) {
        p.home[k] = 1;
        p.speed[k] = 2;
      }
      if (!p.home[k]) continue;
      p.speed[k] = Math.min(RUN.pickup.speed, p.speed[k] + dt * 30);
      const step = Math.min(d, p.speed[k] * dt);
      if (d > 1e-3) {
        p.x[k] += (dx / d) * step;
        p.y[k] += (dy / d) * step;
      }
      if (d - step < RUN.pickup.collect) {
        p.alive[k] = 0;
        const crate = p.kind[k] === Pickup.Crate;
        this.emit({ kind: 'pickup', crate });
        if (crate) this.levelUp();
        else {
          if (p.kind[k] === Pickup.Salvage) this.stats.xpKills += p.value[k];
          else this.stats.xpWool += p.value[k];
          this.gainXp(p.value[k]);
        }
      }
    }
  }

  private gainXp(v: number): void {
    this.xp += v;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.levelUp();
    }
  }

  /** A level-up (or a crate): a pick of three now, or a supply drop to open later. */
  private levelUp(): void {
    this.pending++;
    this.emit({ kind: 'level', level: this.level });
    if (this.options.levelups === 'pause' && !this.choices) this.choices = this.deal();
  }

  /** Open a waiting supply drop (banked level-ups). */
  openSupplies(): void {
    if (this.pending > 0 && !this.choices && !this.over) this.choices = this.deal();
  }

  /** Three cards: next levels of what Gafoop has, or new things while there are slots. */
  deal(): Card[] {
    const pool: { card: Card; w: number }[] = [];
    const held = (kind: 'armament' | 'provision') => ITEM_IDS.filter((id) => ITEMS[id].kind === kind && this.lvl(id) > 0).length;
    for (const id of ITEM_IDS) {
      const def = ITEMS[id];
      const l = this.lvl(id);
      if (l > 0 && l < def.max) pool.push({ card: { item: id, level: l + 1 }, w: 1.3 });
      else if (l === 0 && held(def.kind) < SLOTS[def.kind]) pool.push({ card: { item: id, level: 1 }, w: 1 });
    }
    const cards: Card[] = [];
    while (cards.length < 3 && pool.length) {
      let r = this.rng.next() * pool.reduce((s, c) => s + c.w, 0);
      let k = 0;
      while (k < pool.length - 1 && r >= pool[k].w) r -= pool[k++].w;
      cards.push(pool[k].card);
      pool.splice(k, 1);
    }
    const extras: Extra[] = ['sheep', 'snack', 'salvage'];
    for (let k = 0; cards.length < 3; k++) cards.push({ extra: extras[k] });
    return cards;
  }

  /** Take card `k` of the open level-up. */
  choose(k: number): void {
    const c = this.choices?.[k];
    if (!c) return;
    this.choices = null;
    this.pending = Math.max(0, this.pending - 1);
    if ('item' in c) this.items.set(c.item, c.level);
    else if (c.extra === 'sheep') this.addSheep(3);
    else if (c.extra === 'snack') {
      this.gafoop.composure = RUN.gafoop.composure;
      this.gafoop.ko = 0;
    } else this.gainXp(xpToNext(this.level) / 3);
    if (this.pending > 0 && this.options.levelups === 'pause' && !this.choices) this.choices = this.deal();
  }

  /** The words on a card. */
  static describe(c: Card): { name: string; lines: [string, string]; level: number; max: number; who: string } {
    if ('extra' in c) return { name: EXTRAS[c.extra].name, lines: EXTRAS[c.extra].lines, level: 0, max: 0, who: '' };
    const def = ITEMS[c.item];
    return { name: def.name, lines: def.lines[c.level - 1], level: c.level, max: def.max, who: def.who };
  }

  // ------------------------------------------------------------------ the end

  private checkEnd(): void {
    if (this.time >= RUN.length) {
      // the hearing: every claimant is deported on the spot, and every sheep let go
      const e = this.enemies;
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i]) continue;
        this.emit({ kind: 'poof', x: e.x[i], y: e.y[i], z: e.z[i], enemy: KINDS[e.kind[i]], escaped: false });
        e.remove(i);
      }
      for (let j = 0; j < this.n; j++) this.free(j, false);
      this.emptyBooths();
      this.over = 'won';
      this.emit({ kind: 'hearing' });
    } else if (this.flockCount === 0) {
      this.over = 'lost';
      this.emit({ kind: 'dismissed' });
    }
  }
}
