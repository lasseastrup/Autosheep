import * as THREE from 'three';
import { C } from '../engine/palette';
import { SheepInstancer, type SheepPose } from './sheepInstancer';
import { SheepState, type FlockOutputs } from '../sim/contract';
import { hash1 } from '../engine/rng';
import { toon } from '../engine/toon';
import { blob } from '../art/geo';
import { Pack, type Works } from '../works/works';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

interface Anim {
  pose: SheepPose;
  speed: number;
  graze: number;
  look: number;
  blinkAt: number;
  bleatAt: number;
  bleatUntil: number;
}

/**
 * Draws the flock: one animated cartoon sheep per simulated sheep, interpolated between the
 * 30 Hz simulation steps and animated from the coarse state the model reports. All of them
 * are drawn by one instancer, a few draw calls for the whole flock.
 */
export class FlockView {
  readonly root = new THREE.Group();
  private readonly anims: Anim[] = [];
  private prevX = new Float32Array(0);
  private prevY = new Float32Array(0);
  private prevH = new Float32Array(0);
  /** sheep that bleated this frame, for the audio */
  readonly bleats: number[] = [];

  private readonly instancer: SheepInstancer;

  constructor(count: number, seed: number) {
    const wool: THREE.Color[] = [];
    const face: THREE.Color[] = [];
    for (let i = 0; i < count; i++) {
      // mostly white, a few creams and one black sheep
      const r = hash1(i, seed);
      wool.push(new THREE.Color(i === 7 ? C.coal : r < 0.15 ? C.straw : r < 0.3 ? C.mist : C.white));
      face.push(new THREE.Color(i === 7 ? C.black : r > 0.85 ? C.mauve : C.ink));
      const pose: SheepPose = { x: 0, z: 0, rotY: 0, scale: 0.92 + hash1(i, seed + 1) * 0.16, walkPhase: 0, walk: 0, graze: 0, bleat: 0, blink: 0, lookYaw: 0, bounce: 0, wool: 1 };
      this.anims.push({ pose, speed: 0, graze: 0, look: 0, blinkAt: hash1(i, 3) * 4, bleatAt: 5 + hash1(i, 4) * 40, bleatUntil: 0 });
    }
    this.instancer = new SheepInstancer(wool, face, 4, seed);
    this.root.add(this.instancer.root);
    // what sheep carry on their backs: a bale of their own fleece, or a skein of yarn
    const pack = (geo: THREE.BufferGeometry, colour: string) => {
      const m = new THREE.InstancedMesh(geo, toon(colour), count);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    const bale = blob(0.2, 1, 0.08, seed + 5);
    bale.scale(1.25, 0.8, 1.1);
    this.fleece = pack(bale, C.skin);
    const skein = new THREE.CylinderGeometry(0.15, 0.15, 0.36, 8);
    skein.rotateZ(Math.PI / 2);
    this.yarn = pack(skein, C.violet);
  }

  private readonly fleece: THREE.InstancedMesh;
  private readonly yarn: THREE.InstancedMesh;
  private readonly packMatrix = new THREE.Matrix4();
  private readonly packQ = new THREE.Quaternion();
  private readonly packP = new THREE.Vector3();
  private readonly packS = new THREE.Vector3();

  /** Call before each simulation step so frames can interpolate across it. */
  capture(o: FlockOutputs): void {
    if (this.prevX.length !== o.count) {
      this.prevX = new Float32Array(o.count);
      this.prevY = new Float32Array(o.count);
      this.prevH = new Float32Array(o.count);
    }
    this.prevX.set(o.x.subarray(0, o.count));
    this.prevY.set(o.y.subarray(0, o.count));
    this.prevH.set(o.heading.subarray(0, o.count));
  }

  /**
   * @param alpha  how far the frame is between the last two simulation steps
   * @param watch  what alert sheep stare at (Gafoop)
   */
  update(o: FlockOutputs, alpha: number, time: number, dt: number, watch: THREE.Vector3, works?: Works): void {
    this.bleats.length = 0;
    let nFleece = 0;
    let nYarn = 0;
    for (let i = 0; i < this.anims.length; i++) {
      const a = this.anims[i];
      const s = a.pose;
      const has = this.prevX.length === o.count;
      const x = has ? this.prevX[i] + (o.x[i] - this.prevX[i]) * alpha : o.x[i];
      const z = has ? this.prevY[i] + (o.y[i] - this.prevY[i]) * alpha : o.y[i];
      const h = has ? lerpAngle(this.prevH[i], o.heading[i], alpha) : o.heading[i];
      s.x = x;
      s.z = z;
      // the model faces +Z; heading is atan2(dz, dx)
      s.rotY = Math.PI / 2 - h;

      const state = o.state[i];
      a.speed += (o.speed[i] - a.speed) * (1 - Math.exp(-dt * 10));
      s.walk = Math.min(1, a.speed / 0.9);
      s.walkPhase += a.speed * dt * 9;
      s.bounce = state === SheepState.Run ? Math.abs(Math.sin(s.walkPhase)) * 0.06 : 0;

      // grazing: head down most of the time, up now and then to look about
      const wantsGraze = state === SheepState.Graze && a.speed < 0.2 && Math.sin(time * 0.35 + i * 1.7) > -0.55;
      a.graze += ((wantsGraze ? 1 : 0) - a.graze) * (1 - Math.exp(-dt * 4));
      s.graze = a.graze;

      // alert sheep stare at the general
      let look = 0;
      if (state === SheepState.Alert) {
        const want = Math.atan2(watch.x - x, watch.z - z) - s.rotY;
        look = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(want), Math.cos(want))));
      }
      a.look += (look - a.look) * (1 - Math.exp(-dt * 6));
      s.lookYaw = a.look;

