import * as THREE from 'three';
import { srgbHexToOklab, hexToRgb } from './color';
import { NO_OUTLINE_LAYER } from './toon';

/**
 * The pixel-art pipeline.
 *
 *  1. normal pass  – outlined geometry only: view-space normal + linear depth (HalfFloat)
 *  2. colour pass  – everything, HDR linear (HalfFloat), at the low internal resolution
 *  3. bloom        – bright-pass + separable blur at half res (gives dithered glows)
 *  4. pixel pass   – depth-edge outlines (darken), crease highlights (lighten), linear->sRGB,
 *                    OKLab nearest-palette quantisation with 4x4 Bayer dithering between the
 *                    two nearest palette colours
 *  5. screen pass  – integer nearest upscale to the canvas with a sub-pixel camera offset
 *                    (smooth pans without pixel crawl), the 2D overlay, and transitions
 *
 * Everything is rendered with a margin of MARGIN pixels so sub-pixel shifts and screen
 * shake never reveal an edge.
 */

export const MARGIN = 4;

export interface PostSettings {
  outline: number; // 0..1 darkening of silhouette pixels
  highlight: number; // crease highlight strength
  depthAbs: number; // absolute depth jump (world units) that counts as an edge
  depthRel: number; // plus this fraction of the depth
  normalThreshold: number;
  dither: number; // 0..1 ordered dither amount between the two nearest palette colours
  ditherMaxDist: number; // OKLab distance beyond which two palette colours are never dithered
  quantize: number; // 0 = raw colour, 1 = snapped to palette
  bloom: number;
  bloomThreshold: number;
  exposure: number;
  saturation: number;
  outlineColor: THREE.Color | null; // fixed outline colour instead of darkening (null = darken)
}

export const defaultPost = (): PostSettings => ({
  outline: 0.68,
  highlight: 0.35,
  depthAbs: 0.08,
  depthRel: 0.02,
  normalThreshold: 0.12,
  dither: 0.85,
  ditherMaxDist: 0.22,
  quantize: 1,
  bloom: 0.9,
  bloomThreshold: 1.6,
  exposure: 1,
  saturation: 1,
  outlineColor: null,
});

export interface ScreenFx {
  fade: number; // 0..1 dithered dissolve to fadeColor
  fadeColor: THREE.Color;
  iris: number; // radius in low-res px; < 0 disables
  irisCenter: THREE.Vector2; // low-res px, origin top-left
  bars: number; // letterbox bar height in low-res px
  shake: THREE.Vector2; // px
  flash: number; // 0..1 white flash
  invert: number; // 0/1
  scanlines: number; // 0..1, CRT style darkening of every other row (scanner screens)
}

export const defaultFx = (): ScreenFx => ({
  fade: 0,
  fadeColor: new THREE.Color(0, 0, 0),
  iris: -1,
  irisCenter: new THREE.Vector2(240, 135),
  bars: 0,
  shake: new THREE.Vector2(),
  flash: 0,
  invert: 0,
  scanlines: 0,
});

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NORMAL_VERT = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vViewNormal;
varying float vViewDepth;
void main() {
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vViewNormal = normalize(transformedNormal);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewDepth = -mvPosition.z;
}`;

const NORMAL_FRAG = /* glsl */ `
varying vec3 vViewNormal;
varying float vViewDepth;
void main() {
  vec3 n = normalize(vViewNormal);
  if (!gl_FrontFacing) n = -n;
  gl_FragColor = vec4(n * 0.5 + 0.5, vViewDepth);
}`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tColor; uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.6, l), 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tInput, vUv).rgb * 0.227027;
  s += texture2D(tInput, vUv + uDir * 1.3846).rgb * 0.316216;
  s += texture2D(tInput, vUv - uDir * 1.3846).rgb * 0.316216;
  s += texture2D(tInput, vUv + uDir * 3.2307).rgb * 0.070270;
  s += texture2D(tInput, vUv - uDir * 3.2307).rgb * 0.070270;
  gl_FragColor = vec4(s, 1.0);
}`;

const PIXEL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tBloom;
uniform sampler2D tPalette; // row 0: OKLab, row 1: sRGB
uniform int uPaletteSize;
uniform vec2 uRes;
uniform float uOutline, uHighlight, uDepthAbs, uDepthRel, uNormalThreshold;
uniform float uDither, uDitherMaxDist, uQuantize, uBloom, uExposure, uSaturation;
uniform vec3 uOutlineColor; uniform float uUseOutlineColor;
uniform ivec2 uDitherOffset; // camera texel position, so dither patterns stick to the world
varying vec2 vUv;

