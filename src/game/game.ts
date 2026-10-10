import * as THREE from 'three';
import { PixelRenderer } from '../engine/pixelRenderer';
import { RESURRECT64, C } from '../engine/palette';
import { setToonDefaults } from '../engine/toon';
import type { Fonts } from '../engine/bitmapFont';
import { SheepState, type FlockModel, type Obstacle, type Stimulus } from '../sim/contract';
import { SheepherdingV1 } from '../sim/models/sheepherding-v1';
import { cluster } from '../sim/scenarios';
import { IsoCamera } from './camera';
import { FlockView } from './flockView';
import { GafoopActor } from './gafoopActor';
import { GameAudio } from './gameAudio';
import { buttonAt, drawHud, H, hudButtons, W, type ButtonId, type HudState } from './hud';
import { PerfTest, type Variant } from './perfTest';
import { allObstacles, buildScenery, levelObstacles, WORLD, type LevelObstacles } from './level';
import { FORMS, goalLabel, type FormSpec, type Unlock } from './forms';
import { buildRotation, inRect, VALLEY } from './valley';
import { base64ToBytes, bytesToBase64, clearSnapshot, loadSnapshot, storeSnapshot, type Snapshot } from './save';
import { Works } from '../works/works';
import { WorksView } from './worksView';
import { Builder, pixelLine } from './build';
import { FlowField } from './flowOverlay';
import { TOOLS, type HudLayout, type ToolId } from './hud';
import type { Device, GateMode, Pt } from '../works/devices';
import { WORKS } from '../works/works';
import { GrassField } from '../sim/grass';
import { GrassView } from '../art/grass';
import { coverWithWorks, meadowCap } from './meadowGrass';

/**
 * Gafoop is harmless until the Woof-Woof (M2b): the sheep ignore him, and he leads them with
 * the feed bucket. While the speaker sounds he is a threat by proximity alone, like a dog, and
 * each press starts with a bark (a startle).
 */
const WOOF = { strength: 0.95, radius: 10 };
const BARK = { strength: 1.3, radius: 12 };
const BUCKET = { strength: 1.0, radius: 14 };
/** jobs by hand: seconds to shear a sheep or spin a fleece, and how near the sheep must be */
const HAND = { shear: 1.6, spin: 2.4, reach: 2.4 };
/** a hand gate this near Gafoop is his to open and shut */
const GATE_REACH = 6;
/** the bucket fills a trough this near at `rate` a second */
const FILL = { reach: 2.6, rate: 0.35 };
/** "unattended": nothing done by hand (bucket, woof, gate) for this long */
const HANDS_OFF = 20;

const QUIPS = {
  start: [''],
  woof: ['WOOF! WOOF! (Translation: move.)', 'I AM A DOG NOW. FEAR ME.', 'BARK. BARK, I SAY.'],
  bucket: ['Who wants a pellet? You do. Yes you do.', 'Delicious regulation feed! Twelve percent grit!'],
  scatter: ['No, no, the OTHER way!', 'Stop panicking! I am a very calm alien!', 'Why are they like this?', 'Sheep. Of course it had to be sheep.'],
  gateOpen: ['Gate: open.'],
  gateShut: ['Gate: secured. Mostly.'],
  approved: ['Approved! In triplicate!', 'Another stamp! The Hegemony trembles. Slightly.'],
  firstYarn: ['Yarn! Actual yarn! Somebody frame it.'],
  notWoolly: ['That one is bald. Give it a while. And some grass.'],
  saved: [''],
};

export interface GameInput {
  /** pointer in overlay pixels, or null when off the canvas */
  pointer: { x: number; y: number } | null;
  /** a mouse button is held: rattle the feed bucket */
  bucket: boolean;
  /** the on-screen FEED button is held (touch) */
  feed: boolean;
  keys: Set<string>;
  /** keys pressed since the last frame */
  hits: string[];
  wheel: number;
  /** build mode: taps and clicks on the ground since the last frame (overlay pixels) */
  taps: { x: number; y: number }[];
  /** build mode: a finger dragging the view (overlay pixels) */
  drag: { dx: number; dy: number };
}

/**
 * The game: a level in the meadow, a flock behind the flock contract on a fixed 30 Hz step,
 * Gafoop, and the works the player builds. Rendered at 640×360 through the pixel pipeline,
 * interpolated between steps.
 */
