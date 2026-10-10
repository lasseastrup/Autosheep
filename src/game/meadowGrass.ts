/**
 * Where grass grows in the meadow, and where the works have covered it: the caps for the grass
 * field (src/sim/grass.ts). Bare under the boundary wall, the ruined wall, rocks, tree trunks,
 * the old pickup and the worn lane across the middle; bare on race floors and under stations.
 */
import { segmentT } from '../sim/contract';
import type { GrassField } from '../sim/grass';
import { LANE_W, stationFrame, type Device } from '../works/devices';
import type { LevelObstacles } from './level';

/** The worn lane the ground shader draws: |y - (46 + 3 sin(0.05 x))| (groundMaterial's path) */
const LANE = { amp: 3, freq: 0.05, z: 46 };

export function meadowCap(l: LevelObstacles, width: number, height: number): (x: number, y: number) => number {
  const posts = [
    ...l.trees.map((t) => ({ x: t.x, y: t.y, r: 0.6 * t.s })),
    ...l.rocks.map((r) => ({ x: r.x, y: r.y, r: 0.75 * r.s })),
    { x: 17, y: 12, r: 2.4 },
  ];
  return (x, y) => {
    if (x < 1 || y < 1 || x > width - 1 || y > height - 1) return 0;
    for (const w of l.walls) {
      const t = segmentT(x, y, w.ax, w.ay, w.bx, w.by);
      if (Math.hypot(x - (w.ax + (w.bx - w.ax) * t), y - (w.ay + (w.by - w.ay) * t)) < w.radius + 0.4) return 0;
    }
    for (const p of posts) if (Math.hypot(x - p.x, y - p.y) < p.r) return 0;
    const pd = Math.abs(y - (LANE.z + Math.sin(x * LANE.freq) * LANE.amp));
    if (pd < 0.8) return 0;
    if (pd < 1.2) return 0.35;
    return 1;
  };
}

/** Distance from (x, y) to a polyline. */
function toPath(points: readonly { x: number; y: number }[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const t = segmentT(x, y, a.x, a.y, b.x, b.y);
    best = Math.min(best, Math.hypot(x - (a.x + (b.x - a.x) * t), y - (a.y + (b.y - a.y) * t)));
  }
  return best;
}

/**
 * Reset the field's caps to `base` and clear them under the devices: race floors and station
 * floors are bare. Grass under a device that has gone grows back from nothing.
 */
export function coverWithWorks(field: GrassField, base: Float32Array, devices: readonly Device[]): void {
  field.cap.set(base);
  const cell = field.cell;
  const clear = (x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) => {
    const c0 = Math.max(0, Math.floor(x0 / cell));
    const c1 = Math.min(field.cols - 1, Math.floor(x1 / cell));
    const r0 = Math.max(0, Math.floor(y0 / cell));
    const r1 = Math.min(field.rows - 1, Math.floor(y1 / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (inside((c + 0.5) * cell, (r + 0.5) * cell)) field.cap[r * field.cols + c] = 0;
      }
    }
  };
  for (const d of devices) {
    if (d.kind === 'lane') {
      const h = LANE_W / 2 + 0.15;
      const xs = d.points.map((p) => p.x);
      const ys = d.points.map((p) => p.y);
      clear(Math.min(...xs) - h, Math.min(...ys) - h, Math.max(...xs) + h, Math.max(...ys) + h, (x, y) => toPath(d.points, x, y) < h);
    } else if (d.kind === 'shed' || d.kind === 'spindle') {
      const { back, front } = stationFrame(d);
      const h = LANE_W / 2 + 0.7;
      clear(Math.min(back.x, front.x) - h, Math.min(back.y, front.y) - h, Math.max(back.x, front.x) + h, Math.max(back.y, front.y) + h, (x, y) => toPath([back, front], x, y) < h);
    } else if (d.kind === 'lick' || d.kind === 'chimes') {
      const r = d.kind === 'lick' ? 0.8 : 0.5;
      clear(d.at.x - r, d.at.y - r, d.at.x + r, d.at.y + r, (x, y) => Math.hypot(x - d.at.x, y - d.at.y) < r);
    }
  }
  const L = field.length;
  for (let k = 0; k < L.length; k++) if (L[k] > field.cap[k]) L[k] = field.cap[k];
  field.version++;
}
