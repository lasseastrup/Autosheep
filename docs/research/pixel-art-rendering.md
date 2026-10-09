# Pixel-art rendering of 3D scenes in three.js: research notes for Autosheep

Status: research, 2026-10-09. The three.js APIs below were checked against **r186** (npm `three@0.186.1`):
`examples/jsm/postprocessing/{RenderPixelatedPass,OutputPass,EffectComposer}.js`,
`examples/webgl_postprocessing_pixel.html`, `examples/jsm/tsl/display/PixelationPassNode.js`,
`src/renderers/webgl/{WebGLPrograms,WebGLProgram}.js`, `src/math/ColorManagement.js`, and the `packing` shader chunk.
Font metrics were measured with fontTools on the `@fontsource/*@5.3.0` npm files.
Several primary pages (davidhol.land, lospec.com, gamedeveloper.com, bottosson.github.io) could not be fetched from this
environment. Their content comes from search excerpts and GitHub mirrors, and the sources list marks which is which.

---

## 1. Recommended pipeline (summary)

The look we want is t3ssel8r-style "3D pixel art": a low-resolution render with a stable pixel grid,
1-pixel outlines, highlights on convex edges, stepped toon light, a fixed palette, and smooth camera motion.
Use the same pipeline for the cutscene and the game. Treat **pixel size as a style constant**: zoom by changing world
units per texel, never by changing the size of the screen pixel.

```
 Scene (ramp-toon materials) ─┐   ortho camera snapped to the texel grid (sub-texel error kept)
                              ├─► RT_color  (W+2m)×(H+2m)  HalfFloat, Nearest      [all layers]
 Outline layer 0 only ────────┴─► RT_gbuf   same size: view normals + DepthTexture  [layer 0]
 ① Outline pass      @low-res: depth silhouettes darken, convex creases brighten
 ② Low-res FX        @low-res: fog, bloom (½ low-res), HD-2D tilt-shift (cutscenes), particles
 ③ Palette pass      @low-res: linear→OKLab, nearest 2 palette colours, 4×4 Bayer anchored to the world → sRGB bytes
 ④ UI pass           @low-res: separate RT, palette colours only, pixel fonts, no camera offset
 ⑤ Upscale pass      @canvas : sharp-bilinear (or integer nearest), applies the sub-texel camera offset,
                                crops margin m, composites UI. Writes sRGB directly (no OutputPass).
```

| Decision | Recommendation |
|---|---|
| Renderer | `WebGLRenderer({antialias:false})` + `EffectComposer` + custom GLSL passes. This works under headless SwiftShader. `WebGPURenderer` + `RenderPipeline` + TSL `pixelationPass` exists in r186 for a later migration. |
| Internal resolution | **640×360** visible, plus 1 texel of margin per side (RT 642×362). Integer scales: ×2 720p, ×3 1080p, ×4 1440p, ×6 4K. 480×270 is chunkier but non-integer at 1440p. Keep 640×360 for cutscenes too, so the pixel grain matches the game. For other aspect ratios: `scale = max(1, floor(screenH/360))`, `W = ceil(screenW/scale)`, `H = ceil(screenH/scale)`. |
| Camera | `OrthographicCamera`, yaw 45°, **pitch 30°**, which gives exact 2:1 pixel-art "isometric" lines (`slope = sin(pitch)`). With 1-unit tiles, `unitsPerTexel = √2/32 ≈ 0.04419`, so one tile is a 32×16 px diamond and tile corners land on texel corners. View rotation in 90° steps only. Zoom through a small set of `unitsPerTexel` values. |
| Lighting | 3 bands (shadow / mid / lit) plus an optional 4th highlight band. Band colours come from hand-picked **palette ramps**. A static sun, or one that moves in discrete steps. `PCFShadowMap` 2048 (use `BasicShadowMap` 1024 for headless). |
| Outlines | Depth silhouettes darken by ×0.5. Convex normal creases brighten by ×1.35. Depth threshold **0.2 world units** with slope scale 4. Normal threshold **0.25** (1−cos ≈ 41°). |
| Palette | **Resurrect 64**, with Endesga 32 as a punchier alternative. Quantize in OKLab. 4×4 Bayer dither only between nearby colours (OKLab dist ≤ 0.15), at strength 0.6–1.0. |
| Upscale | Integer scale: nearest with the offset rounded to the screen pixel. Non-integer scale: sharp-bilinear AA. |
| Motion | Positions snapped to texels. Sheep yaw snapped to 16 directions. Skeletal animation sampled at **12 fps**. Particles texel-snapped with integer point sizes. |
| Text | **Jersey 10** for dialogue (font-size 18.6667 px gives 10 px caps). **Tiny5** for HUD (8 px gives 5 px caps). **Jersey 15/20/25** or **Press Start 2P** (16/24 px) for titles. Glyphs are drawn with an alpha threshold into the low-res UI layer. |
| Colour | Every pass before ③ is linear. ③ outputs sRGB-encoded palette bytes. ⑤ must not re-encode them, so use no `OutputPass` and no `colorspace_fragment`. `toneMapping = NoToneMapping`. |

---

## 2. Techniques

### 2.1 Render targets and canvas sizing

```ts
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.devicePixelRatio);       // compute integer scale in *physical* pixels
renderer.toneMapping = THREE.NoToneMapping;            // tone mapping only applies to the null target anyway
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = true;

const M = 1;                                           // margin texels per side
function lowResRT(w: number, h: number, depth = false, type = THREE.HalfFloatType) {
  const rt = new THREE.WebGLRenderTarget(w + 2 * M, h + 2 * M, {
    type, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false, samples: 0, depthBuffer: true,
  });
  if (depth) rt.depthTexture = new THREE.DepthTexture(w + 2 * M, h + 2 * M);
  return rt;
}
// RT_color: HalfFloat + depth. RT_gbuf: HalfFloat normals + its own DepthTexture.
// RT_pal: UnsignedByteType (holds sRGB bytes); give it LinearFilter if the upscale uses sharp-bilinear.
```

