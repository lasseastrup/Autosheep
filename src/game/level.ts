import * as THREE from 'three';
import type { Obstacle } from '../sim/contract';
import { C } from '../engine/palette';
import { toon, glow, noOutline } from '../engine/toon';
import { mesh } from '../art/geo';
import { Rng } from '../engine/rng';
import { terrain, groundMaterial, meadowDressing, rollingHills, tree, bush, rock, farmhouse, barn, pickupTruck } from '../art/props';

/**
 * M1 level, "The First Pen": a walled meadow, a flock at the west end and a pen with a gate
 * at the east end. Sim coordinates (x, y) map to world (x, 0, y).
 */
export const WORLD = { width: 120, height: 90 };

export const PEN = { x0: 90, y0: 39.5, x1: 101, y1: 51.5 };
const GATE_Y0 = 44;
const GATE_Y1 = 47;
export const GATE: Obstacle = { ax: PEN.x0, ay: GATE_Y0, bx: PEN.x0, by: GATE_Y1, radius: 0.1, solid: false };
export const FLOCK_AT = { x: 32, y: 47 };
export const GAFOOP_AT = { x: 22, y: 47 };

const HURDLE = 0.1;
const seg = (ax: number, ay: number, bx: number, by: number, radius = HURDLE, solid = false): Obstacle => ({ ax, ay, bx, by, radius, solid });
/** a round thing (tree trunk, rock) as a zero-length capsule */
const post = (x: number, y: number, r: number): Obstacle => ({ ax: x, ay: y, bx: x, by: y, radius: r, solid: false });

export interface LevelObstacles {
  fences: Obstacle[];
  walls: Obstacle[];
  trees: { x: number; y: number; s: number; kind: 'round' | 'pine' }[];
  rocks: { x: number; y: number; s: number }[];
}

export function levelObstacles(): LevelObstacles {
  const { x0, y0, x1, y1 } = PEN;
  const fences = [
    seg(x0, y0, x1, y0),
    seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1),
    seg(x0, y1, x0, GATE_Y1),
    seg(x0, GATE_Y0, x0, y0),
    // wings funnel the flock to the gate
    seg(x0, GATE_Y0, x0 - 6, GATE_Y0 - 7),
    seg(x0, GATE_Y1, x0 - 6, GATE_Y1 + 7),
  ];
  // a ruined drystone wall in the north meadow (solid: sheep cannot see through it)
  const walls = [seg(48, 16, 63, 19, 0.3, true), seg(63, 19, 66, 25, 0.3, true)];
  const trees = [
    { x: 56, y: 60, s: 1.1, kind: 'round' as const },
    { x: 70, y: 31, s: 1.0, kind: 'round' as const },
    { x: 45, y: 74, s: 1.2, kind: 'pine' as const },
    { x: 78, y: 66, s: 0.9, kind: 'round' as const },
    { x: 14, y: 22, s: 1.0, kind: 'pine' as const },
    { x: 108, y: 20, s: 1.1, kind: 'round' as const },
  ];
  const rocks = [
    { x: 40, y: 30, s: 1.4 },
    { x: 66, y: 50, s: 1.0 },
    { x: 84, y: 74, s: 1.6 },
    { x: 24, y: 70, s: 1.1 },
  ];
  return { fences, walls, trees, rocks };
}

export function allObstacles(l: LevelObstacles, gateClosed: boolean): Obstacle[] {
  const out = [...l.fences, ...l.walls];
  for (const t of l.trees) out.push(post(t.x, t.y, 0.35 * t.s));
  for (const r of l.rocks) out.push(post(r.x, r.y, 0.45 * r.s));
  out.push(post(17, 12, 1.4)); // the abandoned pickup
  if (gateClosed) out.push(GATE);
  return out;
}

const hills = rollingHills(13, 1.6);

/** Height of the world: a flat meadow inside the walls, rolling hills outside. */
export function heightAt(x: number, z: number): number {
  const dx = Math.max(0, -x, x - WORLD.width);
  const dz = Math.max(0, -z, z - WORLD.height);
  const out = Math.hypot(dx, dz);
  const k = Math.min(1, Math.max(0, (out - 3) / 18));
  return hills(x, z) * k * k + k * 1.5;
}

