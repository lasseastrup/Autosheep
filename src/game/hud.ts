import type { Fonts } from '../engine/bitmapFont';
import { C } from '../engine/palette';
import { drawSprite } from '../engine/sprites';
import { panel, rect } from '../engine/ui';

export const W = 640;
export const H = 360;

/** Things on screen that can be clicked or tapped. Each one does what a key does. */
/** Build tools (herdway levels). */
export const TOOLS = ['lane', 'flap', 'rack', 'lick', 'chimes', 'shed', 'spindle', 'hurdle', 'remove'] as const;
export type ToolId = (typeof TOOLS)[number];
export const TOOL_LABEL: Record<ToolId, string> = {
  lane: 'RACE', flap: 'FLAP', rack: 'RACK', lick: 'LICK', chimes: 'CHIMES', shed: 'SHED', spindle: 'SPINDLE', hurdle: 'HURDLE', remove: 'REMOVE',
};

export type ButtonId =
  | 'gate' | 'honk' | 'feed' | 'rotL' | 'rotR' | 'zoomIn' | 'zoomOut' | 'again' | 'bigger' | 'next' | 'keep' | 'perf' | 'perfTest'
  | 'speed' | 'build' | 'flow' | 'finish' | 'cancel' | 'rotate' | `tool:${ToolId}`;
