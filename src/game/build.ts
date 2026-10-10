/**
 * Build mode: the tool in hand, a race half drawn, where the next thing would go, and the
 * pixel-line previews of it on the HUD. Placement is free in M2 (no costs yet) and snaps to a
 * metre grid, to the open ends of races and station doors, and onto races for flaps and racks.
 */
import { C } from '../engine/palette';
import {
  deviceDistance, deviceObstacles, LANE_W, laneSides, STATION_LEN, stationFrame,
  type Device, type DeviceSpec, type Dir, type Lane, type Pt,
} from '../works/devices';
import type { Works } from '../works/works';
import type { ToolId } from './hud';

const SNAP = 2;

export interface Ghost {
  /** outlines to draw, in sim coordinates, each a polyline */
  lines: Pt[][];
  /** arrows: from, to */
  arrows: [Pt, Pt][];
  /** points to mark (ports a race can join) */
  marks: Pt[];
  label: { at: Pt; text: string } | null;
  colour: string;
}

export class Builder {
  tool: ToolId = 'lane';
  /** the race being drawn */
  points: Pt[] = [];
  private hurdleFrom: Pt | null = null;
  /** turns: a station's direction, or a flap's flip */
  turn = 0;
  /** where the pointer is on the ground (sim coordinates), or null */
  hover: Pt | null = null;

  constructor(private readonly works: Works, private readonly levelPorts: () => Pt[]) {}

  setTool(t: ToolId): void {
    this.tool = t;
    this.cancel();
  }

  get drawing(): boolean {
    return (this.tool === 'lane' && this.points.length > 0) || (this.tool === 'hurdle' && this.hurdleFrom !== null);
  }

  cancel(): void {
    this.points = [];
    this.hurdleFrom = null;
  }

  rotate(): void {
    this.turn = (this.turn + 1) % 4;
  }

  /** Lay the race drawn so far, if it is long enough. */
  finish(): void {
    if (this.tool === 'lane' && this.points.length >= 2) this.works.add({ kind: 'lane', points: this.points });
    this.cancel();
  }

  /** One-line instructions for the tool in hand. */
  hint(touch: boolean): string {
    const tap = touch ? 'TAP' : 'CLICK';
    switch (this.tool) {
      case 'lane':
        return this.points.length ? `${tap} TO BEND IT - END ON A DOOR OR A GAP TO JOIN UP` : `RACE: ${tap} WHERE IT STARTS. SHEEP WALK IT THE WAY YOU DRAW IT`;
      case 'flap':
        return `FLAP: ${tap} A RACE. SHEEP PASS ONE WAY ONLY${touch ? '' : ' - R FLIPS IT'}`;
      case 'rack':
        return `RACK: ${tap} A RACE. SHEEP UNDER IT HANG UP THEIR YARN`;
      case 'lick':
        return `SALT LICK: CALLS SHEEP FROM 20 M. PUT IT IN A RACE MOUTH`;
      case 'chimes':
        return `CHIMES: A JANGLE EVERY 6 S. SHEEP MOVE AWAY FROM IT`;
      case 'shed':
        return `SHEARING SHED: SHEEP IN AT THE BACK, OUT AT THE ARROW${touch ? '' : ' - R TURNS'}`;
      case 'spindle':
        return `SPINDLE HUT: TURNS FLEECE INTO YARN${touch ? '' : ' - R TURNS'}`;
      case 'hurdle':
        return this.hurdleFrom ? `${tap} WHERE THE HURDLE ENDS` : `HURDLE: ${tap} TWO ENDS OF A FENCE`;
      case 'remove':
        return `REMOVE: ${tap} ON SOMETHING TO TAKE IT DOWN`;
    }
  }

  /** Where a race may join up: open race ends, station doors, the level's gaps. */
  ports(): Pt[] {
    const out = [...this.levelPorts()];
    for (const d of this.works.devices) {
      if (d.kind === 'lane') out.push(d.points[0], d.points[d.points.length - 1]);
      if (d.kind === 'shed' || d.kind === 'spindle') {
        const { back, front } = stationFrame(d);
        out.push(back, front);
      }
    }
    return out;
  }

