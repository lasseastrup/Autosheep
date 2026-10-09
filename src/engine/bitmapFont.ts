/**
 * Pixel-perfect text for the low-res overlay. A web pixel font is rasterised once into a
 * glyph atlas at its native size with the alpha thresholded (no anti-aliasing), then text
 * is drawn by blitting glyphs. Tinted atlases are cached per colour.
 */
export interface TextStyle {
  color?: string;
  outline?: string | null; // 1px outline (8-neighbour)
  shadow?: string | null; // 1px drop shadow down-right
  align?: 'left' | 'center' | 'right';
  spacing?: number; // extra px between glyphs
}

const FIRST = 32;
const LAST = 255;

export class BitmapFont {
  readonly lineHeight: number;
  readonly ascent: number;
  private atlas: HTMLCanvasElement;
  private advances: number[] = [];
  private cell: number;
  private tinted = new Map<string, HTMLCanvasElement>();

  constructor(readonly family: string, readonly size: number, opts: { threshold?: number; lineHeight?: number; weight?: number } = {}) {
    const threshold = opts.threshold ?? 110;
    // tall cells with the baseline in the middle; only a band around the glyph is ever
    // copied, so tall neighbours (accents, .notdef boxes) can never bleed in
    this.cell = Math.ceil(size * 3);
    const cols = 16;
    const rows = Math.ceil((LAST - FIRST + 1) / cols);
    this.atlas = document.createElement('canvas');
    this.atlas.width = cols * this.cell;
    this.atlas.height = rows * this.cell;
    const g = this.atlas.getContext('2d', { willReadFrequently: true })!;
    g.font = `${opts.weight ?? 400} ${size}px "${family}"`;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    const m = g.measureText('HgÁ');
    this.ascent = Math.round(g.measureText('H').actualBoundingBoxAscent);
    const descent = Math.round(m.actualBoundingBoxDescent);
    this.lineHeight = opts.lineHeight ?? this.ascent + descent + Math.max(2, Math.round(size / 6));
    // band = from the top of the tallest glyph (accents) to below the descenders
    this.bandTop = Math.max(0, size + this.ascent - Math.round(m.actualBoundingBoxAscent) - 2);
    this.bandH = Math.round(m.actualBoundingBoxAscent) + descent + 4;
    for (let c = FIRST; c <= LAST; c++) {
      if (c >= 127 && c < 161) continue; // control characters
      const i = c - FIRST;
      const ch = String.fromCharCode(c);
      this.advances[c] = Math.round(g.measureText(ch).width);
      g.fillText(ch, (i % cols) * this.cell + 2, Math.floor(i / cols) * this.cell + size + this.ascent);
    }
    const d = g.getImageData(0, 0, this.atlas.width, this.atlas.height);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > threshold ? 255 : 0;
    for (let i = 0; i < d.data.length; i += 4) d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    g.putImageData(d, 0, 0);
  }

  private bandTop: number;
  private bandH: number;

  private tint(color: string): HTMLCanvasElement {
    let t = this.tinted.get(color);
    if (!t) {
      t = document.createElement('canvas');
      t.width = this.atlas.width;
      t.height = this.atlas.height;
      const g = t.getContext('2d')!;
      g.drawImage(this.atlas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, t.width, t.height);
      this.tinted.set(color, t);
    }
    return t;
  }

  measure(text: string, spacing = 0): number {
    let w = 0;
    for (let i = 0; i < text.length; i++) w += (this.advances[text.charCodeAt(i)] ?? this.size / 2) + spacing;
    return Math.max(0, w - spacing);
  }

  wrap(text: string, maxWidth: number, spacing = 0): string[] {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const tryLine = line ? `${line} ${word}` : word;
        if (this.measure(tryLine, spacing) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = tryLine;
      }
      lines.push(line);
    }
    return lines;
  }

  private raw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, spacing: number): void {
    const atlas = this.tint(color);
    let cx = Math.round(x);
    // y is the top of the cap height; the band starts bandTop below the cell top
    const capTop = this.size;
    const top = Math.round(y) - (capTop - this.bandTop);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= FIRST && c <= LAST && c !== 32 && !(c >= 127 && c < 161)) {
        const k = c - FIRST;
        ctx.drawImage(atlas, (k % 16) * this.cell, Math.floor(k / 16) * this.cell + this.bandTop, this.cell, this.bandH, cx - 2, top, this.cell, this.bandH);
      }
      cx += (this.advances[c] ?? this.size / 2) + spacing;
    }
  }

  /** Draw one line; y is the top of the cap height. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): number {
    const spacing = style.spacing ?? 0;
    const w = this.measure(text, spacing);
    if (style.align === 'center') x -= Math.floor(w / 2);
    else if (style.align === 'right') x -= w;
    if (style.outline) {
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) this.raw(ctx, text, x + dx, y + dy, style.outline, spacing);
    }
    if (style.shadow) this.raw(ctx, text, x + 1, y + 1, style.shadow, spacing);
    this.raw(ctx, text, x, y, style.color ?? '#ffffff', spacing);
    return w;
  }

  drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, style: TextStyle = {}): void {
    lines.forEach((l, i) => this.draw(ctx, l, x, y + i * this.lineHeight, style));
  }
}

/** Fonts used across the game, created after document.fonts has loaded them. */
export interface Fonts {
  body: BitmapFont; // Pixelify Sans 16 — dialogue, subtitles
  small: BitmapFont; // Silkscreen 8 — labels
  tiny: BitmapFont; // Tiny5 8
  ui: BitmapFont; // Press Start 2P 8 — computer readouts
  title: BitmapFont; // Jersey 10 at 20
  huge: BitmapFont; // Jersey 10 at 40
  mega: BitmapFont; // Jersey 10 at 80
}

export async function loadFonts(): Promise<Fonts> {
  const specs: [string, number][] = [
    ['Pixelify Sans', 16], ['Silkscreen', 8], ['Tiny5', 8], ['Press Start 2P', 8], ['Jersey 10', 20], ['Jersey 10', 40], ['Jersey 10', 80],
  ];
  await Promise.all(specs.map(([f, s]) => document.fonts.load(`${s}px "${f}"`)));
  return {
    body: new BitmapFont('Pixelify Sans', 16, { lineHeight: 16 }),
    small: new BitmapFont('Silkscreen', 8, { lineHeight: 9 }),
    tiny: new BitmapFont('Tiny5', 8, { lineHeight: 8 }),
    ui: new BitmapFont('Press Start 2P', 8, { lineHeight: 10 }),
    title: new BitmapFont('Jersey 10', 20),
    huge: new BitmapFont('Jersey 10', 40),
    mega: new BitmapFont('Jersey 10', 80),
  };
}