export interface Button {
  id: ButtonId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the HUD's layout depends on. */
export interface HudLayout {
  touch: boolean;
  /** the verdict card, once its buttons are up */
  won: { age: number; buttons: ButtonId[] } | null;
  perf: boolean;
  kind: 'pen' | 'herdway';
  /** build mode: the tool in hand, and whether a race is half drawn */
  build: { tool: ToolId; drawing: boolean } | null;
}

/** Layout of the clickable parts of the HUD; drawing and hit-testing both use it. */
export function hudButtons(L: HudLayout): Button[] {
  const b: Button[] = [
    // the objective panel toggles the frame-rate readout
    { id: 'perf', x: 6, y: 6, w: 150, h: 46 },
  ];
  // the rows of the top-right panel work for everyone
  if (L.kind === 'pen') b.push({ id: 'gate', x: W - 96, y: 6, w: 90, h: 15 }, { id: 'honk', x: W - 96, y: 21, w: 90, h: 19 });
  else {
    b.push(
      { id: 'speed', x: W - 96, y: 6, w: 90, h: 15 },
      { id: 'honk', x: W - 96, y: 21, w: 90, h: 19 },
      { id: 'build', x: W - 96, y: 44, w: 44, h: 16 },
      { id: 'flow', x: W - 50, y: 44, w: 44, h: 16 },
    );
  }
  // with the readout showing, a button under it runs the perf test
  if (L.perf) b.push(PERF_TEST);
  if (L.won) {
    if (L.won.age > 1.6) {
      const n = L.won.buttons.length;
      const w = n === 3 ? 104 : 148;
      const x0 = Math.round(W / 2 - (n * w + (n - 1) * 8) / 2);
      L.won.buttons.forEach((id, k) => b.push({ id, x: x0 + k * (w + 8), y: 206, w, h: 18 }));
    }
    return b;
  }
  if (L.build) {
    // the toolbar along the bottom, clear of the turn and zoom buttons on the left
    const tw = 50;
    const x0 = L.touch ? 162 : Math.round(W / 2 - (TOOLS.length * tw) / 2);
    TOOLS.forEach((t, k) => b.push({ id: `tool:${t}`, x: x0 + k * tw, y: H - 34, w: tw - 2, h: 28 }));
    const ax = W - 6;
    if (L.build.drawing) b.push({ id: 'finish', x: ax - 64, y: H - 64, w: 64, h: 24 }, { id: 'cancel', x: ax - 132, y: H - 64, w: 64, h: 24 });
    else if (L.build.tool === 'shed' || L.build.tool === 'spindle' || L.build.tool === 'flap' || L.build.tool === 'rack') b.push({ id: 'rotate', x: ax - 64, y: H - 64, w: 64, h: 24 });
  }
  if (L.touch) {
    if (!L.build) {
      b.push(
        { id: 'feed', x: W - 66, y: H - 66, w: 60, h: 60 },
        { id: 'honk', x: W - 128, y: H - 52, w: 56, h: 46 },
      );
      if (L.kind === 'pen') b.push({ id: 'gate', x: W - 190, y: H - 52, w: 56, h: 46 });
    }
    b.push(
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
  layout: HudLayout;
  objective: { title: string; count: number; total: number; label: string; icon: 'sheep' | 'yarn' };
  time: number;
  /** null on levels without a gate */
  gateOpen: boolean | null;
  /** simulation speed (herdway levels) */
  speed: number;
  flowOn: boolean;
  /** build mode's line of hints, when building */
  buildHint: string | null;
  /** seconds since the game started, for fading the help */
  playing: number;
  showHelp: boolean;
  /** Gafoop's speech, already placed on screen */
  /** above his head at y, or (with no room above) under his feet at `under` */
  bubble: { text: string; x: number; y: number; under: number } | null;
  /** where the pen is, if it is off screen */
  penArrow: { x: number; y: number; angle: number; label: string } | null;
  floaters: { text: string; x: number; y: number; age: number }[];
  cursor: { x: number; y: number; tool: 'idle' | 'bucket' } | null;
  won: { time: number; age: number; lines: [string, string] } | null;
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
  const ob = s.objective;
  panel(g, 6, 6, 150, 46, { fill: C.ink, border: C.straw, accent: C.gold });
  f.small.draw(g, ob.title, 12, 11, { color: C.straw });
  if (ob.icon === 'sheep') drawSprite(g, 'sheep', 12, 24, 2);
  else skein(g, 14, 25);
  f.title.draw(g, `${ob.count}/${ob.total}`, 42, 20, { color: ob.count >= ob.total ? C.lime : C.white, shadow: C.black });
  f.small.draw(g, ob.label, 104, 26, { color: C.fog });
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

  // --- gate (or speed) and megaphone
  panel(g, W - 96, 6, 90, 34, { fill: C.ink, border: C.mist });
  if (s.gateOpen !== null) {
    f.small.draw(g, 'GATE', W - 90, 11, { color: C.fog });
    f.small.draw(g, s.gateOpen ? 'OPEN' : 'SHUT', W - 58, 11, { color: s.gateOpen ? C.lime : C.scarlet });
    if (!s.touch) f.tiny.draw(g, '[G]', W - 26, 11, { color: C.lilac });
  } else {
    f.small.draw(g, 'SPEED', W - 90, 11, { color: C.fog });
    f.small.draw(g, `X${s.speed}`, W - 52, 11, { color: s.speed > 1 ? C.gold : C.mist });
    if (!s.touch) f.tiny.draw(g, '[T]', W - 26, 11, { color: C.lilac });
  }
  f.small.draw(g, 'HONK', W - 90, 25, { color: C.fog });
  rect(g, W - 58, 26, 46, 5, C.coal);
  rect(g, W - 58, 26, Math.round(46 * s.megaphoneReady), 5, s.megaphoneReady >= 1 ? C.gold : C.rust);
  if (s.layout.kind === 'herdway' && !s.won) {
    for (const b of hudButtons(s.layout)) {
      if (b.id !== 'build' && b.id !== 'flow') continue;
      const on = b.id === 'build' ? s.layout.build !== null : s.flowOn;
      const down = s.held.has(b.id);
      button(g, b, down || on, on ? C.gold : C.mist);
      const label = b.id === 'build' ? (s.touch ? 'BUILD' : 'B BUILD') : s.touch ? 'FLOW' : 'O FLOW';
      f.small.draw(g, label, b.x + b.w / 2, b.y + 4 + (down ? 1 : 0), { color: on ? C.gold : C.mist, align: 'center' });
    }
  }

  // --- help strip
  const helpAlpha = s.won ? 0 : s.showHelp || s.buildHint ? 1 : Math.max(0, 1 - (s.playing - 45) / 2);
  if (s.buildHint) {
    // build mode says what each tool does, just above the toolbar
    const w = f.small.measure(s.buildHint) + 12;
    rect(g, Math.round(W / 2 - w / 2), H - 52, w, 13, C.black);
    f.small.draw(g, s.buildHint, W / 2, H - 49, { color: C.straw, align: 'center' });
  } else if (s.touch) {
    if (helpAlpha > 0) {
      g.globalAlpha = helpAlpha;
      const text = s.portrait ? 'TURN YOUR PHONE SIDEWAYS FOR A BIGGER FIELD' : 'DRAG TO FLY  -  HOLD FEED TO LURE  -  HONK SCATTERS';
      const w = f.small.measure(text) + 12;
      rect(g, Math.round(W / 2 - w / 2), 44, w, 13, C.black);
      f.small.draw(g, text, W / 2, 47, { color: s.portrait ? C.gold : C.mist, align: 'center' });
      g.globalAlpha = 1;
    }
  } else if (helpAlpha > 0) {
    const items: [string, string][] = s.layout.kind === 'pen'
      ? [['MOUSE', 'fly'], ['HOLD CLICK', 'feed bucket'], ['SPACE', 'honk'], ['G', 'gate'], ['Q E', 'rotate'], ['WHEEL', 'zoom'], ['H', 'help']]
      : [['MOUSE', 'fly'], ['HOLD CLICK', 'feed'], ['SPACE', 'honk'], ['B', 'build'], ['O', 'flow'], ['T', 'speed'], ['Q E', 'rotate'], ['H', 'help']];
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
    f.small.draw(g, s.penArrow.label, Math.round(x - Math.cos(s.penArrow.angle) * 14), Math.round(y - Math.sin(s.penArrow.angle) * 12) - 3, { color: C.gold, align: 'center', outline: C.black });
  }

  // --- +1 floaters
  for (const fl of s.floaters) {
    g.globalAlpha = Math.max(0, 1 - fl.age / 1.2);
    f.small.draw(g, fl.text, Math.round(fl.x), Math.round(fl.y - fl.age * 18), { color: C.lime, align: 'center', outline: C.black });
  }
  g.globalAlpha = 1;

  // --- speech bubble
  if (s.bubble && !s.won) bubble(g, f, s.bubble.text, s.bubble.x, s.bubble.y, s.bubble.under);

  // --- build toolbar
  if (s.layout.build && !s.won) toolbar(g, f, s);

  // --- touch controls
  if (s.touch && !s.won) touchControls(g, f, s);

  // --- verdict
  if (s.won) won(g, f, s.won, s.layout, s.held);

  // --- cursor
  if (s.cursor && !s.touch) cursor(g, s.cursor.x, s.cursor.y, s.cursor.tool);
}

function button(g: CanvasRenderingContext2D, b: Button, down: boolean, border: string): void {
  panel(g, b.x, b.y + (down ? 1 : 0), b.w, b.h, { fill: down ? C.coal : C.ink, border, shadow: down ? null : C.black });
}

const TOUCH_IDS: ReadonlySet<ButtonId> = new Set<ButtonId>(['feed', 'honk', 'gate', 'rotL', 'rotR', 'zoomIn', 'zoomOut']);

function touchControls(g: CanvasRenderingContext2D, f: Fonts, s: HudState): void {
  for (const b of hudButtons(s.layout)) {
    // the top panel draws its own rows
    if (b.y < 50 || !TOUCH_IDS.has(b.id)) continue;
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

/** A little skein of yarn, for the objective panel. */
function skein(g: CanvasRenderingContext2D, x: number, y: number): void {
  rect(g, x, y + 2, 14, 10, C.black);
  rect(g, x + 1, y + 3, 12, 8, C.violet);
  for (let k = 0; k < 4; k++) rect(g, x + 2 + k * 3, y + 3, 1, 8, C.lavender);
  rect(g, x - 1, y + 6, 16, 2, C.straw);
}

const WON_LABEL: Partial<Record<ButtonId, [string, string]>> = {
  again: ['R  AGAIN', 'AGAIN'],
  bigger: ['N  BIGGER FLOCK', 'BIGGER FLOCK'],
  next: ['L  NEXT LEVEL', 'NEXT LEVEL'],
  keep: ['K  KEEP BUILDING', 'KEEP BUILDING'],
};

/** The build toolbar, and the buttons a half-drawn race or a turnable device needs. */
function toolbar(g: CanvasRenderingContext2D, f: Fonts, s: HudState): void {
  const build = s.layout.build!;
  for (const b of hudButtons(s.layout)) {
    const down = s.held.has(b.id);
    const dy = down ? 1 : 0;
    const cx = b.x + b.w / 2;
    if (b.id.startsWith('tool:')) {
      const t = b.id.slice(5) as ToolId;
      const on = build.tool === t;
      button(g, b, down || on, on ? C.gold : C.lilac);
      const n = TOOLS.indexOf(t) + 1;
      if (!s.touch && n <= 9) f.tiny.draw(g, String(n), b.x + 4, b.y + 3 + dy, { color: C.fog });
      f.small.draw(g, TOOL_LABEL[t], cx, b.y + 15 + dy, { color: on ? C.gold : t === 'remove' ? C.rose : C.mist, align: 'center' });
    } else if (b.id === 'finish' || b.id === 'cancel' || b.id === 'rotate') {
      const c = b.id === 'finish' ? C.lime : b.id === 'cancel' ? C.rose : C.straw;
      button(g, b, down, c);
      const label = b.id === 'finish' ? (s.touch ? 'FINISH' : 'ENTER FINISH') : b.id === 'cancel' ? (s.touch ? 'CANCEL' : 'ESC') : s.touch ? 'TURN' : 'R TURN';
      f.small.draw(g, label, cx, b.y + 8 + dy, { color: c, align: 'center' });
    }
  }
}

function won(g: CanvasRenderingContext2D, f: Fonts, w: NonNullable<HudState['won']>, layout: HudLayout, held: ReadonlySet<ButtonId>): void {
  const { time, age } = w;
  if (age < 0.15) return;
  const cx = W / 2;
  const cy = 132;
  const k = Math.min(1, (age - 0.15) / 0.25);
  // the verdict card slides up, then the Bureau's stamp lands on it
  const py = Math.round(cy - 6 + (1 - k) * 30);
  panel(g, cx - 170, py, 340, 104, { fill: C.ink, border: C.straw, accent: C.gold });
  f.small.draw(g, 'GALACTIC BUREAU OF CONQUEST - FORM 8-A', cx, py + 8, { color: C.fog, align: 'center' });
  if (age > 0.8) {
    f.body.draw(g, w.lines[0].replace('{time}', mmss(time)), cx, py + 52, { color: C.white, align: 'center' });
    f.small.draw(g, w.lines[1], cx, py + 70, { color: C.straw, align: 'center' });
  }
  if (age > 1.6) {
    // clickable, and the keys on a keyboard
    for (const b of hudButtons(layout)) {
      const label = WON_LABEL[b.id];
      if (!label) continue;
      const down = held.has(b.id);
      button(g, b, down, C.lime);
      f.small.draw(g, label[layout.touch || b.w < 140 ? 1 : 0], b.x + b.w / 2, b.y + 5 + (down ? 1 : 0), { color: C.lime, align: 'center' });
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