export class Game {
  readonly pr: PixelRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new IsoCamera(W, H);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 0.92);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.5);
  private readonly meadow: LevelObstacles;
  /** the Form being worked on (index into FORMS), and what Gafoop has unlocked */
  formIndex = 0;
  readonly unlocked = new Set<Unlock>();
  /** counters at the Form's arrival, so its goal counts from there */
  private base = { handFleece: 0, yarn: 0 };
  /** fleeces shorn by hand, skeins made unattended, sheep woofed through a gate (by index) */
  private handFleece = 0;
  private unattended = 0;
  private woofed = new Set<number>();
  /** the last time Gafoop did something by hand (bucket, woof, a gate) */
  private handsOn = -99;
  /** the Woof-Woof is sounding, and a bark is due */
  private woofing = false;
  private pendingBark = false;
  /** a job in hand: shearing sheep `i`, or spinning; seconds into it */
  private job: { kind: 'shear' | 'spin'; i: number; t: number } | null = null;
  /** per sheep: last step's position (for counting sheep through gates) */
  private prevX = new Float32Array(0);
  private prevY = new Float32Array(0);
  /** seconds since the valley was last saved */
  private sinceSave = 0;
  /** what the works do: everything built in the valley, fences and the pen included */
  readonly works = new Works();
  private readonly worksView: WorksView;
  private readonly blinkers: THREE.Mesh[];
  private model!: FlockModel;
  private flock!: FlockView;
  private gafoop!: GafoopActor;
  private acc = 0;
  /** seconds since the game started, and the time on the current Form's clock */
  time = 0;
  private clock = 0;
  private started = false;
  /** how far the current goal is along, of how many (shown on the clipboard) */
  private goalCount = 0;
  private goalTotal = 0;
  private floaters: HudState['floaters'] = [];
  /** the current Form's approval card */
  private won: { time: number; at: number; dismissed?: boolean } | null = null;
  private showHelp = false;
  private flockSize = VALLEY.flock;
  private attempt = 1;
  private said = new Set<string>();
  private lastScatterQuip = -99;
  private quipIndex = 0;
  audio: GameAudio | null = null;
  readonly input: GameInput = { pointer: null, bucket: false, feed: false, keys: new Set(), hits: [], wheel: 0, taps: [], drag: { dx: 0, dy: 0 } };
  /** build mode (once unlocked): the pointer places devices; Gafoop waits */
  building = false;
  readonly builder: Builder;
  private showFlow = false;
  private readonly flowField = new FlowField(WORLD.width, WORLD.height);
  /** the meadow's grass: eaten by the flock, regrowing, drawn by `grassView` */
  readonly grass = new GrassField(WORLD.width, WORLD.height);
  private grassBase!: Float32Array;
  private grassView!: GrassView;
  /** seconds of real time, for things that should not speed up with fast-forward (the wind) */
  private wall = 0;
  private readonly tmpFwd = new THREE.Vector3();
  /** simulation speed: 1, 2 or 4 */
  speed = 1;
  /** show on-screen controls (set once the player touches the screen) */
  touch = false;
  /** the screen is taller than wide */
  portrait = false;
  private readonly held = new Set<ButtonId>();
  /** frame-rate readout (F, or click the objective panel); fps and ms come from the main loop */
  showPerf = false;
  readonly perf = { fps: 0, ms: 0, calls: 0, tris: 0 };
  private test: PerfTest | null = null;
  /** main-thread time of the last frame, for the perf test */
  private frameMs = 0;
  private hideHud = false;
  /** called once a frame has been drawn (for tooling) */
  onFrame: (() => void) | null = null;

  /** @param target  a canvas, or the renderer of the menu this game is prepared behind */
  /** `fresh`: ignore any saved valley and start a new one. */
  constructor(target: HTMLCanvasElement | THREE.WebGLRenderer, private readonly fonts: Fonts, opts: { fresh?: boolean } = {}) {
    this.pr = new PixelRenderer(target, W, H);
    this.pr.setPalette(RESURRECT64);
    this.pr.post = { ...this.pr.post, depthAbs: 0.25, depthRel: 0, outline: 0.62, highlight: 0.3, bloom: 1.0, bloomThreshold: 1.3 };
    setToonDefaults();

    const s = this.scene;
    s.background = new THREE.Color(C.skyLight);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
    this.sun.shadow.bias = -0.0008;
    s.add(this.sun, this.sun.target, this.hemi);

    this.meadow = levelObstacles();
    // the grass the flock eats, and the sward that shows it
    this.grass.fill(meadowCap(this.meadow, WORLD.width, WORLD.height));
    this.grassBase = this.grass.cap.slice();
    this.grassView = new GrassView(this.grass);
    s.add(this.grassView.mesh);
    const scenery = buildScenery(this.meadow, this.grassView.groundInfo);
    s.add(scenery.group);
    this.blinkers = scenery.blinkers;
    this.worksView = new WorksView(this.works);
    s.add(this.worksView.root);
    this.builder = new Builder(this.works, () => [], () => this.gateModes());
    const saved = opts.fresh ? null : loadSnapshot();
    if (saved) {
      try {
        this.restore(saved);
      } catch {
        // a save this version cannot read: start over rather than not start at all
        this.newValley();
      }
    } else {
      this.newValley();
    }
  }

  /** The current Form. */
  get form(): FormSpec {
    return FORMS[Math.min(this.formIndex, FORMS.length - 1)];
  }

  private has(u: Unlock): boolean {
    return this.unlocked.has(u);
  }

  private gateModes(): GateMode[] {
    const out: GateMode[] = ['hand'];
    if (this.has('timerGate')) out.push('timer');
    if (this.has('grassGate')) out.push('grass');
    return out;
  }

  /** The tools on the toolbar: what has been unlocked. */
  private tools(): ToolId[] {
    return TOOLS.filter((t) => {
      if (t === 'remove') return this.has('build');
      if (t === 'shed' || t === 'spindle') return this.has('stations');
      return this.has(t as Unlock);
    });
  }

  /** A new valley: the meadow, the flock where it grazes, and Form 8-A on its way. */
  newValley(): void {
    this.works.clear();
    this.unlocked.clear();
    this.handFleece = this.unattended = 0;
    this.woofed.clear();
    this.makeFlock(cluster(this.flockSize, VALLEY.flockAt.x, VALLEY.flockAt.y, this.attempt, 1.3));
    this.grass.cap.set(this.grassBase);
    this.grass.length.set(this.grassBase);
    this.grass.version++;
    this.placeGafoop(VALLEY.gafoopAt);
    this.time = 0;
    this.startForm(0, false);
  }

  /** The flock behind the contract, from where each sheep stands (and how hungry it is). */
  private makeFlock(sheep: { x: number; y: number; heading?: number; hunger?: number }[]): void {
    const n = sheep.length;
    this.flockSize = n;
    if (this.flock) this.scene.remove(this.flock.root);
    this.model = new SheepherdingV1();
    this.model.init({ seed: this.attempt, width: WORLD.width, height: WORLD.height, sheep });
    this.model.setGrass(this.grass);
    this.works.setFlock(n);
    this.prevX = Float32Array.from(this.model.out.x.subarray(0, n));
    this.prevY = Float32Array.from(this.model.out.y.subarray(0, n));
    this.flock = new FlockView(n, this.attempt);
    this.scene.add(this.flock.root);
    this.flock.capture(this.model.out);
    this.grassDevices = '-';
    this.worksVersion = -1;
    this.syncObstacles();
  }

  private placeGafoop(at: Pt): void {
    if (this.gafoop) this.scene.remove(this.gafoop.root, ...this.gafoop.effects);
    this.gafoop = new GafoopActor(at.x, at.y);
    this.scene.add(this.gafoop.root, ...this.gafoop.effects);
    this.cam.jump(new THREE.Vector3(at.x + 4, 0, at.y));
  }

  /** Form `i` arrives: its supply drop, its tools, and its goal counting from now. */
  private startForm(i: number, speak = true): void {
    this.formIndex = Math.min(i, FORMS.length - 1);
    const f = this.form;
    f.drop?.(this.works);
    for (const u of f.grants ?? []) this.unlocked.add(u);
    this.base = { handFleece: this.handFleece, yarn: this.works.yarn };
    this.woofed.clear();
    this.unattended = 0;
    this.goalCount = 0;
    this.won = null;
    this.clock = 0;
    this.said.clear();
    this.building = false;
    this.builder.cancel();
    if (speak && this.started) this.quip('start', 0.6, false);
    this.syncObstacles();
    this.save();
  }

  /** The current Form is done: stamp it, and unlock what it brings. */
  private approve(): void {
    if (this.won) return;
    this.won = { time: this.clock, at: this.time };
    for (const u of this.form.unlocks ?? []) this.unlocked.add(u);
    this.audio?.win();
    this.quip('approved', 0.4, false);
    this.save();
  }

  /** On to the next Form (the approval card's NEXT). */
  private nextForm(): void {
    if (this.formIndex < FORMS.length - 1) this.startForm(this.formIndex + 1);
  }

  /** Everything that persists, for the browser's storage. */
  snapshot(): Snapshot {
    const o = this.model.out;
    const w = this.works;
    const sheep = [];
    for (let i = 0; i < o.count; i++) {
      sheep.push({ x: o.x[i], y: o.y[i], heading: o.heading[i], hunger: o.hunger[i], wool: w.wool[i] ?? 1, pack: w.pack[i] ?? 0 });
    }
    const g = new Uint8Array(this.grass.length.length);
    for (let k = 0; k < g.length; k++) g[k] = Math.round(Math.min(1, this.grass.length[k]) * 255);
    return {
      v: 1,
      form: this.formIndex,
      approved: !!this.won,
      unlocked: [...this.unlocked],
      base: { ...this.base },
      handFleece: this.handFleece,
      unattended: this.unattended,
      woofed: [...this.woofed],
      clock: this.clock,
      time: this.time,
      gafoop: { x: this.gafoop.pos.x, y: this.gafoop.pos.z },
      sheep,
      devices: w.devices.map((d) => JSON.parse(JSON.stringify(d)) as Device),
      gates: [...w.gates].map(([id, st]) => [id, st.open, st.armed]),
      feed: [...w.feed],
      works: { yarn: w.yarn, fleece: w.fleece, shorn: w.shorn, autoYarn: w.autoYarn, stock: { ...w.stock }, clock: w.clock },
      grass: bytesToBase64(g),
    };
  }

  /** Put a saved valley back. */
  restore(s: Snapshot): void {
    const w = this.works;
    w.clear();
    for (const d of s.devices) w.add(d);
    for (const [id, open, armed] of s.gates) {
      const st = w.gates.get(id);
      if (st) { st.open = open; st.armed = armed; }
    }
    for (const [id, f] of s.feed) if (w.feed.has(id)) w.feed.set(id, f);
    Object.assign(w, { yarn: s.works.yarn, fleece: s.works.fleece, shorn: s.works.shorn, autoYarn: s.works.autoYarn });
    w.stock.fleece = s.works.stock.fleece;
    w.stock.yarn = s.works.stock.yarn;
    w.clock = s.works.clock;
    w.version++;
    this.unlocked.clear();
    for (const u of s.unlocked) this.unlocked.add(u);
    this.formIndex = Math.min(s.form, FORMS.length - 1);
    this.base = { ...s.base };
    this.handFleece = s.handFleece;
    this.unattended = s.unattended;
    this.woofed = new Set(s.woofed);
    this.clock = s.clock;
    this.time = s.time;
    const g = base64ToBytes(s.grass);
    if (g.length === this.grass.length.length) for (let k = 0; k < g.length; k++) this.grass.length[k] = g[k] / 255;
    this.grass.version++;
    this.makeFlock(s.sheep.map((p) => ({ x: p.x, y: p.y, heading: p.heading, hunger: p.hunger })));
    s.sheep.forEach((p, i) => {
      w.wool[i] = p.wool;
      w.pack[i] = p.pack;
    });
    this.placeGafoop(s.gafoop);
    this.won = s.approved ? { time: s.clock, at: -99, dismissed: true } : null;
  }

  /** Save the valley now (it also saves itself every little while). */
  save(): void {
    if (!this.model) return;
    this.sinceSave = 0;
    storeSnapshot(this.snapshot());
  }

  /** The cheat row's NEW VALLEY: forget the save and start again. */
  resetValley(): void {
    clearSnapshot();
    this.newValley();
    if (this.started) this.quip('start', 0.6, false);
  }

  /** when NEW VALLEY was tapped once (a second tap soon after starts again) */
  private resetArmed = -99;
  /** when the Woof-Woof last sounded (sheep it set running still count for a moment after) */
  private lastWoof = -99;

  /** The bucket pours into any trough it is held over. */
  private fillTroughs(dt: number): void {
    const p = this.gafoop.pos;
    for (const d of this.works.devices) {
      if (d.kind !== 'trough') continue;
      if (Math.hypot(d.at.x - p.x, d.at.y - p.z) < FILL.reach) this.works.fill(d.id, FILL.rate * dt);
    }
  }

  /** The sheep Gafoop would shear: the nearest woolly one standing within reach. */
  private shearable(): number {
    const o = this.model.out;
    const p = this.gafoop.pos;
    let best = -1;
    let bd = HAND.reach;
    for (let i = 0; i < o.count; i++) {
      if (this.works.wool[i] < WORKS.woolly || o.speed[i] > 0.45) continue;
      const d = Math.hypot(o.x[i] - p.x, o.y[i] - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** Shearing and spinning by hand, while SHEAR (X) or SPIN (C) is held. */
  private handJobs(dt: number, inp: GameInput): void {
    const shear = this.has('shears') && (inp.keys.has('x') || this.held.has('shear'));
    const spin = this.has('spin') && this.works.stock.fleece > 0 && (inp.keys.has('c') || this.held.has('spin'));
    if (shear) {
      const i = this.shearable();
      if (i < 0) {
        this.job = null;
        return;
      }
      if (!this.job || this.job.kind !== 'shear' || this.job.i !== i) this.job = { kind: 'shear', i, t: 0 };
      this.job.t += dt;
      if (this.job.t >= HAND.shear) {
        this.works.wool[i] = 0;
        this.works.stock.fleece++;
        this.handFleece++;
        this.floatAt(this.model.out.x[i], this.model.out.y[i], '+1 FLEECE');
        this.audio?.penned();
        this.job = null;
      }
    } else if (spin) {
      if (!this.job || this.job.kind !== 'spin') this.job = { kind: 'spin', i: -1, t: 0 };
      this.job.t += dt;
      if (this.job.t >= HAND.spin) {
        this.works.stock.fleece--;
        this.works.stock.yarn++;
        this.works.yarn++;
        this.floatAt(this.gafoop.pos.x, this.gafoop.pos.z, '+1 YARN');
        this.audio?.penned();
        this.quip('firstYarn', 0.3);
        this.job = null;
      }
    } else {
      this.job = null;
    }
  }

  private floatAt(x: number, y: number, text: string): void {
    const sp = this.cam.toScreen(new THREE.Vector3(x, 1.4, y));
    this.floaters.push({ text, x: sp.x, y: sp.y, age: 0 });
  }

  /** works.version when the model last had its fences */
  private worksVersion = -1;
  /** the devices the grass was last cleared for (their ids) */
  private grassDevices = '';

  /** Hand the model every fence there is: the meadow's and the works' (gates as they stand). */
  private syncObstacles(): void {
    if (!this.model) return;
    const obs: Obstacle[] = [...allObstacles(this.meadow), ...this.works.obstacles()];
    // race and station floors are bare
    const key = this.works.devices.map((d) => d.id).join(',');
    if (key !== this.grassDevices) {
      coverWithWorks(this.grass, this.grassBase, this.works.devices);
      this.grassDevices = key;
    }
    this.model.setObstacles(obs);
    this.worksVersion = this.works.version;
  }

  /** Compile the shaders ahead of the first frame (see PixelRenderer.warm). */
  async warm(): Promise<void> {
    this.cam.update(0);
    await this.pr.warm(this.scene, this.cam.camera);
  }

  /** Start the clock and the audio (needs a user gesture for the AudioContext). */
  begin(audio: GameAudio | null): void {
    this.audio = audio;
    audio?.startMusic();
    this.started = true;
    this.quip('start', 1.2);
  }

  private quip(kind: keyof typeof QUIPS, delay = 0, once = true): void {
    if (once && this.said.has(kind)) return;
    this.said.add(kind);
    const list = kind === 'start' ? [this.form.opening] : QUIPS[kind];
    const text = list[this.quipIndex++ % list.length];
    this.gafoop.say(text, this.time + delay, kind === 'start' ? 4.2 : 2.8);
  }

  /** The hand gate nearest Gafoop, if one is within reach. */
  private nearGate(): number | null {
    const p = this.gafoop.pos;
    let best: number | null = null;
    let bd = GATE_REACH;
    for (const d of this.works.devices) {
      if (d.kind !== 'gate' || d.mode !== 'hand') continue;
      const dd = Math.hypot((d.a.x + d.b.x) / 2 - p.x, (d.a.y + d.b.y) / 2 - p.z);
      if (dd < bd) { bd = dd; best = d.id; }
    }
    return best;
  }

  private toggleGate(): void {
    const id = this.nearGate();
    if (id === null) return;
    const open = !this.works.gates.get(id)?.open;
    this.works.setGate(id, open);
    this.handsOn = this.time;
    this.syncObstacles();
    this.audio?.gate(open);
    this.quip(open ? 'gateOpen' : 'gateShut', 0, false);
  }

  private stimuli(): Stimulus[] {
    const g = this.gafoop;
    const p = g.pos;
    const out: Stimulus[] = [];
    // harmless, unless the Woof-Woof is sounding
    if (this.woofing) out.push({ id: 1, kind: 'threat', x: p.x, y: p.z, strength: WOOF.strength, radius: WOOF.radius });
    if (g.tool === 'bucket') out.push({ id: 2, kind: 'lure', x: p.x, y: p.z, strength: BUCKET.strength, radius: BUCKET.radius });
    if (this.pendingBark) {
      out.push({ id: 3, kind: 'startle', x: p.x, y: p.z, strength: BARK.strength, radius: BARK.radius });
      this.pendingBark = false;
    }
    return out.concat(this.works.stimuli());
  }

  /** Advance one frame, and draw it unless `draw` is false (tooling fast-forward). */
  frame(dt: number, draw = true): void {
    const t0 = performance.now();
    this.test?.tick(dt, this.frameMs);
    if (this.test && !this.test.draw) draw = false;
    // the first animation frame can arrive stamped before the loop started
    dt = Math.max(0, Math.min(0.1, dt));
    const inp = this.input;
    this.handleKeys(inp);
    // fast-forward runs the world faster; Gafoop and the camera stay at the player's pace
    const sdt = dt * this.speed;
    if (this.started) this.time += sdt;
    if (this.started && !this.won) this.clock += sdt;

    // camera first, so picking uses this frame's view
    const pan = 18 * dt * (ZOOM_PAN[this.cam.zoomIndex] ?? 1);
    if (inp.keys.has('a') || inp.keys.has('arrowleft')) this.cam.pan(-pan, 0);
    if (inp.keys.has('d') || inp.keys.has('arrowright')) this.cam.pan(pan, 0);
    if (inp.keys.has('w') || inp.keys.has('arrowup')) this.cam.pan(0, pan);
    if (inp.keys.has('s') || inp.keys.has('arrowdown')) this.cam.pan(0, -pan);
    if (inp.wheel !== 0) {
      this.cam.zoom(inp.wheel < 0 ? 1 : -1);
      inp.wheel = 0;
    }
    if (inp.drag.dx || inp.drag.dy) {
      // the ground follows the finger
      const ppm = this.cam.pixelsPerMetre;
      this.cam.pan(-inp.drag.dx / ppm, inp.drag.dy / ppm);
      inp.drag.dx = inp.drag.dy = 0;
    }
    this.cam.update(dt);

    // Gafoop goes where the cursor is
    let target: THREE.Vector3 | null = null;
    if (inp.pointer && this.started) {
      target = this.cam.pick((inp.pointer.x / W) * 2 - 1, -((inp.pointer.y / H) * 2 - 1));
    }
    const g = this.gafoop;
    if (this.building) {
      // the pointer is for building now; Gafoop waits where he is
      this.builder.hover = target ? { x: target.x, y: target.z } : null;
      for (const t of inp.taps) {
        const w = this.cam.pick((t.x / W) * 2 - 1, -((t.y / H) * 2 - 1));
        if (w) this.builder.click({ x: w.x, y: w.z });
      }
      target = null;
    }
    inp.taps.length = 0;
    if (this.works.version !== this.worksVersion) this.syncObstacles();
    g.tool = this.started && !this.building && (inp.bucket || inp.feed) ? 'bucket' : 'idle';
    if (g.tool === 'bucket') {
      this.audio?.rattle();
      this.quip('bucket');
      this.handsOn = this.time;
      this.fillTroughs(dt);
    }
    // the Woof-Woof: held down, it sounds; each press starts with a bark
    const woof = this.started && !this.building && this.has('woof') && (inp.keys.has(' ') || this.held.has('woof'));
    if (woof && !this.woofing) {
      this.pendingBark = true;
      this.audio?.megaphone();
      this.gafoop.megaphone(this.time);
      if (Math.random() < 0.35) this.quip('woof', 0, false);
    }
    this.woofing = woof;
    if (woof) {
      this.handsOn = this.time;
      this.lastWoof = this.time;
    }
    if (this.started && !this.building) this.handJobs(dt, inp);
    else this.job = null;
    g.update(target, dt, this.time, { w: WORLD.width, h: WORLD.height });
    if (this.started && !this.building) this.cam.follow(this.framing(), 0.16);

    // fixed-step simulation
    if (this.started) {
      this.acc += sdt;
      const step = this.model.dt;
      while (this.acc >= step) {
        this.flock.capture(this.model.out);
        this.model.step(this.stimuli());
        this.grass.grow(step);
        this.acc -= step;
        this.works.updateWoolRate(this.model.out, step);
        this.works.update(this.model.out, step, this.grass);
        if (this.works.version !== this.worksVersion) this.syncObstacles();
        this.flowField.sample(this.model.out, step);
        this.afterStep();
      }
    }
    this.flock.update(this.model.out, this.started ? this.acc / this.model.dt : 1, this.time, sdt, g.pos, this.works);
    this.worksView.update(sdt, this.time);
    this.wall += dt;
    this.sinceSave += dt;
    if (this.started && this.sinceSave > 20) this.save();
    const fwd = this.cam.camera.getWorldDirection(this.tmpFwd);
    this.grassView.fitTo(this.cam.pixelsPerMetre, this.cam.pitch, fwd.x, fwd.z);
    this.grassView.update(dt, this.wall);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.2);
    this.playBleats();
    for (const [i, b] of this.blinkers.entries()) b.visible = Math.floor(this.time * 1.5 + i * 0.5) % 2 === 0;

    // keep the shadow map on what the camera sees
    const t = this.cam.target;
    this.sun.position.set(t.x - 22, 40, t.z + 14);
    this.sun.target.position.set(t.x, 0, t.z);

    if (draw) {
      this.drawOverlay(dt);
      const info = this.pr.renderer.info;
      info.autoReset = false;
      info.reset();
      this.pr.render(this.scene, this.cam.camera);
      this.perf.calls = info.render.calls;
      this.perf.tris = info.render.triangles;
    }
    inp.hits.length = 0;
    this.onFrame?.();
    this.frameMs = performance.now() - t0;
  }

  /**
   * Measure the frame rate with the expensive parts of a frame turned off one at a time, and
   * show the results (see perfTest.ts). Takes half a minute.
   */
  startPerfTest(): void {
    if (this.test && !this.test.done) return;
    const pr = this.pr;
    const post = { ...pr.post };
    // the grass and flowers: scattered instances that cast no shadow
    const grass: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && !o.castShadow) grass.push(o);
    });
    let scale = pr.scale;
    const off: Record<string, (on: boolean) => void> = {
      'no shadow pass': (on) => (pr.skip.shadows = on),
      'no outline pass': (on) => (pr.skip.outline = on),
      'no bloom': (on) => (pr.post.bloom = on ? 0 : post.bloom),
      'no palette': (on) => (pr.post.quantize = on ? 0 : post.quantize),
      'no HUD': (on) => (this.hideHud = on),
      'no grass': (on) => grass.forEach((g) => (g.visible = !on)),
      'screen at 1x': (on) => {
        // the low-res picture stretched by the browser instead of by the screen pass
        if (on) scale = pr.scale;
        pr.scale = on ? 1 : scale;
        pr.renderer.setSize(W * pr.scale, H * pr.scale, false);
      },
    };
    const variants: Variant[] = [
      { name: 'everything on' },
      ...Object.entries(off).map(([name, apply]) => ({ name, apply })),
      { name: 'all of those off', apply: (on) => Object.values(off).forEach((f) => f(on)) },
      { name: 'nothing drawn', draw: false },
    ];
    const gl = pr.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const c = pr.renderer.domElement;
    const device = [
      navigator.userAgent.replace(/^Mozilla\/5\.0 |AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) /g, ''),
      `GPU: ${gpu}`,
      `SCREEN ${innerWidth}x${innerHeight} AT ${devicePixelRatio}X · CANVAS ${c.width}x${c.height}`,
      `${this.flockSize} SHEEP · ${Math.round(this.perf.tris / 1000)}K TRIS · ${this.perf.calls} DRAW CALLS`,
    ];
    this.test = new PerfTest(variants, device);
  }

  /**
   * What the camera keeps in view: Gafoop and the sheep he is working. Following Gafoop
   * alone leaves a driven flock at the edge of the screen, ahead of him.
   */
  private framing(): THREE.Vector3 {
    const o = this.model.out;
    const p = this.gafoop.pos;
    let x = 0;
    let z = 0;
    let n = 0;
    for (let i = 0; i < o.count; i++) {
      if (Math.hypot(o.x[i] - p.x, o.y[i] - p.z) < 16) { x += o.x[i]; z += o.y[i]; n++; }
    }
    const out = p.clone();
    if (n > 0) {
      const toward = new THREE.Vector3(x / n, 0, z / n).sub(p);
      if (toward.length() > 12) toward.setLength(12);
      out.addScaledVector(toward, 0.75);
    }
    // near what the Form is about (the pen, the works), bring it into the picture too
    const f = this.focus();
    if (!f) return out;
    const at = new THREE.Vector3(f.at.x, 0, f.at.y);
    const d = at.distanceTo(p);
    const k = Math.max(0, Math.min(1, (26 - d) / 12)) * 0.45;
    return out.lerp(at, k);
  }

  /** What the current Form is about, for the camera and the pointer: the pen, or the works. */
  private focus(): { at: Pt; label: string } | null {
    const g = this.form.goal.kind;
    if (g === 'pen') {
      const P = VALLEY.pen;
      return { at: { x: (P.x0 + P.x1) / 2, y: (P.y0 + P.y1) / 2 }, label: 'PEN' };
    }
    if (g === 'yarn' || g === 'unattended') {
      const st = this.works.stations[0]?.device.at;
      if (st) return { at: st, label: 'WORKS' };
    }
    return null;
  }

  /** Which on-screen button, if any, is at this overlay position. */
  buttonAt(x: number, y: number): ButtonId | null {
    if (!this.started) return null;
    return buttonAt(hudButtons(this.layout()), x, y);
  }

  /** What the HUD's layout depends on right now. */
  private layout(): HudLayout {
    const won = this.won && !this.won.dismissed ? { age: this.time - this.won.at, buttons: this.wonButtons() } : null;
    const free = this.started && !this.building;
    return {
      touch: this.touch,
      won,
      perf: this.showPerf,
      can: {
        build: this.has('build'),
        woof: this.has('woof'),
        gate: free && this.nearGate() !== null,
        shear: free && this.has('shears') && (this.job?.kind === 'shear' || this.shearable() >= 0),
        spin: free && this.has('spin') && this.works.stock.fleece > 0,
        solve: this.form.solve !== 'none',
      },
      tools: this.tools(),
      build: this.building ? { tool: this.builder.tool, drawing: this.builder.drawing, turns: this.builder.turns } : null,
    };
  }

  private wonButtons(): ButtonId[] {
    return this.formIndex < FORMS.length - 1 ? ['next', 'keep'] : ['keep'];
  }

  /** A button pressed: it does what its key does. FEED acts while held. */
  buttonDown(id: ButtonId): void {
    const inp = this.input;
    this.held.add(id);
    switch (id) {
      case 'feed': inp.feed = true; break;
      case 'gate': inp.hits.push('g'); break;
      case 'woof':
      case 'shear':
      case 'spin':
        // held: the frame reads them from `held`
        break;
      case 'reset': inp.hits.push('reset'); break;
      case 'rotL': inp.hits.push('q'); break;
      case 'rotR': inp.hits.push('e'); break;
      case 'zoomIn': inp.wheel -= 1; break;
      case 'zoomOut': inp.wheel += 1; break;
      case 'perf': inp.hits.push('f'); break;
      case 'perfTest': inp.hits.push('p'); break;
      case 'skip': inp.hits.push(']'); break;
      case 'solve': inp.hits.push('\\'); break;
      case 'next': inp.hits.push('l'); break;
      case 'keep': inp.hits.push('k'); break;
      case 'build': inp.hits.push('b'); break;
      case 'flow': inp.hits.push('o'); break;
      case 'speed': inp.hits.push('t'); break;
      case 'finish': inp.hits.push('enter'); break;
      case 'cancel': inp.hits.push('escape'); break;
      case 'rotate': inp.hits.push('r'); break;
      default:
        if (id.startsWith('tool:')) this.builder.setTool(id.slice(5) as ToolId);
    }
  }

  buttonUp(id: ButtonId): void {
    this.held.delete(id);
    if (id === 'feed') this.input.feed = false;
  }

  private handleKeys(inp: GameInput): void {
    for (const k of inp.hits) {
      if (k === 'q') this.cam.rotate(-1);
      if (k === 'e') this.cam.rotate(1);
      if (k === 'h') this.showHelp = !this.showHelp;
      if (k === 'f') this.showPerf = !this.showPerf;
      if (k === 'p') this.startPerfTest();
      if (!this.started) continue;
      // the cheats: this Form done (or, once done, the next one), its reference setup built, a
      // new valley
      if (k === ']') {
        if (this.won) this.nextForm();
        else this.approve();
        continue;
      }
      if (k === '\\') {
        this.solve();
        continue;
      }
      if (k === 'reset') {
        // it throws the valley away, so it takes a second tap
        if (this.time - this.resetArmed < 3) {
          this.resetArmed = -99;
          this.resetValley();
        } else {
          this.resetArmed = this.time;
          this.gafoop.say('A new valley? Everything goes. Tap NEW VALLEY again to start over.', this.time, 3);
        }
        continue;
      }
      const card = this.won && !this.won.dismissed;
      if (card) {
        if (k === 'l' || k === 'enter') this.nextForm();
        if (k === 'k' || k === 'escape') this.won = { ...this.won!, dismissed: true };
        continue;
      }
      if (k === 't') this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
      if (this.has('build')) {
        if (k === 'b') {
          this.building = !this.building;
          this.builder.cancel();
          if (this.building && !this.tools().includes(this.builder.tool)) this.builder.setTool(this.tools()[0]);
        }
        if (k === 'o') this.showFlow = !this.showFlow;
      }
      if (this.building) {
        const tools = this.tools();
        const n = '123456789'.indexOf(k);
        if (n >= 0 && n < tools.length) this.builder.setTool(tools[n]);
        if (k === 'x' || k === 'delete' || k === 'backspace') this.builder.setTool('remove');
        if (k === 'r') this.builder.rotate();
        if (k === 'enter') this.builder.finish();
        if (k === 'escape') {
          if (this.builder.drawing) this.builder.cancel();
          else this.building = false;
        }
        continue;
      }
      if (k === 'g') this.toggleGate();
    }
  }

  /** The SOLVE cheat: whatever the current Form needs, done or built. */
  private solve(): void {
    const how = this.form.solve;
    if (how === 'pen') {
      // the flock in the pen, its gate shut
      const P = VALLEY.pen;
      this.moveFlock((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 1.0);
      for (const d of this.works.devices) if (d.kind === 'gate' && this.onPen(d)) this.works.setGate(d.id, false);
    } else if (how === 'fleece') {
      const o = this.model.out;
      let n = 0;
      for (let i = 0; i < o.count && n < 10; i++) {
        if (this.works.wool[i] < WORKS.woolly) continue;
        this.works.wool[i] = 0;
        this.works.stock.fleece++;
        this.handFleece++;
        n++;
      }
    } else if (how === 'rotation') {
      // the stations where the Bureau dropped them, two paddocks round them, the flock in one
      const has = (k: string) => this.works.devices.some((d) => d.kind === k);
      if (!has('shed') || !has('spindle')) {
        for (const d of [...this.works.devices]) if (d.kind === 'shed' || d.kind === 'spindle') this.works.remove(d.id);
        this.works.add({ kind: 'shed', at: VALLEY.shed, dir: 0 });
        this.works.add({ kind: 'spindle', at: VALLEY.spindle, dir: 2 });
      }
      const A = VALLEY.paddockA;
      const B = VALLEY.paddockB;
      // clear anything in the way, then fence
      for (const d of [...this.works.devices]) {
        if (d.kind === 'shed' || d.kind === 'spindle') continue;
        const c = d.kind === 'hurdle' || d.kind === 'gate' ? { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 } : 'at' in d ? d.at : null;
        if (c && c.x >= A.x0 - 0.5 && c.x <= B.x1 + 0.5 && c.y >= A.y0 - 0.5 && c.y <= A.y1 + 0.5) this.works.remove(d.id);
      }
      buildRotation(this.works);
      this.moveFlock((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, 1.3);
    } else if (how === 'woofed') {
      const g = this.form.goal;
      if (g.kind === 'woofed') for (let i = 0; i < g.n && i < this.flockSize; i++) this.woofed.add(i);
    }
    this.building = false;
    this.builder.cancel();
    this.syncObstacles();
    this.gafoop.say('Blueprints from the Bureau. Nobody tell the Auditor.', this.time, 3);
  }

  /** Is this gate in the side of the valley's pen? */
  private onPen(d: { a: Pt; b: Pt }): boolean {
    const P = VALLEY.pen;
    const on = (p: Pt) => (Math.abs(p.x - P.x0) < 0.4 || Math.abs(p.x - P.x1) < 0.4 || Math.abs(p.y - P.y0) < 0.4 || Math.abs(p.y - P.y1) < 0.4)
      && p.x > P.x0 - 0.5 && p.x < P.x1 + 0.5 && p.y > P.y0 - 0.5 && p.y < P.y1 + 0.5;
    return on(d.a) && on(d.b);
  }

  /** The cheats' teleport: the whole flock, as it is, regrouped round (x, y). */
  private moveFlock(x: number, y: number, spread: number): void {
    const o = this.model.out;
    const wool = this.works.wool.slice();
    const pack = this.works.pack.slice();
    const hunger = o.hunger.slice(0, o.count);
    const at = cluster(o.count, x, y, this.attempt, spread).map((p, i) => ({ ...p, hunger: hunger[i] }));
    this.makeFlock(at);
    this.works.wool.set(wool.subarray(0, this.works.wool.length));
    this.works.pack.set(pack.subarray(0, this.works.pack.length));
  }

  private afterStep(): void {
    const o = this.model.out;
    const handsOff = this.time - this.handsOn >= HANDS_OFF;
    for (const e of this.works.events) {
      if (e.kind !== 'yarn') continue;
      this.floatAt(e.at.x, e.at.y, '+1 YARN');
      this.audio?.penned();
      this.quip('firstYarn', 0.3);
      // made by a spindle hut while nobody was herding
      if (handsOff) this.unattended++;
    }
    // sheep the Woof-Woof sends through an open gate (counted for a moment after it stops,
    // while they are still running)
    if (this.time - this.lastWoof < 3 && this.prevX.length === o.count) {
      for (const d of this.works.devices) {
        if (d.kind !== 'gate' || !this.works.gates.get(d.id)?.open) continue;
        for (let i = 0; i < o.count; i++) {
          if (this.woofed.has(i) || !crosses(d.a, d.b, this.prevX[i], this.prevY[i], o.x[i], o.y[i])) continue;
          this.woofed.add(i);
          this.floatAt(o.x[i], o.y[i], '+1');
        }
      }
    }
    if (this.prevX.length !== o.count) {
      this.prevX = new Float32Array(o.count);
      this.prevY = new Float32Array(o.count);
    }
    this.prevX.set(o.x.subarray(0, o.count));
    this.prevY.set(o.y.subarray(0, o.count));
    let running = 0;
    for (let i = 0; i < o.count; i++) if (o.state[i] === SheepState.Run) running++;
    if (running > o.count * 0.4 && this.time - this.lastScatterQuip > 12 && this.time - this.lastWoof > 3) {
      this.lastScatterQuip = this.time;
      const list = QUIPS.scatter;
      this.gafoop.say(list[this.quipIndex++ % list.length], this.time, 2.4);
    }
    // how far along the Form's goal is
    const g = this.form.goal;
    let count = 0;
    let total = 0;
    let done = false;
    switch (g.kind) {
      case 'pen': {
        const P = VALLEY.pen;
        for (let i = 0; i < o.count; i++) if (inRect(P, o.x[i], o.y[i])) count++;
        total = o.count;
        const shut = this.works.devices.every((d) => d.kind !== 'gate' || !this.onPen(d) || !this.works.gates.get(d.id)?.open);
        done = count === total && shut;
        break;
      }
      case 'fleece':
        count = this.handFleece - this.base.handFleece;
        total = g.n;
        break;
      case 'yarn':
        count = this.works.yarn - this.base.yarn;
        total = g.n;
        break;
      case 'woofed':
        count = this.woofed.size;
        total = g.n;
        break;
      case 'unattended':
        count = this.unattended;
        total = g.n;
        break;
      case 'none':
        break;
    }
    if (g.kind !== 'pen' && g.kind !== 'none') done = count >= total;
    this.goalCount = Math.min(count, total);
    this.goalTotal = total;
    if (!this.won && done) this.approve();
  }

  private playBleats(): void {
    if (!this.audio) return;
    const o = this.model.out;
    for (const i of this.flock.bleats) {
      const p = this.flock.position(i);
      const sp = this.cam.toScreen(p);
      const onScreen = sp.x > -40 && sp.x < W + 40 && sp.y > -40 && sp.y < H + 40;
      if (!onScreen) continue;
      const pan = (sp.x / W) * 2 - 1;
      const d = Math.hypot(sp.x - W / 2, sp.y - H / 2) / W;
      this.audio.bleat(pan, Math.max(0, 1 - d), 0.9 + ((i * 37) % 10) * 0.04, o.state[i] === SheepState.Run);
    }
  }

  private drawOverlay(dt: number): void {
    const g = this.pr.clearOverlay();
    // nothing marked, nothing uploaded
    if (this.hideHud) return;
    this.pr.markOverlay();
    void dt;

    const gp = this.gafoop;
    let bubble: HudState['bubble'] = null;
    if (gp.line && this.time >= gp.lineFrom && this.time < gp.lineUntil) {
      const sp = this.cam.toScreen(gp.pos.clone().setY(2.6));
      const feet = this.cam.toScreen(gp.pos.clone().setY(0));
      bubble = { text: gp.line, x: sp.x, y: sp.y, under: feet.y };
    }
    // the flow overlay and the build preview sit under the HUD's panels
    const toScreen = (x: number, y: number, h = 0) => this.cam.toScreen(new THREE.Vector3(x, h, y));
    if (this.started && this.showFlow) this.flowField.draw(g, this.fonts, toScreen, this.works, W, H);
    if (this.started && this.building) this.drawGhost(g, toScreen);
    // a pointer to what the Form is about (the pen, the works) when it is off screen
    let penArrow: HudState['penArrow'] = null;
    const focus = this.focus();
    const pc = focus ? this.cam.toScreen(new THREE.Vector3(focus.at.x, 0, focus.at.y)) : new THREE.Vector2(W / 2, H / 2);
    if (focus && !this.building && (pc.x < 0 || pc.x > W || pc.y < 0 || pc.y > H)) {
      const dx = pc.x - W / 2;
      const dy = pc.y - H / 2;
      // keep clear of the touch buttons along the bottom
      const below = dy > 0 && this.touch ? 80 : 30;
      const k = Math.min((W / 2 - 24) / Math.abs(dx || 1e-6), (H / 2 - below) / Math.abs(dy || 1e-6));
      penArrow = { x: W / 2 + dx * k, y: H / 2 + dy * k, angle: Math.atan2(dy, dx), label: focus.label };
    }
    const layout = this.layout();
    const f = this.form;
    const gl = goalLabel(f.goal);
    const gate = this.nearGate();
    const state: HudState = {
      layout,
      objective: {
        title: `FORM ${f.code} - ${f.title}`,
        count: this.goalCount,
        total: this.goalTotal,
        label: gl.label,
        icon: gl.icon,
      },
      time: this.won ? this.won.time : this.clock,
      gateNear: gate === null ? null : !!this.works.gates.get(gate)?.open,
      stock: this.works.stock,
      woofing: this.woofing,
      handJob: this.job ? { kind: this.job.kind, progress: Math.min(1, this.job.t / (this.job.kind === 'shear' ? HAND.shear : HAND.spin)) } : null,
      speed: this.speed,
      flowOn: this.showFlow,
      buildHint: this.building ? this.builder.hint(this.touch) : null,
      playing: this.time,
      showHelp: this.showHelp,
      bubble,
      penArrow,
      floaters: this.floaters,
      cursor: this.input.pointer && this.started ? { ...this.input.pointer, tool: gp.tool } : null,
      won: layout.won && this.won
        ? { time: this.won.time, age: layout.won.age, lines: [f.verdict[0].replace('{n}', String(this.goalTotal)), f.verdict[1]], code: f.code }
        : null,
      touch: this.touch,
      feeding: gp.tool === 'bucket',
      held: this.held,
      portrait: this.portrait,
      perf: this.showPerf ? this.perf : null,
    };
    if (this.started) drawHud(g, this.fonts, state);
  }

  /** The build preview: where the next race or device would go. */
  private drawGhost(g: CanvasRenderingContext2D, toScreen: (x: number, y: number, h?: number) => THREE.Vector2): void {
    const gh = this.builder.ghost();
    if (!gh) return;
    const sp = (p: Pt) => toScreen(p.x, p.y, 0.05);
    for (const m of gh.marks) {
      const a = sp(m);
      g.fillStyle = C.black;
      g.fillRect(Math.round(a.x) - 2, Math.round(a.y) - 2, 5, 5);
      g.fillStyle = C.lime;
      g.fillRect(Math.round(a.x) - 1, Math.round(a.y) - 1, 3, 3);
    }
    for (const line of gh.lines) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = sp(line[i]);
        const b = sp(line[i + 1]);
        pixelLine(g, a.x, a.y + 1, b.x, b.y + 1, C.black);
        pixelLine(g, a.x, a.y, b.x, b.y, gh.colour);
      }
    }
    for (const [from, to] of gh.arrows) {
      const a = sp(from);
      const b = sp(to);
      pixelLine(g, a.x, a.y, b.x, b.y, gh.colour, 2);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      pixelLine(g, b.x, b.y, b.x - ux * 5 - uy * 4, b.y - uy * 5 + ux * 4, gh.colour);
      pixelLine(g, b.x, b.y, b.x - ux * 5 + uy * 4, b.y - uy * 5 - ux * 4, gh.colour);
    }
    if (gh.label) {
      const a = toScreen(gh.label.at.x, gh.label.at.y, 1.8);
      this.fonts.small.draw(g, gh.label.text, Math.round(a.x), Math.round(a.y) - 10, { color: gh.colour, align: 'center', outline: C.black });
    }
  }

  /** For tooling: the model's outputs and Gafoop's position. */
  debug(): { gafoop: { x: number; y: number }; form: string; count: number; total: number; won: boolean; time: number } {
    return { gafoop: { x: this.gafoop.pos.x, y: this.gafoop.pos.z }, form: this.form.code, count: this.goalCount, total: this.goalTotal, won: !!this.won, time: this.clock };
  }
}

/** Does the step p0→p1 cross the segment a–b? */
function crosses(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): boolean {
  const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = side(a.x, a.y, b.x, b.y, x0, y0);
  const d2 = side(a.x, a.y, b.x, b.y, x1, y1);
  if ((d1 > 0) === (d2 > 0)) return false;
  const d3 = side(x0, y0, x1, y1, a.x, a.y);
  const d4 = side(x0, y0, x1, y1, b.x, b.y);
  return (d3 > 0) !== (d4 > 0);
}

/** Panning is faster when zoomed out. */
const ZOOM_PAN = [1.8, 1.4, 1, 0.75];
