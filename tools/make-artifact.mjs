// Turn the single-file build (dist-single/index.html) into a page fragment for publishing:
// <title> and <style> first, then the body markup and the inlined module script.
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync('dist-single/index.html', 'utf8');
const pick = (re) => [...src.matchAll(re)].map((m) => m[1]);
const scripts = pick(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g);
const styles = pick(/<style[^>]*>([\s\S]*?)<\/style>/g);
const body = /<body>([\s\S]*?)<\/body>/.exec(src)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();

const page = `<title>Autosheep Intro</title>
<style>
/* single dark look: a black cinema around the pixel-art screen */
:root { --bg: #18141a; --hint: #625565; color-scheme: dark; }
html, body { height: 100%; margin: 0; background: var(--bg); overflow: hidden; }
#stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
#hint { position: fixed; right: 16px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; color: var(--hint); user-select: none; }
${styles.join('\n')}
</style>
${body}
<script type="module">${scripts.join('\n')}</script>
`;
fs.mkdirSync('out/artifact', { recursive: true });
const out = path.join('out/artifact', 'autosheep-intro.html');
fs.writeFileSync(out, page);
console.log(`${out} ${(page.length / 1e6).toFixed(2)} MB`);
