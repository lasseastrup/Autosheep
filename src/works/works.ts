/**
 * The works: every herdway device placed in the world, the sheep's wool and the packs they
 * carry, and the stations' cycles. Deterministic and headless; the game draws it, the tests
 * run it for ten simulated minutes.
 *
 * How a station moves sheep (all through the flock contract, so jams stay emergent):
 *   fill     the exit is shut and the chute is baited (a lure at the front, reaching well
 *            out of the intake), so the race's leader walks in and the line follows
 *   work     both doors shut; each sheep is worked on in turn
 *   release  the intake is shut and a sweep (a wicker forcing gate) walks up the chute behind
 *            the batch while a pull from just beyond the exit draws them out. A push that
 *            stands still soon becomes scenery; shoving harder jams them
 */
import type { FlockOutputs, Obstacle, Stimulus } from '../sim/contract';
import {
  deviceObstacles, doorObstacles, DIR, inStation, LANE_W, STATION_LEN, stationFrame, underRack,
  type Device, type DeviceSpec, type Pt, type Rack, type Station,
} from './devices';

export const Pack = { None: 0, Fleece: 1, Yarn: 2 } as const;
export type Pack = (typeof Pack)[keyof typeof Pack];

/** Tunables, in one place so the loop test and a dev panel can poke them. */
export const WORKS = {
  /** seconds for a shorn sheep's wool to grow back */
  woolRegrow: 100,
  /** wool at which a sheep counts as woolly */
  woolly: 0.9,
  batch: 4,
  /** with sheep inside but nobody new for this long, a station works the part batch */
  fillWait: 6,
  fillLure: { strength: 1.2, radius: 18 },
  /** the sweep: how hard it presses, how far ahead it reaches, how fast it walks up the chute */
  push: { strength: 0.6, radius: 4, speed: 1 },
  /** just outside the exit; reaches the back of the chute at full strength */
  pull: { strength: 1, radius: 2 * (STATION_LEN + 3) },
  releaseTimeout: 12,
  /** seconds per sheep worked, on top of a second for opening up */
  shear: 1.5,
  spin: 2,
  chimes: { period: 6, strength: 0.45, radius: 7 },
  /** a race's pull along itself; a little stronger than a salt lick, weaker than a bait */
  laneFlow: { strength: 1, lookahead: 3 },
  lick: { strength: 0.8, radius: 20 },
};

export type Phase = 'fill' | 'work' | 'release';

export interface StationState {
  device: Station;
  phase: Phase;
  since: number;
  lastEntry: number;
  inside: number;
  /** sheep worked on (sheared or spun) since the start */
  done: number;
  /** recent rate, sheep per minute, for the overlay */
  rate: number;
  /** releases so far: each sweep is a new stimulus, so the flock sees it start afresh */
  cycles: number;
}

/** Something the game may want to show: a yarn hung up, a sheep shorn. */
export interface WorksEvent {
  kind: 'yarn' | 'shorn' | 'spun';
  at: Pt;
}

export class Works {
  readonly devices: Device[] = [];
  readonly stations: StationState[] = [];
  /** per sheep: 0 shorn … 1 full fleece */
  wool = new Float32Array(0);
  /** per sheep: what it carries (Pack) */
  pack = new Uint8Array(0);
  /** totals */
  yarn = 0;
  fleece = 0;
  shorn = 0;
  readonly events: WorksEvent[] = [];
  /** bumped whenever the fences change, so the game knows to hand them to the model */
  version = 0;
  private nextId = 1;
  private staticObstacles: Obstacle[] = [];
  private time = 0;

  /** Size the per-sheep arrays to the flock; new sheep start with full fleeces. */
  setFlock(count: number): void {
    const wool = new Float32Array(count).fill(1);
    const pack = new Uint8Array(count);
    wool.set(this.wool.subarray(0, Math.min(count, this.wool.length)));
    pack.set(this.pack.subarray(0, Math.min(count, this.pack.length)));
    this.wool = wool;
    this.pack = pack;
  }

  /** Take everything down and start the economy afresh. */
  clear(): void {
    this.devices.length = 0;
    this.stations.length = 0;
    this.yarn = this.fleece = this.shorn = 0;
    this.wool = new Float32Array(0);
    this.pack = new Uint8Array(0);
    this.events.length = 0;
    this.time = 0;
    this.rebuild();
  }

  add(d: DeviceSpec): Device {
    const dev = { ...d, id: d.id ?? this.nextId++ } as Device;
    this.nextId = Math.max(this.nextId, dev.id + 1);
    this.devices.push(dev);
    if (dev.kind === 'shed' || dev.kind === 'spindle') {
      this.stations.push({ device: dev as Station, phase: 'fill', since: this.time, lastEntry: this.time, inside: 0, done: 0, rate: 0, cycles: 0 });
    }
    this.rebuild();
    return dev;
  }

  remove(id: number): void {
    const i = this.devices.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.devices.splice(i, 1);
    const s = this.stations.findIndex((st) => st.device.id === id);
    if (s >= 0) this.stations.splice(s, 1);
    this.rebuild();
  }

  private rebuild(): void {
    this.staticObstacles = this.devices.flatMap(deviceObstacles);
    this.version++;
  }

  /** Every fence the works put in the world, doors as they stand now. */
  obstacles(): Obstacle[] {
    const doors = this.stations.flatMap((s) => doorObstacles(s.device, s.phase !== 'fill', s.phase !== 'release'));
    return this.staticObstacles.concat(doors);
  }

