import * as THREE from 'three';

/**
 * Stepped "toon" lighting shared by every lit material. Lighting is computed by three's
 * regular Lambert path (so shadows, fog, instancing and vertex colours all work), then the
 * light factor is snapped into four bands. Darker bands are tinted cool, the brightest warm,
 * which after palette quantisation gives hue-shifted ramps instead of muddy multiplied greys.
 * The uniforms are shared, so a scene retunes the whole look in one place.
 */
export const toonUniforms = {
  uBandEdges: { value: new THREE.Vector3(0.3, 0.6, 1.08) },
  uBandLevels: { value: new THREE.Vector4(0.42, 0.66, 1.0, 1.16) },
  uShadowTint: { value: new THREE.Color(0.82, 0.84, 1.1) },
  uLightTint: { value: new THREE.Color(1.07, 1.03, 0.92) },
};

export function setToonDefaults(): void {
  toonUniforms.uBandEdges.value.set(0.3, 0.6, 1.08);
  toonUniforms.uBandLevels.value.set(0.42, 0.66, 1.0, 1.16);
  toonUniforms.uShadowTint.value.setRGB(0.82, 0.84, 1.1);
  toonUniforms.uLightTint.value.setRGB(1.07, 1.03, 0.92);
}

export interface ToonOptions {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  side?: THREE.Side;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
  /** never share this material instance (callers that patch the shader further) */
  unique?: boolean;
}

const materialCache = new Map<string, THREE.MeshLambertMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: ToonOptions = {}): THREE.MeshLambertMaterial {
  const cacheable = !opts.map && !opts.unique;
  const key = cacheable ? JSON.stringify([new THREE.Color(color).getHex(), opts]) : '';
  if (cacheable && materialCache.has(key)) return materialCache.get(key)!;
  const m = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    map: opts.map ?? null,
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flat ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, toonUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uBandEdges; uniform vec4 uBandLevels; uniform vec3 uShadowTint; uniform vec3 uLightTint;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 lumW = vec3(0.2126, 0.7152, 0.0722);
  vec3 base = diffuseColor.rgb;
  float lit = PI * dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, lumW) / max(dot(base, lumW), 1e-4);
  vec3 c;
  if (lit < uBandEdges.x) c = base * uBandLevels.x * uShadowTint * uShadowTint;
  else if (lit < uBandEdges.y) c = base * uBandLevels.y * uShadowTint;
  else if (lit < uBandEdges.z) c = base * uBandLevels.z;
  else c = base * uBandLevels.w * uLightTint;
  outgoingLight = c + totalEmissiveRadiance;
}
#include <opaque_fragment>`,
      )
      // alpha carries "how much may this pixel be dithered": toon surfaces stay clean
      // except where fog blends them toward the horizon
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
#ifndef TOON_TRANSPARENT
#ifdef USE_FOG
  gl_FragColor.a = fogFactor;
#else
  gl_FragColor.a = 0.0;
#endif
#endif`,
      );
    if (m.transparent) sh.fragmentShader = '#define TOON_TRANSPARENT\n' + sh.fragmentShader;
  };
  m.customProgramCacheKey = () => (m.transparent ? 'toon-v2t' : 'toon-v2');
  if (cacheable) materialCache.set(key, m);
  return m;
}

/** Unlit colour that can exceed 1.0 so it feeds the bloom pass (lights, beams, screens). */
export function glow(color: THREE.ColorRepresentation, intensity = 1, opts: { transparent?: boolean; opacity?: number; side?: THREE.Side; blending?: THREE.Blending; depthWrite?: boolean } = {}): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({
    color: c,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    blending: opts.blending ?? THREE.NormalBlending,
    depthWrite: opts.depthWrite ?? true,
    fog: false,
  });
}

/** Layer 1 = drawn, but excluded from the outline (normal/depth) pass. */
export const NO_OUTLINE_LAYER = 1;

export function noOutline<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => o.layers.set(NO_OUTLINE_LAYER));
  return obj;
}

export function castShadows<T extends THREE.Object3D>(obj: T, cast = true, receive = true): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}
