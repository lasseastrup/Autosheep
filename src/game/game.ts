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
import { allObstacles, buildScenery, FLOCK_AT, GAFOOP_AT, GATE, GateMesh, levelObstacles, PEN, WORLD, type LevelObstacles } from './level';

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
  start: ['Right, troops. Into the pen. Single file. Chop chop!'],
  honk: ['ATTENTION, LIVESTOCK!', 'THIS IS YOUR GENERAL SPEAKING!', 'FORM AN ORDERLY QUEUE!', 'THAT WAS NOT A SUGGESTION!'],
  bucket: ['Who wants a pellet? You do. Yes you do.', 'Delicious regulation feed! Twelve percent grit!'],
  scatter: ['No, no, the OTHER way!', 'Stop panicking! I am a very calm alien!', 'Why are they like this?', 'Sheep. Of course it had to be sheep.'],
  half: ['Halfway! The Hegemony will be thrilled. Moderately.'],
  allInOpen: ['Everyone is in! Somebody shut the gate! (G)'],
  gateOpen: ['Gate: open.'],
  gateShut: ['Gate: secured. Mostly.'],
  win: ['Form 77-B, here I come!'],
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
}

/**
 * The M1 playable slice: herd a flock of sheep into a pen. Fixed 30 Hz simulation behind the
 * flock contract, rendered at 640×360 through the pixel pipeline with interpolation.
 */
