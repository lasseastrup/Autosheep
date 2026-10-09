import { hashOutputs, segmentT, SheepState, type FlockInit, type FlockModel, type FlockOutputs, type Obstacle, type Stimulus } from '../../contract';

/**
 * A deliberately simple boids flock behind the same contract. It is not meant to be fun to
 * herd; it exists so the game cannot quietly depend on one model's internals, and so the
 * contract tests have a second implementation to keep them honest.
 */
export class BoidsModel implements FlockModel {
  readonly name = 'boids';
  readonly dt = 1 / 30;
  time = 0;
  out!: FlockOutputs;
  private n = 0;
  private w = 0;
  private h = 0;
  private x!: Float32Array;
  private y!: Float32Array;
  private vx!: Float32Array;
  private vy!: Float32Array;
  private heading!: Float32Array;
  private speed!: Float32Array;
  private state!: Uint8Array;
  private fear!: Float32Array;
  private group!: Int32Array;
  private wander!: Float32Array;
  private fences: Obstacle[] = [];
  private seed = 1;

  init(spec: FlockInit): void {
    const n = spec.sheep.length;
    this.n = n;
    this.w = spec.width;
    this.h = spec.height;
    this.seed = spec.seed | 0 || 1;
    this.time = 0;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f();
    this.heading = f(); this.speed = f(); this.fear = f(); this.wander = f();
    this.state = new Uint8Array(n);
    this.group = new Int32Array(n);
    spec.sheep.forEach((s, i) => {
      this.x[i] = s.x;
      this.y[i] = s.y;
      this.heading[i] = s.heading ?? this.rand() * Math.PI * 2;
      this.wander[i] = this.heading[i];
    });
    const self = this;
    this.out = {
      get count() { return self.n; },
      x: this.x, y: this.y, heading: this.heading, speed: this.speed,
      state: this.state, fear: this.fear, group: this.group,
    };
  }

