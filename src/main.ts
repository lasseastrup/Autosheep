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
import { W as GW, H as GH, type ButtonId } from './game/hud';
import { loader } from './loading';
import { PixelRenderer } from './engine/pixelRenderer';

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
// the movie and screenshot tools read frames back from the canvas
PixelRenderer.keepFrames = params.has('capture') || params.has('manual');
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLDivElement;
const hint = document.getElementById('hint') as HTMLDivElement;

let player!: IntroPlayer;
let introFit: (() => void) | null = null;

/** Errors, a lost WebGL context: on screen as well as in the console (see loading.ts). */
function reportProblems(): void {
  window.addEventListener('error', (e) => loader.problem(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => loader.problem(`error: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));
  canvas.addEventListener('webglcontextlost', () => loader.problem('the browser took the graphics away (WebGL context lost)'));
  canvas.addEventListener('webglcontextrestored', () => loader.problem('the graphics came back (WebGL context restored)'));
}

function fitTo(resize: (w: number, h: number, dpr: number, fixed?: number) => void, gutterPx = 32): () => void {
  return () => {
    const fixed = params.get('scale');
    // the film keeps a small gutter so it never touches the window edge; the game is full-bleed
    const gutter = fixed ? 0 : gutterPx;
    resize(stage.clientWidth - gutter, stage.clientHeight - gutter, window.devicePixelRatio || 1, fixed ? +fixed : undefined);
  };
}

/**
 * One AudioContext for the whole page. Created early, suspended (browsers allow that), so the
 * voices can be decoded behind the start screen; a click then only has to resume it, which
 * must happen inside the click handler itself.
 */
let audioCtx: AudioContext | null = null;
function audioContext(): AudioContext {
  audioCtx ??= new AudioContext({ latencyHint: 'interactive' });
  return audioCtx;
}

async function boot(): Promise<void> {
  // every slow piece of start-up is a named step on a loading screen (L shows the log)
  if (params.has('capture')) loader.disable();
  else loader.boot();
  reportProblems();
  const step = loader.step.bind(loader);
  if (params.has('game')) {
    const fonts = await step('fonts', () => loadFonts());
    await startGame(fonts, null);
    loader.status();
    return;
  }
  player = await step('starting the renderer', () => new IntroPlayer(canvas));
  if (params.has('nosubs')) player.subtitles = false;
  await player.init(step);
  introFit = fitTo((w, h, d, f) => player.pr.resize(w, h, d, f));
  introFit();
  window.addEventListener('resize', introFit);

  if (params.has('capture')) {
    exposeCaptureApi();
    return;
  }

  // a title-ish start screen: audio needs a user gesture
  const startAt = +(params.get('t') ?? 0);
  let started = false;
  /** set while a click waits for something still loading; the start screen keeps moving */
  let loading = false;
  /** which steps that click is waiting for, to name them under LOADING */
  let waitingFor: readonly string[] = [];

  // the start screen is the title diorama, idling, with two buttons over it
  const title = player.tl.shots.find((s) => s.name === 'title')!;
  const prompt = (now: number) => (g: CanvasRenderingContext2D) => {
    const f = player.fonts;
    const hover = pointerAt ? hit(pointerAt.x, pointerAt.y) : null;
    if (loading) {
      loadingLabel(g, f, now, waitingFor);
      return;
    }
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
    if (started && !loading) return;
    drawStart(now / 1000);
    requestAnimationFrame(idle);
  };
  // the menu's first frame compiles the title's shaders: a step of its own
  await step('first menu frame', () => drawStart(0));
  loader.status();
  requestAnimationFrame(idle);

  // Everything else slow happens behind the start screen, not after the click: decoding the
  // voices, compiling the intro's shaders, then building and warming the game. Compiling
  // shaders on first use is what used to freeze the screen for a second or more.
  // one after another, so the loading log can pin any stall on a single step
  const voices = step('voices', () => player.prepareAudio(audioContext()));
  const introWarm = voices.then(() => player.warmUp(step));
  let introChosen = false;
  void introWarm.then(() => {
    // building the game would stutter the film, so if the intro is already playing it waits
    // for the film to end
    if (!introChosen) void prepareGame(player.fonts);
  });

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
    // resume inside the gesture, before any await, or phones keep the audio muted
    const ctx = audioContext();
    void ctx.resume();
    loading = true;
    waitingFor = skip ? GAME_STEPS : INTRO_STEPS;
    if (skip) {
      await startGame(player.fonts, ctx, () => (loading = false));
      return;
    }
    introChosen = true;
    const audio = await voices;
    await introWarm;
    loading = false;
    player.overlayHook = null;
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
  /** film time at which we left for the game (the picture holds there while it loads) */
  let leftAt: number | null = null;
  let gone = false;
  const toGame = () => {
    if (leftAt !== null) return;
    leftAt = Math.min(audio.now(), dur - 0.001);
    audio.stop();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
    void startGame(player.fonts, ctx, () => (gone = true));
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
  const tick = (now: number) => {
    if (gone) return;
    if (leftAt !== null) {
      player.overlayHook = (g) => loadingLabel(g, player.fonts, now / 1000, GAME_STEPS);
      player.frame(Math.max(0, leftAt));
      requestAnimationFrame(tick);
      return;
    }
    const T = Math.min(audio.now(), dur - 0.001);
    const ended = audio.now() >= dur;
    // the film is over: now is the time to build the game, behind the end card
    if (ended) void prepareGame(player.fonts);
    player.overlayHook = ended ? endPrompt(audio.now() - dur) : skipButton;
    player.frame(Math.max(0, T));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const GAME_STEPS = ['game'];
const INTRO_STEPS = ['voices', 'intro'];

/** LOADING, and what it is waiting for, over a still-animating screen. */
function loadingLabel(g: CanvasRenderingContext2D, f: Fonts, now: number, waitingFor: readonly string[]): void {
  const what = loader.current(waitingFor);
  const text = 'LOADING' + '.'.repeat(1 + (Math.floor(now * 3) % 3));
  const detail = what ? what.toUpperCase() : '';
  const w = Math.max(100, f.tiny.measure(detail) + 16);
  const x = Math.round(240 - w / 2);
  g.fillStyle = C.black;
  g.fillRect(x, 216, w, detail ? 28 : 20);
  g.fillStyle = C.straw;
  g.fillRect(x, 216, w, 1);
  g.fillRect(x, 216 + (detail ? 27 : 19), w, 1);
  f.small.draw(g, text, 240 - 30, 222, { color: C.straw });
  if (detail) f.tiny.draw(g, detail, 240, 233, { color: C.fog, align: 'center' });
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

/** The game, built and warmed on a hidden canvas so that switching to it is instant. */
let preparing: Promise<Game> | null = null;
function prepareGame(fonts: Fonts): Promise<Game> {
  preparing ??= (async () => {
    // Behind the menu the game is built on the menu's own WebGL renderer and draws nothing to
    // the screen; starting it just hands it the canvas. (It used to have a hidden canvas and a
    // WebGL context of its own, which phones can take away while it waits.)
    const game = await loader.step('game: building the level', () => {
      const g = new Game(player ? player.pr.renderer : canvas, fonts, Number(params.get('level') ?? 1));
      if (player) g.pr.offscreen = true;
      else fitGame(g)();
      return g;
    });
    await loader.step('game: compiling shaders', () => game.warm());
    // one real frame compiles what warm() cannot reach (shadow depth, post-processing)
    await loader.step('game: first frame', () => game.frame(0));
    return game;
  })();
  return preparing;
}

function fitGame(game: Game): () => void {
  return fitTo((w, h, d, f) => {
    game.pr.resize(w, h, d, f);
    game.portrait = window.innerHeight > window.innerWidth;
  }, 0);
}

/**
 * Replace the intro with the game, once it is ready. `ctx` is null when no user gesture has
 * happened yet; `ready` is called just before the intro's canvas goes away.
 */
async function startGame(fonts: Fonts, ctx: AudioContext | null, ready?: () => void): Promise<void> {
  const game = await prepareGame(fonts);
  ready?.();
  // the intro's loops have stopped; the game takes over its canvas
  if (player) {
    if (introFit) window.removeEventListener('resize', introFit);
    player.dispose();
  }
  game.pr.offscreen = false;
  canvas.style.cursor = 'none';
  document.body.dataset.scene = 'game';
  const fit = fitGame(game);
  fit();
  window.addEventListener('resize', fit);
  hint.textContent = '';
  wireInput(game, canvas);

  // The game starts on the tap; the sound joins when the audio is running. (Waiting for it
  // first left the game frozen on its first frame where resuming the audio never finished.)
  const begin = (c: AudioContext) => {
    game.begin(new GameAudio(c));
    if (c.state !== 'running') {
      void loader.step('audio: starting', () => new Promise<void>((resolve) => {
        const check = () => {
          if (c.state !== 'running') return;
          c.removeEventListener('statechange', check);
          resolve();
        };
        c.addEventListener('statechange', check);
        check();
      }));
    }
  };
  if (ctx) begin(ctx);
  else {
    // the first click starts the audio and the clock
    const first = () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
      const c = audioContext();
      void c.resume();
      begin(c);
    };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
  }

  if (params.has('manual')) {
    window.__game = {
      game,
      tick: (n: number, dt = 1 / 60, draw = true) => { for (let i = 0; i < n; i++) game.frame(dt, draw && i === n - 1); },
      begin: () => game.begin(null),
      grab: () => canvas.toDataURL('image/png'),
    };
    game.frame(0);
    return;
  }
  let last = performance.now();
  const loop = (now: number) => {
    // asked for first, so an error in one frame cannot stop the game
    requestAnimationFrame(loop);
    const dt = (now - last) / 1000;
    last = now;
    // smoothed frame rate, and the time the frame takes on the main thread
    if (dt > 0) game.perf.fps += (1 / dt - game.perf.fps) * 0.05;
    const t0 = performance.now();
    try {
      game.frame(dt);
    } catch (e) {
      loader.problem(`error in a frame: ${e instanceof Error ? e.message : String(e)}`);
    }
    game.perf.ms += (performance.now() - t0 - game.perf.ms) * 0.05;
  };
  requestAnimationFrame(loop);
}

function wireInput(game: Game, el: HTMLCanvasElement): void {
  const inp = game.input;
  const toOverlay = (e: PointerEvent): { x: number; y: number } | null => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * GW;
    const y = ((e.clientY - r.top) / r.height) * GH;
    return x >= 0 && x <= GW && y >= 0 && y <= GH ? { x, y } : null;
  };
  // Every pointer (mouse, or each finger) gets a role when it goes down: an on-screen button,
  // or steering Gafoop. A mouse steers just by hovering and feeds while a button is held; a
  // finger steers while it is down, and feeds with the FEED button, so one thumb can hold the
  // bucket while the other flies.
  const roles = new Map<number, ButtonId | 'move'>();
  // In build mode a pointer on the ground is a tap (it places something) unless it moves
  // more than a few pixels, which makes it a drag (it pans the view).
  const presses = new Map<number, { last: { x: number; y: number }; moved: number }>();
  window.addEventListener('pointerdown', (e) => {
    const p = toOverlay(e);
    if (!p) return;
    if (e.pointerType !== 'mouse' && !game.touch) game.touch = true;
    const b = game.buttonAt(p.x, p.y);
    if (b) {
      roles.set(e.pointerId, b);
      game.buttonDown(b);
      return;
    }
    roles.set(e.pointerId, 'move');
    inp.pointer = p;
    if (game.building) {
      presses.set(e.pointerId, { last: p, moved: 0 });
      return;
    }
    if (e.pointerType === 'mouse') inp.bucket = (e.buttons & 3) !== 0;
  });
  window.addEventListener('pointermove', (e) => {
    const p = toOverlay(e);
    if (e.pointerType === 'mouse') inp.pointer = p;
    else if (p && roles.get(e.pointerId) === 'move') inp.pointer = p;
    const press = presses.get(e.pointerId);
    if (press && p && game.building) {
      const dx = p.x - press.last.x;
      const dy = p.y - press.last.y;
      press.moved += Math.hypot(dx, dy);
      press.last = p;
      if (press.moved > 6) {
        inp.drag.dx += dx;
        inp.drag.dy += dy;
      }
    }
  });
  const up = (e: PointerEvent) => {
    const r = roles.get(e.pointerId);
    roles.delete(e.pointerId);
    if (r && r !== 'move') game.buttonUp(r);
    const press = presses.get(e.pointerId);
    presses.delete(e.pointerId);
    if (press && game.building && e.type === 'pointerup' && press.moved <= 6) {
      // right-click finishes a race; anything else is a tap where the pointer is
      if (e.pointerType === 'mouse' && e.button === 2) inp.hits.push('enter');
      else inp.taps.push(press.last);
    }
    if (e.pointerType === 'mouse') inp.bucket = !game.building && r === 'move' && (e.buttons & 3) !== 0;
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (!e.repeat) inp.hits.push(k);
    inp.keys.add(k);
  });
  window.addEventListener('keyup', (e) => inp.keys.delete(e.key.toLowerCase()));
  window.addEventListener('wheel', (e) => {
    // the loading log scrolls; everywhere else the wheel zooms
    if (e.target instanceof Element && e.target.closest('#loading')) return;
    e.preventDefault();
    inp.wheel += Math.sign(e.deltaY);
  }, { passive: false });
  window.addEventListener('blur', () => {
    inp.keys.clear();
    inp.bucket = false;
    inp.feed = false;
    for (const r of roles.values()) if (r !== 'move') game.buttonUp(r);
    roles.clear();
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
