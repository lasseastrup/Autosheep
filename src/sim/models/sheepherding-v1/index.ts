import { hashOutputs, type FlockInit, type FlockModel, type FlockOutputs, type Obstacle, type Stimulus } from '../../contract';
import type { GrassField } from '../../grass';
import type { DeepPartial, SimConfig } from './config';
import { Sim } from './sim';

/**
 * `sheepherding-v1`: Autosheep's flock model. It started as the model in
 * github.com/lasseastrup/sheepherding at commit a470408 (src/sim) and is now ours, changed
 * freely to serve the game: whatever a device or level needs from the flock is added here
 * (behind the contract) rather than worked around in the game. Changes from the original are
 * marked "Autosheep"; ideas from upstream are ported by hand when they help.
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
      hunger: f.hunger,
    };
    spec.sheep.forEach((s, i) => {
      if (s.hunger !== undefined && i < f.count) f.hunger[i] = s.hunger;
    });
  }

  setObstacles(obstacles: readonly Obstacle[]): void {
    this.sim.setObstacles(obstacles);
  }

  setGrass(grass: GrassField | null): void {
    this.sim.grass = grass;
  }

  step(stimuli: readonly Stimulus[]): void {
    this.sim.setStimuli(stimuli);
    this.sim.tick();
  }

  hash(): number {
    return hashOutputs(this.out);
  }
}
