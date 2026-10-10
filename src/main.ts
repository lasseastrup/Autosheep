import '@fontsource/pixelify-sans/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/tiny5/400.css';
import '@fontsource/jersey-10/400.css';
import { IntroPlayer } from './intro/player';
import { C } from './engine/palette';
import { AudioEngine } from './audio/engine';
import { loadFonts, type Fonts } from './engine/bitmapFont';
import { Game } from './game/game';
import { GameAudio } from './game/gameAudio';
import { W as GW, H as GH } from './game/hud';

/**
 * Entry point. Plays the intro cutscene in real time (synced to the audio clock), then the
 * game. With ?capture it exposes a frame-exact API used by tools/render-movie.mjs instead.
 *
 *   ?game      skip the intro and go straight to herding
 *   ?manual    (with ?game) no animation loop; tooling drives frames through window.__game
 *   ?t=42      start the intro at 42 s (development)
 *   ?nosubs    hide subtitles
 *   ?capture   offline frame/audio rendering API on window.__autosheep
 */
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLDivElement;
const hint = document.getElementById('hint') as HTMLDivElement;

let player!: IntroPlayer;

function fitTo(resize: (w: number, h: number, dpr: number, fixed?: number) => void, gutterPx = 32): () => void {
  return () => {
    const fixed = params.get('scale');
    // the film keeps a small gutter so it never touches the window edge; the game is full-bleed
    const gutter = fixed ? 0 : gutterPx;
    resize(stage.clientWidth - gutter, stage.clientHeight - gutter, window.devicePixelRatio || 1, fixed ? +fixed : undefined);
  };
}

async function boot(): Promise<void> {
  if (params.has('game')) {
    const fonts = await loadFonts();
    startGame(fonts, null);
    return;
  }
  player = new IntroPlayer(canvas);
  if (params.has('nosubs')) player.subtitles = false;
  await player.init();
  const fit = fitTo((w, h, d, f) => player.pr.resize(w, h, d, f));
  fit();
  window.addEventListener('resize', fit);

  if (params.has('capture')) {
    exposeCaptureApi();
    return;
  }

  // a title-ish start screen: audio needs a user gesture
  const startAt = +(params.get('t') ?? 0);
  let started = false;
  // the start screen is the title diorama, idling, with two buttons over it
  const title = player.tl.shots.find((s) => s.name === 'title')!;
  const prompt = (now: number) => (g: CanvasRenderingContext2D) => {
    const f = player.fonts;
    const hover = pointerAt ? hit(pointerAt.x, pointerAt.y) : null;
    button(g, f, WATCH, 'WATCH THE INTRO', 'ENTER', hover === WATCH || (hover === null && Math.floor(now * 2) % 2 === 0), C.straw);
    button(g, f, SKIP, 'SKIP TO THE GAME', 'ESC', hover === SKIP, C.lime);
    f.tiny.draw(g, 'SOUND ON  -  THE INTRO IS 3 MINUTES  -  ESC SKIPS IT AT ANY TIME', 240, 248, { color: C.fog, align: 'center' });
  };
  const drawStart = (now: number) => {
    player.overlayHook = prompt(now);
    const subs = player.subtitles;
    player.subtitles = false;
    player.frame(Math.min(title.start + 2.6 + now * 0.25, title.start + title.marks.press - 0.2));
    player.subtitles = subs;
  };
  const idle = (now: number) => {
    if (started) return;
    drawStart(now / 1000);
    requestAnimationFrame(idle);
  };
  requestAnimationFrame(idle);

  const start = async (e: Event) => {
    if (started) return;
    let skip = false;
    // Esc, G or the skip button go to the game; any other key or click plays the intro
    if (e instanceof KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (['shift', 'control', 'alt', 'meta', 'tab'].includes(k)) return;
      skip = k === 'escape' || k === 'g';
    } else if (e instanceof PointerEvent) {
      const p = toIntro(e);
      skip = hit(p.x, p.y) === SKIP;
    }
    started = true;
    player.overlayHook = null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.resume();
    if (skip) {
      startGame(player.fonts, ctx);
      return;
    }
    const audio = await player.prepareAudio(ctx);
    run(audio, startAt, ctx);
  };
  window.addEventListener('pointermove', (e) => (pointerAt = toIntro(e)));
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}

