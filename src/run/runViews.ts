import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blob, mesh } from '../art/geo';
import { Saucer } from '../art/ships';
import { bakeRigid } from '../engine/bake';
import { C } from '../engine/palette';
import { castShadows, noOutline, toon } from '../engine/toon';
import { RUN, SAUCER } from './config';
import { STATS as ITEM_STATS } from './items';
import { KIND, Phase } from './enemies';
import { BOOTH_HALF, BOOTH_SIDE, type BoothSite } from './field';
import { STATS } from './items';
import { Pickup, Sheep, type Run } from './run';

const UP = new THREE.Vector3(0, 1, 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A dashed ring lying on the grass, drawn without outlines (as Gafoop's shock wave is). */
function dashedRing(color: string, radius: number, width = 0.14, dashes = 28): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const step = (Math.PI * 2) / dashes;
  for (let k = 0; k < dashes; k++) parts.push(new THREE.RingGeometry(radius - width, radius, 3, 1, k * step, step * 0.55));
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.95, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  return noOutline(m);
}

/**
 * The Gloops (and the big one): purple goo with googly eyes, bobbing as they waddle, white for
 * a moment when hit. One instanced mesh per part, so a field of them is a few draw calls.
 */
export class GloopView {
  readonly root = new THREE.Group();
  private readonly body: THREE.InstancedMesh;
  private readonly whites: THREE.InstancedMesh;
  private readonly pupils: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly facing: Float32Array;

  constructor(cap: number) {
    const geo = blob(0.42, 1, 0.12, 7);
    geo.scale(1, 0.82, 1);
    geo.translate(0, 0.33, 0);
    this.body = new THREE.InstancedMesh(geo, toon(0xffffff), cap);
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.whites = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), toon(C.white), cap * 2);
    this.pupils = noOutline(new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 4), toon(C.black), cap * 2));
    for (const mesh of [this.body, this.whites, this.pupils]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh === this.body;
      this.root.add(mesh);
    }
    this.facing = new Float32Array(cap);
  }

  update(run: Run, alpha: number, time: number, dt: number): void {
    const e = run.enemies;
    const o = run.model.out;
    let n = 0;
    let eyes = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.kind[i] === KIND.saucer) continue;
      const big = e.kind[i] === KIND.bigGloop;
      const x = lerp(e.px[i], e.x[i], alpha);
      const z = lerp(e.py[i], e.y[i], alpha);
      const attached = e.phase[i] === Phase.Attached && e.carry[i] >= 0;
      // face where it is going; one hanging on to a sheep faces it
      const want = attached ? Math.atan2(o.x[e.carry[i]] - x, o.y[e.carry[i]] - z) : Math.atan2(e.vx[i] + e.kx[i], e.vy[i] + e.ky[i]);
      let d = want - this.facing[i];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing[i] += d * (1 - Math.exp(-dt * 10));
      const k = big ? 2.1 : 1;
      const bob = Math.sin(time * (attached ? 14 : 9) + e.uid[i] * 1.7);
      const lifted = attached ? run.lift[e.carry[i]] * 0.5 : 0;
      this.q.setFromAxisAngle(UP, this.facing[i]);
      this.p.set(x, lifted, z);
      this.s.set(k * (1 - bob * 0.06), k * (1 + bob * 0.1), k * (1 - bob * 0.06));
      this.m.compose(this.p, this.q, this.s);
      this.body.setMatrixAt(n, this.m);
      this.c.set(e.flash[i] > 0 ? C.white : big ? C.magenta : C.violet);
      this.body.setColorAt(n, this.c);
      n++;
      // googly eyes, a little wobbly
      const fx = Math.sin(this.facing[i]);
      const fz = Math.cos(this.facing[i]);
      for (const side of [-1, 1]) {
        const ex = x + (fx * 0.3 + fz * side * 0.14) * k;
        const ez = z + (fz * 0.3 - fx * side * 0.14) * k;
        const ey = lifted + (0.52 + bob * 0.04) * k;
        this.m.makeScale(k, k, k).setPosition(ex, ey, ez);
        this.whites.setMatrixAt(eyes, this.m);
        const w = Math.sin(time * 7 + e.uid[i] + side) * 0.03;
        this.m.makeScale(k, k, k).setPosition(ex + (fx * 0.07 + w) * k, ey + w * k, ez + (fz * 0.07 - w) * k);
        this.pupils.setMatrixAt(eyes, this.m);
        eyes++;
      }
    }
    this.body.count = n;
    this.whites.count = eyes;
    this.pupils.count = eyes;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.whites.instanceMatrix.needsUpdate = true;
    this.pupils.instanceMatrix.needsUpdate = true;
  }
}

