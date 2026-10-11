import { ENEMY, type EnemyKind } from './config';

export const KINDS: EnemyKind[] = ['gloop', 'bigGloop', 'saucer'];
export const KIND = { gloop: 0, bigGloop: 1, saucer: 2 } as const;

/** What a monster is doing. */
export const Phase = {
  /** heading for its target (a sheep, Gafoop) */
  Seek: 0,
  /** hanging on to a sheep: pinning it, or one of the team carrying it */
  Attached: 1,
  /** a saucer marking the ground under it before it beams */
  Telegraph: 2,
  /** a saucer lifting a sheep */
  Beam: 3,
  /** a saucer that has finished an abduction, drifting before the next */
  Rest: 4,
} as const;

/**
 * The monsters, as structure-of-arrays with free slots reused. Each one has a `uid` that is
 * never reused, so the flock (which tracks a threat's velocity by its id) and the view can
 * tell a new monster from the one that had its slot before.
 */
export class Enemies {
  readonly cap: number;
  /** slots in use are below this */
  high = 0;
  alive: Uint8Array;
  kind: Uint8Array;
  uid: Int32Array;
  x: Float32Array;
  y: Float32Array;
  /** position at the previous step, for drawing between steps */
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** knockback, decaying */
  kx: Float32Array;
  ky: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  phase: Uint8Array;
  /** seconds into the phase */
  t: Float32Array;
  /** -1: Gafoop; a sheep's index; -2: nothing yet */
  target: Int32Array;
  /** the sheep it holds, or -1 */
  carry: Int32Array;
  /** seconds until it looks for a new target */
  retarget: Float32Array;
  /** seconds left of its hit flash */
  flash: Float32Array;
  /** seconds until the shredder may hit it again */
  shred: Float32Array;
  /** saucers: where they are heading, and their height */
  gx: Float32Array;
  gy: Float32Array;
  z: Float32Array;
  private nextUid = 1;
  private free: number[] = [];

  constructor(cap: number) {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.alive = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
    this.uid = new Int32Array(cap);
    this.x = f(); this.y = f(); this.px = f(); this.py = f();
    this.vx = f(); this.vy = f(); this.kx = f(); this.ky = f();
    this.hp = f(); this.maxHp = f();
    this.phase = new Uint8Array(cap);
    this.t = f();
    this.target = new Int32Array(cap).fill(-2);
    this.carry = new Int32Array(cap).fill(-1);
    this.retarget = f(); this.flash = f(); this.shred = f();
    this.gx = f(); this.gy = f(); this.z = f();
  }

  /** How many are alive, of a kind or of all kinds. */
  countOf(kind?: EnemyKind): number {
    let n = 0;
    const k = kind === undefined ? -1 : KIND[kind];
    for (let i = 0; i < this.high; i++) if (this.alive[i] && (k < 0 || this.kind[i] === k)) n++;
    return n;
  }

  /** A new monster at (x, y), or -1 if the field is full. */
  spawn(kind: EnemyKind, x: number, y: number, hpScale: number): number {
    const i = this.free.length ? this.free.pop()! : this.high < this.cap ? this.high++ : -1;
    if (i < 0) return -1;
    const s = ENEMY[kind];
    this.alive[i] = 1;
    this.kind[i] = KIND[kind];
    this.uid[i] = this.nextUid++;
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = this.vy[i] = this.kx[i] = this.ky[i] = 0;
    this.hp[i] = this.maxHp[i] = s.hp * hpScale;
    this.phase[i] = Phase.Seek;
    this.t[i] = 0;
    this.target[i] = -2;
    this.carry[i] = -1;
    this.retarget[i] = 0;
    this.flash[i] = 0;
    this.shred[i] = 0;
    this.gx[i] = x;
    this.gy[i] = y;
    this.z[i] = 0;
    return i;
  }

  remove(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.carry[i] = -1;
    this.free.push(i);
  }

  clear(): void {
    this.alive.fill(0);
    this.high = 0;
    this.free = [];
  }
}

/**
 * A uniform grid over the field and a margin round it, rebuilt every step: which monsters are
 * near a point, for keeping them apart and for everything that hits an area.
 */
export class EnemyGrid {
  readonly cell = 2;
  readonly x0 = -70;
  readonly y0 = -70;
  readonly cols: number;
  readonly rows: number;
  private readonly start: Int32Array;
  private readonly fill: Int32Array;
  private items: Int32Array;
  private cellOf: Int32Array;

  constructor(width: number, height: number, cap: number) {
    this.cols = Math.ceil((width - 2 * this.x0) / this.cell);
    this.rows = Math.ceil((height - 2 * this.y0) / this.cell);
    this.start = new Int32Array(this.cols * this.rows + 1);
    this.fill = new Int32Array(this.cols * this.rows);
    this.items = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);
  }

  private cx(x: number): number {
    const c = Math.floor((x - this.x0) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cy(y: number): number {
    const r = Math.floor((y - this.y0) / this.cell);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  build(e: Enemies): void {
    const st = this.start;
    st.fill(0);
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const c = this.cy(e.y[i]) * this.cols + this.cx(e.x[i]);
      this.cellOf[i] = c;
      st[c + 1]++;
    }
    for (let c = 0; c < st.length - 1; c++) st[c + 1] += st[c];
    this.fill.set(st.subarray(0, this.fill.length));
    for (let i = 0; i < e.high; i++) if (e.alive[i]) this.items[this.fill[this.cellOf[i]]++] = i;
  }

  /** Call `fn` for every monster in the cells covering the box round (x, y) of half-size r. */
  near(x: number, y: number, r: number, fn: (i: number) => void): void {
    const gx0 = this.cx(x - r);
    const gx1 = this.cx(x + r);
    const gy0 = this.cy(y - r);
    const gy1 = this.cy(y + r);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gy * this.cols + gx;
        for (let q = this.start[c]; q < this.start[c + 1]; q++) fn(this.items[q]);
      }
    }
  }
}
