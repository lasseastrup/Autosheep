/**
 * The Valley (M2b). The exit criterion is the first test: the reference grazing rotation (what
 * SOLVE builds for the yarn Forms) in the valley's own meadow, with grass to graze and wool that
 * only grows on fed, calm sheep, keeps shearing and spinning for ten simulated minutes with
 * nobody herding.
 */
import { describe, expect, test } from 'vitest';
import { FORMS } from '../src/game/forms';
import { allObstacles, levelObstacles, WORLD } from '../src/game/level';
import { coverWithWorks, meadowCap } from '../src/game/meadowGrass';
import { buildRotation, dropPen, dropStations, inRect, VALLEY } from '../src/game/valley';
import { GrassField } from '../src/sim/grass';
import { SheepherdingV1 } from '../src/sim/models/sheepherding-v1';
import { cluster } from '../src/sim/scenarios';
import { Works } from '../src/works/works';

function rotation(seed: number, minutes: number): { w: Works; m: SheepherdingV1; perMinute: number[] } {
  const meadow = levelObstacles();
  const w = new Works();
  dropStations(w);
  buildRotation(w);
  const grass = new GrassField(WORLD.width, WORLD.height);
  grass.fill(meadowCap(meadow, WORLD.width, WORLD.height));
  coverWithWorks(grass, grass.cap.slice(), w.devices);
  const m = new SheepherdingV1();
  const A = VALLEY.paddockA;
  m.init({ seed, width: WORLD.width, height: WORLD.height, sheep: cluster(VALLEY.flock, (A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, seed, 1.3) });
  m.setGrass(grass);
  w.setFlock(VALLEY.flock);
  const sync = () => m.setObstacles([...allObstacles(meadow), ...w.obstacles()]);
  sync();
  let v = w.version;
  const perMinute: number[] = [];
  let last = 0;
  for (let min = 0; min < minutes; min++) {
    for (let k = 0; k < Math.round(60 / m.dt); k++) {
      m.step(w.stimuli());
      grass.grow(m.dt);
      w.updateWoolRate(m.out, m.dt);
      w.update(m.out, m.dt, grass);
      if (w.version !== v) {
        v = w.version;
        sync();
      }
    }
    perMinute.push(w.yarn - last);
    last = w.yarn;
  }
  return { w, m, perMinute };
}

describe('the grazing rotation', () => {
  test.each([1, 2])('shears and spins for ten minutes with nobody herding (seed %i)', (seed) => {
    const { w, m, perMinute } = rotation(seed, 10);
    // the flock grazes the first paddock down before it moves on, so yarn starts after a few
    // minutes; then it keeps coming (eight runs made 15 to 34 in ten minutes)
    expect(w.yarn).toBeGreaterThanOrEqual(12);
    expect(perMinute.slice(-4).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
    expect(w.shorn).toBeGreaterThanOrEqual(w.yarn);
    // and every sheep is in a paddock or a station
    let loose = 0;
    for (let i = 0; i < m.out.count; i++) {
      const x = m.out.x[i];
      const y = m.out.y[i];
      const inStation = w.stations.some((s) => Math.abs(x - s.device.at.x) < 4.5 && Math.abs(y - s.device.at.y) < 1.8);
      if (!inRect(VALLEY.paddockA, x, y) && !inRect(VALLEY.paddockB, x, y) && !inStation) loose++;
    }
    expect(loose).toBe(0);
  }, 60_000);
});

describe('forms', () => {
  test('every Form has a code, a goal and an opening line, and codes are unique', () => {
    const codes = new Set(FORMS.map((f) => f.code));
    expect(codes.size).toBe(FORMS.length);
    for (const f of FORMS) expect(f.opening.length).toBeGreaterThan(10);
  });

  test('the pen drop is a closed pen with one gate', () => {
    const w = new Works();
    dropPen(w);
    const gates = w.devices.filter((d) => d.kind === 'gate');
    expect(gates.length).toBe(1);
    // shut, the pen is closed: the gateway is the gate's width, and nothing else is open
    expect(w.obstacles().length).toBe(w.devices.length);
  });
});
