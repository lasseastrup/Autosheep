import * as THREE from 'three';
import { toon, glow } from '../engine/toon';
import { blob, merged, mesh } from './geo';
import { C } from '../engine/palette';

/** A tentacle arm: a chain of shrinking spheres along a curling curve. */
export class Tentacle {
  readonly root = new THREE.Group();
  private segs: THREE.Mesh[] = [];
  /** base angle (radians, around Z in the arm's local plane), curl per segment, lift */
  swing = 0;
  curl = 0.25;
  lift = 0;
  wave = 0;
  wavePhase = 0;
  constructor(mat: THREE.Material, n = 6, r0 = 0.085, step = 0.1, tipMat?: THREE.Material) {
    for (let i = 0; i < n; i++) {
      const r = r0 * (1 - (i / n) * 0.45);
      const m = mesh(new THREE.SphereGeometry(r, 8, 6), i === n - 1 && tipMat ? tipMat : mat);
      this.segs.push(m);
      this.root.add(m);
    }
    this.step = step;
  }
  private step: number;
  update(): void {
    let x = 0, y = 0;
    let a = this.swing;
    this.segs.forEach((s, i) => {
      s.position.set(x, y, Math.sin(i * 0.4) * this.lift * 0.05 * i);
      a += this.curl + Math.sin(this.wavePhase + i * 0.9) * this.wave;
      x += Math.cos(a) * this.step;
      y += Math.sin(a) * this.step;
    });
  }
  /** the parts update() moves */
  get moving(): THREE.Object3D[] {
    return this.segs;
  }
  tip(target: THREE.Vector3): THREE.Vector3 {
    return this.segs[this.segs.length - 1].getWorldPosition(target);
  }
}

/**
 * General Gafoop: a pompous green blob with three eye stalks, an enormous peaked cap,
 * too many medals, a cape and two tentacle arms. Faces +Z, about 1.45 units tall.
 */
export class Gafoop {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group(); // squash & stretch pivot at the feet
  readonly cap = new THREE.Group();
  readonly armL: Tentacle;
  readonly armR: Tentacle;
  private eyes: { stalk: THREE.Group; ball: THREE.Mesh; pupil: THREE.Mesh; base: THREE.Euler }[] = [];
  private mouthInner: THREE.Mesh;
  private tongue: THREE.Mesh;
  private teeth: THREE.Mesh;
  private sweat: THREE.Mesh;
  readonly cape: THREE.Mesh;

  // pose parameters
  mouth = 0;
  blink = 0;
  look = new THREE.Vector2(0, 0); // pupil offset -1..1
  squash = 0; // + squashed, - stretched
  capTilt = 0;
  capOff = 0; // 0 = on head, 1 = knocked over the eyes
  eyeDroop = 0; // 0 alert, 1 eyes flop down (defeated)
  eyeWobble = 0;
  sweatAmount = 0;
  time = 0;