To get exact physical canvas sizes on fractional-DPR displays, use
`ResizeObserver` with `devicePixelContentBoxSize`. Letterbox any remainder so that the scale stays an integer.

### 2.2 Camera: isometric ortho, texel snapping, sub-texel compensation

This is the core trick from t3ssel8r, as reconstructed by David Holland, denovodavid, UPixelator and others.
Snap the camera to a texel-sized grid in the view plane, which removes pixel creep. Then shift the upscaled image by the
snap error, which brings smooth motion back. The three.js example does the same thing by shifting the frustum
(`pixelAlignFrustum`). The two methods are equivalent.

```ts
export class PixelCamera {
  readonly cam: THREE.OrthographicCamera;
  readonly focus = new THREE.Vector3();          // smooth, unsnapped target (gameplay / cutscene spline)
  readonly subTexel = new THREE.Vector2();       // snap error in texels, range [-0.5, 0.5]
  readonly camTexel = new THREE.Vector2();       // integer snapped position in texels (anchors the dither)
  private r = new THREE.Vector3(); private u = new THREE.Vector3(); private b = new THREE.Vector3();
  constructor(public W: number, public H: number, public unitsPerTexel = Math.SQRT2 / 32,
              yawDeg = 45, pitchDeg = 30, private dist = 100) {
    const hw = (W / 2 + M) * unitsPerTexel, hh = (H / 2 + M) * unitsPerTexel;
    this.cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 300);
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.set(THREE.MathUtils.degToRad(-pitchDeg), THREE.MathUtils.degToRad(yawDeg), 0);
    this.cam.updateMatrixWorld();
    this.r.setFromMatrixColumn(this.cam.matrixWorld, 0);
    this.u.setFromMatrixColumn(this.cam.matrixWorld, 1);
    this.b.setFromMatrixColumn(this.cam.matrixWorld, 2);
  }
  update() {
    const p = this.focus.clone().addScaledVector(this.b, this.dist);
    const x = p.dot(this.r) / this.unitsPerTexel, y = p.dot(this.u) / this.unitsPerTexel, z = p.dot(this.b);
    const sx = Math.round(x), sy = Math.round(y);
    this.subTexel.set(x - sx, y - sy);
    this.camTexel.set(sx, sy);
    this.cam.position.set(0, 0, 0).addScaledVector(this.r, sx * this.unitsPerTexel)
      .addScaledVector(this.u, sy * this.unitsPerTexel).addScaledVector(this.b, z);
    this.cam.updateMatrixWorld();
  }
}
```

- **Sign check.** When `subTexel.x > 0`, the true camera is to the right of the snapped one, so the upscale must sample
  at `+subTexel` (§2.9). Render targets have their origin at bottom-left, so the camera's +up axis is +v.
- **Rotation and zoom.** Continuous rotation makes every edge re-rasterize. Use 90° view rotations, either instant or as a
  short animation stepped in 9–15° increments (the r186 example defaults to `cameraRotationSnap 9°` and
  `cameraZoomSnap 0.1`). Use discrete zoom levels, for example tile widths of 16/24/32/48 px:
  `unitsPerTexel = √2/tileWidthPx`.
- **Optional height grid.** A 1-unit vertical edge is `cos30°·22.63 ≈ 19.6 px`. If terrain tiers should line up with
  pixels, use a tier height of `16/19.6 = 0.8165` units, which makes each tier 16 px.

### 2.3 Snapping moving objects, rotation, and animation

Objects that move by sub-texel amounts still wobble, because their rasterization changes every frame. Snap each object's
*origin* in the camera plane. Store the true transform and restore it after rendering, as the example does.

```ts
function snapToTexel(o: THREE.Object3D, pc: PixelCamera) {           // CPU objects (few)
  const r = new THREE.Vector3().setFromMatrixColumn(pc.cam.matrixWorld, 0);
  const u = new THREE.Vector3().setFromMatrixColumn(pc.cam.matrixWorld, 1);
  const t = pc.unitsPerTexel, p = o.position;
  const dx = Math.round(p.dot(r) / t) * t - p.dot(r), dy = Math.round(p.dot(u) / t) * t - p.dot(u);
  p.addScaledVector(r, dx).addScaledVector(u, dy);
}
```

For instanced sheep (hundreds), snap in the vertex shader by applying one clip-space delta per instance:

```glsl
// in a MeshLambertMaterial via onBeforeCompile, after <project_vertex>; uRes = RT size incl. margin
vec4 o = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
vec2 px = (o.xy / o.w * 0.5 + 0.5) * uRes;
vec2 d  = (floor(px + 0.5) - px) / uRes * 2.0;      // to the nearest texel corner, in NDC
gl_Position.xy += d * gl_Position.w;
```

- **Yaw.** Quantize the rendered heading to 16 directions (22.5°) for sheep and 8 for machines. Use
  `snapObjectRotation` from the example, or `rotation.y = round(yaw/step)*step` before rendering.
- **Skeletal animation.** Drive the mixer with stepped time,
  `mixer.setTime(Math.floor(t * 12) / 12)`, so a silhouette changes only on animation frames.
  Dead Cells' 3D→pixel pipeline used the same idea: few keyframes, rendered tiny with no AA, and they still "had no fix
  for flickering pixels", which is the problem stepping and snapping address.
- **Thin parts.** Legs, antennae and fence rails thinner than about 1.5 texels at gameplay zoom will flicker. Model them
  thicker, or draw them as 1-px `Line`s.

### 2.4 Stepped toon lighting with palette ramps