/** Saucers: the intro's, a few at a time, with their beams, their warning rings and shadows. */
export class SaucerView {
  readonly root = new THREE.Group();
  private readonly pool: { saucer: Saucer; ring: THREE.Mesh; shadow: THREE.Mesh }[] = [];

  constructor(n = 4) {
    for (let k = 0; k < n; k++) {
      const saucer = new Saucer(k + 3, C.mist);
      saucer.root.scale.setScalar(1.25);
      saucer.root.visible = false;
      saucer.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) o.castShadow = true;
      });
      const ring = dashedRing(C.scarlet, SAUCER.reach);
      const shadow = noOutline(new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.black), transparent: true, opacity: 0.35, depthWrite: false })));
      shadow.rotation.x = -Math.PI / 2;
      shadow.visible = false;
      this.root.add(saucer.root, ring, shadow);
      this.pool.push({ saucer, ring, shadow });
    }
  }

  update(run: Run, alpha: number, time: number): void {
    const e = run.enemies;
    let k = 0;
    for (let i = 0; i < e.high && k < this.pool.length; i++) {
      if (!e.alive[i] || e.kind[i] !== KIND.saucer) continue;
      const v = this.pool[k++];
      const x = lerp(e.px[i], e.x[i], alpha);
      const z = lerp(e.py[i], e.y[i], alpha);
      const h = e.z[i] + Math.sin(time * 1.7 + i) * 0.15;
      v.saucer.root.visible = true;
      v.saucer.root.position.set(x, h, z);
      v.saucer.update(time);
      const phase = e.phase[i];
      // the beam: a flicker while it marks, full while it lifts
      const beam = phase === Phase.Beam ? 1 : phase === Phase.Telegraph ? 0.25 + 0.15 * Math.sin(time * 20) : 0;
      v.saucer.setBeam(beam, (h - 0.05) / 1.25);
      v.shadow.visible = true;
      v.shadow.position.set(x, 0.03, z);
      v.ring.visible = phase === Phase.Telegraph;
      if (v.ring.visible) {
        // the ring tightens as the moment comes
        const left = Math.max(0, 1 - e.t[i] / SAUCER.telegraph);
        v.ring.position.set(x, 0.05, z);
        v.ring.scale.setScalar(0.8 + left * 0.6);
        (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.abs(Math.sin(time * 8));
      }
      if (e.flash[i] > 0) v.saucer.hull.position.y = 0.05;
      else v.saucer.hull.position.y = 0;
    }
    for (; k < this.pool.length; k++) {
      const v = this.pool[k];
      v.saucer.root.visible = false;
      v.ring.visible = false;
      v.shadow.visible = false;
    }
  }
}

