/**
 * The grass: how long it is in every half-metre cell of the world. Grazing sheep eat it down
 * (the flock model does the eating, through the contract), and it grows back over minutes, so
 * a flock that stays put runs out of grass and moves on. That is the mechanical reason sheep
 * go anywhere at all, and the renderer draws exactly this field: long where nobody has been,
 * stubble where a flock has grazed.
 *
 * Deterministic and headless, like the rest of the sim. Lengths are 0..1 of a full sward; each
 * cell also has a cap (how long grass grows there: 0 for bare ground, a path, a building).
 */

export const GRASS = {
  /** metres per cell */
  cell: 0.5,
  /** seconds for grass to grow back from bare to full (it starts slowly: a grazed-out patch
   * needs leaves before it can grow quickly) */
  regrow: 900,
  /** a grazing sheep's appetite: full cells' worth eaten per second, with its head down */
  bite: 0.4,
  /** a mouthful's reach around the muzzle, m */
  mouth: 0.45,
  /** growth is applied in steps this long, s (it is slow, and the field is big) */
  growStep: 0.5,
};

export class GrassField {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** grass length per cell, 0..cap, row-major (x fastest) */
  readonly length: Float32Array;
  /** how long grass can grow in each cell */
  readonly cap: Float32Array;
  /** bumped whenever lengths change, so a renderer knows to upload them */
  version = 0;
  /** grass eaten since the start, in full cells */
  eaten = 0;
  private acc = 0;

  constructor(readonly width: number, readonly height: number, cell = GRASS.cell) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.length = new Float32Array(this.cols * this.rows).fill(1);
    this.cap = new Float32Array(this.cols * this.rows).fill(1);
  }

  /** Set every cell's cap from `cap(x, y)` (at the cell centre), and grow it to that length. */
  fill(cap: (x: number, y: number) => number): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const k = r * this.cols + c;
        const v = Math.max(0, Math.min(1, cap((c + 0.5) * this.cell, (r + 0.5) * this.cell)));
        this.cap[k] = v;
        this.length[k] = v;
      }
    }
    this.version++;
  }

  /** Grass length at (x, y), bilinear between cell centres; 0 off the field. */
  at(x: number, y: number): number {
    const fx = x / this.cell - 0.5;
    const fy = y / this.cell - 0.5;
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const tx = fx - c0;
    const ty = fy - r0;
    const g = (c: number, r: number) => (c < 0 || r < 0 || c >= this.cols || r >= this.rows ? 0 : this.length[r * this.cols + c]);
    return (g(c0, r0) * (1 - tx) + g(c0 + 1, r0) * tx) * (1 - ty) + (g(c0, r0 + 1) * (1 - tx) + g(c0 + 1, r0 + 1) * tx) * ty;
  }

  /**
   * A mouthful at (x, y): takes up to `want` (in full cells' worth) from the cells within
   * `GRASS.mouth`, the longest grass first in proportion, and returns how much it got.
   */
  eat(x: number, y: number, want: number): number {
    if (want <= 0) return 0;
    const R = GRASS.mouth;
    const c0 = Math.max(0, Math.floor((x - R) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((x + R) / this.cell));
    const r0 = Math.max(0, Math.floor((y - R) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((y + R) / this.cell));
    let total = 0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) total += this.length[r * this.cols + c];
    if (total <= 1e-6) return 0;
    const take = Math.min(want, total);
    const f = take / total;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * this.cols + c;
        this.length[k] -= this.length[k] * f;
      }
    }
    this.eaten += take;
    this.version++;
    return take;
  }

  /** Let the grass grow for `dt` seconds. */
  grow(dt: number): void {
    this.acc += dt;
    if (this.acc < GRASS.growStep) return;
    const step = this.acc;
    this.acc = 0;
    const rate = step / GRASS.regrow;
    const L = this.length;
    const cap = this.cap;
    let changed = false;
    for (let k = 0; k < L.length; k++) {
      const m = cap[k];
      const l = L[k];
      if (l >= m) continue;
      // slow from stubble, quick once there is leaf; bare to full in about `regrow` seconds
      L[k] = Math.min(m, l + rate * m * (0.4 + 1.2 * (l / m)));
      changed = true;
    }
    if (changed) this.version++;
  }

  /** Average length over a disc, sampled on a coarse ring pattern (cheap, for decisions). */
  around(x: number, y: number, radius: number): number {
    let s = this.at(x, y);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      s += this.at(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    return s / 9;
  }

  /** Total grass on the field, in full cells (for tests and readouts). */
  total(): number {
    let s = 0;
    for (let k = 0; k < this.length.length; k++) s += this.length[k];
    return s;
  }
}
