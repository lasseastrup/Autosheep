/**
 * Reference herdways: the loop the M2 test runs unattended, and a starting point for levels.
 */
import type { Pt } from './devices';
import type { Works } from './works';

/** A field fenced with hurdles, with gaps (centre, width) in its east side. */
export function paddock(w: Works, x0: number, y0: number, x1: number, y1: number, eastGaps: { y: number; width: number }[]): void {
  const h = (a: Pt, b: Pt) => w.add({ kind: 'hurdle', a, b });
  h({ x: x0, y: y0 }, { x: x1, y: y0 });
  h({ x: x0, y: y0 }, { x: x0, y: y1 });
  h({ x: x0, y: y1 }, { x: x1, y: y1 });
  let y = y0;
  for (const g of [...eastGaps].sort((a, b) => a.y - b.y)) {
    h({ x: x1, y }, { x: x1, y: g.y - g.width / 2 });
    y = g.y + g.width / 2;
  }
  h({ x: x1, y }, { x: x1, y: y1 });
}

/**
 * Pasture → race → shearing shed → race → spindle hut → long return race past a yarn rack →
 * flap → pasture. Returns where the flock should start.
 */
export function firstHerdway(w: Works, ox = 0, oy = 0): Pt {
  const P = (x: number, y: number): Pt => ({ x: x + ox, y: y + oy });
  paddock(w, 6 + ox, 14 + oy, 30 + ox, 46 + oy, [{ y: 22 + oy, width: 2.4 }, { y: 40 + oy, width: 2.4 }]);
  w.add({ kind: 'lane', points: [P(30, 22), P(36, 22)] });
  w.add({ kind: 'shed', at: P(40, 22), dir: 0 });
  w.add({ kind: 'lane', points: [P(44, 22), P(50, 22)] });
  w.add({ kind: 'spindle', at: P(54, 22), dir: 0 });
  w.add({ kind: 'lane', points: [P(58, 22), P(64, 22), P(64, 40), P(30, 40)] });
  w.add({ kind: 'rack', at: P(64, 31), angle: Math.PI / 2 });
  w.add({ kind: 'flap', at: P(31.5, 40), angle: Math.PI });
  // a salt lick in the race draws the flock into it, where the shed's bait can call them on
  w.add({ kind: 'lick', at: P(32.5, 22) });
  return P(18, 30);
}