/** Wool tufts, salvage and crates, bobbing until they fly to Gafoop. */
export class PickupView {
  readonly root = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(cap: number) {
    const wool = blob(0.17, 1, 0.12, 3);
    const tuft = blob(0.13, 1, 0.15, 4);
    const salvage = new THREE.OctahedronGeometry(0.15);
    const crate = new THREE.BoxGeometry(0.55, 0.4, 0.4);
    this.meshes = [
      new THREE.InstancedMesh(wool, toon(C.white), cap),
      new THREE.InstancedMesh(salvage, toon(C.mint, { emissive: C.jade, emissiveIntensity: 0.4 }), cap),
      new THREE.InstancedMesh(tuft, toon(C.mist), cap),
      new THREE.InstancedMesh(crate, toon(C.gold), 16),
    ];
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.root.add(mesh);
    }
  }

  update(run: Run, alpha: number, time: number): void {
    const p = run.pickups;
    const counts = [0, 0, 0, 0];
    for (let k = 0; k < p.high; k++) {
      if (!p.alive[k]) continue;
      const kind = p.kind[k];
      const mesh = this.meshes[kind];
      const c = counts[kind];
      if (c >= mesh.instanceMatrix.count) continue;
      const big = kind === Pickup.Salvage ? Math.min(2.2, 0.8 + Math.sqrt(p.value[k]) * 0.6) : 1;
      // tufts about to blow away blink
      if (kind === Pickup.Tuft && p.life[k] < 2 && Math.floor(time * 8) % 2 === 0) continue;
      this.p.set(lerp(p.px[k], p.x[k], alpha), 0.3 + Math.sin(time * 4 + k) * 0.08 + (p.home[k] ? 0.4 : 0), lerp(p.py[k], p.y[k], alpha));
      this.q.setFromAxisAngle(UP, time * 2 + k);
      this.s.setScalar(big);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(c, this.m);
      counts[kind] = c + 1;
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
}

/** Staples in flight, the shredder's blades, the bells on collared sheep and the rams' horns. */
export class GearView {
  readonly root = new THREE.Group();
  private readonly staples: THREE.InstancedMesh;
  private readonly blades: THREE.InstancedMesh;
  private readonly bells: THREE.InstancedMesh;
  private readonly horns: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(stapleCap: number, sheepCap: number) {
    this.staples = noOutline(new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.07, 0.08), toon(C.white), stapleCap));
    this.blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.05, 0.2), toon(C.fog), 4);
    this.bells = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), toon(C.gold, { emissive: C.amber, emissiveIntensity: 0.3 }), sheepCap);
    // a curled horn: most of a ring, stood on edge
    this.horns = new THREE.InstancedMesh(new THREE.TorusGeometry(0.14, 0.06, 4, 8, Math.PI * 1.5), toon(C.clay), sheepCap * 2);
    for (const mesh of [this.staples, this.blades, this.bells, this.horns]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
  }

  update(run: Run, alpha: number, flockPos: (i: number) => THREE.Vector3): void {
    const s = run.staples;
    let n = 0;
    for (let k = 0; k < s.high; k++) {
      if (!s.alive[k]) continue;
      this.p.set(lerp(s.px[k], s.x[k], alpha), 0.9, lerp(s.py[k], s.y[k], alpha));
      this.q.setFromAxisAngle(UP, -Math.atan2(s.vy[k], s.vx[k]));
      this.m.compose(this.p, this.q, this.one);
      this.staples.setMatrixAt(n++, this.m);
    }
    this.staples.count = n;
    this.staples.instanceMatrix.needsUpdate = true;

    const g = run.gafoop;
    const sh = run.lvl('shredder');
    n = 0;
    if (sh && g.ko <= 0) {
      const S = STATS.shredder(sh);
      const t = run.time - run.dt * (1 - alpha);
      const gx = lerp(g.px, g.x, alpha);
      const gz = lerp(g.py, g.y, alpha);
      for (let b = 0; b < S.blades; b++) {
        const a = t * S.spin + (b / S.blades) * Math.PI * 2;
        this.p.set(gx + Math.cos(a) * S.radius, 0.8, gz + Math.sin(a) * S.radius);
        this.q.setFromAxisAngle(UP, -a + t * 9);
        this.m.compose(this.p, this.q, this.one);
        this.blades.setMatrixAt(n++, this.m);
      }
    }
    this.blades.count = n;
    this.blades.instanceMatrix.needsUpdate = true;

    n = 0;
    const o = run.model.out;
    for (let j = 0; j < run.n; j++) {
      if (!run.collar[j] || run.status[j] !== Sheep.Flock) continue;
      const at = flockPos(j);
      const h = o.heading[j];
      this.p.set(at.x + Math.cos(h) * 0.42, 0.5 + run.lift[j], at.z + Math.sin(h) * 0.42);
      this.m.makeTranslation(this.p.x, this.p.y, this.p.z);
      this.bells.setMatrixAt(n++, this.m);
    }
    this.bells.count = n;
    this.bells.instanceMatrix.needsUpdate = true;

    n = 0;
    for (let j = 0; j < run.n; j++) {
      if (!run.horns[j] || run.status[j] !== Sheep.Flock) continue;
      const at = flockPos(j);
      const h = o.heading[j];
      const fx = Math.cos(h);
      const fz = Math.sin(h);
      for (const side of [-1, 1]) {
        this.p.set(at.x + fx * 0.36 - fz * side * 0.2, 0.9 + run.lift[j], at.z + fz * 0.36 + fx * side * 0.2);
        this.q.setFromAxisAngle(UP, -h + Math.PI / 2);
        this.m.compose(this.p, this.q, this.one);
        this.horns.setMatrixAt(n++, this.m);
      }
    }
    this.horns.count = n;
    this.horns.instanceMatrix.needsUpdate = true;
  }
}