  constructor() {
    const skin = toon(C.meadow);
    const belly = toon(C.hay);
    const dark = toon(C.ink);

    // body blob and belly
    const bodyMesh = mesh(blob(0.55, 3, 0.03, 4), skin, [0, 0.5, 0], undefined, [1, 0.9, 0.95]);
    this.body.add(bodyMesh);
    this.body.add(mesh(new THREE.SphereGeometry(0.4, 20, 14), belly, [0, 0.3, 0.25], undefined, [0.9, 0.62, 0.72]));
    // stubby feet
    for (const s of [-1, 1]) this.body.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), toon(C.grass), [s * 0.24, 0.06, 0.12], undefined, [1, 0.55, 1.4]));

    // mouth: dark cavity + tongue + teeth, scaled open by `mouth`
    this.mouthInner = mesh(new THREE.SphereGeometry(0.2, 16, 10), dark, [0, 0.52, 0.47], undefined, [1.2, 0.3, 0.45]);
    this.tongue = mesh(new THREE.SphereGeometry(0.11, 10, 8), toon(C.pink), [0, 0.47, 0.51], undefined, [1.2, 0.5, 0.6]);
    this.teeth = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), toon(C.white), [0, 0.57, 0.555]);
    this.body.add(this.mouthInner, this.tongue, this.teeth);

    // three eye stalks
    const stalkMat = skin;
    const white = toon(C.white);
    const pupilMat = toon(C.ink);
    const eyeDefs: [number, number, number, number][] = [
      // x, height, forward lean, size
      [-0.24, 0.42, 0.35, 0.13],
      [0.0, 0.55, 0.2, 0.15],
      [0.24, 0.42, 0.35, 0.13],
    ];
    for (const [x, h, lean, size] of eyeDefs) {
      const stalk = new THREE.Group();
      stalk.position.set(x, 0.8, 0.12);
      const base = new THREE.Euler(lean, 0, -x * 0.9);
      stalk.rotation.copy(base);
      const stem = mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), stalkMat, [0, h / 2, 0]);
      const ball = mesh(new THREE.SphereGeometry(size, 14, 10), white, [0, h + size * 0.6, 0]);
      const pupil = mesh(new THREE.SphereGeometry(size * 0.5, 10, 8), pupilMat, [0, 0, size * 0.86], undefined, [1, 1, 0.45]);
      // a glint
      pupil.add(mesh(new THREE.SphereGeometry(size * 0.16, 6, 4), toon(C.white), [size * 0.18, size * 0.2, size * 0.35]));
      ball.add(pupil);
      stalk.add(stem, ball);
      this.body.add(stalk);
      this.eyes.push({ stalk, ball, pupil, base });
    }

    // the cap: crown, gold band, visor, badge — tilted for swagger
    const capPurple = toon(C.plum);
    const gold = toon(C.gold);
    const crown = mesh(new THREE.CylinderGeometry(0.44, 0.31, 0.2, 18), capPurple, [0, 0.12, -0.03], [-0.15, 0, 0], [1, 1, 0.9]);
    const top = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 18), toon(C.violet), [0, 0.225, -0.05], [-0.15, 0, 0], [1, 1, 0.9]);
    const band = mesh(new THREE.CylinderGeometry(0.315, 0.31, 0.07, 18), gold, [0, 0.035, 0]);
    const visor = mesh(new THREE.SphereGeometry(0.22, 12, 6), toon(C.ink), [0, 0.0, 0.26], [0.25, 0, 0], [1.25, 0.12, 0.75]);
    const badge = mesh(new THREE.OctahedronGeometry(0.08, 0), gold, [0, 0.13, 0.33], [0, 0, Math.PI / 4]);
    const plume = mesh(blob(0.07, 1, 0.1, 3), toon(C.scarlet), [0.25, 0.26, 0.1], undefined, [1, 1.6, 1]);
    this.cap.add(crown, top, band, visor, badge, plume);
    this.cap.position.set(0, 0.92, -0.08);
    this.body.add(this.cap);

    // medals on the chest (on his left = +x)
    const ribbons = [C.scarlet, C.sky, C.gold, C.violet, C.leaf];
    ribbons.forEach((col, i) => {
      const row = Math.floor(i / 3), k = i % 3;
      const px = -0.14 - k * 0.075, py = 0.36 - row * 0.09;
      const z = Math.sqrt(Math.max(0, 0.3 - px * px - (py - 0.5) * (py - 0.5) * 1.2)) + 0.16;
      this.body.add(mesh(new THREE.BoxGeometry(0.055, 0.045, 0.02), toon(col), [px, py + 0.035, z], [-0.2, 0.3, 0]));
      this.body.add(mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.015, 8), gold, [px, py - 0.015, z + 0.01], [Math.PI / 2 - 0.2, 0, 0]));
    });
    // epaulettes
    for (const s of [-1, 1]) {
      const ep = new THREE.Group();
      ep.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12), gold));
      for (let k = 0; k < 6; k++) {
        const a = (k / 5) * Math.PI - Math.PI / 2;
        ep.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 4), gold, [Math.cos(a) * 0.12 * s, -0.05, Math.sin(a) * 0.1]));
      }
      ep.position.set(s * 0.45, 0.73, 0);
      ep.rotation.z = s * 0.5;
      this.body.add(ep);
    }

    // cape
    const capeGeo = new THREE.CylinderGeometry(0.5, 0.62, 0.75, 16, 4, true, Math.PI * 0.55, Math.PI * 0.9);
    this.cape = mesh(capeGeo, toon(C.crimson, { side: THREE.DoubleSide }), [0, 0.42, -0.05]);
    this.body.add(this.cape);

    // arms
    const hand = toon(C.leaf);
    this.armL = new Tentacle(skin, 6, 0.085, 0.1, hand);
    this.armR = new Tentacle(skin, 6, 0.085, 0.1, hand);
    this.armL.root.position.set(0.5, 0.52, 0.05);
    this.armR.root.position.set(-0.5, 0.52, 0.05);
    this.armR.root.scale.x = -1;
    for (const a of [this.armL, this.armR]) {
      a.swing = -1.1;
      a.curl = 0.22;
    }
    this.body.add(this.armL.root, this.armR.root);

    // sweat drop
    this.sweat = mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(C.skyLight, 1.2), [0.38, 0.9, 0.3], undefined, [0.8, 1.3, 0.8]);
    this.sweat.visible = false;
    this.body.add(this.sweat);

    this.root.add(this.body);
    this.update(0);
  }

  /** Every node update() moves or hides (for bakeRigid). */
  get moving(): THREE.Object3D[] {
    return [
      this.body, this.mouthInner, this.tongue, this.teeth, this.cap, this.cape, this.sweat,
      ...this.eyes.flatMap((e) => [e.stalk, e.ball, e.pupil]),
      ...this.armL.moving, ...this.armR.moving,
    ];
  }

  /** Pose for absolute time `time` (seconds); stateless so any frame can be rendered alone. */
  update(time: number): void {
    this.time = time;
    const t = this.time;
    const sq = this.squash + Math.sin(t * 2.2) * 0.015;
    this.body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);

    const m = Math.max(0, Math.min(1, this.mouth));
    this.mouthInner.scale.set(1.2, 0.2 + m * 0.7, 0.45);
    this.mouthInner.position.y = 0.52 - m * 0.06;
    this.tongue.scale.set(1.2, 0.2 + m * 0.4, 0.6);
    this.tongue.position.y = 0.47 - m * 0.08;
    this.tongue.visible = m > 0.15;
    this.teeth.visible = m > 0.1;

    this.eyes.forEach((e, i) => {
      const wob = Math.sin(t * 3 + i * 2) * (0.04 + this.eyeWobble * 0.25);
      e.stalk.rotation.set(e.base.x + wob + this.eyeDroop * 1.4, e.base.y, e.base.z + Math.cos(t * 2.5 + i) * (0.03 + this.eyeWobble * 0.2) + this.eyeDroop * (i - 1) * 0.6);
      const b = Math.max(0.08, 1 - this.blink);
      e.ball.scale.set(1, b, 1);
      e.pupil.position.x = this.look.x * 0.05;
      e.pupil.position.y = this.look.y * 0.05;
    });

    this.cap.rotation.set(-0.05 + this.capOff * 0.5, 0, 0.12 + this.capTilt);
    this.cap.position.set(this.capOff * 0.02, 0.92 - this.capOff * 0.3, -0.08 + this.capOff * 0.28);

    this.cape.rotation.x = Math.sin(t * 1.7) * 0.04;
    this.armL.update();
    this.armR.update();

    this.sweat.visible = this.sweatAmount > 0.01;
    if (this.sweat.visible) {
      const k = (t * 1.3) % 1;
      this.sweat.position.set(0.38, 0.95 - k * 0.35, 0.32);
    }
  }
}

