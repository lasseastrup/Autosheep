import * as THREE from 'three';
import { Sheep } from '../art/sheep';
import { C } from '../engine/palette';
import { SheepState, type FlockOutputs } from '../sim/contract';
import { hash1 } from '../engine/rng';

const TAU = Math.PI * 2;

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

interface Anim {
  sheep: Sheep;
  speed: number;
  graze: number;
  look: number;
  blinkAt: number;
  bleatAt: number;
  bleatUntil: number;
}

/**
 * Draws the flock: one animated cartoon sheep per simulated sheep, interpolated between the
 * 30 Hz simulation steps and animated from the coarse state the model reports.
 */
export class FlockView {
  readonly root = new THREE.Group();
  private readonly anims: Anim[] = [];
  private prevX = new Float32Array(0);
  private prevY = new Float32Array(0);
  private prevH = new Float32Array(0);
  /** sheep that bleated this frame, for the audio */
  readonly bleats: number[] = [];

  constructor(count: number, seed: number) {
    for (let i = 0; i < count; i++) {
      // mostly white, a few creams and one black sheep
      const r = hash1(i, seed);
      const wool = i === 7 ? C.coal : r < 0.15 ? C.straw : r < 0.3 ? C.mist : C.white;
      const face = i === 7 ? C.black : r > 0.85 ? C.mauve : C.ink;
      const sheep = new Sheep(seed * 100 + i, wool, face);
      sheep.root.scale.setScalar(0.92 + hash1(i, seed + 1) * 0.16);
      this.root.add(sheep.root);
      this.anims.push({ sheep, speed: 0, graze: 0, look: 0, blinkAt: hash1(i, 3) * 4, bleatAt: 5 + hash1(i, 4) * 40, bleatUntil: 0 });
    }
    sheepShadows(this.root);
  }

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
  update(o: FlockOutputs, alpha: number, time: number, dt: number, watch: THREE.Vector3): void {
    this.bleats.length = 0;
    for (let i = 0; i < this.anims.length; i++) {
      const a = this.anims[i];
      const s = a.sheep;
      const has = this.prevX.length === o.count;
      const x = has ? this.prevX[i] + (o.x[i] - this.prevX[i]) * alpha : o.x[i];
      const z = has ? this.prevY[i] + (o.y[i] - this.prevY[i]) * alpha : o.y[i];
      const h = has ? lerpAngle(this.prevH[i], o.heading[i], alpha) : o.heading[i];
      s.root.position.set(x, 0, z);
      // the model faces +Z; heading is atan2(dz, dx)
      s.root.rotation.y = Math.PI / 2 - h;

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
        const want = Math.atan2(watch.x - x, watch.z - z) - s.root.rotation.y;
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
      s.update();
    }
  }

  position(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.anims[i].sheep.root.position);
  }
}

function sheepShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}