/**
 * The Bureau's shearing booths: a raised board under a red canopy with a pair of shears on top,
 * a ramp up from the mouth and one down at the side, and a clipper hanging from the canopy that
 * works round the sheep on the board. (The mouth's ring is the HUD's: on the grass it would be
 * lost in the grass.)
 */
export class BoothView {
  readonly root = new THREE.Group();
  private readonly booths: { clipper: THREE.Object3D; cable: THREE.Mesh; at: THREE.Vector3 }[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly hook = new THREE.Vector3(0, 2.62, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(sites: readonly BoothSite[]) {
    const h = RUN.booths.board;
    const half = BOOTH_HALF;
    const plank = toon(C.khaki);
    const trim = toon(C.clay);
    const post = toon(C.rust);
    const roof = toon(C.red);
    for (const s of sites) {
      // local +x runs toward the mouth, +z toward the side ramp
      const g = new THREE.Group();
      const yaw = -Math.atan2(s.fy, s.fx);
      g.position.set(s.x, 0, s.y);
      g.rotation.y = yaw;
      g.add(mesh(new THREE.BoxGeometry(half * 2, h - 0.08, half * 2), plank, [0, (h - 0.08) / 2, 0]));
      g.add(mesh(new THREE.BoxGeometry(half * 2 + 0.12, 0.08, half * 2 + 0.12), trim, [0, h - 0.04, 0]));
      // the ramps, down from the board's edge to the grass
      const run = BOOTH_SIDE - half;
      const slope = Math.atan2(h, run);
      const len = Math.hypot(h, run);
      g.add(mesh(new THREE.BoxGeometry(len, 0.07, 1.0), trim, [half + run / 2, h / 2, 0], [0, 0, -slope]));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.07, len), trim, [0, h / 2, half + run / 2], [slope, 0, 0]));
      // a canopy on four posts, high enough to see the sheep under it
      for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), post, [x * (half - 0.08), h + 1.25, z * (half - 0.08)]));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 1.95, 0.6, 4), roof, [0, h + 2.75, 0], [0, Math.PI / 4, 0]));
      // a pair of shears on top, for anyone who cannot read, turned to the camera
      const sign = new THREE.Group();
      sign.position.set(0, h + 3.6, 0);
      sign.rotation.y = Math.PI / 4 - yaw;
      for (const side of [-1, 1]) {
        const blade = mesh(new THREE.BoxGeometry(0.14, 0.9, 0.08), toon(C.white), [side * 0.12, 0.1, 0]);
        blade.rotation.z = side * 0.35;
        sign.add(blade);
        const ring = mesh(new THREE.TorusGeometry(0.13, 0.05, 4, 8), toon(C.red), [side * 0.26, -0.45, 0]);
        sign.add(ring);
      }
      g.add(sign);
      // the clipper on its cable (both moved every frame)
      const clipper = new THREE.Group();
      clipper.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.18), toon(C.white)));
      clipper.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), toon(C.scarlet), [0.2, -0.02, 0]));
      const cable = noOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), toon(C.coal)));
      g.add(clipper, cable);
      castShadows(g);
      bakeRigid(g, [clipper, cable]);
      this.root.add(g);
      this.booths.push({ clipper, cable, at: new THREE.Vector3(0.75, h + 1.2, -0.75) });
    }
  }

  update(run: Run, time: number, dt: number): void {
    const h = RUN.booths.board;
    const k = 1 - Math.exp(-dt * 10);
    run.booths.forEach((b, i) => {
      const v = this.booths[i];
      const shearing = b.cur >= 0 && b.t >= b.hop;
      // round the sheep while it works, back to its hook between sheep
      if (shearing) this.tmp.set(Math.cos(time * 6) * 0.45, h + 0.75 + Math.sin(time * 13) * 0.08, Math.sin(time * 6) * 0.45);
      else this.tmp.set(0.75, h + 1.2, -0.75);
      v.at.lerp(this.tmp, k);
      v.clipper.position.copy(v.at);
      v.clipper.rotation.y = shearing ? -time * 6 : 0;
      // the cable from the canopy to the clipper
      const d = this.tmp.copy(v.at).sub(this.hook);
      const len = d.length();
      v.cable.position.copy(this.hook).addScaledVector(d, 0.5);
      v.cable.quaternion.setFromUnitVectors(this.up, d.multiplyScalar(-1 / (len || 1)));
      v.cable.scale.set(1, len, 1);
    });
  }
}

