import type { Fonts } from '../engine/bitmapFont';
import { C } from '../engine/palette';
import { drawSprite } from '../engine/sprites';
import { panel, rect } from '../engine/ui';

export const W = 640;
export const H = 360;

/** Things on screen that can be clicked or tapped. Each one does what a key does. */
export type ButtonId = 'gate' | 'honk' | 'feed' | 'rotL' | 'rotR' | 'zoomIn' | 'zoomOut' | 'again' | 'bigger' | 'perf' | 'perfTest';
export interface Button {
  id: ButtonId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Layout of the clickable parts of the HUD; drawing and hit-testing both use it. */
export function hudButtons(touch: boolean, wonAge: number | null, perf = false): Button[] {
  const b: Button[] = [
    // the objective panel toggles the frame-rate readout
    { id: 'perf', x: 6, y: 6, w: 150, h: 46 },
    // the gate and honk rows of the top-right panel work for everyone
    { id: 'gate', x: W - 96, y: 6, w: 90, h: 15 },
    { id: 'honk', x: W - 96, y: 21, w: 90, h: 19 },
  ];
  // with the readout showing, a button under it runs the perf test
  if (perf) b.push(PERF_TEST);
  if (wonAge !== null) {
    if (wonAge > 1.6) b.push({ id: 'again', x: W / 2 - 156, y: 206, w: 148, h: 18 }, { id: 'bigger', x: W / 2 + 8, y: 206, w: 148, h: 18 });
    return b;
  }
  if (touch) {
    b.push(
      { id: 'feed', x: W - 66, y: H - 66, w: 60, h: 60 },
      { id: 'honk', x: W - 128, y: H - 52, w: 56, h: 46 },
      { id: 'gate', x: W - 190, y: H - 52, w: 56, h: 46 },
      { id: 'rotL', x: 6, y: H - 38, w: 32, h: 32 },
      { id: 'rotR', x: 42, y: H - 38, w: 32, h: 32 },
      { id: 'zoomOut', x: 84, y: H - 38, w: 32, h: 32 },
      { id: 'zoomIn', x: 120, y: H - 38, w: 32, h: 32 },
    );
  }
  return b;
}

const PERF_TEST: Button = { id: 'perfTest', x: 6, y: 68, w: 124, h: 13 };

export function buttonAt(buttons: Button[], x: number, y: number): ButtonId | null {
  // later buttons sit on top
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b.id;
  }
  return null;
}

