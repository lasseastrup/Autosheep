import * as THREE from 'three';
import { toon, noOutline } from '../engine/toon';
import { C } from '../engine/palette';
import { Rng } from '../engine/rng';

function valueNoise(seed: number) {
  const r = new Rng(seed);
  const perm = Array.from({ length: 512 }, () => r.next());
  const at = (x: number, y: number) => perm[((x & 255) + ((y & 255) * 31)) & 511];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** fBm on a sphere direction, sampled through 3 planar projections (cheap, seamless enough). */
function sphereNoise(seed: number) {
  const n = valueNoise(seed);
  return (d: THREE.Vector3, oct = 5, scale = 2.2) => {
    let s = 0, a = 0.5, f = scale;
    for (let i = 0; i < oct; i++) {
      s += a * (n(d.x * f + 17, d.y * f + 3) * 0.34 + n(d.y * f + 7, d.z * f + 11) * 0.33 + n(d.z * f + 5, d.x * f + 23) * 0.33);
      f *= 2;
      a *= 0.5;
    }
    return s;
  };
}

function equirect(w: number, h: number, paint: (d: THREE.Vector3, lat: number) => [string, number] | null): THREE.CanvasTexture {
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const g = cvs.getContext('2d')!;
  const img = g.createImageData(w, h);
  const d = new THREE.Vector3();
  const col = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      const p = paint(d, lat);
      const i = (y * w + x) * 4;
      if (!p) {
        img.data[i + 3] = 0;
        continue;
      }
      col.setStyle(p[0], THREE.SRGBColorSpace);
      img.data[i] = Math.round(col.r * 255);
      img.data[i + 1] = Math.round(col.g * 255);
      img.data[i + 2] = Math.round(col.b * 255);
      img.data[i + 3] = p[1];
    }
  }
  // the canvas stores sRGB bytes; we wrote linear via Color, so convert back
  for (let i = 0; i < img.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = img.data[i + k] / 255;
      img.data[i + k] = Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export class Planet {
  readonly root = new THREE.Group();
  readonly surface: THREE.Mesh;
  readonly clouds: THREE.Mesh;
  readonly atmosphere: THREE.Mesh;
  constructor(radius = 1) {
    const land = sphereNoise(42);
    const cloudN = sphereNoise(7);
    const surfaceTex = equirect(256, 128, (d, lat) => {
      const h = land(d) - 0.5 + Math.abs(lat) * 0.02;
      const polar = Math.abs(lat) > 1.3 + land(d, 2, 6) * 0.2;
      if (polar) return [C.white, 255];
      if (h < -0.02) return [h < -0.09 ? C.blue : C.sky, 255];
      if (h < 0.0) return [C.skyLight, 255];
      const dry = land(d, 3, 5) > 0.55 && Math.abs(lat) < 0.6;
      if (h > 0.17) return [C.mist, 255];
      if (dry) return [h > 0.07 ? C.tan : C.straw, 255];
      return [h > 0.06 ? C.grass : C.leaf, 255];
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), toon(0xffffff, { map: surfaceTex }));
    this.root.add(this.surface);

    const cloudTex = equirect(256, 128, (d) => {
      const c = cloudN(d, 4, 3);
      return c > 0.56 ? [C.white, 255] : null;
    });
    const cm = toon(0xffffff, { map: cloudTex, transparent: true });
    cm.alphaTest = 0.5;
    cm.depthWrite = false;
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.025, 48, 32), cm);
    noOutline(this.clouds);
    this.root.add(this.clouds);

    const atmo = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      uniforms: { uColor: { value: new THREE.Color(C.skyLight) }, uSun: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          vW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uSun;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 5.0);
          float lit = smoothstep(-0.3, 0.4, dot(normalize(vW), normalize(uSun)));
          gl_FragColor = vec4(uColor * rim * lit * 2.2, 0.0);
        }`,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 48, 32), atmo);
    noOutline(this.atmosphere);
    this.root.add(this.atmosphere);
  }
  setSun(dir: THREE.Vector3): void {
    ((this.atmosphere.material as THREE.ShaderMaterial).uniforms.uSun.value as THREE.Vector3).copy(dir).normalize();
  }
}

/** Starfield: three shells of square pixel stars with a little twinkle. */
export function starfield(count = 1600, radius = 300, seed = 1): THREE.Points {
  const r = new Rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const palette = [C.white, C.white, C.mist, C.skyLight, C.lemon, C.pinkLight, C.ice].map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    const u = r.range(-1, 1), th = r.range(0, Math.PI * 2);
    const s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th) * radius, u * radius, s * Math.sin(th) * radius], i * 3);
    const c = palette[r.int(0, palette.length - 1)].clone().multiplyScalar(r.range(0.35, 1.0) * (r.next() > 0.97 ? 2.2 : 1));
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = r.next() > 0.93 ? 2 : 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float uTime;
      void main() {
        float tw = 0.75 + 0.25 * sin(uTime * 3.0 + position.x * 0.37 + position.y * 0.11);
        vC = color * tw;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
      }`,
    fragmentShader: /* glsl */ `varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }`,
    depthWrite: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -5;
  noOutline(p);
  return p;
}

/** A soft nebula backdrop: big sphere with layered noise, deep purples and blues. */
export function nebula(radius = 350): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uA: { value: new THREE.Color(C.plumDark) }, uB: { value: new THREE.Color(C.navy) }, uC: { value: new THREE.Color(C.plum) }, uBg: { value: new THREE.Color(C.black) } },
    vertexShader: /* glsl */ `varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB, uC, uBg; varying vec3 vD;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD);
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 1.0, 0.2))) * 2.6, 2.0));
        float f = fbm(d * 3.0 + 4.0) * band;
        float g = fbm(d * 6.0 + 9.0) * band;
        // posterised into flat palette shapes, so the pixel pass never has to dither them
        vec3 c = uBg;
        if (f > 0.4) c = uB;
        if (g > 0.5) c = uA;
        if (f * g > 0.3) c = uC;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -20;
  m.frustumCulled = false;
  noOutline(m);
  return m;
}
