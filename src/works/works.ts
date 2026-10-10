/**
 * The works: every herdway device placed in the world, the sheep's wool and the packs they
 * carry, and the stations' cycles. Deterministic and headless; the game draws it, the tests
 * run it for ten simulated minutes.
 *
 * How a station moves sheep, all through the flock contract. Its chute is a handling race
 * (the contract's `chute`): a sheep in it faces up it, cannot turn round and does not pine
 * for the flock it cannot see. Getting sheep *into* the chute is still up to the flock, so a
 * badly fed station still starves and a race can still jam.
 *   fill     the exit is shut and the chute is baited (a lure at the front, reaching well out
 *            of the intake), so the race's leader walks in and the line follows; those inside
 *            walk up and pack against the front
 *   work     both doors shut; each sheep is worked on in turn
 *   release  the intake is shut and the batch walks out of the exit, and on a little
 */
import type { FlockOutputs, Obstacle, Stimulus } from '../sim/contract';
import type { GrassField } from '../sim/grass';
import {
  deviceObstacles, doorObstacles, DIR, gateObstacle, gateWatch, inStation, LANE_W, STATION_LEN, stationFrame, underRack,
  type Device, type DeviceSpec, type Gate, type Pt, type Rack, type Station,
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
  /**
   * Grazing (M2b): a station calls a field's hungry sheep to its intake while there is good
   * grass past its exit (the field beyond, seen through the doors), and the bait only reaches
   * the sheep at the door. Without a grass field the M2 bait (fillLure) does all the calling.
   */
  mouthLure: { strength: 1.1, radius: 18, out: 2.5, appetite: 0.45, beyond: 5, here: 7, grazed: 0.55, better: 0.2 },
  /** and oats mid-chute: seen only through the open intake, so a sheep that has come to the
   * door is drawn in, while the walls hide them from the rest of the field */
  grazeBait: { strength: 1.4, radius: 14, ahead: 1, appetite: 0.4 },
  /** how hard the chute walks its sheep up while filling, and how far past the exit it lets out */
  chute: { fill: 0.6, out: 3 },
  releaseTimeout: 12,
  /** seconds per sheep worked, on top of a second for opening up */
  shear: 1.5,
  spin: 2,
  chimes: { period: 6, strength: 0.45, radius: 7 },
  /** a race's pull along itself; a little stronger than a salt lick, weaker than a bait */
  laneFlow: { strength: 1, lookahead: 3 },
  lick: { strength: 0.8, radius: 20 },
  /** timed gates: open this long, every `period` seconds */
  timerGate: { open: 30, period: 150 },
  /** grass gates: open once the watched side is grazed below `below` (averaged over `reach` m
   * round a point `out` m from the gate), for `open` seconds; armed again once it has grown back
   * past `rearm` */
  grassGate: { below: 0.3, rearm: 0.6, open: 45, out: 5, reach: 3.5 },
  /** wool grows only on a fed sheep (not at all past `hungry`), and slower after a fright:
   * fright is forgotten over `forget` seconds and at its worst costs `cost` of the growth */
  woolNeeds: { hungry: 0.7, forget: 30, cost: 0.75 },
  /** a full trough calls sheep from `radius` m; each sheep at it eats `eat` of it a second */
  trough: { strength: 1.1, radius: 22, eat: 0.004, reach: 1.8 },
};

