import { C } from './palette';

/** Overlay drawing helpers. Everything snaps to whole pixels and uses palette colours. */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const patterns = new Map<number, CanvasPattern>();

function bayerPattern(g: CanvasRenderingContext2D, level: number): CanvasPattern {
  let p = patterns.get(level);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const x = c.getContext('2d')!;
    x.fillStyle = '#000';
    for (let i = 0; i < 16; i++) if (BAYER[i] < level) x.fillRect(i % 4, Math.floor(i / 4), 1, 1);
    p = g.createPattern(c, 'repeat')!;
    patterns.set(level, p);
  }
  return p;
}

/** Erase a region with an ordered-dither mask: amount 0 = untouched, 1 = fully erased. */
export function ditherOut(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number): void {
  const level = Math.round(Math.max(0, Math.min(1, amount)) * 16);
  if (level <= 0) return;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = level >= 16 ? '#000' : bayerPattern(g, level);
  g.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
  g.restore();
}

/** Fill a region with a dither of a colour (for darkening backdrops). */
export function ditherFill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, amount: number): void {
  const level = Math.round(Math.max(0, Math.min(1, amount)) * 16);
  if (level <= 0) return;
  const off = document.createElement('canvas');
  off.width = Math.ceil(w);
  off.height = Math.ceil(h);
  const o = off.getContext('2d')!;
  o.fillStyle = color;
  o.fillRect(0, 0, off.width, off.height);
  if (level < 16) {
    o.globalCompositeOperation = 'destination-in';
    o.fillStyle = bayerPattern(o, level);
    o.fillRect(0, 0, off.width, off.height);
  }
  g.drawImage(off, Math.floor(x), Math.floor(y));
}

export function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
}

export function frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  x = Math.floor(x);
  y = Math.floor(y);
  w = Math.ceil(w);
  h = Math.ceil(h);
  g.fillStyle = color;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/** A bevelled pixel panel: dark fill, light border, notched corners, drop shadow. */
export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts: { fill?: string; border?: string; shadow?: string | null; accent?: string } = {}): void {
  const fill = opts.fill ?? C.ink;
  const border = opts.border ?? C.mist;
  if (opts.shadow !== null) rect(g, x + 2, y + 2, w, h, opts.shadow ?? C.black);
  rect(g, x, y, w, h, fill);
  frame(g, x, y, w, h, border);
  // notched corners
  g.clearRect(Math.floor(x), Math.floor(y), 1, 1);
  g.clearRect(Math.floor(x + w - 1), Math.floor(y), 1, 1);
  g.clearRect(Math.floor(x), Math.floor(y + h - 1), 1, 1);
  g.clearRect(Math.floor(x + w - 1), Math.floor(y + h - 1), 1, 1);
  if (opts.accent) rect(g, x + 2, y + 2, w - 4, 1, opts.accent);
}

/** Draw a canvas rotated with nearest-neighbour sampling (crisp, aliased pixels). */
export function drawRotated(g: CanvasRenderingContext2D, src: HTMLCanvasElement, cx: number, cy: number, angle: number, scale = 1): void {
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(Math.round(cx), Math.round(cy));
  g.rotate(angle);
  g.scale(scale, scale);
  g.drawImage(src, -Math.floor(src.width / 2), -Math.floor(src.height / 2));
  g.restore();
}

export function offscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/** Hard-threshold a canvas's alpha so rotations/scales stay palette-clean. */
export function hardenAlpha(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
  g.putImageData(d, 0, 0);
  return c;
}
