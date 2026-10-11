import type { Obstacle } from '../sim/contract';
import { allObstacles, levelObstacles, type LevelObstacles } from '../game/level';
import { meadowCap } from '../game/meadowGrass';
import { FIELD, RUN } from './config';

/**
 * A shearing booth's place (RUN.booths): a raised board under a canopy, a ramp up to it from
 * the mouth, which faces the middle of the meadow, and a ramp down at the side. Sim
 * coordinates; (fx, fy) is the way the mouth faces, and the side ramp is to its left (-fy, fx).
 */
export interface BoothSite {
  /** the board, where a sheep is shorn */
  x: number;
  y: number;
  fx: number;
  fy: number;
  /** the middle of the mouth, where sheep are called in from */
  mx: number;
  my: number;
  /** where a shorn sheep comes down */
  ox: number;
  oy: number;
}

/** How far from the board a shorn sheep comes down (to the side), and the board's half-width. */
export const BOOTH_SIDE = 2.4;
export const BOOTH_HALF = 1.1;

/** Where a run is played: the meadow (src/game/level.ts), its walls and trees, and its grass. */
export interface RunField {
  level: LevelObstacles;
  /** what the flock bumps into: the meadow's, and the shearing booths' boards */
  obstacles: Obstacle[];
  /** how long grass grows at a point (0 bare, 1 full) */
  cap: (x: number, y: number) => number;
  booths: BoothSite[];
}

export function boothSites(): BoothSite[] {
  const B = RUN.booths;
  return B.at.map(([x, y]) => {
    const dx = FIELD.width / 2 - x;
    const dy = FIELD.height / 2 - y;
    const d = Math.hypot(dx, dy) || 1;
    const fx = dx / d;
    const fy = dy / d;
    return { x, y, fx, fy, mx: x + fx * B.mouth, my: y + fy * B.mouth, ox: x - fy * BOOTH_SIDE, oy: y + fx * BOOTH_SIDE };
  });
}

export function meadowField(): RunField {
  const level = levelObstacles();
  const booths = boothSites();
  const obstacles = allObstacles(level);
  // the board stands in the flock's way (a capsule across it, from side to side)
  for (const b of booths) {
    const sx = -b.fy * 0.4;
    const sy = b.fx * 0.4;
    obstacles.push({ ax: b.x - sx, ay: b.y - sy, bx: b.x + sx, by: b.y + sy, radius: BOOTH_HALF + 0.15, solid: false });
  }
  const meadow = meadowCap(level, FIELD.width, FIELD.height);
  // no grass grows through a board or its ramps
  const cap = (x: number, y: number) => {
    for (const b of booths) {
      const f = (x - b.x) * b.fx + (y - b.y) * b.fy;
      const s = -(x - b.x) * b.fy + (y - b.y) * b.fx;
      const board = Math.abs(f) < BOOTH_HALF + 0.3 && Math.abs(s) < BOOTH_HALF + 0.3;
      const ramp = (along: number, across: number) => along > 0 && along < BOOTH_SIDE + 0.3 && Math.abs(across) < 0.8;
      if (board || ramp(f, s) || ramp(s, f)) return 0;
    }
    return meadow(x, y);
  };
  return { level, obstacles, cap, booths };
}
