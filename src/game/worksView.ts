import * as THREE from 'three';
import { mesh } from '../art/geo';
import { C } from '../engine/palette';
import { bakeRigid } from '../engine/bake';
import { castShadows, noOutline, toon } from '../engine/toon';
import { DIR, LANE_W, laneSides, STATION_LEN, stationFrame, type Device, type Pt, type Station } from '../works/devices';
import type { Works } from '../works/works';
import { WORKS } from '../works/works';

/** Sim (x, y) to world (x, 0, y). */
const V = (p: Pt, y = 0) => new THREE.Vector3(p.x, y, p.y);

interface StationParts {
  intake: THREE.Object3D;
  exit: THREE.Object3D;
  /** the spindle hut's wheel, or the shed's shears */
  spinner: THREE.Object3D | null;
  intakeShown: number;
  exitShown: number;
}

interface Built {
  root: THREE.Object3D;
  station?: StationParts;
  chimes?: THREE.Object3D[];
  rackSkeins?: THREE.Object3D[];
  /** a gate's swinging leaf, and how open it is drawn */
  leaf?: THREE.Object3D;
  leafShown?: number;
  /** a trough's feed, raised and lowered with how full it is */
  feed?: THREE.Object3D;
}

/**
 * Draws the works: a mesh per device, rebuilt when the device list changes, with the
 * stations' doors swinging to match their cycle, wheels turning while they work, chimes
 * swaying when they ring and racks filling up with yarn.
 */
export class WorksView {
  readonly root = new THREE.Group();
  private built = new Map<number, Built>();
  private version = -1;

  constructor(private readonly works: Works) {}

  update(dt: number, time: number): void {
    if (this.works.version !== this.version) this.sync();
    const k = 1 - Math.exp(-dt * 6);
    for (const s of this.works.stations) {
      const b = this.built.get(s.device.id)?.station;
      if (!b) continue;
      const intakeOpen = s.phase === 'fill' ? 1 : 0;
      const exitOpen = s.phase === 'release' ? 1 : 0;
      b.intakeShown += (intakeOpen - b.intakeShown) * k;
      b.exitShown += (exitOpen - b.exitShown) * k;
      // doors swing outward, a leaf to each side
      b.intake.children.forEach((leaf, i) => (leaf.rotation.y = (i ? -1 : 1) * b.intakeShown * 1.5));
      b.exit.children.forEach((leaf, i) => (leaf.rotation.y = (i ? 1 : -1) * b.exitShown * 1.5));
      if (b.spinner) b.spinner.rotation.z += dt * (s.phase === 'work' ? 6 : 0.4);
    }
    for (const d of this.works.devices) {
      const b = this.built.get(d.id);
      if (d.kind === 'chimes' && b?.chimes) {
        // they ring every few seconds and sway for a moment after
        const C_ = WORKS.chimes;
        const since = (time + d.id * 1.7) % C_.period;
        const sway = Math.exp(-since * 1.5) * Math.sin(since * 14);
        b.chimes.forEach((t, i) => (t.rotation.z = sway * (0.5 + 0.2 * i)));
      }
      if (d.kind === 'gate' && b?.leaf) {
        const open = this.works.gates.get(d.id)?.open ? 1 : 0;
        b.leafShown = (b.leafShown ?? 0) + (open - (b.leafShown ?? 0)) * k;
        b.leaf.rotation.y = b.leafShown * 1.55;
      }
      if (d.kind === 'trough' && b?.feed) {
        const f = this.works.feed.get(d.id) ?? 0;
        b.feed.visible = f > 0.01;
        b.feed.scale.y = Math.max(0.05, f);
      }
      if (d.kind === 'rack' && b?.rackSkeins) {
        const shown = Math.min(b.rackSkeins.length, this.works.yarn);
        b.rackSkeins.forEach((s, i) => (s.visible = i < shown));
      }
    }
  }

  /** Build meshes for new devices, drop the ones taken down. */
  private sync(): void {
    this.version = this.works.version;
    const live = new Set(this.works.devices.map((d) => d.id));
    for (const [id, b] of this.built) {
      if (!live.has(id)) {
        this.root.remove(b.root);
        b.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.built.delete(id);
      }
    }
    for (const d of this.works.devices) {
      if (this.built.has(d.id)) continue;
      const b = build(d);
      this.built.set(d.id, b);
      this.root.add(b.root);
    }
  }
}

const wattle = () => toon(C.tan);
const rail = () => toon(C.khaki);

