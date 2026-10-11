// Screenshots of the run's items at work: Gafoop given a spread of armaments, a usable and
// provisions, the harness's bot flying him; and a level-up's cards.
//   node tools/items-shot.mjs <outDir> [seconds]
//   ITEMS='{"planes":3,...}' (what he has), CLOSE=1 (close up, him parked; with TOUCH=1 as on a
//   phone, PRESS=1 to press the usable every other shot)
// Needs `npm run build:single` first (or URL=...).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [outDir, secondsArg = '40'] = process.argv.slice(2);
const seconds = Number(secondsArg);
const url = process.env.URL ?? `file://${process.cwd()}/dist-single/index.html?game&manual&scale=2`;
const items = JSON.parse(process.env.ITEMS ?? '{"stamp":3,"planes":3,"tape":3,"cabinet":3,"rams":3,"collie":2,"drone":2,"woof":2}');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
const shot = async (name) => {
  const data = await page.evaluate(() => window.__game.grab());
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', name);
};
const tick = (n) => page.evaluate((k) => window.__game.tick(k), n);
await page.evaluate(() => window.__game.begin());
await tick(4);
await page.evaluate(() => window.__game.game.buttonDown('start'));
await tick(30);
// the first level-up's cards, as dealt
await page.evaluate(() => { const r = window.__game.game.run; r.pending = 1; r.choices = r.deal(); });
await tick(2);
await shot('00-cards');
await page.evaluate(() => window.__game.game.run.choose(0));
// close up: the flock at rest, Gafoop beside it with the items, a clump of Gloops coming in
if (process.env.CLOSE) {
  await page.evaluate(([items, touch]) => {
    const g = window.__game.game;
    const r = g.run;
    r.time = 120;
    r.spawning = false;
    // exactly these (the first card's pick would make a second usable)
    r.items.clear();
    for (const [id, l] of Object.entries(items)) r.items.set(id, l);
    const f = r.flockCentre();
    r.gafoop.x = r.gafoop.px = f.x + 4;
    r.gafoop.y = r.gafoop.py = f.y + 2;
    g.cam.zoomIndex = 2;
    // TOUCH=1: as on a phone (the usable's button on screen)
    if (touch) g.touch = true;
    for (let k = 0; k < 7; k++) r.enemies.spawn('gloop', f.x + 9 + (k % 3), f.y - 6 + Math.floor(k / 3), 1);
    r.enemies.spawn('bigGloop', f.x - 9, f.y + 4, 1);
  }, [items, !!process.env.TOUCH]);
  for (let k = 1; k <= 10; k++) {
    // PRESS=1: the usable's button goes down every other shot
    if (process.env.PRESS && k % 2 === 0) await page.evaluate(() => window.__game.game.buttonDown('use'));
    await tick(12);
    await page.evaluate(() => window.__game.game.buttonUp('use'));
    await tick(12);
    await page.evaluate(() => { const r = window.__game.game.run; if (r.choices) r.choose(0); });
    await shot(`close-${String(k).padStart(2, '0')}`);
  }
  await browser.close();
  process.exit(0);
}
// two minutes in, with the items
await page.evaluate((items) => {
  const g = window.__game.game;
  const r = g.run;
  r.time = 120;
  r.items.clear();
  for (const [id, l] of Object.entries(items)) r.items.set(id, l);
  g.autopilot = true;
}, items);
const every = Number(process.env.EVERY ?? 4);
for (let t = every; t <= seconds; t += every) {
  for (let k = 0; k < every * 60; k += 30) {
    await tick(30);
    await page.evaluate(() => { const r = window.__game.game.run; if (r.choices) r.choose(0); });
  }
  await shot(`${String(t).padStart(3, '0')}-play`);
}
await browser.close();
