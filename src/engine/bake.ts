import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './toon';

/** Opaque toon materials differ only in uniforms, so their meshes can share one material once
 * each vertex carries its colour. */
function isToon(mat: THREE.Material): mat is THREE.MeshLambertMaterial {
  return mat instanceof THREE.MeshLambertMaterial && !mat.map && !mat.transparent && mat.customProgramCacheKey().startsWith('toon');
}

/** Which meshes may merge: the same key means the same material once colours are in the
 * vertices. Null for meshes that cannot merge. */
function mergeKey(m: THREE.Mesh): string | null {
  if (Array.isArray(m.material)) return null;
  const mat = m.material as THREE.Material & { map?: THREE.Texture | null; vertexColors?: boolean };
  let what: string;
  if (isToon(mat)) what = `toon|${mat.emissive.getHex()}|${mat.emissiveIntensity}|${mat.side}|${mat.flatShading}`;
  else if (mat.map || mat.vertexColors || m.geometry.attributes.color) return null;
  else what = mat.uuid;
  return `${what}|${m.layers.mask}|${m.castShadow}|${m.receiveShadow}`;
}

/** Merge `list` into one mesh under `parent`, each placed by `toParent(mesh)`. */
function mergeInto(list: THREE.Mesh[], parent: THREE.Object3D, toParent: (m: THREE.Mesh) => THREE.Matrix4): boolean {
  const first = list[0];
  const toonGroup = isToon(first.material as THREE.Material);
  const geos = list.map((m) => {
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(toParent(m));
    if (toonGroup) {
      // vertex colour = the vertex's own colour (if any) times the material's
      const c = (m.material as THREE.MeshLambertMaterial).color;
      const own = (m.material as THREE.MeshLambertMaterial).vertexColors ? g.attributes.color : undefined;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r * (own ? own.getX(i) : 1);
        col[i * 3 + 1] = c.g * (own ? own.getY(i) : 1);
        col[i * 3 + 2] = c.b * (own ? own.getZ(i) : 1);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(toonGroup && name === 'color')) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    return g;
  });
  const geo = mergeGeometries(geos, false);
  if (!geo) return false;
  let material = first.material as THREE.Material;
  if (toonGroup) {
    const t = material as THREE.MeshLambertMaterial;
    material = toon(0xffffff, { vertexColors: true, emissive: t.emissive.getHex(), emissiveIntensity: t.emissiveIntensity, side: t.side, flat: t.flatShading });
  }
  const out = new THREE.Mesh(geo, material);
  out.layers.mask = first.layers.mask;
  out.castShadow = first.castShadow;
  out.receiveShadow = first.receiveShadow;
  for (const m of list) m.removeFromParent();
  parent.add(out);
  return true;
}

/**
 * Merge every static mesh under `root` that can share a material (and layers and shadow
 * flags) into one mesh per `cell`-sized square of ground, in world space. Hundreds of small
 * props (trees, rocks, buildings) become a few dozen draw calls, and chunks off screen are
 * still culled. Toon meshes of different colours merge too: the colour moves into the
 * vertices, which the toon shader multiplies in exactly as it did the material colour.
 * Instanced meshes, meshes with textures, and anything inside `keep` (blinking lights, moving
 * parts) are left alone.
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
    const what = mergeKey(m);
    if (what === null) return;
    const at = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const key = `${what}|${Math.floor(at.x / cell)},${Math.floor(at.z / cell)}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  });
  let merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    if (mergeInto(list, root, (m) => new THREE.Matrix4().multiplyMatrices(inverseRoot, m.matrixWorld))) merged += list.length - 1;
  }
  return { before, after: before - merged };
}

/**
 * Merge the meshes of an animated model that move together. `moving` lists every node the
 * animation transforms or hides; each other mesh rides on its nearest moving ancestor (or the
 * root), and the meshes riding on the same one merge into a single mesh under it. A character
 * of sixty parts becomes a dozen draw calls and animates exactly as before.
 */
