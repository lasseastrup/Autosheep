import * as THREE from 'three';
import { PixelRenderer } from '../engine/pixelRenderer';
import { RESURRECT64, C } from '../engine/palette';
import { setToonDefaults } from '../engine/toon';
import type { Fonts } from '../engine/bitmapFont';
import { PuffSystem } from '../art/fx';
import { GrassView } from '../art/grass';
import { GrassField } from '../sim/grass';
import { SheepState } from '../sim/contract';
import { IsoCamera } from '../game/camera';
import { FlockView, type FlockExtras } from '../game/flockView';
import { GafoopActor } from '../game/gafoopActor';
import { buildScenery } from '../game/level';
import { Bot } from './bot';
import { DEFAULT_OPTIONS, FIELD, RUN, xpToNext, type RunOptions } from './config';
import { meadowField, type RunField } from './field';
import { ITEMS, STATS, type ItemId, type ItemKind } from './items';
import { KIND, Phase } from './enemies';
import { Run, Sheep, type RunEvent } from './run';
import type { RunAudio } from './runAudio';
import { buttonAt, drawRunHud, H, runButtons, W, type Fx, type RunButton, type RunHudState, type RunLayout, type Screen } from './runHud';
import { BoothView, CabinetView, CollieView, DecoyView, DroneView, GearView, GloopView, HurdleView, LickView, PickupView, PlaneView, SaucerView } from './runViews';

const OPTIONS_KEY = 'autosheep.survivors.options';

/** What Gafoop says, the first time each thing happens. */
const BARKS: Record<string, string[]> = {
  start: ['Right, troops! Nobody... touches... my sheep!'],
  gloop: ['Goo. Hostile goo. Stand back, I have a stamp.'],
  grab: ['Unhand that sheep! It is protected property!'],
  carried: ['They are carrying it off! Get it back before the wall!'],
  saucer: ['A saucer! Shoot it down before that red ring closes!'],
  elite: ['That is a very large Gloop.'],
  lost: ['Gone. To a very nice farm, apparently.', 'Another one for Zorblax 9. Blast.'],
  claim: ['Strays! Welcome to the flock. Stay close.'],
  booth: ['Next! The Bureau shears in single file.'],
  woolly: ['Look at all that wool. Herd them into a shearing booth!'],
  strays: ['More strays out there. Somebody fetch them. Me. I mean me.'],
  ko: ['I am fine. I am resting my eyes. On purpose.'],
  level: ['A supply drop! Blorp, you beautiful bureaucrat.'],
  halfway: ['Halfway. The Bureau is famously punctual.'],
  final: ['One minute to the hearing! Hold on to them!'],
  scatter: ['Stop panicking! I am a very calm alien!', 'No, no, the OTHER way!'],
  // the first time each item comes
  // usables: {HOLD} and {PRESS} say how, on a keyboard or on a phone
  'got:bucket': ['A feed bucket! {HOLD} and they come running.'],
  'got:whistle': ['A dog whistle! {PRESS} to blow it. Dogs love these, I am told.'],
  'got:woof': ['The Woof-Woof 3000! {PRESS} to bark. I am a dog now.'],
  'got:lick': ['Salt licks! {PRESS} to drop one. They go mad for them.'],
  'got:decoys': ['Inflatable sheep! {PRESS} to drop one. Practically indistinguishable.'],
  'got:hurdle': ['A portable hurdle! {PRESS} to put it down across my path.'],
  'got:beam': ['Blorp, beam me up a sheep! {PRESS} to beam a taken one home.'],
  'got:collie': ['A clockwork collie! Good boy. Good brass boy.'],
  'got:drone': ['A Bureau shearing drone. Licensed and everything.'],
  'got:planes': ['Paper planes! Form 77-B, folded for speed.'],
  'got:tape': ['Red tape. Nothing gets through red tape.'],
  'got:punch': ['A hole punch. For the big ones.'],
  'got:cabinet': ['Blorp! Drop the cabinets!'],
  'got:rams': ['Horns! Go on, lads. Butt them.'],
  'got:tags': ['Ear tags, with a little something extra.'],
  'got:flak': ['Exploding fleece. Do not ask where the Bureau got it.'],
  'got:lambs': ['Lambing season! More troops.'],
};


