/**
 * Grass, and grazing it. The field on its own (eaten down, grows back), then what the flock
 * does with it through the contract: eats where it stands, and a hungry flock on bare ground
 * goes and finds the fresh grass.
 */
import { describe, expect, test } from 'vitest';
import type { FlockModel } from '../src/sim/contract';
import { GRASS, GrassField } from '../src/sim/grass';
import { BoidsModel } from '../src/sim/models/boids';
import { SheepherdingV1 } from '../src/sim/models/sheepherding-v1';
import { centroid, cluster, countIn } from '../src/sim/scenarios';

describe('the grass field', () => {
  test('a mouthful takes grass, never more than there is', () => {
    const g = new GrassField(10, 10);
    const before = g.total();
    expect(g.eat(5, 5, 0.5)).toBeCloseTo(0.5);
    expect(g.total()).toBeCloseTo(before - 0.5);
    expect(g.at(5, 5)).toBeLessThan(1);
    // strip the spot bare, then ask for more
    for (let k = 0; k < 200; k++) g.eat(5, 5, 1);
    expect(g.eat(5, 5, 1)).toBeLessThan(1e-3);
    expect(g.at(5, 5)).toBeLessThan(0.01);
    expect(g.at(1, 1)).toBeCloseTo(1);
  });

  test('bare ground grows back to full in about the regrowth time, and no further than its cap', () => {
    const g = new GrassField(4, 4);
    g.fill((x) => (x < 2 ? 1 : 0.5));
    g.length.fill(0);
    let t = 0;
    while (g.at(1, 2) < 0.99 && t < 3 * GRASS.regrow) {
      g.grow(1);
      t++;
    }
    expect(t).toBeGreaterThan(GRASS.regrow * 0.6);
    expect(t).toBeLessThan(GRASS.regrow * 1.4);
    for (let k = 0; k < 1000; k++) g.grow(1);
    expect(g.at(3, 2)).toBeCloseTo(0.5);
  });
});

const MODELS: { name: string; make: () => FlockModel; full: boolean }[] = [
  { name: 'sheepherding-v1', make: () => new SheepherdingV1(), full: true },
  { name: 'boids', make: () => new BoidsModel(), full: false },
];

function grazing(make: () => FlockModel, grass: GrassField, seed: number, n: number, cx: number, cy: number): FlockModel {
  const m = make();
  m.init({ seed, width: grass.width, height: grass.height, sheep: cluster(n, cx, cy, seed) });
  m.setGrass(grass);
  return m;
}

function run(m: FlockModel, grass: GrassField, seconds: number, grow = true): void {
  const steps = Math.round(seconds / m.dt);
  for (let k = 0; k < steps; k++) {
    m.step([]);
    if (grow) grass.grow(m.dt);
  }
}

describe.each(MODELS)('$name', ({ make, full }) => {
  test('a grazing flock eats the grass it stands on', () => {
    const grass = new GrassField(60, 40);
    const m = grazing(make, grass, 3, 20, 30, 20);
    run(m, grass, 60, false);
    expect(grass.eaten).toBeGreaterThan(5);
    // the flock's own patch is shorter than the far corner
    const c = centroid(m);
    expect(grass.around(c.x, c.y, 3)).toBeLessThan(0.9);
    expect(grass.at(3, 3)).toBeCloseTo(1);
  });

  test('grazing is deterministic', () => {
    const a = new GrassField(60, 40);
    const b = new GrassField(60, 40);
    const ma = grazing(make, a, 7, 16, 30, 20);
    const mb = grazing(make, b, 7, 16, 30, 20);
    run(ma, a, 30);
    run(mb, b, 30);
    expect(ma.hash()).toBe(mb.hash());
    expect(a.total()).toBe(b.total());
  });

  test.skipIf(!full)('a hungry flock on bare ground moves on to fresh grass', () => {
    // the west half grazed bare, the east half untouched; no regrowth
    const grass = new GrassField(60, 40);
    grass.fill(() => 1);
    for (let r = 0; r < grass.rows; r++) for (let c = 0; c < grass.cols / 2; c++) grass.length[r * grass.cols + c] = 0.02;
    const m = grazing(make, grass, 5, 20, 14, 20);
    run(m, grass, 120, false);
    expect(countIn(m, 30, 0, 60, 40)).toBeGreaterThanOrEqual(16);
  });

  test.skipIf(!full)('a flock on good grass grazes its way slowly, it does not set off', () => {
    const grass = new GrassField(60, 40);
    const m = grazing(make, grass, 11, 20, 30, 20);
    const c0 = centroid(m);
    run(m, grass, 60);
    const c1 = centroid(m);
    // mowing across the field, a few metres a minute (walking would be a metre a second)
    expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeLessThan(10);
  });
});
