import type { Fonts } from '../engine/bitmapFont';
import { C } from '../engine/palette';
import { drawSprite } from '../engine/sprites';
import { ditherFill, frame, panel, rect } from '../engine/ui';
import { pixelLine } from '../game/build';
import { bubble } from '../game/hud';
import type { RunOptions } from './config';
import type { ItemId } from './items';

export const W = 640;
export const H = 360;

export type RunButton =
  | 'card0' | 'card1' | 'card2' | 'supply' | 'bucket' | 'pause' | 'start' | 'resume' | 'quit'
  | 'opt:cushion' | 'opt:grazing' | 'opt:levelups' | 'perf' | 'stress' | 'zoomIn' | 'zoomOut';

export interface Rect { id: RunButton; x: number; y: number; w: number; h: number }

export type Screen = 'title' | 'play' | 'paused' | 'over';

/** What the layout depends on. */
export interface RunLayout {
  screen: Screen;
  touch: boolean;
  choosing: boolean;
  /** banked level-ups waiting to be opened */
  supplies: number;
  perf: boolean;
}

const CARD = { w: 184, h: 108, y: 112, gap: 12 };
const TOGGLES: RunButton[] = ['opt:cushion', 'opt:grazing', 'opt:levelups'];

/** The clickable parts of the screen; drawing and hit-testing both use it. */
export function runButtons(L: RunLayout): Rect[] {
  const b: Rect[] = [];
  if (L.screen === 'play') {
    if (L.choosing) {
      const x0 = Math.round(W / 2 - (3 * CARD.w + 2 * CARD.gap) / 2);
      for (let k = 0; k < 3; k++) b.push({ id: `card${k}` as RunButton, x: x0 + k * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h });
      return b;
    }
    b.push({ id: 'pause', x: W - 30, y: 48, w: 24, h: 18 });
    if (L.supplies > 0) b.push({ id: 'supply', x: W / 2 - 70, y: H - 46, w: 140, h: 22 });
    if (L.touch) b.push({ id: 'bucket', x: W - 70, y: H - 70, w: 64, h: 64 });
    if (L.touch) b.push({ id: 'zoomOut', x: 6, y: H - 30, w: 26, h: 24 }, { id: 'zoomIn', x: 36, y: H - 30, w: 26, h: 24 });
    if (L.perf) b.push({ id: 'stress', x: 6, y: 92, w: 110, h: 13 });
    return b;
  }
  // the title, the pause screen and the results share one panel: the toggles and a button
  const x0 = W / 2 - 170;
  // two to a row; one left on its own goes in the middle
  TOGGLES.forEach((id, k) => {
    const alone = k === TOGGLES.length - 1 && k % 2 === 0;
    b.push({ id, x: alone ? W / 2 - 80 : x0 + 12 + (k % 2) * 166, y: 212 + Math.floor(k / 2) * 22, w: 160, h: 18 });
  });
  if (L.screen === 'paused') {
    b.push({ id: 'resume', x: W / 2 - 128, y: 264, w: 120, h: 22 }, { id: 'quit', x: W / 2 + 8, y: 264, w: 120, h: 22 });
  } else b.push({ id: 'start', x: W / 2 - 70, y: 264, w: 140, h: 22 });
  return b;
}

export function buttonAt(buttons: Rect[], x: number, y: number): RunButton | null {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const r = buttons[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.id;
  }
  return null;
}

/** An effect drawn on the overlay, placed in the world. */
export type Fx =
  | { kind: 'ring'; x: number; y: number; r: number; age: number; life: number; color: string }
  | { kind: 'zap'; ax: number; ay: number; bx: number; by: number; age: number; life: number; seed: number }
  | { kind: 'crook'; x: number; y: number; angle: number; arc: number; r: number; age: number; life: number }
  | { kind: 'stamp'; x: number; y: number; age: number; life: number };

export interface Card { name: string; lines: [string, string]; level: number; max: number; who: string }

