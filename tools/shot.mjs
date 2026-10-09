// Screenshot a page in headless Chromium: node tools/shot.mjs <url> <out.png> [waitMs] [w] [h] [evalJs]
import { chromium } from 'playwright-core';

const [url, out, waitMs = '1500', w = '1440', h = '810', evalJs] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(+waitMs);
if (evalJs) console.log(await page.evaluate(evalJs));
await page.screenshot({ path: out });
await browser.close();