export function bakeRigid(root: THREE.Object3D, moving: Iterable<THREE.Object3D>): { before: number; after: number } {
  const anchors = new Set(moving);
  anchors.add(root);
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Object3D, Map<string, THREE.Mesh[]>>();
  let before = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    before++;
    if (anchors.has(m) || !m.visible) return;
    let anchor = m.parent;
    while (anchor && !anchors.has(anchor)) {
      if (!anchor.visible) return;
      anchor = anchor.parent;
    }
    if (!anchor) return;
    const key = mergeKey(m);
    if (key === null) return;
    const byKey = groups.get(anchor) ?? new Map<string, THREE.Mesh[]>();
    const list = byKey.get(key) ?? [];
    list.push(m);
    byKey.set(key, list);
    groups.set(anchor, byKey);
  });
  let merged = 0;
  for (const [anchor, byKey] of groups) {
    const inverse = anchor.matrixWorld.clone().invert();
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      if (mergeInto(list, anchor, (m) => new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld))) merged += list.length - 1;
    }
  }
  return { before, after: before - merged };
}

/**
 * Split every instanced mesh under `root` into one instanced mesh per `cell`-sized square of
 * ground, by where each instance stands. three culls an instanced mesh as a whole, so ten
 * thousand grass tufts spread over the map were all drawn every frame; split up, the squares
 * off screen are skipped. Call it on static scenery only (the instances must not move).
 */
export function chunkInstances(root: THREE.Object3D, cell = 32): void {
  root.updateMatrixWorld(true);
  const found: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) found.push(o as THREE.InstancedMesh);
  });
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (const im of found) {
    const cells = new Map<string, number[]>();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      p.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld);
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
      const list = cells.get(key) ?? [];
      list.push(i);
      cells.set(key, list);
    }
    if (cells.size < 2 || !im.parent) continue;
    for (const list of cells.values()) {
      const part = new THREE.InstancedMesh(im.geometry, im.material, list.length);
      list.forEach((i, k) => {
        im.getMatrixAt(i, m);
        part.setMatrixAt(k, m);
        if (im.instanceColor) {
          im.getColorAt(i, c);
          part.setColorAt(k, c);
        }
      });
      part.matrix.copy(im.matrix);
      part.matrix.decompose(part.position, part.quaternion, part.scale);
      part.layers.mask = im.layers.mask;
      part.castShadow = im.castShadow;
      part.receiveShadow = im.receiveShadow;
      part.renderOrder = im.renderOrder;
      part.computeBoundingSphere();
      im.parent.add(part);
    }
    im.removeFromParent();
  }
}

/**
 * Cut a big mesh (terrain) into `cell`-sized tiles, by where each triangle's middle falls, so
 * the tiles off screen are culled. Returns the tiles, which replace the mesh in its parent.
 */
export function tileMesh(mesh: THREE.Mesh, cell = 64): THREE.Mesh[] {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index;
  const tris = index ? index.count / 3 : pos.count / 3;
  const vert = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const cells = new Map<string, number[]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, vert(t, 0));
    b.fromBufferAttribute(pos, vert(t, 1));
    v.fromBufferAttribute(pos, vert(t, 2)).add(a).add(b).divideScalar(3).applyMatrix4(mesh.matrixWorld);
    const key = `${Math.floor(v.x / cell)},${Math.floor(v.z / cell)}`;
    const list = cells.get(key) ?? [];
    list.push(t);
    cells.set(key, list);
  }
  if (cells.size < 2) return [mesh];
  const tiles: THREE.Mesh[] = [];
  for (const list of cells.values()) {
    // the tile's own vertices, renumbered
    const remap = new Map<number, number>();
    const order: number[] = [];
    const idx: number[] = [];
    for (const t of list) {
      for (let k = 0; k < 3; k++) {
        const o = vert(t, k);
        let n = remap.get(o);
        if (n === undefined) {
          n = order.length;
          remap.set(o, n);
          order.push(o);
        }
        idx.push(n);
      }
    }
    const part = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) {
      const src = attr as THREE.BufferAttribute;
      const Arr = src.array.constructor as new (n: number) => THREE.TypedArray;
      const arr = new Arr(order.length * src.itemSize);
      order.forEach((o, n) => {
        for (let s = 0; s < src.itemSize; s++) arr[n * src.itemSize + s] = src.array[o * src.itemSize + s];
      });
      part.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize, src.normalized));
    }
    part.setIndex(idx);
    const tile = new THREE.Mesh(part, mesh.material);
    tile.matrix.copy(mesh.matrix);
    tile.matrix.decompose(tile.position, tile.quaternion, tile.scale);
    tile.layers.mask = mesh.layers.mask;
    tile.castShadow = mesh.castShadow;
    tile.receiveShadow = mesh.receiveShadow;
    tile.renderOrder = mesh.renderOrder;
    tiles.push(tile);
  }
  const parent = mesh.parent;
  if (parent) {
    parent.add(...tiles);
    mesh.removeFromParent();
  }
  return tiles;
}
