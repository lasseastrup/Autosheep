// Screenshots of the game, driven frame by frame: node tools/game-shot.mjs <outDir> [script]
//   script "start": a few frames after starting
//   script "herd":  a scripted shepherd drives the flock into the pen and shuts the gate
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [outDir, script = 'start'] = process.argv.slice(2);
const url = process.env.URL ?? 'file:///home/user/Autosheep/dist-single/index.html?game&manual&scale=2';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
const shot = async (name) => {
  const data = await page.evaluate(() => window.__game.grab());
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', name);
};
await page.evaluate(() => window.__game.begin());
await page.evaluate(() => window.__game.tick(30));
await shot('00-start');

if (script === 'start') {
  // fly toward the flock
  await page.evaluate(() => {
    const g = window.__game.game;
    g.input.pointer = { x: 420, y: 180 };
    window.__game.tick(120);
  });
  await shot('01-approach');
  await page.evaluate(() => {
    const g = window.__game.game;
    g.input.bucket = true;
    window.__game.tick(90);
  });
  await shot('02-bucket');
  await page.evaluate(() => {
    const g = window.__game.game;
    g.input.bucket = false;
    g.input.hits.push(' ');
    window.__game.tick(12);
  });
  await shot('03-honk');
  await page.evaluate(() => { window.__game.game.input.hits.push('e'); window.__game.tick(40); });
  await shot('04-rotated');
}

if (script === 'herd') {
  const result = await page.evaluate(() => {
    const G = window.__game;
    const g = G.game;
    const pen = { x0: 90, y0: 39.5, x1: 101, y1: 51.5 };
    const goal = { x: 91, y: 45.5 };
    const inPen = (o, i) => o.x[i] > pen.x0 && o.x[i] < pen.x1 && o.y[i] > pen.y0 && o.y[i] < pen.y1;
    let standoff = 7;
    const log = [];
    for (let f = 0; f < 60 * 400; f++) {
      const o = g.model.out;
      let gx = 0, gy = 0, n = 0, spd = 0;
      for (let i = 0; i < o.count; i++) if (!inPen(o, i)) { gx += o.x[i]; gy += o.y[i]; spd += o.speed[i]; n++; }
      if (n === 0) {
        if (!g.gateClosed) g.input.hits.push('g');
        G.tick(1, 1 / 60, false);
        if (g.won) { G.tick(150, 1 / 60, false); G.tick(1); break; }
        continue;
      }
      gx /= n; gy /= n; spd /= n;
      if (spd < 0.6) standoff -= 0.8 / 60; else if (spd > 2.2) standoff += 1.5 / 60;
      standoff = Math.max(4, Math.min(8, standoff));
      let far = -1, farD = 0;
      for (let i = 0; i < o.count; i++) if (!inPen(o, i)) { const d = Math.hypot(o.x[i] - gx, o.y[i] - gy); if (d > farD) { farD = d; far = i; } }
      let cx = gx, cy = gy, ux = gx - goal.x, uy = gy - goal.y, so = standoff;
      if (farD > Math.pow(n, 2 / 3) + 1) { cx = o.x[far]; cy = o.y[far]; ux = cx - gx; uy = cy - gy; so = 3; }
      const ul = Math.hypot(ux, uy) || 1;
      const p = g.gafoop.pos;
      let tx = cx + (ux / ul) * so, ty = cy + (uy / ul) * so;
      const mx = p.x - cx, my = p.z - cy, ml = Math.hypot(mx, my);
      if ((mx * ux + my * uy) / (ul * (ml || 1)) < 0.2 && ml < so * 2.2) {
        const side = mx * -uy + my * ux >= 0 ? 1 : -1;
        const a = Math.atan2(my, mx) + side * 0.6;
        tx = cx + Math.cos(a) * so * 1.3; ty = cy + Math.sin(a) * so * 1.3;
      }
      // the in-game control: the cursor sits where Gafoop should go
      const sp = g.cam.toScreen(p.clone().set(tx, 0, ty));
      g.input.pointer = { x: Math.max(0, Math.min(640, sp.x)), y: Math.max(0, Math.min(360, sp.y)) };
      G.tick(1, 1 / 60, [25, 55, 100].some((t) => f === 60 * t));
      if (f % 600 === 0) log.push(`t=${g.clock.toFixed(0)} penned=${g.pennedCount} gafoop=${p.x.toFixed(0)},${p.z.toFixed(0)} flock=${gx.toFixed(0)},${gy.toFixed(0)}`);
      if ([25, 55, 100].some((t) => f === 60 * t)) { (window.__shots ??= []).push(G.grab()); }
    }
    return { log, won: !!g.won, clock: g.clock, penned: g.pennedCount };
  });
  console.log(result.log.join('\n'));
  console.log('won', result.won, 'clock', result.clock.toFixed(1), 'penned', result.penned);
  const mids = await page.evaluate(() => window.__shots ?? []);
  mids.forEach((d, i) => fs.writeFileSync(`${outDir}/09-mid${i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  await shot('10-herded');
}
await browser.close();