      // blinks
      if (time > a.blinkAt) a.blinkAt = time + 2 + hash1(i, Math.floor(time)) * 4;
      s.blink = a.blinkAt - time > 0 && a.blinkAt - time < 0.12 ? 1 : 0;

      // bleats: runners complain constantly, grazers occasionally
      if (time > a.bleatAt) {
        a.bleatUntil = time + 0.55;
        const r = hash1(i, Math.floor(time * 3));
        a.bleatAt = time + (state === SheepState.Run ? 1.5 + r * 3 : state === SheepState.Alert ? 6 + r * 10 : 20 + r * 40);
        this.bleats.push(i);
      }
      const b = a.bleatUntil - time;
      s.bleat = b > 0 ? Math.sin((1 - b / 0.55) * Math.PI) : 0;
      s.wool = works && i < works.wool.length ? works.wool[i] : 1;
      this.instancer.pose(i, s);

      // a pack rides on the back, bobbing with the walk
      const pk = works && i < works.pack.length ? works.pack[i] : Pack.None;
      if (pk !== Pack.None) {
        const bob = s.bounce + Math.abs(Math.sin(s.walkPhase)) * 0.05 * s.walk;
        this.packQ.setFromAxisAngle(UP, s.rotY);
        this.packP.set(x - Math.sin(s.rotY) * 0.08 * s.scale, (0.88 + bob) * s.scale + (s.wool - 1) * 0.12, z - Math.cos(s.rotY) * 0.08 * s.scale);
        this.packS.setScalar(s.scale);
        this.packMatrix.compose(this.packP, this.packQ, this.packS);
        if (pk === Pack.Fleece) this.fleece.setMatrixAt(nFleece++, this.packMatrix);
        else this.yarn.setMatrixAt(nYarn++, this.packMatrix);
      }
    }
    this.instancer.commit();
    this.fleece.count = nFleece;
    this.yarn.count = nYarn;
    this.fleece.instanceMatrix.needsUpdate = nFleece > 0;
    this.yarn.instanceMatrix.needsUpdate = nYarn > 0;
  }

  position(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.anims[i].pose;
    return out.set(p.x, 0, p.z);
  }
}
