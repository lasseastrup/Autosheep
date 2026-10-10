import * as THREE from 'three';
import { C } from '../engine/palette';
import { noOutline, toon } from '../engine/toon';
import type { GrassField } from '../sim/grass';

/**
 * Grass you can see the flock eat: shell texturing. The meadow is drawn again as a stack of
 * thin horizontal layers ("shells") a few centimetres apart; each layer keeps only the pixels
 * that fall inside a blade at that height. Blades sit one to a small cell, each with its own
 * height, and taper from root to tip, so the stack reads as a sward of tufts. A blade's height
 * is also scaled by the grass field (src/sim/grass.ts), uploaded as a texture, so grazed ground
 * shows short yellowed stubble and untouched ground long green grass.
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
      uBlade: { value: 0.17 },
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
   * How many layers: enough that neighbouring layers are about a pixel apart on screen at
   * `pixelsPerMetre` (with the camera's pitch), so blades look solid rather than sliced. Blades
   * taper, so a little over a pixel does not show.
   */
  fitTo(pixelsPerMetre: number, pitch: number): void {
    this.setShells(Math.ceil((this.height * Math.cos(pitch) * pixelsPerMetre) / 1.3) + 1);
    // wind moves blades by whole pixels
    this.uniforms.uPpm.value = pixelsPerMetre;
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
uniform float uGrassH, uGrassTime, uBlade, uPpm, uBottom;
uniform vec3 uGSwamp, uGPine, uGGrass, uGLeaf, uGMeadow, uGHay, uGOlive, uGMoss;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  // how far up the blade this layer is (0 root .. 1 a full blade's tip)
  float t = vGWorld.y / uGrassH;
  vec2 w = vGWorld.xz;
  // wind: gusts roll across the meadow (a slow noise scrolling at a few metres a second) and
  // lean the tips over, with a little flutter; roots stay put. Rounded to whole pixels.
  float gust = gNoise(w * vec2(0.07, 0.045) + vec2(uGrassTime * 0.45, uGrassTime * 0.12));
  vec2 lean = vec2(0.85, 0.4) * max(gust - 0.25, 0.0) * 1.1 + vec2(sin(uGrassTime * 2.1 + w.x * 0.7), cos(uGrassTime * 1.7 + w.y * 0.6)) * 0.06;
  lean = floor(lean * t * t * uPpm + 0.5) / uPpm;
  vec2 p = w - lean;
  // grazed short here? then most layers are gone before any work is done
  float len = texture2D(uGrassMap, p / uGrassSize).r;
  if (t > len) discard;
  // one blade per cell, each its own height: patches of tall and shorter grass a few metres
  // across, tufts within them, the odd tall stalk, all scaled by how long the grass is here
  vec2 q = p / uBlade;
  vec2 cell = floor(q);
  float r = gHash(cell);
  float clump = gNoise(cell * uBlade * 2.2 + 3.1);
  float sward = gNoise(cell * uBlade * 0.22 + 11.7);
  float h = len * mix(0.38, 1.0, sward * sward * (3.0 - 2.0 * sward)) * (r > 0.94 ? 1.0 : 0.42 + 0.3 * r + 0.28 * clump);
  bool base = t < uBottom && len > 0.12;
  if (t > h && !base) discard;
  // tapering from a fat root to a point, from a centre jittered in its cell so no grid shows
  vec2 off = vec2(gHash(cell + 17.3), gHash(cell + 41.9)) - 0.5;
  vec2 f = fract(q) - 0.5 - off * 0.4;
  float k = 1.0 - t / max(h, 1e-3);
  if (!base && dot(f, f) > 0.26 * k * k) discard;
  // colour per blade, not per pixel, so the sward reads calm, in exact palette greens (nothing
  // for quantising to flicker between). Each of the meadow's patches is a three-step ramp: the
  // roots one step darker (the shade down in the sward), the blades, and tips one step lighter
  // on the taller blades. A rare hay-yellow tip; the olive ramp where it is grazed short.
  float n = gNoise(cell * uBlade * 0.09) * 0.65 + gNoise(cell * uBlade * 0.31 + 7.0) * 0.35;
  float up = t / max(h, 1e-3);
  vec3 dark = n < 0.26 ? uGPine : (n > 0.6 ? uGLeaf : uGGrass);
  vec3 body = n < 0.26 ? uGGrass : (n > 0.6 ? uGMeadow : uGLeaf);
  vec3 light = n < 0.26 ? uGLeaf : (n > 0.6 ? uGHay : uGMeadow);
  // tips catch the light only up where the tall grass is (absolute height), so tall patches
  // read bright-topped and short ones darker: you can see the sward's height from above
  vec3 c = (base || up < 0.3) ? dark : body;
  if (!base && up > 0.5 && t > 0.36) c = light;
  // a gust bends the blades over and they catch the light: bright bands roll across the meadow
  // with the wind (blade by blade at their edges, so they stay pixel art)
  if (!base && up > 0.4 && fract(r * 7.13) < smoothstep(0.58, 0.8, gust)) c = light;
  if (!base && up > 0.7 && r > 0.993) c = uGHay;
  if (len < 0.4) c = (base || up < 0.4) ? uGOlive : uGMoss;
  diffuseColor.rgb = c;
}`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 2.0;');
  };
  m.customProgramCacheKey = () => 'grass-shells-v10';
  return m;
}