export interface HudState {
  penned: number;
  total: number;
  time: number;
  gateOpen: boolean;
  /** seconds since the game started, for fading the help */
  playing: number;
  showHelp: boolean;
  /** Gafoop's speech, already placed on screen */
  /** above his head at y, or (with no room above) under his feet at `under` */
  bubble: { text: string; x: number; y: number; under: number } | null;
  /** where the pen is, if it is off screen */
  penArrow: { x: number; y: number; angle: number } | null;
  floaters: { text: string; x: number; y: number; age: number }[];
  cursor: { x: number; y: number; tool: 'idle' | 'bucket' } | null;
  won: { time: number; age: number } | null;
  megaphoneReady: number;
  /** touch controls are showing */
  touch: boolean;
  feeding: boolean;
  /** buttons currently held down, to draw them pressed */
  held: ReadonlySet<ButtonId>;
  /** a phone held upright: suggest turning it */
  portrait: boolean;
  /** frame-rate readout, when switched on */
  perf: { fps: number; ms: number; calls: number; tris: number } | null;
}

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function drawHud(g: CanvasRenderingContext2D, f: Fonts, s: HudState): void {
  // --- objective panel
  panel(g, 6, 6, 150, 46, { fill: C.ink, border: C.straw, accent: C.gold });
  f.small.draw(g, 'AUDIT 0 - THE FIRST PEN', 12, 11, { color: C.straw });
  drawSprite(g, 'sheep', 12, 24, 2);
  f.title.draw(g, `${s.penned}/${s.total}`, 42, 20, { color: s.penned === s.total ? C.lime : C.white, shadow: C.black });
  f.small.draw(g, 'PENNED', 104, 26, { color: C.fog });
  f.small.draw(g, mmss(s.time), 104, 38, { color: C.mist });
  if (s.perf) {
    const p = s.perf;
    const text = `${Math.round(p.fps)} FPS  ${p.ms.toFixed(1)} MS  ${p.calls} CALLS  ${Math.round(p.tris / 1000)}K TRIS`;
    rect(g, 6, 54, f.small.measure(text) + 8, 12, C.black);
    f.small.draw(g, text, 10, 56, { color: p.fps >= 55 ? C.lime : p.fps >= 40 ? C.gold : C.scarlet });
    const b = PERF_TEST;
    panel(g, b.x, b.y, b.w, b.h, { fill: s.held.has('perfTest') ? C.coal : C.ink, border: C.gold, shadow: null });
    f.small.draw(g, s.touch ? 'RUN PERF TEST' : 'RUN PERF TEST [P]', b.x + 5, b.y + 3, { color: C.gold });
  }

  // --- gate and megaphone
  panel(g, W - 96, 6, 90, 34, { fill: C.ink, border: C.mist });
  f.small.draw(g, 'GATE', W - 90, 11, { color: C.fog });
  f.small.draw(g, s.gateOpen ? 'OPEN' : 'SHUT', W - 58, 11, { color: s.gateOpen ? C.lime : C.scarlet });
  if (!s.touch) f.tiny.draw(g, '[G]', W - 26, 11, { color: C.lilac });
  f.small.draw(g, 'HONK', W - 90, 25, { color: C.fog });
  rect(g, W - 58, 26, 46, 5, C.coal);
  rect(g, W - 58, 26, Math.round(46 * s.megaphoneReady), 5, s.megaphoneReady >= 1 ? C.gold : C.rust);

  // --- help strip
  const helpAlpha = s.won ? 0 : s.showHelp ? 1 : Math.max(0, 1 - (s.playing - 45) / 2);
  if (s.touch) {
    if (helpAlpha > 0) {
      g.globalAlpha = helpAlpha;
      const text = s.portrait ? 'TURN YOUR PHONE SIDEWAYS FOR A BIGGER FIELD' : 'DRAG TO FLY  -  HOLD FEED TO LURE  -  HONK SCATTERS';
      const w = f.small.measure(text) + 12;
      rect(g, Math.round(W / 2 - w / 2), 44, w, 13, C.black);
      f.small.draw(g, text, W / 2, 47, { color: s.portrait ? C.gold : C.mist, align: 'center' });
      g.globalAlpha = 1;
    }
  } else if (helpAlpha > 0) {
    const items: [string, string][] = [
      ['MOUSE', 'fly'], ['HOLD CLICK', 'feed bucket'], ['SPACE', 'honk'],
      ['G', 'gate'], ['Q E', 'rotate'], ['WHEEL', 'zoom'], ['H', 'help'],
    ];
    let w = 0;
    for (const [k, v] of items) w += f.small.measure(k) + f.tiny.measure(v) + 14;
    let x = Math.round(W / 2 - w / 2);
    const y = H - 16;
    g.globalAlpha = helpAlpha;
    rect(g, x - 6, y - 4, w + 8, 14, C.black);
    for (const [k, v] of items) {
      f.small.draw(g, k, x, y, { color: C.straw });
      x += f.small.measure(k) + 4;
      f.tiny.draw(g, v, x, y + 1, { color: C.mist });
      x += f.tiny.measure(v) + 10;
    }
    g.globalAlpha = 1;
  }

  // --- pen pointer
  if (s.penArrow && !s.won) {
    const { x, y, angle } = s.penArrow;
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.fillStyle = C.gold;
    for (let i = 0; i < 6; i++) {
      // a chunky pixel arrowhead
      const a = angle;
      const px = Math.round(Math.cos(a) * (6 - i) - Math.sin(a) * 0);
      const py = Math.round(Math.sin(a) * (6 - i));
      const half = i;
      for (let k = -half; k <= half; k++) g.fillRect(px - Math.round(Math.sin(a) * k), py + Math.round(Math.cos(a) * k), 1, 1);
    }
    g.restore();
    f.small.draw(g, 'PEN', Math.round(x - Math.cos(s.penArrow.angle) * 14), Math.round(y - Math.sin(s.penArrow.angle) * 12) - 3, { color: C.gold, align: 'center', outline: C.black });
  }

  // --- +1 floaters
  for (const fl of s.floaters) {
    g.globalAlpha = Math.max(0, 1 - fl.age / 1.2);
    f.small.draw(g, fl.text, Math.round(fl.x), Math.round(fl.y - fl.age * 18), { color: C.lime, align: 'center', outline: C.black });
  }
  g.globalAlpha = 1;

  // --- speech bubble
  if (s.bubble && !s.won) bubble(g, f, s.bubble.text, s.bubble.x, s.bubble.y, s.bubble.under);

  // --- touch controls
  if (s.touch && !s.won) touchControls(g, f, s);

  // --- verdict
  if (s.won) won(g, f, s.won.time, s.won.age, s.total, s.held);

  // --- cursor
  if (s.cursor && !s.touch) cursor(g, s.cursor.x, s.cursor.y, s.cursor.tool);
}

