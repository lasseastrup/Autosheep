import * as THREE from 'three';
import { PixelRenderer, defaultPost } from '../engine/pixelRenderer';
import { RESURRECT64, C } from '../engine/palette';
import { loadFonts, type Fonts } from '../engine/bitmapFont';
import { setToonDefaults } from '../engine/toon';
import { AudioEngine } from '../audio/engine';
import { buildTimeline, loadVoices, type Shot, type Timeline, type VoiceCue } from './timeline';
import { makeMouth, type StageContext, type StageSet } from './stage';
import { clamp, easeInOut } from '../engine/rng';
import { SpaceSet } from './sets/space';
import { BridgeSet } from './sets/bridge';
import { ScannerSet } from './sets/scanner';
import { CountrySet } from './sets/country';
import { LawSet } from './sets/law';
import { TitleSet } from './sets/title';

const voiceUrls = import.meta.glob('../../assets/voice/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const SPEAKER: Record<string, { name: string; color: string } | null> = {
  narrator: null,
  gafoop: { name: 'GEN. GAFOOP', color: C.lime },
  gafoop_radio: { name: 'GEN. GAFOOP (RADIO)', color: C.lime },
  blorp: { name: 'LT. BLORP', color: C.lavender },
  computer: { name: 'SHIP COMPUTER', color: C.mint },
  auditor: { name: 'THE GRAND AUDITOR', color: C.skyLight },
};

/** Runs a named loading step (see src/loading.ts). */
export type Step = <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;

export class IntroPlayer {
  readonly pr: PixelRenderer;
  readonly tl: Timeline;
  fonts!: Fonts;
  sets: Record<string, StageSet> = {};
  private ctx!: StageContext;
  private currentShot = -1;
  private paletteKey = '';
  subtitles = true;
  /** Extra overlay drawing for the current frame (e.g. the start prompt). */
  overlayHook: ((g: CanvasRenderingContext2D) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.pr = new PixelRenderer(canvas, 480, 270);
    this.tl = buildTimeline();
  }

  /** Build the sets, each as its own loading step. */
  async init(step: Step = async (_n, fn) => fn()): Promise<void> {
    this.fonts = await step('fonts', () => loadFonts());
    const { mouth, speaking } = makeMouth(this.tl);
    this.ctx = { pr: this.pr, fonts: this.fonts, tl: this.tl, mouth, speaking };
    const ctx = this.ctx;
    const country = await step('intro scene: countryside', () => new CountrySet(ctx));
    this.sets = {
      space: await step('intro scene: space', () => new SpaceSet(ctx)),
      bridge: await step('intro scene: the bridge', () => new BridgeSet(ctx)),
      scanner: await step('intro scene: the scanner', () => new ScannerSet(ctx, country)),
      country,
      law: await step('intro scene: the law', () => new LawSet(ctx)),
      title: await step('intro scene: the title', () => new TitleSet(ctx)),
    };
  }

