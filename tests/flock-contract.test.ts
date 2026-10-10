/**
 * Behaviour guarantees from DESIGN.md §4.1, run against every flock model through the contract
 * alone. Targets have tolerances and get tuned over time; the model's own parameters are free.
 * The boids model is a test double that only has to meet the basic guarantees.
 */
import { describe, expect, test } from 'vitest';
import { SheepState, type FlockModel, type Obstacle, type Stimulus } from '../src/sim/contract';
import { BoidsModel } from '../src/sim/models/boids';
import { SheepherdingV1 } from '../src/sim/models/sheepherding-v1';
import { centroid, cluster, countIn, meanDistTo, pen, run, ScriptedDriver, stateFraction } from '../src/sim/scenarios';

/** mean distance of the sheep from the flock's centre */
function spread(m: FlockModel): number {
  const c = centroid(m);
  let s = 0;
  for (let i = 0; i < m.out.count; i++) s += Math.hypot(m.out.x[i] - c.x, m.out.y[i] - c.y);
  return s / m.out.count;
}

const MODELS: { name: string; make: () => FlockModel; full: boolean }[] = [
  { name: 'sheepherding-v1', make: () => new SheepherdingV1(), full: true },
  { name: 'boids', make: () => new BoidsModel(), full: false },
];

function flock(make: () => FlockModel, seed: number, n = 30, cx = 30, cy = 30, w = 60, h = 60): FlockModel {
  const m = make();
  m.init({ seed, width: w, height: h, sheep: cluster(n, cx, cy, seed) });
  return m;
}