/** A folded paper dart, nose along +x. */
function dart(): THREE.BufferGeometry {
  const v = [
    // left wing, right wing, keel
    0.32, 0, 0, -0.2, 0, 0, -0.22, 0.02, 0.2,
    0.32, 0, 0, -0.22, 0.02, -0.2, -0.2, 0, 0,
    0.32, 0, 0, -0.2, -0.09, 0, -0.2, 0, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Paper planes in flight, banking as they turn. */
export class PlaneView {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly big = new THREE.Vector3(1.6, 1.6, 1.6);

  constructor(cap: number) {
    this.mesh = new THREE.InstancedMesh(dart(), toon(C.white, { side: THREE.DoubleSide }), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.root.add(this.mesh);
  }

  update(run: Run, alpha: number, time: number): void {
    const p = run.planes;
    let n = 0;
    for (let k = 0; k < p.high; k++) {
      if (!p.alive[k]) continue;
      this.p.set(lerp(p.px[k], p.x[k], alpha), 1.2 + Math.sin(time * 6 + k) * 0.08, lerp(p.py[k], p.y[k], alpha));
      this.e.set(Math.sin(time * 5 + k) * 0.3, -Math.atan2(p.vy[k], p.vx[k]), 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m.compose(this.p, this.q, this.big);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Filing cabinets falling from orbit, landing with a bump, then filed away. */
export class CabinetView {
  readonly root = new THREE.Group();
  private readonly pool: { cab: THREE.Group; shadow: THREE.Mesh }[] = [];

  constructor(cap: number) {
    const body = toon(C.sageLight);
    const dark = toon(C.swamp);
    const handle = toon(C.mist);
    for (let k = 0; k < cap; k++) {
      const cab = new THREE.Group();
      cab.add(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.62), body, [0, 0.6, 0]));
      for (let d = 0; d < 3; d++) {
        const y = 0.24 + d * 0.38;
        cab.add(mesh(new THREE.BoxGeometry(0.62, 0.03, 0.02), dark, [0, y + 0.17, 0.315]));
        cab.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), handle, [0, y, 0.33]));
      }
      castShadows(cab, true, false);
      bakeRigid(cab, []);
      cab.visible = false;
      const shadow = noOutline(new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.black), transparent: true, opacity: 0.35, depthWrite: false })));
      shadow.rotation.x = -Math.PI / 2;
      shadow.visible = false;
      this.root.add(cab, shadow);
      this.pool.push({ cab, shadow });
    }
  }

  update(run: Run): void {
    const c = run.cabinets;
    const fall = ITEM_STATS.cabinet(1).fall;
    this.pool.forEach((v, k) => {
      const on = k < c.cap && c.alive[k] === 1;
      v.cab.visible = on;
      v.shadow.visible = on;
      if (!on) return;
      const t = c.t[k];
      const k01 = Math.min(1, t / fall);
      const h = t < fall ? 14 * (1 - k01 * k01) : 0;
      // a bump on landing, and filed away at the end
      const squash = t >= fall && t < fall + 0.15 ? 0.85 : 1;
      const gone = Math.max(0, Math.min(1, (t - fall - 1.1) / 0.3));
      v.cab.position.set(c.x[k], h, c.y[k]);
      v.cab.rotation.y = k * 1.3;
      v.cab.scale.set(1 - gone, squash * (1 - gone), 1 - gone);
      v.shadow.position.set(c.x[k], 0.04, c.y[k]);
      v.shadow.scale.setScalar(0.4 + 0.6 * k01);
    });
  }
}

/** Inflatable sheep: pink, a little shiny, bobbing on their stick legs. */
export class DecoyView {
  readonly root = new THREE.Group();
  private readonly pool: THREE.Group[] = [];

