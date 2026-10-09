/**
 * The flock contract (DESIGN.md §4.1).
 *
 * The flock model is a work in progress and will change a lot, so the game talks to it only
 * through this file. The game describes the world (obstacles) and what is happening in it
 * (stimuli); the model moves the sheep and reports where they are. Nothing outside
 * `src/sim/models/` may import a model's internals.
 *
 * Units: metres, which are also sheep body lengths, and seconds. The sim plane is (x, y) with
 * y pointing "south"; the renderer maps it to three.js (x, z). Headings are atan2(vy, vx).
 */

/** Coarse behaviour state reported for every sheep. Numeric so it fits a Uint8Array. */
export const SheepState = {
  Graze: 0,
  Alert: 1,
  Walk: 2,
  Run: 3,
  Rest: 4,
} as const;
export type SheepState = (typeof SheepState)[keyof typeof SheepState];
export const STATE_NAMES = ['graze', 'alert', 'walk', 'run', 'rest'] as const;

/**
 * Something the sheep react to.
 *
 * - `threat`: pressure. Sheep move away from it, more urgently the faster it closes on them.
 *   Gafoop, a scarecrow, a clockwork collie. A threat that keeps its distance becomes scenery.
 * - `lure`: attraction. Sheep within reach walk toward it and gather round. A feed bucket.
 * - `startle`: a one-tick shock (megaphone, gong, car alarm). Everything within reach that can
 *   hear it jumps; it never habituates.
 *
 * Still to come, when a milestone needs them: `flow` (a goal flow field) and `leader`
 * (a bell-wether the flock follows).
 */
export type StimulusKind = 'threat' | 'lure' | 'startle';

export interface Stimulus {
  /** Stable id: the model tracks velocity and habituation per source across ticks. */
  id: number;
  kind: StimulusKind;
  x: number;
  y: number;
  /** 1 = Gafoop pressing on foot. 0.3–0.5 = a passive presence. Up to 2 for a gong. */
  strength: number;
  /** Reach in metres: the flight zone of a threat at full pressure, a lure's call distance. */
  radius: number;
}

/**
 * A straight piece of fence, wall or hurdle. Sheep cannot pass through it and steer to avoid
 * it. A gate is just a segment the game adds or removes.
 */
export interface Obstacle {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** half-thickness in metres */
  radius: number;
  /** true when sheep cannot see through it (stone wall); false for hurdles and wire */
  solid: boolean;
}

export interface FlockInit {
  seed: number;
  /** world bounds; the edges are impassable */
  width: number;
  height: number;
  sheep: { x: number; y: number; heading?: number }[];
}

/** Per-sheep outputs, structure-of-arrays, valid for indices [0, count). Read-only to the game. */
export interface FlockOutputs {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly heading: Float32Array;
  readonly speed: Float32Array;
  readonly state: Uint8Array;
  /** 0–1 */
  readonly fear: Float32Array;
  /** sheep with the same id are currently one connected group */
  readonly group: Int32Array;
}

export interface FlockModel {
  readonly name: string;
  /** fixed step length in seconds; `step` always advances exactly this much */
  readonly dt: number;
  init(spec: FlockInit): void;
  /** Replace the static obstacle set. Cheap enough to call whenever a fence or gate changes. */
  setObstacles(obstacles: readonly Obstacle[]): void;
  /** Advance one fixed step under the given stimuli (startles fire on this step only). */
  step(stimuli: readonly Stimulus[]): void;
  readonly out: FlockOutputs;
  /** Simulated seconds since init. */
  readonly time: number;
  /** Hash of the full observable state, for determinism checks. */
  hash(): number;
}

/** FNV-1a over the raw bits of the outputs. Models can use it for `hash()`. */
export function hashOutputs(o: FlockOutputs): number {
  let h = 0x811c9dc5;
  const mix = (a: Float32Array | Uint8Array | Int32Array) => {
    const u = new Uint32Array(a.buffer, a.byteOffset, Math.floor(a.byteLength / 4));
    const n = a instanceof Uint8Array ? Math.ceil(o.count / 4) : o.count;
    for (let i = 0; i < n && i < u.length; i++) {
      h ^= u[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  mix(o.x);
  mix(o.y);
  mix(o.heading);
  mix(o.speed);
  mix(o.state);
  mix(o.fear);
  return h >>> 0;
}

/** Closest point on segment ab to p, as the parameter t in [0, 1]. */
export function segmentT(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const l2 = ex * ex + ey * ey;
  if (l2 < 1e-12) return 0;
  const t = ((px - ax) * ex + (py - ay) * ey) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
