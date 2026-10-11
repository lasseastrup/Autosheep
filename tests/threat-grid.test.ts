/**
 * sheepherding-v1's threat grid (src/sim/models/sheepherding-v1/threatGrid.ts): with many
 * threats about, each sheep weighs only the ones that could reach it. That must change nothing
 * but the cost.
 */
import { afterEach, describe, expect, test } from 'vitest';
import type { Stimulus } from '../src/sim/contract';
import { SheepherdingV1 } from '../src/sim/models/sheepherding-v1';
import { ThreatGrid } from '../src/sim/models/sheepherding-v1/threatGrid';
import { cluster, run } from '../src/sim/scenarios';

/** `n` monsters circling a flock at 30,30, some closing in and backing off */
const swarm = (n: number) => (t: number): Stimulus[] => Array.from({ length: n }, (_, k) => {
  const r = 6 + (k % 9) * 2.5 + Math.sin(t * 0.7 + k) * 3;
  const a = t * (0.2 + (k % 5) * 0.05) + k * 2.399;
  return { id: k + 1, kind: 'threat', x: 30 + r * Math.cos(a), y: 30 + r * Math.sin(a), strength: 0.6, radius: 6 };
});

function flock(seed: number, n: number): SheepherdingV1 {
  const m = new SheepherdingV1();
  m.init({ seed, width: 60, height: 60, sheep: cluster(n, 30, 30, seed) });
  return m;
}

describe('threat grid', () => {
  afterEach(() => {
    ThreatGrid.min = 24;
  });

  test.each([1, 2])('a flock among sixty monsters does exactly what it would without the grid (seed %i)', (seed) => {
    const withGrid = flock(seed, 40);
    run(withGrid, 12, swarm(60));
    ThreatGrid.min = Infinity;
    const plain = flock(seed, 40);
    run(plain, 12, swarm(60));
    expect(withGrid.hash()).toBe(plain.hash());
    // and they did react to the monsters
    let fear = 0;
    for (let i = 0; i < 40; i++) fear += plain.out.fear[i];
    expect(fear / 40).toBeGreaterThan(0.1);
  });

  test('two hundred sheep among three hundred monsters stay cheap', () => {
    const m = new SheepherdingV1();
    m.init({ seed: 3, width: 120, height: 120, sheep: cluster(200, 60, 60, 3, 1.4) });
    const s = swarm(300);
    const shifted = (t: number) => s(t).map((x) => ({ ...x, x: x.x + 30, y: x.y + 30 }));
    run(m, 2, shifted);
    const t0 = performance.now();
    run(m, 5, shifted);
    const ms = (performance.now() - t0) / (5 / m.dt);
    // about 3 ms on a desktop CPU; a generous bound so a slow CI runner does not fail it
    expect(ms).toBeLessThan(12);
  });
});