  constructor(cap: number) {
    const skin = toon(C.pinkLight, { emissive: C.blush, emissiveIntensity: 0.15 });
    const leg = toon(C.blush);
    for (let k = 0; k < cap; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(blob(0.42, 1, 0.06, 11 + k), skin);
      body.scale.set(1.25, 0.95, 0.95);
      body.position.y = 0.62;
      g.add(body, mesh(new THREE.SphereGeometry(0.2, 8, 6), skin, [0.5, 0.82, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 5), leg, [-0.55, 0.72, 0], [0, 0, Math.PI / 2]));
      for (const [x, z] of [[0.28, 0.18], [0.28, -0.18], [-0.28, 0.18], [-0.28, -0.18]]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 5), leg, [x, 0.18, z]));
      castShadows(g, true, false);
      bakeRigid(g, []);
      g.visible = false;
      this.root.add(g);
      this.pool.push(g);
    }
  }

  update(run: Run, time: number): void {
    const d = run.decoys;
    this.pool.forEach((g, k) => {
      g.visible = k < d.cap && d.alive[k] === 1;
      if (!g.visible) return;
      // blown up when it comes, letting go of its air when it is nearly done
      const up = Math.min(1, d.age[k] / 0.4);
      const down = Math.min(1, d.life[k] / 1.2);
      const s = Math.max(0.05, up * down);
      g.position.set(d.x[k], Math.sin(time * 3 + k) * 0.05, d.y[k]);
      g.rotation.y = k * 2.1 + Math.sin(time * 1.3 + k) * 0.2;
      g.scale.set(s, s * (1 + Math.sin(time * 4 + k) * 0.03), s);
    });
  }
}

/** Salt licks: a pink block on a stake. */
export class LickView {
  readonly root = new THREE.Group();
  private readonly pool: THREE.Group[] = [];

  constructor(cap: number) {
    for (let k = 0; k < cap; k++) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), toon(C.tan), [0, 0.25, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), toon(C.peach), [0, 0.62, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), toon(C.skin), [0, 0.81, 0]));
      castShadows(g, true, false);
      bakeRigid(g, []);
      g.visible = false;
      this.root.add(g);
      this.pool.push(g);
    }
  }

  update(run: Run): void {
    const l = run.licks;
    this.pool.forEach((g, k) => {
      g.visible = k < l.cap && l.alive[k] === 1;
      if (!g.visible) return;
      const s = Math.min(1, l.age[k] / 0.25, l.life[k] / 0.6);
      g.position.set(l.x[k], 0, l.y[k]);
      g.scale.setScalar(Math.max(0.05, s));
    });
  }
}

/** Clockwork collies: brass dogs with a winding key, legs going when they run. */
export class CollieView {
  readonly root = new THREE.Group();
  private readonly pool: { dog: THREE.Group; legs: THREE.Object3D[]; key: THREE.Object3D; facing: number }[] = [];

  constructor(cap: number) {
    const brass = toon(C.gold, { emissive: C.amber, emissiveIntensity: 0.15 });
    const dark = toon(C.rust);
    const black = toon(C.black);
    for (let k = 0; k < cap; k++) {
      const dog = new THREE.Group();
      // nose along +x
      dog.add(mesh(new THREE.BoxGeometry(0.62, 0.26, 0.26), brass, [0, 0.42, 0]));
      dog.add(mesh(new THREE.BoxGeometry(0.26, 0.24, 0.24), brass, [0.38, 0.6, 0]));
      dog.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.14), dark, [0.56, 0.56, 0]));
      for (const z of [-0.08, 0.08]) {
        dog.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), dark, [0.34, 0.78, z]));
        dog.add(mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), black, [0.5, 0.65, z]));
      }
      const tail = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), brass, [-0.38, 0.55, 0], [0, 0, 0.7]);
      dog.add(tail);
      const legs: THREE.Object3D[] = [];
      for (const [x, z] of [[0.22, 0.09], [0.22, -0.09], [-0.22, 0.09], [-0.22, -0.09]]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.32, z);
        pivot.add(mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), dark, [0, -0.15, 0]));
        dog.add(pivot);
        legs.push(pivot);
      }
      // the winding key on its back
      const key = new THREE.Group();
      key.position.set(-0.05, 0.6, 0);
      key.add(mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), dark, [0, 0, 0]));
      key.add(mesh(new THREE.TorusGeometry(0.07, 0.025, 4, 8), brass, [0, 0.12, 0]));
      dog.add(key);
      castShadows(dog, true, false);
      bakeRigid(dog, [...legs, key]);
      dog.scale.setScalar(1.45);
      dog.visible = false;
      this.root.add(dog);
      this.pool.push({ dog, legs, key, facing: 0 });
    }
  }

  update(run: Run, alpha: number, time: number, dt: number): void {
    this.pool.forEach((v, k) => {
      const c = run.collies[k];
      v.dog.visible = !!c;
      if (!c) return;
      const x = lerp(c.px, c.x, alpha);
      const z = lerp(c.py, c.y, alpha);
      const speed = Math.hypot(c.vx, c.vy);
      if (speed > 0.3) {
        let d = -Math.atan2(c.vy, c.vx) - v.facing;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        v.facing += d * (1 - Math.exp(-dt * 12));
      }
      v.dog.position.set(x, Math.abs(Math.sin(time * 14)) * Math.min(0.1, speed * 0.015), z);
      v.dog.rotation.y = v.facing;
      const swing = Math.sin(time * 16) * Math.min(0.7, speed * 0.12);
      v.legs.forEach((l, i) => (l.rotation.z = i % 3 === 0 ? swing : -swing));
      v.key.rotation.x = time * 4;
    });
  }
}

