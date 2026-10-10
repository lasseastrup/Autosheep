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
 * - `lure`: attraction. Sheep within reach walk toward the strongest one and gather round. A
 *   feed bucket, a salt lick. Like a threat, it is hard to sense through a solid wall.
 * - `startle`: a one-tick shock (megaphone, gong, car alarm). Everything within reach that can
 *   hear it jumps; it never habituates.
 *
 * - `flow`: a race's pull. Sheep within `radius` of `path` are drawn along it toward its end
 *   (at a point `lookahead` ahead of them on it, and past the end once they get there), the
 *   way a line of sheep keeps going the way it is going. It competes with lures: a sheep
 *   follows whichever pulls hardest, so a station's bait still wins at its door.
 *
 * Still to come, when a milestone needs it: `leader` (a bell-wether the flock follows).
 */
export type StimulusKind = 'threat' | 'lure' | 'startle' | 'flow';

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
  /** flow only: the line sheep are drawn along, first point to last (x, y are its start) */
  path?: readonly { x: number; y: number }[];
  /** flow only: how far ahead along the path a sheep is drawn to (metres, default 3) */
  lookahead?: number;
}

/**
 * Where a flow draws a sheep at (x, y): the point `lookahead` further along `path` than the
 * path's closest point, carried on past the end. `d` is the sheep's distance from the path.
 */
export function flowTarget(path: readonly { x: number; y: number }[], x: number, y: number, lookahead: number): { d: number; tx: number; ty: number } {
  let best = Infinity;
  let bestS = 0;
  let s = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const t = segmentT(x, y, a.x, a.y, b.x, b.y);
    const d = Math.hypot(x - (a.x + (b.x - a.x) * t), y - (a.y + (b.y - a.y) * t));
    if (d < best) {
      best = d;
      bestS = s + t * l;
    }
    s += l;
  }
  let want = bestS + lookahead;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const last = i + 2 === path.length;
    if (want <= l || last) {
      const k = l > 1e-9 ? want / l : 0;
      return { d: best, tx: a.x + (b.x - a.x) * k, ty: a.y + (b.y - a.y) * k };
    }
    want -= l;
  }
  return { d: best, tx: path[0]?.x ?? x, ty: path[0]?.y ?? y };
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
  /**
   * A flap: sheep travelling along (dx, dy) push through it from the side it points away
   * from, and are stopped like any fence coming the other way. Flaps do not split a flock
   * into groups. Hurdles only, never solid.
   */
  oneWay?: { dx: number; dy: number };
}

/** Is (x, y) on the side of one-way obstacle o that sheep may pass from? */
export function behindFlap(o: Obstacle, x: number, y: number): boolean {
  return !!o.oneWay && (x - o.ax) * o.oneWay.dx + (y - o.ay) * o.oneWay.dy < 0;
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
