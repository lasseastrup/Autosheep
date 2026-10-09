import * as THREE from 'three';
import { toon, glow, noOutline } from '../engine/toon';
import { blob, merged, mesh, tint } from './geo';
import { C } from '../engine/palette';
import { Rng, hash1 } from '../engine/rng';

// ------------------------------------------------------------------ terrain
export type HeightFn = (x: number, z: number) => number;

export function rollingHills(seed = 1, amp = 1): HeightFn {
  const r = new Rng(seed);
  const waves = Array.from({ length: 5 }, () => ({ fx: r.range(0.03, 0.12), fz: r.range(0.03, 0.12), ph: r.range(0, 6), a: r.range(0.3, 1) }));
  return (x, z) => {
    let h = 0;
    for (const w of waves) h += Math.sin(x * w.fx + w.ph) * Math.cos(z * w.fz + w.ph * 0.7) * w.a;
    return h * amp;
  };
}

/**
 * Ground material: toon lighting with the colour picked per pixel from world-space noise
 * (meadow patches, a worn lane, grass speckles), so patches have clean pixel edges.
 */
export function groundMaterial(opts: { base?: string; light?: string; dark?: string; path?: [number, number, number] | null; pathColor?: string; pathEdge?: string } = {}): THREE.MeshLambertMaterial {
  const m = toon(0xffffff, { unique: true });
  const prev = m.onBeforeCompile;
  const uniforms = {
    uGBase: { value: new THREE.Color(opts.base ?? C.grass) },
    uGLight: { value: new THREE.Color(opts.light ?? C.leaf) },
    uGDark: { value: new THREE.Color(opts.dark ?? C.pine) },
    uGPath: { value: new THREE.Vector3(...(opts.path ?? [0, 0, -9999])) },
    uGPathC: { value: new THREE.Color(opts.pathColor ?? C.tan) },
    uGPathE: { value: new THREE.Color(opts.pathEdge ?? C.moss) },
  };
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGWorld;
uniform vec3 uGBase, uGLight, uGDark, uGPath, uGPathC, uGPathE;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 w = vGWorld.xz;
  float n = gNoise(w * 0.09) * 0.65 + gNoise(w * 0.31 + 7.0) * 0.35;
  vec3 c = n > 0.62 ? uGLight : (n < 0.3 ? uGDark : uGBase);
  float sp = gHash(floor(w * 5.0));
  if (sp > 0.965) c = uGLight;
  else if (sp < 0.02) c = uGDark;
  float pd = abs(w.y - (uGPath.z + sin(w.x * uGPath.y) * uGPath.x));
  if (pd < 0.6 + gNoise(w * 2.0) * 0.25) c = uGPathC;
  else if (pd < 0.95) c = uGPathE;
  diffuseColor.rgb = c;
}`,
      );
  };
  m.customProgramCacheKey = () => 'ground-v1';
  return m;
}

/** Grass terrain with vertex-colour patches (meadow, worn paths, darker hollows). */
export function terrain(size: number, segs: number, height: HeightFn, opts: { colors?: string[]; path?: (x: number, z: number) => number; seed?: number; material?: THREE.Material } = {}): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = (opts.colors ?? [C.grass, C.leaf, C.meadow, C.pine]).map((c) => new THREE.Color(c));
  const dirt = new THREE.Color(C.tan);
  const dirtDark = new THREE.Color(C.terracotta);
  const colors = new Float32Array(pos.count * 3);
  const seed = opts.seed ?? 3;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    const n = Math.sin(x * 0.31 + seed) * Math.cos(z * 0.27) + Math.sin(x * 0.11 - z * 0.13) * 0.8 + (hash1(i, seed) - 0.5) * 0.25;
    let c = n > 0.75 ? cols[2] : n > -0.2 ? cols[0] : n > -0.9 ? cols[1] : cols[0];
    if (y < -1.2) c = cols[3];
    if (opts.path) {
      const d = opts.path(x, z);
      if (d < 0.9) c = d < 0.45 ? dirt : dirtDark;
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, opts.material ?? toon(0xffffff, { vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

/** Instanced grass tufts and flowers scattered over a height field. */
export function meadowDressing(area: number, count: number, height: HeightFn, seed = 5, avoid?: (x: number, z: number) => boolean): THREE.Group {
  const grp = new THREE.Group();
  const blade = new THREE.ConeGeometry(0.035, 0.28, 3);
  blade.translate(0, 0.14, 0);
  const tuft = merged([
    { g: blade, p: [0, 0, 0], r: [0.15, 0, 0.1] },
    { g: blade, p: [0.05, 0, 0.03], r: [-0.2, 0, -0.25], s: [1, 0.8, 1] },
    { g: blade, p: [-0.05, 0, -0.02], r: [0.1, 0, 0.35], s: [1, 0.7, 1] },
  ]);
  const grassMat = toon(C.leaf);
  const tufts = new THREE.InstancedMesh(tuft, grassMat, count);
  const flowerGeo = new THREE.IcosahedronGeometry(0.05, 0);
  flowerGeo.translate(0, 0.12, 0);
  const nF = Math.floor(count / 4);
  const flowers = new THREE.InstancedMesh(flowerGeo, toon(0xffffff), nF);
  flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nF * 3), 3);
  const r = new Rng(seed);
  const m = new THREE.Matrix4();
  const fc = [C.white, C.lemon, C.pinkLight, C.gold, C.white].map((c) => new THREE.Color(c));
  let k = 0, f = 0;
  for (let i = 0; i < count * 3 && (k < count || f < nF); i++) {
    const x = r.range(-area / 2, area / 2), z = r.range(-area / 2, area / 2);
    if (avoid?.(x, z)) continue;
    const y = height(x, z);
    const s = r.range(0.7, 1.4);
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.range(0, 6), 0)), new THREE.Vector3(s, s, s));
    if (r.next() < 0.8 && k < count) tufts.setMatrixAt(k++, m);
    else if (f < nF) {
      flowers.setMatrixAt(f, m);
      flowers.setColorAt(f++, fc[f % fc.length]);
    }
  }
  tufts.count = k;
  flowers.count = f;
  tufts.receiveShadow = true;
  noOutline(tufts);
  noOutline(flowers);
  grp.add(tufts, flowers);
  return grp;
}

// ------------------------------------------------------------------ vegetation
export function tree(seed: number, scale = 1, kind: 'round' | 'pine' = 'round'): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(seed);
  const trunk = toon(C.rust);
  if (kind === 'pine') {
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6), trunk, [0, 0.5, 0]));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry(1.0 - i * 0.25, 1.3, 8), toon(i % 2 ? C.pine : C.grass, { flat: true }), [0, 1.2 + i * 0.75, 0]));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.6, 7), trunk, [0, 0.8, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 5), trunk, [0.25, 1.5, 0], [0, 0, -0.7]));
    const leaves = [C.grass, C.leaf, C.grass];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r.range(-0.3, 0.3);
      const rr = i === 0 ? 0 : r.range(0.45, 0.7);
      g.add(mesh(blob(r.range(0.6, 0.85), 2, 0.12, seed * 7 + i), toon(leaves[i % 3]), [Math.cos(a) * rr, 2.1 + r.range(-0.2, 0.4) + (i === 0 ? 0.35 : 0), Math.sin(a) * rr]));
    }
  }
  g.scale.setScalar(scale);
  return g;
}

export function bush(seed: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(seed);
  for (let i = 0; i < 3; i++) g.add(mesh(blob(r.range(0.3, 0.45), 1, 0.15, seed + i), toon(i ? C.grass : C.leaf), [r.range(-0.3, 0.3), 0.25, r.range(-0.3, 0.3)]));
  g.scale.setScalar(scale);
  return g;
}

export function rock(seed: number, scale = 1): THREE.Mesh {
  const m = mesh(blob(0.5, 1, 0.25, seed), toon(C.fog, { flat: true }), [0, 0.15, 0], [0, seed, 0], [1, 0.6, 0.8]);
  m.scale.multiplyScalar(scale);
  return m;
}

// ------------------------------------------------------------------ fences & walls
/** A wooden post-and-rail fence along a polyline (posts every ~1.4 units). */
export function fence(points: THREE.Vector2[], height: HeightFn, color: string = C.tan): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(color);
  const postGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.4));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < points.length - 2) continue;
      const p = a.clone().lerp(b, k / n);
      g.add(mesh(postGeo, wood, [p.x, height(p.x, p.y) + 0.4, p.y]));
    }
    for (const yy of [0.35, 0.68]) {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const rail = mesh(new THREE.BoxGeometry(len, 0.08, 0.06), wood, [mid.x, (height(a.x, a.y) + height(b.x, b.y)) / 2 + yy, mid.y]);
      rail.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      g.add(rail);
    }
  }
  return g;
}

export function stoneWall(points: THREE.Vector2[], height: HeightFn): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(11);
  const cols = [C.fog, C.lilac, C.mist];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = a.distanceTo(b);
    const ang = -Math.atan2(b.y - a.y, b.x - a.x);
    for (let s = 0.2; s < len; s += 0.42) {
      const p = a.clone().lerp(b, s / len);
      for (let row = 0; row < 2; row++) {
        const st = mesh(new THREE.BoxGeometry(0.45, 0.24, 0.35), toon(r.pick(cols), { flat: true }), [p.x, height(p.x, p.y) + 0.12 + row * 0.24, p.y], [0, ang + r.range(-0.15, 0.15), r.range(-0.08, 0.08)]);
        g.add(st);
      }
    }
  }
  return g;
}

// ------------------------------------------------------------------ buildings
function gableRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

function windowPane(w: number, h: number, lit = false): THREE.Mesh {
  const m = lit ? glow(C.lemon, 1.3) : toon(C.skyLight);
  return mesh(new THREE.BoxGeometry(w, h, 0.05), m);
}

export function farmhouse(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(4, 2.4, 3), toon(C.mist), [0, 1.2, 0]));
  const roof = mesh(gableRoof(4.6, 3.4, 1.5), toon(C.brick), [0, 2.4, 0]);
  roof.rotation.y = Math.PI / 2;
  roof.scale.set(3.4 / 3.4, 1, 1);
  const r2 = mesh(gableRoof(3.5, 4.6, 1.5), toon(C.brick, { flat: true }), [0, 2.4, 0]);
  r2.rotation.y = Math.PI / 2;
  g.add(r2);
  g.add(mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), toon(C.clay), [1.2, 3.2, 0.5]));
  g.add(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.08), toon(C.rust), [0, 0.6, 1.51]));
  for (const x of [-1.3, 1.3]) {
    const w = windowPane(0.6, 0.6);
    w.position.set(x, 1.4, 1.51);
    g.add(w);
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.1), toon(C.white), [x, 1.06, 1.53]));
  }
  void roof;
  return g;
}

export function barn(): THREE.Group {
  const g = new THREE.Group();
  const red = toon(C.brick);
  const white = toon(C.white);
  g.add(mesh(new THREE.BoxGeometry(4, 2.6, 5), red, [0, 1.3, 0]));
  // gambrel roof as two stacked gables
  const shape = new THREE.Shape();
  shape.moveTo(-2.2, 0);
  shape.lineTo(2.2, 0);
  shape.lineTo(1.5, 1.0);
  shape.lineTo(0, 1.7);
  shape.lineTo(-1.5, 1.0);
  shape.closePath();
  const rg = new THREE.ExtrudeGeometry(shape, { depth: 5.4, bevelEnabled: false });
  rg.translate(0, 0, -2.7);
  g.add(mesh(rg, toon(C.wine, { flat: true }), [0, 2.6, 0]));
  // big doors with white X trim
  g.add(mesh(new THREE.BoxGeometry(2, 2, 0.08), red, [0, 1, 2.52]));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 2.6, 0.06), white, [0, 1, 2.58], [0, 0, s * 0.75]));
  g.add(mesh(new THREE.BoxGeometry(2.1, 0.12, 0.06), white, [0, 2.0, 2.58]));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), white, [0, 3.0, 2.58]));
  return g;
}

export function silo(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 5, 14), toon(C.fog), [0, 2.5, 0]));
  g.add(mesh(new THREE.SphereGeometry(0.92, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.mist), [0, 5, 0]));
  for (const y of [1, 2.2, 3.4, 4.5]) g.add(mesh(new THREE.TorusGeometry(0.92, 0.04, 4, 20), toon(C.lilac), [0, y, 0], [Math.PI / 2, 0, 0]));
  return g;
}

export function pickupTruck(color: string = C.sky): THREE.Group {
  const g = new THREE.Group();
  const paint = toon(color);
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 3.2), paint, [0, 0.6, 0]));
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.55, 1.2), paint, [0, 1.12, 0.65]));
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.4, 0.05), toon(C.skyLight), [0, 1.15, 1.26]));
  // open bed walls
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.35, 1.7), paint, [s * 0.71, 1.0, -0.7]));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.35, 0.08), paint, [0, 1.0, -1.56]));
  for (const [x, z] of [[-0.72, 1.0], [0.72, 1.0], [-0.72, -1.0], [0.72, -1.0]]) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), toon(C.ink), [x, 0.3, z], [0, 0, Math.PI / 2]));
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), glow(C.lemon, 1.5), [0.5, 0.7, 1.62]));
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), glow(C.lemon, 1.5), [-0.5, 0.7, 1.62]));
  return g;
}

export function bucket(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.25, 10), toon(C.fog)));
  g.add(mesh(new THREE.TorusGeometry(0.15, 0.015, 4, 10, Math.PI), toon(C.lilac), [0, 0.12, 0]));
  return g;
}

export function hayBale(): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 12), toon(C.straw), [0, 0.55, 0], [0, 0, Math.PI / 2]);
}

/** A distant city: boxes with lit window grids (canvas texture). */
export function cityBlock(seed: number, count: number, spread: number): THREE.Group {
  const g = new THREE.Group();
  const cvs = document.createElement('canvas');
  cvs.width = 64;
  cvs.height = 128;
  const x = cvs.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 64, 128);
  const r = new Rng(seed);
  for (let yy = 4; yy < 124; yy += 8) for (let xx = 4; xx < 60; xx += 8) {
    x.fillStyle = r.next() > 0.45 ? '#2b2f45' : '#6a7aa0';
    x.fillRect(xx, yy, 4, 5);
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const cols = [C.fog, C.lilac, C.mist, C.indigo, C.sage];
  for (let i = 0; i < count; i++) {
    const w = r.range(1.2, 2.6), d = r.range(1.2, 2.6), h = r.range(3, 11);
    const t = tex.clone();
    t.repeat.set(w / 2, h / 4);
    t.needsUpdate = true;
    const b = mesh(new THREE.BoxGeometry(w, h, d), toon(r.pick(cols), { map: t }), [r.range(-spread, spread), h / 2, r.range(-spread * 0.3, spread * 0.3)]);
    b.userData.height = h;
    g.add(b);
    if (r.next() > 0.6) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 4), toon(C.lilac), [b.position.x, h + 0.75, b.position.z]));
  }
  return g;
}

/** Shadow-catching blob under a character when real shadows are off. */
export function blobShadow(r = 0.5): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pine), transparent: true, opacity: 0.6, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  noOutline(m);
  return m;
}

export { tint };
