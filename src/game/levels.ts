/**
 * The levels: what each adds to the meadow (level.ts), where everyone starts, and what it
 * asks for. Sim coordinates.
 */
import type { Obstacle } from '../sim/contract';
import type { Pt } from '../works/devices';
import type { Works } from '../works/works';
import { hurdle } from './level';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LevelSpec {
  id: number;
  /** on the objective panel */
  title: string;
  /** 'pen': herd them all into the pen and shut the gate. 'herdway': make yarn */
  kind: 'pen' | 'herdway';
  /** hurdles this level adds to the meadow */
  fences: Obstacle[];
  /** a hand gate Gafoop opens and shuts (G) */
  gate: Obstacle | null;
  pen: Rect | null;
  flockAt: Pt;
  gafoopAt: Pt;
  flock: number;
  /** what the camera leans toward when Gafoop is near it */
  focus: Pt;
  /** sheep to pen, or yarn to hang up */
  goal: number;
  /** devices already standing when the level starts */
  works?: (w: Works) => void;
  /** gaps in the level's fences a race can join up to */
  ports?: Pt[];
  /** the verdict card: the result (with {time}) and the Bureau's remark */
  verdict: [string, string];
  /** what Gafoop says first */
  opening: string;
}

/** Four sides of a rectangle with gaps (centre and width) cut in its east side. */
function paddock(r: Rect, eastGaps: { y: number; width: number }[] = [], westGaps: { y: number; width: number }[] = []): Obstacle[] {
  const out = [hurdle(r.x0, r.y0, r.x1, r.y0), hurdle(r.x0, r.y1, r.x1, r.y1)];
  const side = (x: number, gaps: { y: number; width: number }[]) => {
    let y = r.y0;
    for (const g of [...gaps].sort((a, b) => a.y - b.y)) {
      out.push(hurdle(x, y, x, g.y - g.width / 2));
      y = g.y + g.width / 2;
    }
    out.push(hurdle(x, y, x, r.y1));
  };
  side(r.x0, westGaps);
  side(r.x1, eastGaps);
  return out;
}

const PEN: Rect = { x0: 90, y0: 39.5, x1: 101, y1: 51.5 };

export const FIRST_PEN: LevelSpec = {
  id: 1,
  title: 'AUDIT 0 - THE FIRST PEN',
  kind: 'pen',
  // the pen, its gateway on the west side, and wings that funnel the flock to it
  fences: [
    ...paddock(PEN, [], [{ y: 45.5, width: 3 }]),
    hurdle(PEN.x0, 44, PEN.x0 - 6, 37),
    hurdle(PEN.x0, 47, PEN.x0 - 6, 54),
  ],
  gate: { ax: PEN.x0, ay: 44, bx: PEN.x0, by: 47, radius: 0.1, solid: false },
  pen: PEN,
  flockAt: { x: 32, y: 47 },
  gafoopAt: { x: 22, y: 47 },
  flock: 30,
  focus: { x: (PEN.x0 + PEN.x1) / 2, y: (PEN.y0 + PEN.y1) / 2 },
  goal: 30,
  opening: 'Right, troops. Into the pen. Single file. Chop chop!',
  verdict: ['{n} sheep penned in {time}.', 'A MEASURABLE INCREASE IN ORGANISATION IS NOTED.'],
};

/** Level 2's pasture: the flock's home field, with a way out and a way back in on its east side. */
export const PASTURE: Rect = { x0: 8, y0: 30, x1: 34, y1: 62 };
export const PASTURE_OUT = 38;
export const PASTURE_IN = 54;

export const FIRST_HERDWAY: LevelSpec = {
  id: 2,
  title: 'FORM 12-C - INDUSTRY',
  kind: 'herdway',
  fences: paddock(PASTURE, [{ y: PASTURE_OUT, width: 2.4 }, { y: PASTURE_IN, width: 2.4 }]),
  gate: null,
  pen: null,
  flockAt: { x: 21, y: 46 },
  gafoopAt: { x: 21, y: 68 },
  flock: 24,
  focus: { x: 52, y: 46 },
  goal: 30,
  // Blorp's supply drop: a shearing shed and a spindle hut, waiting to be joined up
  works: (w) => {
    w.add({ kind: 'shed', at: { x: 48, y: PASTURE_OUT }, dir: 0 });
    w.add({ kind: 'spindle', at: { x: 66, y: PASTURE_OUT }, dir: 0 });
  },
  ports: [{ x: PASTURE.x1, y: PASTURE_OUT }, { x: PASTURE.x1, y: PASTURE_IN }],
  opening: 'Thirty skeins of yarn, says Form 12-C. Build races: pasture, shed, spindle, rack, home.',
  verdict: ['{n} skeins of yarn in {time}.', 'INDUSTRY IS PROVEN. THE AUDITOR YAWNS APPROVINGLY.'],
};

export const LEVELS: readonly LevelSpec[] = [FIRST_PEN, FIRST_HERDWAY];

export function levelById(id: number): LevelSpec {
  return LEVELS.find((l) => l.id === id) ?? FIRST_PEN;
}
