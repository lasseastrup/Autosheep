import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blob } from '../art/geo';
import { Saucer } from '../art/ships';
import { C } from '../engine/palette';
import { noOutline, toon } from '../engine/toon';
import { SAUCER } from './config';
import { KIND, Phase } from './enemies';
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

/** Staples in flight, the shredder's blades, and the bells on collared sheep. */
export class GearView {
  readonly root = new THREE.Group();
  private readonly staples: THREE.InstancedMesh;
  private readonly blades: THREE.InstancedMesh;
  private readonly bells: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(stapleCap: number, sheepCap: number) {
    this.staples = noOutline(new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.07, 0.08), toon(C.white), stapleCap));
    this.blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.05, 0.2), toon(C.fog), 4);
    this.bells = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), toon(C.gold, { emissive: C.amber, emissiveIntensity: 0.3 }), sheepCap);
    for (const mesh of [this.staples, this.blades, this.bells]) {
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
  }
}
