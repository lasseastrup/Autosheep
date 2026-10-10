/**
 * The herdway works (M2). The exit criterion is the last test: a closed loop pen → shearing
 * shed → spindle hut → pen keeps making yarn for ten simulated minutes with nobody herding.
 */
import { describe, expect, test } from 'vitest';
import { SheepherdingV1 } from '../src/sim/models/sheepherding-v1';
import { cluster } from '../src/sim/scenarios';
import { LANE_W, laneSides } from '../src/works/devices';
import { firstHerdway } from '../src/works/layouts';
import { Works } from '../src/works/works';

describe('devices', () => {
  test('a race is the same width all along, bends included', () => {
    const [l, r] = laneSides([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    // the corner's sides sit on the mitre, so both legs keep their width
    expect(l[1].y).toBeCloseTo(LANE_W / 2);
    expect(r[1].y).toBeCloseTo(-LANE_W / 2);
    expect(l[1].x).toBeCloseTo(10 - LANE_W / 2);
    expect(r[1].x).toBeCloseTo(10 + LANE_W / 2);
  });
});

/** Run the reference loop with nobody herding; yarn per minute. */
function runLoop(seed: number, minutes: number): { perMinute: number[]; w: Works; m: SheepherdingV1 } {
  const w = new Works();
  const start = firstHerdway(w);
  const m = new SheepherdingV1();
  m.init({ seed, width: 80, height: 60, sheep: cluster(24, start.x, start.y, seed) });
  w.setFlock(24);
  m.setObstacles(w.obstacles());
  let version = w.version;
  const perMinute: number[] = [];
  let last = 0;
  const steps = Math.round(60 / m.dt);
  for (let min = 0; min < minutes; min++) {
    for (let k = 0; k < steps; k++) {
      m.step(w.stimuli());
      w.update(m.out, m.dt);
      if (w.version !== version) {
        version = w.version;
        m.setObstacles(w.obstacles());
      }
    }
    perMinute.push(w.yarn - last);
    last = w.yarn;
  }
  return { perMinute, w, m };
}

describe('the first herdway', () => {
  test.each([1, 2])('runs unattended for 10 minutes (seed %i)', (seed) => {
    const { perMinute, w, m } = runLoop(seed, 10);
    // it gets going, and it keeps going (eight seeds made 50 to 80)
    expect(w.yarn).toBeGreaterThanOrEqual(40);
    expect(perMinute.slice(-4).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(14);
    // every stage did its part
    expect(w.shorn).toBeGreaterThanOrEqual(w.yarn);
    // and no sheep got out: all of them are in the pasture, a race or a station
    const o = m.out;
    let loose = 0;
    for (let i = 0; i < o.count; i++) {
      const inPasture = o.x[i] > 6 && o.x[i] < 30 && o.y[i] > 14 && o.y[i] < 46;
      const inCourt = o.x[i] > 31.5 && o.x[i] < 62.5 && o.y[i] > 23.5 && o.y[i] < 38.5;
      const outside = o.x[i] < 5 || o.x[i] > 66 || o.y[i] < 13 || o.y[i] > 47;
      if (!inPasture && (inCourt || outside)) loose++;
    }
    expect(loose).toBe(0);
  }, 60_000);
});