describe.each(MODELS)('$name', ({ make, full }) => {
  test('moves away from an approaching threat', () => {
    const m = flock(make, 3);
    const c0 = centroid(m);
    let x = 20;
    run(m, 15, () => {
      x = Math.min(26, x + m.dt);
      return [{ id: 1, kind: 'threat', x, y: 30, strength: 1, radius: 10 }];
    });
    expect(centroid(m).x - c0.x).toBeGreaterThan(3);
  });

  test('walks toward a lure', () => {
    const m = flock(make, 3);
    const d0 = meanDistTo(m, 42, 30);
    run(m, 40, () => [{ id: 2, kind: 'lure', x: 42, y: 30, strength: 1, radius: 16 }]);
    expect(meanDistTo(m, 42, 30)).toBeLessThan(d0 * 0.5);
  });

  test('fences hold a flock under pressure', () => {
    const m = flock(make, 5);
    m.setObstacles(pen(23, 23, 37, 37));
    run(m, 60, (t) => [{ id: 1, kind: 'threat', x: 30 + Math.sin(t * 0.7) * 5, y: 30 + Math.cos(t * 0.5) * 5, strength: 1, radius: 10 }]);
    expect(countIn(m, 23, 23, 37, 37)).toBe(30);
  });

  test('a startle sends nearby sheep running', () => {
    const m = flock(make, 4);
    run(m, 2, () => []);
    let first = true;
    run(m, 2, () => {
      const s: Stimulus[] = first ? [{ id: 9, kind: 'startle', x: 30, y: 30, strength: 1.5, radius: 12 }] : [];
      first = false;
      return s;
    });
    expect(stateFraction(m, SheepState.Run)).toBeGreaterThan(0.8);
  });

  test('is deterministic', () => {
    const script = (t: number): Stimulus[] => [
      { id: 1, kind: 'threat', x: 20 + t * 0.5, y: 30 + Math.sin(t), strength: 1, radius: 10 },
      { id: 2, kind: 'lure', x: 45, y: 40, strength: 0.8, radius: 15 },
    ];
    const fences: Obstacle[] = pen(10, 10, 50, 50, { side: 'e', width: 4 });
    const a = flock(make, 11);
    const b = flock(make, 11);
    const c = flock(make, 12);
    for (const m of [a, b, c]) {
      m.setObstacles(fences);
      run(m, 20, script);
    }
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  test.runIf(full).each([7, 8, 9])('a driven flock can be penned through a 3 m gate (seed %i)', (seed) => {
    const m = flock(make, seed, 30, 25, 30, 80, 60);
    const gate = 3;
    const fences = pen(55, 25, 65, 35, { side: 'w', width: gate });
    // wings funnel the flock toward the gate
    fences.push({ ax: 55, ay: 30 - gate / 2, bx: 49, by: 22, radius: 0.08, solid: false });
    fences.push({ ax: 55, ay: 30 + gate / 2, bx: 49, by: 38, radius: 0.08, solid: false });
    m.setObstacles(fences);
    const driver = new ScriptedDriver(12, 30, 56, 30, fences);
    const inPen = (i: number) => m.out.x[i] > 55 && m.out.x[i] < 65 && m.out.y[i] > 25 && m.out.y[i] < 35;
    let best = 0;
    for (let k = 0; k < 240 / m.dt && best < 30; k++) {
      driver.update(m, m.dt, inPen);
      m.step([{ id: 1, kind: 'threat', x: driver.x, y: driver.y, strength: 1, radius: 10 }]);
      best = Math.max(best, countIn(m, 55, 25, 65, 35));
    }
    expect(best).toBeGreaterThanOrEqual(27);
  });

  test.runIf(full).each([6, 7])('a scarecrow becomes scenery (seed %i)', (seed) => {
    // a scarecrow re-planted 4 m from the flock every 5 s, never moving in between
    const m = flock(make, seed, 30, 40, 40, 80, 80);
    let id = 0;
    let sx = 0;
    let sy = 0;
    const windows: number[] = [];
    for (let w = 0; w < 8; w++) {
      let sum = 0;
      let k = 0;
      run(m, 20, () => {
        for (let i = 0; i < m.out.count; i++) sum += m.out.fear[i];
        k++;
        if (Math.round(m.time / m.dt) % 150 === 0) {
          const c = centroid(m);
          sx = c.x;
          sy = c.y - 4;
          id++;
        }
        return [{ id, kind: 'threat', x: sx, y: sy, strength: 1, radius: 10 }];
      });
      windows.push(sum / (k * m.out.count));
    }
    expect(windows[0]).toBeGreaterThan(0.2);
    expect(windows[7]).toBeLessThan(windows[0] * 0.5);
  });

  test.runIf(full).each([1, 2, 3, 4])('a lone sheep fenced off from its flock can be walked out (seed %i)', (seed) => {
    // a fence across the field with one gap at the far west end; the flock is south-east of it
    // and one sheep is north of it, so the way out leads away from the others
    const m = make();
    m.init({ seed, width: 60, height: 60, sheep: [{ x: 40, y: 26 }, ...cluster(29, 45, 42, seed)] });
    const fences: Obstacle[] = [
      { ax: 9, ay: 30, bx: 60, by: 30, radius: 0.08, solid: false },
      { ax: 0, ay: 30, bx: 4, by: 30, radius: 0.08, solid: false },
    ];
    m.setObstacles(fences);
    run(m, 5, () => []);
    // left alone it does not throw itself at the fence
    expect(m.out.state[0]).not.toBe(SheepState.Run);
    const driver = new ScriptedDriver(52, 22, 6.5, 33, fences);
    let out = false;
    for (let k = 0; k < 120 / m.dt && !out; k++) {
      driver.update(m, m.dt, (i) => i !== 0);
      m.step([{ id: 1, kind: 'threat', x: driver.x, y: driver.y, strength: 1, radius: 10 }]);
      out = m.out.y[0] > 31;
    }
    expect(out).toBe(true);
  });

  test.runIf(full)('walking up to a flock does not crush it into a ball', () => {
    const ratios = [1, 2, 3, 4, 5, 6].map((seed) => {
      const m = make();
      m.init({ seed, width: 80, height: 80, sheep: cluster(30, 40, 40, seed, 1.8) });
      run(m, 10, () => []);
      const before = spread(m);
      let x = 22;
      run(m, 14, () => {
        x = Math.min(33, x + m.dt);
        return [{ id: 1, kind: 'threat', x, y: 40, strength: 1, radius: 10 }];
      });
      return spread(m) / before;
    });
    // the flock bunches, as flocks under pressure do, but keeps most of its spread
    expect(ratios.reduce((a, b) => a + b) / ratios.length).toBeGreaterThan(0.66);
  });

  test.runIf(full)('a startle carries past a hurdle but not a stone wall', () => {
    const running = (solid: boolean) => {
      const m = flock(make, 21, 20, 30, 34);
      m.setObstacles([{ ax: 20, ay: 30, bx: 40, by: 30, radius: 0.2, solid }]);
      run(m, 2, () => []);
      let first = true;
      run(m, 1.5, () => {
        const s: Stimulus[] = first ? [{ id: 9, kind: 'startle', x: 30, y: 27, strength: 1.5, radius: 12 }] : [];
        first = false;
        return s;
      });
      return stateFraction(m, SheepState.Run);
    };
    expect(running(false)).toBeGreaterThan(0.5);
    expect(running(true)).toBeLessThan(0.2);
  });
});
