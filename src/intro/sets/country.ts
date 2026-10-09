import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { Sheep } from '../../art/sheep';
import { Human, shoePair } from '../../art/human';
import { Saucer, Mothership, Pod } from '../../art/ships';
import { Gafoop } from '../../art/gafoop';
import { PuffSystem, SparkSystem, skyDome, setSky } from '../../art/fx';
import { terrain, groundMaterial, meadowDressing, rollingHills, tree, bush, rock, fence, stoneWall, farmhouse, barn, silo, cityBlock, hayBale, type HeightFn } from '../../art/props';
import { toon, setToonDefaults, toonUniforms } from '../../engine/toon';
import { C } from '../../engine/palette';
import { Rng, clamp, easeInCubic, easeInOut, easeOutBack, easeOutCubic, hash1, lerp, smooth } from '../../engine/rng';
import { mesh } from '../../art/geo';

interface FlockSheep {
  s: Sheep;
  home: THREE.Vector2;
  heading: number;
  seed: number;
}

/** A simple deterministic boids flock used for the sneeze stampede. */
class Scatter {
  pos: THREE.Vector2[] = [];
  vel: THREE.Vector2[] = [];
  t = 0;
  constructor(private start: THREE.Vector2[], private center: THREE.Vector2) {
    this.reset();
  }
  reset(): void {
    this.pos = this.start.map((p) => p.clone());
    this.vel = this.start.map(() => new THREE.Vector2());
    this.t = 0;
  }
  stepTo(t: number, panicAt: number): void {
    if (t < this.t) this.reset();
    const dt = 1 / 60;
    while (this.t + dt <= t) {
      this.t += dt;
      const panic = this.t > panicAt ? Math.exp(-(this.t - panicAt) * 0.45) : 0;
      for (let i = 0; i < this.pos.length; i++) {
        const p = this.pos[i], v = this.vel[i];
        const acc = new THREE.Vector2();
        // flee from the pod, stronger up close
        const away = p.clone().sub(this.center);
        const d = Math.max(0.5, away.length());
        acc.addScaledVector(away.normalize(), (panic * 26) / (0.6 + d * 0.25));
        // separation / alignment / cohesion with neighbours
        const coh = new THREE.Vector2(), ali = new THREE.Vector2();
        let n = 0;
        for (let j = 0; j < this.pos.length; j++) {
          if (j === i) continue;
          const dv = p.clone().sub(this.pos[j]);
          const dd = dv.length();
          if (dd < 1.1 && dd > 1e-4) acc.addScaledVector(dv.normalize(), (1.1 - dd) * 14);
          if (dd < 4) {
            coh.add(this.pos[j]);
            ali.add(this.vel[j]);
            n++;
          }
        }
        if (n) {
          acc.addScaledVector(coh.divideScalar(n).sub(p), 0.6 * panic);
          acc.addScaledVector(ali.divideScalar(n).sub(v), 1.2 * panic);
        }
        // a little individual wobble so they don't move like a rigid ring
        acc.x += (hash1(i, Math.floor(this.t * 3)) - 0.5) * 4 * panic;
        acc.y += (hash1(i + 99, Math.floor(this.t * 3)) - 0.5) * 4 * panic;
        v.addScaledVector(acc, dt);
        v.multiplyScalar(1 - dt * (panic > 0.05 ? 0.9 : 3.5));
        const sp = v.length();
        const max = 6.5;
        if (sp > max) v.multiplyScalar(max / sp);
        p.addScaledVector(v, dt);
      }
    }
  }
}