The cheapest approach that keeps all of three.js's lights and shadows: use `MeshLambertMaterial`, threshold the light it
received, and look up a palette ramp. A **ramp** is a row of 3–4 hand-picked palette colours (shadow, mid, lit,
highlight). Hue-shift them the way pixel artists do, for example teal shadows under green grass.

```ts
const rampTex = new THREE.DataTexture(rampBytes, 4, NUM_RAMPS);       // RGBA8 sRGB palette colours
rampTex.colorSpace = THREE.SRGBColorSpace;                            // decoded to linear on sampling
rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter; rampTex.needsUpdate = true;
function rampMaterial(row: number) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });       // white albedo: we read pure irradiance
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uRamp: { value: rampTex }, uRow: { value: (row + 0.5) / NUM_RAMPS },
                                uCuts: { value: new THREE.Vector3(0.30, 0.70, 1.25) } });
    s.fragmentShader = 'uniform sampler2D uRamp; uniform float uRow; uniform vec3 uCuts;\n' +
      s.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
        float L = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));   // ambient + sun*shadow + point lights
        float band = step(uCuts.x, L) + step(uCuts.y, L) + step(uCuts.z, L);   // 0..3
        outgoingLight = texture2D(uRamp, vec2((band + 0.5) / 4.0, uRow)).rgb;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ramp';
  return m;
}
```

- **Thresholds.** Lambert in three.js divides by π (`BRDF_Lambert`), so set `AmbientLight` ≈ 0.25·π and the sun
  ≈ 0.75·π. That puts outgoing L at ≈0.25 in shadow and ≈1.0 in full sun: fully shadowed areas land in band 0, the terminator
  in band 1, and sunlit faces in band 2. Band 3 is reached only under strong point lights or rim light.
  Thresholding PCF output still gives a crisp shadow edge. For a quick prototype, `MeshToonMaterial.gradientMap` (a 3-texel
  `DataTexture`, Nearest) gives the steps without hue shifts. r186 documents `gradientMap` as non-colour data.
- **Coloured lights** (red alarms on the alien bridge): multiply the ramp colour by `normalize(lightTint)` and let the
  palette pass snap the result.
- **Flat vs smooth normals.** Use `flatShading` for machines and buildings, which gives crisp faces and stable bands.
  Use smooth normals for wool and terrain, where banding should follow curvature.
- **Cloud shadows** (t3ssel8r): scroll a world-space noise texture by `uTime`, then `step(0.55, noise)` multiplies L.
  Use the same function on terrain and grass so they match.
- **Moving sun.** Banded shadows crawl if the sun moves continuously. Step the direction (for example 1° every 2 s),
  or keep it fixed per scene.

### 2.5 Outlines and highlight edges

`RenderPixelatedPass`, contributed by Kody King, is the reference implementation. It compares the 4 neighbours,
darkens on depth edges (`1 − depthEdgeStrength·dei`, default 0.4) and brightens on normal edges
(`1 + normalEdgeStrength·nei`, default 0.3). Only the shallower pixel and the side facing the bias vector `(1,1,1)`
get the edge, which keeps lines 1 px wide. Its depth test is `smoothstep(0.01, 0.02, Σ clamp(dNeighbour − d))` on the
**raw depth buffer**. With the example's ortho near/far of 0.1/10, that is about 0.1 world units. With a realistic far
plane of 300 it becomes about 3 units, and the outlines disappear. So **linearize depth and use world-unit thresholds**,
and test convexity explicitly. t3ssel8r's highlights appear only on convex edges. Holland isolates them using
cross products of neighbouring texels. The plane test below is an equivalent geometric check.

```glsl
// Outline pass (ShaderMaterial, glslVersion: THREE.GLSL3). Inputs from RT_gbuf (layer 0) + RT_color.
#include <packing>
uniform sampler2D tColor, tSceneDepth, tGDepth, tNormal;
uniform vec2  uTexel;            // 1 / RT size
uniform float uNear, uFar;
uniform float uWorldPerTexel;    // ortho: unitsPerTexel
uniform float uDepthThr;         // 0.20 world units (tile = 1.0)
uniform float uSlopeScale;       // 4.0  (raise the threshold on grazing surfaces)
uniform float uNormalThr;        // 0.25 (1 - cos(angle))
uniform float uConvexEps;        // 0.1 * uWorldPerTexel
uniform vec3  uBias;             // view-space light dir: highlights sit on the lit side
uniform float uDarken;           // 0.5
uniform float uHighlight;        // 0.35
varying vec2 vUv;
float zAt(sampler2D t, vec2 uv) { return -orthographicDepthToViewZ(texture2D(t, uv).r, uNear, uFar); }
vec3 nAt(vec2 uv) { return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
vec3 pAt(vec2 uv, float z) { return vec3((uv - 0.5) / uTexel * uWorldPerTexel, -z); }
void main() {
  vec4 col = texture2D(tColor, vUv);
  float z = zAt(tGDepth, vUv);
  if (zAt(tSceneDepth, vUv) < z - 0.05) { gl_FragColor = col; return; } // covered by non-outlined stuff (grass, FX)
  vec3 n = nAt(vUv), p = pAt(vUv, z);
  float thr = uDepthThr * (1.0 + uSlopeScale * (1.0 - clamp(n.z, 0.0, 1.0)));
  const vec2 O[4] = vec2[4](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1));
  float sil = 0.0, crease = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 uv2 = vUv + O[i] * uTexel;
    float z2 = zAt(tGDepth, uv2), dz = z2 - z;
    sil = max(sil, step(thr, dz));                       // neighbour much farther: we are the silhouette pixel
    vec3 n2 = nAt(uv2);
    float sameSurf = step(-uConvexEps, dz) * step(dz, thr);          // not in front, not across a gap
    float convex   = step(dot(n, pAt(uv2, z2) - p), -uConvexEps);    // neighbour below our tangent plane
    float facing   = step(0.0, dot(n - n2, uBias));                  // only one side of the edge lights up
    crease = max(crease, step(uNormalThr, 1.0 - dot(n, n2)) * sameSurf * convex * facing);
  }
  float k = sil > 0.0 ? 1.0 - uDarken : 1.0 + uHighlight * crease;
  gl_FragColor = vec4(col.rgb * k, col.a);
}
```

