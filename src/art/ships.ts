import * as THREE from 'three';
import { toon, glow, noOutline } from '../engine/toon';
import { mesh } from './geo';
import { C } from '../engine/palette';
import { Rng } from '../engine/rng';

/** Lathe profile helper: points as [radius, height]. */
function lathe(points: [number, number][], segments = 24): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segments);
}

/** A classic flying saucer with a glass dome, running lights and an under-glow. */
export class Saucer {
  readonly root = new THREE.Group();
  readonly hull = new THREE.Group();
  private lights: THREE.Mesh[] = [];
  readonly beam: THREE.Mesh;
  readonly under: THREE.Mesh;
  beamOn = 0;
  t = 0;

  constructor(seed = 1, hullColor: string = C.mist) {
    const hull = toon(hullColor);
    const trim = toon(C.fog);
    this.hull.add(mesh(lathe([[0.02, -0.18], [0.55, -0.12], [1.15, -0.02], [1.2, 0.02], [0.8, 0.12], [0.45, 0.2], [0.02, 0.22]]), hull));
    this.hull.add(mesh(new THREE.TorusGeometry(1.17, 0.045, 6, 32), trim, [0, 0, 0], [Math.PI / 2, 0, 0]));
    this.hull.add(mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.ice, { emissive: C.mint, emissiveIntensity: 0.25 }), [0, 0.18, 0]));
    // little pilot silhouette in the dome
    this.hull.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(C.meadow), [0, 0.32, 0.05]));
    const rng = new Rng(seed);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const l = mesh(new THREE.SphereGeometry(0.06, 6, 4), glow(C.gold, 2.2), [Math.cos(a) * 1.0, -0.06, Math.sin(a) * 1.0]);
      noOutline(l);
      this.lights.push(l);
      this.hull.add(l);
    }
    void rng;
    this.under = noOutline(mesh(new THREE.CircleGeometry(0.42, 20), glow(C.mint, 2.5), [0, -0.19, 0], [Math.PI / 2, 0, 0]));
    this.hull.add(this.under);
    this.root.add(this.hull);

    const beamGeo = new THREE.CylinderGeometry(0.35, 1.2, 1, 20, 1, true);
    beamGeo.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(beamGeo, glow(C.mint, 1.4, { transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.y = -0.18;
    this.beam.visible = false;
    noOutline(this.beam);
    this.root.add(this.beam);
  }

  /** Point the beam at a ground height (world y of the saucer minus ground). */
  setBeam(on: number, length: number): void {
    this.beam.visible = on > 0.01;
    this.beam.scale.set(0.3 + on * 0.7, length, 0.3 + on * 0.7);
  }

  update(time: number): void {
    this.t = time;
    const k = Math.floor(this.t * 8);
    this.lights.forEach((l, i) => {
      const on = (i + k) % 3 === 0;
      ((l.material as THREE.MeshBasicMaterial).color as THREE.Color).set(on ? C.lemon : C.amber).multiplyScalar(on ? 2.6 : 0.9);
    });
    this.hull.rotation.y = this.t * 0.6;
  }
}

/**
 * The Blorxian flagship: a tiered disc with a command spire, light strips, antennae, and
 * engine glow. Unit radius ~10.
 */
export class Mothership {
  readonly root = new THREE.Group();
  private blinkers: THREE.Mesh[] = [];
  private windows: THREE.InstancedMesh;
  t = 0;
  constructor() {
    const hull = toon(C.fog);
    const dark = toon(C.lilac);
    const accent = toon(C.plum);
    this.root.add(mesh(lathe([[0.1, -1.6], [3, -1.4], [7, -0.8], [10, -0.2], [10.3, 0.2], [9.6, 0.5], [6, 1.0], [3.5, 1.5], [0.1, 1.6]], 48), hull));
    this.root.add(mesh(new THREE.TorusGeometry(10.15, 0.25, 6, 64), dark, [0, 0, 0], [Math.PI / 2, 0, 0]));
    // upper tiers + spire
    this.root.add(mesh(lathe([[0.1, 1.4], [4, 1.5], [3.6, 2.4], [2.2, 2.9], [0.1, 3.0]], 32), dark));
    this.root.add(mesh(lathe([[0.1, 2.9], [1.6, 3.0], [1.2, 4.2], [0.5, 5.0], [0.1, 7.5]], 16), hull));
    this.root.add(mesh(new THREE.SphereGeometry(0.6, 12, 8), glow(C.hotPink, 2.5), [0, 4.3, 0]));
    // underside engines
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const e = mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 12), accent, [Math.cos(a) * 5.5, -1.3, Math.sin(a) * 5.5]);
      this.root.add(e);
      this.root.add(noOutline(mesh(new THREE.CircleGeometry(0.8, 12), glow(C.mint, 3), [Math.cos(a) * 5.5, -1.62, Math.sin(a) * 5.5], [Math.PI / 2, 0, 0])));
    }
    // antennae and dishes
    const rng = new Rng(9);
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(4, 9);
      const h = rng.range(0.6, 2.2);
      const y = r < 6 ? 1.2 : 0.5;
      this.root.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 4), dark, [Math.cos(a) * r, y + h / 2, Math.sin(a) * r]));
      const tip = noOutline(mesh(new THREE.SphereGeometry(0.15, 6, 4), glow(C.scarlet, 2.5), [Math.cos(a) * r, y + h, Math.sin(a) * r]));
      this.blinkers.push(tip);
      this.root.add(tip);
      if (i % 4 === 0) this.root.add(mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), toon(C.mist, { side: THREE.DoubleSide }), [Math.cos(a) * (r - 1), y + 0.6, Math.sin(a) * (r - 1)], [Math.PI, 0, 0.6]));
    }
    // a band of lit windows around the rim
    const n = 120;
    this.windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), glow(C.lemon, 1.8), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      m.makeRotationY(-a + Math.PI / 2);
      m.setPosition(Math.cos(a) * 9.75, 0.25, Math.sin(a) * 9.75);
      this.windows.setMatrixAt(i, m);
    }
    noOutline(this.windows);
    this.root.add(this.windows);
    // hull panel lines (dark rings)
    for (const r of [4.5, 7.2]) this.root.add(mesh(new THREE.TorusGeometry(r, 0.06, 4, 48), dark, [0, r > 5 ? 0.62 : 1.08, 0], [Math.PI / 2, 0, 0]));
  }
  update(time: number): void {
    this.t = time;
    this.blinkers.forEach((b, i) => (b.visible = Math.floor(this.t * 2 + i * 0.37) % 2 === 0));
  }
}

/** Blorxian escape pod: a teardrop with fins and a porthole. */
export class Pod {
  readonly root = new THREE.Group();
  readonly hatch: THREE.Group;
  constructor() {
    const hull = toon(C.mist);
    this.root.add(mesh(lathe([[0.01, -0.6], [0.3, -0.5], [0.48, -0.15], [0.5, 0.15], [0.38, 0.5], [0.15, 0.75], [0.01, 0.8]], 18), hull));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.root.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.35), toon(C.scarlet), [Math.cos(a) * 0.45, -0.4, Math.sin(a) * 0.45], [0, -a, 0]));
    }
    this.root.add(mesh(new THREE.TorusGeometry(0.49, 0.04, 6, 20), toon(C.plum), [0, 0.1, 0], [Math.PI / 2, 0, 0]));
    this.hatch = new THREE.Group();
    this.hatch.position.set(0, 0.25, 0.42);
    this.hatch.add(mesh(new THREE.CircleGeometry(0.2, 14), toon(C.ice, { emissive: C.mint, emissiveIntensity: 0.3 }), [0, 0, 0.02]));
    this.hatch.add(mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 14), toon(C.fog)));
    this.root.add(this.hatch);
  }
}
