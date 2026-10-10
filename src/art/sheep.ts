import * as THREE from 'three';
import { toon } from '../engine/toon';
import { blob, merged, mesh } from './geo';
import { Rng } from '../engine/rng';
import { C } from '../engine/palette';

/**
 * A cartoon sheep built from primitives: a cloud of wool puffs, a dark face with floppy
 * ears and a white tuft, four stick legs. Faces +Z. About 1 unit long, 0.95 tall.
 */
export class Sheep {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly jaw: THREE.Mesh;
  readonly legs: THREE.Mesh[] = [];
  private eyes: THREE.Mesh[] = [];
  private ears: THREE.Mesh[] = [];
  /** walk cycle phase (radians) and amount 0..1 */
  walkPhase = 0;
  walk = 0;
  graze = 0; // 0..1 head down
  bleat = 0; // 0..1 mouth open + head up
  blink = 0; // 0..1
  lookYaw = 0;
  bounce = 0;

  /** @param detail  subdivision of the wool puffs: 2 for close-ups, 1 for the game's flocks */
  constructor(seed = 1, wool: string = C.white, face: string = C.ink, detail = 2) {
    const rng = new Rng(seed);
    // fewer segments on the small round parts when the sheep is only a few dozen pixels big
    const sphere = (r: number, w: number, h: number) =>
      new THREE.SphereGeometry(r, detail >= 2 ? w : Math.max(5, Math.ceil(w * 0.7)), detail >= 2 ? h : Math.max(3, Math.ceil(h * 0.7)));
    const woolMat = toon(wool);
    const faceMat = toon(face);
    const puffs = [] as { g: THREE.BufferGeometry; p: [number, number, number] }[];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const ring = i % 2 === 0 ? 0.24 : 0.18;
      puffs.push({ g: blob(rng.range(0.2, 0.25), detail, 0.06, seed * 31 + i), p: [Math.cos(a) * ring, 0.6 + Math.sin(a) * 0.14 + rng.range(-0.02, 0.05), rng.range(-0.34, 0.34)] });
    }
    puffs.push({ g: blob(0.3, detail, 0.05, seed + 7), p: [0, 0.64, 0.05] });
    puffs.push({ g: blob(0.27, detail, 0.05, seed + 8), p: [0, 0.66, -0.2] });
    puffs.push({ g: blob(0.24, detail, 0.05, seed + 9), p: [0, 0.6, 0.28] });
    puffs.push({ g: blob(0.12, 1, 0.05, seed + 10), p: [0, 0.68, -0.52] }); // tail
    const woolMesh = mesh(merged(puffs), woolMat);
    this.body.add(woolMesh);

    // head: elongated dark muzzle
    const headGeo = merged([
      { g: sphere(0.16, 10, 8), p: [0, 0, 0], s: [0.9, 1, 1.15] },
      { g: sphere(0.12, 10, 8), p: [0, -0.04, 0.13], s: [0.85, 0.85, 1] },
    ]);
    const headMesh = mesh(headGeo, faceMat);
    this.head.add(headMesh);
    // a slightly lighter muzzle with nostrils
    this.head.add(mesh(sphere(0.085, 8, 6), toon(C.coal), [0, -0.035, 0.22], undefined, [1, 0.8, 0.7]));
    for (const sx of [-1, 1]) this.head.add(mesh(sphere(0.014, 4, 3), toon(C.black), [sx * 0.03, -0.01, 0.275]));
    // jaw (opens for bleats)
    this.jaw = mesh(sphere(0.075, 8, 6), faceMat, [0, -0.1, 0.12], undefined, [1, 0.5, 1.3]);
    this.head.add(this.jaw);
    // wool tuft
    this.head.add(mesh(blob(0.11, 1, 0.1, seed + 11), woolMat, [0, 0.13, -0.02]));
    // ears
    for (const side of [-1, 1]) {
      const ear = mesh(sphere(0.07, 8, 6), faceMat, [side * 0.16, 0.03, -0.03], [0, 0, side * 0.5], [1.5, 0.45, 0.8]);
      ear.add(mesh(sphere(0.05, 6, 4), toon(C.rose), [0, -0.015, 0.02], undefined, [1, 0.5, 0.8]));
      this.ears.push(ear);
      this.head.add(ear);
      const eye = mesh(sphere(0.048, 8, 6), toon(C.white), [side * 0.095, 0.05, 0.095]);
      const pupil = mesh(sphere(0.027, 6, 4), toon(C.black), [side * 0.008, 0, 0.033]);
      eye.add(pupil);
      this.eyes.push(eye);
      this.head.add(eye);
    }
    this.head.position.set(0, 0.72, 0.5);
    this.body.add(this.head);

    // legs
    const legGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.42, 6);
    legGeo.translate(0, -0.21, 0);
    for (const [x, z] of [[-0.15, 0.24], [0.15, 0.24], [-0.15, -0.24], [0.15, -0.24]]) {
      const leg = mesh(legGeo, faceMat, [x, 0.46, z]);
      this.legs.push(leg);
      this.root.add(leg);
    }
    this.root.add(this.body);
  }

  update(): void {
    const w = this.walk;
    const ph = this.walkPhase;
    this.legs.forEach((leg, i) => {
      const diag = i === 0 || i === 3 ? 0 : Math.PI;
      leg.rotation.x = Math.sin(ph + diag) * 0.55 * w;
    });
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * w + this.bounce;
    this.body.rotation.z = Math.sin(ph) * 0.03 * w;
    const down = this.graze;
    const up = this.bleat;
    this.head.position.set(0, 0.72 - down * 0.38 + up * 0.04, 0.5 + down * 0.06);
    this.head.rotation.set(down * 0.9 - up * 0.45, this.lookYaw, 0);
    this.jaw.position.y = -0.1 - up * 0.06;
    this.jaw.rotation.x = up * 0.5;
    const eyeS = 1 - this.blink * 0.85;
    for (const e of this.eyes) e.scale.set(1, eyeS, 1);
    this.ears.forEach((ear, i) => (ear.rotation.z = (i ? 1 : -1) * (0.5 + up * 0.3 + Math.sin(ph * 0.5) * 0.08 * w)));
  }
}