function button(g: CanvasRenderingContext2D, b: Button, down: boolean, border: string): void {
  panel(g, b.x, b.y + (down ? 1 : 0), b.w, b.h, { fill: down ? C.coal : C.ink, border, shadow: down ? null : C.black });
}

function touchControls(g: CanvasRenderingContext2D, f: Fonts, s: HudState): void {
  for (const b of hudButtons(true, null)) {
    if (b.y < 50) continue; // the top panel draws its own rows
    const down = s.held.has(b.id);
    const dy = down ? 1 : 0;
    const cx = b.x + b.w / 2;
    if (b.id === 'feed') {
      button(g, b, down || s.feeding, s.feeding ? C.lime : C.straw);
      f.small.draw(g, 'FEED', cx, b.y + 38 + dy, { color: s.feeding ? C.lime : C.straw, align: 'center' });
      f.tiny.draw(g, 'HOLD', cx, b.y + 48 + dy, { color: C.fog, align: 'center' });
      // a little bucket
      rect(g, cx - 7, b.y + 14 + dy, 14, 14, C.black);
      rect(g, cx - 6, b.y + 15 + dy, 12, 12, s.feeding ? C.mist : C.fog);
      rect(g, cx - 6, b.y + 15 + dy, 12, 2, C.straw);
      rect(g, cx - 5, b.y + 9 + dy, 10, 1, C.lilac);
    } else if (b.id === 'honk') {
      const ready = s.megaphoneReady >= 1;
      button(g, b, down, ready ? C.gold : C.lilac);
      f.small.draw(g, 'HONK', cx, b.y + 12 + dy, { color: ready ? C.gold : C.fog, align: 'center' });
      rect(g, b.x + 8, b.y + 30 + dy, b.w - 16, 5, C.coal);
      rect(g, b.x + 8, b.y + 30 + dy, Math.round((b.w - 16) * s.megaphoneReady), 5, ready ? C.gold : C.rust);
    } else if (b.id === 'gate') {
      button(g, b, down, s.gateOpen ? C.lime : C.scarlet);
      f.small.draw(g, 'GATE', cx, b.y + 12 + dy, { color: C.mist, align: 'center' });
      f.small.draw(g, s.gateOpen ? 'OPEN' : 'SHUT', cx, b.y + 28 + dy, { color: s.gateOpen ? C.lime : C.scarlet, align: 'center' });
    } else {
      button(g, b, down, C.mist);
      const label = b.id === 'rotL' ? 'Q' : b.id === 'rotR' ? 'E' : b.id === 'zoomIn' ? '+' : '-';
      f.small.draw(g, label, cx, b.y + 10 + dy, { color: C.straw, align: 'center' });
      f.tiny.draw(g, b.id === 'rotL' || b.id === 'rotR' ? 'TURN' : 'ZOOM', cx, b.y + 20 + dy, { color: C.fog, align: 'center' });
    }
  }
}

