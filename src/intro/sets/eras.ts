import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { Sheep } from '../../art/sheep';
import { Gafoop } from '../../art/gafoop';
import { PuffSystem, SparkSystem, skyDome, setSky } from '../../art/fx';
import { tree, rock, bush } from '../../art/props';
import { toon, glow, noOutline } from '../../engine/toon';
import { C } from '../../engine/palette';
import { Rng, clamp, easeOutBack, hash1, lerp, smooth, window01 } from '../../engine/rng';
import { mesh, blob } from '../../art/geo';
import { drawSprite } from '../../engine/sprites';
import { panel, ditherOut, rect } from '../../engine/ui';

/** A floating diorama slab: grass top with a lip, layered earth sides. */
export function slab(w: number, d: number, top: string, seed = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.3, d), toon(top), [0, -0.15, 0]));
  g.add(mesh(new THREE.BoxGeometry(w - 0.1, 1.2, d - 0.1), toon(C.terracotta), [0, -0.9, 0]));
  g.add(mesh(new THREE.BoxGeometry(w - 0.4, 1.6, d - 0.4), toon(C.rust), [0, -2.2, 0]));
  g.add(mesh(new THREE.BoxGeometry(w - 1.4, 1.4, d - 1.4), toon(C.wine), [0, -3.6, 0]));
  const r = new Rng(seed);
  // dangling rocks underneath
  for (let i = 0; i < Math.floor(w / 2); i++) g.add(mesh(blob(r.range(0.3, 0.7), 1, 0.2, seed + i), toon(C.clay, { flat: true }), [r.range(-w / 2 + 1, w / 2 - 1), r.range(-4.6, -3.8), r.range(-d / 2 + 1, d / 2 - 1)]));
  return g;
}

/** The herding lane: a polyline sheep walk along, like items on a belt. */
class Lane {
  pts: THREE.Vector3[];
  lens: number[] = [];
  total = 0;
  constructor(pts: [number, number][]) {
    this.pts = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    for (let i = 0; i < this.pts.length - 1; i++) {
      const l = this.pts[i].distanceTo(this.pts[i + 1]);
      this.lens.push(l);
      this.total += l;
    }
  }
  at(s: number, out: THREE.Vector3): number {
    s = Math.max(0, Math.min(this.total - 1e-3, s));
    for (let i = 0; i < this.lens.length; i++) {
      if (s <= this.lens[i]) {
        out.lerpVectors(this.pts[i], this.pts[i + 1], s / this.lens[i]);
        const d = this.pts[i + 1].clone().sub(this.pts[i]);
        return Math.atan2(d.x, d.z);
      }
      s -= this.lens[i];
    }
    out.copy(this.pts[this.pts.length - 1]);
    return 0;
  }
}

const ERAS: { key: string; name: string; sub: string; x: number; top: string; icon: string }[] = [
  { key: 'stone', name: 'STONE AGE', sub: 'TECH: ROCKS (POINTY)', x: -18, top: C.grass, icon: 'stone' },
  { key: 'bronze', name: 'BRONZE AGE', sub: 'TECH: SHINY ROCKS', x: -6, top: C.moss, icon: 'bronze' },
  { key: 'iron', name: 'IRON AGE', sub: 'TECH: HEAVIER ROCKS', x: 6, top: C.sage, icon: 'anvil' },
  { key: 'industrial', name: 'INDUSTRIAL AGE', sub: 'TECH: ROCKS THAT BURN', x: 18, top: C.olive, icon: 'chimney' },
];