- **G-buffer pass.** Render layer 0 with `scene.overrideMaterial = new MeshNormalMaterial()` (view-space normals) into
  RT_gbuf, which has its own `DepthTexture`. Put grass, water, particles and decals on layer 1 so they get no outlines.
  The `tSceneDepth` test stops outlines from drawing over grass.
- **Colour after outlining.** Darkening and brightening happen *before* the palette pass, so outline and highlight pixels
  snap to the darker or lighter neighbours in the ramp instead of to black or white.
- **Perspective shots.** Use `perspectiveDepthToViewZ`, reconstruct `p` from NDC·z·tan(fov/2), and scale `uDepthThr` and
  `uConvexEps` by `z / zFocus`, because the texel footprint grows linearly with distance.
- **Starting values from a Unity recreation** (bababuyyy): Z-delta cutoff 0.15, angle cutoff 0.3, angle scale 4, normal
  smoothstep 0.05–0.3, kernel radius 1. That recreation also uses directional normal contrast,
  `max(|n_top−n_bottom|, |n_left−n_right|)`, so that curved faces do not fire. Use it if sheep wool lights up.

### 2.6 Grass, water, and props in the t3ssel8r style

- **Grass.** Use instanced billboard quads (alpha-tested, never blended). The sprite carries only shape. Colour comes from
  the terrain's world-space colour or noise function and the same ramp and cloud-shadow logic. Wind sways in whole
  texels: snap the tip offset with `floor(offset*uRes)/uRes`. Keep grass out of the G-buffer (layer 1). The Unity
  recreation draws about 35k instances and uses accent sprites (flowers) at a fixed frequency.
- **Terrain.** t3ssel8r-like terrain is reported to be marching-squares cliffs over a quantized heightmap, one layer per
  height. That fits our 0.8165-unit tiers.
- **Water.** Use flat ortho-friendly water. Foam = `step(viewZ_scene − viewZ_water, 0.15)` gives a 1–2 texel shoreline band.
  Add a second band at 0.4 in a lighter ramp colour, and slow scrolling noise thresholded to 2 levels for glints.
  Reflections, if any, should be flipped ortho renders at the same internal resolution.

### 2.7 Low-res post FX (HD-2D flavour for the cutscenes)

HD-2D (Octopath Traveler, UE4) gets its diorama look from dynamic lighting, **depth of field / tilt-shift**, bloom and
vignette. The Octopath team noted they once "went too far on the resolution and saturation, losing the appeal of
pixel art". So run every effect **at the internal resolution, before the palette pass**. Blurred and bloomed values then
come back as dithered palette colours, which reads as pixel art rather than as a filter.

- **Tilt-shift DoF.** `coc = clamp((abs(viewZ − uFocusZ) − uFocusBand) * uCocScale, 0., 2.)` in texels, with a 5- or
  9-tap cross blur of radius `coc`. Rounding `coc` to whole texels keeps blocks clean.
- **Bloom.** Threshold luminance at about 0.85 into a ½ low-res RT (320×180), blur with 2 passes of a 5-tap filter, and add
  at ×0.5. Kody King's demo does bloom at full resolution and then re-pixelates by sampling at texel centres:
  `(floor(uv*res)+.5)/res`. That is the fallback when an effect has to run at full resolution.
- **Vignette.** Quantize to 3 rings: `floor(smoothstep(.45,.9,r)*3.)/3.*0.35`. The palette pass dithers the ring edges.
- **A Short Hike** (Robinson-Yu, GDC "Crafting a Tiny Open World") is the reference for readability at very low
  resolution: flat cohesive shading, no AA, a soft outline so objects stay legible, a palette sampled from reference
  photos, and a user option for pixel size.

### 2.8 Palette quantization in OKLab with ordered dithering

Quantize linear colour in **OKLab**, where Euclidean distance roughly matches perceived difference. Find the nearest two
palette colours. Then dither between them with a 4×4 Bayer threshold. Two refinements matter for pixel art:
(a) only dither between colours that are close (otherwise you get noisy cross-hue speckle), and
(b) **anchor the Bayer pattern to the snapped camera texel position**, so the pattern on static geometry does not shift
as the camera scrolls. Yliluoma's arbitrary-palette dithering, and Väänänen's simplified version of it, is the
higher-quality option if two-colour mixing proves too limited.

```glsl
// Palette pass (ShaderMaterial, glslVersion: THREE.GLSL3). Input: linear HDR. Output: sRGB bytes into an RGBA8 RT.
uniform sampler2D tColor;
uniform vec3  uPalLab[64];      // palette in OKLab (precomputed on the CPU from linear sRGB)
uniform vec3  uPalSrgb[64];     // the same colours as sRGB 0..1, written out verbatim
uniform int   uPalCount;
uniform vec2  uCamTexel;        // PixelCamera.camTexel (integers)
uniform float uDither;          // 0.6..1.0 (0 = hard quantize)
uniform float uDitherMaxDist;   // 0.15 OKLab units
uniform float uLumaW;           // 1.0..2.0, weight on L (higher keeps light structure)
varying vec2 vUv;
vec3 oklab(vec3 c) {            // Ottosson's reference matrices
  vec3 lms = vec3(0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b,
                  0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b,
                  0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b);
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return vec3(0.2104542553*lms.x + 0.7936177850*lms.y - 0.0040720468*lms.z,
              1.9779984951*lms.x - 2.4285922050*lms.y + 0.4505937099*lms.z,
              0.0259040371*lms.x + 0.7827717662*lms.y - 0.8086757660*lms.z);
}
const float B4[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
void main() {
  vec3 lab = oklab(clamp(texture2D(tColor, vUv).rgb, 0.0, 1.0));
  vec3 w = vec3(uLumaW, 1.0, 1.0);
  float d1 = 1e9, d2 = 1e9; int i1 = 0, i2 = 0;
  for (int i = 0; i < 64; i++) {
    if (i >= uPalCount) break;
    vec3 e = (lab - uPalLab[i]) * w; float d = dot(e, e);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; }
  }
  vec3 seg = uPalLab[i2] - uPalLab[i1];
  float t = clamp(dot(lab - uPalLab[i1], seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0); // share of colour 2
  t *= uDither * step(length(seg), uDitherMaxDist);
  ivec2 q = ivec2(mod(floor(gl_FragCoord.xy) + uCamTexel, 4.0));
  float thr = (B4[q.y * 4 + q.x] + 0.5) / 16.0;
  gl_FragColor = vec4(uPalSrgb[t > thr ? i2 : i1], 1.0);
}
```