export class Game {
  readonly pr: PixelRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new IsoCamera(W, H);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 0.92);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.5);
  private readonly level: LevelObstacles;
  private readonly gate: GateMesh;
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
  private won: { time: number; at: number } | null = null;
  private showHelp = false;
  private flockSize = 30;
  private attempt = 1;
  private said = new Set<string>();
  private lastScatterQuip = -99;
  private quipIndex = 0;
  audio: GameAudio | null = null;
  readonly input: GameInput = { pointer: null, bucket: false, feed: false, keys: new Set(), hits: [], wheel: 0 };
  /** show on-screen controls (set once the player touches the screen) */
  touch = false;
  /** the screen is taller than wide */
  portrait = false;
  private readonly held = new Set<ButtonId>();
  /** frame-rate readout (F, or click the objective panel); fps and ms come from the main loop */
  showPerf = false;
  readonly perf = { fps: 0, ms: 0, calls: 0, tris: 0 };
  /** called once a frame has been drawn (for tooling) */
  onFrame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, private readonly fonts: Fonts) {
    this.pr = new PixelRenderer(canvas, W, H);
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

    this.level = levelObstacles();
    const scenery = buildScenery(this.level);
    s.add(scenery.group);
    this.blinkers = scenery.blinkers;
    this.gate = new GateMesh(GATE);
    this.gate.root.traverse((o) => { o.castShadow = true; });
    s.add(this.gate.root);
    this.reset(this.flockSize);
  }

  /** (Re)start the level with a flock of `n` sheep. */
  reset(n: number): void {
    this.flockSize = n;
    if (this.flock) this.scene.remove(this.flock.root);
    if (this.gafoop) this.scene.remove(this.gafoop.root, ...this.gafoop.effects);
    this.model = new SheepherdingV1();
    this.model.init({ seed: this.attempt, width: WORLD.width, height: WORLD.height, sheep: cluster(n, FLOCK_AT.x, FLOCK_AT.y, this.attempt, 1.3) });
    this.gateClosed = false;
    this.gate.open = 1;
    this.syncObstacles();
    this.flock = new FlockView(n, this.attempt);
    this.scene.add(this.flock.root);
    this.gafoop = new GafoopActor(GAFOOP_AT.x, GAFOOP_AT.y);
    this.scene.add(this.gafoop.root, ...this.gafoop.effects);
    this.cam.jump(new THREE.Vector3((GAFOOP_AT.x + FLOCK_AT.x) / 2 + 4, 0, FLOCK_AT.y));
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

  private syncObstacles(): void {
    const obs: Obstacle[] = allObstacles(this.level, this.gateClosed);
    this.model.setObstacles(obs);
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
    const list = QUIPS[kind];
    const text = list[this.quipIndex++ % list.length];
    this.gafoop.say(text, this.time + delay, 2.8);
  }

  private toggleGate(): void {
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
    return out;
  }

  /** Advance one frame, and draw it unless `draw` is false (tooling fast-forward). */
  frame(dt: number, draw = true): void {
    // the first animation frame can arrive stamped before the loop started
    dt = Math.max(0, Math.min(0.1, dt));
    const inp = this.input;
    this.handleKeys(inp);
    if (this.started) this.time += dt;
    if (this.started && !this.won) this.clock += dt;

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
    this.cam.update(dt);

    // Gafoop goes where the cursor is
    let target: THREE.Vector3 | null = null;
    if (inp.pointer && this.started) {
      target = this.cam.pick((inp.pointer.x / W) * 2 - 1, -((inp.pointer.y / H) * 2 - 1));
    }
    const g = this.gafoop;
    g.tool = this.started && (inp.bucket || inp.feed) ? 'bucket' : 'idle';
    if (g.tool === 'bucket') {
      this.audio?.rattle();
      this.quip('bucket');
    }
    g.update(target, dt, this.time, { w: WORLD.width, h: WORLD.height });
    if (this.started) this.cam.follow(this.framing(), 0.16);

    // fixed-step simulation
    if (this.started) {
      this.acc += dt;
      const step = this.model.dt;
      while (this.acc >= step) {
        this.flock.capture(this.model.out);
        this.model.step(this.stimuli());
        this.acc -= step;
        this.afterStep();
      }
    }
    this.flock.update(this.model.out, this.started ? this.acc / this.model.dt : 1, this.time, dt, g.pos);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.2);
    this.gate.update(dt);
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
    // near the pen, bring it into the picture too
    const pen = new THREE.Vector3((PEN.x0 + PEN.x1) / 2, 0, (PEN.y0 + PEN.y1) / 2);
    const d = pen.distanceTo(p);
    const k = Math.max(0, Math.min(1, (26 - d) / 12)) * 0.45;
    return out.lerp(pen, k);
  }

  /** Which on-screen button, if any, is at this overlay position. */
  buttonAt(x: number, y: number): ButtonId | null {
    if (!this.started) return null;
    return buttonAt(hudButtons(this.touch, this.won ? this.time - this.won.at : null), x, y);
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
      if (!this.started) continue;
      if (k === 'g') this.toggleGate();
      if (k === ' ' && this.time - this.honkAt >= HONK.cooldown) {
        this.honkAt = this.time;
        this.pendingHonk = true;
        this.gafoop.megaphone(this.time);
        this.audio?.megaphone();
        const list = QUIPS.honk;
        this.gafoop.say(list[this.quipIndex++ % list.length], this.time, 1.6);
      }
      if (this.won && k === 'r') this.reset(this.flockSize);
      if (this.won && k === 'n') {
        this.attempt++;
        this.reset(Math.min(120, this.flockSize + 20));
        this.quip('start', 0.5, false);
      }
    }
  }

  private afterStep(): void {
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
    this.pr.markOverlay();
    void dt;

    const gp = this.gafoop;
    let bubble: HudState['bubble'] = null;
    if (gp.line && this.time >= gp.lineFrom && this.time < gp.lineUntil) {
      const sp = this.cam.toScreen(gp.pos.clone().setY(2.6));
      bubble = { text: gp.line, x: sp.x, y: sp.y };
    }
    // pen pointer when the pen is off screen
    let penArrow: HudState['penArrow'] = null;
    const pc = this.cam.toScreen(new THREE.Vector3((PEN.x0 + PEN.x1) / 2, 0, (PEN.y0 + PEN.y1) / 2));
    if (pc.x < 0 || pc.x > W || pc.y < 0 || pc.y > H) {
      const dx = pc.x - W / 2;
      const dy = pc.y - H / 2;
      // keep clear of the touch buttons along the bottom
      const below = dy > 0 && this.touch ? 80 : 30;
      const k = Math.min((W / 2 - 24) / Math.abs(dx || 1e-6), (H / 2 - below) / Math.abs(dy || 1e-6));
      penArrow = { x: W / 2 + dx * k, y: H / 2 + dy * k, angle: Math.atan2(dy, dx) };
    }
    const state: HudState = {
      penned: this.pennedCount,
      total: this.flockSize,
      time: this.won ? this.won.time : this.clock,
      gateOpen: !this.gateClosed,
      playing: this.time,
      showHelp: this.showHelp,
      bubble,
      penArrow,
      floaters: this.floaters,
      cursor: this.input.pointer && this.started ? { ...this.input.pointer, tool: gp.tool } : null,
      won: this.won ? { time: this.won.time, age: this.time - this.won.at } : null,
      megaphoneReady: Math.min(1, (this.time - this.honkAt) / HONK.cooldown),
      touch: this.touch,
      feeding: gp.tool === 'bucket',
      held: this.held,
      portrait: this.portrait,
      perf: this.showPerf ? this.perf : null,
    };
    if (this.started) drawHud(g, this.fonts, state);
  }

  /** For tooling: the model's outputs and Gafoop's position. */
  debug(): { gafoop: { x: number; y: number }; penned: number; total: number; won: boolean; time: number } {
    return { gafoop: { x: this.gafoop.pos.x, y: this.gafoop.pos.z }, penned: this.pennedCount, total: this.flockSize, won: !!this.won, time: this.clock };
  }
}

/** Panning is faster when zoomed out. */
const ZOOM_PAN = [1.8, 1.4, 1, 0.75];