function build(d: Device): Built {
  switch (d.kind) {
    case 'lane':
      return { root: baked(laneMesh(d.points)) };
    case 'hurdle':
      return { root: baked(hurdleRun(d.a, d.b)) };
    case 'flap':
      return { root: flapMesh(d.at, d.angle) };
    case 'shed':
    case 'spindle':
      return stationMesh(d);
    case 'rack':
      return rackMesh(d.at, d.angle);
    case 'chimes':
      return chimesMesh(d.at);
    case 'lick':
      return { root: lickMesh(d.at) };
    case 'gate':
      return gateMesh(d.a, d.b, d.mode);
    case 'trough':
      return troughMesh(d.at, d.angle);
  }
}

/**
 * A hurdle gate hinged on its first post: three bars and a brace on a swinging leaf, between
 * taller gateposts. Timed gates carry a little clock on the hinge post, grass gates a tuft.
 */
function gateMesh(a: Pt, b: Pt, mode: 'hand' | 'timer' | 'grass'): Built {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const root = new THREE.Group();
  root.position.set(a.x, 0, a.y);
  root.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
  const leaf = new THREE.Group();
  const wood = toon(C.straw);
  for (const y of [0.3, 0.55, 0.8]) leaf.add(mesh(new THREE.BoxGeometry(len - 0.2, 0.08, 0.06), wood, [len / 2, y, 0]));
  for (const x of [0.1, len / 2, len - 0.1]) leaf.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.07), wood, [x, 0.55, 0]));
  const brace = mesh(new THREE.BoxGeometry(len * 0.95, 0.06, 0.05), wood, [len / 2, 0.55, 0.02]);
  brace.rotation.z = Math.atan2(0.5, len);
  leaf.add(brace);
  root.add(leaf);
  const postMat = toon(C.rust);
  root.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), postMat, [0, 0.55, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), postMat, [len, 0.55, 0]));
  if (mode === 'timer') {
    root.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), toon(C.bone), [0, 1.12, 0], [Math.PI / 2, 0, 0]));
    root.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.08), toon(C.ink), [0, 1.16, 0]));
  } else if (mode === 'grass') {
    for (let k = 0; k < 3; k++) root.add(mesh(new THREE.ConeGeometry(0.04, 0.3, 3), toon(C.leaf), [0.05 * (k - 1), 1.25, 0.03 * k]));
  }
  castShadows(root);
  return { root, leaf, leafShown: 0 };
}

/** A wooden trough on legs, with a heap of oats that sinks as the sheep eat it. */
function troughMesh(at: Pt, angle: number): Built {
  const root = new THREE.Group();
  root.position.set(at.x, 0, at.y);
  root.rotation.y = -angle;
  const wood = toon(C.rust);
  root.add(mesh(new THREE.BoxGeometry(1.9, 0.12, 0.6), wood, [0, 0.32, 0]));
  root.add(mesh(new THREE.BoxGeometry(1.9, 0.3, 0.08), wood, [0, 0.45, 0.28]));
  root.add(mesh(new THREE.BoxGeometry(1.9, 0.3, 0.08), wood, [0, 0.45, -0.28]));
  for (const x of [-0.85, 0.85]) {
    root.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.6), wood, [x, 0.45, 0]));
    root.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), wood, [x, 0.13, 0.22]));
    root.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), wood, [x, 0.13, -0.22]));
  }
  const feed = new THREE.Group();
  feed.position.y = 0.38;
  feed.add(mesh(new THREE.BoxGeometry(1.7, 0.22, 0.46), toon(C.straw), [0, 0.11, 0]));
  root.add(feed);
  castShadows(root);
  return { root, feed };
}

/** Shadows on, and the parts merged into a draw call or two. */
function baked(g: THREE.Group): THREE.Group {
  castShadows(g);
  bakeRigid(g, []);
  return g;
}

/** Posts and two rails along a straight line, as a wattle hurdle. */
function hurdleRun(a: Pt, b: Pt, g = new THREE.Group()): THREE.Group {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.05) return g;
  const n = Math.max(1, Math.round(len / 1.4));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), wattle(), [a.x + (b.x - a.x) * t, 0.42, a.y + (b.y - a.y) * t]));
  }
  const ang = -Math.atan2(b.y - a.y, b.x - a.x);
  for (const y of [0.35, 0.68]) {
    const r = mesh(new THREE.BoxGeometry(len, 0.1, 0.05), rail(), [(a.x + b.x) / 2, y, (a.y + b.y) / 2]);
    r.rotation.y = ang;
    g.add(r);
  }
  return g;
}

