import { hashOutputs, type FlockInit, type FlockModel, type FlockOutputs, type Obstacle, type Stimulus } from '../../contract';
import type { DeepPartial, SimConfig } from './config';
import { Sim } from './sim';

/**
 * `sheepherding-v1`: the flock model from github.com/lasseastrup/sheepherding at commit
 * a470408 (src/sim), vendored and extended for Autosheep. Changes from the original are
 * marked "Autosheep" in the source. Improvements made upstream are ported by hand.
 */
export class SheepherdingV1 implements FlockModel {
  readonly name = 'sheepherding-v1';
  sim!: Sim;
  out!: FlockOutputs;

  constructor(private readonly patch: DeepPartial<SimConfig> = {}) {}

  get dt(): number {
    return this.sim ? this.sim.cfg.dt : 1 / 30;
  }

  get time(): number {
    return this.sim.time;
  }

  init(spec: FlockInit): void {
    this.sim = new Sim({ ...this.patch, seed: spec.seed, world: { width: spec.width, height: spec.height } }, spec.sheep);
    const f = this.sim.flock;
    this.out = {
      get count() { return f.count; },
      x: f.px,
      y: f.py,
      heading: f.heading,
      speed: f.speed,
      state: f.state,
      fear: f.fear,
      group: f.group,
    };
  }

  setObstacles(obstacles: readonly Obstacle[]): void {
    this.sim.setObstacles(obstacles);
  }

  step(stimuli: readonly Stimulus[]): void {
    this.sim.setStimuli(stimuli);
    this.sim.tick();
  }

  hash(): number {
    return hashOutputs(this.out);
  }
}