/** A gate's state: open or shut, since when, and (grass gates) whether it may open again. */
export interface GateState {
  open: boolean;
  since: number;
  armed: boolean;
}

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
  /** of the yarn, how much a spindle hut made (nobody's hands) */
  autoYarn = 0;
  /** Gafoop's stock: fleeces (shorn by hand, not yet spun) and skeins of yarn */
  readonly stock = { fleece: 0, yarn: 0 };
  /** gates' states and troughs' feed (0..1), by device id */
  readonly gates = new Map<number, GateState>();
  readonly feed = new Map<number, number>();
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
    this.gates.clear();
    this.feed.clear();
    this.yarn = this.fleece = this.shorn = this.autoYarn = 0;
    this.stock.fleece = this.stock.yarn = 0;
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
      this.stations.push({ device: dev as Station, phase: 'fill', since: this.time, lastEntry: this.time, inside: 0, done: 0, rate: 0 });
    }
    if (dev.kind === 'gate') this.gates.set(dev.id, { open: false, since: this.time, armed: true });
    if (dev.kind === 'trough') this.feed.set(dev.id, 0);
    this.rebuild();
    return dev;
  }

  remove(id: number): void {
    const i = this.devices.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.devices.splice(i, 1);
    const s = this.stations.findIndex((st) => st.device.id === id);
    if (s >= 0) this.stations.splice(s, 1);
    this.gates.delete(id);
    this.feed.delete(id);
    this.rebuild();
  }

  private rebuild(): void {
    this.staticObstacles = this.devices.flatMap(deviceObstacles);
    this.version++;
  }

  /** Every fence the works put in the world, doors as they stand now. */
  obstacles(): Obstacle[] {
    const doors = this.stations.flatMap((s) => doorObstacles(s.device, s.phase !== 'fill', s.phase !== 'release'));
    for (const d of this.devices) if (d.kind === 'gate' && !this.gates.get(d.id)?.open) doors.push(gateObstacle(d));
    return this.staticObstacles.concat(doors);
  }

  /** Open or shut a gate (Gafoop's hand, or a save being restored). */
  setGate(id: number, open: boolean): void {
    const st = this.gates.get(id);
    if (!st || st.open === open) return;
    st.open = open;
    st.since = this.time;
    this.version++;
  }

  /** Pour feed into a trough; returns how much went in. */
  fill(id: number, amount: number): number {
    const f = this.feed.get(id);
    if (f === undefined) return 0;
    const v = Math.min(1, f + amount);
    this.feed.set(id, v);
    return v - f;
  }

  /** Seconds since the works started (for saves). */
  get clock(): number {
    return this.time;
  }

  set clock(t: number) {
    this.time = t;
  }

  /** What the devices do to the sheep this step. */
  stimuli(): Stimulus[] {
    const out: Stimulus[] = [];
    for (const s of this.stations) {
      const { back, front, f } = stationFrame(s.device);
      const id = 10000 + s.device.id * 4;
      const chute = (strength: number, lookahead: number): Stimulus => ({ id: id + 1, kind: 'chute', x: back.x, y: back.y, path: [back, front], radius: LANE_W / 2 + 0.2, strength, lookahead });
      if (s.phase === 'fill') {
        const g = this.grass;
        if (!g) {
          out.push({ id, kind: 'lure', x: front.x - f.x * 0.6, y: front.y - f.y * 0.6, ...WORKS.fillLure });
        } else {
          const M = WORKS.mouthLure;
          const Bt = WORKS.grazeBait;
          // it calls once the field on its intake side is grazed down near it and the field past
          // its exit is clearly better: until then the flock is better off grazing
          const beyond = g.around(front.x + f.x * M.beyond, front.y + f.y * M.beyond, 3.5);
          const here = g.around(back.x - f.x * M.here, back.y - f.y * M.here, M.here - 1);
          if (here < M.grazed && beyond > here + M.better) {
            const k = Math.min(1, (beyond - here) * 2);
            out.push({ id: id + 2, kind: 'lure', x: back.x - f.x * M.out, y: back.y - f.y * M.out, strength: M.strength * k, radius: M.radius, appetite: M.appetite });
            const c = s.device.at;
            out.push({ id, kind: 'lure', x: c.x + f.x * Bt.ahead, y: c.y + f.y * Bt.ahead, strength: Bt.strength * k, radius: Bt.radius, appetite: Bt.appetite });
          }
        }
        out.push(chute(WORKS.chute.fill, 0));
      } else if (s.phase === 'work') {
        out.push(chute(0, 0));
      } else {
        out.push(chute(1, WORKS.chute.out));
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
      } else if (d.kind === 'trough') {
        const f = this.feed.get(d.id) ?? 0;
        if (f > 0) out.push({ id: 50000 + d.id, kind: 'lure', x: d.at.x, y: d.at.y, strength: WORKS.trough.strength * Math.min(1, 0.4 + f), radius: WORKS.trough.radius });
      }
    }
    return out;
  }

  /**
   * Advance by one simulation step, after the flock has moved. Returns true when the doors
   * changed (the game should then hand `obstacles()` to the model).
   */
  update(o: FlockOutputs, dt: number, grass: GrassField | null = null): boolean {
    this.time += dt;
    this.grass = grass;
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
      } else if (t - s.since > WORKS.releaseTimeout || (n === 0 && !this.inDoorways(st, o))) {
        // the exit shuts behind the last sheep, not on it
        this.enter(s, 'fill');
      }
    }
    this.updateGates(t, grass);
    // troughs: every sheep standing at one eats from it
    for (const d of this.devices) {
      if (d.kind !== 'trough') continue;
      let f = this.feed.get(d.id) ?? 0;
      if (f <= 0) continue;
      for (let i = 0; i < o.count; i++) {
        if (Math.hypot(o.x[i] - d.at.x, o.y[i] - d.at.y) < WORKS.trough.reach) f -= WORKS.trough.eat * dt;
      }
      this.feed.set(d.id, Math.max(0, f));
    }
    // wool grows back out in the field
    const grow = dt / WORKS.woolRegrow;
    for (let i = 0; i < o.count; i++) if (!inside[i] && this.wool[i] < 1) this.wool[i] = Math.min(1, this.wool[i] + grow * (this.woolRate?.[i] ?? 1));
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
  /** per sheep: how fast its wool grows (1 normal), from hunger and fright (updateWoolRate) */
  woolRate: Float32Array | null = null;
  /** per sheep: fright, slowly forgotten */
  stress = new Float32Array(0);
  /** the grass, when the world has it (stations then call hungry sheep, M2b) */
  private grass: GrassField | null = null;

  /**
   * Wool needs a fed, calm sheep: none grows while a sheep is hungry, and less for a while
   * after it has been frightened (the Woof-Woof's price). Call before update().
   */
  updateWoolRate(o: FlockOutputs, dt: number): void {
    const n = o.count;
    if (!this.woolRate || this.woolRate.length !== n) this.woolRate = new Float32Array(n).fill(1);
    if (this.stress.length !== n) this.stress = new Float32Array(n);
    const N = WORKS.woolNeeds;
    const k = Math.exp(-dt / N.forget);
    for (let i = 0; i < n; i++) {
      this.stress[i] = Math.max(this.stress[i] * k, o.fear[i]);
      const h = o.hunger ? o.hunger[i] : 0;
      const fed = h < N.hungry ? 1 : Math.max(0, (1 - h) / (1 - N.hungry));
      this.woolRate[i] = fed * (1 - N.cost * this.stress[i]);
    }
  }

  /** Timed and grass gates open and shut themselves. */
  private updateGates(t: number, grass: GrassField | null): void {
    for (const d of this.devices) {
      if (d.kind !== 'gate' || d.mode === 'hand') continue;
      const st = this.gates.get(d.id)!;
      if (d.mode === 'timer') {
        const T = WORKS.timerGate;
        // each gate keeps its own beat, from when it was put up
        const open = (t + d.id * 13.7) % T.period < T.open;
        if (open !== st.open) this.flip(d, st, open);
      } else if (grass) {
        const G = WORKS.grassGate;
        const w = gateWatch(d as Gate, G.out);
        const len = grass.around(w.at.x, w.at.y, G.reach);
        if (st.open) {
          if (t - st.since > G.open) this.flip(d, st, false);
        } else if (st.armed && len < G.below) {
          this.flip(d, st, true);
          st.armed = false;
        } else if (!st.armed && len > G.rearm) {
          st.armed = true;
        }
      }
    }
  }

  private flip(d: Device, st: GateState, open: boolean): void {
    st.open = open;
    st.since = this.time;
    this.doorsMoved = true;
    void d;
  }

  private enter(s: StationState, phase: Phase): void {
    s.phase = phase;
    s.since = this.time;
    // a new fill waits its full time for company, whoever was left inside from before
    if (phase === 'fill') s.lastEntry = this.time;
    this.doorsMoved = true;
  }

  /** Is any sheep standing in a station's doorways (a body's length past either end)? */
  private inDoorways(st: Station, o: FlockOutputs): boolean {
    for (let i = 0; i < o.count; i++) {
      const p = { x: o.x[i], y: o.y[i] };
      if (inStation(st, p, STATION_LEN + 2.4, -0.3) && !inStation(st, p)) return true;
    }
    return false;
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
        // spun there and then: the skein goes into Gafoop's stock
        this.pack[i] = Pack.None;
        this.yarn++;
        this.autoYarn++;
        this.stock.yarn++;
        this.events.push({ kind: 'yarn', at });
      }
      s.done++;
      s.rate += 1;
    }
  }
}

export { DIR, LANE_W, STATION_LEN };
