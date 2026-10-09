import * as THREE from 'three';

/** Pixels per metre at each zoom level, low to high. */
export const ZOOMS = [10, 14, 20, 28];

/**
 * Isometric orthographic camera: four 45° views (Q/E rotate), discrete zoom levels so pixels
 * stay a whole size, and a smoothed follow target. The pixel renderer snaps it to texels.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  /** where the camera looks (world, on the ground) */
  readonly target = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  zoomIndex = 2;
  private zoomShown = ZOOMS[2];
  /** quarter turns; the view yaw is 45° + quarter * 90° */
  quarter = 0;
  private yawShown = Math.PI / 4;
  readonly pitch = 0.62;

  constructor(private readonly width: number, private readonly height: number) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 600);
  }

  get yaw(): number {
    return Math.PI / 4 + this.quarter * (Math.PI / 2);
  }

  rotate(dir: 1 | -1): void {
    this.quarter += dir;
  }

  zoom(dir: 1 | -1): void {
    this.zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, this.zoomIndex + dir));
  }

  /** Follow a point, but only once it leaves the middle of the screen. */
  follow(p: THREE.Vector3, deadZone = 0.28): void {
    const ppm = ZOOMS[this.zoomIndex];
    const halfW = (this.width / ppm / 2) * deadZone * 2;
    const halfH = (this.height / ppm / 2) * deadZone * 2;
    // work in camera-aligned ground axes
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const d = p.clone().sub(this.goal);
    const dr = d.dot(right);
    // ground depth is foreshortened on screen by sin(pitch)
    const df = d.dot(fwd) * Math.sin(this.pitch);
    const mr = Math.abs(dr) > halfW ? dr - Math.sign(dr) * halfW : 0;
    const mf = Math.abs(df) > halfH ? (df - Math.sign(df) * halfH) / Math.sin(this.pitch) : 0;
    this.goal.addScaledVector(right, mr).addScaledVector(fwd, mf);
  }

  /** Move the camera's goal directly (keyboard panning), in screen-aligned metres. */
  pan(dx: number, dy: number): void {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.goal.addScaledVector(right, dx).addScaledVector(fwd, dy);
  }

  jump(p: THREE.Vector3): void {
    this.goal.copy(p);
    this.target.copy(p);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 6);
    this.target.lerp(this.goal, k);
    // rotation and zoom ease, then settle exactly
    this.yawShown += (this.yaw - this.yawShown) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.yaw - this.yawShown) < 1e-3) this.yawShown = this.yaw;
    const z = ZOOMS[this.zoomIndex];
    this.zoomShown += (z - this.zoomShown) * (1 - Math.exp(-dt * 12));
    if (Math.abs(z - this.zoomShown) < 0.05) this.zoomShown = z;

    const cam = this.camera;
    const halfW = this.width / this.zoomShown / 2;
    const halfH = this.height / this.zoomShown / 2;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.zoom = 1;
    cam.updateProjectionMatrix();
    const dist = 120;
    const t = this.target;
    cam.position.set(
      t.x + Math.sin(this.yawShown) * Math.cos(this.pitch) * dist,
      t.y + Math.sin(this.pitch) * dist,
      t.z + Math.cos(this.yawShown) * Math.cos(this.pitch) * dist,
    );
    cam.lookAt(t);
    cam.updateMatrixWorld();
  }

  /** Ground point (y = 0) under a screen position in [-1, 1] NDC. */
  pick(ndcX: number, ndcY: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return ray.ray.intersectPlane(plane, out);
  }

  /** World point to overlay pixel coordinates. */
  toScreen(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const v = p.clone().project(this.camera);
    return out.set(((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height);
  }
}
