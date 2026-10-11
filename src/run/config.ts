/**
 * The run (S0, docs/PIVOT-SURVIVORS.md §11): every number it plays by, in one place. Metres and
 * seconds; sim coordinates (x east, y south), the meadow spanning 0..120 × 0..90. These are
 * first guesses for playtests and the run harness to tune.
 */
export const RUN = {
  /** seconds until the Bureau reconvenes */
  length: 600,
  /** sheep the flock model holds: the flock, the strays, and spares kept out of play */
  capacity: 140,
  startFlock: 8,
  /** where the flock starts grazing, and Gafoop beside it */
  start: { x: 60, y: 46 },
  gafoopStart: { x: 54, y: 46 },
  gafoop: {
    speed: 6.5,
    accel: 12,
    /** how far past the walls he may fly (far enough to chase a carried sheep) */
    beyond: 9,
    composure: 3,
    /** a pip comes back after this long without a hit */
    regen: 5,
    invulnerable: 2,
    knockedOut: 4,
    /** monsters closer than this (plus their own size) hit him */
    radius: 0.55,
  },
  /**
   * Gafoop's presence: the flock moves off as he comes, more the faster he closes, as it did in
   * the valley before the Woof-Woof (0.85 over 9 m there; gentler here, where he is always
   * flying about fighting). While he holds the bucket he is mostly forgiven, and they come to it.
   */
  presence: { strength: 0.6, radius: 6 },
  withBucket: { strength: 0.2, radius: 4 },
  bucket: { strength: 1.0, radius: 14 },
  wool: {
    /** seconds for a fed, calm sheep's fleece to grow from nothing */
    grow: 40,
    /** wool grows only on a fed sheep, and slower for a while after a fright */
    hungry: 0.7,
    forget: 15,
    cost: 0.5,
    /** experience in a full fleece: the flock is meant to be most of the income mid-run */
    value: 10,
    /** a sheep with at least this much wool cannot be grabbed (the wool cushion) */
    cushion: 0.5,
    /** seconds the tufts of a torn-off fleece lie on the grass */
    tuftLife: 8,
  },
  /**
   * The Bureau's shearing booths: a woolly sheep that comes within `intake` of a booth's mouth
   * is called in, hops up onto the board, is shorn and hops off to the side, one sheep at a time.
   * Its wool flies to Gafoop as experience.
   */
  booths: {
    /** where the boards are (x, y); each booth's mouth faces the middle of the meadow */
    at: [[32, 32], [85, 28], [90, 60], [35, 64]] as [number, number][],
    /** the mouth is this far in front of the board, and calls sheep from this far round it */
    mouth: 3,
    intake: 5,
    /** a sheep needs at least this much wool to be called in */
    least: 0.3,
    /** seconds: hopping in (a metre takes `hop`, but never more than `hopMax`), being shorn,
     * hopping off (the next sheep is called as one hops off) */
    hop: 0.14,
    hopMax: 1,
    shear: 0.7,
    off: 0.35,
    /** how high the board is */
    board: 0.3,
  },
  pickup: { radius: 3, speed: 15, collect: 0.7, max: 180 },
  carry: {
    /** a team's speed when three Gloops lift a sheep (fewer drag it slower) */
    speed: 1.1,
    /** carriers head for this far past the nearest wall; a sheep this far out is gone */
    exit: 6,
    lost: 4,
    /** no more sheep may be carried at once than one in `per` of the flock, nor fewer than `min` */
    per: 8,
    min: 2,
  },
  strays: {
    /** where the first stray groups graze: x, y, how many */
    groups: [[20, 18, 5], [102, 20, 4], [98, 74, 6], [22, 74, 5]] as [number, number, number][],
    /** a new group turns up this often, from this time */
    every: 75,
    from: 70,
    size: [3, 6] as [number, number],
    /** found when Gafoop flies this near, or one of the flock wanders this near */
    byGafoop: 5,
    byFlock: 3.5,
    /** new groups turn up at least this far from the flock */
    away: 28,
    /** no new group while this many wait to be found */
    max: 4,
  },
  /** spawns come in on a ring this far from the middle of the screen (the view sets it) */
  spawnRadius: 34,
  /** spare sheep wait here, out of sight */
  offstage: { x: -200, y: -200 },
};