  private snapPort(p: Pt): Pt | null {
    let best: Pt | null = null;
    let bd = SNAP;
    for (const q of this.ports()) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  private grid(p: Pt, step = 1): Pt {
    return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
  }

  /** The nearest point on any race to p, with the race's heading there. */
  private onLane(p: Pt): { at: Pt; angle: number } | null {
    let best: { at: Pt; angle: number } | null = null;
    let bd = SNAP + LANE_W / 2;
    for (const d of this.works.devices) {
      if (d.kind !== 'lane') continue;
      for (let i = 0; i + 1 < d.points.length; i++) {
        const a = d.points[i];
        const b = d.points[i + 1];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const l2 = ex * ex + ey * ey;
        if (l2 < 1e-6) continue;
        // keep clear of the ends and the bends, where a flap would not span the race
        const l = Math.sqrt(l2);
        const m = Math.min(0.45, 1.3 / l);
        const t = Math.max(m, Math.min(1 - m, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
        const q = { x: a.x + ex * t, y: a.y + ey * t };
        const dd = Math.hypot(p.x - q.x, p.y - q.y);
        if (dd < bd) {
          bd = dd;
          best = { at: q, angle: Math.atan2(ey, ex) };
        }
      }
    }
    return best;
  }

  /** The device the current tool would put down at p (or remove), if any. */
  private wouldPlace(p: Pt): DeviceSpec | null {
    switch (this.tool) {
      case 'flap':
      case 'rack': {
        const on = this.onLane(p);
        if (!on) return null;
        const angle = on.angle + (this.tool === 'flap' && this.turn % 2 ? Math.PI : 0);
        return this.tool === 'flap' ? { kind: 'flap', at: on.at, angle } : { kind: 'rack', at: on.at, angle };
      }
      case 'lick':
        return { kind: 'lick', at: this.grid(p, 0.5) };
      case 'chimes':
        return { kind: 'chimes', at: this.grid(p, 0.5) };
      case 'shed':
      case 'spindle': {
        // the doors land on whole metres, so races drawn to them line up
        const dir = this.turn as Dir;
        const c = this.grid(p);
        return { kind: this.tool, at: c, dir };
      }
      default:
        return null;
    }
  }

  private target(p: Pt): Device | null {
    let best: Device | null = null;
    let bd = 1.6;
    for (const d of this.works.devices) {
      const dd = deviceDistance(d, p);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  /** A click (or tap) on the ground at p. */
  click(p: Pt): void {
    switch (this.tool) {
      case 'lane': {
        const port = this.snapPort(p);
        const q = port ?? this.grid(p);
        const last = this.points[this.points.length - 1];
        if (last && Math.hypot(q.x - last.x, q.y - last.y) < 0.6) {
          // clicking the end again finishes the race
          this.finish();
          return;
        }
        if (last && Math.hypot(q.x - last.x, q.y - last.y) < 1) return;
        this.points.push(q);
        // ending on a door or another race joins it up
        if (port && this.points.length >= 2) this.finish();
        return;
      }
      case 'hurdle': {
        const q = this.grid(p);
        if (!this.hurdleFrom) this.hurdleFrom = q;
        else {
          if (Math.hypot(q.x - this.hurdleFrom.x, q.y - this.hurdleFrom.y) >= 1) this.works.add({ kind: 'hurdle', a: this.hurdleFrom, b: q });
          this.hurdleFrom = null;
        }
        return;
      }
      case 'remove': {
        const d = this.target(p);
        if (d) this.works.remove(d.id);
        return;
      }
      default: {
        const spec = this.wouldPlace(p);
        if (spec) this.works.add(spec);
      }
    }
  }

  /** What to draw for the pointer at `hover`. */
  ghost(): Ghost | null {
    const p = this.hover;
    const g: Ghost = { lines: [], arrows: [], marks: [], label: null, colour: C.gold };
    if (this.tool === 'lane') {
      g.marks = this.ports();
      const pts = [...this.points];
      if (p) pts.push(this.snapPort(p) ?? this.grid(p));
      if (pts.length >= 2) {
        const [l, r] = laneSides(pts);
        g.lines.push(l, r);
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        g.arrows.push([a, b]);
      } else if (pts.length === 1) {
        g.lines.push(square(pts[0], 0.4));
      }
      return g;
    }
    if (!p) return null;
    if (this.tool === 'hurdle') {
      const q = this.grid(p);
      g.lines.push(this.hurdleFrom ? [this.hurdleFrom, q] : square(q, 0.3));
      return g;
    }
    if (this.tool === 'remove') {
      const d = this.target(p);
      if (!d) return null;
      g.colour = C.scarlet;
      for (const o of deviceObstacles(d)) g.lines.push([{ x: o.ax, y: o.ay }, { x: o.bx, y: o.by }]);
      if (d.kind === 'lick' || d.kind === 'chimes' || d.kind === 'rack') g.lines.push(square(d.kind === 'rack' ? d.at : d.at, 0.6));
      g.label = { at: d.kind === 'lane' ? d.points[0] : d.kind === 'hurdle' ? d.a : d.at, text: `REMOVE ${d.kind.toUpperCase()}` };
      return g;
    }
    const spec = this.wouldPlace(p);
    if (!spec) {
      g.colour = C.fog;
      g.lines.push(square(this.grid(p), 0.3));
      g.label = { at: p, text: 'ON A RACE' };
      return g;
    }
    switch (spec.kind) {
      case 'flap':
      case 'rack': {
        const ux = Math.cos(spec.angle);
        const uy = Math.sin(spec.angle);
        const h = LANE_W / 2 + 0.2;
        const across = (k: number) => [{ x: spec.at.x + uy * h + ux * k, y: spec.at.y - ux * h + uy * k }, { x: spec.at.x - uy * h + ux * k, y: spec.at.y + ux * h + uy * k }];
        g.lines.push(across(0));
        if (spec.kind === 'rack') g.lines.push(across(0.5));
        else g.arrows.push([spec.at, { x: spec.at.x + ux * 1.6, y: spec.at.y + uy * 1.6 }]);
        return g;
      }
      case 'shed':
      case 'spindle': {
        const { back, front, side } = stationFrame(spec);
        const h = LANE_W / 2 + 0.3;
        const c = (p0: Pt, k: number) => ({ x: p0.x + side.x * k, y: p0.y + side.y * k });
        g.lines.push([c(back, h), c(front, h), c(front, -h), c(back, -h), c(back, h)]);
        g.arrows.push([back, { x: front.x + (front.x - back.x) / STATION_LEN, y: front.y + (front.y - back.y) / STATION_LEN }]);
        g.label = { at: spec.at, text: spec.kind === 'shed' ? 'SHEARING SHED' : 'SPINDLE HUT' };
        g.marks = this.levelPorts();
        return g;
      }
      default: {
        const at = (spec as { at: Pt }).at;
        g.lines.push(square(at, 0.5));
        g.label = { at, text: spec.kind === 'lick' ? 'SALT LICK' : 'CHIMES' };
        return g;
      }
    }
  }
}

function square(p: Pt, r: number): Pt[] {
  return [{ x: p.x - r, y: p.y - r }, { x: p.x + r, y: p.y - r }, { x: p.x + r, y: p.y + r }, { x: p.x - r, y: p.y + r }, { x: p.x - r, y: p.y - r }];
}

/** A one-pixel line, without anti-aliasing (Bresenham). */
export function pixelLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, colour: string, dash = 0): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = colour;
  for (let n = 0; n < 4000; n++) {
    if (!dash || Math.floor(n / dash) % 2 === 0) g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export type { Lane };