function bubble(g: CanvasRenderingContext2D, f: Fonts, text: string, x: number, y: number, under: number): void {
  const lines = f.body.wrap(text, 190);
  const w = Math.max(...lines.map((l) => f.body.measure(l))) + 12;
  const h = lines.length * 14 + 6;
  const bx = Math.round(Math.max(4, Math.min(W - w - 4, x - w / 2)));
  // above his head, unless that would run into the objective panel: then under his feet,
  // rather than pushed down on top of him
  const above = y - h - 10;
  const flip = above < 56;
  const by = Math.round(flip ? Math.min(H - h - 4, under + 10) : above);
  panel(g, bx, by, w, h, { fill: C.white, border: C.black, shadow: C.ink });
  // tail, pointing at him
  const tx = Math.round(Math.max(bx + 6, Math.min(bx + w - 8, x)));
  for (let i = 0; i < 5; i++) rect(g, tx - (4 - i), flip ? by - i : by + h - 1 + i, (4 - i) * 2 - 1 > 0 ? (4 - i) * 2 - 1 : 1, 1, i === 4 ? C.black : C.white);
  lines.forEach((l, i) => f.body.draw(g, l, bx + 6, by + 3 + i * 14, { color: C.ink }));
}

function won(g: CanvasRenderingContext2D, f: Fonts, time: number, age: number, total: number, held: ReadonlySet<ButtonId>): void {
  if (age < 0.15) return;
  const cx = W / 2;
  const cy = 132;
  const k = Math.min(1, (age - 0.15) / 0.25);
  // the verdict card slides up, then the Bureau's stamp lands on it
  const py = Math.round(cy - 6 + (1 - k) * 30);
  panel(g, cx - 170, py, 340, 104, { fill: C.ink, border: C.straw, accent: C.gold });
  f.small.draw(g, 'GALACTIC BUREAU OF CONQUEST - FORM 8-A', cx, py + 8, { color: C.fog, align: 'center' });
  if (age > 0.8) {
    const mm = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    f.body.draw(g, `${total} sheep penned in ${mm}.`, cx, py + 52, { color: C.white, align: 'center' });
    f.small.draw(g, 'A MEASURABLE INCREASE IN ORGANISATION IS NOTED.', cx, py + 70, { color: C.straw, align: 'center' });
  }
  if (age > 1.6) {
    // clickable, and R / N on a keyboard
    for (const b of hudButtons(false, age)) {
      if (b.id !== 'again' && b.id !== 'bigger') continue;
      const down = held.has(b.id);
      button(g, b, down, C.lime);
      const label = b.id === 'again' ? 'R  HERD AGAIN' : 'N  A BIGGER FLOCK';
      f.small.draw(g, label, b.x + b.w / 2, b.y + 5 + (down ? 1 : 0), { color: C.lime, align: 'center' });
    }
  }
  if (age < 0.4) return;
  const s = Math.max(1, 3 - (age - 0.4) * 12);
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(cx, py + 30);
  g.rotate(-0.1);
  g.scale(s, s);
  const label = 'APPROVED';
  const tw = f.title.measure(label);
  g.fillStyle = C.scarlet;
  g.fillRect(-tw / 2 - 8, -13, tw + 16, 2);
  g.fillRect(-tw / 2 - 8, 11, tw + 16, 2);
  g.fillRect(-tw / 2 - 8, -13, 2, 26);
  g.fillRect(tw / 2 + 6, -13, 2, 26);
  f.title.draw(g, label, -Math.round(tw / 2), -10, { color: C.scarlet });
  g.restore();
}

function cursor(g: CanvasRenderingContext2D, x: number, y: number, tool: 'idle' | 'bucket'): void {
  const c = tool === 'bucket' ? C.lime : C.white;
  const X = Math.round(x);
  const Y = Math.round(y);
  rect(g, X - 5, Y - 1, 11, 3, C.black);
  rect(g, X - 1, Y - 5, 3, 11, C.black);
  rect(g, X - 4, Y, 3, 1, c);
  rect(g, X + 2, Y, 3, 1, c);
  rect(g, X, Y - 4, 1, 3, c);
  rect(g, X, Y + 2, 1, 3, c);
}
