/**
 * The Valley (M2b): the one world the game is played in. The meadow (level.ts) with what the
 * Bureau's supply drops put into it, and the reference layouts the SOLVE cheat builds. Sim
 * coordinates (metres, y south).
 */
import type { Pt } from '../works/devices';
import type { Works } from '../works/works';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const VALLEY = {
  flock: 30,
  flockAt: { x: 32, y: 47 } as Pt,
  gafoopAt: { x: 22, y: 47 } as Pt,
  /** the pen Form 8-A delivers, with its gateway in the west side */
  pen: { x0: 90, y0: 39.5, x1: 101, y1: 51.5 } as Rect,
  penGate: { y0: 44, y1: 47 },
  /** where Form 12-C drops the shearing shed and the spindle hut: with their intakes on the line
   * where two paddocks would meet (x = 34), the shed walking sheep east into the one, the spindle
   * hut walking them back west into the other */
  shed: { x: 38, y: 61 } as Pt,
  spindle: { x: 30, y: 71 } as Pt,
  /** the two paddocks of the reference rotation, either side of x = 34: small enough that the
   * flock grazes one down in a few minutes and moves on while it grows back */
  paddockA: { x0: 20, y0: 56, x1: 34, y1: 76 } as Rect,
  paddockB: { x0: 34, y0: 56, x1: 48, y1: 76 } as Rect,
};

const h = (w: Works, a: Pt, b: Pt) => w.add({ kind: 'hurdle', a, b });

/** Form 8-A's drop: a hurdle pen with a hand gate, and wings that funnel the flock to it. */
export function dropPen(w: Works): void {
  const P = VALLEY.pen;
  const G = VALLEY.penGate;
  h(w, { x: P.x0, y: P.y0 }, { x: P.x1, y: P.y0 });
  h(w, { x: P.x1, y: P.y0 }, { x: P.x1, y: P.y1 });
  h(w, { x: P.x1, y: P.y1 }, { x: P.x0, y: P.y1 });
  h(w, { x: P.x0, y: P.y0 }, { x: P.x0, y: G.y0 });
  h(w, { x: P.x0, y: G.y1 }, { x: P.x0, y: P.y1 });
  w.add({ kind: 'gate', a: { x: P.x0, y: G.y0 }, b: { x: P.x0, y: G.y1 }, mode: 'hand' });
  // the wings
  h(w, { x: P.x0, y: G.y0 }, { x: P.x0 - 6, y: G.y0 - 7 });
  h(w, { x: P.x0, y: G.y1 }, { x: P.x0 - 6, y: G.y1 + 7 });
}

/** Form 12-C's drop: the shearing shed and the spindle hut. */
export function dropStations(w: Works): void {
  w.add({ kind: 'shed', at: VALLEY.shed, dir: 0 });
  w.add({ kind: 'spindle', at: VALLEY.spindle, dir: 2 });
}

/**
 * The reference rotation (SOLVE for the yarn Forms): two paddocks either side of the stations,
 * so the flock grazes one, is drawn through the shed into the other (shorn on the way), grazes
 * that, and is drawn back through the spindle hut (its fleece spun) to the first. Each station's
 * intake is a gap in the middle fence, so nothing juts into the field to trap a sheep coming at
 * it from the side. Expects the stations where dropStations put them.
 */
export function buildRotation(w: Works): void {
  const A = VALLEY.paddockA;
  const B = VALLEY.paddockB;
  const s = VALLEY.shed;
  const p = VALLEY.spindle;
  const half = 1.25;
  // the outer fences of both paddocks
  h(w, { x: A.x0, y: A.y0 }, { x: B.x1, y: A.y0 });
  h(w, { x: A.x0, y: A.y1 }, { x: B.x1, y: A.y1 });
  h(w, { x: A.x0, y: A.y0 }, { x: A.x0, y: A.y1 });
  h(w, { x: B.x1, y: B.y0 }, { x: B.x1, y: B.y1 });
  // the middle fence, meeting the stations at their intakes
  h(w, { x: A.x1, y: A.y0 }, { x: A.x1, y: s.y - half });
  h(w, { x: A.x1, y: s.y + half }, { x: A.x1, y: p.y - half });
  h(w, { x: A.x1, y: p.y + half }, { x: A.x1, y: A.y1 });
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}