  /**
   * Free the intro's GPU memory when the game takes over its canvas: the pipeline's targets
   * and the sets' geometry. Materials stay: the toon ones are shared with the game, and
   * dropping a shared shader would mean compiling it again.
   */
  dispose(): void {
    this.pr.dispose();
    const seen = new Set<THREE.Object3D>();
    for (const set of Object.values(this.sets)) {
      if (!set.scene || seen.has(set.scene)) continue;
      seen.add(set.scene);
      set.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
  }

  /**
   * Compile every set's shaders ahead of time (behind the start screen), one set per animation
   * frame so the screen keeps moving, instead of stalling at each new shot.
   */
  async warmUp(step: Step = async (_n, fn) => fn()): Promise<void> {
    const seen = new Set<THREE.Object3D>();
    for (const [name, set] of Object.entries(this.sets)) {
      if (!set.scene || !set.camera || seen.has(set.scene)) continue;
      seen.add(set.scene);
      const { scene, camera } = set;
      await step(`intro shaders: ${name}`, () => this.pr.warm(scene, camera));
    }
  }

  voiceUrlMap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, url] of Object.entries(voiceUrls)) out[path.split('/').pop()!.replace('.mp3', '')] = url;
    return out;
  }

  async prepareAudio(ctx: BaseAudioContext): Promise<AudioEngine> {
    await loadVoices(ctx, this.voiceUrlMap());
    const a = new AudioEngine(ctx);
    a.setEvents(this.tl.events);
    return a;
  }

  shotAt(T: number): number {
    const shots = this.tl.shots;
    for (let i = 0; i < shots.length; i++) if (T < shots[i].end) return i;
    return shots.length - 1;
  }

  /** Render the frame at timeline time T. */
  frame(T: number): void {
    const i = this.shotAt(T);
    const shot = this.tl.shots[i];
    const set = this.sets[shot.set];
    if (i !== this.currentShot) {
      this.currentShot = i;
      setToonDefaults();
      set.enter?.(shot);
    }
    const t = T - shot.start;
    set.update(shot, t, T);

    // per-set look
    const palette = set.palette ?? RESURRECT64;
    const key = palette.join();
    if (key !== this.paletteKey) {
      this.pr.setPalette(palette);
      this.paletteKey = key;
    }
    this.pr.post = { ...defaultPost(), ...(set.post ?? {}) };

    // overlay
    const g = this.pr.clearOverlay();
    if (set.overlay) {
      set.overlay(g, shot, t, T);
      this.pr.markOverlay();
    }
    if (this.subtitles) this.drawSubtitles(g, T);
    if (this.overlayHook) {
      this.overlayHook(g);
      this.pr.markOverlay();
    }

    // screen fx
    const fx = this.pr.fx;
    fx.fade = 0;
    fx.iris = -1;
    fx.flash = 0;
    fx.bars = 0;
    fx.shake.set(0, 0);
    fx.scanlines = 0;
    fx.invert = 0;
    const sf = set.fx?.(shot, t) ?? {};
    if (sf.bars !== undefined) fx.bars = sf.bars;
    if (sf.shake) fx.shake.set(sf.shake[0], sf.shake[1]);
    if (sf.scanlines !== undefined) fx.scanlines = sf.scanlines;
    if (sf.flash !== undefined) fx.flash = sf.flash;
    if (sf.invert !== undefined) fx.invert = sf.invert;
    this.applyTransitions(shot, t);

    if (set.scene && set.camera) this.pr.render(set.scene, set.camera);
    else this.renderBlank();
  }

  private blankScene = new THREE.Scene();
  private blankCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private renderBlank(): void {
    this.blankScene.background = new THREE.Color(C.black);
    this.pr.render(this.blankScene, this.blankCam);
  }

  private applyTransitions(shot: Shot, t: number): void {
    const fx = this.pr.fx;
    const len = shot.end - shot.start;
    const tin = shot.in, tout = shot.out;
    if (tin.kind !== 'cut' && t < tin.dur) {
      const k = clamp(t / tin.dur);
      if (tin.kind === 'fade') fx.fade = Math.max(fx.fade, 1 - k);
      if (tin.kind === 'white') fx.flash = Math.max(fx.flash, 1 - k);
      if (tin.kind === 'iris') {
        fx.iris = easeInOut(k) * 300;
        fx.irisCenter.set(tin.x ?? 240, tin.y ?? 135);
      }
    }
    const rem = len - t;
    if (tout.kind !== 'cut' && rem < tout.dur) {
      const k = clamp(1 - rem / tout.dur);
      if (tout.kind === 'fade') fx.fade = Math.max(fx.fade, k);
      if (tout.kind === 'iris') {
        fx.iris = (1 - easeInOut(k)) * 300;
        fx.irisCenter.set(tout.x ?? 240, tout.y ?? 135);
      }
    }
  }

  private drawSubtitles(g: CanvasRenderingContext2D, T: number): void {
    const v: VoiceCue | undefined = [...this.tl.voices].reverse().find((c) => T >= c.t && T < c.t + c.dur + 0.35);
    if (!v) return;
    this.pr.markOverlay();
    const f = this.fonts.body;
    const speaker = SPEAKER[v.who];
    // long lines are split into pages of at most two rows, timed by their share of characters
    const lines = f.wrap(v.text, 432);
    const pages: string[][] = [];
    for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
    const total = v.text.length;
    let acc = 0;
    let page = pages[pages.length - 1];
    let pageStart = 0, pageLen = 1;
    for (const p of pages) {
      const len = p.join(' ').length + 1;
      const start = v.t + (v.dur * acc) / total;
      const end = v.t + (v.dur * (acc + len)) / total;
      if (T < end || p === pages[pages.length - 1]) {
        page = p;
        pageStart = start;
        pageLen = end - start;
        break;
      }
      acc += len;
    }
    const progress = clamp(((T - pageStart) / Math.max(0.25, pageLen)) * 1.3);
    let remaining = Math.ceil(page.join(' ').length * progress);
    const lh = 15;
    const y0 = 270 - 10 - page.length * lh;
    const color = speaker ? C.white : C.straw;
    page.forEach((full, i) => {
      const shown = full.slice(0, Math.max(0, Math.min(full.length, remaining)));
      remaining -= full.length + 1;
      const x = 240 - Math.floor(f.measure(full) / 2);
      f.draw(g, shown, x, y0 + i * lh, { color, outline: C.black });
    });
    if (speaker) {
      const s = this.fonts.small;
      const w = s.measure(speaker.name);
      const lx = 240 - Math.floor(w / 2);
      const ly = y0 - 12;
      g.fillStyle = C.black;
      g.fillRect(lx - 3, ly - 2, w + 6, 11);
      s.draw(g, speaker.name, lx, ly, { color: speaker.color });
    }
  }
}
