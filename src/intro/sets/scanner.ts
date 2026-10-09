import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { Sheep } from '../../art/sheep';
import { Human, knittingProp } from '../../art/human';
import { barn, pickupTruck, fence, tree } from '../../art/props';
import { PuffSystem } from '../../art/fx';
import { toon } from '../../engine/toon';
import { C, SCANNER } from '../../engine/palette';
import { clamp, lerp, smooth, window01 } from '../../engine/rng';
import { mesh } from '../../art/geo';
import { rect, frame, ditherFill } from '../../engine/ui';

interface Station {
  key: string;
  label: string;
  cam: [number, number, number];
  look: [number, number, number];
  sheep: Sheep[];
  human: Human;
}

/** The ship's scanner: green phosphor vignettes of humans serving sheep, with a targeting HUD. */
export class ScannerSet implements StageSet {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 480 / 270, 0.1, 300);
  palette = SCANNER;
  post = { depthAbs: 0.05, depthRel: 0.02, outline: 0.8, highlight: 0.5, dither: 1, bloom: 0.4, bloomThreshold: 1.5 };
  private stations: Station[] = [];
  private truck: THREE.Group;
  private puffs = new PuffSystem(120);
  private shorn: Sheep;
  private reticles: { obj: THREE.Object3D; label: string }[] = [];

  constructor(private ctx: StageContext, _country?: unknown) {
    const s = this.scene;
    s.background = new THREE.Color(SCANNER[0]);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(-5, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 10, bottom: -10 });
    s.add(sun, new THREE.HemisphereLight(0xffffff, 0x445544, 0.5));
    const ground = mesh(new THREE.PlaneGeometry(80, 30), toon(C.grass), [12, 0, 0], [-Math.PI / 2, 0, 0]);
    s.add(ground);
    // a grid floor overlay for that sensor-sweep look
    const grid = new THREE.GridHelper(80, 40, new THREE.Color(SCANNER[3]), new THREE.Color(SCANNER[2]));
    grid.position.set(12, 0.01, 0);
    grid.layers.set(1);
    s.add(grid);

    const mk = (key: string, label: string, x: number, human: Human, sheepN: number, cam: [number, number, number], look: [number, number, number]) => {
      const sh: Sheep[] = [];
      for (let i = 0; i < sheepN; i++) {
        const sp = new Sheep(200 + x + i);
        s.add(sp.root);
        sh.push(sp);
      }
      s.add(human.root);
      this.stations.push({ key, label, cam: [cam[0] + x, cam[1], cam[2]], look: [look[0] + x, look[1], look[2]], sheep: sh, human });
      return sh;
    };

    // 0 fed: farmer pouring feed into a trough
    const farmer = new Human('farmer');
    farmer.root.position.set(-1.2, 0, 0);
    farmer.root.rotation.y = 1.2;
    const fed = mk('fed', 'FED', 0, farmer, 2, [2.2, 1.8, 4.2], [0, 0.7, 0]);
    fed[0].root.position.set(0.4, 0, 0.6);
    fed[0].root.rotation.y = -1.6;
    fed[1].root.position.set(0.6, 0, -0.5);
    fed[1].root.rotation.y = -1.4;
    s.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 1.6), toon(C.rust), [-0.3, 0.15, 0]));
    farmer.prop.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.22, 10), toon(C.fog), [0, -0.12, 0]));

    // 1 groomed: the shearer at work, wool flying
    const shearer = new Human('shearer');
    shearer.root.position.set(10 - 0.6, 0, 0);
    shearer.root.rotation.y = 1.4;
    const gr = mk('groomed', 'GROOMED', 10, shearer, 1, [2.0, 1.6, 3.6], [0, 0.7, 0]);
    gr[0].root.position.set(10.3, 0, 0);
    gr[0].root.rotation.y = -0.4;
    this.shorn = gr[0];

    // 2 sheltered: sheep filing into a barn
    const host = new Human('farmer');
    host.root.position.set(20 + 1.8, 0, 1.6);
    host.root.rotation.y = -0.6;
    const b = barn();
    b.position.set(20, 0, -2.5);
    s.add(b);
    const sl = mk('sheltered', 'SHELTERED', 20, host, 3, [3.5, 2.6, 7.5], [0, 1.2, -1]);
    sl.forEach((sp, i) => {
      sp.root.position.set(20 - 0.3 + i * 0.3, 0, 2.2 + i * 1.2);
      sp.root.rotation.y = Math.PI;
    });

    // 3 chauffeured: sheep riding in the back of a pickup
    const driver = new Human('driver');
    this.truck = pickupTruck(C.sky);
    this.truck.position.set(30, 0, 0);
    this.truck.rotation.y = Math.PI / 2;
    s.add(this.truck);
    const ch = mk('chauffeured', 'CHAUFFEURED', 30, driver, 2, [3.2, 2.2, 5.2], [0, 1.0, 0]);
    driver.root.visible = false;
    ch.forEach((sp, i) => {
      sp.root.scale.setScalar(0.75);
      this.truck.add(sp.root);
      sp.root.position.set(i ? 0.3 : -0.3, 0.75, -0.5 - i * 0.6);
      sp.root.rotation.y = i ? 0.3 : -0.2;
    });
    // trees streaming past
    for (let i = 0; i < 6; i++) {
      const t = tree(70 + i, 0.8);
      t.position.set(26 + i * 3.2, 0, -4);
      t.name = 'passing';
      s.add(t);
    }
    s.add(fence([new THREE.Vector2(24, 2.5), new THREE.Vector2(38, 2.5)], () => 0));

    // 4 devotion: a human in a wool jumper kneels before a sheep, knitting
    const knitter = new Human('knitter');
    knitter.root.position.set(40 - 0.6, -0.35, 0.4);
    knitter.root.rotation.y = 1.0;
    knitter.body.rotation.x = 0.35;
    knitter.prop.add(knittingProp());
    const dv = mk('devotion', 'DEVOTION', 40, knitter, 1, [1.6, 1.4, 3.6], [0, 0.9, 0]);
    s.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), toon(C.mist), [40.5, 0.25, -0.1]));
    dv[0].root.position.set(40.5, 0.5, -0.1);
    dv[0].root.rotation.y = -0.9;

    s.add(this.puffs.mesh);
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  enter(shot: Shot): void {
    this.puffs.clear();
    // wool flying off the shearer's clippers
    const at = new THREE.Vector3(10.2, 0.8, 0.3);
    for (let i = 0; i < 18; i++) this.puffs.burst(shot.marks.groomed - 0.2 + i * 0.12, at, 2, { color: [C.white], size: 0.12, speed: 1.5, up: 1.4, grav: 2.5, life: 1.2, seed: 400 + i, grow: 1 });
  }

  private stationAt(t: number, m: Record<string, number>): number {
    const order = ['fed', 'groomed', 'sheltered', 'chauffeured', 'devotion'];
    let idx = 0;
    order.forEach((k, i) => {
      if (t >= m[k] - 0.15) idx = i;
    });
    return idx;
  }

  update(shot: Shot, t: number, T: number): void {
    const m = shot.marks;
    const idx = this.stationAt(t, m);
    const st = this.stations[idx];
    const keys = ['fed', 'groomed', 'sheltered', 'chauffeured', 'devotion'];
    const t0 = idx === 0 ? 0 : m[keys[idx]] - 0.15;
    const k = smooth((t - t0) / 3);
    this.camera.position.set(lerp(st.cam[0], st.cam[0] - 0.4, k), st.cam[1], lerp(st.cam[2], st.cam[2] - 0.5, k));
    this.camera.lookAt(...st.look);

    for (const s of this.stations) {
      s.human.phase = T * 6;
      s.human.run = 0;
      s.human.update();
      for (const sp of s.sheep) {
        sp.graze = s.key === 'fed' ? 1 : 0;
        sp.head.position.y += 0;
        sp.walk = 0;
        sp.update();
      }
    }
    // the fed sheep chew
    for (const sp of this.stations[0].sheep) sp.head.position.y += Math.sin(T * 10) * 0.02;
    this.stations[0].human.arms[1].rotation.x = -1.1 + Math.sin(T * 3) * 0.1;
    // the shearer works
    const sh = this.stations[1].human;
    sh.arms[1].rotation.x = -1.2 + Math.sin(T * 14) * 0.25;
    sh.arms[0].rotation.x = -0.8;
    sh.body.rotation.x = 0.4;
    const shorn = clamp((t - m.groomed) / 2.0);
    this.shorn.body.children[0].scale.set(1 - shorn * 0.25, 1 - shorn * 0.3, 1 - shorn * 0.2);
    // sheltered sheep walk into the barn
    this.stations[2].sheep.forEach((sp, i) => {
      const w = clamp((t - m.sheltered - i * 0.4) / 3);
      sp.root.position.z = 2.2 + i * 1.2 - w * 3;
      sp.walk = 1;
      sp.walkPhase = T * 8 + i;
      sp.update();
    });
    this.stations[2].human.wave = 1;
    this.stations[2].human.update();
    // the truck bounces along; trees slide by
    this.truck.position.y = Math.abs(Math.sin(T * 9)) * 0.04;
    let n = 0;
    this.scene.children.forEach((o) => {
      if (o.name === 'passing') {
        o.position.x = 25 + (((n * 3.2 - T * 6) % 19) + 19) % 19;
        n++;
      }
    });
    // the devotee bows
    const kn = this.stations[4].human;
    kn.body.rotation.x = 0.35 + Math.max(0, Math.sin(T * 2.5)) * 0.35;
    kn.arms[0].rotation.x = -1.2;
    kn.arms[1].rotation.x = -1.2;
    this.puffs.update(t);
    this.reticles = [
      { obj: st.sheep[0].root, label: 'SUBJ. A: WOOLLY QUADRUPED' },
      { obj: st.key === 'chauffeured' ? this.truck : st.human.root, label: st.key === 'chauffeured' ? 'SUBJ. B: BIPED (DRIVING)' : 'SUBJ. B: HAIRLESS BIPED' },
    ];
  }

  private project(o: THREE.Object3D, yOff = 0.6): [number, number] {
    const p = o.getWorldPosition(new THREE.Vector3());
    p.y += yOff;
    p.project(this.camera);
    return [Math.round((p.x * 0.5 + 0.5) * 480), Math.round((-p.y * 0.5 + 0.5) * 270)];
  }

  overlay(g: CanvasRenderingContext2D, shot: Shot, t: number, T: number): void {
    const f = this.ctx.fonts;
    const G = SCANNER;
    const m = shot.marks;
    // frame & header
    frame(g, 6, 6, 468, 258, G[3]);
    for (const [x, y, dx, dy] of [[6, 6, 1, 1], [473, 6, -1, 1], [6, 263, 1, -1], [473, 263, -1, -1]]) {
      rect(g, x, y, dx * 10, dy * 2, G[5]);
      rect(g, x, y, dx * 2, dy * 10, G[5]);
    }
    rect(g, 6, 6, 468, 13, G[1]);
    f.small.draw(g, 'BLORX-O-SCAN 9000  //  DOMINANT SPECIES ANALYSIS', 12, 9, { color: G[5] });
    f.small.draw(g, `T+${(T % 100).toFixed(2)}`, 468, 9, { color: G[4], align: 'right' });
    // sweep line
    const sweep = Math.floor(((T * 90) % 250) + 19);
    rect(g, 7, sweep, 466, 1, G[3]);

    // reticles
    for (const r of this.reticles) {
      const [x, y] = this.project(r.obj, 0.7);
      const s = 18 + Math.round(Math.sin(T * 6) * 2);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        rect(g, x + dx * s - (dx > 0 ? 5 : 0), y + dy * s, 6, 1, G[5]);
        rect(g, x + dx * s, y + dy * s - (dy > 0 ? 5 : 0), 1, 6, G[5]);
      }
      const w = f.tiny.measure(r.label) + 6;
      rect(g, x - s, y - s - 11, w, 9, G[1]);
      f.tiny.draw(g, r.label, x - s + 3, y - s - 10, { color: G[5] });
    }

    // findings panel
    const px = 330, py = 30;
    ditherFill(g, px, py, 136, 112, G[0], 0.75);
    frame(g, px, py, 136, 112, G[3]);
    f.tiny.draw(g, 'OBSERVED BEHAVIOUR', px + 6, py + 5, { color: G[4] });
    const order: [string, string][] = [['fed', 'FED'], ['groomed', 'GROOMED'], ['sheltered', 'SHELTERED'], ['chauffeured', 'CHAUFFEURED'], ['devotion', 'WORSHIPPED (WOOL)']];
    order.forEach(([k, label], i) => {
      if (t < m[k] - 0.1) return;
      const yy = py + 18 + i * 13;
      rect(g, px + 6, yy, 7, 7, G[5]);
      rect(g, px + 7, yy + 1, 5, 5, G[2]);
      f.small.draw(g, label, px + 17, yy, { color: t < (m[order[i + 1]?.[0]] ?? 99) - 0.1 ? G[5] : G[3] });
    });
    // servitude meter
    const meter = clamp((t - m.fed) / (m['C02.end'] - m.fed));
    f.tiny.draw(g, 'BIPED SERVITUDE INDEX', px + 6, py + 86, { color: G[4] });
    frame(g, px + 6, py + 96, 124, 8, G[3]);
    rect(g, px + 8, py + 98, Math.round(120 * meter), 4, G[5]);
    if (t > m['C02.end'] - 0.2) {
      const blink = Math.floor(T * 4) % 2 === 0;
      rect(g, 140, 200, 200, 20, G[1]);
      frame(g, 140, 200, 200, 20, G[5]);
      if (blink) f.small.draw(g, 'CONCLUSION PENDING...', 240, 207, { color: G[5], align: 'center' });
    }
    const caption = this.stations[this.stationAt(t, m)].label;
    rect(g, 12, 24, f.title.measure(caption) + 10, 22, G[1]);
    f.title.draw(g, caption, 17, 25, { color: G[5] });
    void window01;
  }

  fx() {
    return { scanlines: 0.6 };
  }
}