/** A race: hurdles both sides, a bare earth floor, and chevrons showing which way it runs. */
function laneMesh(points: readonly Pt[]): THREE.Group {
  const g = new THREE.Group();
  const [l, r] = laneSides(points);
  for (let i = 0; i + 1 < points.length; i++) {
    hurdleRun(l[i], l[i + 1], g);
    hurdleRun(r[i], r[i + 1], g);
  }
  // the floor: worn bare, so hungry sheep have nothing to stop for
  const pos: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const quad = [l[i], r[i], r[i + 1], l[i], r[i + 1], l[i + 1]];
    for (const p of quad) pos.push(p.x, 0.03, p.y);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fg.computeVertexNormals();
  const fl = noOutline(new THREE.Mesh(fg, toon(C.khaki, { side: THREE.DoubleSide })));
  fl.receiveShadow = true;
  g.add(fl);
  // chevrons every few metres along the centre line
  const chev = new THREE.BufferGeometry();
  const cp: number[] = [];
  let carry = 2;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let s = carry; s < len - 0.5; s += 4) {
      const cx = a.x + ux * s;
      const cy = a.y + uy * s;
      // a flat arrowhead pointing along the race
      const tip = { x: cx + ux * 0.45, y: cy + uy * 0.45 };
      const lft = { x: cx - uy * 0.45, y: cy + ux * 0.45 };
      const rgt = { x: cx + uy * 0.45, y: cy - ux * 0.45 };
      for (const p of [tip, lft, rgt]) cp.push(p.x, 0.05, p.y);
      carry = s + 4 - len;
    }
    if (carry < 0) carry = 0;
  }
  if (cp.length) {
    chev.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    chev.computeVertexNormals();
    g.add(noOutline(new THREE.Mesh(chev, toon(C.tan, { side: THREE.DoubleSide }))));
  }
  return g;
}

/** A hinged hurdle panel across a race, leaning the way it lets sheep through. */
function flapMesh(at: Pt, angle: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(V(at));
  g.rotation.y = -angle;
  const leaf = new THREE.Group();
  leaf.add(mesh(new THREE.BoxGeometry(0.06, 0.55, LANE_W), wattle(), [0, -0.28, 0]));
  leaf.add(mesh(new THREE.BoxGeometry(0.07, 0.07, LANE_W + 0.1), rail(), [0, -0.05, 0]));
  leaf.position.y = 0.75;
  leaf.rotation.z = -0.35;
  g.add(leaf);
  // the hinge posts
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), wattle(), [0, 0.47, s * (LANE_W / 2 + 0.05)]));
  // a painted arrow on the floor
  const arrow = new THREE.Shape([new THREE.Vector2(0.9, 0), new THREE.Vector2(0.3, 0.45), new THREE.Vector2(0.3, 0.18), new THREE.Vector2(-0.4, 0.18), new THREE.Vector2(-0.4, -0.18), new THREE.Vector2(0.3, -0.18), new THREE.Vector2(0.3, -0.45)]);
  const am = noOutline(new THREE.Mesh(new THREE.ShapeGeometry(arrow), toon(C.straw, { side: THREE.DoubleSide })));
  am.rotation.x = -Math.PI / 2;
  am.position.set(0.9, 0.06, 0);
  g.add(am);
  castShadows(g);
  return g;
}