/** Shearing drones: little Bureau saucers, beaming at the sheep they are shearing. */
export class DroneView {
  readonly root = new THREE.Group();
  private readonly pool: Saucer[] = [];

  constructor(cap: number) {
    for (let k = 0; k < cap; k++) {
      const d = new Saucer(k + 11, C.teal);
      d.root.scale.setScalar(0.32);
      d.root.visible = false;
      this.root.add(d.root);
      this.pool.push(d);
    }
  }

  update(run: Run, alpha: number, time: number): void {
    const o = run.model.out;
    this.pool.forEach((d, k) => {
      const dr = run.drones[k];
      d.root.visible = !!dr;
      if (!dr) return;
      const x = lerp(dr.px, dr.x, alpha);
      const z = lerp(dr.py, dr.y, alpha);
      const h = 2.4 + Math.sin(time * 2.3 + k) * 0.12;
      d.root.position.set(x, h, z);
      d.update(time);
      const on = dr.target >= 0 && Math.hypot(o.x[dr.target] - dr.x, o.y[dr.target] - dr.y) < 1.2;
      d.setBeam(on ? 0.7 + 0.3 * Math.sin(time * 18) : 0, (h - 0.6) / 0.32);
    });
  }
}

/** Portable hurdles: wattle fences on stakes, and electric ones that crackle. */
export class HurdleView {
  readonly root = new THREE.Group();
  private readonly pool: { g: THREE.Group; rails: THREE.Mesh[]; posts: THREE.Mesh[] }[] = [];
  private readonly plain = toon(C.khaki);
  private readonly live = toon(C.gold, { emissive: C.amber, emissiveIntensity: 0.6 });

  constructor(cap: number) {
    const post = toon(C.rust);
    for (let k = 0; k < cap; k++) {
      // along +x: rails a metre long, stretched to the hurdle, and posts spread along it
      const g = new THREE.Group();
      const rails: THREE.Mesh[] = [];
      const posts: THREE.Mesh[] = [];
      for (const y of [0.35, 0.65, 0.95]) {
        const r = mesh(new THREE.BoxGeometry(1, 0.08, 0.06), this.plain, [0, y, 0]);
        rails.push(r);
        g.add(r);
      }
      for (let q = 0; q < 5; q++) {
        const p = mesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), post, [0, 0.55, 0]);
        posts.push(p);
        g.add(p);
      }
      castShadows(g, true, false);
      g.visible = false;
      this.root.add(g);
      this.pool.push({ g, rails, posts });
    }
  }

  update(run: Run, time: number): void {
    const h = run.hurdles;
    const electric = ITEM_STATS.hurdle(Math.max(1, run.lvl('hurdle'))).shock > 0 && run.lvl('hurdle') > 0;
    this.pool.forEach((v, k) => {
      v.g.visible = k < h.cap && h.alive[k] === 1;
      if (!v.g.visible) return;
      const len = Math.hypot(h.bx[k] - h.ax[k], h.by[k] - h.ay[k]);
      // up out of the ground when put down, back into it at the end
      const up = Math.min(1, h.age[k] / 0.2, h.life[k] / 0.4);
      v.g.position.set((h.ax[k] + h.bx[k]) / 2, (up - 1) * 1.2, (h.ay[k] + h.by[k]) / 2);
      v.g.rotation.y = -Math.atan2(h.by[k] - h.ay[k], h.bx[k] - h.ax[k]);
      for (const r of v.rails) r.scale.x = len;
      v.posts.forEach((p, q) => (p.position.x = (q / (v.posts.length - 1) - 0.5) * len));
      const spark = electric && Math.floor(time * 12 + k) % 3 === 0;
      for (const r of v.rails) r.material = spark ? this.live : this.plain;
    });
  }
}