export interface RunHudState {
  layout: RunLayout;
  portrait: boolean;
  timeLeft: number;
  level: number;
  xp: number;
  xpNeed: number;
  flock: number;
  taken: number;
  composure: number;
  composureMax: number;
  ko: number;
  invulnerable: boolean;
  items: { id: ItemId; level: number; max: number; kind: 'armament' | 'provision' }[];
  choices: Card[] | null;
  /** off screen: sheep being taken, strays to find, the nearest shearing booth (a woolly flock) */
  arrows: { x: number; y: number; angle: number; kind: 'taken' | 'strays' | 'booth'; n: number }[];
  /** on screen: ! over sheep being taken */
  marks: { x: number; y: number }[];
  /** the shearing booths' mouths on screen, where woolly sheep are called in from (r in metres) */
  booths: { x: number; y: number; r: number; busy: boolean }[];
  fx: Fx[];
  floaters: { text: string; x: number; y: number; age: number; color: string }[];
  bubble: { text: string; x: number; y: number; under: number } | null;
  options: RunOptions;
  result: { won: boolean; held: number; peak: number; level: number; kills: number; found: number; rescued: number; lost: number; time: number } | null;
  stick: { ox: number; oy: number; x: number; y: number } | null;
  bucketOn: boolean;
  held: ReadonlySet<RunButton>;
  perf: { fps: number; ms: number; calls: number; tris: number; sheep: number; enemies: number } | null;
  /** seconds since the run began (the help strip fades) */
  playing: number;
  /** ground pixels per metre and the camera's pitch, for drawing circles on the ground */
  ppm: number;
  squash: number;
  toScreen: (x: number, y: number, h?: number) => { x: number; y: number };
}

const CODES: Record<ItemId, string> = {
  stamp: 'STAMP', stapler: 'STAPL', shredder: 'SHRED', crook: 'CROOK', bells: 'BELLS', static: 'ZAP',
  disc: 'DISC', shears: 'SHEAR', medal: 'MEDAL', expedite: 'QUICK', fleece: 'FLEECE', merino: 'WOOL',
};

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function drawRunHud(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  const L = s.layout;
  if (L.screen === 'play' || L.screen === 'paused' || L.screen === 'over') {
    drawBooths(g, s);
    drawFx(g, f, s);
    drawMarks(g, f, s);
  }
  if (L.screen === 'play') {
    drawTop(g, f, s);
    drawArrows(g, f, s);
    for (const fl of s.floaters) {
      g.globalAlpha = Math.max(0, 1 - fl.age / 1.4);
      f.small.draw(g, fl.text, Math.round(fl.x), Math.round(fl.y - fl.age * 16), { color: fl.color, align: 'center', outline: C.black });
    }
    g.globalAlpha = 1;
    if (s.bubble && !L.choosing) bubble(g, f, s.bubble.text, s.bubble.x, s.bubble.y, s.bubble.under);
    drawHelp(g, f, s);
    drawControls(g, f, s);
    if (L.choosing && s.choices) drawCards(g, f, s);
    if (s.ko > 0 && !L.choosing) {
      const text = 'KNOCKED OUT';
      f.title.draw(g, text, W / 2, 96, { color: C.gold, align: 'center', outline: C.black });
      f.small.draw(g, `BACK IN ${s.ko.toFixed(1)} S`, W / 2, 120, { color: C.mist, align: 'center', outline: C.black });
    }
  } else {
    drawMenu(g, f, s);
  }
  if (s.perf) drawPerf(g, f, s);
}

