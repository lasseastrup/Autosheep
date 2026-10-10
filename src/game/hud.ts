import type { Fonts } from '../engine/bitmapFont';
import { C } from '../engine/palette';
import { drawSprite } from '../engine/sprites';
import { panel, rect } from '../engine/ui';

export const W = 640;
export const H = 360;

export interface HudState {
  penned: number;
  total: number;
  time: number;
  gateOpen: boolean;
  /** seconds since the game started, for fading the help */
  playing: number;
  showHelp: boolean;
  /** Gafoop's speech, already placed on screen */
  bubble: { text: string; x: number; y: number } | null;
  /** where the pen is, if it is off screen */
  penArrow: { x: number; y: number; angle: number } | null;
  floaters: { text: string; x: number; y: number; age: number }[];
  cursor: { x: number; y: number; tool: 'idle' | 'bucket' } | null;
  won: { time: number; age: number } | null;
  megaphoneReady: number;
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

  // --- gate and megaphone
  panel(g, W - 96, 6, 90, 34, { fill: C.ink, border: C.mist });
  f.small.draw(g, 'GATE', W - 90, 11, { color: C.fog });
  f.small.draw(g, s.gateOpen ? 'OPEN' : 'SHUT', W - 58, 11, { color: s.gateOpen ? C.lime : C.scarlet });
  f.tiny.draw(g, '[G]', W - 26, 11, { color: C.lilac });
  f.small.draw(g, 'HONK', W - 90, 25, { color: C.fog });
  rect(g, W - 58, 26, 46, 5, C.coal);
  rect(g, W - 58, 26, Math.round(46 * s.megaphoneReady), 5, s.megaphoneReady >= 1 ? C.gold : C.rust);

  // --- help strip
  const helpAlpha = s.won ? 0 : s.showHelp ? 1 : Math.max(0, 1 - (s.playing - 45) / 2);
  if (helpAlpha > 0) {
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
  if (s.bubble && !s.won) bubble(g, f, s.bubble.text, s.bubble.x, s.bubble.y);

  // --- verdict
  if (s.won) won(g, f, s.won.time, s.won.age, s.total);

  // --- cursor
  if (s.cursor) cursor(g, s.cursor.x, s.cursor.y, s.cursor.tool);
}

function bubble(g: CanvasRenderingContext2D, f: Fonts, text: string, x: number, y: number): void {
  const lines = f.body.wrap(text, 190);
  const w = Math.max(...lines.map((l) => f.body.measure(l))) + 12;
  const h = lines.length * 14 + 6;
  const bx = Math.round(Math.max(4, Math.min(W - w - 4, x - w / 2)));
  const by = Math.round(Math.max(56, y - h - 10));
  panel(g, bx, by, w, h, { fill: C.white, border: C.black, shadow: C.ink });
  // tail
  const tx = Math.round(Math.max(bx + 6, Math.min(bx + w - 8, x)));
  for (let i = 0; i < 5; i++) rect(g, tx - (4 - i), by + h - 1 + i, (4 - i) * 2 - 1 > 0 ? (4 - i) * 2 - 1 : 1, 1, i === 4 ? C.black : C.white);
  lines.forEach((l, i) => f.body.draw(g, l, bx + 6, by + 3 + i * 14, { color: C.ink }));
}

function won(g: CanvasRenderingContext2D, f: Fonts, time: number, age: number, total: number): void {
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
    f.small.draw(g, 'R  HERD AGAIN      N  A BIGGER FLOCK', cx, py + 88, { color: Math.floor(age * 2) % 2 ? C.lime : C.mist, align: 'center' });
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
