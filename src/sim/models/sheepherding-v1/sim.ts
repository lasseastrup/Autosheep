import type { Obstacle, Stimulus } from '../../contract';
import { GRASS, type GrassField } from '../../grass';

const GRASS_BITE = GRASS.bite;
import { Behaviour } from './behaviour';
import { defaultConfig, mergeConfig, type DeepPartial, type SimConfig } from './config';
import { FEAR_HIST, Flock } from './flock';
import { UniformGrid } from './grid';
import { Groups } from './groups';
import { Motion } from './motion';
import { computeNeighbours } from './neighbours';
import { Obstacles } from './obstacles';
import { Perception, type PointStimulus, type Threat } from './perception';
import { Rng } from './rng';
import { Steering } from './steering';
import { ThreatGrid } from './threatGrid';
import { SheepState } from './types';

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
  /** Autosheep: this step's threats by where they are, when there are many */
  readonly threatGrid = new ThreatGrid();
  /** the threats acting this step, in the order the game listed them */
  readonly threats: Threat[] = [];
  private readonly startles: PointStimulus[] = [];
  private readonly lures: PointStimulus[] = [];
  /** Autosheep: races' pulls along their paths, and the stations' handling chutes */
  private readonly flows: Stimulus[] = [];
  private readonly chutes: Stimulus[] = [];
  /** threat state by stimulus id, kept across steps to measure velocity */
  private readonly tracked = new Map<number, Threat>();
  /** after a startle the flock keeps fleeing from where it came for a moment */
  private echoes: Echo[] = [];
  /** Autosheep: the world's grass, if the game has any; grazing sheep eat it */
  grass: GrassField | null = null;
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
    this.flows.length = 0;
    this.chutes.length = 0;
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
        this.lures.push({ x: s.x, y: s.y, strength: s.strength, radius: s.radius, appetite: s.appetite });
      } else if (s.kind === 'flow') {
        if (s.path && s.path.length >= 2) this.flows.push(s);
      } else if (s.kind === 'chute') {
        if (s.path && s.path.length >= 2) this.chutes.push(s);
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

  /**
   * Autosheep: the game takes sheep i out of the flock (to carry it, or keep it waiting). It
   * stops where it is, standing grazing, out of every other sheep's sight and grid; anyone
   * following it loses its leader.
   */
  hold(i: number): void {
    const f = this.flock;
    if (i < 0 || i >= f.count || f.held[i]) return;
    f.held[i] = 1;
    f.active--;
    f.vx[i] = 0;
    f.vy[i] = 0;
    f.speed[i] = 0;
    f.desiredSpeed[i] = 0;
    f.state[i] = SheepState.Graze;
    f.stateTime[i] = 0;
    f.pendingState[i] = -1;
    f.leader[i] = -1;
    f.stepRemaining[i] = 0;
    f.threatIdx[i] = -1;
    for (let k = 0; k < f.count; k++) if (f.leader[k] === i) f.leader[k] = -1;
  }

  /** Autosheep: where a held sheep is now (the game carries it about). */
  place(i: number, x: number, y: number): void {
    const f = this.flock;
    if (i < 0 || i >= f.count || !f.held[i]) return;
    f.px[i] = f.prevX[i] = x;
    f.py[i] = f.prevY[i] = y;
  }

  /** Autosheep: a held sheep back into the flock where it stands, standing still, grazing. */
  release(i: number): void {
    const f = this.flock;
    if (i < 0 || i >= f.count || !f.held[i]) return;
    f.held[i] = 0;
    f.active++;
    f.prevX[i] = f.px[i];
    f.prevY[i] = f.py[i];
    f.vx[i] = 0;
    f.vy[i] = 0;
    f.state[i] = SheepState.Graze;
    f.stateTime[i] = 0;
    f.pendingState[i] = -1;
    f.nextStepAt[i] = this.time + 1;
    f.seenUntil[i] = -1;
    f.lure[i] = 0;
    // its fear history is stale: what it feels now is what its neighbours will see
    for (let s = 0; s < FEAR_HIST; s++) f.fearHist[i * FEAR_HIST + s] = f.fear[i];
  }

  /**
   * Autosheep: hunger grows; a sheep grazing with its head down eats the grass at its muzzle,
   * the hungrier the more, and a full belly takes the edge off it.
   */
  private graze(grass: GrassField, dt: number): void {
    const f = this.flock;
    const G = this.cfg.grazing;
    for (let i = 0; i < f.count; i++) {
      // Autosheep: a held sheep neither eats nor gets hungrier
      if (f.held[i]) continue;
      let hunger = f.hunger[i] + G.hungerRate * dt;
      if (f.state[i] === SheepState.Graze && !f.handled[i] && f.stepRemaining[i] <= 0) {
        const h = f.heading[i];
        const want = GRASS_BITE * Math.min(1, 0.25 + hunger) * dt;
        hunger -= grass.eat(f.px[i] + Math.cos(h) * G.muzzle, f.py[i] + Math.sin(h) * G.muzzle, want) / G.fill;
      }
      f.hunger[i] = Math.min(1, Math.max(0, hunger));
    }
  }

  /** Advance one fixed step. */
  tick(): void {
    const f = this.flock;
    const dt = this.cfg.dt;
    this.grid.build(f.px, f.py, f.count, f.held);
    computeNeighbours(f, this.grid, this.cfg);
    this.groups.update(f, this.grid, this.cfg.group.linkDist, this.cfg.group.shedTolerance, this.cfg.group.strayDist, this.obstacles);
    this.threatGrid.build(this.threats, this.cfg.pressure.lookahead);
    this.perception.update(f, this.threats, this.startles, this.lures, this.obstacles, this.time, dt, this.flows, this.chutes, this.grass, this.step, this.threatGrid);
    if (this.cfg.behaviourEnabled) this.behaviour.update(f, this.time, dt, this.groups);
    this.steering.update(f, this.threats, dt, this.groups, this.obstacles, this.time, this.threatGrid);
    this.motion.update(f, dt);
    if (this.grass) this.graze(this.grass, dt);
    f.group.set(this.groups.groupOf.subarray(0, f.count));
    // a startle is heard once
    this.startles.length = 0;
    this.time += dt;
    this.step++;
  }
}
