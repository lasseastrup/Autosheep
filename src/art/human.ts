import * as THREE from 'three';
import { toon } from '../engine/toon';
import { mesh, blob } from './geo';
import { C } from '../engine/palette';

export type HumanKind = 'farmer' | 'jogger' | 'tourist' | 'suit' | 'shearer' | 'knitter' | 'driver';

interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  hat?: 'straw' | 'bucket' | 'cap' | 'headband';
  hatColor?: string;
}

const LOOKS: Record<HumanKind, Look> = {
  farmer: { skin: C.peach, hair: C.tan, shirt: C.scarlet, pants: C.blue, shoes: C.mud, hat: 'straw', hatColor: C.straw },
  jogger: { skin: C.tan, hair: C.ink, shirt: C.orange, pants: C.coal, shoes: C.white, hat: 'headband', hatColor: C.cherry },
  tourist: { skin: C.skin, hair: C.straw, shirt: C.mint, pants: C.khaki, shoes: C.rust, hat: 'bucket', hatColor: C.bone },
  suit: { skin: C.coral, hair: C.mud, shirt: C.navy, pants: C.navy, shoes: C.ink },
  shearer: { skin: C.peach, hair: C.rust, shirt: C.blue, pants: C.indigo, shoes: C.mud, hat: 'cap', hatColor: C.leaf },
  knitter: { skin: C.skin, hair: C.mist, shirt: C.hotPink, pants: C.violet, shoes: C.rust },
  driver: { skin: C.tan, hair: C.ink, shirt: C.gold, pants: C.blue, shoes: C.ink, hat: 'cap', hatColor: C.scarlet },
};

/**
 * A small stylised human, about 1.6 units tall (a sheep is ~0.95). Faces +Z. Limbs pivot at
 * hips and shoulders for walk/run cycles.
 */
export class Human {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly hat: THREE.Group | null = null;
  readonly legs: THREE.Group[] = [];
  readonly arms: THREE.Group[] = [];
  readonly shoes: THREE.Mesh[] = [];
  readonly prop = new THREE.Group(); // held in the right hand
  phase = 0;
  run = 0; // 0 idle, 0.5 walk, 1 run
  wave = 0;
  scared = 0;

  constructor(readonly kind: HumanKind) {
    const L = LOOKS[kind];
    const skin = toon(L.skin);
    const shirt = toon(L.shirt);
    const pants = toon(L.pants);
    // legs
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.1, 0.72, 0);
      leg.add(mesh(new THREE.CapsuleGeometry(0.075, 0.5, 3, 8), pants, [0, -0.32, 0]));
      const shoe = mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), toon(L.shoes), [0, -0.68, 0.04]);
      leg.add(shoe);
      this.shoes.push(shoe);
      this.legs.push(leg);
      this.root.add(leg);
    }
    // torso
    const torso = mesh(new THREE.CapsuleGeometry(0.18, 0.32, 4, 10), shirt, [0, 0.98, 0], undefined, [1, 1, 0.75]);
    this.body.add(torso);
    if (kind === 'farmer') {
      // overalls bib + straps
      this.body.add(mesh(new THREE.BoxGeometry(0.26, 0.24, 0.05), pants, [0, 0.95, 0.12]));
    }
    if (kind === 'suit') {
      this.body.add(mesh(new THREE.BoxGeometry(0.05, 0.28, 0.04), toon(C.scarlet), [0, 1.04, 0.14]));
      this.body.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.03), toon(C.white), [0, 1.2, 0.13]));
    }
    if (kind === 'tourist') {
      // hawaiian flowers
      for (const [x, y] of [[-0.08, 1.05], [0.09, 0.92], [0.02, 1.15]]) this.body.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), toon(C.hotPink), [x, y, 0.14]));
    }
    // arms
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.25, 1.2, 0);
      arm.add(mesh(new THREE.CapsuleGeometry(0.06, 0.42, 3, 8), shirt, [0, -0.25, 0]));
      arm.add(mesh(new THREE.SphereGeometry(0.065, 8, 6), skin, [0, -0.52, 0]));
      this.arms.push(arm);
      this.body.add(arm);
    }
    this.arms[1].add(this.prop);
    this.prop.position.set(0, -0.55, 0.05);
    // head
    this.head.position.set(0, 1.42, 0);
    this.head.add(mesh(new THREE.SphereGeometry(0.17, 14, 10), skin, [0, 0, 0], undefined, [1, 1.08, 1]));
    this.head.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), toon(C.coral), [0, -0.02, 0.17]));
    for (const s of [-1, 1]) this.head.add(mesh(new THREE.SphereGeometry(0.022, 6, 4), toon(C.ink), [s * 0.06, 0.03, 0.155]));
    const hair = mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(L.hair), [0, 0.02, -0.015], [-0.25, 0, 0]);
    this.head.add(hair);
    if (L.hat) {
      const hat = new THREE.Group();
      const hc = toon(L.hatColor ?? C.straw);
      if (L.hat === 'straw') {
        hat.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 16), hc));
        hat.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 12), hc, [0, 0.08, 0]));
        hat.add(mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.04, 12), toon(C.scarlet), [0, 0.03, 0]));
      } else if (L.hat === 'bucket') {
        hat.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.14, 12), hc, [0, 0.06, 0]));
      } else if (L.hat === 'cap') {
        hat.add(mesh(new THREE.SphereGeometry(0.185, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hc));
        hat.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), hc, [0, 0.0, 0.2]));
      } else if (L.hat === 'headband') {
        hat.add(mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 14), hc, [0, -0.04, 0], [Math.PI / 2, 0, 0]));
      }
      hat.position.set(0, 0.1, 0);
      this.head.add(hat);
      this.hat = hat;
    }
    this.body.add(this.head);
    this.root.add(this.body);
  }

  update(): void {
    const r = this.run;
    const ph = this.phase;
    const amp = 0.35 + r * 0.6;
    this.legs[0].rotation.x = Math.sin(ph) * amp * Math.min(1, r * 2);
    this.legs[1].rotation.x = -Math.sin(ph) * amp * Math.min(1, r * 2);
    this.arms[0].rotation.x = -Math.sin(ph) * amp * Math.min(1, r * 2) * 0.9;
    this.arms[1].rotation.x = Math.sin(ph) * amp * Math.min(1, r * 2) * 0.9;
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.06 * r;
    this.body.rotation.x = r * 0.18;
    if (this.wave > 0) {
      this.arms[1].rotation.z = 2.6 * this.wave;
      this.arms[1].rotation.x = Math.sin(ph * 3) * 0.3;
    } else this.arms[1].rotation.z = 0;
    if (this.scared > 0) {
      this.arms[0].rotation.z = -2.4 * this.scared;
      this.arms[1].rotation.z = 2.4 * this.scared;
    }
  }
}

/** Little smoking shoes left behind after a zap. */
export function shoePair(color: string): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), toon(color), [s * 0.1, 0.04, 0.03]));
  return g;
}

export function knittingProp(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(blob(0.12, 1, 0.1, 9), toon(C.white)));
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), toon(C.straw), [0.05, 0.1, 0.05], [0.4, 0, 0.6]));
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), toon(C.straw), [-0.05, 0.1, 0.05], [0.4, 0, -0.6]));
  return g;
}