- **Fast path: a LUT** (use it for SwiftShader). At startup, or at build time, run the same search for a 64³ grid of
  *sRGB-encoded* inputs and store `R=i1, G=i2, B=round(t·255)` in a `Data3DTexture` (RGBA8, Nearest, 1 MB).
  The shader becomes linear→sRGB encode, one 3D fetch, and one `texelFetch` into a 64×1 palette texture.
  The CPU build is about 16.7M distance evaluations: tens to hundreds of ms in a worker, or ship it as a binary.
- **Where dithering belongs.** Sky gradients, fog, light falloff, DoF and bloom. Lit surfaces should already be pure
  ramp colours (§2.4), so the pass leaves them alone. The pattern follows the camera but not moving objects, so moving
  objects show a "swimming" pattern. Keep `uDither` low on them (an object-ID mask works), or use surface-stable
  dithering (Rune Skovbo Johansen's Dither3D) for large moving surfaces.
- **Scene sub-palettes.** For mood, upload a 16–24 colour subset per scene (space = blues and purples, courtroom =
  wood and greys). The palette pass takes any `uPalCount` ≤ 64.

### 2.9 Palettes

**Primary: Resurrect 64** (Kerrie Lake, Lospec). It has 64 colours in hue-shifted ramps, with warm and cool greys
(machines, city, courtroom), four green and teal ramps (countryside, alien tech), blues and purples (space, aliens)
and skin and peach tones. The list below is in Lospec order, which is ramp order. First and last entries and a sample of
middle entries were checked against Lospec and mirror excerpts. Before shipping, verify against the `.hex` download at
lospec.com/palette-list/resurrect-64.

```
greys/wool  2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff
reds        6e2727 b33831 ea4f36 f57d4a | ae2334 e83b3b fb6b1d f79617 f9c22b
brick/wood  7a3045 9e4539 cd683d e6904e fbb954
olive       4c3e24 676633 a2a947 d5e04b fbff86
grass       165a4c 239063 1ebc73 91db69 cddf6c
moss grey   313638 374e4a 547e64 92a984 b2ba90
teal/tech   0b5e65 0b8a8f 0eaf9b 30e1b9 8ff8e2
blue/space  323353 484a77 4d65b4 4d9be6 8fd3ff
purple      45293f 6b3e75 905ea9 a884f3 eaaded
pink        753c54 a24b6f cf657f ed8099
magenta/skin 831c5d c32454 f04f78 f68181 fca790 fdcbb0
```

Suggested ramps (shadow→lit→highlight):
sheep wool `694f62 7f708a 9babb2 c7dcd0 ffffff` · grass `165a4c 239063 1ebc73 91db69` ·
alien tech `0b5e65 0b8a8f 0eaf9b 30e1b9` · space/sky `323353 484a77 4d65b4 4d9be6` ·
hazard stripes `ae2334 fb6b1d f9c22b` · outline ink `2e222f`. A community tip adds `#18141a` as an extra "true black"
for space backgrounds.

**Alternative: Endesga 32** (ENDESGA, made for NYKRA). It is more saturated and arcade-like, and fewer colours make the
quantization cheaper. It has fewer greens and greys, though. Verified in full against `cloudhead/rx/config/palettes/edg32.palette`:

```
be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e
124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569
```

Also considered: **Apollo** (AdamCYounis, 46, very natural ramps, a good second choice for the countryside),
**AAP-64** (Adigun Polack, broad), **Sweetie 16** (GrafxKid, too small for the scope here). Their hex values were not
verified in this session.

### 2.10 Upscale pass, sub-texel offset, UI composite

```glsl
// Final pass to the canvas (renderToScreen). No colorspace/tonemapping chunks, so bytes pass through as sRGB.
uniform sampler2D tScene;   // RT_pal (sRGB bytes). LinearFilter for sharp-bilinear, NearestFilter for integer mode
uniform sampler2D tUI;      // RT_ui (sRGB bytes, alpha 0/1), Nearest
uniform vec2 uSceneSize;    // W+2M, H+2M
uniform vec2 uUISize;       // W, H
uniform vec2 uOrigin;       // letterbox offset in physical px
uniform float uScale;       // physical px per texel
uniform float uMargin;      // M
uniform vec2 uSubTexel;     // PixelCamera.subTexel
uniform bool uSharp;        // true when uScale is non-integer, or for sub-screen-pixel smoothness
void main() {
  vec2 s = gl_FragCoord.xy - uOrigin;
  vec2 p = s / uScale + uMargin + uSubTexel;             // continuous texel coordinates in the scene RT
  vec3 c;
  if (uSharp) {                                          // "fat pixel" AA: nearest inside, 1-px blend at seams
    vec2 seam = floor(p + 0.5), fw = fwidth(p);
    p = seam + clamp((p - seam) / fw, -0.5, 0.5);
    c = texture2D(tScene, p / uSceneSize).rgb;
  } else {
    c = texelFetch(tScene, ivec2(floor(p)), 0).rgb;      // offset quantised to 1/uScale texel = 1 screen px
  }
  vec4 ui = texelFetch(tUI, ivec2(floor(s / uScale)), 0); // UI has no margin and no camera offset
  gl_FragColor = vec4(mix(c, ui.rgb, ui.a), 1.0);
}
```

This filter design comes from Cole Cecil, Joren Joestar and the "Crafting a Better Shader for Pixel Art Upscaling" video
(t3ssel8r). The sharp-bilinear seam blend introduces non-palette colours, but only at screen resolution, so they read as
anti-aliasing. For strict palette purity, use integer scale with `texelFetch`.

### 2.11 Pixel-perfect particles

Particles go into RT_color at low resolution, on layer 1 so they get no outlines. Use `Points` with integer sizes, centres
snapped to texels, alpha-tested dithered fades instead of blending, and colours picked from the palette.

```glsl
// vertex
uniform vec2 uRes; attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
  px = mod(aSize, 2.0) > 0.5 ? floor(px) + 0.5 : floor(px + 0.5);   // odd sizes: texel centre, even: corner
  clip.xy = (px / uRes * 2.0 - 1.0) * clip.w;
  gl_Position = clip; gl_PointSize = aSize;                           // 1, 2 or 3 low-res pixels
  vAlpha = aAlpha; vColor = aColor;
}
// fragment: if (vAlpha < bayer4(gl_FragCoord.xy + uCamTexel)) discard; gl_FragColor = vec4(vColor, 1.0);
```

- Shrink by stepping `aSize` 3→2→1 instead of scaling. Simulate on the CPU at any rate, but snap only when rendering.
- Additive glows (thrusters, tractor beams) should go to the bloom input. The palette pass brings them back into the palette.
- For star fields in the space shots, use the same shader with `aSize = 1` and occasional 3-px "+" sprites. Twinkle by
  swapping between 2–3 palette colours, never by changing alpha.

### 2.12 UI and pixel fonts

All of these are OFL-1.1 and available as `@fontsource/<id>@5.3.0`. The pixel grid was measured from the font outlines.
**Native size** is the CSS font-size at which one font pixel equals one low-res pixel. Use integer multiples of it.

| Font (`@fontsource/…`) | Native px size | Caps / x-height / descender (px) | Notes and use |
|---|---|---|---|
| `jersey-10` (Sarah Cadigan-Fried) | **18.6667** (1400 upm, 75 u/px) | 10 / 8 / 2, proportional | **Dialogue and subtitles** at 640×360: about 18 lines per screen, readable, has lowercase. Latin and latin-ext only. |
| `jersey-15` / `jersey-20` / `jersey-25` | 27 (Jersey 15) | 15 / 11 / 4 | **Titles** that match the dialogue face. The number is the cap height in px. |
| `tiny5` (Stefan Schmidt) | **8** | 5 / 4 / 1, proportional, line 9 | **HUD, tooltips, factory counters.** Has lowercase plus Cyrillic and Greek. |
| `micro-5` (Cadigan-Fried) | 11 | 5 / 4 / 1 | Alternative to Tiny5, more condensed. |
| `silkscreen` (Jason Kottke) | 8 | 5 / 5 (small-caps lowercase) | Buttons and labels in ALL CAPS. Not for paragraphs. |
| `press-start-2p` (CodeMan38) | 8 (16, 24…) | 8×8 monospace cell | **Arcade title or logo**, for example "AUTOSHEEP" at 24–32 px. Too wide for dialogue (8 px per glyph). |
| `pixelify-sans` (Stefie Justprince) | none exact | grid ≈ 90 u (≈11 px), ±0.1 px offsets | A variable font (wght 400–700) whose outlines are **not** on an exact grid. Use only for large titles at screen resolution. |

Render text into the low-res **UI RT** (W×H). It is composited after the palette pass, so it is never dithered, and it
is upscaled with the same pixel size as the world.

```ts
import '@fontsource/jersey-10'; import '@fontsource/tiny5';
await Promise.all([document.fonts.load('18.6667px "Jersey 10"'), document.fonts.load('8px "Tiny5"')]);
const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
const g = cv.getContext('2d', { willReadFrequently: true })!;
function drawText(text: string, x: number, baseline: number, hex: string, font = '18.6667px "Jersey 10"') {
  g.font = font; g.textBaseline = 'alphabetic'; g.fillStyle = hex;           // hex = palette colour
  g.fillText(text, Math.round(x), Math.round(baseline));                      // integer positions only
}
function finalizeUI() {                                                       // kill residual AA: alpha to 0 or 255
  const im = g.getImageData(0, 0, W, H), d = im.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  g.putImageData(im, 0, 0); uiTex.needsUpdate = true;
}
const uiTex = new THREE.CanvasTexture(cv);
uiTex.colorSpace = THREE.NoColorSpace;                // bytes are already sRGB; the final pass passes them through
uiTex.magFilter = uiTex.minFilter = THREE.NearestFilter; uiTex.generateMipmaps = false;
```

Only redraw dirty regions (for the dialogue typewriter, redraw only the dialogue box). Use `ctx.letterSpacing = '1px'`
for tracking in whole pixels. Dialogue box: a 9-slice in palette colours, with 3 lines of Jersey 10
(line pitch 20 px) giving a box about 72 px tall.

---

## 3. Pitfalls

### 3.1 Shimmer and pixel crawl: causes and fixes
1. **Camera translation**: snap to the texel grid and compensate the sub-texel error in the upscale (§2.2). Snap in camera
   right/up *after* any smoothing (lerp/spring), never before. Snapping a value that is then smoothed again causes the
   "jittery camera" that people report in Godot threads.
2. **Camera rotation and zoom**: discrete steps only (§2.2).
3. **Object motion**: snap origins (§2.3). Use a consistent snap target (texel corner) for all objects, or neighbours
   will jitter against each other.
4. **Object rotation and animation**: 16-direction yaw, 12 fps stepped skinning, no sub-texel thin parts.
5. **Banding on rotating smooth meshes**: band edges slide across the surface. Prefer flat-shaded props, and rotate in snapped steps.
6. **Shadows**: if the shadow camera follows the view, snap it to *shadow-map* texels in light space (round the light-space
   x/y of the follow point to `frustumWidth/mapSize`). Otherwise fix the shadow frustum per chunk or scene.
7. **Textures**: `NearestFilter` without mipmaps aliases as soon as a texture is minified. Author textures at **≤16
   texels per world unit** (a 1-unit tile is about 22.6 px across), or use flat ramp colours and vertex colours, as
   t3ssel8r mostly does.
8. **Dither**: anchor it to `camTexel`. It will swim on moving objects (§2.8).
9. **Outlines**: thresholds near typical geometry deltas flicker. Use world-unit thresholds with slope scaling, and check
   them with a debug view that shows `sil` and `crease` as colours.
10. **AA of any kind**: `antialias:false`, `samples:0`, no FXAA/SMAA/TAA, and `material.dithering = false` (three's
    anti-banding noise).

### 3.2 Perspective cameras (cutscene space shots, bridge, courtroom)
Snapping can fix only one depth plane, because under perspective each depth drifts at a different rate (see the
texel-splatting paper, arXiv 2603.14587). Pixel creep is therefore unavoidable during perspective camera *motion*. Mitigations:
- Use ortho or iso for as many shots as possible (countryside, city, courtroom wides, alien bridge from a fixed angle).
- For perspective shots, use a narrow FOV (≤25–30°) and a static camera, or dolly slowly. Snap translation using the
  texel size at the subject's distance, `worldPerTexel = 2·d·tan(fov/2)/H`, so the subject stays stable.
- Step the camera at 12 fps along with the animation (the "on twos" look), so creep reads as hand-drawn frames.
- Build parallax space shots from several **ortho layers** (stars, nebula, planet, ship). Each layer is rendered at low
  resolution and composited in the upscale with its own `subTexel` offset, like classic 2D pixel-art parallax.
- The pass state (thresholds, `PERSPECTIVE` define) must switch with the camera type (§2.5).

### 3.3 Colour management in three.js r186
- `ColorManagement.enabled = true`, `workingColorSpace = LinearSRGBColorSpace`. `new Color(0xRRGGBB)` and CSS strings are
  read as sRGB and **converted to linear**. So palette hex values used as material colours are correct. To get sRGB bytes
  for `uPalSrgb`, use `color.getRGB(v, THREE.SRGBColorSpace)` or parse the hex yourself. Compute `uPalLab` from the
  linear values.
- `WebGLPrograms` sets `outputColorSpace = (renderTarget === null) ? renderer.outputColorSpace : workingColorSpace`, and
  applies `renderer.toneMapping` only when `renderTarget === null`. Every intermediate RT is therefore linear. That is
  correct for passes ①–②.
- `OutputPass` applies tone mapping plus the sRGB transfer, based on `renderer.toneMapping` and `outputColorSpace`.
  **Do not put it after the palette pass**, because it would encode the already-sRGB bytes a second time. `ShaderMaterial`
  only encodes if the shader `#include`s `<colorspace_fragment>`, and `RawShaderMaterial` never does, so the final pass
  writes bytes verbatim. (The stock pixel example, `RenderPixelatedPass` → `OutputPass`, is correct only because it has no
  palette stage.)
- Set `texture.colorSpace = SRGBColorSpace` for albedo and ramp textures. Leave data textures as `NoColorSpace`: normals,
  LUTs, index textures, `gradientMap`, and RTs that hold sRGB bytes.
- glTF `COLOR_0` vertex colours are linear by spec. If you author vertex colours from palette hex values, convert them
  first.
- Bilinear seam blending in the upscale happens in sRGB space. The darkening is negligible for 1-px seams.
- Intermediate HDR RTs need `EXT_color_buffer_float`. Check `renderer.extensions.has('EXT_color_buffer_float')` and fall
  back to `UnsignedByteType`, accepting that dark linear values lose precision.

### 3.4 Headless and SwiftShader (CI screenshots, offline cutscene capture)
- Since Chrome 130 the automatic SwiftShader WebGL fallback has been deprecated, and from about M139 context creation
  fails without opting in. Launch with `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`.
  Do not use `--disable-gpu` on its own, which breaks WebGL in Chrome 130+. Check `WEBGL_debug_renderer_info` for
  "SwiftShader": a misconfigured run silently produces a black canvas.
- SwiftShader rasterizes on the CPU, so cost scales with fragments × shader cost. One vendor measured about 24 s per
  heavy WebGL page with SwiftShader versus about 6 s with Mesa llvmpipe. Treat that as indicative only.
  In our pipeline every low-res pass is about 232k fragments, while the 1080p upscale is **2.07M**, so the upscale is
  likely the most expensive pass. For offline capture, read back the 640×360 palette RT
  (`readRenderTargetPixels`) and upscale with `ffmpeg -vf scale=iw*3:ih*3:flags=neighbor`, which is exact for integer
  scales. The trade-off is that camera motion then moves in whole texels, unless you render the upscale pass.
- Use the palette **LUT** instead of the 64-iteration loop. Use `BasicShadowMap` at 1024, and keep the G-buffer pass to
  layer 0. Drive time from the frame index (`t = frame/30`) and render manually, so captures are deterministic.

### 3.5 Miscellaneous
- `RenderPixelatedPass` renders the normal pass with `scene.overrideMaterial`, so every object (grass, particles) gets
  outlined. Write your own pass with layers instead (§2.5). Its `setSize` floors `width/pixelSize`, so non-multiple
  window sizes stretch unevenly. Compute W×H yourself and letterbox.
- `fwidth` and `texelFetch` need WebGL2 (the default in r163+). Array literals such as `float[16](…)` need `glslVersion: THREE.GLSL3`.
- Soft alpha edges leave 1-texel fringes of in-between colour, even after quantization. Use alpha test or dithered `discard` for foliage and particles.
- CSS `image-rendering: pixelated` on a 640×360 canvas is fine for prototypes. It cannot do sub-texel smoothing or fractional-DPR-safe scaling.

---

## 4. Sources

Fetched and read directly (source code or files):
- three.js r186 `RenderPixelatedPass.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/postprocessing/RenderPixelatedPass.js
- three.js pixel example (camera, object and rotation snapping): https://github.com/mrdoob/three.js/blob/r186/examples/webgl_postprocessing_pixel.html · live: https://threejs.org/examples/webgl_postprocessing_pixel.html
- three.js r186 `OutputPass.js`, `EffectComposer.js`, `src/renderers/webgl/WebGLPrograms.js`, `src/math/ColorManagement.js`, `ShaderChunk/packing.glsl.js`, `tsl/display/PixelationPassNode.js`, `webgpu_postprocessing_pixel.html`: https://github.com/mrdoob/three.js/tree/r186
- three.js docs: https://threejs.org/docs/pages/RenderPixelatedPass.html · https://threejs.org/docs/pages/PixelationPassNode.html
- Kody King, hello-threejs (origin of the pass; bloom then re-pixelate): https://github.com/KodyJKing/hello-threejs · video: https://www.youtube.com/watch?v=jFevm02NJ5M
- Unity isometric pixel pipeline, a t3ssel8r/Holland recreation with parameter tables: https://github.com/bababuyyy/unity-isometric-pixel-pipeline
- Dasfaust PixelEngine (sub-pixel camera; `_SubPixelOffset` contract): https://github.com/Dasfaust/PixelEngine
- Endesga 32 palette file: https://github.com/cloudhead/rx/blob/master/config/palettes/edg32.palette
- Google Fonts metadata and descriptions (designers, Press Start 2P "multiples of 8", Soft Type number = cap height): https://github.com/google/fonts/tree/main/ofl
- Fontsource npm packages (versions and OFL-1.1 licences): https://www.npmjs.com/package/@fontsource/jersey-10 (and `tiny5`, `micro-5`, `silkscreen`, `press-start-2p`, `pixelify-sans`, `jersey-15`)

Known through search excerpts or secondary summaries (direct fetch blocked here):
- t3ssel8r YouTube channel: https://www.youtube.com/@t3ssel8r · "Crafting a Better Shader for Pixel Art Upscaling": https://www.youtube.com/watch?v=d6tp43wZqps
- t3ssel8r animation interview (Cascadeur): https://cascadeur.com/blog/general/making-an-animation-for-a-3d-pixel-art-game · 80.lv: https://80.lv/articles/tips-on-convincing-animations-for-3d-pixel-art-games
- David Holland, "3D Pixel Art Rendering" (Godot; snap and offset, convex highlights, water): https://www.davidhol.land/articles/3d-pixel-art-rendering/
- denovodavid, 3D pixel art in Godot: https://git.sr.ht/~denovodavid/3d-pixel-art-in-godot · forum thread: https://godotforums.org/d/36180-subpixel-snapping-in-a-3d-pixel-art-game
- Recreating the t3ssel8r style in Godot (video): https://www.youtube.com/watch?v=g1vH3HeePco · "Tessel8r's isometric camera": https://www.youtube.com/watch?v=f8foNx-Qge0
- Godot 3D pixel-art outline shader (MIT, inspired by the three.js example): https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/
- t3ssel8r grass replication thread: https://forum.godotengine.org/t/trying-to-replicate-t3ssel8r-grass-shader/123816 · terrain: https://forum.godotengine.org/t/recreating-t3ssel8rs-3d-pixel-art-terrain-in-godot-c/65196
- UPixelator docs (snap plus offset, skybox caveat, ortho-only creep reduction): https://github.com/Radivarig/UPixelator_Documentation
- Roystan, outline shader (depth threshold modulation): https://roystan.net/articles/outline-shader/
- Texel splatting, perspective pixel creep (arXiv 2603.14587): https://arxiv.org/abs/2603.14587
- Pixelat3D (SBGames): https://sol.sbc.org.br/index.php/sbgames/article/view/45414
- Thomas Vasseur, Dead Cells 3D→2D pipeline: https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i- · summary: https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/
- A Short Hike behind the scenes: https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/
- HD-2D: https://en.wikipedia.org/wiki/HD-2D · Octopath II interview: https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style · Famitsu via Siliconera: https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/
- OKLab (Björn Ottosson): https://bottosson.github.io/posts/oklab/
- Yliluoma's ordered dither, revisited (Pekka Väänänen): https://30fps.net/pages/revisiting-yliluoma-2/
- Dither3D, surface-stable fractal dithering (Rune Skovbo Johansen): https://github.com/runevision/Dither3D
- Pixel-art filtering: https://jorenjoestar.github.io/post/pixel_art_filtering/ · https://colececil.dev/blog/2017/scaling-pixel-art-without-destroying-it/
- Lospec palettes: https://lospec.com/palette-list/resurrect-64 · https://lospec.com/palette-list/endesga-32 · https://lospec.com/palette-list/apollo · https://lospec.com/palette-list/aap-64 · https://lospec.com/palette-list/sweetie-16
- Stable shadow snapping (Stride docs): https://doc.stride3d.net/4.2/en/Manual/graphics/lights-and-shadows/directional-lights.html
- Chromium SwiftShader doc: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md · policy: https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html · Microlink benchmark: https://microlink.io/blog/webgl-without-a-gpu
