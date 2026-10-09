import '@fontsource/pixelify-sans/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/tiny5/400.css';
import '@fontsource/jersey-10/400.css';
import { IntroPlayer } from './intro/player';
import { C } from './engine/palette';
import { AudioEngine } from './audio/engine';

/**
 * Entry point. Plays the intro cutscene in real time (synced to the audio clock), or, with
 * ?capture, exposes a frame-exact API used by tools/render-movie.mjs to export the film.
 *
 *   ?t=42      start at 42 s (development)
 *   ?nosubs    hide subtitles
 *   ?capture   offline frame/audio rendering API on window.__autosheep
 */
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLDivElement;
const hint = document.getElementById('hint') as HTMLDivElement;

const player = new IntroPlayer(canvas);
if (params.has('nosubs')) player.subtitles = false;

function fit(): void {
  const fixed = params.get('scale');
  // keep a small gutter around the picture so it never touches the window edge
  const gutter = fixed ? 0 : 32;
  player.pr.resize(stage.clientWidth - gutter, stage.clientHeight - gutter, window.devicePixelRatio || 1, fixed ? +fixed : undefined);
}

async function boot(): Promise<void> {
  await player.init();
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
    g.fillRect(118, 214, 244, 40);
    g.fillStyle = C.straw;
    g.fillRect(118, 214, 244, 1);
    g.fillRect(118, 253, 244, 1);
    if (Math.floor(now * 2) % 2 === 0) f.body.draw(g, 'CLICK OR PRESS ANY KEY', 240, 220, { color: C.straw, align: 'center' });
    f.tiny.draw(g, 'TO PLAY THE INTRO  -  SOUND ON  -  ESC SKIPS  -  S SUBTITLES', 240, 240, { color: C.fog, align: 'center' });
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

  const start = async () => {
    if (started) return;
    started = true;
    player.overlayHook = null;
    const ctx = new AudioContext({ latencyHint: 'playback' });
    await ctx.resume();
    const audio = await player.prepareAudio(ctx);
    run(audio, startAt);
  };
  window.addEventListener('pointerdown', start, { once: false });
  window.addEventListener('keydown', start, { once: false });
}

function run(audio: AudioEngine, offset: number): void {
  const dur = player.tl.duration;
  audio.startRealtime(offset);
  let skipped = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S') player.subtitles = !player.subtitles;
    if (e.key === 'Escape' && !skipped) {
      skipped = true;
      audio.stop();
      const title = player.tl.shots.find((s) => s.name === 'title')!;
      audio.startRealtime(title.start);
    }
  });
  hint.textContent = 'ESC skip · S subtitles';
  const tick = () => {
    const T = Math.min(audio.now(), dur - 0.001);
    player.frame(Math.max(0, T));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

declare global {
  interface Window {
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