  /** What the devices do to the sheep this step. */
  stimuli(): Stimulus[] {
    const out: Stimulus[] = [];
    for (const s of this.stations) {
      const { back, front, f } = stationFrame(s.device);
      const id = 10000 + s.device.id * 4;
      if (s.phase === 'fill') {
        const at = { x: front.x - f.x * 0.6, y: front.y - f.y * 0.6 };
        out.push({ id, kind: 'lure', ...at, ...WORKS.fillLure });
      } else if (s.phase === 'release') {
        const P = WORKS.push;
        const k = Math.min(STATION_LEN - 1, 0.3 + P.speed * (this.time - s.since));
        out.push({ id: 1_000_000 + s.device.id * 1000 + (s.cycles % 1000), kind: 'threat', x: back.x + f.x * k, y: back.y + f.y * k, strength: P.strength, radius: P.radius });
        out.push({ id: id + 2, kind: 'lure', x: front.x + f.x * 3, y: front.y + f.y * 3, ...WORKS.pull });
      }
    }
    for (const d of this.devices) {
      if (d.kind === 'lane') {
        const p = d.points[0];
        out.push({ id: 40000 + d.id, kind: 'flow', x: p.x, y: p.y, path: d.points, strength: WORKS.laneFlow.strength, radius: LANE_W / 2 + 0.3, lookahead: WORKS.laneFlow.lookahead });
      } else if (d.kind === 'chimes') {
        // each set rings on its own beat, so a row of them does not jangle as one
        const C = WORKS.chimes;
        const phase = (this.time + d.id * 1.7) % C.period;
        if (phase < 1 / 30 + 1e-6) out.push({ id: 20000 + d.id, kind: 'startle', x: d.at.x, y: d.at.y, strength: C.strength, radius: C.radius });
      } else if (d.kind === 'lick') {
        out.push({ id: 30000 + d.id, kind: 'lure', x: d.at.x, y: d.at.y, ...WORKS.lick });
      }
    }
    return out;
  }

  /**
   * Advance by one simulation step, after the flock has moved. Returns true when the doors
   * changed (the game should then hand `obstacles()` to the model).
   */
  update(o: FlockOutputs, dt: number): boolean {
    this.time += dt;
    this.events.length = 0;
    if (this.wool.length !== o.count) this.setFlock(o.count);
    const t = this.time;
    this.doorsMoved = false;
    const inside = new Uint8Array(o.count);
    for (const s of this.stations) {
      const st = s.device;
      let n = 0;
      for (let i = 0; i < o.count; i++) {
        if (inStation(st, { x: o.x[i], y: o.y[i] })) {
          n++;
          inside[i] = 1;
        }
      }
      if (n > s.inside) s.lastEntry = t;
      s.inside = n;
      s.rate *= Math.exp(-dt / 60);
      if (s.phase === 'fill') {
        if (n >= WORKS.batch || (n >= 1 && t - s.lastEntry > WORKS.fillWait)) this.enter(s, 'work');
      } else if (s.phase === 'work') {
        const per = st.kind === 'shed' ? WORKS.shear : WORKS.spin;
        if (t - s.since >= 1 + per * this.workable(s, o)) {
          this.work(s, o);
          this.enter(s, 'release');
        }
      } else if (n === 0 || t - s.since > WORKS.releaseTimeout) {
        this.enter(s, 'fill');
      }
    }
    // wool grows back out in the field
    const grow = dt / WORKS.woolRegrow;
    for (let i = 0; i < o.count; i++) if (!inside[i] && this.wool[i] < 1) this.wool[i] = Math.min(1, this.wool[i] + grow);
    // racks take the yarn
    for (const d of this.devices) {
      if (d.kind !== 'rack') continue;
      for (let i = 0; i < o.count; i++) {
        if (this.pack[i] === Pack.Yarn && underRack(d as Rack, { x: o.x[i], y: o.y[i] })) {
          this.pack[i] = Pack.None;
          this.yarn++;
          this.events.push({ kind: 'yarn', at: { x: o.x[i], y: o.y[i] } });
        }
      }
    }
    if (this.doorsMoved) this.version++;
    return this.doorsMoved;
  }

  private doorsMoved = false;

  private enter(s: StationState, phase: Phase): void {
    s.phase = phase;
    s.since = this.time;
    if (phase === 'release') s.cycles++;
    // a new fill waits its full time for company, whoever was left inside from before
    if (phase === 'fill') s.lastEntry = this.time;
    this.doorsMoved = true;
  }

  /** How many of the sheep inside this station have something for it to do. */
  private workable(s: StationState, o: FlockOutputs): number {
    let n = 0;
    for (let i = 0; i < o.count; i++) {
      if (!inStation(s.device, { x: o.x[i], y: o.y[i] })) continue;
      if (s.device.kind === 'shed' ? this.wool[i] >= WORKS.woolly : this.pack[i] === Pack.Fleece) n++;
    }
    return n;
  }

  private work(s: StationState, o: FlockOutputs): void {
    for (let i = 0; i < o.count; i++) {
      const at = { x: o.x[i], y: o.y[i] };
      if (!inStation(s.device, at)) continue;
      if (s.device.kind === 'shed') {
        if (this.wool[i] < WORKS.woolly) continue;
        this.wool[i] = 0;
        this.shorn++;
        // the fleece rides on the sheep that grew it, if its back is free
        if (this.pack[i] === Pack.None) {
          this.pack[i] = Pack.Fleece;
          this.fleece++;
        }
        this.events.push({ kind: 'shorn', at });
      } else {
        if (this.pack[i] !== Pack.Fleece) continue;
        this.pack[i] = Pack.Yarn;
        this.events.push({ kind: 'spun', at });
      }
      s.done++;
      s.rate += 1;
    }
  }
}

export { DIR, LANE_W, STATION_LEN };