function drawTop(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  // the requisition bar along the top edge
  rect(g, 0, 0, W, 7, C.black);
  rect(g, 1, 1, W - 2, 5, C.ink);
  rect(g, 1, 1, Math.round((W - 2) * Math.min(1, s.xp / s.xpNeed)), 5, C.mint);
  rect(g, 1, 1, Math.round((W - 2) * Math.min(1, s.xp / s.xpNeed)), 1, C.ice);
  // the clock
  panel(g, 6, 11, 112, 32, { fill: C.ink, border: s.timeLeft < 30 ? C.gold : C.straw });
  f.tiny.draw(g, 'BUREAU RECONVENES IN', 12, 15, { color: C.fog });
  f.title.draw(g, mmss(Math.ceil(s.timeLeft)), 12, 22, { color: s.timeLeft < 30 ? C.gold : C.white, shadow: C.black });
  f.small.draw(g, `LV ${s.level}`, 112, 32, { color: C.mint, align: 'right' });
  // the flock: the biggest number on the screen
  const cx = W / 2;
  panel(g, cx - 54, 11, 108, s.taken > 0 ? 42 : 32, { fill: C.ink, border: s.taken > 0 ? C.scarlet : C.mist });
  drawSprite(g, 'sheep', cx - 46, 17, 2);
  f.title.draw(g, String(s.flock), cx - 12, 20, { color: C.white, shadow: C.black });
  f.tiny.draw(g, 'SHEEP', cx + 44, 34, { color: C.fog, align: 'right' });
  if (s.taken > 0) f.small.draw(g, `${s.taken} BEING TAKEN`, cx, 42, { color: C.scarlet, align: 'center' });
  // composure and what Gafoop carries
  const px = W - 146;
  panel(g, px, 11, 140, 32, { fill: C.ink, border: s.ko > 0 ? C.gold : C.lilac });
  for (let k = 0; k < s.composureMax; k++) {
    const on = k < s.composure;
    const bx = px + 6 + k * 11;
    rect(g, bx, 15, 9, 9, C.black);
    rect(g, bx + 1, 16, 7, 7, on ? (s.invulnerable ? C.white : C.lime) : C.coal);
  }
  f.tiny.draw(g, 'COMPOSURE', px + 42, 16, { color: C.fog });
  const arms = s.items.filter((i) => i.kind === 'armament');
  const provs = s.items.filter((i) => i.kind === 'provision');
  const slot = (it: (typeof s.items)[number] | undefined, x: number, y: number) => {
    rect(g, x, y, 26, 8, it ? C.coal : C.black);
    if (!it) return;
    f.tiny.draw(g, CODES[it.id], x + 1, y, { color: it.kind === 'armament' ? C.straw : C.mint });
    for (let l = 0; l < it.max; l++) rect(g, x + 1 + l * 4, y + 7, 3, 1, l < it.level ? C.white : C.stone);
  };
  for (let k = 0; k < 5; k++) slot(arms[k], px + 4 + k * 27, 25);
  for (let k = 0; k < 5; k++) slot(provs[k], px + 4 + k * 27, 34);
}

function arrowHead(g: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string): void {
  g.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const px = Math.round(x + Math.cos(angle) * (6 - i));
    const py = Math.round(y + Math.sin(angle) * (6 - i));
    for (let k = -i; k <= i; k++) g.fillRect(px - Math.round(Math.sin(angle) * k), py + Math.round(Math.cos(angle) * k), 1, 1);
  }
}

function drawArrows(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  for (const a of s.arrows) {
    const taken = a.kind === 'taken';
    const color = taken ? C.scarlet : a.kind === 'booth' ? C.skyLight : C.gold;
    arrowHead(g, a.x, a.y, a.angle, C.black);
    arrowHead(g, a.x - Math.cos(a.angle), a.y - Math.sin(a.angle), a.angle, color);
    const lx = Math.round(a.x - Math.cos(a.angle) * 14);
    const ly = Math.round(a.y - Math.sin(a.angle) * 12) - 4;
    if (taken) f.small.draw(g, '!', lx, ly, { color, align: 'center', outline: C.black });
    else if (a.kind === 'booth') drawSprite(g, 'shears', lx - 6, ly - 3, 1);
    else {
      drawSprite(g, 'sheep', lx - 7, ly - 2, 1);
      f.tiny.draw(g, String(a.n), lx + 9, ly, { color, outline: C.black });
    }
  }
}

function drawMarks(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  for (const m of s.marks) {
    const blink = Math.floor(s.playing * 6) % 2 === 0;
    f.title.draw(g, '!', Math.round(m.x), Math.round(m.y) - 22, { color: blink ? C.scarlet : C.gold, align: 'center', outline: C.black });
  }
}

/** A circle on the ground: a pixel ellipse, dashed if asked. */
function groundRing(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, dash = 0): void {
  const n = Math.max(16, Math.round((rx + ry) * 3.2));
  g.fillStyle = color;
  let lastX = NaN;
  let lastY = NaN;
  for (let k = 0; k < n; k++) {
    if (dash && Math.floor(k / dash) % 2) continue;
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    if (x === lastX && y === lastY) continue;
    g.fillRect(x, y, 1, 1);
    lastX = x;
    lastY = y;
  }
}