/** A station: walls along the chute, wicker doors at each end, and its hut alongside. */
function stationMesh(d: Station): Built {
  const g = new THREE.Group();
  const shed = d.kind === 'shed';
  const { side } = stationFrame(d);
  const f = DIR[d.dir];
  g.position.copy(V(d.at));
  g.rotation.y = -Math.atan2(f.y, f.x);
  const wall = toon(shed ? C.fog : C.tan);
  const cap = toon(shed ? C.lilac : C.rust);
  const h = LANE_W / 2;
  // in local space x runs along the chute (front = +x), z across it
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(STATION_LEN, 1.05, 0.3), wall, [0, 0.52, s * (h + 0.15)]));
    g.add(mesh(new THREE.BoxGeometry(STATION_LEN + 0.1, 0.12, 0.4), cap, [0, 1.1, s * (h + 0.15)]));
  }
  // the hut beside the chute, on the side away from the race's left
  const hutZ = -(h + 1.9);
  g.add(mesh(new THREE.BoxGeometry(3.2, 1.6, 3), toon(shed ? C.mist : C.straw), [0, 0.8, hutZ]));
  const roof = mesh(new THREE.CylinderGeometry(0.01, 2.4, 1.3, 4), toon(shed ? C.amber : C.gold), [0, 2.25, hutZ]);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  let spinner: THREE.Object3D | null = null;
  if (shed) {
    // a pair of shears on the roof, for anyone who cannot read
    const shears = new THREE.Group();
    shears.position.set(0, 3.05, hutZ);
    for (const s of [-1, 1]) {
      const blade = mesh(new THREE.BoxGeometry(0.12, 0.9, 0.08), toon(C.white), [0, 0.15, 0]);
      blade.rotation.z = s * 0.35;
      shears.add(blade);
    }
    g.add(shears);
  } else {
    // a big spinning wheel at the hut's end, turning while it works
    const wheel = new THREE.Group();
    wheel.position.set(1.95, 1.35, hutZ);
    wheel.rotation.y = Math.PI / 2;
    wheel.add(mesh(new THREE.TorusGeometry(0.9, 0.07, 4, 16), toon(C.rust)));
    for (let k = 0; k < 4; k++) {
      const spoke = mesh(new THREE.BoxGeometry(1.8, 0.06, 0.06), toon(C.tan));
      spoke.rotation.z = (k * Math.PI) / 4;
      wheel.add(spoke);
    }
    g.add(wheel);
    spinner = wheel;
  }
  // doors: two wicker leaves hinged at the walls, at each end
  const doors = (x: number): THREE.Group => {
    const door = new THREE.Group();
    door.position.x = x;
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.z = s * h;
      leaf.add(mesh(new THREE.BoxGeometry(0.08, 0.9, h), toon(C.khaki), [0, 0.5, -s * h / 2]));
      door.add(leaf);
    }
    return door;
  };
  const intake = doors(-STATION_LEN / 2);
  const exit = doors(STATION_LEN / 2);
  g.add(intake, exit);
  void side;
  castShadows(g);
  bakeRigid(g, [intake, exit, ...intake.children, ...exit.children, ...(spinner ? [spinner] : [])]);
  return { root: g, station: { intake, exit, spinner, intakeShown: 1, exitShown: 0 } };
}

/** An A-frame over the race, hung with the yarn delivered so far. */
function rackMesh(at: Pt, angle: number): Built {
  const g = new THREE.Group();
  g.position.copy(V(at));
  g.rotation.y = -angle;
  const h = LANE_W / 2 + 0.3;
  for (const s of [-1, 1]) {
    for (const lean of [-0.25, 0.25]) {
      const leg = mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), toon(C.tan), [lean * 0.9, 1.05, s * h]);
      leg.rotation.z = lean;
      g.add(leg);
    }
  }
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 2 * h + 0.3), toon(C.khaki), [0, 2.05, 0]));
  const skeins: THREE.Object3D[] = [];
  const colours = [C.violet, C.gold, C.scarlet, C.sky, C.leaf, C.pink];
  for (let k = 0; k < 6; k++) {
    const sk = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 8), toon(colours[k]), [0, 1.72, -h + 0.45 + k * ((2 * h - 0.9) / 5)]);
    sk.visible = false;
    skeins.push(sk);
    g.add(sk);
  }
  castShadows(g);
  bakeRigid(g, skeins);
  return { root: g, rackSkeins: skeins };
}

/** A post with a crossbar and three hanging tubes. */
function chimesMesh(at: Pt): Built {
  const g = new THREE.Group();
  g.position.copy(V(at));
  g.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), toon(C.tan), [0, 1.1, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), toon(C.khaki), [0.3, 2.15, 0]));
  const tubes: THREE.Object3D[] = [];
  for (let k = 0; k < 3; k++) {
    const t = new THREE.Group();
    t.position.set(0.02 + k * 0.28, 2.1, 0);
    t.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5 + k * 0.12, 6), toon(C.mist), [0, -0.3 - k * 0.06, 0]));
    tubes.push(t);
    g.add(t);
  }
  castShadows(g);
  bakeRigid(g, tubes);
  return { root: g, chimes: tubes };
}

/** A pink salt block on a stump. */
function lickMesh(at: Pt): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(V(at));
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.45, 8), toon(C.tan), [0, 0.22, 0]));
  const salt = mesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), toon(C.pink), [0, 0.6, 0]);
  salt.rotation.y = 0.4;
  g.add(salt);
  castShadows(g);
  bakeRigid(g, []);
  return g;
}
