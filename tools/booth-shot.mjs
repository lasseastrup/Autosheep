// Screenshots of a shearing booth at work (and the menus):
//   node tools/booth-shot.mjs <outDir>
// Needs `npm run build:single` first (or URL=...).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [outDir] = process.argv.slice(2);
const url = process.env.URL ?? `file://${process.cwd()}/dist-single/index.html?game&manual&scale=2`;
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
const tick = (n) => page.evaluate((k) => window.__game.tick(k), n);
await page.evaluate(() => window.__game.begin());
await tick(4);
await shot('00-title');
await page.evaluate(() => window.__game.game.buttonDown('start'));
await tick(120);
await shot('01-start');
// the flock, woolly, at the mouth of booth 3; Gafoop standing off behind it; no monsters
await page.evaluate(() => {
  const r = window.__game.game.run;
  r.spawning = false;
  const b = r.booths[3].site;
  for (let j = 0; j < 8; j++) {
    r.wool[j] = 1;
    r.model.hold(j);
    r.model.place(j, b.mx + 3 + (j % 3) * 1.2, b.my - 1 + Math.floor(j / 3) * 1.2);
    r.model.release(j);
  }
  r.gafoop.x = r.gafoop.px = b.mx + 7;
  r.gafoop.y = r.gafoop.py = b.my + 1;
  window.__game.game.cam.zoomIndex = 2;
});
await tick(4);
for (const [n, name] of [[10, '02-hop-in'], [20, '03-shearing'], [20, '04-shearing'], [24, '05-hop-off'], [60, '06-next'], [200, '07-later']]) {
  for (let k = 0; k < n; k += 2) {
    await tick(2);
    // take any level-up's first card, so the cards do not hide the booth
    await page.evaluate(() => { const r = window.__game.game.run; if (r.choices) r.choose(0); });
  }
  await shot(name);
}
await page.evaluate(() => window.__game.game.buttonDown('pause'));
await tick(2);
await shot('08-paused');
await browser.close();