/** Each booth's mouth: a dashed ring on the ground, flickering while the booth works. */
function drawBooths(g: CanvasRenderingContext2D, s: RunHudState): void {
  for (const b of s.booths) {
    const r = b.r * s.ppm;
    const lit = b.busy && Math.floor(s.playing * 8) % 2 === 0;
    groundRing(g, b.x, b.y + 1, r, r * s.squash, C.black, 3);
    groundRing(g, b.x, b.y, r, r * s.squash, lit ? C.white : C.skyLight, 3);
  }
}

function drawFx(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  for (const e of s.fx) {
    const k = e.age / e.life;
    if (e.kind === 'ring') {
      const c = s.toScreen(e.x, e.y);
      const r = e.r * (0.35 + 0.65 * Math.sqrt(k)) * s.ppm;
      if (k < 0.85 || Math.floor(e.age * 30) % 2 === 0) groundRing(g, c.x, c.y, r, r * s.squash, e.color, k > 0.5 ? 2 : 0);
    } else if (e.kind === 'zap') {
      const a = s.toScreen(e.ax, e.ay, 0.6);
      const b = s.toScreen(e.bx, e.by, 0.6);
      // a jagged bolt, redrawn a little differently each frame
      const steps = 5;
      let px = a.x;
      let py = a.y;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const j = i === steps ? 0 : Math.sin(e.seed * 7.1 + i * 3.7 + e.age * 40) * 4;
        const x = a.x + (b.x - a.x) * t + j;
        const y = a.y + (b.y - a.y) * t - j * 0.5;
        pixelLine(g, px, py + 1, x, y + 1, C.navy);
        pixelLine(g, px, py, x, y, k < 0.5 ? C.white : C.skyLight);
        px = x;
        py = y;
      }
    } else if (e.kind === 'crook') {
      const c = s.toScreen(e.x, e.y);
      const r = e.r * s.ppm * (0.7 + 0.3 * k);
      const n = 24;
      g.fillStyle = k < 0.5 ? C.white : C.lilac;
      // the sweep runs across the arc as it goes
      const span = e.arc * Math.min(1, k * 2.5);
      for (let i = 0; i <= n; i++) {
        const a = e.angle - e.arc / 2 + (span * i) / n;
        // ground angle to screen: x stays, y squashes (yaw 45: the world turns a quarter of
        // the way, so rotate before squashing)
        const wx = Math.cos(a) * r;
        const wy = Math.sin(a) * r;
        const sx = (wx - wy) * Math.SQRT1_2;
        const sy = (wx + wy) * Math.SQRT1_2 * s.squash;
        g.fillRect(Math.round(c.x + sx), Math.round(c.y + sy), 2, 1);
      }
    } else {
      const c = s.toScreen(e.x, e.y, 2.2);
      const scale = Math.max(1, 1.6 - k * 4);
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      g.translate(Math.round(c.x), Math.round(c.y));
      g.rotate(-0.12);
      g.scale(scale, scale);
      const label = 'APPROVED';
      const tw = f.small.measure(label);
      g.fillStyle = C.scarlet;
      g.fillRect(-tw / 2 - 3, -6, tw + 6, 1);
      g.fillRect(-tw / 2 - 3, 6, tw + 6, 1);
      f.small.draw(g, label, -Math.round(tw / 2), -4, { color: C.scarlet });
      g.restore();
    }
  }
}