export class ErasSet implements StageSet {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-12, 12, 6.75, -6.75, -100, 1500);
  post = { depthAbs: 0.25, depthRel: 0, outline: 0.62, highlight: 0.3, bloom: 1.0, bloomThreshold: 1.3 };
  private sheep: Sheep[] = [];
  private lane: Lane;
  private gafoop = new Gafoop();
  private hover = new THREE.Group();
  private puffs = new PuffSystem(300);
  private sparks = new SparkSystem(400);
  private gears: THREE.Mesh[] = [];
  private fire: THREE.Mesh;
  private furnaceGlow: THREE.Mesh;
  private dog = new THREE.Group();

  constructor(private ctx: StageContext) {
    const s = this.scene;
    const sky = skyDome(400);
    setSky(sky, C.navy, C.violet, C.plumDark);
    s.add(sky);
    const sun = new THREE.DirectionalLight(0xfff0d8, 0.95);
    sun.position.set(-10, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 14, bottom: -14, near: 1, far: 80 });
    s.add(sun, sun.target, new THREE.HemisphereLight(0xd0c8ff, 0x604050, 0.5));

    for (const e of ERAS) {
      const sl = slab(12, 10, e.top, e.x + 30);
      sl.position.set(e.x, 0, 0);
      s.add(sl);
    }
    const r = new Rng(3);
    // --- stone age: henge, huts, campfire, rough wooden fence posts
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      s.add(mesh(new THREE.BoxGeometry(0.5, 1.6, 0.35), toon(C.fog, { flat: true }), [-20 + Math.cos(a) * 2, 0.8, -2.2 + Math.sin(a) * 1.4], [0, -a, r.range(-0.06, 0.06)]));
    }
    s.add(mesh(new THREE.BoxGeometry(2.2, 0.35, 0.4), toon(C.fog, { flat: true }), [-20, 1.75, -0.8]));
    for (const [x, z] of [[-15.5, -3.2], [-23.5, 2.8]]) {
      s.add(mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.9, 10), toon(C.khaki), [x, 0.45, z]));
      s.add(mesh(new THREE.ConeGeometry(1.1, 1.0, 10), toon(C.straw, { flat: true }), [x, 1.4, z]));
    }
    s.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.15, 8), toon(C.stone), [-17.2, 0.08, 2.4]));
    this.fire = noOutline(mesh(new THREE.ConeGeometry(0.28, 0.7, 6), glow(C.amber, 2.4), [-17.2, 0.45, 2.4]));
    s.add(this.fire);
    // --- bronze: furnace, gong
    s.add(mesh(new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.clay), [-8.5, 0, -2.6]));
    s.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 8), toon(C.clay), [-8.5, 1.4, -2.6]));
    this.furnaceGlow = noOutline(mesh(new THREE.CircleGeometry(0.4, 10), glow(C.orange, 2.5), [-8.5, 0.4, -1.6]));
    s.add(this.furnaceGlow);
    const gong = new THREE.Group();
    gong.add(mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), toon(C.rust), [-1.1, 1.2, 0]));
    gong.add(mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), toon(C.rust), [1.1, 1.2, 0]));
    gong.add(mesh(new THREE.BoxGeometry(2.5, 0.15, 0.15), toon(C.rust), [0, 2.4, 0]));
    gong.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 18), toon(C.amber), [0, 1.35, 0], [Math.PI / 2, 0, 0]));
    gong.position.set(-3.6, 0, -3.0);
    s.add(gong);
    // --- iron: anvil + forge, watchtower, a robot sheepdog prototype
    s.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), toon(C.coal), [3.2, 0.75, -2.4]));
    s.add(mesh(new THREE.BoxGeometry(0.4, 0.6, 0.3), toon(C.coal), [3.2, 0.3, -2.4]));
    const tower = new THREE.Group();
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) tower.add(mesh(new THREE.BoxGeometry(0.15, 3.2, 0.15), toon(C.rust), [x, 1.6, z]));
    tower.add(mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), toon(C.terracotta), [0, 3.2, 0]));
    tower.add(mesh(new THREE.ConeGeometry(1.2, 0.8, 4), toon(C.brick, { flat: true }), [0, 3.8, 0], [0, Math.PI / 4, 0]));
    tower.position.set(9.5, 0, -3);
    s.add(tower);
    this.dog.add(mesh(new THREE.BoxGeometry(0.4, 0.35, 0.7), toon(C.fog), [0, 0.45, 0]));
    this.dog.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), toon(C.mist), [0, 0.7, 0.4]));
    this.dog.add(noOutline(mesh(new THREE.SphereGeometry(0.06, 6, 4), glow(C.scarlet, 2.5), [0, 1.05, 0.35])));
    this.dog.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), toon(C.lilac), [0, 0.92, 0.35]));
    for (const [x, z] of [[-0.15, 0.25], [0.15, 0.25], [-0.15, -0.25], [0.15, -0.25]]) this.dog.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5), toon(C.lilac), [x, 0.15, z]));
    s.add(this.dog);
    // --- industrial: brick factory, smokestacks, gears
    s.add(mesh(new THREE.BoxGeometry(4.4, 2.4, 3), toon(C.brick), [19.5, 1.2, -2.6]));
    for (let k = 0; k < 4; k++) s.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), glow(C.gold, 1.4), [18 + k * 1, 1.4, -1.08]));
    for (const x of [18.2, 20.8]) {
      s.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.6, 10), toon(C.wine), [x, 3.6, -3.4]));
      s.add(mesh(new THREE.TorusGeometry(0.4, 0.06, 4, 10), toon(C.ink), [x, 5.3, -3.4], [Math.PI / 2, 0, 0]));
    }
    for (const [x, y, z, rr] of [[15.0, 1.1, -2.7, 0.8], [16.1, 0.7, -2.0, 0.5]] as const) {
      const gear = mesh(new THREE.CylinderGeometry(rr, rr, 0.2, 10), toon(C.fog, { flat: true }), [x, y, z], [Math.PI / 2, 0, 0]);
      this.gears.push(gear);
      s.add(gear);
    }
    // rails
    for (const z of [3.4, 4.0]) s.add(mesh(new THREE.BoxGeometry(11, 0.08, 0.08), toon(C.lilac), [18, 0.05, z]));
    // trees and rocks sprinkled across the older eras
    for (let i = 0; i < 12; i++) {
      const x = r.range(-23, 10), z = r.range(-4.5, -3.2) + (i % 2 ? 7.8 : 0);
      const o = i % 3 === 0 ? rock(i, 0.7) : i % 3 === 1 ? bush(i, 0.9) : tree(i, 0.7);
      o.position.set(x, 0, Math.max(-4.6, Math.min(4.6, z)));
      s.add(o);
    }

    // the lane: winding across all four eras, fenced in era-appropriate materials
    this.lane = new Lane([[-24, 1.2], [-19, 0.6], [-15, 2.2], [-11, 0.8], [-6, 1.6], [-1, 0.6], [4, 1.8], [9, 0.6], [13, 1.4], [17, 0.4], [20.5, 0.3], [21.5, -1.1]]);
    const postCols = [C.tan, C.amber, C.coal, C.lilac];
    for (let s0 = 0; s0 < this.lane.total; s0 += 1.0) {
      const p = new THREE.Vector3();
      const h = this.lane.at(s0, p);
      const era = Math.min(3, Math.max(0, Math.floor((p.x + 24) / 12)));
      const n = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
      for (const side of [-1, 1]) {
        const q = p.clone().addScaledVector(n, side * 0.75);
        s.add(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), toon(postCols[era]), [q.x, 0.27, q.z]));
        const rail = mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), toon(postCols[era]), [q.x, 0.42, q.z], [0, h, 0]);
        s.add(rail);
      }
    }
    for (let i = 0; i < 26; i++) {
      const sh = new Sheep(300 + i);
      sh.root.scale.setScalar(0.85);
      this.sheep.push(sh);
      s.add(sh.root);
    }
    // the general on his hover-disc, crook in hand
    this.hover.add(mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.2, 18), toon(C.mist)));
    this.hover.add(noOutline(mesh(new THREE.CircleGeometry(0.55, 14), glow(C.mint, 2.5), [0, -0.11, 0], [Math.PI / 2, 0, 0])));
    this.gafoop.root.position.y = 0.1;
    this.gafoop.root.scale.setScalar(0.9);
    const crook = new THREE.Group();
    crook.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), toon(C.lilac), [0, 0.2, 0]));
    crook.add(mesh(new THREE.TorusGeometry(0.15, 0.03, 4, 10, Math.PI), toon(C.lilac), [0.15, 0.9, 0]));
    crook.add(noOutline(mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(C.mint, 3), [0.3, 0.9, 0])));
    crook.position.set(0.6, -0.1, 0);
    crook.rotation.z = -0.5;
    this.gafoop.armL.root.add(crook);
    this.hover.add(this.gafoop.root);
    s.add(this.hover);
    s.add(this.puffs.mesh, this.sparks.points);
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  enter(shot: Shot): void {
    this.puffs.clear();
    this.sparks.clear();
    const len = shot.end - shot.start;
    // chimney smoke, forge sparks, campfire embers — all pre-spawned, deterministic
    for (let i = 0; i < 70; i++) {
      for (const x of [18.2, 20.8]) this.puffs.add({ t0: i * 0.3 + (x > 19 ? 0.15 : 0), life: 3, p: new THREE.Vector3(x, 5.4, -3.4), v: new THREE.Vector3(0.6, 1.2, 0.2), size: 0.35, color: new THREE.Color(i % 2 ? C.fog : C.mist), drag: 0.25, grow: 2.4 });
    }
    for (let k = 0; k < len * 2; k++) this.sparks.burst(k * 0.5, new THREE.Vector3(3.2, 1.0, -2.4), 6, { color: [C.gold, C.orange, C.lemon], speed: 2.5, life: 0.5, intensity: 2, seed: 900 + k });
    for (let k = 0; k < len * 3; k++) this.sparks.burst(k * 0.33, new THREE.Vector3(-17.2, 0.7, 2.4), 2, { color: [C.amber, C.gold], speed: 0.6, life: 1.2, intensity: 2, seed: 600 + k, grav: -0.5, up: 1.2 });
  }

  update(shot: Shot, t: number, T: number): void {
    const m = shot.marks;
    // camera glides along the eras with the narration, then pulls back
    const xs = [-19, -7, 5.5, 17];
    const keys = ['stone', 'bronze', 'iron', 'industrial'];
    let cx = xs[0];
    for (let i = 0; i < 4; i++) {
      const a = m[keys[i]] - 0.6;
      if (t > a) cx = i === 0 ? xs[0] : lerp(xs[i - 1], xs[i], smooth((t - a) / 1.2));
    }
    const pull = smooth((t - m.fences + 0.4) / 2.2);
    cx = lerp(cx, 0, pull);
    const zoom = lerp(1.25, 0.52, pull);
    const yaw = Math.PI / 4 + Math.sin(t * 0.15) * 0.05;
    const pitch = 0.6;
    const d = 60;
    this.camera.position.set(cx + Math.sin(yaw) * Math.cos(pitch) * d, 1 + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(cx, 1, 0);

    // sheep flow down the lane; after "How hard can it be?" the lead sheep stops and the line piles up
    const speed = 1.6, gap = this.lane.total / this.sheep.length;
    const jamAt = m.jam - 0.4;
    const pos = new THREE.Vector3();
    let prev = Infinity;
    this.sheep.forEach((sh, i) => {
      let s0 = ((T * speed + i * gap) % this.lane.total + this.lane.total) % this.lane.total;
      let stacked = 0;
      if (t > jamAt) {
        const leadS = this.lane.total * 0.62;
        if (s0 < leadS + 0.5) {
          // pile toward the stopped lead
          const target = Math.min(s0, prev - 0.55);
          if (target < s0 && prev !== Infinity) {
            stacked = clamp((s0 - target) / 1.2) * 0.45 * (hash1(i, 3) > 0.5 ? 1 : 0.6);
            s0 = Math.max(target, 0);
          }
          if (prev === Infinity) s0 = Math.min(s0, leadS);
        }
      }
      prev = Math.min(prev, s0);
      const h = this.lane.at(s0, pos);
      sh.root.position.set(pos.x, stacked, pos.z);
      sh.root.rotation.y = h;
      const moving = t < jamAt || stacked === 0;
      sh.walk = moving ? 1 : 0.1;
      sh.walkPhase = T * 9 + i * 1.3;
      sh.graze = 0;
      sh.bleat = t > m.jam && t < m.jam + 0.7 && i % 5 === 0 ? 1 : 0;
      sh.update();
    });
    // the robodog patrols in the iron age
    this.dog.position.set(6.8 + Math.sin(T * 1.2) * 1.5, Math.abs(Math.sin(T * 8)) * 0.05, 3.2);
    this.dog.rotation.y = Math.cos(T * 1.2) > 0 ? Math.PI / 2 : -Math.PI / 2;
    // the general drifts along overhead, pointing his crook
    this.hover.position.set(cx + 2.2, 2.4 + Math.sin(T * 2) * 0.15, 2.6);
    this.hover.rotation.set(0.1, -0.4, 0.05);
    const g = this.gafoop;
    g.mouth = this.ctx.mouth('gafoop', T);
    g.blink = T % 3 < 0.1 ? 1 : 0;
    g.armL.swing = 0.2 + Math.sin(T * 2) * 0.2;
    g.armR.swing = -1.1;
    g.look.set(-0.4, -0.5);
    if (t > m.G09) {
      g.armR.swing = 0.9;
      g.squash = -0.05;
    }
    g.update(T);
    // ambient motion
    this.gears.forEach((gr, i) => (gr.rotation.y = T * (i ? -2.2 : 1.4)));
    this.fire.scale.set(1, 0.8 + Math.abs(Math.sin(T * 11)) * 0.4, 1);
    this.furnaceGlow.visible = Math.sin(T * 7) > -0.6;
    this.puffs.update(t);
    this.sparks.update(t);
  }

  overlay(g: CanvasRenderingContext2D, shot: Shot, t: number): void {
    const f = this.ctx.fonts;
    const m = shot.marks;
    // era title cards
    ERAS.forEach((e, i) => {
      const a = m[e.key];
      const b = i < 3 ? m[ERAS[i + 1].key] : m.fences;
      if (t < a - 0.1 || t > b + 0.2) return;
      const k = easeOutBack(clamp((t - a + 0.1) / 0.35), 2);
      const vis = 1 - window01(t, b - 0.1, b + 0.2);
      const w = Math.max(f.huge.measure(e.name), f.small.measure(e.sub)) + 44;
      const x = 240 - w / 2, y = 22 + Math.round((1 - k) * -30);
      panel(g, x, y, w, 58, { fill: C.ink, border: C.straw, accent: C.gold });
      drawSprite(g, e.icon, x + 8, y + 10, 2);
      f.huge.draw(g, e.name, x + 38, y + 4, { color: C.white, shadow: C.wine });
      f.small.draw(g, e.sub, x + 38, y + 44, { color: C.straw });
      ditherOut(g, x - 2, y - 2, w + 6, 64, 1 - vis);
    });
    // the shopping list: fences, gates, dogs, automation
    const list: [string, string, string][] = [['fences', 'fence', 'FENCES'], ['gates', 'gate', 'GATES'], ['dogs', 'dog', 'DOGS'], ['automation', 'gear', 'AUTOMATION']];
    if (t > m.fences - 0.1) {
      rect(g, 40, 26, 400, 52, C.black);
      rect(g, 40, 26, 400, 1, C.straw);
      rect(g, 40, 77, 400, 1, C.straw);
      list.forEach(([mk, icon, label], i) => {
        if (t < m[mk] - 0.1) return;
        const k = easeOutBack(clamp((t - m[mk] + 0.1) / 0.3), 2.5);
        const x = 60 + i * 96, y = 30;
        const sc = i === 3 ? 3 : 2;
        const s = Math.max(1, Math.round(k * sc));
        drawSprite(g, icon, x + 12 - (s * 6 - 12), y + 12 - (s * 6 - 12), s);
        f.small.draw(g, label, x + 24, y + 42, { color: i === 3 ? C.lime : C.white, align: 'center', outline: C.black });
      });
    }
  }

  fx(shot: Shot, t: number) {
    const m = shot.marks;
    if (t > m.jam && t < m.jam + 0.3) return { shake: [Math.sin(t * 70) * 1.5, 0] as [number, number] };
    return {};
  }
}

