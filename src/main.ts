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
  // the start screen is the title diorama, idling, with a prompt over it
  const title = player.tl.shots.find((s) => s.name === 'title')!;
  const prompt = (now: number) => (g: CanvasRenderingContext2D) => {
    const f = player.fonts;
    g.fillStyle = C.black;
    g.fillRect(118, 210, 244, 48);
    g.fillStyle = C.straw;
    g.fillRect(118, 210, 244, 1);
    g.fillRect(118, 257, 244, 1);
    if (Math.floor(now * 2) % 2 === 0) f.body.draw(g, 'CLICK OR PRESS ANY KEY', 240, 215, { color: C.straw, align: 'center' });
    f.tiny.draw(g, 'TO PLAY THE INTRO  -  SOUND ON  -  ESC SKIPS  -  S SUBTITLES', 240, 235, { color: C.fog, align: 'center' });
    f.tiny.draw(g, 'OR PRESS G TO SKIP STRAIGHT TO THE HERDING', 240, 245, { color: C.lime, align: 'center' });
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
    started = true;
    player.overlayHook = null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.resume();
    if (e instanceof KeyboardEvent && e.key.toLowerCase() === 'g') {
      startGame(player.fonts, ctx);
      return;
    }
    const audio = await player.prepareAudio(ctx);
    run(audio, startAt, ctx);
  };
  window.addEventListener('pointerdown', start, { once: false });
  window.addEventListener('keydown', start, { once: false });
}

function run(audio: AudioEngine, offset: number, ctx: AudioContext): void {
  const dur = player.tl.duration;
  audio.startRealtime(offset);
  let skipped = false;
  let leaving = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 's' || e.key === 'S') player.subtitles = !player.subtitles;
    if (e.key === 'Escape' && !skipped) {
      skipped = true;
      audio.stop();
      const title = player.tl.shots.find((s) => s.name === 'title')!;
      audio.startRealtime(title.start);
    }
  };
  window.addEventListener('keydown', onKey);
  hint.textContent = 'ESC skip · S subtitles';
  const toGame = () => {
    if (leaving) return;
    leaving = true;
    audio.stop();
    window.removeEventListener('keydown', onKey);
    startGame(player.fonts, ctx);
  };
  const tick = () => {
    if (leaving) return;
    const T = Math.min(audio.now(), dur - 0.001);
    const ended = audio.now() >= dur;
    player.overlayHook = ended ? endPrompt(audio.now() - dur) : null;
    player.frame(Math.max(0, T));
    requestAnimationFrame(tick);
  };
  // once the film is over, any key or click starts the game
  const waitEnd = (e: Event) => {
    if (audio.now() < dur) return;
    if (e instanceof KeyboardEvent && (e.key === 's' || e.key === 'S')) return;
    window.removeEventListener('keydown', waitEnd);
    window.removeEventListener('pointerdown', waitEnd);
    toGame();
  };
  window.addEventListener('keydown', waitEnd);
  window.addEventListener('pointerdown', waitEnd);
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
  window.addEventListener('pointerdown', (e) => {
    toOverlay(e);
    if (e.button === 0) inp.press = true;
    if (e.button === 2) inp.bucket = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) inp.press = false;
    if (e.button === 2) inp.bucket = false;
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
    inp.press = false;
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