/**
 * Lieutenant Blorp: tall, thin, lavender, one enormous anxious eye, droopy antennae,
 * permanently holding a clipboard.
 */
export class Blorp {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly armL: Tentacle;
  readonly armR: Tentacle;
  private eye: THREE.Mesh;
  private pupil: THREE.Mesh;
  private lid: THREE.Mesh;
  private mouthMesh: THREE.Mesh;
  private antennae: THREE.Group[] = [];
  readonly clipboard: THREE.Group;
  mouth = 0;
  blink = 0;
  look = new THREE.Vector2();
  slump = 0;
  time = 0;

  constructor() {
    const skin = toon(C.lavender);
    const shade = toon(C.violet);
    const bodyGeo = merged([
      { g: new THREE.SphereGeometry(0.3, 16, 12), p: [0, 0.45, 0], s: [1, 1.5, 0.9] },
      { g: new THREE.SphereGeometry(0.27, 16, 12), p: [0, 1.05, 0.02], s: [1, 1.1, 0.95] },
    ]);
    this.body.add(mesh(bodyGeo, skin));
    // uniform: a little teal tunic with a collar
    this.body.add(mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.45, 14), toon(C.teal), [0, 0.42, 0]));
    this.body.add(mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 14), toon(C.gold), [0, 0.66, 0], [Math.PI / 2, 0, 0]));
    for (const s of [-1, 1]) this.body.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), shade, [s * 0.14, 0.05, 0.08], undefined, [1, 0.5, 1.5]));

    this.eye = mesh(new THREE.SphereGeometry(0.16, 16, 12), toon(C.white), [0, 1.1, 0.2]);
    this.pupil = mesh(new THREE.SphereGeometry(0.08, 12, 8), toon(C.ink), [0, 0, 0.12], undefined, [1, 1, 0.5]);
    this.pupil.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), toon(C.white), [0.03, 0.03, 0.05]));
    this.eye.add(this.pupil);
    // heavy anxious eyelid
    this.lid = mesh(new THREE.SphereGeometry(0.168, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), shade, [0, 1.1, 0.2]);
    this.body.add(this.eye, this.lid);
    this.mouthMesh = mesh(new THREE.SphereGeometry(0.07, 10, 6), toon(C.ink), [0, 0.9, 0.24], undefined, [1.3, 0.25, 0.4]);
    this.body.add(this.mouthMesh);

    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(s * 0.1, 1.3, 0);
      a.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 5), shade, [0, 0.15, 0]));
      a.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), glow(C.mint, 1.6), [0, 0.32, 0]));
      this.antennae.push(a);
      this.body.add(a);
    }

    this.armL = new Tentacle(skin, 5, 0.06, 0.09);
    this.armR = new Tentacle(skin, 5, 0.06, 0.09);
    this.armL.root.position.set(0.3, 0.62, 0.05);
    this.armR.root.position.set(-0.3, 0.62, 0.05);
    this.armR.root.scale.x = -1;
    this.armL.swing = -1.0;
    this.armL.curl = 0.35;
    this.armR.swing = -1.3;
    this.armR.curl = 0.1;
    this.body.add(this.armL.root, this.armR.root);

    this.clipboard = new THREE.Group();
    this.clipboard.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 0.03), toon(C.rust)));
    this.clipboard.add(mesh(new THREE.BoxGeometry(0.25, 0.32, 0.01), toon(C.white), [0, -0.02, 0.02]));
    this.clipboard.add(mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), toon(C.fog), [0, 0.19, 0.02]));
    this.clipboard.position.set(0.18, 0.5, 0.32);
    this.clipboard.rotation.set(-0.6, -0.3, 0);
    this.body.add(this.clipboard);

    this.root.add(this.body);
    this.update(0);
  }

  /** Pose for absolute time `time` (seconds); stateless so any frame can be rendered alone. */
  update(time: number): void {
    this.time = time;
    const t = this.time;
    this.body.rotation.x = this.slump * 0.25 + Math.sin(t * 1.5) * 0.02;
    const b = Math.max(0.05, 1 - this.blink);
    this.eye.scale.set(1, b * 0.9 + 0.1, 1);
    // perpetually half-lidded
    this.lid.rotation.x = -0.35 - this.slump * 0.4 + this.blink * 1.2;
    this.pupil.position.x = this.look.x * 0.06;
    this.pupil.position.y = this.look.y * 0.05;
    this.mouthMesh.scale.set(1.3, 0.2 + this.mouth * 0.9, 0.4);
    this.antennae.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * (0.5 + this.slump * 0.6) + Math.sin(t * 2 + i) * 0.1));
    this.armL.update();
    this.armR.update();
  }
}
