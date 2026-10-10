/**
 * Herdway devices (DESIGN.md §5, M2) and the fences each one puts into the world. Plain data
 * and geometry: no three.js, no flock model. Coordinates are the sim plane (metres, y south).
 */
import type { Obstacle } from '../sim/contract';

export interface Pt {
  x: number;
  y: number;
}

/** Axis directions for stations and racks: east, south, west, north. */
export type Dir = 0 | 1 | 2 | 3;
export const DIR: readonly Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

/** A race is this wide inside: a sheep and a half. Narrower and sheep wedge; wider and they turn. */
export const LANE_W = 2.4;
/** A station's chute, intake door to exit door. Holds a batch of four or five. */
export const STATION_LEN = 8;
const POST = 0.08;

/** A wattle race: a centre line, fenced both sides. Ends are open. */
export interface Lane {
  kind: 'lane';
  id: number;
  points: Pt[];
}

/** A single hurdle line (a field boundary, a funnel wing). */
export interface Hurdle {
  kind: 'hurdle';
  id: number;
  a: Pt;
  b: Pt;
}

/** A one-way flap across a race. Sheep push through it heading `angle` (radians) only. */
export interface Flap {
  kind: 'flap';
  id: number;
  at: Pt;
  angle: number;
}

export type StationKind = 'shed' | 'spindle';

/**
 * A station: a solid-walled chute with a door at each end. Sheep come in at the back, are
 * worked on, and leave by the front, heading `dir`.
 */
export interface Station {
  kind: StationKind;
  id: number;
  at: Pt;
  dir: Dir;
}

/** A rack over a race: sheep walking under it hang up their yarn. `angle` is along the race. */
export interface Rack {
  kind: 'rack';
  id: number;
  at: Pt;
  angle: number;
}

/** Wind chimes: every few seconds a jangle that sheep move away from. Never grows familiar. */
export interface Chimes {
  kind: 'chimes';
  id: number;
  at: Pt;
}

/** A salt lick: sheep nearby wander over to it. */
export interface Lick {
  kind: 'lick';
  id: number;
  at: Pt;
}

/**
 * A hurdle gate, a to b. Shut, it is a fence; open, sheep pass. It opens by Gafoop's hand, or on
 * a timer, or when the grass on its watched side (the side its arrow points away from: left of
 * a→b turned a quarter) has been grazed down, and then lets the flock through to the other side.
 */
export type GateMode = 'hand' | 'timer' | 'grass';
export interface Gate {
  kind: 'gate';
  id: number;
  a: Pt;
  b: Pt;
  mode: GateMode;
  /** grass gates: watch the side to the right of a→b instead of the left */
  flip?: boolean;
}

/** A trough: while it holds feed, sheep come to it from all over the field. Gafoop fills it. */
export interface Trough {
  kind: 'trough';
  id: number;
  at: Pt;
  angle: number;
}

export type Device = Lane | Hurdle | Flap | Station | Rack | Chimes | Lick | Gate | Trough;
export type DeviceKind = Device['kind'];
/** A device to add: as above, the id optional (one is handed out). */
export type DeviceSpec = Device extends unknown ? (Device extends infer D ? (D extends Device ? Omit<D, 'id'> & { id?: number } : never) : never) : never;

const seg = (a: Pt, b: Pt, solid = false, oneWay?: Pt, door = false): Obstacle => ({
  ax: a.x, ay: a.y, bx: b.x, by: b.y, radius: POST, solid, ...(oneWay ? { oneWay: { dx: oneWay.x, dy: oneWay.y } } : {}), ...(door ? { door: true } : {}),
});

/** The two side lines of a race along `points`, mitred at the bends. */
export function laneSides(points: readonly Pt[], width = LANE_W): [Pt[], Pt[]] {
  const h = width / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const normal = (a: Pt, b: Pt): Pt => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
  };
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const n0 = i > 0 ? normal(points[i - 1], p) : null;
    const n1 = i < points.length - 1 ? normal(p, points[i + 1]) : null;
    let n = (n0 ?? n1)!;
    let k = 1;
    if (n0 && n1) {
      const sx = n0.x + n1.x;
      const sy = n0.y + n1.y;
      const l = Math.hypot(sx, sy);
      if (l > 1e-6) {
        n = { x: sx / l, y: sy / l };
        // the mitre: longer at sharper bends, capped so a hairpin does not shoot off
        k = 1 / Math.max(0.35, n.x * n1.x + n.y * n1.y);
      }
    }
    left.push({ x: p.x + n.x * h * k, y: p.y + n.y * h * k });
    right.push({ x: p.x - n.x * h * k, y: p.y - n.y * h * k });
  }
  return [left, right];
}

/** A station's frame: the back (intake) and front (exit) centres, and the side direction. */
export function stationFrame(s: { at: Pt; dir: Dir }, len = STATION_LEN): { back: Pt; front: Pt; f: Pt; side: Pt } {
  const f = DIR[s.dir];
  const side = { x: -f.y, y: f.x };
  return {
    back: { x: s.at.x - (f.x * len) / 2, y: s.at.y - (f.y * len) / 2 },
    front: { x: s.at.x + (f.x * len) / 2, y: s.at.y + (f.y * len) / 2 },
    f,
    side,
  };
}

