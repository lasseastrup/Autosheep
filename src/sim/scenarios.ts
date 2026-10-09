/**
 * Behaviour-guarantee scenarios (DESIGN.md §4.1), written against the flock contract only, so
 * every model is held to the same promises. The tests run them and check the results with a
 * tolerance; the dev tools can run them too, to watch a scenario play out.
 */
import { SheepState, type FlockModel, type Obstacle, type Stimulus } from './contract';

/** Small deterministic PRNG for scenario set-up (mulberry32). */
export function prng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A loose cluster of n sheep around (cx, cy). */
export function cluster(n: number, cx: number, cy: number, seed: number, spacing = 1.4): { x: number; y: number }[] {
  const r = prng(seed);
  const side = Math.ceil(Math.sqrt(n));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const gx = (i % side) - (side - 1) / 2;
    const gy = Math.floor(i / side) - (side - 1) / 2;
    out.push({ x: cx + gx * spacing + (r() - 0.5) * 0.6, y: cy + gy * spacing + (r() - 0.5) * 0.6 });
  }
  return out;
}

export function centroid(m: FlockModel): { x: number; y: number } {
  const o = m.out;
  let x = 0;
  let y = 0;
  for (let i = 0; i < o.count; i++) { x += o.x[i]; y += o.y[i]; }
  return { x: x / o.count, y: y / o.count };
}

export function meanDistTo(m: FlockModel, px: number, py: number): number {
  const o = m.out;
  let s = 0;
  for (let i = 0; i < o.count; i++) s += Math.hypot(o.x[i] - px, o.y[i] - py);
  return s / o.count;
}

export function countIn(m: FlockModel, x0: number, y0: number, x1: number, y1: number): number {
  const o = m.out;
  let c = 0;
  for (let i = 0; i < o.count; i++) if (o.x[i] > x0 && o.x[i] < x1 && o.y[i] > y0 && o.y[i] < y1) c++;
  return c;
}

export function run(m: FlockModel, seconds: number, stimuli: (t: number) => Stimulus[]): void {
  const steps = Math.round(seconds / m.dt);
  for (let k = 0; k < steps; k++) m.step(stimuli(m.time));
}

/** Four fences around a rectangle, with an optional gap centred on one side. */
export function pen(
  x0: number, y0: number, x1: number, y1: number,
  gate?: { side: 'n' | 's' | 'e' | 'w'; width: number },
  radius = 0.08,
): Obstacle[] {
  const seg = (ax: number, ay: number, bx: number, by: number): Obstacle => ({ ax, ay, bx, by, radius, solid: false });
  const sides: Record<'n' | 's' | 'e' | 'w', [number, number, number, number]> = {
    n: [x0, y0, x1, y0],
    s: [x0, y1, x1, y1],
    w: [x0, y0, x0, y1],
    e: [x1, y0, x1, y1],
  };
  const out: Obstacle[] = [];
  for (const k of ['n', 's', 'w', 'e'] as const) {
    const [ax, ay, bx, by] = sides[k];
    if (gate && gate.side === k) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const h = gate.width / 2;
      out.push(seg(ax, ay, mx - ux * h, my - uy * h), seg(mx + ux * h, my + uy * h, bx, by));
    } else {
      out.push(seg(ax, ay, bx, by));
    }
  }
  return out;
}

/**
 * A scripted herder, the way a person drives sheep: stand on the far side of the flock from
 * the goal and walk the flock in, going round (never through) the flock to fetch stragglers,
 * and easing off near the gate so the sheep can file through instead of jamming.
 * Fences stop the driver as they stop sheep.
 */
export class ScriptedDriver {
  x: number;
  y: number;
  /** metres per second */
  speed = 4.5;
  /** working distance behind the flock: shrinks while the flock stands, grows while it runs */
  standoff = 7;
  minStandoff = 4;
  maxStandoff = 8;

