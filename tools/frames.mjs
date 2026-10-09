// Render specific intro frames: node tools/frames.mjs <outDir> <t1> <t2> ... (or "shots" for each shot's midpoint)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [outDir, ...times] = process.argv.slice(2);
const url = process.env.URL ?? 'http://127.0.0.1:5173/?capture&scale=2';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__autosheep?.ready, null, { timeout: 120000 });
const info = await page.evaluate(() => ({ duration: window.__autosheep.duration, shots: window.__autosheep.shots }));
let ts = times.map(Number);
if (times[0] === 'shots') {
  ts = info.shots.map((s) => +(s.start + (s.end - s.start) * (times[1] ? +times[1] : 0.5)).toFixed(2));
  console.log(info.shots.map((s) => `${s.name} ${s.start.toFixed(2)}-${s.end.toFixed(2)}`).join('\n'), '\nduration', info.duration.toFixed(2));
}
for (const t of ts) {
  const t0 = Date.now();
  const data = await page.evaluate((T) => { window.__autosheep.frame(T); return window.__autosheep.grab(); }, t);
  fs.writeFileSync(`${outDir}/f_${String(t.toFixed(2)).padStart(7, '0')}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('frame', t, `${Date.now() - t0}ms`);
}
await browser.close();
