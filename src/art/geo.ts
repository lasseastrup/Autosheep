import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../engine/rng';

/** Build a geometry from (geometry, transform) pairs and merge into one draw call. */
export function merged(parts: { g: THREE.BufferGeometry; p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] | number }[]): THREE.BufferGeometry {
  const geos = parts.map(({ g, p, r, s }) => {
    const m = new THREE.Matrix4();
    const scale = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...(s ?? [1, 1, 1]));
    m.compose(new THREE.Vector3(...(p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r ?? [0, 0, 0]))), scale);
    const gg = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    for (const name of Object.keys(gg.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') gg.deleteAttribute(name);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    return gg;
  });
  return mergeGeometries(geos, false)!;
}

/** A lumpy blob: an icosphere with low-frequency radial noise (rocks, bushes, wool). */
export function blob(radius: number, detail: number, lump: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rng = new Rng(seed);
  const k = [rng.range(1, 3), rng.range(1, 3), rng.range(1, 3), rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const f = 1 + lump * (Math.sin(n.x * k[0] * 3 + k[3]) * Math.sin(n.y * k[1] * 3 + k[4]) * Math.sin(n.z * k[2] * 3 + k[5]));
    v.multiplyScalar(f);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Colour every vertex of a geometry (for merged multi-colour props). */
export function tint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, p?: [number, number, number], r?: [number, number, number], s?: [number, number, number] | number): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  if (p) me.position.set(...p);
  if (r) me.rotation.set(...r);
  if (s !== undefined) typeof s === 'number' ? me.scale.setScalar(s) : me.scale.set(...s);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}