  private rand(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setObstacles(obstacles: readonly Obstacle[]): void {
    this.fences = obstacles.slice();
  }

  step(stimuli: readonly Stimulus[]): void {
    const { n, x, y, vx, vy, fear, dt } = this;
    // fear: direct from threats and startles, then a little contagion, then decay
    const prevFear = Float32Array.from(fear);
    for (let i = 0; i < n; i++) {
      let f = prevFear[i] * Math.exp(-dt / 4);
      for (const s of stimuli) {
        if (s.kind === 'lure') continue;
        const d = Math.hypot(s.x - x[i], s.y - y[i]);
        const reach = s.kind === 'startle' ? s.radius : s.radius * 0.6;
        f = Math.max(f, Math.min(1, s.strength * smooth(reach, reach * 0.3, d)));
      }
      fear[i] = f;
    }
    for (let i = 0; i < n; i++) {
      let near = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i && Math.hypot(x[j] - x[i], y[j] - y[i]) < 3) near = Math.max(near, prevFear[j] * 0.7);
      }
      fear[i] = Math.max(fear[i], near);
    }

    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, cx = 0, cy = 0, ax = 0, ay = 0, cn = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d = Math.hypot(dx, dy);
        if (d < 1.2 && d > 1e-6) { sx -= dx / d * (1.2 - d); sy -= dy / d * (1.2 - d); }
        if (d < 6) { cx += x[j]; cy += y[j]; ax += vx[j]; ay += vy[j]; cn++; }
      }
      let dx = sx * 3;
      let dy = sy * 3;
      if (cn > 0) {
        cx = cx / cn - x[i];
        cy = cy / cn - y[i];
        const k = 0.15 * (0.3 + fear[i]);
        dx += cx * k + (ax / cn) * 0.3;
        dy += cy * k + (ay / cn) * 0.3;
      }
      for (const s of stimuli) {
        const ox = x[i] - s.x;
        const oy = y[i] - s.y;
        const d = Math.hypot(ox, oy) || 1;
        if (s.kind === 'lure') {
          const pull = s.strength * smooth(s.radius, s.radius * 0.5, d) * (d > 2 ? 1.5 : 0);
          dx -= (ox / d) * pull;
          dy -= (oy / d) * pull;
        } else {
          const push = 4 * fear[i] * smooth(s.radius * 1.2, 0, d);
          dx += (ox / d) * push;
          dy += (oy / d) * push;
        }
      }
      this.wander[i] += (this.rand() - 0.5) * 0.6;
      dx += Math.cos(this.wander[i]) * 0.1;
      dy += Math.sin(this.wander[i]) * 0.1;
      // fences: steer away from anything closer than 1.5 m
      for (const o of this.fences) {
        const t = segmentT(x[i], y[i], o.ax, o.ay, o.bx, o.by);
        const px = x[i] - (o.ax + (o.bx - o.ax) * t);
        const py = y[i] - (o.ay + (o.by - o.ay) * t);
        const d = Math.hypot(px, py);
        if (d < 1.5 && d > 1e-6) { dx += (px / d) * (1.5 - d) * 2; dy += (py / d) * (1.5 - d) * 2; }
      }
      const max = 0.4 + 3.6 * fear[i];
      const l = Math.hypot(dx, dy);
      const tx = l > max ? (dx / l) * max : dx;
      const ty = l > max ? (dy / l) * max : dy;
      const k = 1 - Math.exp(-dt / 0.3);
      vx[i] += (tx - vx[i]) * k;
      vy[i] += (ty - vy[i]) * k;
    }

    for (let i = 0; i < n; i++) {
      const ox = x[i];
      const oy = y[i];
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      for (const o of this.fences) this.keepSide(i, o, ox, oy);
      x[i] = Math.min(this.w - 0.5, Math.max(0.5, x[i]));
      y[i] = Math.min(this.h - 0.5, Math.max(0.5, y[i]));
      const sp = Math.hypot(vx[i], vy[i]);
      this.speed[i] = sp;
      if (sp > 0.05) this.heading[i] = Math.atan2(vy[i], vx[i]);
      this.state[i] = fear[i] > 0.45 ? SheepState.Run : sp > 0.5 ? SheepState.Walk : fear[i] > 0.15 ? SheepState.Alert : SheepState.Graze;
    }
    this.groups();
    this.time += dt;
  }

  /** push sheep i out of fence o, back to the side it started the step on */
  private keepSide(i: number, o: Obstacle, ox: number, oy: number): void {
    const R = o.radius + 0.45;
    const t = segmentT(this.x[i], this.y[i], o.ax, o.ay, o.bx, o.by);
    const cx = o.ax + (o.bx - o.ax) * t;
    const cy = o.ay + (o.by - o.ay) * t;
    let nx = this.x[i] - cx;
    let ny = this.y[i] - cy;
    const d = Math.hypot(nx, ny);
    if (d >= R) return;
    const ex = o.bx - o.ax;
    const ey = o.by - o.ay;
    const before = ex * (oy - o.ay) - ey * (ox - o.ax);
    const after = ex * (this.y[i] - o.ay) - ey * (this.x[i] - o.ax);
    if (t > 0 && t < 1 && (d < 1e-6 || (before > 0) !== (after > 0))) {
      const l = Math.hypot(ex, ey);
      const s = before >= 0 ? 1 : -1;
      nx = (-ey / l) * s;
      ny = (ex / l) * s;
    } else if (d < 1e-6) {
      return;
    } else {
      nx /= d;
      ny /= d;
    }
    this.x[i] = cx + nx * R;
    this.y[i] = cy + ny * R;
  }

  private groups(): void {
    const n = this.n;
    const g = this.group;
    for (let i = 0; i < n; i++) g[i] = i;
    const find = (a: number): number => { while (g[a] !== a) a = g[a] = g[g[a]]; return a; };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.hypot(this.x[i] - this.x[j], this.y[i] - this.y[j]) < 6) {
          const a = find(i);
          const b = find(j);
          if (a !== b) g[Math.max(a, b)] = Math.min(a, b);
        }
      }
    }
    for (let i = 0; i < n; i++) g[i] = find(i);
  }

  hash(): number {
    return hashOutputs(this.out);
  }
}

function smooth(e0: number, e1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