float depthAt(ivec2 p) { return texelFetch(tNormal, p, 0).a; }
vec3 normalAt(ivec2 p) { return texelFetch(tNormal, p, 0).rgb * 2.0 - 1.0; }

vec3 linToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 linToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
float bayer4(ivec2 p) {
  int x = p.x & 3; int y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[y * 4 + x]) + 0.5) / 16.0;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(tColor, p, 0);
  vec3 col = src.rgb;
  float ditherW = src.a; // written by materials: 0 = never dither (toon), 1 = free
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col *= uExposure;

  // --- edges -------------------------------------------------------------
  float d = depthAt(p);
  vec3 n = normalAt(p);
  float thr = uDepthAbs + uDepthRel * d;
  // second difference: catches discontinuities but not sloped planes; only the near side
  float lapX = depthAt(p + ivec2(1, 0)) + depthAt(p - ivec2(1, 0)) - 2.0 * d;
  float lapY = depthAt(p + ivec2(0, 1)) + depthAt(p - ivec2(0, 1)) - 2.0 * d;
  float farX = max(depthAt(p + ivec2(1, 0)), depthAt(p - ivec2(1, 0))) - d;
  float farY = max(depthAt(p + ivec2(0, 1)), depthAt(p - ivec2(0, 1))) - d;
  float depthEdge = (max(lapX, lapY) > thr && max(farX, farY) > thr) ? 1.0 : 0.0;

  float normalEdge = 0.0;
  if (depthEdge == 0.0 && d < 9000.0) {
    ivec2 offs[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
    float acc = 0.0;
    for (int i = 0; i < 4; i++) {
      ivec2 q = p + offs[i];
      vec3 nn = normalAt(q);
      float dd = depthAt(q) - d;
      float nIndicator = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0, 1.0, 1.0))), 0.0, 1.0);
      float dIndicator = clamp(sign(dd * 0.25 + 0.0025), 0.0, 1.0);
      acc += (1.0 - dot(n, nn)) * nIndicator * dIndicator;
    }
    normalEdge = step(uNormalThreshold, acc);
  }

  if (depthEdge > 0.0) {
    col = mix(col * (1.0 - uOutline), uOutlineColor, uUseOutlineColor);
  } else {
    col *= 1.0 + uHighlight * normalEdge;
  }

  vec3 srgb = linToSrgb(col);
  float grey = dot(srgb, vec3(0.299, 0.587, 0.114));
  srgb = clamp(mix(vec3(grey), srgb, uSaturation), 0.0, 1.0);

  // --- palette -----------------------------------------------------------
  if (uQuantize > 0.0) {
    vec3 lab = linToOklab(pow((srgb + 0.055) / 1.055, vec3(2.4)));
    float d1 = 1e9, d2 = 1e9; int i1 = 0, i2 = 0;
    for (int i = 0; i < 128; i++) {
      if (i >= uPaletteSize) break;
      vec3 pl = texelFetch(tPalette, ivec2(i, 0), 0).rgb;
      vec3 dv = lab - pl;
      dv.yz *= 1.5; // keep hue/chroma: a lighter or darker neighbour beats a hue jump
      float dist = dot(dv, dv);
      if (dist < d1) { d2 = d1; i2 = i1; d1 = dist; i1 = i; }
      else if (dist < d2) { d2 = dist; i2 = i; }
    }
    // ordered dither between the nearest colour and the runner-up, but only along the segment
    // joining them (projection) and only when they are neighbours, so flat areas stay clean.
    vec3 c1 = texelFetch(tPalette, ivec2(i1, 0), 0).rgb;
    vec3 c2 = texelFetch(tPalette, ivec2(i2, 0), 0).rgb;
    vec3 seg = c2 - c1;
    float segLen2 = max(dot(seg, seg), 1e-6);
    float t = clamp(dot(lab - c1, seg) / segLen2, 0.0, 1.0);
    float near = 1.0 - smoothstep(uDitherMaxDist * 0.7, uDitherMaxDist, sqrt(segLen2));
    int pick = (t * near > mix(0.5, bayer4(p + uDitherOffset), uDither * ditherW)) ? i2 : i1;
    vec3 q = texelFetch(tPalette, ivec2(pick, 1), 0).rgb;
    srgb = mix(srgb, q, uQuantize);
  }
  gl_FragColor = vec4(srgb, 1.0);
}`;

const SCREEN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tPixel;
uniform sampler2D tOverlay;
uniform vec2 uRes;       // logical low-res size (no margin)
uniform float uScale;    // integer upscale
uniform vec2 uOffset;    // sub-pixel camera remainder + shake, in low-res px
uniform float uMargin;
uniform float uFade; uniform vec3 uFadeColor;
uniform float uIris; uniform vec2 uIrisCenter;
uniform float uBars, uFlash, uInvert, uScanlines;
uniform float uUseOverlay;

float bayer4(ivec2 p) {
  int x = p.x & 3; int y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[y * 4 + x]) + 0.5) / 16.0;
}

void main() {
  vec2 px = gl_FragCoord.xy / uScale;          // low-res px, origin bottom-left
  vec2 src = px + uOffset + vec2(uMargin);
  vec3 c = texelFetch(tPixel, ivec2(floor(src)), 0).rgb;

  ivec2 ip = ivec2(floor(px));
  ivec2 ipTop = ivec2(ip.x, int(uRes.y) - 1 - ip.y); // origin top-left for the overlay / fx

  if (float(ipTop.y) < uBars || float(ipTop.y) >= uRes.y - uBars) c = vec3(0.0);
  if (uUseOverlay > 0.5) {
    vec4 o = texture2D(tOverlay, (vec2(ip) + 0.5) / uRes);
    c = mix(c, o.rgb, o.a);
  }
  if (uScanlines > 0.0 && (ipTop.y & 1) == 1) c *= 1.0 - 0.35 * uScanlines;
  if (uInvert > 0.5) c = 1.0 - c;
  if (uFlash > 0.0 && bayer4(ip) < uFlash) c = vec3(1.0);
  if (uFade > 0.0 && bayer4(ip) < uFade) c = uFadeColor;
  if (uIris >= 0.0) {
    vec2 dv = vec2(ipTop) + 0.5 - uIrisCenter;
    if (dot(dv, dv) > uIris * uIris) c = vec3(0.0);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

function makeRT(w: number, h: number, depth: boolean, type: THREE.TextureDataType = THREE.HalfFloatType): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly width: number;
  readonly height: number;
  readonly padW: number;
  readonly padH: number;
  scale = 1;
  post: PostSettings = defaultPost();
  fx: ScreenFx = defaultFx();
  /** Snap orthographic cameras to the pixel grid and hand the remainder to the screen pass. */
  snapOrtho = true;

  readonly overlayCanvas: HTMLCanvasElement;
  readonly overlay: CanvasRenderingContext2D;
  private overlayTex: THREE.CanvasTexture;
  overlayUsed = false;

  private colorRT: THREE.WebGLRenderTarget;
  private normalRT: THREE.WebGLRenderTarget;
  private brightRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private pixelRT: THREE.WebGLRenderTarget;
  private normalMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private pixelMat: THREE.ShaderMaterial;
  private screenMat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private paletteTex: THREE.DataTexture | null = null;
  private subpixel = new THREE.Vector2();
  private ditherOffset = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, width = 480, height = 270) {
    this.width = width;
    this.height = height;
    this.padW = width + MARGIN * 2;
    this.padH = height + MARGIN * 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the pixel pass writes sRGB itself

    this.colorRT = makeRT(this.padW, this.padH, true);
    this.normalRT = makeRT(this.padW, this.padH, true);
    const bw = Math.ceil(this.padW / 2), bh = Math.ceil(this.padH / 2);
    this.brightRT = makeRT(bw, bh, false);
    this.blurRT = makeRT(bw, bh, false);
    this.brightRT.texture.minFilter = this.brightRT.texture.magFilter = THREE.LinearFilter;
    this.blurRT.texture.minFilter = this.blurRT.texture.magFilter = THREE.LinearFilter;
    this.pixelRT = makeRT(this.padW, this.padH, false, THREE.UnsignedByteType);

    this.normalMat = new THREE.ShaderMaterial({ vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG, side: THREE.DoubleSide });
    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: BRIGHT_FRAG,
      uniforms: { tColor: { value: null }, uThreshold: { value: 1 } },
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: BLUR_FRAG,
      uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
    });
    this.pixelMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: PIXEL_FRAG,
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tNormal: { value: this.normalRT.texture },
        tBloom: { value: this.blurRT.texture },
        tPalette: { value: null },
        uPaletteSize: { value: 0 },
        uRes: { value: new THREE.Vector2(this.padW, this.padH) },
        uOutline: { value: 0 }, uHighlight: { value: 0 }, uDepthAbs: { value: 0 }, uDepthRel: { value: 0 },
        uNormalThreshold: { value: 0 }, uDither: { value: 0 }, uDitherMaxDist: { value: 0.2 }, uQuantize: { value: 0 }, uBloom: { value: 0 },
        uExposure: { value: 1 }, uSaturation: { value: 1 },
        uOutlineColor: { value: new THREE.Color() }, uUseOutlineColor: { value: 0 },
        uDitherOffset: { value: new THREE.Vector2() },
      },
    });

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.overlay = this.overlayCanvas.getContext('2d', { willReadFrequently: true })!;
    this.overlay.imageSmoothingEnabled = false;
    this.overlayTex = new THREE.CanvasTexture(this.overlayCanvas);
    this.overlayTex.minFilter = this.overlayTex.magFilter = THREE.NearestFilter;
    this.overlayTex.generateMipmaps = false;
    this.overlayTex.colorSpace = THREE.NoColorSpace;

    this.screenMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: SCREEN_FRAG,
      uniforms: {
        tPixel: { value: this.pixelRT.texture },
        tOverlay: { value: this.overlayTex },
        uRes: { value: new THREE.Vector2(width, height) },
        uScale: { value: 1 },
        uOffset: { value: new THREE.Vector2() },
        uMargin: { value: MARGIN },
        uFade: { value: 0 }, uFadeColor: { value: new THREE.Color() },
        uIris: { value: -1 }, uIrisCenter: { value: new THREE.Vector2() },
        uBars: { value: 0 }, uFlash: { value: 0 }, uInvert: { value: 0 }, uScanlines: { value: 0 },
        uUseOverlay: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setPalette(hexes: string[]): void {
    const n = hexes.length;
    const data = new Float32Array(n * 2 * 4);
    hexes.forEach((h, i) => {
      const lab = srgbHexToOklab(h);
      const rgb = hexToRgb(h);
      data.set([lab[0], lab[1], lab[2], 1], i * 4);
      data.set([rgb[0], rgb[1], rgb[2], 1], (n + i) * 4);
    });
    this.paletteTex?.dispose();
    this.paletteTex = new THREE.DataTexture(data, n, 2, THREE.RGBAFormat, THREE.FloatType);
    this.paletteTex.minFilter = this.paletteTex.magFilter = THREE.NearestFilter;
    this.paletteTex.needsUpdate = true;
    this.pixelMat.uniforms.tPalette.value = this.paletteTex;
    this.pixelMat.uniforms.uPaletteSize.value = n;
  }

  /** Fit the canvas to a box (CSS px) at the largest integer scale (fractional below 1x). */
  resize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1, fixedScale?: number): void {
    const devW = cssW * dpr, devH = cssH * dpr;
    const fit = Math.min(devW / this.width, devH / this.height);
    let s = fixedScale ?? Math.floor(fit);
    if (s < 1) s = 1;
    this.scale = s;
    const w = this.width * s, h = this.height * s;
    this.renderer.setSize(w, h, false);
    const canvas = this.renderer.domElement;
    // Below 1x the 1x canvas is shrunk to fit rather than cropped. On dense phone screens the
    // whole-number scale can leave much of the screen empty (a phone held upright); there the
    // picture is stretched to fit, since uneven pixel widths are invisible at 3 device pixels
    // per CSS pixel. Desktop screens keep exact pixels.
    const fill = fixedScale === undefined && (fit < 1 || (dpr >= 2 && fit / s > 1.1)) ? fit / s : 1;
    canvas.style.width = `${(w * fill) / dpr}px`;
    canvas.style.height = `${(h * fill) / dpr}px`;
  }

  clearOverlay(): CanvasRenderingContext2D {
    this.overlay.clearRect(0, 0, this.width, this.height);
    this.overlayUsed = false;
    return this.overlay;
  }

  markOverlay(): void {
    this.overlayUsed = true;
  }

  private applyMargin(camera: THREE.Camera): void {
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    cam.setViewOffset(this.width, this.height, -MARGIN, -MARGIN, this.padW, this.padH);
  }

  private clearMargin(camera: THREE.Camera): void {
    (camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).clearViewOffset();
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    const p = this.post;

    // --- pixel-grid snapping for orthographic cameras ---
    const savedPos = camera.position.clone();
    this.subpixel.set(0, 0);
    this.ditherOffset.set(0, 0);
    if (this.snapOrtho && (camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const oc = camera as THREE.OrthographicCamera;
      oc.updateMatrixWorld();
      const upp = (oc.top - oc.bottom) / oc.zoom / this.height;
      const right = new THREE.Vector3().setFromMatrixColumn(oc.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(oc.matrixWorld, 1);
      const x = oc.position.dot(right), y = oc.position.dot(up);
      const sx = Math.round(x / upp) * upp, sy = Math.round(y / upp) * upp;
      oc.position.addScaledVector(right, sx - x).addScaledVector(up, sy - y);
      oc.updateMatrixWorld();
      this.subpixel.set((x - sx) / upp, (y - sy) / upp);
      this.ditherOffset.set(Math.round(sx / upp) & 1023, Math.round(sy / upp) & 1023);
    }

    this.applyMargin(camera);
    const savedMask = camera.layers.mask;

    // normal + depth of outlined geometry
    const savedBg = scene.background;
    const savedFog = scene.fog;
    const savedOverride = scene.overrideMaterial;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    camera.layers.set(0);
    r.setRenderTarget(this.normalRT);
    r.setClearColor(new THREE.Color(0.5, 0.5, 1.0), 10000);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = savedOverride;
    scene.background = savedBg;
    scene.fog = savedFog;

    // colour
    camera.layers.set(0);
    camera.layers.enable(NO_OUTLINE_LAYER);
    r.setRenderTarget(this.colorRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, camera);
    camera.layers.mask = savedMask;

    this.clearMargin(camera);
    camera.position.copy(savedPos);
    camera.updateMatrixWorld();

    // bloom
    if (p.bloom > 0) {
      this.brightMat.uniforms.tColor.value = this.colorRT.texture;
      this.brightMat.uniforms.uThreshold.value = p.bloomThreshold;
      this.blit(this.brightMat, this.brightRT);
      for (let i = 0; i < 2; i++) {
        this.blurMat.uniforms.tInput.value = this.brightRT.texture;
        this.blurMat.uniforms.uDir.value.set(1 / this.brightRT.width, 0);
        this.blit(this.blurMat, this.blurRT);
        this.blurMat.uniforms.tInput.value = this.blurRT.texture;
        this.blurMat.uniforms.uDir.value.set(0, 1 / this.brightRT.height);
        this.blit(this.blurMat, this.brightRT);
      }
      this.blurMat.uniforms.tInput.value = this.brightRT.texture;
      this.blurMat.uniforms.uDir.value.set(1.5 / this.brightRT.width, 0);
      this.blit(this.blurMat, this.blurRT);
    }

    const u = this.pixelMat.uniforms;
    u.uOutline.value = p.outline;
    u.uHighlight.value = p.highlight;
    u.uDepthAbs.value = p.depthAbs;
    u.uDepthRel.value = p.depthRel;
    u.uNormalThreshold.value = p.normalThreshold;
    u.uDither.value = p.dither;
    u.uDitherMaxDist.value = p.ditherMaxDist;
    u.uQuantize.value = this.paletteTex ? p.quantize : 0;
    u.uBloom.value = p.bloom;
    u.uExposure.value = p.exposure;
    (u.uDitherOffset.value as THREE.Vector2).copy(this.ditherOffset);
    u.uSaturation.value = p.saturation;
    u.uUseOutlineColor.value = p.outlineColor ? 1 : 0;
    if (p.outlineColor) (u.uOutlineColor.value as THREE.Color).copy(p.outlineColor);
    this.blit(this.pixelMat, this.pixelRT);

    this.present();
  }

  /** Screen pass only (also used for overlay-only frames). */
  present(): void {
    const f = this.fx;
    const s = this.screenMat.uniforms;
    s.uScale.value = this.scale;
    (s.uOffset.value as THREE.Vector2).set(this.subpixel.x + f.shake.x, this.subpixel.y - f.shake.y);
    s.uFade.value = f.fade;
    (s.uFadeColor.value as THREE.Color).copy(f.fadeColor);
    s.uIris.value = f.iris;
    (s.uIrisCenter.value as THREE.Vector2).copy(f.irisCenter);
    s.uBars.value = f.bars;
    s.uFlash.value = f.flash;
    s.uInvert.value = f.invert;
    s.uScanlines.value = f.scanlines;
    s.uUseOverlay.value = this.overlayUsed ? 1 : 0;
    if (this.overlayUsed) this.overlayTex.needsUpdate = true;
    this.blit(this.screenMat, null);
  }
}