/** Buttons on the 480×270 intro screen. */
interface Box { x: number; y: number; w: number; h: number }
const WATCH: Box = { x: 112, y: 212, w: 124, h: 26 };
const SKIP: Box = { x: 244, y: 212, w: 124, h: 26 };
const SKIP_CORNER: Box = { x: 404, y: 6, w: 70, h: 14 };
let pointerAt: { x: number; y: number } | null = null;

function toIntro(e: PointerEvent): { x: number; y: number } {
  const r = player.pr.renderer.domElement.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * 480, y: ((e.clientY - r.top) / r.height) * 270 };
}

function hit(x: number, y: number, boxes: Box[] = [WATCH, SKIP]): Box | null {
  return boxes.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
}

function button(g: CanvasRenderingContext2D, f: Fonts, b: Box, label: string, key: string, lit: boolean, color: string): void {
  g.fillStyle = C.black;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = lit ? color : C.lilac;
  g.fillRect(b.x, b.y, b.w, 1);
  g.fillRect(b.x, b.y + b.h - 1, b.w, 1);
  g.fillRect(b.x, b.y, 1, b.h);
  g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
  f.small.draw(g, label, b.x + b.w / 2, b.y + 6, { color: lit ? color : C.mist, align: 'center' });
  f.tiny.draw(g, key, b.x + b.w / 2, b.y + 16, { color: C.fog, align: 'center' });
}

