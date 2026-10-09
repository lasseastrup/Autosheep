import type { Obstacle } from '../../contract';

/**
 * Static fence segments in a bucket grid. Each cell lists the segments that pass within
 * `reach` of it, so a query near a sheep only looks at the fences that could matter to it.
 * Autosheep addition: the original model only knew the world edges.
 */
export class Obstacles {
  ax = new Float32Array(0);
  ay = new Float32Array(0);
  bx = new Float32Array(0);
  by = new Float32Array(0);
  radius = new Float32Array(0);
  solid = new Uint8Array(0);
  count = 0;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  /** CSR lists: segments for cell c are items[start[c] .. start[c + 1]) */
  private start: Int32Array;
  private items = new Int32Array(0);

  constructor(width: number, height: number, cellSize: number, private readonly reach: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.start = new Int32Array(this.cols * this.rows + 1);
  }

  set(list: readonly Obstacle[]): void {
    const n = list.length;
    this.count = n;
    this.ax = new Float32Array(n);
    this.ay = new Float32Array(n);
    this.bx = new Float32Array(n);
    this.by = new Float32Array(n);
    this.radius = new Float32Array(n);
    this.solid = new Uint8Array(n);
    list.forEach((o, k) => {
      this.ax[k] = o.ax; this.ay[k] = o.ay; this.bx[k] = o.bx; this.by[k] = o.by;
      this.radius[k] = o.radius;
      this.solid[k] = o.solid ? 1 : 0;
    });
    // conservative rasterisation: a segment is listed in every cell its padded bounding box
    // touches and that lies within reach of the segment itself
    const cells: number[][] = Array.from({ length: this.cols * this.rows }, () => []);
    const cs = this.cellSize;
    const half = cs * Math.SQRT1_2;
    for (let k = 0; k < n; k++) {
      const pad = this.reach + this.radius[k];
      const x0 = Math.max(0, Math.floor((Math.min(this.ax[k], this.bx[k]) - pad) / cs));
      const x1 = Math.min(this.cols - 1, Math.floor((Math.max(this.ax[k], this.bx[k]) + pad) / cs));
      const y0 = Math.max(0, Math.floor((Math.min(this.ay[k], this.by[k]) - pad) / cs));
      const y1 = Math.min(this.rows - 1, Math.floor((Math.max(this.ay[k], this.by[k]) + pad) / cs));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const cx = (gx + 0.5) * cs;
          const cy = (gy + 0.5) * cs;
          if (this.distance(k, cx, cy) <= pad + half) cells[gy * this.cols + gx].push(k);
        }
      }
    }
    let total = 0;
    for (const c of cells) total += c.length;
    this.items = new Int32Array(total);
    let p = 0;
    for (let c = 0; c < cells.length; c++) {
      this.start[c] = p;
      for (const k of cells[c]) this.items[p++] = k;
    }
    this.start[cells.length] = p;
  }

  /** Distance from (x, y) to the centre line of segment k. */
  distance(k: number, x: number, y: number): number {
    const ax = this.ax[k];
    const ay = this.ay[k];
    const ex = this.bx[k] - ax;
    const ey = this.by[k] - ay;
    const l2 = ex * ex + ey * ey;
    let t = l2 > 1e-12 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - (ax + ex * t), y - (ay + ey * t));
  }

  /** Segment indices that may lie within `reach` of (x, y). */
  near(x: number, y: number): Int32Array {
    if (this.count === 0) return EMPTY;
    let gx = Math.floor(x / this.cellSize);
    let gy = Math.floor(y / this.cellSize);
    gx = gx < 0 ? 0 : gx >= this.cols ? this.cols - 1 : gx;
    gy = gy < 0 ? 0 : gy >= this.rows ? this.rows - 1 : gy;
    const c = gy * this.cols + gx;
    return this.items.subarray(this.start[c], this.start[c + 1]);
  }

  /**
   * Is the straight line from (x0, y0) to (x1, y1) cut by a solid segment? Used for line of
   * sight: sheep cannot see a threat or each other through a stone wall.
   */
  blocksSight(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.count === 0) return false;
    for (let k = 0; k < this.count; k++) {
      if (!this.solid[k]) continue;
      if (segmentsCross(x0, y0, x1, y1, this.ax[k], this.ay[k], this.bx[k], this.by[k])) return true;
    }
    return false;
  }
}

const EMPTY = new Int32Array(0);

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsCross(
  p0x: number, p0y: number, p1x: number, p1y: number,
  q0x: number, q0y: number, q1x: number, q1y: number,
): boolean {
  const d1 = cross(q0x, q0y, q1x, q1y, p0x, p0y);
  const d2 = cross(q0x, q0y, q1x, q1y, p1x, p1y);
  const d3 = cross(p0x, p0y, p1x, p1y, q0x, q0y);
  const d4 = cross(p0x, p0y, p1x, p1y, q1x, q1y);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