/** Wooden post-and-rail fencing for a list of segments, as two instanced meshes. */
export function fenceMeshes(segs: Obstacle[], color: string = C.tan): THREE.Group {
  const g = new THREE.Group();
  const posts: THREE.Matrix4[] = [];
  const rails: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  for (const s of segs) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      posts.push(new THREE.Matrix4().makeTranslation(s.ax + (s.bx - s.ax) * t, 0.45, s.ay + (s.by - s.ay) * t));
    }
    q.setFromEuler(new THREE.Euler(0, -Math.atan2(s.by - s.ay, s.bx - s.ax), 0));
    for (const y of [0.38, 0.72]) {
      rails.push(new THREE.Matrix4().compose(new THREE.Vector3((s.ax + s.bx) / 2, y, (s.ay + s.by) / 2), q, new THREE.Vector3(len, 1, 1)));
    }
  }
  const wood = toon(color);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), wood, posts.length);
  posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.09, 0.06), toon(C.khaki), rails.length);
  rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
  g.add(postMesh, railMesh);
  return g;
}

/** Drystone walling along segments, as one instanced mesh of jittered stones. */
export function wallMeshes(segs: Obstacle[], seed = 3, rows = 2): THREE.InstancedMesh {
  const r = new Rng(seed);
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const palette = [C.fog, C.lilac, C.mist, C.fog].map((c) => new THREE.Color(c));
  for (const s of segs) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const ang = -Math.atan2(s.by - s.ay, s.bx - s.ax);
    for (let d = 0.2; d < len; d += 0.44) {
      const t = d / len;
      for (let row = 0; row < rows; row++) {
        // ruined walls lose their top course here and there
        if (row === rows - 1 && r.next() < 0.18) continue;
        const p = new THREE.Vector3(s.ax + (s.bx - s.ax) * t, 0.13 + row * 0.25, s.ay + (s.by - s.ay) * t);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang + r.range(-0.15, 0.15), r.range(-0.08, 0.08)));
        mats.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(r.range(0.9, 1.1), 1, r.range(0.9, 1.15))));
        cols.push(r.pick(palette));
      }
    }
  }
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.25, 0.4), toon(0xffffff, { flat: true }), mats.length);
  mats.forEach((x, i) => {
    m.setMatrixAt(i, x);
    m.setColorAt(i, cols[i]);
  });
  return m;
}

/** A swinging hurdle gate hinged on its first post. */
export class GateMesh {
  readonly root = new THREE.Group();
  private readonly leaf = new THREE.Group();
  open = 0;
  shown = 0;

  constructor(g: Obstacle) {
    const len = Math.hypot(g.bx - g.ax, g.by - g.ay);
    this.root.position.set(g.ax, 0, g.ay);
    this.root.rotation.y = -Math.atan2(g.by - g.ay, g.bx - g.ax);
    const wood = toon(C.straw);
    for (const y of [0.3, 0.55, 0.8]) this.leaf.add(mesh(new THREE.BoxGeometry(len - 0.2, 0.08, 0.06), wood, [len / 2, y, 0]));
    for (const x of [0.1, len / 2, len - 0.1]) this.leaf.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.07), wood, [x, 0.55, 0]));
    const brace = mesh(new THREE.BoxGeometry(len * 0.95, 0.06, 0.05), wood, [len / 2, 0.55, 0.02]);
    brace.rotation.z = Math.atan2(0.5, len);
    this.leaf.add(brace);
    this.root.add(this.leaf);
    // gateposts, a little taller than the fence
    const postMat = toon(C.rust);
    this.root.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), postMat, [0, 0.55, 0]));
    this.root.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), postMat, [len, 0.55, 0]));
  }

  update(dt: number): void {
    this.shown += (this.open - this.shown) * (1 - Math.exp(-dt * 8));
    // swings outward, away from the pen
    this.leaf.rotation.y = this.shown * 1.6;
  }
}

