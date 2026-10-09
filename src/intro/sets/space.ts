import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { Planet, starfield, nebula } from '../../art/earth';
import { Mothership, Saucer } from '../../art/ships';
import { toon } from '../../engine/toon';
import { C } from '../../engine/palette';
import { clamp, easeInOut, easeOutBack, easeOutCubic, lerp, smooth, window01 } from '../../engine/rng';
import { panel, ditherOut, rect, drawRotated, offscreen } from '../../engine/ui';
import { drawSprite } from '../../engine/sprites';
import { mesh } from '../../art/geo';

/** Space: the almanac title, Earth, and the arrival of the Blorxian armada. */
export class SpaceSet implements StageSet {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 480 / 270, 0.1, 2000);
  post = { depthAbs: 0.2, depthRel: 0.02, outline: 0.6, highlight: 0.25, bloom: 1.1, bloomThreshold: 1.3 };
  private earth = new Planet(3);
  private moon: THREE.Mesh;
  private stars = starfield(1800, 600, 3);
  private mother = new Mothership();
  private fleet: Saucer[] = [];
  private sun = new THREE.DirectionalLight(0xffffff, 1.0);

  constructor(private ctx: StageContext) {
    const s = this.scene;
    s.add(nebula(700), this.stars);
    s.add(this.earth.root);
    this.moon = mesh(new THREE.IcosahedronGeometry(0.8, 2), toon(C.fog), [9, 2, -6]);
    s.add(this.moon);
    this.sun.position.set(-8, 3, 6);
    s.add(this.sun, new THREE.AmbientLight(0x8890c0, 0.18));
    this.earth.setSun(this.sun.position);
    s.add(this.mother.root);
    for (let i = 0; i < 12; i++) {
      const sc = new Saucer(i + 1);
      sc.root.scale.setScalar(0.35);
      this.fleet.push(sc);
      s.add(sc.root);
    }
  }

  enter(): void {
  }

  update(shot: Shot, t: number, T: number): void {
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = T;
    this.earth.surface.rotation.y = T * 0.04 + 1.2;
    this.earth.clouds.rotation.y = T * 0.055 + 1.2;
    this.mother.update(T);
    for (const f of this.fleet) f.update(T);
    const cam = this.camera;

    if (shot.name === 'open') {
      this.mother.root.visible = false;
      this.fleet.forEach((f) => (f.root.visible = false));
      // a long, slow push in from the deep field toward the planet
      const k = easeInOut(clamp(t / (shot.end - shot.start)));
      const from = new THREE.Vector3(14, 3.5, 34);
      const to = new THREE.Vector3(-3.5, 1.2, 10.5);
      cam.position.lerpVectors(from, to, k);
      cam.fov = lerp(28, 40, k);
      cam.updateProjectionMatrix();
      cam.lookAt(lerp(0, 1.5, k), lerp(0, 0.2, k), 0);
    } else {
      // armada: first the flagship slides overhead, then a wide shot of the fleet forming up
      this.mother.root.visible = true;
      const fleetT = shot.marks.fleet;
      if (t < fleetT) {
        const k = t / fleetT;
        cam.position.set(0, -0.5, 16);
        cam.fov = 55;
        cam.updateProjectionMatrix();
        cam.lookAt(0, 1.8, 0);
        // the ship's belly sweeps in over the camera and glides on toward the planet
        const kk = easeOutCubic(k);
        this.mother.root.position.set(0, lerp(6.4, 3.8, kk), lerp(30, -6, kk));
        this.mother.root.rotation.set(0.06, k * 0.4, 0);
        this.mother.root.scale.setScalar(1);
        this.fleet.forEach((f) => (f.root.visible = false));
      } else {
        const u = t - fleetT;
        const k = clamp(u / (shot.end - shot.start - fleetT));
        cam.position.set(lerp(-26, -22, k), lerp(9, 7.5, k), lerp(20, 17, k));
        cam.fov = 32;
        cam.updateProjectionMatrix();
        cam.lookAt(2, 3.0, 0);
        this.mother.root.position.set(6, 5.6, -4);
        this.mother.root.rotation.set(0.15, u * 0.05, 0.05);
        this.mother.root.scale.setScalar(0.55);
        this.fleet.forEach((f, i) => {
          f.root.visible = true;
          const row = Math.floor(i / 4), col = i % 4;
          const arrive = easeOutBack(clamp((u - i * 0.12) / 1.6), 1.2);
          const slot = new THREE.Vector3(-2 + col * 2.2 - row * 1.1, 4.2 - row * 1.3 + Math.sin(T * 2 + i) * 0.08, 1 + row * 1.6);
          const start = new THREE.Vector3(6, 5.6, -4);
          f.root.position.lerpVectors(start, slot, arrive);
          f.root.scale.setScalar(0.35 * Math.min(1, arrive * 1.5));
          f.root.rotation.z = Math.sin(T * 1.5 + i) * 0.08;
        });
      }
    }
  }

  overlay(g: CanvasRenderingContext2D, shot: Shot, t: number): void {
    const f = this.ctx.fonts;
    if (shot.name === 'open') {
      // --- the almanac title card ---
      const a = shot.marks.title, b = shot.marks.earth - 0.2;
      if (t > a - 0.1 && t < b + 0.8) {
        const vis = window01(t, a, a + 0.6) * (1 - window01(t, b, b + 0.6));
        const w = 300, h = 84, x = 90, y = 70;
        panel(g, x, y, w, h, { fill: C.ink, border: C.straw, accent: C.gold });
        f.small.draw(g, 'THE UNIVERSAL ALMANAC OF', 240, y + 10, { color: C.straw, align: 'center' });
        f.title.draw(g, 'REGRETTABLE DECISIONS', 240, y + 22, { color: C.gold, align: 'center', shadow: C.wine });
        rect(g, x + 30, y + 48, w - 60, 1, C.rust);
        f.small.draw(g, 'ENTRY 9,000,001 : EARTH', 240, y + 54, { color: C.mist, align: 'center' });
        f.tiny.draw(g, '(MOSTLY DAMP)', 240, y + 67, { color: C.fog, align: 'center' });
        drawSprite(g, 'star', x + 10, y + 32, 1);
        drawSprite(g, 'star', x + w - 22, y + 32, 1);
        ditherOut(g, x - 2, y - 2, w + 6, h + 6, 1 - vis);
      }
      // --- the "achievements of the apes" checklist ---
      const items: [string, string, string][] = [['fire', 'FIRE', 'flame'], ['wheel', 'THE WHEEL', 'wheel'], ['democracy', 'DEMOCRACY', 'ballot'], ['cats', 'CAT VIDEOS', 'cat']];
      const start = shot.marks.N02 + 1.8;
      if (t > start) {
        const vis = window01(t, start, start + 0.5) * (1 - window01(t, shot.end - shot.start - 0.7, shot.end - shot.start - 0.2));
        const x = 300, y = 40, w = 160, h = 128;
        panel(g, x, y, w, h, { fill: C.ink, border: C.mist });
        f.small.draw(g, 'SPECIES: CLEVER APES', x + 8, y + 7, { color: C.straw });
        f.tiny.draw(g, 'NOTABLE ACHIEVEMENTS:', x + 8, y + 19, { color: C.fog });
        items.forEach(([mark, label, icon], i) => {
          const mt = shot.marks[mark] - 0.15;
          if (t < mt) return;
          const pop = easeOutBack(clamp((t - mt) / 0.25), 3);
          const yy = y + 31 + i * 18;
          drawSprite(g, icon, x + 8, yy, 1);
          f.small.draw(g, label, x + 26, yy + 3, { color: C.white });
          const [cs] = offscreen(12, 12);
          drawSprite(cs.getContext('2d')!, 'check', 0, 0);
          drawRotated(g, cs, x + w - 16, yy + 6, 0, Math.max(0.01, pop));
        });
        if (t > shot.marks.fine) {
          const k = clamp((t - shot.marks.fine) / 0.18);
          const sc = lerp(3, 1, easeOutCubic(k));
          const [st, sg] = offscreen(110, 22);
          sg.fillStyle = C.scarlet;
          sg.fillRect(0, 0, 110, 22);
          sg.fillStyle = C.ink;
          sg.fillRect(2, 2, 106, 18);
          f.title.draw(sg, 'STATUS: FINE', 55, 0, { color: C.scarlet, align: 'center' });
          drawRotated(g, st, x + w / 2, y + h - 12, -0.12, sc);
        }
        ditherOut(g, x - 2, y - 2, w + 6, h + 6, 1 - vis);
      }
    } else {
      // "famous for three things"
      const marks: [string, string][] = [['one', '1. AN INVINCIBLE WAR FLEET'], ['two', '2. PAPERWORK (DEEP LOVE OF)'], ['three', '3. GENERAL GAFOOP']];
      const t0 = shot.marks.one - 0.6;
      if (t > t0) {
        const x = 18, y = 20, w = 208, h = 70;
        const vis = window01(t, t0, t0 + 0.4);
        panel(g, x, y, w, h, { fill: C.ink, border: C.lavender, accent: C.violet });
        f.small.draw(g, 'THE BLORXIAN HEGEMONY', x + 8, y + 7, { color: C.lavender });
        f.tiny.draw(g, 'FAMOUS THROUGHOUT THE GALAXY FOR:', x + 8, y + 18, { color: C.fog });
        marks.forEach(([m, label], i) => {
          if (t < shot.marks[m] - 0.1) return;
          const k = smooth((t - shot.marks[m] + 0.1) / 0.2);
          const col = i === 2 ? C.lime : C.white;
          f.small.draw(g, label.slice(0, Math.ceil(label.length * k)), x + 10, y + 31 + i * 12, { color: col });
        });
        ditherOut(g, x - 2, y - 2, w + 6, h + 6, 1 - vis);
      }
    }
  }

  fx(shot: Shot, t: number) {
    if (shot.name === 'armada' && t < shot.marks.fleet) {
      const k = clamp(t / shot.marks.fleet);
      const s = Math.sin(t * 40) * (1 - k) * 0.6;
      return { shake: [s, Math.cos(t * 33) * (1 - k) * 0.6] as [number, number], bars: 16 };
    }
    return { bars: shot.name === 'armada' ? 16 : 0 };
  }
}