export interface RunGameInput {
  keys: Set<string>;
  /** keys pressed since the last frame */
  hits: string[];
  wheel: number;
  /** the mouse, in overlay pixels (Gafoop flies toward it); null off the canvas or on touch */
  pointer: { x: number; y: number } | null;
  /** a mouse button is held: the bucket */
  mouseUse: boolean;
  /** a thumb steering: where it went down and where it is now (overlay pixels) */
  stick: { ox: number; oy: number; x: number; y: number } | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The survivors prototype's screen (S0): a run in the meadow (src/run/run.ts) drawn through
 * the pixel pipeline, with its HUD, level-up cards, title, pause and results screens. Shaped
 * like the valley's Game, so the entry point (main.ts) can host either.
 */
export class RunGame {
  readonly pr: PixelRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new IsoCamera(W, H);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 0.92);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.5);
  private readonly field: RunField;
  private readonly grass: GrassField;
  private readonly grassView: GrassView;
  private readonly blinkers: THREE.Mesh[];
  private readonly flock: FlockView;
  private readonly gafoop: GafoopActor;
  private readonly gloops: GloopView;
  private readonly saucers: SaucerView;
  private readonly pickups: PickupView;
  private readonly gear: GearView;
  private readonly boothView: BoothView;
  private readonly planeView: PlaneView;
  private readonly cabinetView: CabinetView;
  private readonly decoyView: DecoyView;
  private readonly lickView: LickView;
  private readonly collieView: CollieView;
  private readonly droneView: DroneView;
  private readonly hurdleView: HurdleView;
  private readonly puffs = new PuffSystem(600);
  run!: Run;
  screen: Screen = 'title';
  options: RunOptions;
  audio: RunAudio | null = null;
  readonly input: RunGameInput = { keys: new Set(), hits: [], wheel: 0, pointer: null, mouseUse: false, stick: null };
  readonly held = new Set<RunButton>();
  /** show on-screen controls (set once the player touches the screen) */
  touch = false;
  portrait = false;
  showPerf = false;
  readonly perf = { fps: 0, ms: 0, calls: 0, tris: 0 };
  /** the valley's Game builds; this never does (main.ts asks) */
  readonly building = false;
  /** called once a frame has been drawn (for tooling) */
  onFrame: (() => void) | null = null;
  /** tooling: the run harness's bot flies Gafoop and takes the cards (screenshots, demos) */
  autopilot = false;
  private bot: Bot | null = null;
  private extras!: FlockExtras;
  private fx: Fx[] = [];
  private floaters: RunHudState['floaters'] = [];
  private acc = 0;
  /** seconds of real time, and of play in this run */
  private wall = 0;
  private playing = 0;
  private overAt = 0;
  private seed = 1;
  private said = new Set<string>();
  private quip = 0;
  private lastScatter = -99;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();

  /** @param target  a canvas, or the renderer of the menu this game is prepared behind */
  constructor(target: HTMLCanvasElement | THREE.WebGLRenderer, private readonly fonts: Fonts) {
    this.pr = new PixelRenderer(target, W, H);
    this.pr.setPalette(RESURRECT64);
    this.pr.post = { ...this.pr.post, depthAbs: 0.25, depthRel: 0, outline: 0.62, highlight: 0.3, bloom: 1.0, bloomThreshold: 1.3 };
    setToonDefaults();
    const s = this.scene;
    s.background = new THREE.Color(C.skyLight);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 180 });
    this.sun.shadow.bias = -0.0008;
    s.add(this.sun, this.sun.target, this.hemi);

    this.field = meadowField();
    this.grass = new GrassField(FIELD.width, FIELD.height);
    this.grass.fill(this.field.cap);
    this.grassView = new GrassView(this.grass);
    s.add(this.grassView.mesh);
    const scenery = buildScenery(this.field.level, this.grassView.groundInfo);
    s.add(scenery.group);
    this.blinkers = scenery.blinkers;

    this.flock = new FlockView(RUN.capacity, 1);
    s.add(this.flock.root);
    this.gafoop = new GafoopActor(RUN.gafoopStart.x, RUN.gafoopStart.y);
    s.add(this.gafoop.root, ...this.gafoop.effects);
    this.gloops = new GloopView(360);
    this.saucers = new SaucerView(4);
    this.pickups = new PickupView(400);
    this.gear = new GearView(160, RUN.capacity);
    this.boothView = new BoothView(this.field.booths);
    this.planeView = new PlaneView(64);
    this.cabinetView = new CabinetView(8);
    this.decoyView = new DecoyView(6);
    this.lickView = new LickView(2);
    this.collieView = new CollieView(2);
    this.droneView = new DroneView(2);
    this.hurdleView = new HurdleView(2);
    s.add(this.boothView.root, this.gloops.root, this.saucers.root, this.pickups.root, this.gear.root, this.puffs.mesh);
    s.add(this.planeView.root, this.cabinetView.root, this.decoyView.root, this.lickView.root, this.collieView.root, this.droneView.root, this.hurdleView.root);

    this.options = loadOptions();
    this.cam.zoomIndex = 1;
    this.newRun();
  }

  /** A fresh run with the current test settings, ready to start. */
  newRun(): void {
    this.seed = (this.seed * 1103 + Math.floor(performance.now())) % 65521 || 7;
    this.run = new Run(this.field, { seed: this.seed, options: this.options, grass: this.grass });
    this.bot = null;
    const n = RUN.capacity;
    this.extras = { wool: this.run.wool, lift: this.run.lift, hidden: new Uint8Array(n), tilt: new Float32Array(n) };
    this.fx = [];
    this.floaters = [];
    this.acc = 0;
    this.playing = 0;
    this.overAt = 0;
    this.said.clear();
    this.puffs.clear();
    this.flock.capture(this.run.model.out);
    const g = this.run.gafoop;
    this.gafoop.place(g.x, g.y, 0, 0, 0, this.wall);
    this.gafoop.line = '';
    this.cam.jump(new THREE.Vector3(RUN.start.x - 2, 0, RUN.start.y));
  }

  /** Compile the shaders ahead of the first frame (see PixelRenderer.warm). */
  async warm(): Promise<void> {
    this.cam.update(0);
    // the saucers are hidden until one comes: show them while compiling, or the first one stutters
    const hidden: THREE.Object3D[] = [];
    this.saucers.root.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    await this.pr.warm(this.scene, this.cam.camera);
    for (const o of hidden) o.visible = false;
  }

  /** The audio is ready (it needs a user gesture); the title waits for START. */
  begin(audio: RunAudio | null): void {
    this.audio = audio;
    audio?.startMusic();
  }

  /** The page is being put away: pause a run in play, and keep the settings. */
  save(): void {
    if (this.screen === 'play' && !this.run.over) this.screen = 'paused';
    storeOptions(this.options);
  }

  private start(): void {
    if (this.screen === 'over' || this.run.time > 0) this.newRun();
    this.screen = 'play';
    this.say('start', 0.6);
  }

  // ------------------------------------------------------------------ the frame

  frame(dt: number, draw = true): void {
    dt = Math.max(0, Math.min(0.1, dt));
    this.wall += dt;
    this.handleKeys();
    const run = this.run;
    if (this.autopilot && this.screen === 'play' && !run.over) (this.bot ??= new Bot(run)).drive();
    if (this.screen === 'play' && !run.paused) {
      if (!this.autopilot) this.steer();
      run.viewCentre.x = this.cam.target.x;
      run.viewCentre.y = this.cam.target.z;
      run.spawnRadius = this.spawnRadius();
      this.acc += dt;
      let n = 0;
      while (this.acc >= run.dt && n < 4) {
        this.flock.capture(run.model.out);
        run.step();
        this.acc -= run.dt;
        n++;
        if (run.paused) {
          this.acc = 0;
          break;
        }
      }
      // a frame that took far too long: let the time go rather than spiral
      if (n === 4) this.acc = 0;
      this.playing += dt;
      this.timedBarks();
    }
    this.handleEvents(run.drain());
    if (run.over && this.screen === 'play') {
      if (!this.overAt) this.overAt = this.wall;
      if (this.wall - this.overAt > (run.over === 'won' ? 3 : 2)) this.screen = 'over';
    }
    const alpha = this.screen === 'play' && !run.paused ? Math.min(1, this.acc / run.dt) : 1;

    // everything where the run says it is, between its steps
    const g = run.gafoop;
    const gx = lerp(g.px, g.x, alpha);
    const gz = lerp(g.py, g.y, alpha);
    this.gafoop.tool = run.input.use && run.usable === 'bucket' ? 'bucket' : 'idle';
    this.gafoop.place(gx, gz, g.vx, g.vy, dt, this.wall);
    // knocked out: he spins; hit: he blinks
    this.gafoop.root.rotation.z = g.ko > 0 ? Math.sin(this.wall * 9) * 0.35 : 0;
    this.gafoop.root.visible = !(g.invulnerable > 0 && Math.floor(this.wall * 16) % 2 === 0);
    this.fillExtras();
    this.flock.update(run.model.out, alpha, this.wall, dt, this.gafoop.pos, undefined, this.extras);
    this.gloops.update(run, alpha, this.wall, dt);
    this.saucers.update(run, alpha, this.wall);
    this.pickups.update(run, alpha, this.wall);
    this.gear.update(run, alpha, (i) => this.flock.position(i, this.tmp));
    this.boothView.update(run, this.wall, dt);
    this.planeView.update(run, alpha, this.wall);
    this.cabinetView.update(run);
    this.decoyView.update(run, this.wall);
    this.lickView.update(run);
    this.collieView.update(run, alpha, this.wall, dt);
    this.droneView.update(run, alpha, this.wall);
    this.hurdleView.update(run, this.wall);
    this.puffs.update(this.wall);
    for (const [i, b] of this.blinkers.entries()) b.visible = Math.floor(this.wall * 1.5 + i * 0.5) % 2 === 0;

    // the camera keeps Gafoop and his flock in the picture
    if (this.input.wheel !== 0) {
      this.cam.zoom(this.input.wheel < 0 ? 1 : -1);
      this.cam.zoomIndex = Math.max(0, Math.min(2, this.cam.zoomIndex));
      this.input.wheel = 0;
    }
    this.cam.follow(this.framing(gx, gz), 0.08);
    this.cam.update(dt);
    const fwd = this.cam.camera.getWorldDirection(this.tmpFwd);
    this.grassView.fitTo(this.cam.pixelsPerMetre, this.cam.pitch, fwd.x, fwd.z);
    this.grassView.update(dt, this.wall);
    const t = this.cam.target;
    this.sun.position.set(t.x - 22, 40, t.z + 14);
    this.sun.target.position.set(t.x, 0, t.z);

    for (const e of this.fx) e.age += dt;
    this.fx = this.fx.filter((e) => e.age < e.life);
    for (const fl of this.floaters) fl.age += dt;
    this.floaters = this.floaters.filter((fl) => fl.age < 1.4);
    this.playBleats();

    if (draw) {
      this.drawOverlay();
      const info = this.pr.renderer.info;
      info.autoReset = false;
      info.reset();
      this.pr.render(this.scene, this.cam.camera);
      this.perf.calls = info.render.calls;
      this.perf.tris = info.render.triangles;
    }
    this.input.hits.length = 0;
    this.onFrame?.();
  }

  /** The ring spawns come in on: just past the corners of what the camera shows. */
  private spawnRadius(): number {
    const ppm = this.cam.pixelsPerMetre;
    return Math.hypot(W / 2 / ppm, H / 2 / ppm / Math.sin(this.cam.pitch)) + 3;
  }

  /** What the camera keeps in view: Gafoop, pulled a little toward his flock. */
  private framing(gx: number, gz: number): THREE.Vector3 {
    const f = this.run.flockCentre();
    const out = new THREE.Vector3(gx, 0, gz);
    if (f.n > 0) {
      const toward = new THREE.Vector3(f.x - gx, 0, f.y - gz);
      if (toward.length() > 10) toward.setLength(10);
      out.addScaledVector(toward, 0.35);
    }
    return out;
  }

  /** Keys, the stick or the mouse into the run's input: a direction on the ground. */
  private steer(): void {
    const inp = this.input;
    const yaw = this.cam.yaw;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const up = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    let sx = 0;
    let sy = 0;
    const k = inp.keys;
    if (k.has('a') || k.has('arrowleft')) sx -= 1;
    if (k.has('d') || k.has('arrowright')) sx += 1;
    if (k.has('w') || k.has('arrowup')) sy += 1;
    if (k.has('s') || k.has('arrowdown')) sy -= 1;
    let mx = 0;
    let mz = 0;
    if (sx || sy) {
      const l = Math.hypot(sx, sy);
      mx = (right.x * sx + up.x * sy) / l;
      mz = (right.z * sx + up.z * sy) / l;
    } else if (inp.stick) {
      const dx = inp.stick.x - inp.stick.ox;
      const dy = inp.stick.y - inp.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 3) {
        const m = Math.min(1, d / 26);
        mx = (right.x * dx - up.x * dy) / d * m;
        mz = (right.z * dx - up.z * dy) / d * m;
      }
    } else if (inp.pointer && !this.touch) {
      const p = this.cam.pick((inp.pointer.x / W) * 2 - 1, -((inp.pointer.y / H) * 2 - 1), this.tmp);
      if (p) {
        const g = this.run.gafoop;
        const dx = p.x - g.x;
        const dz = p.z - g.y;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const m = Math.min(1, d / 2.5);
          mx = (dx / d) * m;
          mz = (dz / d) * m;
        }
      }
    }
    this.run.input.move.x = mx;
    this.run.input.move.y = mz;
    this.run.input.use = inp.mouseUse || k.has(' ') || this.held.has('use');
  }

  /** Per sheep: out of sight, off the ground, struggling, tipped over to be shorn. */
  private fillExtras(): void {
    const run = this.run;
    const ex = this.extras;
    for (let j = 0; j < run.n; j++) {
      const s = run.status[j];
      ex.hidden[j] = s === Sheep.Reserve || s === Sheep.Lost ? 1 : 0;
      ex.tilt[j] = s === Sheep.Grabbed ? Math.sin(this.wall * 18 + j) * 0.3
        : s === Sheep.Carried ? 0.9 + Math.sin(this.wall * 9 + j) * 0.2
          : s === Sheep.Beamed ? Math.sin(this.wall * 2.5 + j) * 0.5
            : 0;
    }
    for (const b of run.booths) {
      if (b.cur >= 0 && b.t >= b.hop) ex.tilt[b.cur] = 0.6 + Math.sin(this.wall * 11 + b.cur) * 0.12;
    }
  }

  // ------------------------------------------------------------------ events

  private screenX(x: number, y: number): number {
    return this.cam.toScreen(this.tmp.set(x, 0, y)).x;
  }

  private pan(x: number, y: number): number {
    return Math.max(-0.9, Math.min(0.9, (this.screenX(x, y) / W) * 2 - 1));
  }

  private float(x: number, y: number, h: number, text: string, color: string): void {
    const p = this.cam.toScreen(this.tmp.set(x, h, y));
    this.floaters.push({ text, x: p.x, y: p.y, age: 0, color });
  }

  private handleEvents(events: RunEvent[]): void {
    const a = this.audio;
    const run = this.run;
    const o = run.model.out;
    for (const e of events) {
      switch (e.kind) {
        case 'poof': {
          const big = e.enemy !== 'gloop';
          const colours = e.escaped ? [C.fog, C.mist] : big ? [C.pinkLight, C.lavender, C.white] : [C.lavender, C.violet, C.white];
          this.puffs.burst(this.wall, this.tmp.set(e.x, e.z + 0.3, e.y), big ? 14 : 6, { color: colours, size: big ? 0.45 : 0.25, speed: big ? 2.5 : 1.6, life: 0.6, up: 1 });
          a?.poof(this.pan(e.x, e.y), big);
          break;
        }
        case 'stamp':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, age: 0, life: 0.35, color: C.straw });
          this.fx.push({ kind: 'stamp', x: e.x, y: e.y, age: 0, life: 0.4 });
          a?.stamp(this.pan(e.x, e.y));
          break;
        case 'bell':
          if (this.fx.length < 80) this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, age: 0, life: 0.4, color: C.gold });
          a?.bell(this.pan(e.x, e.y));
          break;
        case 'zap':
          this.fx.push({ kind: 'zap', ax: e.ax, ay: e.ay, bx: e.bx, by: e.by, age: 0, life: 0.16, seed: Math.random() * 100 });
          a?.zap(this.pan(e.ax, e.ay));
          break;
        case 'crook':
          this.fx.push({ kind: 'crook', x: e.x, y: e.y, angle: e.angle, arc: e.arc, r: e.r, age: 0, life: 0.28 });
          a?.crook();
          break;
        case 'staple':
          a?.staple();
          break;
        case 'grab':
          a?.grabbed(this.pan(o.x[e.sheep], o.y[e.sheep]));
          break;
        case 'free':
          this.float(o.x[e.sheep], o.y[e.sheep], 1.6, 'GOT IT BACK!', C.lime);
          a?.freed(this.pan(o.x[e.sheep], o.y[e.sheep]));
          break;
        case 'lost':
          this.float(e.x, e.y, 2, e.beamed ? 'BEAMED UP' : 'LOST', C.scarlet);
          this.puffs.burst(this.wall, this.tmp.set(e.x, e.beamed ? 5 : 0.8, e.y), 8, { color: [C.white, C.mist], size: 0.3, speed: 1.4, life: 0.8, up: 1.5 });
          a?.lost();
          this.say('lost', 0.3, run.stats.lost <= 4 ? false : true);
          break;
        case 'fleece':
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.7, e.y), 10, { color: [C.white, C.mist], size: 0.22, speed: 2.2, life: 0.7, up: 1.2 });
          this.float(e.x, e.y, 1.5, 'FLEECE TORN', C.mist);
          a?.fleece(this.pan(e.x, e.y));
          break;
        case 'shear':
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.9, e.y), 8, { color: [C.white, C.mist], size: 0.24, speed: 1.4, life: 0.6, up: 1.4 });
          a?.shear(this.pan(e.x, e.y));
          break;
        case 'claim':
          this.float(e.x, e.y, 1.6, `+${e.n} SHEEP`, C.lime);
          a?.claim();
          break;
        case 'strays':
          this.say('strays', 0.2);
          a?.warn();
          break;
        case 'sheep':
          this.float(e.x, e.y, 1.6, `+${e.n} SHEEP`, C.lime);
          a?.claim();
          break;
        case 'level':
          a?.levelUp();
          if (run.options.levelups === 'bank') this.float(run.gafoop.x, run.gafoop.y, 2.6, 'SUPPLY DROP!', C.gold);
          this.say('level', 0.2);
          break;
        case 'hurt':
          a?.hurt();
          break;
        case 'ko':
          a?.knockedOut();
          this.say('ko', 0.3);
          break;
        case 'mark':
          a?.saucer(this.pan(run.enemies.x[e.enemy], run.enemies.y[e.enemy]));
          break;
        case 'beam':
          a?.warn();
          break;
        case 'pickup':
          if (e.crate) a?.card();
          else a?.pickup();
          break;
        case 'first':
          this.say(e.what, 0.2);
          break;
        case 'item':
          if (e.level === 1) this.say(`got:${e.id}`, 0.4);
          break;
        case 'plane':
          a?.plane();
          break;
        case 'punch':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 1.1, age: 0, life: 0.3, color: C.white });
          this.fx.push({ kind: 'stamp', x: e.x, y: e.y, age: 0, life: 0.45, label: 'PUNCHED', color: C.white });
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.7, e.y), 6, { color: [C.white, C.mist], size: 0.12, speed: 2.4, life: 0.5, up: 1.5 });
          a?.punch(this.pan(e.x, e.y));
          break;
        case 'drop':
          a?.drop(this.pan(e.x, e.y));
          break;
        case 'cabinet':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, age: 0, life: 0.4, color: C.mist });
          this.fx.push({ kind: 'stamp', x: e.x, y: e.y, age: 0, life: 0.5, label: 'FILED', color: C.mist });
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.3, e.y), 12, { color: [C.fog, C.mist, C.khaki], size: 0.3, speed: 3, life: 0.6, up: 0.6 });
          a?.cabinet(this.pan(e.x, e.y));
          break;
        case 'butt':
          if (this.fx.length < 80) this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 0.9, age: 0, life: 0.25, color: C.bone });
          a?.butt(this.pan(e.x, e.y));
          break;
        case 'flak':
          if (this.fx.length < 80) this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, age: 0, life: 0.3, color: C.white });
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.7, e.y), e.r > 2 ? 10 : 4, { color: [C.white, C.mist], size: 0.2, speed: 2.6, life: 0.5, up: 1 });
          a?.flak(this.pan(e.x, e.y));
          break;
        case 'whistle':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: Math.min(e.r, 14), age: 0, life: 0.7, color: C.skyLight });
          a?.whistle();
          break;
        case 'woof':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, age: 0, life: 0.35, color: C.white });
          this.fx.push({ kind: 'stamp', x: e.x, y: e.y, age: 0, life: 0.45, label: 'WOOF!', color: C.gold });
          a?.woof();
          break;
        case 'bite':
          a?.bite(this.pan(e.x, e.y));
          break;
        case 'lick':
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.6, e.y), 5, { color: [C.peach, C.skin], size: 0.18, speed: 1.2, life: 0.5, up: 1 });
          a?.lick(this.pan(e.x, e.y));
          break;
        case 'decoy':
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.5, e.y), 5, { color: [C.pinkLight, C.white], size: 0.16, speed: 1.2, life: 0.4, up: 1 });
          a?.decoy(this.pan(e.x, e.y));
          break;
        case 'burst':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, age: 0, life: 0.35, color: C.pinkLight });
          this.fx.push({ kind: 'stamp', x: e.x, y: e.y, age: 0, life: 0.4, label: 'POP!', color: C.pinkLight });
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.6, e.y), 12, { color: [C.pinkLight, C.blush, C.white], size: 0.2, speed: 3, life: 0.5, up: 1 });
          a?.burst(this.pan(e.x, e.y));
          break;
        case 'lamb':
          this.float(e.x, e.y, 1.4, '+1 LAMB', C.lime);
          a?.lamb();
          break;
        case 'hurdle':
          this.puffs.burst(this.wall, this.tmp.set(e.x, 0.3, e.y), 8, { color: [C.khaki, C.tan], size: 0.18, speed: 1.6, life: 0.5, up: 0.6 });
          a?.hurdle(this.pan(e.x, e.y));
          break;
        case 'beamed':
          this.fx.push({ kind: 'column', x: e.ax, y: e.ay, age: 0, life: 0.5, color: C.ice });
          this.fx.push({ kind: 'column', x: e.bx, y: e.by, age: 0, life: 0.7, color: C.ice });
          this.puffs.burst(this.wall, this.tmp.set(e.bx, 1, e.by), 10, { color: [C.ice, C.mint, C.white], size: 0.16, speed: 1.6, life: 0.6, up: 1 });
          this.float(e.bx, e.by, 1.8, 'BEAMED HOME', C.ice);
          a?.beamed();
          break;
        case 'fizzle':
          this.float(e.x, e.y, 2.2, e.id === 'beam' ? 'NOTHING TO BEAM' : 'NO FLOCK TO CALL', C.fog);
          a?.fizzle();
          break;
        case 'kick':
          this.float(o.x[e.sheep], o.y[e.sheep], 1.6, 'KICKED FREE!', C.lime);
          a?.freed(this.pan(o.x[e.sheep], o.y[e.sheep]));
          break;
        case 'hearing':
          a?.hearing();
          this.float(run.gafoop.x, run.gafoop.y, 2.8, 'ORDER! ORDER!', C.gold);
          break;
        case 'dismissed':
          a?.dismissed();
          break;
      }
    }
  }

  /** Gafoop says something (once per run, unless `again`). */
  private say(what: string, delay: number, again = false): void {
    if (!again && this.said.has(what)) return;
    this.said.add(what);
    const list = BARKS[what];
    if (!list) return;
    // how to work the usable: a key, or its button on a phone
    const id = this.run.usable;
    const button = id ? ITEMS[id].button ?? 'IT' : 'IT';
    const line = list[this.quip++ % list.length]
      .replace('{HOLD}', this.touch ? `Hold ${button}` : 'Hold SPACE')
      .replace('{PRESS}', this.touch ? `Tap ${button}` : 'Press SPACE');
    this.gafoop.say(line, this.wall + delay, 3.5);
  }

  private timedBarks(): void {
    const t = this.run.time;
    if (t > 300) this.say('halfway', 0);
    if (t > RUN.length - 60) this.say('final', 0);
    // a woolly flock that has never been near a booth
    if (t > 45 && this.run.stats.sheared === 0 && this.woolly() >= 0.6) this.say('woolly', 0);
    // a panicking flock
    const o = this.run.model.out;
    let running = 0;
    let n = 0;
    for (let j = 0; j < this.run.n; j++) {
      if (this.run.status[j] !== Sheep.Flock) continue;
      n++;
      if (o.state[j] === SheepState.Run) running++;
    }
    if (n > 4 && running > n * 0.5 && this.wall - this.lastScatter > 20) {
      this.lastScatter = this.wall;
      this.say('scatter', 0, true);
    }
  }

  /** The usable for the HUD: which, held or tapped, and how ready (1: ready). */
  private useState(): RunHudState['use'] {
    const run = this.run;
    const id = run.usable;
    if (!id) return null;
    const def = ITEMS[id];
    const ready = def.hold || run.useCooldown <= 0 ? 1 : 1 - run.useCooldown / run.useCooldownOf;
    return { name: def.name, button: def.button ?? def.name, hold: !!def.hold, level: run.lvl(id), max: def.max, ready };
  }

  /** The share of the flock with a fleece worth taking to a booth. */
  private woolly(): number {
    const run = this.run;
    let n = 0;
    let w = 0;
    for (let j = 0; j < run.n; j++) {
      if (run.status[j] !== Sheep.Flock) continue;
      n++;
      if (run.wool[j] >= 0.8) w++;
    }
    return n ? w / n : 0;
  }

  private playBleats(): void {
    if (!this.audio || this.screen !== 'play') return;
    const o = this.run.model.out;
    for (const i of this.flock.bleats) {
      if (this.run.status[i] === Sheep.Stray) continue;
      const p = this.flock.position(i, this.tmp);
      const sp = this.cam.toScreen(p);
      if (sp.x < -40 || sp.x > W + 40 || sp.y < -40 || sp.y > H + 40) continue;
      const d = Math.hypot(sp.x - W / 2, sp.y - H / 2) / W;
      this.audio.bleat((sp.x / W) * 2 - 1, Math.max(0, 1 - d), 0.9 + ((i * 37) % 10) * 0.04, o.state[i] === SheepState.Run);
    }
  }

  // ------------------------------------------------------------------ input

  private layout(): RunLayout {
    return {
      screen: this.screen,
      touch: this.touch,
      choosing: this.screen === 'play' && this.run.choices !== null,
      supplies: this.screen === 'play' && this.run.options.levelups === 'bank' && !this.run.choices ? this.run.pending : 0,
      use: this.run.usable !== null,
      perf: this.showPerf,
    };
  }

  /** Which on-screen button, if any, is at this overlay position. */
  buttonAt(x: number, y: number): RunButton | null {
    return buttonAt(runButtons(this.layout()), x, y);
  }

  buttonDown(id: RunButton): void {
    this.held.add(id);
    const run = this.run;
    switch (id) {
      case 'card0':
      case 'card1':
      case 'card2':
        this.pick(Number(id.slice(4)));
        break;
      case 'supply':
        run.openSupplies();
        break;
      case 'pause':
        if (this.screen === 'play' && !run.over) this.screen = 'paused';
        break;
      case 'start':
        this.start();
        break;
      case 'resume':
        this.screen = 'play';
        break;
      case 'quit':
        this.screen = 'title';
        this.newRun();
        break;
      case 'opt:cushion':
        this.setOption({ cushion: !this.options.cushion });
        break;
      case 'opt:grazing':
        this.setOption({ grazing: !this.options.grazing });
        break;
      case 'opt:levelups':
        this.setOption({ levelups: this.options.levelups === 'pause' ? 'bank' : 'pause' });
        break;
      case 'stress':
        if (this.screen === 'play') run.stressTest(100, 150);
        break;
      case 'zoomIn':
        this.input.wheel -= 1;
        break;
      case 'zoomOut':
        this.input.wheel += 1;
        break;
      case 'perf':
      case 'use':
        break;
    }
  }

  buttonUp(id: RunButton): void {
    this.held.delete(id);
  }

  private pick(k: number): void {
    if (!this.run.choices?.[k]) return;
    this.run.choose(k);
    this.audio?.card();
  }

  private setOption(o: Partial<RunOptions>): void {
    this.options = { ...this.options, ...o };
    storeOptions(this.options);
    // on the title the run has not begun: it takes the new settings now
    if (this.screen === 'title') this.newRun();
  }

  private handleKeys(): void {
    for (const k of this.input.hits) {
      if (k === 'f') this.showPerf = !this.showPerf;
      if (this.screen === 'title' || this.screen === 'over') {
        if (k === 'enter' || k === ' ') this.start();
        continue;
      }
      if (this.screen === 'paused') {
        if (k === 'enter' || k === 'escape' || k === 'p') this.screen = 'play';
        if (k === 'q') this.buttonDown('quit');
        continue;
      }
      if (this.run.choices) {
        const n = '123'.indexOf(k);
        if (n >= 0) this.pick(n);
        continue;
      }
      if (k === 'escape' || k === 'p') {
        if (!this.run.over) this.screen = 'paused';
      }
      if (k === 'e' || k === 'enter') this.run.openSupplies();
      if (k === '+' || k === '=') this.input.wheel -= 1;
      if (k === '-') this.input.wheel += 1;
    }
  }

  // ------------------------------------------------------------------ the overlay

  private drawOverlay(): void {
    const g = this.pr.clearOverlay();
    this.pr.markOverlay();
    const run = this.run;
    const toScreen = (x: number, y: number, h = 0) => {
      const p = this.cam.toScreen(this.tmp.set(x, h, y));
      return { x: p.x, y: p.y };
    };
    const onScreen = (p: { x: number; y: number }, m = 0) => p.x >= m && p.x <= W - m && p.y >= m && p.y <= H - m;
    // arrows keep inside a box clear of the panels along the top and the thumbs at the bottom
    const box = { x0: 22, x1: W - 22, y0: 64, y1: H - (this.touch ? 80 : 26) };
    const edge = (p: { x: number; y: number }) => {
      const cx = W / 2;
      const cy = (box.y0 + box.y1) / 2;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const k = Math.min((box.x1 - cx) / Math.abs(dx || 1e-6), (dy < 0 ? cy - box.y0 : box.y1 - cy) / Math.abs(dy || 1e-6));
      return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
    };
    const arrows: RunHudState['arrows'] = [];
    const marks: RunHudState['marks'] = [];
    const tape: RunHudState['tape'] = [];
    const drops: RunHudState['drops'] = [];
    if (this.screen !== 'title') {
      const t = run.tape;
      const life = STATS.tape(Math.max(1, run.lvl('tape'))).life;
      for (let k = 0; k < t.cap; k++) {
        const p = t.prev[k];
        if (!t.alive[k] || p < 0 || !t.alive[p]) continue;
        const a = toScreen(t.x[p], t.y[p], 0.05);
        const b = toScreen(t.x[k], t.y[k], 0.05);
        tape.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, fade: 1 - (run.time - t.born[k]) / life });
      }
      const c = run.cabinets;
      const fall = STATS.cabinet(1).fall;
      for (let k = 0; k < c.cap; k++) {
        if (!c.alive[k] || c.t[k] >= fall) continue;
        drops.push({ ...toScreen(c.x[k], c.y[k]), r: c.radius[k], k: c.t[k] / fall });
      }
    }
    const booths: RunHudState['booths'] = [];
    for (const b of run.booths) {
      const p = toScreen(b.site.mx, b.site.my);
      const r = RUN.booths.intake * this.cam.pixelsPerMetre;
      if (p.x > -r && p.x < W + r && p.y > -r && p.y < H + r) booths.push({ ...p, r: RUN.booths.intake, busy: b.cur >= 0 || b.off >= 0 });
    }
    if (this.screen === 'play') {
      for (let j = 0; j < run.n; j++) {
        const s = run.status[j];
        if (s !== Sheep.Grabbed && s !== Sheep.Carried && s !== Sheep.Beamed) continue;
        const at = this.flock.position(j, this.tmp);
        const p = toScreen(at.x, at.z, run.lift[j] + 1);
        if (onScreen(p, 4)) marks.push(p);
        else arrows.push({ ...edge(p), kind: 'taken', n: 1 });
      }
      // the sheep a saucer has marked
      const e = run.enemies;
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i] || e.kind[i] !== KIND.saucer || e.phase[i] !== Phase.Telegraph || e.target[i] < 0) continue;
        const at = this.flock.position(e.target[i], this.tmp);
        const p = toScreen(at.x, at.z, 1);
        if (onScreen(p, 4)) marks.push(p);
        else arrows.push({ ...edge(p), kind: 'taken', n: 1 });
      }
      for (const st of run.strays()) {
        const p = toScreen(st.x, st.y);
        if (!onScreen(p, 0)) arrows.push({ ...edge(p), kind: 'strays', n: st.n });
      }
      // a woolly flock: which way the nearest shearing booth is
      if (this.woolly() >= 0.4) {
        const f = run.flockCentre();
        let near: (typeof run.booths)[number] | null = null;
        for (const b of run.booths) if (!near || Math.hypot(b.site.mx - f.x, b.site.my - f.y) < Math.hypot(near.site.mx - f.x, near.site.my - f.y)) near = b;
        if (near) {
          const p = toScreen(near.site.mx, near.site.my);
          if (!onScreen(p, 0)) arrows.push({ ...edge(p), kind: 'booth', n: 0 });
        }
      }
    }
    const g0 = run.gafoop;
    let bubble: RunHudState['bubble'] = null;
    const ga = this.gafoop;
    if (ga.line && this.wall >= ga.lineFrom && this.wall < ga.lineUntil) {
      const sp = this.cam.toScreen(ga.pos.clone().setY(2.6));
      const feet = this.cam.toScreen(ga.pos.clone().setY(0));
      bubble = { text: ga.line, x: sp.x, y: sp.y, under: feet.y };
    }
    const items = [...run.items].map(([id, level]) => ({ id, level, max: ITEMS[id].max, kind: ITEMS[id].kind }));
    const state: RunHudState = {
      layout: this.layout(),
      portrait: this.portrait,
      timeLeft: run.timeLeft,
      level: run.level,
      xp: run.xp,
      xpNeed: xpToNext(run.level),
      flock: run.flockCount,
      taken: run.takenCount,
      composure: g0.composure,
      composureMax: run.composureMax,
      ko: Math.max(0, g0.ko),
      invulnerable: g0.invulnerable > 0,
      items: items as { id: ItemId; level: number; max: number; kind: ItemKind }[],
      choices: run.choices ? run.choices.map((c) => Run.describe(c)) : null,
      arrows,
      marks,
      booths,
      tape,
      drops,
      fx: this.fx,
      floaters: this.floaters,
      bubble,
      options: this.options,
      result: this.screen === 'over'
        ? { won: run.over === 'won', held: run.flockCount, peak: run.stats.peak, level: run.level, kills: run.stats.kills, found: run.stats.found, rescued: run.stats.rescued, lost: run.stats.lost, time: run.time }
        : null,
      stick: this.touch ? this.input.stick : null,
      useOn: run.input.use,
      use: this.useState(),
      held: this.held,
      perf: this.showPerf ? { ...this.perf, sheep: run.flockCount, enemies: run.enemies.countOf() } : null,
      playing: this.playing,
      ppm: this.cam.pixelsPerMetre,
      squash: Math.sin(this.cam.pitch),
      toScreen,
    };
    drawRunHud(g, this.fonts, state);
  }
}

function loadOptions(): RunOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (raw) {
      // only the settings there still are (an older build's may be in there too)
      const saved = JSON.parse(raw) as Partial<RunOptions>;
      const o = { ...DEFAULT_OPTIONS };
      for (const k of Object.keys(o) as (keyof RunOptions)[]) if (k in saved) (o as Record<string, unknown>)[k] = saved[k];
      return o;
    }
  } catch {
    // storage blocked or unreadable: the defaults will do
  }
  return { ...DEFAULT_OPTIONS };
}

function storeOptions(o: RunOptions): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // storage blocked: settings last for this visit only
  }
}
