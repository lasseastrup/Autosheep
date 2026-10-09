import type { Obstacle, Stimulus } from '../../contract';
import { Behaviour } from './behaviour';
import { defaultConfig, mergeConfig, type DeepPartial, type SimConfig } from './config';
import { Flock } from './flock';
import { UniformGrid } from './grid';
import { Groups } from './groups';
import { Motion } from './motion';
import { computeNeighbours } from './neighbours';
import { Obstacles } from './obstacles';
import { Perception, type PointStimulus, type Threat } from './perception';
import { Rng } from './rng';
import { Steering } from './steering';

interface Echo extends PointStimulus {
  until: number;
}

/**
 * Deterministic fixed-step flock simulation. No DOM, no three.js.
 *
 * Autosheep changes from the original: the single pointer threat became a list of stimuli
 * (threats, lures, startles) supplied every step, the world has fence segments, and sheep
 * spawn where the game puts them.
 */
export class Sim {
  cfg: SimConfig;
  readonly rng: Rng;
  readonly flock: Flock;
  readonly grid: UniformGrid;
  readonly behaviour: Behaviour;
  readonly steering: Steering;
  readonly motion: Motion;
  readonly perception: Perception;
  readonly groups: Groups;
  readonly obstacles: Obstacles;
  /** the threats acting this step, in the order the game listed them */
  readonly threats: Threat[] = [];
  private readonly startles: PointStimulus[] = [];
  private readonly lures: PointStimulus[] = [];
  /** threat state by stimulus id, kept across steps to measure velocity */
  private readonly tracked = new Map<number, Threat>();
  /** after a startle the flock keeps fleeing from where it came for a moment */
  private echoes: Echo[] = [];
  time = 0;
  step = 0;

  constructor(patch: DeepPartial<SimConfig> | undefined, sheep: readonly { x: number; y: number; heading?: number }[]) {
    this.cfg = mergeConfig(defaultConfig(), patch);
    const capacity = Math.max(1, sheep.length);
    this.rng = new Rng(this.cfg.seed);
    this.flock = new Flock(capacity, this.cfg.steering.slots);
    this.grid = new UniformGrid(this.cfg.world.width, this.cfg.world.height, this.cfg.sheep.gatherCell, capacity);
    this.behaviour = new Behaviour(this.cfg, this.rng);
    this.steering = new Steering(this.cfg, this.rng);
    this.motion = new Motion(this.cfg, capacity);
    this.perception = new Perception(this.cfg);
    this.groups = new Groups(capacity);
    this.obstacles = new Obstacles(this.cfg.world.width, this.cfg.world.height, 4, this.cfg.obstacle.dangerStart + 1);
    this.motion.obstacles = this.obstacles;
    this.flock.spawn(this.cfg, this.rng, sheep);
    this.relax();
  }

  /** relax overlaps (after spawning, or after fences move onto sheep) */
  private relax(): void {
    for (let k = 0; k < 20; k++) {
      this.grid.build(this.flock.px, this.flock.py, this.flock.count);
      computeNeighbours(this.flock, this.grid, this.cfg);
      this.flock.prevX.set(this.flock.px);
      this.flock.prevY.set(this.flock.py);
      this.motion.solveContacts(this.flock, this.flock.count);
    }
  }

  setObstacles(list: readonly Obstacle[]): void {
    this.obstacles.set(list);
  }

  /** Stimuli for the next tick. Startles fire once. */
  setStimuli(stimuli: readonly Stimulus[]): void {
    const dt = this.cfg.dt;
    const S = this.cfg.startle;
    this.threats.length = 0;
    this.startles.length = 0;
    this.lures.length = 0;
    const seen = new Set<number>();
    for (const s of stimuli) {
      if (s.kind === 'threat') {
        seen.add(s.id);
        let t = this.tracked.get(s.id);
        if (!t) {
          t = { active: true, x: s.x, y: s.y, vx: 0, vy: 0, speed: 0, strength: s.strength, radius: s.radius };
          this.tracked.set(s.id, t);
        } else {
          // low-pass the motion into a velocity, as the original did for the pointer
          const k = 1 - Math.exp(-dt / 0.06);
          t.vx += ((s.x - t.x) / dt - t.vx) * k;
          t.vy += ((s.y - t.y) / dt - t.vy) * k;
          t.speed = Math.hypot(t.vx, t.vy);
          t.x = s.x;
          t.y = s.y;
          t.strength = s.strength;
          t.radius = s.radius;
        }
        this.threats.push(t);
      } else if (s.kind === 'lure') {
        this.lures.push({ x: s.x, y: s.y, strength: s.strength, radius: s.radius });
      } else {
        this.startles.push({ x: s.x, y: s.y, strength: s.strength, radius: s.radius });
        this.echoes.push({ x: s.x, y: s.y, strength: s.strength * S.echoStrength, radius: s.radius, until: this.time + S.echo });
      }
    }
    for (const id of [...this.tracked.keys()]) if (!seen.has(id)) this.tracked.delete(id);
    // echoes act as fading, motionless threats
    this.echoes = this.echoes.filter((e) => e.until > this.time);
    for (const e of this.echoes) {
      const left = (e.until - this.time) / S.echo;
      this.threats.push({ active: true, x: e.x, y: e.y, vx: 0, vy: 0, speed: 0, strength: e.strength * left, radius: e.radius });
    }
  }

  /** Advance one fixed step. */
  tick(): void {
    const f = this.flock;
    const dt = this.cfg.dt;
    this.grid.build(f.px, f.py, f.count);
    computeNeighbours(f, this.grid, this.cfg);
    this.groups.update(f, this.grid, this.cfg.group.linkDist, this.cfg.group.shedTolerance, this.cfg.group.strayDist);
    this.perception.update(f, this.threats, this.startles, this.lures, this.obstacles, this.time, dt);
    if (this.cfg.behaviourEnabled) this.behaviour.update(f, this.time, dt, this.groups);
    this.steering.update(f, this.threats, dt, this.groups, this.obstacles, this.time);
    this.motion.update(f, dt);
    f.group.set(this.groups.groupOf.subarray(0, f.count));
    // a startle is heard once
    this.startles.length = 0;
    this.time += dt;
    this.step++;
  }
}