function drawCards(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  ditherFill(g, 0, 0, W, H, C.black, 0.45);
  const L = s.layout;
  f.title.draw(g, 'SUPPLY DROP', W / 2, 62, { color: C.gold, align: 'center', outline: C.black });
  f.small.draw(g, 'REQUISITION APPROVED: PICK ONE', W / 2, 86, { color: C.mist, align: 'center', outline: C.black });
  runButtons(L).forEach((b, k) => {
    const c = s.choices![k];
    if (!c) return;
    const down = s.held.has(b.id);
    const isNew = c.level === 1;
    const who = c.who === 'flock' ? 'FOR THE FLOCK' : c.who === 'gafoop' ? 'FOR GAFOOP' : c.who === 'booths' ? 'FOR THE BOOTHS' : 'FROM THE BUREAU';
    const accent = c.who === 'flock' ? C.mint : c.who === 'gafoop' ? C.straw : c.who === 'booths' ? C.skyLight : C.pinkLight;
    panel(g, b.x, b.y + (down ? 1 : 0), b.w, b.h, { fill: down ? C.coal : C.ink, border: accent, accent });
    const y = b.y + (down ? 1 : 0);
    f.tiny.draw(g, who, b.x + 8, y + 8, { color: accent });
    if (!L.touch) f.small.draw(g, `[${k + 1}]`, b.x + b.w - 8, y + 7, { color: C.fog, align: 'right' });
    const lines = f.small.wrap(c.name, b.w - 16);
    lines.forEach((l, i) => f.small.draw(g, l, b.x + 8, y + 24 + i * 10, { color: C.white }));
    const ly = y + 24 + lines.length * 10 + 4;
    if (c.max > 0) {
      f.small.draw(g, isNew ? 'NEW!' : `LEVEL ${c.level}`, b.x + 8, ly, { color: isNew ? C.gold : C.lime });
      for (let l = 0; l < c.max; l++) rect(g, b.x + 8 + l * 7, ly + 11, 5, 3, l < c.level ? (l === c.level - 1 ? C.gold : C.white) : C.stone);
    }
    c.lines.forEach((line, i) => {
      if (line) f.tiny.draw(g, line, b.x + 8, y + b.h - 28 + i * 10, { color: C.mist });
    });
  });
  if (L.touch) f.small.draw(g, 'TAP A CARD', W / 2, CARD.y + CARD.h + 12, { color: C.fog, align: 'center', outline: C.black });
}

function drawHelp(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  const L = s.layout;
  const alpha = L.choosing ? 0 : Math.max(0, 1 - (s.playing - 25) / 2);
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  const lines = L.touch && s.portrait
    ? ['TURN YOUR PHONE SIDEWAYS FOR A BIGGER FIELD']
    : [
      L.touch ? 'DRAG TO FLY  -  HOLD THE BUCKET AND THE FLOCK FOLLOWS' : 'WASD OR MOUSE: FLY   HOLD CLICK OR SPACE: THE BUCKET   ESC: PAUSE',
      'SHEEP MOVE AWAY FROM YOU. HERD WOOLLY ONES INTO A SHEARING BOOTH',
    ];
  const bottom = H - (L.touch ? 79 : 7);
  lines.forEach((text, i) => {
    const y = bottom - (lines.length - i) * 13;
    const w = f.small.measure(text) + 12;
    rect(g, Math.round(W / 2 - w / 2), y, w, 13, C.black);
    f.small.draw(g, text, W / 2, y + 3, { color: i ? C.skyLight : C.mist, align: 'center' });
  });
  g.globalAlpha = 1;
}

