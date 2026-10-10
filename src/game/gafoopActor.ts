import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Gafoop } from '../art/gafoop';
import { mesh } from '../art/geo';
import { bucket } from '../art/props';
import { C } from '../engine/palette';
import { glow, noOutline, toon } from '../engine/toon';
import { bakeRigid } from '../engine/bake';

export type Tool = 'idle' | 'bucket';

/** A dashed ring of the given radius lying on the grass, drawn without outlines. */
function ring(color: string, radius: number, width = 0.16, dashes = 40): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const step = (Math.PI * 2) / dashes;
  for (let k = 0; k < dashes; k++) parts.push(new THREE.RingGeometry(radius - width, radius, 3, 1, k * step, step * 0.6));
  const m = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.visible = false;
  return noOutline(m);
}

/**
 * General Gafoop on his hover-disc, steered by the cursor. Sheep keep away from him by
 * proximity alone; nothing he holds changes that. He also carries a feed bucket (lure: hold a
 * mouse button) and a megaphone (startle: space).
 */
export class GafoopActor {
  readonly root = new THREE.Group();
  private readonly hover = new THREE.Group();
  readonly gafoop = new Gafoop();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  private readonly crook = new THREE.Group();
  private readonly pail: THREE.Group;
  private readonly wave = ring(C.white, 1, 0.08, 48);
  maxSpeed = 6;
  tool: Tool = 'idle';
  private facing = 0;
  private waveAt = -10;
  /** speech bubble */
  line = '';
  lineFrom = 0;
  lineUntil = 0;

  constructor(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.hover.add(mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.2, 18), toon(C.mist)));
    this.hover.add(mesh(new THREE.TorusGeometry(0.88, 0.05, 4, 24), toon(C.fog), [0, 0.02, 0], [Math.PI / 2, 0, 0]));
    this.hover.add(noOutline(mesh(new THREE.CircleGeometry(0.55, 14), glow(C.mint, 2.5), [0, -0.11, 0], [Math.PI / 2, 0, 0])));
    const g = this.gafoop;
    g.root.position.y = 0.1;
    g.root.scale.setScalar(0.85);
    this.crook.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), toon(C.lilac), [0, 0.2, 0]));
    this.crook.add(mesh(new THREE.TorusGeometry(0.15, 0.03, 4, 10, Math.PI), toon(C.lilac), [0.15, 0.9, 0]));
    this.crook.add(noOutline(mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(C.mint, 3), [0.3, 0.9, 0])));
    this.crook.position.set(0.6, -0.1, 0);
    this.crook.rotation.z = -0.5;
    g.armL.root.add(this.crook);
    this.pail = bucket();
    this.pail.position.set(0.62, -0.25, 0);
    this.pail.visible = false;
    g.armR.root.add(this.pail);
    this.hover.add(g.root);
    this.root.add(this.hover);
    this.hover.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) o.castShadow = true;
    });
    // sixty-odd parts, each drawn three times a frame (shadow, outline, colour): merge the
    // ones that move together
    bakeRigid(this.root, [this.hover, this.pail, ...g.moving]);
  }

  /** Effects that live in world space, not on the bobbing disc. */
  get effects(): THREE.Object3D[] {
    return [this.wave];
  }

  megaphone(time: number): void {
    this.waveAt = time;
  }

  say(text: string, time: number, dur = 2.6): void {
    this.line = text;
    this.lineFrom = time;
    this.lineUntil = time + dur;
  }

  /** Steer toward `target` (or hold position) and pose for this frame. */
  update(target: THREE.Vector3 | null, dt: number, time: number, bounds: { w: number; h: number }): void {
    // arrive at the cursor: full speed far away, easing in close
    const want = new THREE.Vector3();
    if (target) {
      want.subVectors(target, this.pos).setY(0);
      const d = want.length();
      if (d > 0.05) want.multiplyScalar(Math.min(this.maxSpeed, d * 5) / d);
      else want.set(0, 0, 0);
    }
    this.vel.lerp(want, 1 - Math.exp(-dt * 14));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = Math.min(bounds.w - 1, Math.max(1, this.pos.x));
    this.pos.z = Math.min(bounds.h - 1, Math.max(1, this.pos.z));
    const speed = this.vel.length();
    if (speed > 0.3) {
      const goal = Math.atan2(this.vel.x, this.vel.z);
      let d = goal - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-dt * 8));
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.hover.position.y = 0.55 + Math.sin(time * 2.1) * 0.08;
    // lean into the motion
    const fwd = Math.min(1, speed / this.maxSpeed);
    this.hover.rotation.x = fwd * 0.18;

    const g = this.gafoop;
    const luring = this.tool === 'bucket';
    this.pail.visible = luring;
    // the crook swings a little as he flies
    g.armL.swing = 0.2 + fwd * 0.5 + Math.sin(time * 5) * 0.1 * fwd;
    g.armL.wave = 0.05 + fwd * 0.1;
    g.armL.wavePhase = time * 6;
    g.armR.swing = luring ? -0.2 + Math.sin(time * 18) * 0.25 : -0.3;
    g.armR.wave = luring ? 0.2 : 0.05;
    g.armR.wavePhase = time * 5;
    g.mouth = this.lineUntil > time && time >= this.lineFrom ? 0.35 + Math.sin(time * 16) * 0.3 : 0.05;
    g.squash = luring ? Math.sin(time * 18) * 0.03 : 0;
    g.blink = (time % 3.7) < 0.12 ? 1 : 0;
    g.update(time);

    // the honk's shock wave
    const w = (time - this.waveAt) / 0.7;
    this.wave.visible = w >= 0 && w < 1;
    if (this.wave.visible) {
      this.wave.position.set(this.pos.x, 0.05, this.pos.z);
      this.wave.scale.setScalar(1 + w * 13);
      this.wave.scale.z = 1;
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 1 - w;
    }
  }
}
