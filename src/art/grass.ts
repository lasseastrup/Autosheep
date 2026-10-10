import * as THREE from 'three';
import { C } from '../engine/palette';
import { noOutline, toon } from '../engine/toon';
import type { GrassField } from '../sim/grass';

/**
 * Grass you can see the flock eat: shell texturing. The meadow is drawn again as a stack of
 * thin horizontal layers ("shells"); each layer keeps only the pixels that fall inside a blade
 * at that height. Blades are pixel-art strokes, one pixel wide, three to a tuft from a shared
 * root and splayed \|/, with the darker sward showing between tufts; each layer's slice of a
 * blade is stretched toward the camera to meet the next layer's on screen, so a blade draws as
 * an unbroken line. Blade height follows the grass field (src/sim/grass.ts), uploaded as a
 * texture, so grazed ground shows short olive stubble and untouched ground long green grass.
 *
 * Why shells: at 640x360 a blade is one to three pixels, so the cost is fill rate, and a few
 * layers of a cheap shader over the low-resolution frame is little; a height field drives them
 * for free; and there is no per-blade geometry to build or cull. Lighting is the toon ramp with
 * an upward normal (the ground's), so grass is shaded and shadowed like the ground it grows on.
 * Grass pixels are flagged (alpha 2) so the pixel pass draws no outlines through them: grass in
 * front of a sheep's legs hides their outline too.
 */
export class GrassView {
  readonly mesh: THREE.InstancedMesh;
  readonly texture: THREE.DataTexture;
  private readonly data: Uint8Array;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private uploaded = -1;
  private sinceUpload = 0;
  private shells = 0;
  static readonly MAX_SHELLS = 14;

  /** `height`: the tallest blade in the tallest patch, metres. */
  constructor(private readonly field: GrassField, readonly height = 0.5) {
    // red: grass length; green: how long it can grow there (so the ground can tell grazed earth
    // from a path or a rock)
    this.data = new Uint8Array(field.cols * field.rows * 2);
    this.texture = new THREE.DataTexture(this.data, field.cols, field.rows, THREE.RGFormat, THREE.UnsignedByteType);
    this.texture.unpackAlignment = 2;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.uniforms = {
      uGrassMap: { value: this.texture },
      uGrassSize: { value: new THREE.Vector2(field.cols * field.cell, field.rows * field.cell) },
      uGrassH: { value: height },
      uGrassTime: { value: 0 },
      uCell: { value: 0.36 },
      uHalfW: { value: 0.03 },
      uHalfL: { value: 0.05 },
      uFwd: { value: new THREE.Vector2(0, -1) },
      uBottom: { value: 0.125 },
      uPpm: { value: 20 },
      uGSwamp: { value: new THREE.Color(C.swamp) },
      uGPine: { value: new THREE.Color(C.pine) },
      uGGrass: { value: new THREE.Color(C.grass) },
      uGLeaf: { value: new THREE.Color(C.leaf) },
      uGMeadow: { value: new THREE.Color(C.meadow) },
      uGHay: { value: new THREE.Color(C.hay) },
      uGOlive: { value: new THREE.Color(C.olive) },
      uGMoss: { value: new THREE.Color(C.moss) },
    };
    const geo = new THREE.PlaneGeometry(this.uniforms.uGrassSize.value.x, this.uniforms.uGrassSize.value.y);
    geo.rotateX(-Math.PI / 2);
    geo.translate(this.uniforms.uGrassSize.value.x / 2, 0, this.uniforms.uGrassSize.value.y / 2);
    this.mesh = new THREE.InstancedMesh(geo, grassMaterial(this.uniforms), GrassView.MAX_SHELLS);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    // after the solid things, so their depth rejects the grass behind them before it shades
    this.mesh.renderOrder = 1;
    noOutline(this.mesh);
    this.setShells(8);
    this.upload();
  }