function drawControls(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  const L = s.layout;
  if (L.choosing) return;
  for (const b of runButtons(L)) {
    const down = s.held.has(b.id);
    const dy = down ? 1 : 0;
    const cx = b.x + b.w / 2;
    if (b.id === 'pause') {
      panel(g, b.x, b.y + dy, b.w, b.h, { fill: down ? C.coal : C.ink, border: C.lilac, shadow: down ? null : C.black });
      rect(g, cx - 4, b.y + 5 + dy, 3, 8, C.mist);
      rect(g, cx + 1, b.y + 5 + dy, 3, 8, C.mist);
    } else if (b.id === 'supply') {
      const blink = Math.floor(s.playing * 3) % 2 === 0;
      panel(g, b.x, b.y + dy, b.w, b.h, { fill: down ? C.coal : C.ink, border: blink ? C.gold : C.straw, shadow: down ? null : C.black });
      f.small.draw(g, `SUPPLY DROP x${L.supplies}${L.touch ? '' : '  [E]'}`, cx, b.y + 7 + dy, { color: C.gold, align: 'center' });
    } else if (b.id === 'bucket') {
      const on = s.bucketOn;
      panel(g, b.x, b.y + dy, b.w, b.h, { fill: on || down ? C.coal : C.ink, border: on ? C.lime : C.straw, shadow: down ? null : C.black });
      rect(g, cx - 7, b.y + 15 + dy, 14, 14, C.black);
      rect(g, cx - 6, b.y + 16 + dy, 12, 12, on ? C.mist : C.fog);
      rect(g, cx - 6, b.y + 16 + dy, 12, 2, C.straw);
      rect(g, cx - 5, b.y + 10 + dy, 10, 1, C.lilac);
      f.small.draw(g, 'BUCKET', cx, b.y + 40 + dy, { color: on ? C.lime : C.straw, align: 'center' });
      f.tiny.draw(g, 'HOLD', cx, b.y + 51 + dy, { color: C.fog, align: 'center' });
    } else if (b.id === 'zoomIn' || b.id === 'zoomOut') {
      panel(g, b.x, b.y + dy, b.w, b.h, { fill: down ? C.coal : C.ink, border: C.lilac, shadow: down ? null : C.black });
      f.small.draw(g, b.id === 'zoomIn' ? '+' : '-', cx, b.y + 8 + dy, { color: C.straw, align: 'center' });
    } else if (b.id === 'stress') {
      panel(g, b.x, b.y, b.w, b.h, { fill: down ? C.coal : C.ink, border: C.gold, shadow: null });
      f.small.draw(g, '+100 SHEEP +150', b.x + 5, b.y + 3, { color: C.gold });
    }
  }
  // the stick, where the thumb went down
  if (s.stick) {
    const { ox, oy, x, y } = s.stick;
    groundRing(g, ox, oy, 26, 26, C.lilac);
    groundRing(g, ox, oy, 27, 27, C.black);
    const dx = x - ox;
    const dy = y - oy;
    const d = Math.hypot(dx, dy);
    const k = d > 26 ? 26 / d : 1;
    const kx = Math.round(ox + dx * k);
    const ky = Math.round(oy + dy * k);
    rect(g, kx - 7, ky - 7, 14, 14, C.black);
    rect(g, kx - 6, ky - 6, 12, 12, C.mist);
  }
}

const OPTION_LABEL: Record<string, (o: RunOptions) => [string, string]> = {
  'opt:cushion': (o) => ['WOOL CUSHION', o.cushion ? 'ON' : 'OFF'],
  'opt:grazing': (o) => ['GRAZING', o.grazing ? 'ON' : 'OFF'],
  'opt:levelups': (o) => ['LEVEL-UPS', o.levelups === 'pause' ? 'AT ONCE' : 'BANKED'],
};