/**
 * The flock model as runs use it: sheep get hungry at half the valley's rate, since a flock
 * under attack has far less time to graze (sheepherding-v1's config).
 */
export const MODEL_PATCH = { grazing: { hungerRate: 1 / 300 } };

/** The meadow the run is played in (src/game/level.ts). */
export const FIELD = { width: 120, height: 90 };

export type EnemyKind = 'gloop' | 'bigGloop' | 'saucer';

export interface EnemySpec {
  hp: number;
  speed: number;
  /** body radius, for touching and being hit */
  radius: number;
  /** a Gloop is a third of a carrying team; a big one carries alone */
  lift: number;
  /** experience in the salvage it leaves */
  xp: number;
  /** how the flock feels about it (a threat stimulus) */
  threat: { strength: number; radius: number };
}

export const ENEMY: Record<EnemyKind, EnemySpec> = {
  gloop: { hp: 8, speed: 1.6, radius: 0.42, lift: 1 / 3, xp: 0.6, threat: { strength: 0.6, radius: 6 } },
  bigGloop: { hp: 140, speed: 1.2, radius: 0.9, lift: 1, xp: 20, threat: { strength: 0.9, radius: 8 } },
  saucer: { hp: 70, speed: 3.2, radius: 1.5, lift: 0, xp: 6, threat: { strength: 0.8, radius: 7 } },
};

/** A saucer: how high it flies, and the seconds of each part of an abduction. */
export const SAUCER = { height: 5.5, telegraph: 2.5, retry: 1.2, lift: 3.2, rest: 3, reach: 2.6, every: 25 };

/** Everything gets tougher as the run goes on: hit points times this per minute. */
export const HP_PER_MINUTE = 0.12;

export interface Minute {
  /** at least this many Gloops on the field */
  min: number;
  /** and a clump of Gloops comes in this often anyway */
  every: number;
  /** saucers allowed at once */
  saucers: number;
  breather?: boolean;
  /** scripted moments, seconds into the minute */
  events?: { at: number; kind: 'ring' | 'elite'; n?: number }[];
}

/** S0's ten minutes (plan §7.2): the authored shape of the run. */
export const MINUTES: Minute[] = [
  { min: 5, every: 2.6, saucers: 0 },
  { min: 10, every: 2.0, saucers: 0 },
  { min: 18, every: 1.3, saucers: 1 },
  { min: 24, every: 1.1, saucers: 1, events: [{ at: 30, kind: 'ring', n: 18 }] },
  { min: 30, every: 1.0, saucers: 1 },
  { min: 36, every: 0.9, saucers: 1, events: [{ at: 0, kind: 'elite' }] },
  { min: 14, every: 2.6, saucers: 0, breather: true },
  { min: 48, every: 0.8, saucers: 2 },
  { min: 60, every: 0.7, saucers: 2, events: [{ at: 0, kind: 'elite' }, { at: 30, kind: 'ring', n: 26 }] },
  { min: 75, every: 0.6, saucers: 3 },
];

/** The director on top of the table: extra Gloops for a big flock, fewer after heavy losses. */
export const DIRECTOR = {
  /** credits a second, before the time and flock factors; a clump of three costs `clump` */
  rate: 0.25,
  perMinute: 0.15,
  /** flock size at which the flock factor is 1 */
  flock: 12,
  clump: 3,
  /** this many sheep lost within `window` seconds eases it off for `rest` seconds */
  losses: 3,
  window: 20,
  rest: 15,
  ease: 0.3,
};

/** Experience needed to go from level `l` to the next (plan §8.1). */
export function xpToNext(l: number): number {
  if (l < 20) return 5 + 8 * (l - 1);
  return 160 + 12 * (l - 20) + (l === 20 ? 400 : 0);
}

/** The test toggles S0 compares (plan §11). */
export interface RunOptions {
  /** a woolly sheep's fleece takes the first grab */
  cushion: boolean;
  /** the flock grazes the meadow and gets hungry */
  grazing: boolean;
  /** level-ups open at once, or wait as supply drops until opened */
  levelups: 'pause' | 'bank';
}

export const DEFAULT_OPTIONS: RunOptions = { cushion: true, grazing: true, levelups: 'pause' };