function run(audio: AudioEngine, offset: number, ctx: AudioContext): void {
  const dur = player.tl.duration;
  audio.startRealtime(offset);
  let leaving = false;
  const toGame = () => {
    if (leaving) return;
    leaving = true;
    audio.stop();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
    startGame(player.fonts, ctx);
  };
  // Esc, or the corner button, skips straight to the game; once the film is over, any key
  // or click does
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 's' || e.key === 'S') {
      player.subtitles = !player.subtitles;
      return;
    }
    if (e.key === 'Escape' || audio.now() >= dur) toGame();
  };
  const onPointer = (e: PointerEvent) => {
    const p = toIntro(e);
    if (audio.now() >= dur || hit(p.x, p.y, [SKIP_CORNER])) toGame();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer);
  hint.textContent = 'ESC skip intro · S subtitles';
  const skipButton = (g: CanvasRenderingContext2D) => {
    const f = player.fonts;
    const b = SKIP_CORNER;
    const lit = !!pointerAt && !!hit(pointerAt.x, pointerAt.y, [b]);
    g.fillStyle = C.black;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = lit ? C.lime : C.mauve;
    g.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    f.small.draw(g, 'SKIP  ESC', b.x + b.w / 2, b.y + 3, { color: lit ? C.lime : C.fog, align: 'center' });
  };
  const tick = () => {
    if (leaving) return;
    const T = Math.min(audio.now(), dur - 0.001);
    const ended = audio.now() >= dur;
    player.overlayHook = ended ? endPrompt(audio.now() - dur) : skipButton;
    player.frame(Math.max(0, T));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const endPrompt = (t: number) => (g: CanvasRenderingContext2D) => {
  if (t < 0.6) return;
  const f = player.fonts;
  const text = 'PRESS ANY KEY TO START HERDING';
  const w = f.body.measure(text) + 20;
  const x = Math.round(240 - w / 2);
  g.fillStyle = C.black;
  g.fillRect(x, 238, w, 22);
  g.fillStyle = C.lime;
  g.fillRect(x, 238, w, 1);
  g.fillRect(x, 259, w, 1);
  if (Math.floor(t * 2) % 2 === 0) f.body.draw(g, text, 240, 241, { color: C.lime, align: 'center' });
};

/** Replace the intro with the game. `ctx` is null when no user gesture has happened yet. */
function startGame(fonts: Fonts, ctx: AudioContext | null): void {
  if (player) {
    player.pr.renderer.dispose();
    player.pr.renderer.forceContextLoss();
  }
  canvas.remove();
  const gc = document.createElement('canvas');
  gc.style.cursor = 'none';
  stage.appendChild(gc);
  const game = new Game(gc, fonts);
  const fit = fitTo((w, h, d, f) => game.pr.resize(w, h, d, f), 0);
  fit();
  window.addEventListener('resize', fit);
  hint.textContent = '';
  wireInput(game, gc);

  const begin = async (c: AudioContext) => {
    await c.resume();
    game.begin(new GameAudio(c));
  };
  if (ctx) void begin(ctx);
  else {
    // the first click starts the audio and the clock
    const first = () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
      void begin(new AudioContext({ latencyHint: 'interactive' }));
    };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
  }

  if (params.has('manual')) {
    window.__game = {
      game,
      tick: (n: number, dt = 1 / 60, draw = true) => { for (let i = 0; i < n; i++) game.frame(dt, draw && i === n - 1); },
      begin: () => game.begin(null),
      grab: () => gc.toDataURL('image/png'),
    };
    game.frame(0);
    return;
  }
  let last = performance.now();
  const loop = (now: number) => {
    game.frame((now - last) / 1000);
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function wireInput(game: Game, el: HTMLCanvasElement): void {
  const inp = game.input;
  const toOverlay = (e: PointerEvent | MouseEvent) => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * GW;
    const y = ((e.clientY - r.top) / r.height) * GH;
    inp.pointer = x >= 0 && x <= GW && y >= 0 && y <= GH ? { x, y } : null;
  };
  window.addEventListener('pointermove', toOverlay);
  // holding either mouse button rattles the feed bucket
  window.addEventListener('pointerdown', (e) => {
    toOverlay(e);
    inp.bucket = (e.buttons & 3) !== 0;
  });
  window.addEventListener('pointerup', (e) => {
    inp.bucket = (e.buttons & 3) !== 0;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (!e.repeat) inp.hits.push(k);
    inp.keys.add(k);
  });
  window.addEventListener('keyup', (e) => inp.keys.delete(e.key.toLowerCase()));
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    inp.wheel += Math.sign(e.deltaY);
  }, { passive: false });
  window.addEventListener('blur', () => {
    inp.keys.clear();
    inp.bucket = false;
  });
}

declare global {
  interface Window {
    __game?: { game: Game; tick: (n: number, dt?: number, draw?: boolean) => void; begin: () => void; grab: () => string };
    __autosheep?: {
      duration: number;
      shots: { name: string; start: number; end: number; marks: Record<string, number> }[];
      frame: (T: number) => void;
      grab: () => string;
      renderAudio: (sampleRate?: number) => Promise<string>;
      ready: boolean;
    };
  }
}

function exposeCaptureApi(): void {
  window.__autosheep = {
    duration: player.tl.duration,
    shots: player.tl.shots.map((s) => ({ name: s.name, start: s.start, end: s.end, marks: s.marks })),
    frame: (T: number) => player.frame(T),
    grab: () => canvas.toDataURL('image/png'),
    renderAudio: async (sampleRate = 48000) => {
      const len = Math.ceil(player.tl.duration * sampleRate);
      const ctx = new OfflineAudioContext(2, len, sampleRate);
      const audio = await player.prepareAudio(ctx);
      audio.scheduleAll();
      const buf = await ctx.startRendering();
      return wavBase64(buf);
    },
    ready: true,
  };
}

function wavBase64(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

boot();
