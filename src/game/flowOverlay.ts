/**
 * The Flow overlay (DESIGN.md §10.2, Factorio's alt-mode for flocks): which way sheep have
 * been moving through each patch of ground lately, and what every station is doing. It is
 * what makes a jam readable: arrows that stop, or turn round, show where the line broke.
 */
import * as THREE from 'three';
import type { Fonts } from '../engine/bitmapFont';
import { C } from '../engine/palette';
import { rect } from '../engine/ui';
import type { FlockOutputs } from '../sim/contract';
import type { Works } from '../works/works';
import { pixelLine } from './build';

const CELL = 2;
/** seconds the averages remember */
const MEMORY = 8;

export class FlowField {
  private readonly cols: number;
  private readonly rows: number;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  /** sheep-seconds seen in each cell lately */
  private readonly weight: Float32Array;

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    const n = this.cols * this.rows;
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.weight = new Float32Array(n);
  }

  /** Fold one simulation step in. */
  sample(o: FlockOutputs, dt: number): void {
    const decay = Math.exp(-dt / MEMORY);
    for (let c = 0; c < this.weight.length; c++) {
      this.vx[c] *= decay;
      this.vy[c] *= decay;
      this.weight[c] *= decay;
    }
    for (let i = 0; i < o.count; i++) {
      const cx = Math.floor(o.x[i] / CELL);
      const cy = Math.floor(o.y[i] / CELL);
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
      const c = cy * this.cols + cx;
      const h = o.heading[i];
      this.vx[c] += Math.cos(h) * o.speed[i] * dt;
      this.vy[c] += Math.sin(h) * o.speed[i] * dt;
      this.weight[c] += dt;
    }
  }

  clear(): void {
    this.vx.fill(0);
    this.vy.fill(0);
    this.weight.fill(0);
  }

  draw(g: CanvasRenderingContext2D, f: Fonts, toScreen: (x: number, y: number, h?: number) => THREE.Vector2, works: Works, W: number, H: number): void {
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const c = cy * this.cols + cx;
        const w = this.weight[c];
        if (w < 0.5) continue;
        const mx = this.vx[c] / w;
        const my = this.vy[c] / w;
        const sp = Math.hypot(mx, my);
        const x = (cx + 0.5) * CELL;
        const y = (cy + 0.5) * CELL;
        const a = toScreen(x, y);
        if (a.x < -8 || a.y < -8 || a.x > W + 8 || a.y > H + 8) continue;
        if (sp < 0.12) {
          // sheep standing about: a dot, red where many are stuck
          rect(g, Math.round(a.x), Math.round(a.y), 2, 2, w > 6 ? C.scarlet : C.lilac);
          continue;
        }
        const len = Math.min(1.6, 0.4 + sp * 0.9);
        const b = toScreen(x + (mx / sp) * len, y + (my / sp) * len);
        const col = sp > 0.9 ? C.lime : sp > 0.4 ? C.gold : C.salmon;
        const hx = b.x - a.x;
        const hy = b.y - a.y;
        const hl = Math.hypot(hx, hy) || 1;
        const ux = hx / hl;
        const uy = hy / hl;
        // a dark shadow under a two-pixel shaft, then the head
        pixelLine(g, a.x, a.y + 1, b.x, b.y + 1, C.black);
        pixelLine(g, a.x, a.y, b.x, b.y, col);
        pixelLine(g, a.x + uy * 0.7, a.y - ux * 0.7, b.x + uy * 0.7, b.y - ux * 0.7, col);
        const head = (s: number) => pixelLine(g, b.x, b.y, b.x - ux * 4 + s * uy * 3, b.y - uy * 4 - s * ux * 3, col);
        head(1);
        head(-1);
      }
    }
    // what each station is up to
    for (const s of works.stations) {
      const p = toScreen(s.device.at.x, s.device.at.y, 2.6);
      if (p.x < -60 || p.y < -20 || p.x > W + 60 || p.y > H + 20) continue;
      const what = s.phase === 'fill' ? `FILLING ${s.inside}/4` : s.phase === 'work' ? (s.device.kind === 'shed' ? 'SHEARING' : 'SPINNING') : 'LETTING OUT';
      const label = `${s.device.kind === 'shed' ? 'SHED' : 'SPINDLE'}  ${what}  ${Math.round(s.rate)}/MIN`;
      const w = f.tiny.measure(label) + 6;
      rect(g, Math.round(p.x - w / 2), Math.round(p.y) - 1, w, 9, C.black);
      f.tiny.draw(g, label, Math.round(p.x), Math.round(p.y) + 1, { color: s.phase === 'work' ? C.lime : s.phase === 'release' ? C.gold : C.mist, align: 'center' });
    }
  }
}