export class CountrySet implements StageSet {
  scene = new THREE.Scene();
  persp = new THREE.PerspectiveCamera(36, 480 / 270, 0.1, 600);
  ortho = new THREE.OrthographicCamera(-12, 12, 6.75, -6.75, -100, 1500);
  camera: THREE.Camera = this.persp;
  post = { depthAbs: 0.15, depthRel: 0.01, outline: 0.62, highlight: 0.3, bloom: 1.0, bloomThreshold: 1.3 };
  readonly height: HeightFn;
  private sky = skyDome(500);
  private sun = new THREE.DirectionalLight(0xffffff, 0.9);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.5);
  private flock: FlockSheep[] = [];
  private hatSheep: Sheep;
  private humans: Record<string, Human> = {};
  private shoes: Record<string, THREE.Group> = {};
  private fallingHat: THREE.Group;
  private saucers: Saucer[] = [];
  private mother = new Mothership();
  private pod = new Pod();
  private gafoop = new Gafoop();
  private puffs = new PuffSystem(500);
  private sparks = new SparkSystem(600);
  private city: THREE.Group;
  private scatter: Scatter;

  constructor(private ctx: StageContext) {
    const s = this.scene;
    const base = rollingHills(7, 1.3);
    const path = (x: number, z: number) => Math.abs(z - (6 + Math.sin(x * 0.12) * 2.5));
    this.height = (x, z) => {
      const r = Math.hypot(x, z + 2);
      const flat = smooth((r - 7) / 14);
      return base(x, z) * flat - (path(x, z) < 1.4 ? 0.04 : 0);
    };
    s.add(this.sky);
    s.fog = new THREE.Fog(new THREE.Color(C.skyLight), 40, 140);
    s.add(this.sun, this.hemi, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0008;

    s.add(terrain(160, 140, this.height, { path, material: groundMaterial({ path: [2.5, 0.12, 6], pathColor: C.khaki, pathEdge: C.moss }) }));
    const avoid = (x: number, z: number) => path(x, z) < 1.2;
    s.add(meadowDressing(70, 3500, this.height, 5, avoid));

    // farm
    const fh = farmhouse();
    fh.position.set(-15, this.height(-15, -11), -11);
    fh.rotation.y = 0.5;
    const bn = barn();
    bn.position.set(-7, this.height(-7, -16), -16);
    bn.rotation.y = 0.2;
    const sl = silo();
    sl.position.set(-2.5, this.height(-2.5, -17), -17);
    s.add(fh, bn, sl);
    for (const [x, z] of [[-4, -11], [-3, -12.2]]) {
      const h = hayBale();
      h.position.set(x, this.height(x, z), z);
      s.add(h);
    }
    // paddock fence & a stone wall along the lane
    const pts = [[-11, -8], [-5, -11], [6, -10], [11, -4], [10, 2.5], [4, 3.5]].map(([x, z]) => new THREE.Vector2(x, z));
    s.add(fence(pts, this.height));
    const wallPts: THREE.Vector2[] = [];
    for (let x = -30; x <= 30; x += 3) wallPts.push(new THREE.Vector2(x, 6 + Math.sin(x * 0.12) * 2.5 + 1.7));
    s.add(stoneWall(wallPts, this.height));
    // trees, bushes, rocks around the edges
    const r = new Rng(4);
    for (let i = 0; i < 46; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(16, 45);
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 4;
      if (avoid(x, z) || (x > -18 && x < 0 && z < -8 && z > -20)) continue;
      const t = tree(i + 1, r.range(0.9, 1.5), r.next() > 0.75 ? 'pine' : 'round');
      t.position.set(x, this.height(x, z), z);
      t.rotation.y = r.range(0, 6);
      s.add(t);
    }
    for (let i = 0; i < 26; i++) {
      const x = r.range(-28, 28), z = r.range(-22, 22);
      if (avoid(x, z) || Math.hypot(x, z + 2) < 9) continue;
      const o = i % 2 ? bush(i, r.range(0.8, 1.3)) : rock(i, r.range(0.6, 1.3));
      o.position.set(x, this.height(x, z) + (i % 2 ? 0 : 0.05), z);
      s.add(o);
    }
    // the city on the horizon
    this.city = cityBlock(3, 34, 26);
    this.city.position.set(10, -1, -75);
    s.add(this.city);

    // the flock
    const fr = new Rng(12);
    for (let i = 0; i < 34; i++) {
      const a = fr.range(0, Math.PI * 2), d = Math.sqrt(fr.next()) * 7.5;
      const home = new THREE.Vector2(Math.cos(a) * d + 0.5, Math.sin(a) * d * 0.7 - 2.5);
      const sh = new Sheep(100 + i);
      sh.root.scale.setScalar(fr.range(0.92, 1.08));
      this.flock.push({ s: sh, home, heading: fr.range(0, Math.PI * 2), seed: i });
      s.add(sh.root);
    }
    this.flock[0].home.set(1.5, -1.0);
    this.hatSheep = this.flock[1].s;
    this.flock[1].home.set(-3.2, -6.4);

    // humans
    for (const k of ['jogger', 'tourist', 'farmer', 'suit'] as const) {
      const h = new Human(k);
      this.humans[k] = h;
      s.add(h.root);
      const shoes = shoePair(k === 'jogger' ? C.white : k === 'suit' ? C.ink : k === 'tourist' ? C.rust : C.mud);
      shoes.visible = false;
      this.shoes[k] = shoes;
      s.add(shoes);
    }
    // tourist camera
    this.humans.tourist.prop.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.1), toon(C.ink)));
    this.humans.suit.prop.add(mesh(new THREE.BoxGeometry(0.35, 0.25, 0.08), toon(C.rust), [0, -0.1, 0]));
    this.humans.farmer.prop.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.22, 10), toon(C.fog), [0, -0.12, 0]));
    // the straw hat that ends up on a sheep
    this.fallingHat = this.humans.farmer.hat!;

    for (let i = 0; i < 5; i++) {
      const sc = new Saucer(i + 3);
      sc.root.scale.setScalar(1.1);
      this.saucers.push(sc);
      s.add(sc.root);
    }
    this.mother.root.scale.setScalar(2.2);
    s.add(this.mother.root);
    s.add(this.pod.root, this.gafoop.root);
    s.add(this.puffs.mesh, this.sparks.points);
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scatter = new Scatter(this.flock.map((f) => f.home), new THREE.Vector2(0.5, -2.5));
  }

  // ----------------------------------------------------------------- lighting presets
  private day(): void {
    setSky(this.sky, C.sky, C.skyLight, C.skyLight);
    (this.scene.fog as THREE.Fog).color.set(C.skyLight);
    this.sun.color.set(0xfff4e0);
    this.sun.intensity = 0.95;
    this.sun.position.set(-18, 30, 14);
    this.hemi.color.set(0xffffff);
    this.hemi.groundColor.set(0x88aa88);
    this.hemi.intensity = 0.5;
    this.sky.material.uniforms.uSunColor.value.set(0, 0, 0);
    setToonDefaults();
  }
  private sunset(): void {
    setSky(this.sky, C.violet, C.salmon, C.amber);
    (this.scene.fog as THREE.Fog).color.set(C.coral);
    this.sun.color.set(0xffb070);
    this.sun.intensity = 1.25;
    this.sun.position.set(-26, 17, -20);
    this.hemi.color.set(0xffd8c0);
    this.hemi.groundColor.set(0x705060);
    this.hemi.intensity = 0.6;
    const u = this.sky.material.uniforms;
    u.uSunDir.value.copy(this.sun.position).normalize();
    u.uSunColor.value.set(C.gold);
    u.uSunSize.value = 0.002;
    toonUniforms.uShadowTint.value.setRGB(0.92, 0.84, 0.94);
    toonUniforms.uLightTint.value.setRGB(1.12, 1.0, 0.85);
  }

  enter(shot: Shot): void {
    this.puffs.clear();
    this.sparks.clear();
    const m = shot.marks;
    if (shot.name === 'invasion') {
      this.day();
      for (const k of ['jogger', 'tourist', 'farmer', 'suit']) {
        const t = m[`zap.${k}`] + 0.28;
        const p = this.humanPos(k, t);
        const at = new THREE.Vector3(p.x, this.height(p.x, p.y) + 0.9, p.y);
        this.puffs.burst(t, at, 14, { color: [C.white, C.mist, C.fog], size: 0.32, speed: 2.2, up: 1.0, life: 1.1, seed: k.length * 13 });
        this.sparks.burst(t, at, 30, { color: [C.mint, C.ice, C.white], speed: 4, life: 0.6, intensity: 1.8, seed: k.length * 7 });
        // shoes keep smoking
        for (let i = 0; i < 14; i++) {
          this.puffs.add({ t0: t + 0.5 + i * 0.45, life: 1.6, p: new THREE.Vector3(p.x, this.height(p.x, p.y) + 0.1, p.y), v: new THREE.Vector3(0.05, 0.7, 0), size: 0.09, color: new THREE.Color(C.fog), drag: 0.3, grow: 2 });
        }
      }
      // the city takes hits
      const ct = m['zap.city'];
      for (let i = 0; i < 3; i++) {
        const b = this.city.children[i * 5] as THREE.Mesh;
        const wp = b.getWorldPosition(new THREE.Vector3());
        this.puffs.burst(ct + 0.25 + i * 0.25, wp.clone().setY(wp.y + 2), 10, { color: [C.white, C.fog, C.lilac], size: 1.2, speed: 3, up: 1.5, life: 1.6, seed: 300 + i });
      }
    } else if (shot.name === 'exile') {
      this.sunset();
      const c = m.crash;
      const at = new THREE.Vector3(0.5, this.height(0.5, -2.5) + 0.2, -2.5);
      this.puffs.burst(c, at, 40, { color: [C.tan, C.khaki, C.mist, C.straw], size: 0.7, speed: 5, up: 1.2, life: 2.2, seed: 77 });
      this.sparks.burst(c, at, 60, { color: [C.gold, C.orange, C.lemon], speed: 7, life: 0.9, intensity: 1.6, seed: 78 });
      // smoke trail behind the falling pod
      for (let i = 0; i < 40; i++) {
        const tt = m.eject + 0.1 + i * 0.06;
        if (tt > c) break;
        const p = this.podPos(tt, m);
        this.puffs.add({ t0: tt, life: 1.4, p, v: new THREE.Vector3(0, 0.3, 0), size: 0.35, color: new THREE.Color(i % 2 ? C.mist : C.fog), drag: 1, grow: 2.2 });
      }
      // Gafoop's cough puffs
      for (let i = 0; i < 3; i++) this.puffs.add({ t0: m.climb + 0.6 + i * 0.28, life: 0.8, p: new THREE.Vector3(0.6, this.height(0.5, -2.5) + 1.7, -2.1), v: new THREE.Vector3(0.3, 0.5, 0.6), size: 0.15, color: new THREE.Color(C.fog), drag: 2, grow: 2 });
      this.scatter.reset();
    } else {
      this.day();
    }
  }

  private humanPos(k: string, t: number): THREE.Vector2 {
    switch (k) {
      case 'jogger': {
        const x = -14 + t * 2.6;
        return new THREE.Vector2(x, 6 + Math.sin(x * 0.12) * 2.5);
      }
      case 'tourist':
        return new THREE.Vector2(9.5, 4.6);
      case 'farmer':
        return new THREE.Vector2(-4.2, -7.0);
      case 'suit': {
        const x = 12 - t * 1.0;
        return new THREE.Vector2(x, 6 + Math.sin(x * 0.12) * 2.5 + 0.4);
      }
    }
    return new THREE.Vector2();
  }

  private podPos(t: number, m: Record<string, number>): THREE.Vector3 {
    const k = clamp((t - m.eject) / (m.crash - m.eject));
    const start = new THREE.Vector3(-8, 26, -38);
    const end = new THREE.Vector3(0.5, this.height(0.5, -2.5) + 0.5, -2.5);
    const p = start.clone().lerp(end, easeInCubic(k) * 0.7 + k * 0.3);
    p.y += Math.sin(k * Math.PI) * 4;
    return p;
  }

  private placeSheep(f: FlockSheep, x: number, z: number, heading: number): void {
    f.s.root.position.set(x, this.height(x, z), z);
    f.s.root.rotation.y = heading;
  }

  private grazeIdle(f: FlockSheep, T: number): void {
    const k = f.seed;
    const wander = new THREE.Vector2(Math.sin(T * 0.13 + k) * 0.5, Math.cos(T * 0.11 + k * 1.7) * 0.4);
    const heading = f.heading + Math.sin(T * 0.2 + k) * 0.6;
    this.placeSheep(f, f.home.x + wander.x, f.home.y + wander.y, heading);
    const cyc = (T * 0.35 + hash1(k, 3) * 10) % 4;
    f.s.graze = cyc < 2.6 ? 1 : 0;
    f.s.walk = cyc > 2.8 && cyc < 3.4 ? 0.5 : 0;
    f.s.walkPhase = T * 7 + k;
    f.s.bleat = 0;
    f.s.lookYaw = 0;
    f.s.blink = (T + k) % 3.1 < 0.12 ? 1 : 0;
    f.s.bounce = 0;
    if (f.s.graze) f.s.head.position.y += Math.sin(T * 9 + k) * 0.015; // chewing
  }

  update(shot: Shot, t: number, T: number): void {
    const m = shot.marks;
    this.mother.update(T);
    for (const sc of this.saucers) sc.update(T);
    this.mother.root.visible = false;
    this.saucers.forEach((s) => (s.root.visible = false));
    this.pod.root.visible = false;
    this.gafoop.root.visible = false;
    for (const h of Object.values(this.humans)) h.root.visible = false;
    for (const s of Object.values(this.shoes)) s.visible = false;
    for (const f of this.flock) {
      f.s.root.visible = true;
      this.grazeIdle(f, T);
    }
    this.hatSheep.head.remove(this.fallingHat);

    if (shot.name === 'baa') this.updateBaa(t, T, m);
    else if (shot.name === 'invasion') this.updateInvasion(t, T, m);
    else if (shot.name === 'exile') this.updateExile(t, T, m);

    for (const f of this.flock) f.s.update();
    this.puffs.update(t);
    this.sparks.update(t);
    this.sun.target.position.set(0, 0, -2);
  }

  private setOrtho(cx: number, cy: number, cz: number, zoom: number, yaw = Math.PI / 4, pitch = 0.62): void {
    const cam = this.ortho;
    const d = 60;
    cam.position.set(cx + Math.sin(yaw) * Math.cos(pitch) * d, cy + Math.sin(pitch) * d, cz + Math.cos(yaw) * Math.cos(pitch) * d);
    cam.zoom = zoom;
    cam.updateProjectionMatrix();
    cam.lookAt(cx, cy, cz);
    this.camera = cam;
    this.post.depthAbs = 0.25;
    this.post.depthRel = 0;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 85;
    fog.far = 230;
  }

  private setPersp(pos: [number, number, number], look: [number, number, number], fov = 36): void {
    const cam = this.persp;
    cam.position.set(...pos);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(...look);
    this.camera = cam;
    this.post.depthAbs = 0.06;
    this.post.depthRel = 0.02;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 40;
    fog.far = 150;
  }

  private updateBaa(t: number, T: number, m: Record<string, number>): void {
    const hx = 6.2, hz = -0.8;
    const hero = this.flock[0];
    // keep the rest of the flock out of the close-up
    for (const f of this.flock) {
      if (f === hero) continue;
      const p = f.s.root.position;
      if (Math.hypot(p.x - hx, p.z - hz) < 3.2) f.s.root.visible = false;
    }
    this.placeSheep(hero, hx, hz, 0.75);
    const s = hero.s;
    s.graze = t < m.bleat - 0.5 ? 1 : 0;
    s.head.position.y += s.graze ? Math.sin(T * 10) * 0.015 : 0;
    s.lookYaw = t > m.bleat - 0.4 ? 0.35 : 0;
    s.bleat = t > m.bleat && t < m.bleat + 0.9 ? 1 : 0;
    s.blink = t > m.bleat + 1.4 && t < m.bleat + 1.55 ? 1 : 0;
    const y = this.height(hx, hz);
    const k = smooth(t / 3);
    this.setPersp([hx + 2.0 - k * 0.15, y + 0.95, hz + 2.1 - k * 0.15], [hx + 0.1, y + 0.62, hz], 30);
  }

  private updateInvasion(t: number, T: number, m: Record<string, number>): void {
    const calm = m.calm;
    // humans going about their day
    for (const k of ['jogger', 'tourist', 'farmer', 'suit']) {
      const h = this.humans[k];
      const zt = m[`zap.${k}`] + 0.28;
      const p = this.humanPos(k, Math.min(t, zt));
      const alive = t < zt;
      h.root.visible = alive;
      h.root.position.set(p.x, this.height(p.x, p.y), p.y);
      h.phase = T * (k === 'jogger' ? 11 : 6);
      h.run = k === 'jogger' ? 1 : k === 'suit' ? 0.5 : 0;
      h.root.rotation.y = k === 'jogger' ? Math.PI / 2 : k === 'suit' ? -Math.PI / 2 : k === 'tourist' ? Math.PI * 1.15 : 0.6;
      h.scared = t > zt - 0.6 && alive ? 1 : 0;
      if (k === 'tourist') h.arms[1].rotation.x = -1.4;
      if (k === 'farmer') {
        h.arms[1].rotation.x = -0.7;
      }
      h.update();
      if (k === 'tourist') h.arms[1].rotation.x = -1.4;
      this.shoes[k].visible = !alive;
      this.shoes[k].position.set(p.x, this.height(p.x, p.y), p.y);
      this.shoes[k].rotation.y = h.root.rotation.y;
      // the straw hat flutters down onto a sheep
      if (k === 'farmer') {
        const hp = this.fallingHat;
        if (alive) {
          if (hp.parent !== h.head) h.head.add(hp);
          hp.position.set(0, 0.1, 0);
          hp.rotation.set(0, 0, 0);
          hp.scale.setScalar(1);
        } else {
          const fall = clamp((t - zt) / 1.6);
          const target = this.hatSheep.head;
          if (fall < 1) {
            if (hp.parent !== this.scene) this.scene.add(hp);
            const start = new THREE.Vector3(p.x, this.height(p.x, p.y) + 1.7, p.y);
            const end = target.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
            hp.position.lerpVectors(start, end, easeInOut(fall));
            hp.position.x += Math.sin(fall * 9) * 0.4 * (1 - fall);
            hp.position.y += Math.sin(fall * Math.PI) * 0.8;
            hp.rotation.set(Math.sin(fall * 11) * 0.5 * (1 - fall), fall * 3, Math.cos(fall * 9) * 0.4 * (1 - fall));
          } else {
            if (hp.parent !== target) target.add(hp);
            hp.position.set(0, 0.16, -0.03);
            hp.rotation.set(-0.1, 0, 0.15);
            hp.scale.setScalar(0.75);
          }
        }
      }
    }
    // the hat sheep stays put next to where the farmer stood
    const hs = this.flock[1];
    this.placeSheep(hs, -3.2, -6.4, 2.6);
    // saucers arrive, beam, and leave
    const targets = ['jogger', 'tourist', 'farmer', 'suit', 'city'];
    this.saucers.forEach((sc, i) => {
      sc.root.visible = true;
      const k = targets[i];
      const zt = m[`zap.${k}`];
      const hover = k === 'city' ? new THREE.Vector3(14, 16, -60) : (() => {
        const p = this.humanPos(k, zt + 0.28);
        return new THREE.Vector3(p.x, this.height(p.x, p.y) + 6.5, p.y);
      })();
      const arrive = easeOutCubic(clamp((t - i * 0.25) / 2.2));
      const from = hover.clone().add(new THREE.Vector3(-20 + i * 6, 25, -30));
      const leave = clamp((t - calm + 0.6) / 2.5);
      sc.root.position.lerpVectors(from, hover, arrive).add(new THREE.Vector3(0, Math.sin(T * 2 + i) * 0.15 + leave * leave * 40, -leave * 20));
      const beam = t > zt && t < zt + 0.42 ? 1 : 0;
      sc.setBeam(beam, hover.y - (k === 'city' ? -1 : this.height(hover.x, hover.z)) + 0.3);
    });
    // cameras: wide diorama while it happens, then a quiet close-up of the aftermath
    if (t < calm) {
      const k = smooth(t / calm);
      this.setOrtho(lerp(-1, 1.5, k), 1, lerp(0, -1, k), 0.8);
    } else {
      const k = smooth((t - calm) / 6);
      this.setOrtho(lerp(-3.3, -3.6, k), 0.6, lerp(-6.2, -6.6, k), lerp(2.6, 2.9, k));
    }
    // "The sheep did not notice" — one bleats at the end
    if (t > m.bleat && t < m.bleat + 0.8) {
      hs.s.bleat = 1;
      hs.s.graze = 0;
    }
  }

  private updateExile(t: number, T: number, m: Record<string, number>): void {
    const podRest = new THREE.Vector3(0.5, this.height(0.5, -2.5) + 0.45, -2.5);
    // mothership hanging in the evening sky, then leaving
    this.mother.root.visible = t < m.leave + 0.6;
    const lv = clamp((t - m.leave) / 0.6);
    this.mother.root.position.set(-14 - lv * 40, 34 + lv * 30, -60 - lv * 80);
    this.mother.root.rotation.set(0.25, T * 0.05, 0.1);
    // the pod
    this.pod.root.visible = t > m.eject;
    if (t < m.crash) {
      const p = this.podPos(t, m);
      this.pod.root.position.copy(p);
      this.pod.root.rotation.set(Math.sin(t * 7) * 0.3, t * 4, 0.6);
    } else {
      this.pod.root.position.copy(podRest);
      const settle = clamp((t - m.crash) / 0.5);
      this.pod.root.rotation.set(0.35 * (1 - easeOutBack(settle)) + 0.25, 0.4, 0.15);
    }
    this.pod.hatch.rotation.y = t > m.hatch ? -easeOutBack(clamp((t - m.hatch) / 0.4)) * 1.8 : 0;
    // Gafoop climbs out and stands on top
    const g = this.gafoop;
    g.root.visible = t > m.climb;
    const climb = clamp((t - m.climb) / 1.2);
    g.root.position.set(0.5, podRest.y + lerp(0.1, 0.62, easeOutBack(climb)), -2.5 + lerp(0.45, 0, climb));
    g.root.rotation.y = 0.75;
    g.root.scale.setScalar(0.8);
    g.mouth = this.ctx.mouth('gafoop', T);
    g.blink = T % 3.3 < 0.12 ? 1 : 0;
    g.capTilt = t > m.climb ? 0.35 : 0;
    g.capOff = 0;
    g.eyeDroop = 0;
    g.eyeWobble = t < m.climb + 1.4 ? 0.6 : 0;
    g.squash = 0;
    g.armL.swing = -1.1;
    g.armR.swing = -1.1;
    g.look.set(0, 0);
    if (t > m.speech && t < m['G08.end']) {
      const k = (t - m.speech) / (m['G08.end'] - m.speech);
      g.armL.swing = 0.4 + Math.sin(k * 14) * 0.4;
      g.armR.swing = k > 0.5 ? 0.9 : -0.6;
      g.squash = -0.06;
    }
    if (t > m.choo) {
      const k = clamp((t - m.choo - 0.4) / 0.6);
      g.capOff = easeOutBack(k);
      g.eyeDroop = k * 0.7;
      g.squash = 0.12 * k;
      g.armL.swing = g.armR.swing = -1.4;
    }
    g.update(T);

    // sheep: graze, look up at the crash, stare at the speech, then stampede
    this.scatter.stepTo(t, m.choo);
    this.flock.forEach((f, i) => {
      const s = f.s;
      if (t > m.choo) {
        const p = this.scatter.pos[i], v = this.scatter.vel[i];
        const sp = v.length();
        const heading = sp > 0.2 ? Math.atan2(v.x, v.y) : f.heading;
        if (sp > 0.2) f.heading = heading;
        this.placeSheep(f, p.x, p.y, f.heading);
        s.walk = Math.min(1, sp / 2);
        s.walkPhase = t * (6 + sp * 3) + i;
        s.bounce = sp > 3 ? Math.abs(Math.sin(t * 14 + i)) * 0.25 : 0;
        s.graze = sp < 0.4 && t > m.choo + 3 ? 1 : 0;
      } else if (t > m.crash) {
        // everyone turns to face the pod
        const p = f.home;
        const toPod = Math.atan2(0.5 - p.x, -2.5 - p.y);
        const turn = smooth((t - m.crash - 0.2 - hash1(i, 5) * 0.5) / 0.4);
        this.placeSheep(f, p.x, p.y, lerp(f.heading, toPod, turn));
        s.graze = 0;
        s.walk = 0;
        s.bounce = t < m.crash + 0.35 ? Math.max(0, Math.sin((t - m.crash) * 9)) * 0.3 : 0;
        if (t > m.sneeze && i === 3) s.bleat = t < m.choo ? 0.6 + Math.sin(t * 20) * 0.3 : 0;
      }
    });
    // the sneezer jumps
    const sneezer = this.flock[3].s;
    if (t > m.choo && t < m.choo + 0.3) sneezer.bounce = 0.3;

    // cameras
    if (t < m.crash - 0.05) {
      // looking up at the sky: the flagship, the ejection, the falling pod
      const k = smooth(t / m.crash);
      this.setPersp([4, this.height(4, 8) + 1.4, 8], [lerp(-6, -2, k), lerp(14, 6, k), lerp(-35, -15, k)], 44);
    } else if (t < m.speech) {
      const k = smooth((t - m.crash) / 4);
      this.setOrtho(0.5, 0.8, -2.5, lerp(1.4, 1.9, k));
    } else if (t < m.sneeze) {
      // over the flock's shoulders at the general on his pod
      const k = smooth((t - m.speech) / 6);
      this.setPersp([lerp(8.6, 8.2, k), podRest.y + 2.6, lerp(6.4, 6.0, k)], [0.5, podRest.y + 0.75, -2.5], lerp(17, 15, k));
    } else if (t < m.choo + 0.15) {
      const sp = this.flock[3].s.root.position;
      this.setPersp([sp.x + 1.6, sp.y + 0.8, sp.z + 1.4], [sp.x, sp.y + 0.65, sp.z], 32);
    } else {
      // the flock bolts; then a slow push in on the general, alone on his pod
      const k = smooth((t - m.choo - 0.15) / 2.5);
      const k2 = smooth((t - m.N09 + 0.8) / 4);
      this.setOrtho(0.5, lerp(0.8, 1.4, k2), -2.5, lerp(1.6, 1.15, k) + k2 * 1.6);
    }
  }

  fx(shot: Shot, t: number) {
    const m = shot.marks;
    if (shot.name === 'exile' && t > m.crash && t < m.crash + 0.6) {
      const k = 1 - (t - m.crash) / 0.6;
      return { shake: [Math.sin(t * 61) * 3 * k, Math.cos(t * 49) * 3 * k] as [number, number], flash: k > 0.8 ? 0.4 : 0, bars: 0 };
    }
    if (shot.name === 'invasion') {
      for (const k of ['jogger', 'tourist', 'farmer', 'suit', 'city']) {
        const z = m[`zap.${k}`];
        if (t > z && t < z + 0.12) return { flash: 0.25 };
      }
    }
    return {};
  }
}
