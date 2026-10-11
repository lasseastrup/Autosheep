import type { Obstacle } from '../sim/contract';
import { allObstacles, levelObstacles, type LevelObstacles } from '../game/level';
import { meadowCap } from '../game/meadowGrass';
import { FIELD } from './config';

/** Where a run is played: the meadow (src/game/level.ts), its walls and trees, and its grass. */
export interface RunField {
  level: LevelObstacles;
  /** what the flock bumps into */
  obstacles: Obstacle[];
  /** how long grass grows at a point (0 bare, 1 full) */
  cap: (x: number, y: number) => number;
}

export function meadowField(): RunField {
  const level = levelObstacles();
  return { level, obstacles: allObstacles(level), cap: meadowCap(level, FIELD.width, FIELD.height) };
}
