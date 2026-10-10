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
import { allObstacles, buildScenery, fenceMeshes, GateMesh, levelObstacles, WORLD, type LevelObstacles } from './level';
import { levelById, LEVELS, type LevelSpec } from './levels';
import { Works } from '../works/works';
import { WorksView } from './worksView';
import { Builder, pixelLine } from './build';
import { FlowField } from './flowOverlay';
import { TOOLS, type HudLayout, type ToolId } from './hud';
import type { Pt } from '../works/devices';
import { GrassField } from '../sim/grass';
import { GrassView } from '../art/grass';
import { coverWithWorks, meadowCap } from './meadowGrass';

/**
 * Gafoop is always a threat, and only his proximity (and how fast he closes in) decides how
 * much: there is no button for scaring. While he rattles the bucket he is mostly forgiven.
 * A later unlock could let him fly in stealth, counting for nothing at all.
 */
const PRESENCE = { strength: 0.85, radius: 9 };
const WITH_BUCKET = { strength: 0.25, radius: 6 };
const BUCKET = { strength: 1.0, radius: 14 };
const HONK = { strength: 1.6, radius: 14, cooldown: 4 };

const QUIPS = {
  start: [''],
  honk: ['ATTENTION, LIVESTOCK!', 'THIS IS YOUR GENERAL SPEAKING!', 'FORM AN ORDERLY QUEUE!', 'THAT WAS NOT A SUGGESTION!'],
  bucket: ['Who wants a pellet? You do. Yes you do.', 'Delicious regulation feed! Twelve percent grit!'],
  scatter: ['No, no, the OTHER way!', 'Stop panicking! I am a very calm alien!', 'Why are they like this?', 'Sheep. Of course it had to be sheep.'],
  half: ['Halfway! The Hegemony will be thrilled. Moderately.'],
  allInOpen: ['Everyone is in! Somebody shut the gate! (G)'],
  gateOpen: ['Gate: open.'],
  gateShut: ['Gate: secured. Mostly.'],
  win: ['Form 77-B, here I come!'],
  firstYarn: ['Yarn! Actual yarn! Somebody frame it.'],
  halfYarn: ['Fifteen skeins. The Auditor has stopped yawning. Slightly.'],
  winYarn: ['Industry, proven! In triplicate!'],
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
  /** the level being played */
  spec: LevelSpec = levelById(1);
  /** the level's own fences and gate */
  private levelGroup = new THREE.Group();
  private gate: GateMesh | null = null;
  /** herdway devices: what the player has built, and what they do to the sheep */
  readonly works = new Works();
  private readonly worksView: WorksView;
  private readonly blinkers: THREE.Mesh[];
  private model!: FlockModel;
  private flock!: FlockView;
  private gafoop!: GafoopActor;
  private gateClosed = false;
  private acc = 0;
  /** seconds since the level started, and the time on the clock */
  time = 0;
  private clock = 0;
  private started = false;
  private penned = new Uint8Array(0);
  private everPenned = new Uint8Array(0);
  private pennedCount = 0;
  private floaters: HudState['floaters'] = [];
  private honkAt = -99;
  private pendingHonk = false;
  private won: { time: number; at: number; dismissed?: boolean } | null = null;
  private showHelp = false;
  private flockSize = 30;
  private attempt = 1;
  private said = new Set<string>();
  private lastScatterQuip = -99;
  private quipIndex = 0;
  audio: GameAudio | null = null;
  readonly input: GameInput = { pointer: null, bucket: false, feed: false, keys: new Set(), hits: [], wheel: 0, taps: [], drag: { dx: 0, dy: 0 } };
  /** build mode (herdway levels): the pointer places devices; Gafoop waits */
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
  constructor(target: HTMLCanvasElement | THREE.WebGLRenderer, private readonly fonts: Fonts, level = 1) {
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
    this.builder = new Builder(this.works, () => this.spec.ports ?? []);
    this.load(level);
  }

  /** Set up level `id` from scratch. */
  load(id: number): void {
    const spec = levelById(id);
    this.spec = spec;
    this.scene.remove(this.levelGroup);
    this.levelGroup = new THREE.Group();
    if (spec.fences.length) this.levelGroup.add(fenceMeshes(spec.fences));
    this.gate = null;
    if (spec.gate) {
      this.gate = new GateMesh(spec.gate);
      this.gate.root.traverse((o) => { o.castShadow = true; });
      this.levelGroup.add(this.gate.root);
    }
    this.scene.add(this.levelGroup);
    this.attempt = 1;
    this.reset(spec.flock);
  }

  /** Is there a level after this one? */
  get hasNext(): boolean {
    return LEVELS.some((l) => l.id === this.spec.id + 1);
  }

  /** (Re)start the level with a flock of `n` sheep. */
  reset(n: number): void {
    this.flockSize = n;
    if (this.flock) this.scene.remove(this.flock.root);
    if (this.gafoop) this.scene.remove(this.gafoop.root, ...this.gafoop.effects);
    const spec = this.spec;
    this.model = new SheepherdingV1();
    this.model.init({ seed: this.attempt, width: WORLD.width, height: WORLD.height, sheep: cluster(n, spec.flockAt.x, spec.flockAt.y, this.attempt, 1.3) });
    // every attempt starts on a meadow nobody has grazed
    this.grass.cap.set(this.grassBase);
    this.grass.length.set(this.grassBase);
    this.grass.version++;
    this.grassDevices = '-';
    this.model.setGrass(this.grass);
    this.gateClosed = false;
    if (this.gate) this.gate.open = 1;
    this.works.clear();
    spec.works?.(this.works);
    this.works.setFlock(n);
    this.worksVersion = -1;
    this.building = false;
    this.builder.cancel();
    this.flowField.clear();
    this.speed = 1;
    this.syncObstacles();
    this.flock = new FlockView(n, this.attempt);
    this.scene.add(this.flock.root);
    this.gafoop = new GafoopActor(spec.gafoopAt.x, spec.gafoopAt.y);
    this.scene.add(this.gafoop.root, ...this.gafoop.effects);
    this.cam.jump(new THREE.Vector3((spec.gafoopAt.x + spec.flockAt.x) / 2 + 4, 0, (spec.gafoopAt.y + spec.flockAt.y) / 2));
    this.penned = new Uint8Array(n);
    this.everPenned = new Uint8Array(n);
    this.pennedCount = 0;
    this.floaters = [];
    this.won = null;
    this.time = 0;
    this.clock = 0;
    this.acc = 0;
    this.said.clear();
    this.honkAt = -99;
    this.flock.capture(this.model.out);
  }

  /** works.version when the model last had its fences */
  private worksVersion = -1;
  /** the devices the grass was last cleared for (their ids) */
  private grassDevices = '';

  /** Hand the model every fence there is: the meadow's, the level's, the gate, the works. */
  private syncObstacles(): void {
    const obs: Obstacle[] = [...allObstacles(this.meadow), ...this.spec.fences, ...this.works.obstacles()];
    // race and station floors are bare
    const key = this.works.devices.map((d) => d.id).join(',');
    if (key !== this.grassDevices) {
      coverWithWorks(this.grass, this.grassBase, this.works.devices);
      this.grassDevices = key;
    }
    if (this.spec.gate && this.gateClosed) obs.push(this.spec.gate);
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
    const list = kind === 'start' ? [this.spec.opening] : QUIPS[kind];
    const text = list[this.quipIndex++ % list.length];
    this.gafoop.say(text, this.time + delay, kind === 'start' ? 4.2 : 2.8);
  }

  private toggleGate(): void {
    if (!this.gate) return;
    this.gateClosed = !this.gateClosed;
    this.gate.open = this.gateClosed ? 0 : 1;
    this.syncObstacles();
    this.audio?.gate(!this.gateClosed);
    if (this.pennedCount < this.flockSize) this.quip(this.gateClosed ? 'gateShut' : 'gateOpen', 0, false);
  }

  private stimuli(): Stimulus[] {
    const g = this.gafoop;
    const p = g.pos;
    const out: Stimulus[] = [];
    const t = g.tool === 'bucket' ? WITH_BUCKET : PRESENCE;
    out.push({ id: 1, kind: 'threat', x: p.x, y: p.z, strength: t.strength, radius: t.radius });
    if (g.tool === 'bucket') out.push({ id: 2, kind: 'lure', x: p.x, y: p.z, strength: BUCKET.strength, radius: BUCKET.radius });
    if (this.pendingHonk) {
      out.push({ id: 3, kind: 'startle', x: p.x, y: p.z, strength: HONK.strength, radius: HONK.radius });
      this.pendingHonk = false;
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
    }
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
        this.works.update(this.model.out, step);
        if (this.works.version !== this.worksVersion) this.syncObstacles();
        this.flowField.sample(this.model.out, step);
        this.afterStep();
      }
    }
    this.flock.update(this.model.out, this.started ? this.acc / this.model.dt : 1, this.time, sdt, g.pos, this.works);
    this.worksView.update(sdt, this.time);
    this.wall += dt;
    this.grassView.fitTo(this.cam.pixelsPerMetre, this.cam.pitch);
    this.grassView.update(dt, this.wall);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.2);
    this.gate?.update(dt);
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
    // near the pen (or the works), bring it into the picture too
    const pen = new THREE.Vector3(this.spec.focus.x, 0, this.spec.focus.y);
    const d = pen.distanceTo(p);
    const k = Math.max(0, Math.min(1, (26 - d) / 12)) * 0.45;
    return out.lerp(pen, k);
  }

  /** Which on-screen button, if any, is at this overlay position. */
  buttonAt(x: number, y: number): ButtonId | null {
    if (!this.started) return null;
    return buttonAt(hudButtons(this.layout()), x, y);
  }

  /** What the HUD's layout depends on right now. */
  private layout(): HudLayout {
    const won = this.won && !this.won.dismissed ? { age: this.time - this.won.at, buttons: this.wonButtons() } : null;
    return {
      touch: this.touch,
      won,
      perf: this.showPerf,
      kind: this.spec.kind,
      build: this.building ? { tool: this.builder.tool, drawing: this.builder.drawing } : null,
    };
  }

  private wonButtons(): ButtonId[] {
    if (this.spec.kind === 'herdway') return this.hasNext ? ['again', 'next', 'keep'] : ['again', 'keep'];
    return this.hasNext ? ['again', 'bigger', 'next'] : ['again', 'bigger'];
  }

  /** A button pressed: it does what its key does. FEED acts while held. */
  buttonDown(id: ButtonId): void {
    const inp = this.input;
    this.held.add(id);
    switch (id) {
      case 'feed': inp.feed = true; break;
      case 'gate': inp.hits.push('g'); break;
      case 'honk': inp.hits.push(' '); break;
      case 'rotL': inp.hits.push('q'); break;
      case 'rotR': inp.hits.push('e'); break;
      case 'zoomIn': inp.wheel -= 1; break;
      case 'zoomOut': inp.wheel += 1; break;
      case 'again': inp.hits.push('r'); break;
      case 'bigger': inp.hits.push('n'); break;
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
      // the cheat: on to the next level, won or not (round to the first after the last)
      if (k === ']') {
        this.load(this.hasNext ? this.spec.id + 1 : LEVELS[0].id);
        this.quip('start', 0.8, false);
        continue;
      }
      if (k === '\\') {
        this.solve();
        continue;
      }
      const card = this.won && !this.won.dismissed;
      if (this.spec.kind === 'herdway' && !card) {
        if (k === 'b') {
          this.building = !this.building;
          this.builder.cancel();
        }
        if (k === 'o') this.showFlow = !this.showFlow;
        if (k === 't') this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
        if (this.building) {
          const n = '123456789'.indexOf(k);
          if (n >= 0 && n < TOOLS.length) this.builder.setTool(TOOLS[n]);
          if (k === 'x' || k === 'delete' || k === 'backspace') this.builder.setTool('remove');
          if (k === 'r') this.builder.rotate();
          if (k === 'enter') this.builder.finish();
          if (k === 'escape') {
            if (this.builder.drawing) this.builder.cancel();
            else this.building = false;
          }
          continue;
        }
      }
      if (k === 'g' && this.gate) this.toggleGate();
      if (k === ' ' && this.time - this.honkAt >= HONK.cooldown) {
        this.honkAt = this.time;
        this.pendingHonk = true;
        this.gafoop.megaphone(this.time);
        this.audio?.megaphone();
        const list = QUIPS.honk;
        this.gafoop.say(list[this.quipIndex++ % list.length], this.time, 1.6);
      }
      if (card && k === 'r') {
        this.reset(this.flockSize);
        this.quip('start', 0.5, false);
      }
      if (card && k === 'n' && this.spec.kind === 'pen') {
        this.attempt++;
        this.reset(Math.min(120, this.flockSize + 20));
        this.quip('start', 0.5, false);
      }
      if (card && k === 'l' && this.hasNext) {
        this.load(this.spec.id + 1);
        this.quip('start', 0.8, false);
      }
      // a herdway goes on after the verdict: the card can be put away
      if (card && k === 'k' && this.spec.kind === 'herdway') this.won = { ...this.won!, dismissed: true };
    }
  }

  /** The other cheat: whatever has been built gives way to the level's winning layout. */
  private solve(): void {
    if (!this.spec.solution) return;
    for (const d of [...this.works.devices]) this.works.remove(d.id);
    this.spec.works?.(this.works);
    this.spec.solution(this.works);
    this.building = false;
    this.builder.cancel();
    this.gafoop.say('Blueprints from the Bureau. Nobody tell the Auditor.', this.time, 3);
  }

  private afterStep(): void {
    for (const e of this.works.events) {
      if (e.kind !== 'yarn') continue;
      const sp = this.cam.toScreen(new THREE.Vector3(e.at.x, 1.4, e.at.y));
      this.floaters.push({ text: '+1 YARN', x: sp.x, y: sp.y, age: 0 });
      this.audio?.penned();
    }
    if (this.spec.kind === 'herdway') {
      this.afterHerdwayStep();
      return;
    }
    const PEN = this.spec.pen!;
    const o = this.model.out;
    let count = 0;
    let running = 0;
    for (let i = 0; i < o.count; i++) {
      const inside = o.x[i] > PEN.x0 && o.x[i] < PEN.x1 && o.y[i] > PEN.y0 && o.y[i] < PEN.y1;
      if (inside) count++;
      if (inside && !this.penned[i]) {
        this.penned[i] = 1;
        // credit each sheep once, however often it wanders in and out
        if (!this.everPenned[i]) {
          this.everPenned[i] = 1;
          const sp = this.cam.toScreen(new THREE.Vector3(o.x[i], 1.2, o.y[i]));
          this.floaters.push({ text: '+1', x: sp.x, y: sp.y, age: 0 });
          this.audio?.penned();
        }
      } else if (!inside && this.penned[i]) {
        this.penned[i] = 0;
      }
      if (o.state[i] === SheepState.Run) running++;
    }
    this.pennedCount = count;
    if (count >= Math.ceil(o.count / 2)) this.quip('half');
    if (count === o.count && !this.gateClosed) this.quip('allInOpen');
    if (running > o.count * 0.4 && this.time - this.lastScatterQuip > 12 && this.time - this.honkAt > 3) {
      this.lastScatterQuip = this.time;
      const list = QUIPS.scatter;
      this.gafoop.say(list[this.quipIndex++ % list.length], this.time, 2.4);
    }
    if (!this.won && count === o.count && this.gateClosed) {
      this.won = { time: this.clock, at: this.time };
      this.audio?.win();
      this.quip('win', 0.4);
    }
  }

  /** A herdway is won on yarn hung up. */
  private afterHerdwayStep(): void {
    const yarn = this.works.yarn;
    if (yarn >= 1) this.quip('firstYarn', 0.3);
    if (yarn >= Math.ceil(this.spec.goal / 2)) this.quip('halfYarn', 0.3);
    if (!this.won && yarn >= this.spec.goal) {
      this.won = { time: this.clock, at: this.time };
      this.audio?.win();
      this.quip('winYarn', 0.4);
    }
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
    // a pointer to the pen (or the works) when it is off screen
    let penArrow: HudState['penArrow'] = null;
    const pc = this.cam.toScreen(new THREE.Vector3(this.spec.focus.x, 0, this.spec.focus.y));
    if (!this.building && (pc.x < 0 || pc.x > W || pc.y < 0 || pc.y > H)) {
      const dx = pc.x - W / 2;
      const dy = pc.y - H / 2;
      // keep clear of the touch buttons along the bottom
      const below = dy > 0 && this.touch ? 80 : 30;
      const k = Math.min((W / 2 - 24) / Math.abs(dx || 1e-6), (H / 2 - below) / Math.abs(dy || 1e-6));
      penArrow = { x: W / 2 + dx * k, y: H / 2 + dy * k, angle: Math.atan2(dy, dx), label: this.spec.kind === 'pen' ? 'PEN' : 'WORKS' };
    }
    const herdway = this.spec.kind === 'herdway';
    const layout = this.layout();
    const state: HudState = {
      layout,
      objective: {
        title: this.spec.title,
        count: herdway ? this.works.yarn : this.pennedCount,
        total: herdway ? this.spec.goal : this.flockSize,
        label: herdway ? 'YARN' : 'PENNED',
        icon: herdway ? 'yarn' : 'sheep',
      },
      time: this.won ? this.won.time : this.clock,
      gateOpen: this.gate ? !this.gateClosed : null,
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
        ? { time: this.won.time, age: layout.won.age, lines: [this.spec.verdict[0].replace('{n}', String(herdway ? this.spec.goal : this.flockSize)), this.spec.verdict[1]] }
        : null,
      megaphoneReady: Math.min(1, (this.time - this.honkAt) / HONK.cooldown),
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
  debug(): { gafoop: { x: number; y: number }; penned: number; total: number; won: boolean; time: number } {
    return { gafoop: { x: this.gafoop.pos.x, y: this.gafoop.pos.z }, penned: this.pennedCount, total: this.flockSize, won: !!this.won, time: this.clock };
  }
}

/** Panning is faster when zoomed out. */
const ZOOM_PAN = [1.8, 1.4, 1, 0.75];
