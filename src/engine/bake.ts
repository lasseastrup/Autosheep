import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every static mesh under `root` that shares a material (and layers and shadow flags)
 * into one mesh per `cell`-sized square of ground, in world space. Hundreds of small props
 * (trees, rocks, buildings) become a few dozen draw calls, and chunks off screen are still
 * culled. Instanced meshes, meshes with their own textures or vertex colours, and anything
 * inside `keep` (blinking lights, moving parts) are left alone.
 */
export function bakeStatic(root: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set(), cell = 32): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh[]>();
  let before = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    before++;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (keep.has(p)) return;
    const mat = m.material as THREE.Material & { map?: THREE.Texture | null; vertexColors?: boolean };
    if (Array.isArray(m.material) || mat.map || mat.vertexColors || m.geometry.attributes.color) return;
    const at = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const key = `${mat.uuid}|${m.layers.mask}|${m.castShadow}|${m.receiveShadow}|${Math.floor(at.x / cell)},${Math.floor(at.z / cell)}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  });
  let merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, m.matrixWorld));
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.morphAttributes = {};
      return g;
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const first = list[0];
    const out = new THREE.Mesh(geo, first.material);
    out.layers.mask = first.layers.mask;
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    for (const m of list) m.removeFromParent();
    root.add(out);
    merged += list.length - 1;
  }
  return { before, after: before - merged };
}