  /**
   * Fit the layers to the view. Blades are strokes one pixel wide; each layer's slice of a blade
   * is stretched toward the camera far enough to meet the next layer's on screen, so a blade
   * draws as an unbroken line however far apart the layers are. The layers are then about two
   * pixels apart (only the lean is stepped by that), and `fwdX, fwdZ` is the camera's forward
   * direction along the ground.
   */
  fitTo(pixelsPerMetre: number, pitch: number, fwdX: number, fwdZ: number): void {
    const rise = this.height * Math.cos(pitch) * pixelsPerMetre;
    this.setShells(Math.ceil(rise / 2) + 1);
    const gap = rise / this.shells;
    const u = this.uniforms;
    u.uPpm.value = pixelsPerMetre;
    u.uHalfW.value = 0.56 / pixelsPerMetre;
    u.uHalfL.value = (gap / 2 + 0.55) / (pixelsPerMetre * Math.sin(pitch));
    const l = Math.hypot(fwdX, fwdZ) || 1;
    (u.uFwd.value as THREE.Vector2).set(fwdX / l, fwdZ / l);
  }

  setShells(n: number): void {
    n = Math.max(2, Math.min(GrassView.MAX_SHELLS, n));
    if (n === this.shells) return;
    this.shells = n;
    // the top layer first: it is nearest the camera, so the layers under it lose the pixels it
    // covers to the depth test before they shade
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, m.makeTranslation(0, (this.height * (n - i - 0.5)) / n, 0));
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // the lowest layer is solid wherever there is grass: no ground speckling through the roots
    this.uniforms.uBottom.value = 1 / n;
  }

  /** Call every frame: wind, and the field's lengths when they have changed (a few times a second). */
  update(dt: number, time: number): void {
    // the wind steps ten times a second, as a pixel artist would animate it
    this.uniforms.uGrassTime.value = Math.floor(time * 10) / 10;
    this.sinceUpload += dt;
    if (this.field.version !== this.uploaded && this.sinceUpload >= 0.15) this.upload();
  }

  private upload(): void {
    const L = this.field.length;
    const cap = this.field.cap;
    const d = this.data;
    for (let k = 0; k < L.length; k++) {
      d[k * 2] = Math.round(Math.min(1, L[k]) * 255);
      d[k * 2 + 1] = Math.round(Math.min(1, cap[k]) * 255);
    }
    this.texture.needsUpdate = true;
    this.uploaded = this.field.version;
    this.sinceUpload = 0;
  }

  /** For the ground shader: the field texture and the world size it covers. */
  get groundInfo(): { map: THREE.Texture; size: THREE.Vector2 } {
    return { map: this.texture, size: this.uniforms.uGrassSize.value as THREE.Vector2 };
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function grassMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshLambertMaterial {
  const m = toon(0xffffff, { unique: true });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vGWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
      )
      // every layer takes its shadow from the ground under it, so a blade is shadowed as one
      // piece by its root (no speckle up the blade, no acne between layers)
      .replace('#include <shadowmap_vertex>', '#ifdef USE_SHADOWMAP\nworldPosition.y -= instanceMatrix[3].y;\n#endif\n#include <shadowmap_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGWorld;
uniform sampler2D uGrassMap;
uniform vec2 uGrassSize;
uniform float uGrassH, uGrassTime, uCell, uHalfW, uHalfL, uPpm, uBottom;
uniform vec2 uFwd;
uniform vec3 uGSwamp, uGPine, uGGrass, uGLeaf, uGMeadow, uGHay, uGOlive, uGMoss;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  // how far up the blade this layer is (0 root .. 1 the tallest blade's tip)
  float t = vGWorld.y / uGrassH;
  vec2 w = vGWorld.xz;
  float len = texture2D(uGrassMap, w / uGrassSize).r;
  // grazed short here? then most layers are gone before any work is done
  if (t > len) discard;
  bool base = t < uBottom && len > 0.12;
  // wind: gusts roll across the meadow (a slow noise scrolling at a few metres a second); they
  // bend the blades over, downwind, and the blades catch the light
  float gust = gNoise(w * vec2(0.07, 0.045) + vec2(uGrassTime * 0.45, uGrassTime * 0.12));
  float g = smoothstep(0.3, 0.8, gust);
  vec2 wind = vec2(0.86, 0.5) * (0.02 + 0.12 * g) + vec2(sin(uGrassTime * 2.3 + w.x * 0.8), cos(uGrassTime * 1.9 + w.y * 0.7)) * 0.012;
  // Tufts, one per cell: three blades from a shared root, each its own height and lean, so
  // they draw as little \|/ strokes with the darker sward showing between. A blade leaning
  // downwind can reach into the next cells, so the two upwind neighbours are looked at too.
  vec2 across = vec2(-uFwd.y, uFwd.x);
  bool hit = false;
  float hu = 0.0;
  float hr = 0.0;
  float hh = 0.0;
  vec2 hc = vec2(0.0);
  if (!base) {
    for (int nb = 0; nb < 3; nb++) {
      vec2 cell = floor(w / uCell) - (nb == 1 ? vec2(1.0, 0.0) : (nb == 2 ? vec2(0.0, 1.0) : vec2(0.0)));
      vec2 local = w - (cell + 0.5) * uCell;
      float sward = gNoise(cell * uCell * 0.22 + 11.7);
      float clump = gHash(cell + 3.7);
      float tuft = mix(0.36, 1.0, sward * sward * (3.0 - 2.0 * sward)) * (0.6 + 0.4 * clump);
      vec2 root = (vec2(gHash(cell + 1.3), gHash(cell + 9.1)) - 0.5) * uCell * 0.2;
      for (int b = 0; b < 3; b++) {
        float rb = gHash(cell + float(b) * 7.31 + 0.5);
        float h = len * tuft * (0.62 + 0.38 * rb);
        if (t > h) continue;
        float u = t / h;
        // splayed: the middle blade nearly upright, the outer two leaning out either side
        float a = 6.2832 * gHash(cell + 2.9) + float(b) * 2.1;
        vec2 lean = vec2(cos(a), sin(a)) * uCell * (b == 1 ? 0.06 : 0.32) * (0.7 + 0.3 * rb);
        vec2 c = root + (lean + wind) * u * u;
        vec2 d = local - c;
        if (abs(dot(d, across)) < uHalfW * (1.0 - 0.25 * u) && abs(dot(d, uFwd)) < uHalfL) {
          hit = true; hu = u; hr = rb; hh = h; hc = cell;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) discard;
  }
  // colour: the meadow's patches as three-step ramps from the palette's greens (exact colours,
  // nothing for quantising to flicker between): the sward between the blades one step darker,
  // the blades, and lighter tips on the tall blades and wherever a gust bends them into the
  // light. The olive ramp where it is grazed short.
  vec2 pc = base ? floor(w / uCell) : hc;
  float n = gNoise(pc * uCell * 0.09) * 0.65 + gNoise(pc * uCell * 0.31 + 7.0) * 0.35;
  vec3 dark = n < 0.28 ? uGPine : (n > 0.68 ? uGLeaf : uGGrass);
  vec3 body = n < 0.28 ? uGGrass : (n > 0.68 ? uGMeadow : uGLeaf);
  vec3 light = n < 0.28 ? uGLeaf : uGMeadow;
  vec3 c = base ? dark : body;
  if (!base && hu > 0.62 && ((hh > 0.45 && hr > 0.4) || fract(hr * 7.13) < g)) c = light;
  if (!base && hu > 0.7 && hr > 0.99) c = uGHay;
  if (len < 0.4) c = (base || hu < 0.4) ? uGOlive : uGMoss;
  diffuseColor.rgb = c;
}`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 2.0;');
  };
  m.customProgramCacheKey = () => 'grass-strokes-v3';
  return m;
}