/** Is p inside the chute of station s (between its doors and walls)? */
export function inStation(s: { at: Pt; dir: Dir }, p: Pt, len = STATION_LEN, inset = 0.2): boolean {
  const f = DIR[s.dir];
  const dx = p.x - s.at.x;
  const dy = p.y - s.at.y;
  const along = dx * f.x + dy * f.y;
  const across = -dx * f.y + dy * f.x;
  return Math.abs(along) < len / 2 - inset && Math.abs(across) < LANE_W / 2 + inset;
}

/** Is p under rack r (the race's width, a metre either side of the crossbar)? */
export function underRack(r: Rack, p: Pt): boolean {
  const ux = Math.cos(r.angle);
  const uy = Math.sin(r.angle);
  const dx = p.x - r.at.x;
  const dy = p.y - r.at.y;
  return Math.abs(dx * ux + dy * uy) < 1 && Math.abs(-dx * uy + dy * ux) < LANE_W / 2 + 0.2;
}

/** Fences that do not change: everything but the station doors. */
export function deviceObstacles(d: Device): Obstacle[] {
  switch (d.kind) {
    case 'lane': {
      const [l, r] = laneSides(d.points);
      const out: Obstacle[] = [];
      for (let i = 0; i + 1 < l.length; i++) out.push(seg(l[i], l[i + 1]), seg(r[i], r[i + 1]));
      return out;
    }
    case 'hurdle':
      return [seg(d.a, d.b)];
    case 'trough': {
      // a long low box: sheep stand round it, not in it
      const ux = Math.cos(d.angle) * 0.9;
      const uy = Math.sin(d.angle) * 0.9;
      return [{ ax: d.at.x - ux, ay: d.at.y - uy, bx: d.at.x + ux, by: d.at.y + uy, radius: 0.3, solid: false }];
    }
    case 'flap': {
      const ux = Math.cos(d.angle);
      const uy = Math.sin(d.angle);
      // across the race, reaching just into its side fences so nothing slips round the ends
      const h = LANE_W / 2 + 0.1;
      return [seg({ x: d.at.x + uy * h, y: d.at.y - ux * h }, { x: d.at.x - uy * h, y: d.at.y + ux * h }, false, { x: ux, y: uy })];
    }
    case 'shed':
    case 'spindle': {
      const { back, front, side } = stationFrame(d);
      const h = LANE_W / 2;
      const off = (p: Pt, k: number) => ({ x: p.x + side.x * k, y: p.y + side.y * k });
      // solid walls: calm inside, and the batch cannot see the flock it left
      return [seg(off(back, h), off(front, h), true), seg(off(back, -h), off(front, -h), true)];
    }
    default:
      return [];
  }
}

/** A station's doors, as fences, for whichever are shut. */
export function doorObstacles(s: Station, intakeShut: boolean, exitShut: boolean): Obstacle[] {
  const { back, front, side } = stationFrame(s);
  const h = LANE_W / 2 + 0.05;
  const across = (p: Pt) => seg({ x: p.x + side.x * h, y: p.y + side.y * h }, { x: p.x - side.x * h, y: p.y - side.y * h }, true, undefined, true);
  const out: Obstacle[] = [];
  if (intakeShut) out.push(across(back));
  if (exitShut) out.push(across(front));
  return out;
}

/** A gate's leaf as a fence, when it is shut. */
export function gateObstacle(g: Gate): Obstacle {
  return seg(g.a, g.b);
}

/**
 * The point a grass gate watches: a few metres out on its watched side, from the middle of the
 * gate. Sheep go through it toward the other side.
 */
export function gateWatch(g: Gate, reach = 5): { at: Pt; toward: Pt } {
  const ex = g.b.x - g.a.x;
  const ey = g.b.y - g.a.y;
  const l = Math.hypot(ex, ey) || 1;
  // left of a→b (y points south, so this is (ey, -ex)), or right when flipped
  const s = g.flip ? -1 : 1;
  const nx = (ey / l) * s;
  const ny = (-ex / l) * s;
  const m = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  return { at: { x: m.x + nx * reach, y: m.y + ny * reach }, toward: { x: -nx, y: -ny } };
}

/** Where a device sits, for picking and labels. */
export function deviceCentre(d: Device): Pt {
  switch (d.kind) {
    case 'lane': {
      const n = d.points.length;
      const a = d.points[Math.floor((n - 1) / 2)];
      const b = d.points[Math.ceil((n - 1) / 2)];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    case 'hurdle':
    case 'gate':
      return { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
    default:
      return d.at;
  }
}

/** Distance from p to a device, for picking it. */
export function deviceDistance(d: Device, p: Pt): number {
  const segDist = (a: Pt, b: Pt) => {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    let t = l2 > 1e-12 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t));
  };
  switch (d.kind) {
    case 'lane': {
      let best = Infinity;
      for (let i = 0; i + 1 < d.points.length; i++) best = Math.min(best, segDist(d.points[i], d.points[i + 1]));
      return Math.max(0, best - LANE_W / 2);
    }
    case 'hurdle':
    case 'gate':
      return segDist(d.a, d.b);
    case 'shed':
    case 'spindle':
      return inStation(d, p, STATION_LEN, -0.5) ? 0 : Math.hypot(p.x - d.at.x, p.y - d.at.y);
    default:
      return Math.hypot(p.x - d.at.x, p.y - d.at.y);
  }
}
