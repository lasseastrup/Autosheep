// Render the intro to an MP4: deterministic frames from headless Chromium + offline audio.
//
//   node tools/render-movie.mjs [--fps 30] [--scale 2] [--workers 2] [--from 0] [--to <dur>] [--out out/movie]
//
// Needs the dev server (npm run dev) or set URL to a built page. Frames already on disk are
// skipped, so an interrupted render resumes where it stopped.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const fps = +(args.fps ?? 30);
const scale = +(args.scale ?? 2);
const workers = +(args.workers ?? 2);
const out = args.out ?? 'out/movie';
const base = process.env.URL ?? 'http://127.0.0.1:5173/';
const url = `${base}?capture&scale=${scale}`;
const framesDir = path.join(out, 'frames');
fs.mkdirSync(framesDir, { recursive: true });

const launch = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 480 * scale, height: 270 * scale } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__autosheep?.ready, null, { timeout: 180000 });
  return page;
}

const probe = await launch();
const page0 = await openPage(probe);
const duration = await page0.evaluate(() => window.__autosheep.duration);
const from = +(args.from ?? 0), to = Math.min(+(args.to ?? duration), duration);
const first = Math.round(from * fps), last = Math.floor(to * fps - 1e-6);
const total = last - first + 1;
console.log(`duration ${duration.toFixed(2)}s -> frames ${first}..${last} (${total}) at ${fps} fps, ${480 * scale}x${270 * scale}`);

// audio (offline, full length)
const wavPath = path.join(out, 'audio.wav');
if (!fs.existsSync(wavPath)) {
  const t0 = Date.now();
  const b64 = await page0.evaluate(() => window.__autosheep.renderAudio(48000));
  fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
  console.log(`audio rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await probe.close();

const started = Date.now();
let done = 0;
async function worker(k) {
  const lo = first + Math.floor((total * k) / workers);
  const hi = first + Math.floor((total * (k + 1)) / workers) - 1;
  const browser = await launch();
  const page = await openPage(browser);
  for (let i = lo; i <= hi; i++) {
    const file = path.join(framesDir, `${String(i).padStart(6, '0')}.png`);
    if (fs.existsSync(file)) {
      done++;
      continue;
    }
    const data = await page.evaluate((T) => {
      window.__autosheep.frame(T);
      return window.__autosheep.grab();
    }, i / fps);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    done++;
    if (done % 100 === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`${done}/${total} frames  ${(done / el).toFixed(2)} fps  eta ${(((total - done) / done) * el / 60).toFixed(1)} min`);
    }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: workers }, (_, k) => worker(k)));
console.log(`frames done in ${((Date.now() - started) / 60000).toFixed(1)} min`);

if (from === 0 && to === duration) {
  const mp4 = path.join(out, 'autosheep-intro.mp4');
  const r = spawnSync('ffmpeg', [
    '-y', '-framerate', String(fps), '-i', path.join(framesDir, '%06d.png'), '-i', wavPath,
    '-vf', 'scale=1920:1080:flags=neighbor', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4,
  ], { stdio: 'inherit' });
  if (r.status === 0) console.log(`wrote ${mp4} (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`);
}