  constructor(
    x: number,
    y: number,
    private readonly goalX: number,
    private readonly goalY: number,
    private readonly fences: readonly Obstacle[] = [],
  ) {
    this.x = x;
    this.y = y;
  }

  /**
   * Strömbom et al. (2014): when the sheep still outside are together, drive them from behind
   * toward the goal; when one has strayed, fetch it first by getting behind it relative to the
   * group.
   */
  update(m: FlockModel, dt: number, done: (i: number) => boolean): void {
    const o = m.out;
    let gx = 0;
    let gy = 0;
    let spd = 0;
    let n = 0;
    for (let i = 0; i < o.count; i++) {
      if (done(i)) continue;
      gx += o.x[i];
      gy += o.y[i];
      spd += o.speed[i];
      n++;
    }
    if (n === 0) return;
    gx /= n;
    gy /= n;
    spd /= n;
    // walk up on a flock that stands still, back off one that runs
    if (spd < 0.6) this.standoff -= 0.8 * dt;
    else if (spd > 2.2) this.standoff += 1.5 * dt;
    this.standoff = Math.min(this.maxStandoff, Math.max(this.minStandoff, this.standoff));

    let far = -1;
    let farD = 0;
    for (let i = 0; i < o.count; i++) {
      if (done(i)) continue;
      const d = Math.hypot(o.x[i] - gx, o.y[i] - gy);
      if (d > farD) { farD = d; far = i; }
    }
    const together = farD < 1.0 * Math.pow(n, 2 / 3) + 1;
    let cx: number;
    let cy: number;
    let ux: number;
    let uy: number;
    let standoff: number;
    if (together || far < 0) {
      cx = gx; cy = gy;
      ux = gx - this.goalX; uy = gy - this.goalY;
      standoff = this.standoff;
    } else {
      cx = o.x[far]; cy = o.y[far];
      ux = cx - gx; uy = cy - gy;
      standoff = Math.max(this.minStandoff, 3);
    }
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    let tx = cx + ux * standoff;
    let ty = cy + uy * standoff;
    // never cut through the sheep: if the target is across them from me, go round
    const mx = this.x - cx;
    const my = this.y - cy;
    const ml = Math.hypot(mx, my);
    const along = (mx * ux + my * uy) / (ml || 1);
    if (along < 0.2 && ml < standoff * 2.2) {
      const side = mx * -uy + my * ux >= 0 ? 1 : -1;
      const ang = Math.atan2(my, mx) + side * 0.6;
      tx = cx + Math.cos(ang) * standoff * 1.3;
      ty = cy + Math.sin(ang) * standoff * 1.3;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const step = Math.min(d, this.speed * dt);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    for (const f of this.fences) {
      if (segmentsIntersect(this.x, this.y, nx, ny, f.ax, f.ay, f.bx, f.by)) {
        // slide along the fence instead of stopping dead
        const fx = f.bx - f.ax;
        const fy = f.by - f.ay;
        const fl = Math.hypot(fx, fy) || 1;
        const along2 = ((nx - this.x) * fx + (ny - this.y) * fy) / fl;
        this.x += (fx / fl) * along2;
        this.y += (fy / fl) * along2;
        return;
      }
    }
    this.x = nx;
    this.y = ny;
  }
}

function segmentsIntersect(
  p0x: number, p0y: number, p1x: number, p1y: number,
  q0x: number, q0y: number, q1x: number, q1y: number,
): boolean {
  const c = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = c(q0x, q0y, q1x, q1y, p0x, p0y);
  const d2 = c(q0x, q0y, q1x, q1y, p1x, p1y);
  const d3 = c(p0x, p0y, p1x, p1y, q0x, q0y);
  const d4 = c(p0x, p0y, p1x, p1y, q1x, q1y);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

export function stateFraction(m: FlockModel, s: SheepState): number {
  const o = m.out;
  let c = 0;
  for (let i = 0; i < o.count; i++) if (o.state[i] === s) c++;
  return c / Math.max(1, o.count);
}