/** Everything that is only scenery: terrain, grass, trees, ruins, the farm beyond the wall. */
export function buildScenery(l: LevelObstacles): { group: THREE.Group; blinkers: THREE.Mesh[] } {
  const g = new THREE.Group();
  const blinkers: THREE.Mesh[] = [];
  const ground = terrain(320, 160, heightAt, {
    material: groundMaterial({ path: [3, 0.05, 46], pathColor: C.khaki, pathEdge: C.moss }),
  });
  // terrain() is centred on the origin; the meadow spans 0..120 x 0..90
  ground.geometry.translate(WORLD.width / 2, 0, WORLD.height / 2);
  // re-sample heights after the move
  const pos = ground.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  ground.geometry.computeVertexNormals();
  g.add(ground);

  const dress = meadowDressing(150, 9000, () => 0, 17, (x, z) => {
    const wx = x + WORLD.width / 2;
    const wz = z + WORLD.height / 2;
    return wx < 1 || wx > WORLD.width - 1 || wz < 1 || wz > WORLD.height - 1;
  });
  dress.position.set(WORLD.width / 2, 0, WORLD.height / 2);
  g.add(dress);

  // the meadow's boundary wall
  const W = WORLD.width;
  const H = WORLD.height;
  g.add(wallMeshes([seg(0, 0, W, 0), seg(W, 0, W, H), seg(W, H, 0, H), seg(0, H, 0, 0)], 5, 3));
  g.add(wallMeshes(l.walls, 9, 3));
  g.add(fenceMeshes(l.fences));

  for (const [i, t] of l.trees.entries()) {
    const tr = tree(40 + i, t.s, t.kind);
    tr.position.set(t.x, 0, t.y);
    g.add(tr);
  }
  for (const [i, r] of l.rocks.entries()) {
    const rk = rock(60 + i, r.s);
    rk.position.set(r.x, 0.1 * r.s, r.y);
    g.add(rk);
  }

  // outside the walls: woods and a farm the humans left behind
  const rng = new Rng(21);
  for (let i = 0; i < 140; i++) {
    const a = rng.range(0, Math.PI * 2);
    const x = W / 2 + Math.cos(a) * rng.range(70, 120);
    const z = H / 2 + Math.sin(a) * rng.range(55, 100);
    if (x > -4 && x < W + 4 && z > -4 && z < H + 4) continue;
    const t = rng.next() < 0.5 ? tree(100 + i, rng.range(0.9, 1.5), rng.next() < 0.4 ? 'pine' : 'round') : bush(100 + i, rng.range(1, 1.8));
    t.position.set(x, heightAt(x, z), z);
    g.add(t);
  }
  const fh = farmhouse();
  fh.position.set(34, heightAt(34, -14), -14);
  fh.rotation.y = 0.1;
  const bn = barn();
  bn.position.set(58, heightAt(58, -16), -16);
  g.add(fh, bn);

  // an abandoned pickup in the meadow, hazard lights still going
  const truck = pickupTruck(C.sky);
  truck.position.set(17, 0, 12);
  truck.rotation.set(0, 0.7, 0.04);
  g.add(truck);
  for (const sx of [-0.55, 0.55]) {
    const l = noOutline(mesh(new THREE.SphereGeometry(0.09, 6, 4), glow(C.orange, 2.5), [sx, 0.75, -1.9]));
    truck.add(l);
    blinkers.push(l);
  }
  // and a lone traffic light at a crossroads that no longer goes anywhere
  const tl = new THREE.Group();
  tl.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), toon(C.coal), [0, 1.6, 0]));
  tl.add(mesh(new THREE.BoxGeometry(0.4, 1.0, 0.3), toon(C.ink), [0, 3.2, 0]));
  const amber = noOutline(mesh(new THREE.SphereGeometry(0.11, 6, 4), glow(C.amber, 3), [0, 3.2, 0.16]));
  tl.add(amber, mesh(new THREE.SphereGeometry(0.1, 6, 4), toon(C.wine), [0, 3.5, 0.15]), mesh(new THREE.SphereGeometry(0.1, 6, 4), toon(C.pine), [0, 2.9, 0.15]));
  blinkers.push(amber);
  tl.position.set(W + 6, heightAt(W + 6, 70), 70);
  tl.rotation.y = -0.6;
  g.add(tl);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  ground.castShadow = false;
  return { group: g, blinkers };
}
