import type { Threat } from './perception';

/**
 * Autosheep: this step's threats bucketed by where they are heading (each one's lookahead
 * point, which is what perception and steering measure from), so a sheep weighs only the
 * threats that could reach it. With hundreds of monsters about, a loop over every threat for
 * every sheep cost several times the flock itself. A query returns candidates in list order,
 * and every threat it leaves out is one that could not have touched the sheep, so the results
 * are exactly those of the plain loop.
 */
export class ThreatGrid {
  /** below this many threats the plain loop is cheaper, and is used instead */
  static min = 24;
  /** a grid was built this step (there are at least `min` threats) */
  active = false;
  private cell = 4;
  private x0 = 0;
  private y0 = 0;
  private cols = 1;
  private rows = 1;
  private start = new Int32Array(2);
  private fill = new Int32Array(1);
  private items = new Int32Array(0);
  private cellOf = new Int32Array(0);

  build(threats: readonly Threat[], lookahead: number): void {
    const n = threats.length;
    this.active = n >= ThreatGrid.min;
    if (!this.active) return;
    if (this.items.length < n) {
      this.items = new Int32Array(n * 2);
      this.cellOf = new Int32Array(n * 2);
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      const t = threats[k];
      const x = t.x + t.vx * lookahead;
      const y = t.y + t.vy * lookahead;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // 4 m cells, coarser if the threats are spread very wide
    let cell = 4;
    while ((maxX - minX) / cell > 128 || (maxY - minY) / cell > 128) cell *= 2;
    this.cell = cell;
    this.x0 = minX;
    this.y0 = minY;
    this.cols = Math.floor((maxX - minX) / cell) + 1;
    this.rows = Math.floor((maxY - minY) / cell) + 1;
    const cells = this.cols * this.rows;
    if (this.start.length < cells + 1) {
      this.start = new Int32Array(cells + 1);
      this.fill = new Int32Array(cells);
    }
    const st = this.start;
    st.fill(0, 0, cells + 1);
    for (let k = 0; k < n; k++) {
      const t = threats[k];
      const cx = Math.floor((t.x + t.vx * lookahead - minX) / cell);
      const cy = Math.floor((t.y + t.vy * lookahead - minY) / cell);
      const c = cy * this.cols + cx;
      this.cellOf[k] = c;
      st[c + 1]++;
    }
    for (let c = 0; c < cells; c++) st[c + 1] += st[c];
    for (let c = 0; c < cells; c++) this.fill[c] = st[c];
    // in list order, so each cell's threats come out ascending
    for (let k = 0; k < n; k++) this.items[this.fill[this.cellOf[k]]++] = k;
  }

  /**
   * The threats whose lookahead point may lie within `r` of (x, y), in ascending list order,
   * written to `out` (which must hold as many as there are threats). Returns how many.
   */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const cs = this.cell;
    const gx0 = Math.max(0, Math.floor((x - r - this.x0) / cs));
    const gx1 = Math.min(this.cols - 1, Math.floor((x + r - this.x0) / cs));
    const gy0 = Math.max(0, Math.floor((y - r - this.y0) / cs));
    const gy1 = Math.min(this.rows - 1, Math.floor((y + r - this.y0) / cs));
    let m = 0;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gy * this.cols + gx;
        for (let q = this.start[c]; q < this.start[c + 1]; q++) out[m++] = this.items[q];
      }
    }
    // cells were visited row by row; put the threats back in list order
    if (m > 1) out.subarray(0, m).sort();
    return m;
  }
}
