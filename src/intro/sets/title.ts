import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { Sheep } from '../../art/sheep';
import { Gafoop } from '../../art/gafoop';
import { PuffSystem, SparkSystem, skyDome, setSky } from '../../art/fx';
import { tree, fence } from '../../art/props';
import { toon } from '../../engine/toon';
import { C } from '../../engine/palette';
import { clamp, easeOutBack, easeOutCubic, hash1, lerp } from '../../engine/rng';
import { mesh } from '../../art/geo';
import { offscreen, rect } from '../../engine/ui';
import { slab } from './eras';
import { starfield } from '../../art/earth';

/** The title: a little floating meadow, the general, his flock, and the logo. */
export class TitleSet implements StageSet {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-12, 12, 6.75, -6.75, -100, 1500);
  post = { depthAbs: 0.25, depthRel: 0, outline: 0.62, highlight: 0.3, bloom: 1.0, bloomThreshold: 1.3 };
  private sheep: Sheep[] = [];
  private gafoop = new Gafoop();
  private puffs = new PuffSystem(200);
  private sparks = new SparkSystem(300);
  private logo: HTMLCanvasElement | null = null;
  private stars = starfield(900, 300, 19);

  constructor(private ctx: StageContext) {
    const s = this.scene;
    const sky = skyDome(400);
    setSky(sky, C.navy, C.violet, C.plumDark);
    s.add(sky, this.stars);
    const sun = new THREE.DirectionalLight(0xffe8c8, 1.0);
    sun.position.set(-8, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
    s.add(sun, new THREE.HemisphereLight(0xc0b0ff, 0x503050, 0.55));
    const isl = slab(11, 11, C.grass, 99);
    s.add(isl);
    const t1 = tree(5, 1.0);
    t1.position.set(-4.2, 0, -4.0);
    s.add(t1);
    s.add(fence([new THREE.Vector2(-5, 3.5), new THREE.Vector2(-1, 4.6), new THREE.Vector2(4.5, 4.2)], () => 0));
    s.add(mesh(new THREE.BoxGeometry(1.4, 0.6, 1.2), toon(C.fog, { flat: true }), [2.2, 0.3, -1.6], [0, 0.4, 0]));
    this.gafoop.root.position.set(2.2, 0.6, -1.6);
    this.gafoop.root.rotation.y = 0.6;
    this.gafoop.root.scale.setScalar(1.05);
    s.add(this.gafoop.root);
    for (let i = 0; i < 11; i++) {
      const sh = new Sheep(500 + i);
      const a = (i / 11) * Math.PI * 2;
      sh.root.position.set(Math.cos(a) * (2 + hash1(i, 2) * 2) - 0.8, 0, Math.sin(a) * (1.6 + hash1(i, 3) * 1.8) + 1);
      sh.root.rotation.y = hash1(i, 4) * 6;
      this.sheep.push(sh);
      s.add(sh.root);
    }
    s.add(this.puffs.mesh, this.sparks.points);
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  enter(): void {
    this.puffs.clear();
    this.sparks.clear();
    // wool puffs as each letter lands
    for (let i = 0; i < 9; i++) this.sparks.burst(0.3 + i * 0.09, new THREE.Vector3(-6 + i * 1.5, 7, 4), 10, { color: [C.white, C.mist, C.gold], speed: 3, life: 0.8, intensity: 1.2, seed: 70 + i });
  }

  /** "AUTOSHEEP" in fat wool letters: white fill, cool shading, ink outline, drop shadow. */
  private buildLogo(): HTMLCanvasElement {
    const f = this.ctx.fonts.mega;
    const text = 'AUTOSHEEP';
    const w = f.measure(text, 2) + 16, h = 100;
    const [c, g] = offscreen(w, h);
    const [fill, fg] = offscreen(w, h);
    f.draw(fg, text, 8, 8, { color: C.white, spacing: 2 });
    // shade the lower half of the letters
    fg.globalCompositeOperation = 'source-atop';
    rect(fg, 0, 8 + Math.round(f.ascent * 0.55), w, 60, C.mist);
    rect(fg, 0, 8 + Math.round(f.ascent * 0.85), w, 60, C.fog);
    // a fluffy scalloped highlight line
    for (let x = 0; x < w; x += 6) rect(fg, x, 10 + ((x / 6) % 2), 4, 2, C.white);
    // outline + shadow
    for (const [dx, dy, col] of [[3, 4, C.black], [2, 3, C.black]] as const) f.draw(g, text, 8 + dx, 8 + dy, { color: col, spacing: 2 });
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3) f.draw(g, text, 8 + dx, 8 + dy, { color: C.ink, spacing: 2 });
    g.drawImage(fill, 0, 0);
    return c;
  }

  update(shot: Shot, t: number, T: number): void {
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = T;
    const yaw = Math.PI / 4 + t * 0.06;
    const pitch = 0.55, d = 60;
    this.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, 1.5 + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    this.camera.zoom = lerp(1.0, 1.08, clamp(t / 12));
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 2.2, 0);
    this.sheep.forEach((sh, i) => {
      const cyc = (T * 0.4 + i * 0.7) % 3;
      sh.graze = cyc < 2 ? 1 : 0;
      sh.bleat = i === 2 && t > shot.marks.baa && t < shot.marks.baa + 1.1 ? 1 : 0;
      if (sh.bleat) sh.graze = 0;
      sh.blink = (T + i) % 3.3 < 0.12 ? 1 : 0;
      sh.update();
    });
    const g = this.gafoop;
    g.armL.swing = 0.9;
    g.armL.curl = 0.05;
    g.armR.swing = -0.6;
    g.look.set(0.3, 0.4);
    g.squash = -0.04;
    g.blink = T % 3.6 < 0.12 ? 1 : 0;
    g.mouth = 0;
    g.update(T);
    this.puffs.update(t);
    this.sparks.update(t);
  }

  overlay(g: CanvasRenderingContext2D, shot: Shot, t: number, T: number): void {
    const f = this.ctx.fonts;
    if (!this.logo) this.logo = this.buildLogo();
    const logo = this.logo;
    // letters drop in one by one
    const lw = logo.width;
    const x0 = Math.round(240 - lw / 2);
    const letters = 9;
    const cw = lw / letters;
    for (let i = 0; i < letters; i++) {
      const k = clamp((t - 0.15 - i * 0.07) / 0.45);
      if (k <= 0) continue;
      const y = Math.round(lerp(-90, 18, easeOutBack(k, 2.2)) + (k >= 1 ? Math.sin(T * 3 + i * 0.7) * 1.5 : 0));
      g.drawImage(logo, Math.floor(i * cw), 0, Math.ceil(cw), logo.height, x0 + Math.floor(i * cw), y, Math.ceil(cw), logo.height);
    }
    const sub = clamp((t - 1.3) / 0.5);
    if (sub > 0) {
      const y = 106;
      const text = 'A SHEEP-HERDING AUTOMATION GAME';
      const w = f.small.measure(text) + 16;
      rect(g, 240 - w / 2, y - 3, w, 13, C.ink);
      f.small.draw(g, text.slice(0, Math.ceil(text.length * easeOutCubic(sub))), 240 - w / 2 + 8, y, { color: C.straw });
    }
    if (t > shot.marks.press && Math.floor(T * 2) % 2 === 0) {
      f.body.draw(g, 'PRESS ANY KEY', 240, 236, { color: C.white, align: 'center', outline: C.black });
    }
    if (t > 2.2) {
      const line = 'STARRING GENERAL GAFOOP AND 1.2 BILLION SHEEP (APPROX.)';
      const w = f.tiny.measure(line) + 10;
      rect(g, 240 - w / 2, 120, w, 11, C.black);
      f.tiny.draw(g, line, 240, 122, { color: C.lilac, align: 'center' });
    }
  }
}
