import * as THREE from 'three';
import { Sheep } from '../art/sheep';
import { toon } from '../engine/toon';

/** Stand-in colours that mark which template parts take each sheep's own wool and face colour. */
const WOOL = '#fe01fd';
const FACE = '#fd02fe';

export interface SheepPose {
  x: number;
  z: number;
  rotY: number;
  scale: number;
  walkPhase: number;
  walk: number;
  graze: number;
  bleat: number;
  blink: number;
  lookYaw: number;
  bounce: number;
  /** 1 = a full fleece, 0 = just shorn */
  wool: number;
}

/** How a just-shorn sheep looks: smaller, and a little pink. */
const SHORN = new THREE.Color('#f4b4a8');

interface Batch {
  mesh: THREE.InstancedMesh;
  next: number;
}

interface Part {
  node: THREE.Mesh;
  batch: Batch;
}

/** A content key for a geometry, so identical parts of different templates share a batch. */
function geometryKey(g: THREE.BufferGeometry): string {
  const pos = g.attributes.position.array as ArrayLike<number>;
  let h = 0x811c9dc5;
  for (let i = 0; i < pos.length; i++) {
    h ^= Math.round(pos[i] * 1e4);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${pos.length}:${h}:${g.index ? g.index.count : 0}`;
}

/**
 * Draws a whole flock of animated cartoon sheep in a few draw calls. A handful of template
 * sheep (one per wool shape) are posed once per sheep per frame, exactly as a lone `Sheep`
 * would be, and the world matrix of each of their parts is copied into one InstancedMesh per
 * kind of part. The sheep model itself stays defined in one place (src/art/sheep.ts).
 */
export class SheepInstancer {
  readonly root = new THREE.Group();
  private readonly templates: Sheep[] = [];
  /** parts of each template, in traversal order */
  private readonly parts: Part[][] = [];
  /** per sheep, the instance slot of each of its template's parts */
  private readonly slots: Int32Array[] = [];
  private readonly batches: Batch[] = [];
  /** per sheep: its own wool colour, the wool parts' instance slots, and the wool last drawn */
  private readonly woolColour: THREE.Color[] = [];
  private readonly woolSlots: { batch: Batch; slot: number }[][] = [];
  private readonly woolShown: Float32Array;
  private readonly tmp = new THREE.Color();

  constructor(wool: readonly THREE.Color[], face: readonly THREE.Color[], variants = 4, seed = 1) {
    const count = wool.length;
    for (let v = 0; v < variants; v++) this.templates.push(new Sheep(seed * 31 + v, WOOL, FACE, 1));
    const woolMat = toon(WOOL);
    const faceMat = toon(FACE);
    const perVariant = new Array(variants).fill(0);
    for (let i = 0; i < count; i++) perVariant[i % variants]++;

    // one batch per (geometry, material); count how many instances each needs
    const byKey = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; role: 'wool' | 'face' | null; cap: number }>();
    const keys: string[][] = [];
    this.templates.forEach((t, v) => {
      const k: string[] = [];
      t.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.Material;
        const role = mat === woolMat ? 'wool' : mat === faceMat ? 'face' : null;
        const key = `${geometryKey(m.geometry)}|${role ?? mat.uuid}`;
        const e = byKey.get(key) ?? { geo: m.geometry, mat, role, cap: 0 };
        e.cap += perVariant[v];
        byKey.set(key, e);
        k.push(key);
      });
      keys.push(k);
    });
    const batchOf = new Map<string, Batch>();
    for (const [key, e] of byKey) {
      const mat = e.role ? toon(0xffffff) : e.mat;
      const mesh = new THREE.InstancedMesh(e.geo, mat, Math.max(1, e.cap));
      mesh.count = e.cap;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // instances move all over the field; one bounding sphere for all of them would be wrong
      mesh.frustumCulled = false;
      if (e.role) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, e.cap) * 3), 3);
      const b: Batch = { mesh, next: 0 };
      batchOf.set(key, b);
      this.batches.push(b);
      this.root.add(mesh);
    }
    this.templates.forEach((t, v) => {
      const list: Part[] = [];
      let n = 0;
      t.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) list.push({ node: o as THREE.Mesh, batch: batchOf.get(keys[v][n++])! });
      });
      this.parts.push(list);
    });

    // hand out instance slots and colours
    this.woolShown = new Float32Array(count).fill(1);
    for (let i = 0; i < count; i++) {
      const v = i % variants;
      const slots = new Int32Array(this.parts[v].length);
      const ws: { batch: Batch; slot: number }[] = [];
      this.parts[v].forEach((p, k) => {
        const slot = p.batch.next++;
        slots[k] = slot;
        const mat = p.node.material as THREE.Material;
        if (mat === woolMat) {
          p.batch.mesh.setColorAt(slot, wool[i]);
          ws.push({ batch: p.batch, slot });
        } else if (mat === faceMat) p.batch.mesh.setColorAt(slot, face[i]);
      });
      this.slots.push(slots);
      this.woolSlots.push(ws);
      this.woolColour.push(wool[i].clone());
    }
    for (const b of this.batches) if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
  }

  /** Pose sheep i and write its parts into the batches. */
  pose(i: number, p: SheepPose): void {
    const v = i % this.templates.length;
    const s = this.templates[v];
    s.walkPhase = p.walkPhase;
    s.walk = p.walk;
    s.graze = p.graze;
    s.bleat = p.bleat;
    s.blink = p.blink;
    s.lookYaw = p.lookYaw;
    s.bounce = p.bounce;
    s.update();
    // a shorn fleece is thinner and lower; it grows back out
    const w = p.wool;
    s.wool.scale.set(0.72 + 0.28 * w, 0.84 + 0.16 * w, 0.76 + 0.24 * w);
    if (Math.abs(w - this.woolShown[i]) > 0.02) {
      this.woolShown[i] = w;
      this.tmp.copy(this.woolColour[i]).lerp(SHORN, (1 - w) * 0.45);
      for (const { batch, slot } of this.woolSlots[i]) {
        batch.mesh.setColorAt(slot, this.tmp);
        batch.mesh.instanceColor!.needsUpdate = true;
      }
    }
    s.root.position.set(p.x, 0, p.z);
    s.root.rotation.set(0, p.rotY, 0);
    s.root.scale.setScalar(p.scale);
    s.root.updateMatrixWorld(true);
    const parts = this.parts[v];
    const slots = this.slots[i];
    for (let k = 0; k < parts.length; k++) parts[k].batch.mesh.setMatrixAt(slots[k], parts[k].node.matrixWorld);
  }

  /** Call once a frame after posing. */
  commit(): void {
    for (const b of this.batches) b.mesh.instanceMatrix.needsUpdate = true;
  }

  get drawCalls(): number {
    return this.batches.length;
  }
}
