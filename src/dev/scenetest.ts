import * as THREE from 'three';
import { PixelRenderer } from '../engine/pixelRenderer';
import { RESURRECT64, ENDESGA32, C } from '../engine/palette';
import { toon } from '../engine/toon';
import { Sheep } from '../art/sheep';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
PixelRenderer.keepFrames = true;
const pr = new PixelRenderer(canvas, 480, 270);
pr.setPalette(params.has('edg') ? ENDESGA32 : RESURRECT64);
pr.resize(innerWidth, innerHeight, 1);
if (params.has('raw')) pr.post.quantize = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(-6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40 });
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.5));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 1, 1), toon(C.grass));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const sheep: Sheep[] = [];
for (let i = 0; i < 7; i++) {
  const s = new Sheep(i + 1);
  s.root.position.set((i % 4) * 1.6 - 2.4, 0, Math.floor(i / 4) * 1.8 - 0.8);
  s.root.rotation.y = i * 0.9;
  s.graze = i % 3 === 0 ? 1 : 0;
  s.bleat = i === 2 ? 1 : 0;
  s.walk = i === 4 ? 1 : 0;
  s.walkPhase = 1;
  s.update();
  s.root.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  scene.add(s.root);
  sheep.push(s);
}
// a crate and a post for scale
const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), toon(C.terracotta));
crate.position.set(3.2, 0.4, 1.5);
crate.castShadow = crate.receiveShadow = true;
scene.add(crate);

const zoom = +(params.get('zoom') ?? 1);
const cam = new THREE.OrthographicCamera(-240 / 48, 240 / 48, 135 / 48, -135 / 48, 0.1, 200);
cam.zoom = zoom;
cam.updateProjectionMatrix();
cam.position.set(20, 16.3, 20);
cam.lookAt(0, 0.5, 0);
pr.post.depthAbs = 0.3;
pr.post.depthRel = 0;
pr.render(scene, cam);
(window as any).ready = true;
