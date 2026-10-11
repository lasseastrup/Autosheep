// Screenshots of the survivors run, driven frame by frame:
//   node tools/run-shot.mjs <outDir> [seconds]
// The title, the first seconds, a level-up's cards, then the harness's bot flies Gafoop and a
// shot is taken every few seconds of play. Needs `npm run build:single` first (or URL=...).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [outDir, secondsArg = '60'] = process.argv.slice(2);
const seconds = Number(secondsArg);
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
await tick(150);
await shot('01-start');
// play on by hand (Gafoop still) until the first level-up's cards are up
for (let k = 0; k < 60 && !(await page.evaluate(() => !!window.__game.game.run.choices)); k++) await tick(30);
await shot('02-cards');
await page.evaluate(() => { window.__game.game.autopilot = true; });
const every = Number(process.env.EVERY ?? 10);
for (let t = every; t <= seconds; t += every) {
  await tick(every * 60);
  const info = await page.evaluate(() => {
    const r = window.__game.game.run;
    return { time: r.time.toFixed(0), flock: r.flockCount, monsters: r.enemies.countOf(), level: r.level, over: r.over };
  });
  console.log(JSON.stringify(info));
  await shot(`${String(t).padStart(3, '0')}-play`);
  if (info.over) break;
}
await browser.close();
