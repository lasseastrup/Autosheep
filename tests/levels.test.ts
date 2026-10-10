/**
 * Every herdway level's SOLVE layout (the cheat) really wins it: run in the level's own field,
 * fences and flock, with nobody herding, it makes the goal's yarn in good time.
 */
import { describe, expect, test } from 'vitest';
import { allObstacles, levelObstacles, WORLD } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { SheepherdingV1 } from '../src/sim/models/sheepherding-v1';
import { cluster } from '../src/sim/scenarios';
import { Works } from '../src/works/works';

const meadow = allObstacles(levelObstacles());

describe('SOLVE', () => {
  test.each(LEVELS.filter((l) => l.solution).map((l) => [l.id, l] as const))('wins level %i unattended', (_id, spec) => {
    const w = new Works();
    spec.works?.(w);
    spec.solution!(w);
    const m = new SheepherdingV1();
    // as the game sets the level up (Game.reset), first attempt
    m.init({ seed: 1, width: WORLD.width, height: WORLD.height, sheep: cluster(spec.flock, spec.flockAt.x, spec.flockAt.y, 1, 1.3) });
    w.setFlock(spec.flock);
    const sync = () => m.setObstacles([...meadow, ...spec.fences, ...w.obstacles()]);
    sync();
    let version = w.version;
    let t = 0;
    while (w.yarn < spec.goal && t < 8 * 60) {
      m.step(w.stimuli());
      w.update(m.out, m.dt);
      t += m.dt;
      if (w.version !== version) {
        version = w.version;
        sync();
      }
    }
    expect(w.yarn).toBeGreaterThanOrEqual(spec.goal);
  }, 60_000);
});