function drawMenu(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  const L = s.layout;
  ditherFill(g, 0, 0, W, H, C.black, L.screen === 'title' ? 0.35 : 0.55);
  const x0 = W / 2 - 170;
  const top = 44;
  panel(g, x0, top, 340, 252, { fill: C.ink, border: C.straw, accent: C.gold });
  if (L.screen === 'title') {
    f.huge.draw(g, 'HOLD THE FLOCK', W / 2, top + 8, { color: C.white, align: 'center', shadow: C.black });
    f.small.draw(g, 'AUTOSHEEP: SURVIVORS  -  S0 PROTOTYPE', W / 2, top + 54, { color: C.gold, align: 'center' });
    const lines = [
      'EARTH GOES TO WHOEVER HOLDS ITS SHEEP WHEN THE',
      'BUREAU RECONVENES. EVERYONE WANTS THEM. HOLD ON',
      'TO YOURS FOR TEN MINUTES. YOUR STATIONERY FIRES',
      'ITSELF: FLY ROUND THE FLOCK, FETCH STRAYS, GET',
      'TAKEN SHEEP BACK, AND HERD WOOLLY ONES INTO THE',
      'SHEARING BOOTHS: THEIR WOOL IS YOUR EXPERIENCE.',
    ];
    lines.forEach((l, i) => f.tiny.draw(g, l, W / 2, top + 76 + i * 10, { color: C.mist, align: 'center' }));
  } else if (L.screen === 'paused') {
    f.huge.draw(g, 'PAUSED', W / 2, top + 8, { color: C.white, align: 'center', shadow: C.black });
    const lines = [
      'SHEEP MOVE AWAY FROM GAFOOP: HERD THEM FROM BEHIND.',
      'HOLD THE BUCKET AND THEY COME TO HIM INSTEAD.',
      'WOOLLY SHEEP IN A BOOTH\'S RING ARE CALLED IN AND SHORN,',
      'ONE AT A TIME. THE WOOL IS EXPERIENCE, BUT A SHORN',
      'SHEEP HAS NO FLEECE TO TAKE A GRAB FOR IT.',
    ];
    lines.forEach((l, i) => f.tiny.draw(g, l, W / 2, top + 62 + i * 10, { color: C.mist, align: 'center' }));
    f.tiny.draw(g, 'THE TEST SETTINGS BELOW APPLY FROM THE NEXT RUN', W / 2, top + 122, { color: C.fog, align: 'center' });
  } else if (s.result) {
    const r = s.result;
    f.title.draw(g, r.won ? 'THE BUREAU RECONVENES' : 'CLAIM DISMISSED', W / 2, top + 10, { color: r.won ? C.lime : C.scarlet, align: 'center', shadow: C.black });
    f.body.draw(g, r.won ? `CLAIM UPHELD: ${r.held} SHEEP` : `NO SHEEP LEFT AT ${mmss(r.time)}`, W / 2, top + 40, { color: C.white, align: 'center' });
    const stats = [
      `MOST SHEEP AT ONCE ${r.peak}    LEVEL ${r.level}    MONSTERS DEPORTED ${r.kills}`,
      `STRAYS FOUND ${r.found}    TAKEN SHEEP GOT BACK ${r.rescued}    LOST ${r.lost}`,
    ];
    stats.forEach((l, i) => f.tiny.draw(g, l, W / 2, top + 66 + i * 11, { color: C.mist, align: 'center' }));
    if (r.lost > 0) f.tiny.draw(g, 'THE LOST ONES ARE ON A VERY NICE FARM ON ZORBLAX 9.', W / 2, top + 92, { color: C.fog, align: 'center' });
  }
  f.small.draw(g, 'TEST SETTINGS', W / 2, 198, { color: C.straw, align: 'center' });
  for (const b of runButtons(L)) {
    const down = s.held.has(b.id);
    const dy = down ? 1 : 0;
    if (b.id.startsWith('opt:')) {
      const [label, value] = OPTION_LABEL[b.id](s.options);
      panel(g, b.x, b.y + dy, b.w, b.h, { fill: down ? C.coal : C.black, border: C.lilac, shadow: null });
      f.tiny.draw(g, label, b.x + 5, b.y + 5 + dy, { color: C.fog });
      f.small.draw(g, value, b.x + b.w - 5, b.y + 5 + dy, { color: C.lime, align: 'right' });
    } else {
      const label = b.id === 'start' ? (L.screen === 'title' ? 'START' : 'AGAIN') : b.id === 'resume' ? 'RESUME' : 'QUIT';
      const key = b.id === 'start' || b.id === 'resume' ? 'ENTER' : 'Q';
      panel(g, b.x, b.y + dy, b.w, b.h, { fill: down ? C.coal : C.ink, border: C.lime, shadow: down ? null : C.black });
      f.small.draw(g, L.touch ? label : `${label}  [${key}]`, b.x + b.w / 2, b.y + 7 + dy, { color: C.lime, align: 'center' });
    }
  }
  frame(g, x0 + 10, 206, 320, 1, C.coal);
}

function drawPerf(g: CanvasRenderingContext2D, f: Fonts, s: RunHudState): void {
  const p = s.perf!;
  const text = `${Math.round(p.fps)} FPS  ${p.ms.toFixed(1)} MS  ${p.calls} CALLS  ${Math.round(p.tris / 1000)}K TRIS  ${p.sheep} SHEEP  ${p.enemies} MONSTERS`;
  rect(g, 6, 76, f.small.measure(text) + 8, 12, C.black);
  f.small.draw(g, text, 10, 78, { color: p.fps >= 55 ? C.lime : p.fps >= 40 ? C.gold : C.scarlet });
}
