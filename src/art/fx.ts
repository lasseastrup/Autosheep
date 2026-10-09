import * as THREE from 'three';
import { toon, noOutline } from '../engine/toon';
import { blob } from './geo';
import { hash1 } from '../engine/rng';

/**
 * Deterministic particles: every particle is a pure function of (spawn record, time), so a
 * frame can be rendered at any time in any order (needed for frame-exact movie capture).
 */
export interface Puff {
  t0: number;
  life: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  size: number;
  color: THREE.Color;
  grav?: number;
  drag?: number;
  grow?: number; // >1 grows over life
}

/** Toon-shaded smoke/dust/wool puffs (instanced lumpy spheres). */
export class PuffSystem {
  readonly mesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  constructor(max = 400, outlined = true) {
    const mat = toon(0xffffff);
    this.mesh = new THREE.InstancedMesh(blob(1, 1, 0.12, 5), mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    if (!outlined) noOutline(this.mesh);
  }
  clear(): void {
    this.puffs = [];
  }
  add(p: Puff): void {
    this.puffs.push(p);
  }
  /** A burst of n puffs around a point. */
  burst(t0: number, at: THREE.Vector3, n: number, opts: { speed?: number; size?: number; life?: number; color: THREE.ColorRepresentation | THREE.ColorRepresentation[]; up?: number; grav?: number; seed?: number; spread?: number; grow?: number }): void {
    const seed = opts.seed ?? Math.floor(t0 * 1000);
    const cols = Array.isArray(opts.color) ? opts.color : [opts.color];
    for (let i = 0; i < n; i++) {
      const a = hash1(i, seed) * Math.PI * 2;
      const e = (hash1(i, seed + 1) - 0.3) * (opts.spread ?? 1.2);
      const sp = (opts.speed ?? 1.5) * (0.4 + hash1(i, seed + 2) * 0.8);
      this.add({
        t0: t0 + hash1(i, seed + 3) * 0.08,
        life: (opts.life ?? 1.2) * (0.6 + hash1(i, seed + 4) * 0.7),
        p: at.clone().add(new THREE.Vector3((hash1(i, seed + 5) - 0.5) * 0.3, (hash1(i, seed + 6) - 0.5) * 0.2, (hash1(i, seed + 7) - 0.5) * 0.3)),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + (opts.up ?? 0.6), Math.sin(a) * Math.cos(e) * sp),
        size: (opts.size ?? 0.25) * (0.6 + hash1(i, seed + 8) * 0.8),
        color: new THREE.Color(cols[i % cols.length]),
        grav: opts.grav ?? 0,
        drag: 2.2,
        grow: opts.grow ?? 1.6,
      });
    }
  }
  update(t: number): void {
    let k = 0;
    const max = this.mesh.instanceMatrix.count;
    const pos = new THREE.Vector3();
    for (const p of this.puffs) {
      const a = t - p.t0;
      if (a < 0 || a > p.life || k >= max) continue;
      const u = a / p.life;
      const drag = p.drag ?? 0;
      const f = drag > 0 ? (1 - Math.exp(-drag * a)) / drag : a;
      pos.copy(p.p).addScaledVector(p.v, f);
      pos.y -= 0.5 * (p.grav ?? 0) * a * a;
      const s = p.size * (1 + ((p.grow ?? 1) - 1) * u) * Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.5;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash1(k, 99) * 6);
      this.m.compose(pos, this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(k, this.m);
      this.mesh.setColorAt(k, p.color);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const SPARK_VERT = /* glsl */ `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size;
}`;
const SPARK_FRAG = /* glsl */ `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

/** Square, pixel-sized points: sparks, stars, embers, confetti. Sizes are in low-res px. */
export class SparkSystem {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private max: number;
  private sparks: (Puff & { px: number })[] = [];
  constructor(max = 600) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(max), 1));
    this.points = new THREE.Points(this.geo, new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG }));
    this.points.frustumCulled = false;
    noOutline(this.points);
  }
  clear(): void {
    this.sparks = [];
  }
  burst(t0: number, at: THREE.Vector3, n: number, opts: { speed?: number; life?: number; color: THREE.ColorRepresentation[]; intensity?: number; grav?: number; px?: number; seed?: number; up?: number }): void {
    const seed = opts.seed ?? Math.floor(t0 * 977);
    for (let i = 0; i < n; i++) {
      const a = hash1(i, seed) * Math.PI * 2;
      const e = hash1(i, seed + 1) * Math.PI - Math.PI / 2;
      const sp = (opts.speed ?? 3) * (0.3 + hash1(i, seed + 2));
      const c = new THREE.Color(opts.color[i % opts.color.length]).multiplyScalar(opts.intensity ?? 1);
      this.sparks.push({
        t0,
        life: (opts.life ?? 0.8) * (0.5 + hash1(i, seed + 3)),
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp + (opts.up ?? 1), Math.sin(a) * Math.cos(e) * sp),
        size: 0,
        color: c,
        grav: opts.grav ?? 6,
        px: opts.px ?? (hash1(i, seed + 4) > 0.7 ? 2 : 1),
      });
    }
  }
  update(t: number): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    const size = this.geo.attributes.size as THREE.BufferAttribute;
    let k = 0;
    for (const s of this.sparks) {
      const a = t - s.t0;
      if (a < 0 || a > s.life || k >= this.max) continue;
      pos.setXYZ(k, s.p.x + s.v.x * a, s.p.y + s.v.y * a - 0.5 * (s.grav ?? 0) * a * a, s.p.z + s.v.z * a);
      col.setXYZ(k, s.color.r, s.color.g, s.color.b);
      size.setX(k, s.px);
      k++;
    }
    this.geo.setDrawRange(0, k);
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
  }
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor;
uniform float uSunSize, uStars;
varying vec3 vDir;
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.6)) : mix(uHorizon, uBottom, clamp(-y * 4.0, 0.0, 1.0));
  float s = dot(d, normalize(uSunDir));
  c += uSunColor * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s) * 2.0;
  c += uSunColor * pow(max(s, 0.0), 12.0) * 0.25;
  if (uStars > 0.0) {
    vec3 cell = floor(d * 220.0);
    float r = h(cell);
    if (r > 0.995) c += vec3(1.0) * uStars * (0.5 + 0.5 * h(cell + 1.0)) * smoothstep(0.0, 0.3, y);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/** Gradient sky dome with an optional sun disc and stars (dithered by the palette pass). */
export function skyDome(radius = 400): THREE.Mesh & { material: THREE.ShaderMaterial } {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0, 0, 0) },
      uSunSize: { value: 0.003 },
      uStars: { value: 0 },
    },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat) as THREE.Mesh & { material: THREE.ShaderMaterial };
  m.renderOrder = -10;
  m.frustumCulled = false;
  noOutline(m);
  return m;
}

export function setSky(sky: THREE.Mesh & { material: THREE.ShaderMaterial }, top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation): void {
  const u = sky.material.uniforms;
  (u.uTop.value as THREE.Color).set(top);
  (u.uHorizon.value as THREE.Color).set(horizon);
  (u.uBottom.value as THREE.Color).set(bottom);
}
