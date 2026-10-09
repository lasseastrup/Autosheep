import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { Gafoop, Blorp } from '../../art/gafoop';
import { Sheep } from '../../art/sheep';
import { Planet, starfield } from '../../art/earth';
import { toon, glow, noOutline } from '../../engine/toon';
import { C } from '../../engine/palette';
import { mesh } from '../../art/geo';
import { PuffSystem, SparkSystem } from '../../art/fx';
import { clamp, easeOutBack, easeOutCubic, lerp, smooth, window01 } from '../../engine/rng';
import { panel, ditherOut } from '../../engine/ui';
import { drawSprite } from '../../engine/sprites';

const HOLO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const HOLO_FRAG = /* glsl */ `
uniform vec3 uColor, uRim; uniform float uTime, uBright, uFlicker, uRimAmt;
varying vec3 vN; varying vec3 vV;
void main() {
  float row = floor(gl_FragCoord.y);
  // thin see-through scanline gaps that crawl upward, plus occasional dropout bands
  if (mod(row + floor(uTime * 12.0), 4.0) < 1.0) discard;
  float band = fract(sin(floor(gl_FragCoord.y / 6.0 + floor(uTime * 9.0)) * 91.7) * 4375.5);
  if (band < uFlicker) discard;
  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);
  float lit = 0.55 + 0.45 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.6, 0.7))), 0.0);
  gl_FragColor = vec4((uColor * lit + uRim * fres * 1.5 * uRimAmt) * uBright, 1.0);
}`;

function holoMat(color: string, bright = 1, rim = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: { uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(C.ice) }, uTime: { value: 0 }, uBright: { value: bright }, uFlicker: { value: 0 }, uRimAmt: { value: rim } },
  });
}

/** The Grand Auditor: a vast four-eyed head in a powdered judge's wig, monocle, jowls. */
class Auditor {
  root = new THREE.Group();
  mats: THREE.ShaderMaterial[] = [];
  jaw: THREE.Mesh;
  eyes: THREE.Mesh[] = [];
  gavel = new THREE.Group();
  constructor() {
    const skin = holoMat(C.teal, 1.0);
    const wig = holoMat(C.ice, 1.0);
    const dark = holoMat(C.black, 1.0, 0);
    const eyeW = holoMat(C.white, 1.2, 0.3);
    this.mats.push(skin, wig, dark, eyeW);
    this.root.add(mesh(new THREE.SphereGeometry(1, 24, 18), skin, [0, 0, 0], undefined, [0.85, 1.25, 0.8]));
    this.root.add(mesh(new THREE.SphereGeometry(0.45, 16, 10), skin, [0, -0.85, 0.35], undefined, [1.3, 0.7, 0.8])); // jowls
    // four eyes in two rows, the monocle on the upper right
    for (const [x, y, s] of [[-0.32, 0.38, 0.17], [0.32, 0.38, 0.17], [-0.22, 0.05, 0.12], [0.22, 0.05, 0.12]] as const) {
      const e = mesh(new THREE.SphereGeometry(s * 1.15, 12, 8), eyeW, [x, y, 0.7]);
      e.add(mesh(new THREE.SphereGeometry(s * 0.6, 8, 6), dark, [0, 0, s * 0.85]));
      this.eyes.push(e);
      this.root.add(e);
    }
    this.root.add(mesh(new THREE.TorusGeometry(0.23, 0.035, 6, 16), wig, [0.32, 0.38, 0.84]));
    this.root.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3), wig, [0.5, -0.05, 0.75], [0, 0, 0.3]));
    // brows (stern)
    for (const s of [-1, 1]) this.root.add(mesh(new THREE.BoxGeometry(0.4, 0.1, 0.12), dark, [s * 0.32, 0.64, 0.76], [0, 0, s * -0.3]));
    this.jaw = mesh(new THREE.SphereGeometry(0.26, 12, 8), dark, [0, -0.45, 0.72], undefined, [1.4, 0.3, 0.5]);
    this.root.add(this.jaw);
    // the wig: a crown of curls and long side rolls
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI - Math.PI;
      this.root.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), wig, [Math.cos(a) * 0.85, 1.0 + Math.sin(-a) * 0.35, -0.1], undefined, [1, 0.8, 1]));
    }
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) this.root.add(mesh(new THREE.TorusGeometry(0.2, 0.1, 6, 12), wig, [s * 0.95, 0.5 - k * 0.38, -0.1], [0, Math.PI / 2, 0]));
    // a hologram gavel, raised off to the side
    this.gavel.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 12), wig, [0, 0, 0], [0, 0, Math.PI / 2]));
    this.gavel.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), dark, [0, -0.6, 0]));
    this.gavel.position.set(1.9, 0.6, 0.3);
    this.root.add(this.gavel);
    noOutline(this.root);
  }
  update(T: number, bright: number, flicker: number, mouth: number): void {
    for (const m of this.mats) {
      m.uniforms.uTime.value = T;
      m.uniforms.uBright.value = bright;
      m.uniforms.uFlicker.value = flicker;
    }
    this.jaw.scale.set(1.3, 0.25 + mouth * 1.1, 0.5);
    this.root.visible = bright > 0.02;
  }
}

function strawHat(): THREE.Group {
  const g = new THREE.Group();
  const hc = toon(C.straw);
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 16), hc));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 12), hc, [0, 0.08, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.04, 12), toon(C.scarlet), [0, 0.03, 0]));
  return g;
}

/** A lit screen with a little procedural UI drawn into a canvas texture. */
function consoleScreen(w: number, h: number, seed: number): { mesh: THREE.Mesh; draw: (T: number) => void } {
  const cvs = document.createElement('canvas');
  cvs.width = 32;
  cvs.height = 20;
  const g = cvs.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  noOutline(m);
  let last = -1;
  const draw = (T: number) => {
    const f = Math.floor(T * 6);
    if (f === last) return;
    last = f;
    g.fillStyle = '#0b5e65';
    g.fillRect(0, 0, 32, 20);
    g.fillStyle = '#30e1b9';
    for (let i = 0; i < 6; i++) {
      const v = (Math.sin(f * 0.7 + i * 1.3 + seed) + 1) * 0.5;
      g.fillRect(2 + i * 5, 18 - Math.round(v * 12), 3, Math.round(v * 12));
    }
    g.fillStyle = '#8ff8e2';
    g.fillRect(2, 2, ((f + seed) % 7) * 4, 2);
    tex.needsUpdate = true;
  };
  return { mesh: m, draw };
}

export class BridgeSet implements StageSet {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 480 / 270, 0.1, 500);
  post = { depthAbs: 0.06, depthRel: 0.025, outline: 0.62, highlight: 0.3, bloom: 1.0, bloomThreshold: 1.25 };
  private gafoop = new Gafoop();
  private blorp = new Blorp();
  private chair = new THREE.Group();
  private auditor = new Auditor();
  private sheep = new Sheep(21);
  private hat = strawHat();
  private form = new THREE.Group();
  private screens: { draw: (T: number) => void }[] = [];
  private key = new THREE.DirectionalLight(0xc8d8ff, 0.8);
  private alarm = new THREE.PointLight(0xff3020, 0, 30, 1.2);
  private holoLight = new THREE.PointLight(0x30e1b9, 0, 25, 1.2);
  private hemi = new THREE.HemisphereLight(0x9aa0ff, 0x302040, 0.7);
  private fill = new THREE.DirectionalLight(0xffe8d0, 0.55);
  private puffs = new PuffSystem(80);
  private sparks = new SparkSystem(200);
  private padGlow: THREE.Mesh;
  private beam: THREE.Mesh;
  private planet = new Planet(6);
  private stars = starfield(800, 200, 7);

  constructor(private ctx: StageContext) {
    const s = this.scene;
    s.background = new THREE.Color(C.black);
    s.add(this.stars);
    this.planet.root.position.set(6, -3, -45);
    this.planet.surface.rotation.y = 2.2;
    s.add(this.planet.root);
    s.add(this.key, this.hemi, this.alarm, this.holoLight, this.fill);
    this.fill.position.set(1.5, 4, 8);
    this.key.position.set(2, 6, -8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    this.planet.setSun(new THREE.Vector3(-1, 0.5, 1));
    this.alarm.position.set(0, 5, 2);
    this.holoLight.position.set(0, 3, -4);

    // floor: dais rings and glowing strips
    s.add(mesh(new THREE.CylinderGeometry(10, 10, 0.4, 40), toon(C.coal), [0, -0.2, 0]));
    s.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 24), toon(C.lilac), [0, 0.15, 0]));
    for (const r of [3, 6]) s.add(noOutline(mesh(new THREE.TorusGeometry(r, 0.04, 4, 48), glow(C.jade, 1.4), [0, 0.02, 0], [Math.PI / 2, 0, 0])));

    // the panoramic window: an arc of struts, open to space
    const wall = toon(C.indigo);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      s.add(mesh(new THREE.BoxGeometry(0.3, 7, 0.3), wall, [Math.cos(a) * 9, 3.3, Math.sin(a) * 9 + 1]));
    }
    s.add(mesh(new THREE.TorusGeometry(9, 0.25, 6, 40, Math.PI), wall, [0, 6.6, 1], [Math.PI / 2, 0, Math.PI]));
    s.add(mesh(new THREE.TorusGeometry(9, 0.2, 6, 40, Math.PI), toon(C.violet), [0, 0.6, 1], [Math.PI / 2, 0, Math.PI]));
    // side walls and ceiling
    for (const sx of [-1, 1]) s.add(mesh(new THREE.BoxGeometry(0.5, 7, 12), toon(C.navy), [sx * 9.2, 3.3, 5]));
    s.add(mesh(new THREE.BoxGeometry(19, 0.5, 12), toon(C.navy), [0, 7, 5]));

    // consoles left and right
    for (const sx of [-1, 1]) {
      const con = new THREE.Group();
      con.add(mesh(new THREE.BoxGeometry(2.2, 1, 1), toon(C.plum), [0, 0.5, 0]));
      con.add(mesh(new THREE.BoxGeometry(2.2, 0.15, 1.1), toon(C.violet), [0, 1.05, 0.05], [-0.35, 0, 0]));
      const sc = consoleScreen(1.6, 0.7, sx + 3);
      sc.mesh.position.set(0, 1.55, -0.3);
      sc.mesh.rotation.x = -0.15;
      con.add(sc.mesh);
      this.screens.push(sc);
      for (let k = 0; k < 6; k++) con.add(noOutline(mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), glow(k % 2 ? C.scarlet : C.gold, 1.8), [-0.8 + k * 0.3, 1.1, 0.25], [-0.35, 0, 0])));
      con.position.set(sx * 3.4, 0, -1.6);
      con.rotation.y = -sx * 0.5;
      s.add(con);
    }

    // a portrait of the general (vanity), gold frame
    const pc = document.createElement('canvas');
    pc.width = 24;
    pc.height = 30;
    const pg = pc.getContext('2d')!;
    pg.fillStyle = '#6b3e75'; pg.fillRect(0, 0, 24, 30);
    pg.fillStyle = '#91db69'; pg.beginPath(); pg.arc(12, 20, 8, 0, Math.PI * 2); pg.fill();
    pg.fillStyle = '#484a77'; pg.fillRect(5, 9, 14, 4);
    pg.fillStyle = '#f9c22b'; pg.fillRect(5, 12, 14, 1); pg.fillRect(11, 10, 2, 2);
    pg.fillStyle = '#ffffff'; for (const x of [7, 12, 17]) pg.fillRect(x - 1, 5, 3, 3);
    pg.fillStyle = '#2e222f'; for (const x of [7, 12, 17]) pg.fillRect(x, 6, 1, 1);
    pg.fillStyle = '#2e222f'; pg.fillRect(8, 22, 8, 2);
    const ptex = new THREE.CanvasTexture(pc);
    ptex.magFilter = ptex.minFilter = THREE.NearestFilter;
    ptex.colorSpace = THREE.SRGBColorSpace;
    const portrait = new THREE.Group();
    portrait.add(mesh(new THREE.BoxGeometry(1.7, 2.1, 0.12), toon(C.gold)));
    portrait.add(mesh(new THREE.PlaneGeometry(1.4, 1.8), toon(0xffffff, { map: ptex }), [0, 0, 0.07]));
    portrait.position.set(-8.9, 3.5, 4.5);
    portrait.rotation.y = Math.PI / 2;
    s.add(portrait);
    // banners
    for (const sx of [-1, 1]) {
      const b = new THREE.Group();
      b.add(mesh(new THREE.BoxGeometry(1.2, 3, 0.05), toon(C.plum)));
      b.add(mesh(new THREE.OctahedronGeometry(0.35, 0), toon(C.gold), [0, 0.5, 0.05]));
      b.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 0.08), toon(C.gold), [0, -1.45, 0.02]));
      b.position.set(sx * 8.9, 4, 1.5);
      b.rotation.y = -sx * Math.PI / 2;
      s.add(b);
    }

    // the command chair
    const seat = toon(C.wine);
    this.chair.add(mesh(new THREE.BoxGeometry(1.45, 0.3, 1.25), seat, [0, 0.55, 0]));
    this.chair.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.25, 20, 1, false, Math.PI / 2, Math.PI), seat, [0, 1.25, -0.5], [Math.PI / 2, 0, 0], [1, 1, 1.25]));
    this.chair.add(mesh(new THREE.TorusGeometry(0.8, 0.06, 6, 20, Math.PI), toon(C.gold), [0, 1.27, -0.64], [0, 0, 0], [1, 1.25, 1]));
    this.chair.add(mesh(new THREE.OctahedronGeometry(0.16, 0), toon(C.gold), [0, 2.32, -0.64]));
    for (const sx of [-1, 1]) {
      this.chair.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 1.1), toon(C.gold), [sx * 0.74, 0.98, 0]));
      this.chair.add(mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), toon(C.rust), [sx * 0.74, 0.78, 0.45]));
    }
    this.chair.add(mesh(new THREE.CylinderGeometry(0.2, 0.4, 0.4, 10), toon(C.lilac), [0, 0.2, 0]));
    this.chair.position.set(0, 0.3, 0);
    this.gafoop.root.position.set(0, 0.72, 0.05);
    this.chair.add(this.gafoop.root);
    s.add(this.chair);

    // a mug of something
    this.gafoop.armL.root.add(mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.16, 8), toon(C.white), [0.55, -0.2, 0.1]));

    this.blorp.root.position.set(-3.2, 0, -0.4);
    s.add(this.blorp.root);

    // hologram projector pad + the auditor
    s.add(mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.25, 24), toon(C.lilac), [0, 0.12, -4.5]));
    this.padGlow = noOutline(mesh(new THREE.CircleGeometry(1.0, 24), glow(C.mint, 2), [0, 0.26, -4.5], [-Math.PI / 2, 0, 0]));
    s.add(this.padGlow);
    const beamGeo = new THREE.CylinderGeometry(1.5, 0.95, 4, 24, 1, true);
    this.beam = noOutline(new THREE.Mesh(beamGeo, glow(C.mint, 0.7, { transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    this.beam.position.set(0, 2.2, -4.5);
    s.add(this.beam);
    this.auditor.root.position.set(0, 4.3, -4.6);
    this.auditor.root.scale.setScalar(1.6);
    s.add(this.auditor.root);

    // the podium where the "dominant species" signs
    const pod = new THREE.Group();
    pod.add(mesh(new THREE.BoxGeometry(1.8, 0.35, 1.4), toon(C.plum), [0, 0.18, 0]));
    pod.add(mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), toon(C.violet), [0.9, 0.5, -0.2]));
    pod.position.set(2.6, 0, -3.2);
    s.add(pod);
    this.form.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 0.65), toon(C.white)));
    this.form.add(mesh(new THREE.BoxGeometry(0.5, 0.025, 0.06), toon(C.scarlet), [0, 0.005, -0.25]));
    this.form.position.set(3.5, 1.02, -3.4);
    this.form.rotation.x = -0.3;
    s.add(this.form);
    this.hat.position.set(0, 0.85, 0.48);
    this.sheep.head.add(this.hat);
    this.hat.position.set(0, 0.16, -0.03);
    this.hat.scale.setScalar(0.75);
    s.add(this.sheep.root);
    s.add(this.puffs.mesh, this.sparks.points);
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.layers.isEnabled(1)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  enter(shot: Shot): void {
    this.puffs.clear();
    this.sparks.clear();
    if (shot.name === 'audit') {
      // paper scraps when the form is eaten
      const at = new THREE.Vector3(3.4, 1.15, -3.3);
      for (let i = 0; i < 4; i++) this.puffs.burst(shot.marks.eat + i * 0.18, at, 3, { color: [C.white, C.mist], size: 0.06, speed: 1.2, up: 1.2, grav: 3, life: 0.9, seed: 50 + i, grow: 1 });
      // gavel sparks
      this.sparks.burst(shot.marks.gavel, new THREE.Vector3(2.2, 4.0, -4.0), 40, { color: [C.ice, C.mint, C.white], speed: 5, life: 0.7, intensity: 1.6, seed: 7 });
    }
  }

  private cam(pos: [number, number, number], look: [number, number, number], fov = 35): void {
    this.camera.position.set(...pos);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(...look);
  }

  update(shot: Shot, t: number, T: number): void {
    const g = this.gafoop, b = this.blorp, m = shot.marks;
    for (const s of this.screens) s.draw(T);
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = T;
    this.planet.surface.rotation.y = 2.2 + T * 0.02;

    // defaults
    g.mouth = this.ctx.mouth('gafoop', T);
    b.mouth = this.ctx.mouth('blorp', T);
    g.blink = (T % 3.7) < 0.12 ? 1 : 0;
    b.blink = (T % 4.3) < 0.15 ? 1 : 0;
    g.squash = 0;
    g.eyeDroop = 0;
    g.eyeWobble = 0;
    g.sweatAmount = 0;
    g.capTilt = 0;
    g.look.set(0, 0);
    g.armL.swing = -1.1; g.armL.curl = 0.22; g.armL.wave = 0;
    g.armR.swing = -1.1; g.armR.curl = 0.22; g.armR.wave = 0;
    b.look.set(0.5, 0);
    b.slump = 0.3;
    this.alarm.intensity = 0;
    this.fill.intensity = 0.55;
    this.key.color.set(0xc8d8ff);
    this.hemi.intensity = 0.7;
    this.fill.position.set(1.5, 4, shot.name === 'audit' ? -8 : 8);
    let holo = 0, flicker = 0;
    this.sheep.root.visible = false;
    this.form.visible = false;

    if (shot.name === 'chair') {
      // the chair spin reveal
      const spin = easeOutBack(clamp((t - m.spin) / 1.2), 1.3);
      this.chair.rotation.y = Math.PI * (1 - spin);
      g.look.set(0, -0.2);
      if (t < m.turned + 0.2) g.squash = -0.05;
      if (t < m.blorp) {
        if (t < m.spin + 0.4) this.cam([0, 2.6, 7.5], [0, 1.7, -4], 38);
        else {
          const k = smooth((t - m.turned) / 3);
          this.cam([lerp(0, 0.6, k), lerp(2.0, 1.75, k), lerp(5.6, 4.4, k)], [0, 1.45, 0], 34);
        }
        // point on "Scan the planet"
        const p = window01(t, m.G01 + 1.2, m.G01 + 1.5) * (1 - window01(t, m['G01.end'], m['G01.end'] + 0.4));
        g.armL.swing = lerp(-1.1, 0.5, p);
        g.armL.curl = lerp(0.22, 0.05, p);
        g.squash = -0.06 * p;
      } else {
        // Blorp at his console
        this.cam([-1.2, 1.7, 2.4], [-3.3, 1.2, -0.8], 30);
        b.look.set(0.7, -0.1);
        b.slump = 0.55;
        b.armR.swing = lerp(-1.3, -0.4, window01(t, m.B01 + 0.2, m.B01 + 0.5));
      }
    } else if (shot.name === 'obvious') {
      this.chair.rotation.y = 0;
      const toB02 = m.b02, toG03 = m.G03;
      if (t < toB02) {
        // proud close-up, arms flung wide on "obvious"
        const k = smooth(t / 1.5);
        this.cam([0.3, lerp(1.55, 1.5, k), lerp(3.6, 3.2, k)], [0, 1.45, 0], 32);
        const up = window01(t, 0.3, 0.6);
        g.armL.swing = lerp(-1.1, 0.7, up) + Math.sin(t * 4) * 0.08 * up;
        g.armR.swing = lerp(-1.1, 0.7, up) + Math.cos(t * 4) * 0.08 * up;
        g.armL.curl = g.armR.curl = 0.12;
        g.squash = -0.05 * up;
        g.look.set(0, 0.3);
      } else if (t < toG03) {
        // two-shot: Blorp raises a timid tentacle
        this.cam([-1.4, 1.8, 4.6], [-1.4, 1.2, -0.2], 34);
        b.root.position.set(-1.9, 0, 0.8);
        b.root.rotation.y = 0.9;
        b.look.set(0.8, 0.1);
        b.slump = 0.2;
        b.armL.swing = lerp(-1.0, 0.9, window01(t, toB02 + 0.2, toB02 + 0.5));
        g.look.set(-0.8, 0);
      } else {
        // the interruption — and on "power", a low angle in red
        const pw = window01(t, m.power - 0.1, m.power + 0.1);
        b.root.position.set(-1.9, 0, 0.8);
        b.root.rotation.y = 0.9;
        b.slump = 0.7;
        if (t < m.power - 0.1) this.cam([-0.5, 1.6, 3.8], [-0.3, 1.4, 0], 36);
        else this.cam([0.25, 0.75, 2.6], [0, 1.55, 0], 40);
        g.armL.swing = lerp(-0.3, 1.3, pw);
        g.armR.swing = lerp(-1.1, 1.2, pw);
        g.armL.curl = g.armR.curl = 0.1;
        g.squash = -0.08 * pw;
        g.look.set(lerp(-0.6, 0, pw), lerp(0, 0.4, pw));
        this.key.color.set(pw > 0.5 ? 0xff5040 : 0xc8d8ff);
        this.alarm.intensity = pw * 6;
        this.hemi.intensity = lerp(0.7, 0.2, pw);
        this.fill.intensity = lerp(0.55, 0.15, pw);
      }
    } else if (shot.name === 'audit') {
      this.chair.rotation.y = Math.PI;
      // the hologram powers up
      holo = window01(t, 0.6, 2.0);
      flicker = t < 2.2 ? 0.5 * (1 - holo) + (Math.sin(t * 37) > 0.6 ? 0.3 : 0) : 0.02;
      if (t > m.gavel - 0.1 && t < m.gavel + 0.15) flicker = 0.4;
      b.root.position.set(1.0, 0, -1.4);
      b.root.rotation.y = -0.3;
      // sheep and form
      this.sheep.root.visible = t > m.present - 0.2;
      this.form.visible = t < m.eat + 0.9;
      this.form.scale.setScalar(t > m.eat ? Math.max(0.01, 1 - (t - m.eat) / 0.9) : 1);
      const walk = clamp((t - m.present) / 1.4);
      this.sheep.root.position.set(lerp(0.6, 2.7, easeOutCubic(walk)), walk > 0 ? 0.35 * smooth(walk * 2 - 0.6) : 0, lerp(-1.0, -3.15, easeOutCubic(walk)));
      this.sheep.root.rotation.y = lerp(2.4, 1.9, walk);
      this.sheep.walk = walk > 0 && walk < 1 ? 1 : 0;
      this.sheep.walkPhase = t * 12;
      this.sheep.graze = t > m.eat - 0.3 && t < m.eat + 1.2 ? 0.55 : 0;
      this.sheep.bleat = t > m.eat + 1.3 && t < m.eat + 2.1 ? 1 : 0;
      this.sheep.update();
      // Blorp shoves the sheep forward then retreats
      b.root.position.set(lerp(-0.2, 1.6, easeOutCubic(walk)) - (walk >= 1 ? 0.6 * smooth((t - m.present - 1.4) / 0.6) : 0), 0, lerp(0.2, -1.5, easeOutCubic(walk)));
      if (t < m.present) b.root.position.set(-1.5, 0, -1.0);
      b.root.rotation.y = t < m.present ? Math.PI * 0.9 : -2.4;
      b.armL.swing = walk > 0 && walk < 1 ? 0.0 : -1.0;
      b.armR.swing = walk > 0 && walk < 1 ? 0.0 : -1.3;
      b.look.set(0.3, 0.6);

      // camera coverage (the general faces the hologram, i.e. -Z)
      const ill = m.illegal, ic = m.icons;
      if (t < m.holo) this.cam([3.4, 2.3, 3.4], [0, 2.6, -4.5], 42);
      else if (t < m.present) this.cam([lerp(1.9, 1.5, smooth((t - m.holo) / 8)), 1.0, 0.6], [0, 4.0, -4.6], 46);
      else if (t < m.A03) this.cam([4.0, 1.7, -6.6], [2.2, 0.9, -2.9], 36);
      else if (t < m.G05) this.cam([-1.8, 1.2, 0.8], [0, 4.0, -4.6], 46);
      else if (t < ill) this.cam([0.35, 1.9, -2.8], [0, 1.85, 0], 36);
      else if (t < m.A05) {
        const k = smooth((t - ill) / 1.4);
        this.cam([0.2, 1.9, lerp(-3.0, -2.0, k)], [0, 1.85, 0], lerp(36, 32, k));
      } else if (t < ic) this.cam([7.5, 2.4, -2.3], [0, 2.7, -2.3], 44);
      else if (t < m.G07) this.cam([-1.8, 1.2, 0.8], [0, 4.0, -4.6], 46);
      else if (t < m.sentence) this.cam([0.3, 2.0, -3.4], [0, 1.75, 0], 36);
      else {
        const k = smooth((t - m.sentence) / 6);
        this.cam([lerp(2.6, 2.0, k), lerp(1.2, 0.8, k), lerp(2.4, 1.8, k)], [0, lerp(3.4, 3.9, k), -4.5], lerp(46, 52, k));
      }
      // Gafoop's reactions
      g.look.set(0, 0.5);
      if (t > m.A03 && t < m.A04) g.sweatAmount = 1;
      if (t > m.G05 && t < m['G05.end']) {
        g.armL.swing = 0.3;
        g.armL.curl = 0.1;
      }
      if (t > ill && t < m.A05 + 1) {
        g.eyeWobble = 1;
        g.sweatAmount = 1;
        g.squash = 0.06;
        this.alarm.intensity = (Math.floor((t - ill) * 3) % 2 === 0 ? 7 : 1) * (1 - window01(t, m.A05, m.A05 + 0.8));
      }
      if (t > m.G06 && t < m['G06.end']) {
        g.armL.swing = 0.8;
        g.armR.swing = 0.8;
        g.squash = -0.05;
      }
      if (t > m.G07 && t < m.sentence + 2) {
        g.eyeDroop = window01(t, m.G07, m.G07 + 0.8);
        g.squash = 0.12 * window01(t, m.G07, m.G07 + 1);
        g.armL.swing = g.armR.swing = -1.4;
      }
      if (t > m.gavel) {
        g.squash = 0.2;
        g.eyeWobble = 1;
      }
      // the gavel comes down at the end
      const lift = window01(t, m.sentence + 1, m.gavel - 0.3);
      const slam = window01(t, m.gavel - 0.12, m.gavel);
      this.auditor.gavel.rotation.z = lerp(0, 1.2, lift) - lerp(0, 2.2, slam);
    }

    // hologram & lights
    this.auditor.update(T, holo, flicker, this.ctx.mouth('auditor', T));
    this.auditor.root.rotation.y = Math.sin(T * 0.4) * 0.08;
    this.auditor.root.position.y = 4.3 + Math.sin(T * 1.1) * 0.08;
    this.beam.visible = holo > 0.05;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.08 * holo;
    this.padGlow.visible = shot.name === 'audit';
    this.holoLight.intensity = holo * 5;
    g.update(T);
    b.update(T);
    this.puffs.update(t);
    this.sparks.update(t);
  }

  overlay(g: CanvasRenderingContext2D, shot: Shot, t: number): void {
    if (shot.name !== 'audit') return;
    const m = shot.marks;
    // the hologram's evidence board: rocket, atom, burrito
    if (t > m.rocket - 0.2 && t < m.G07 + 0.5) {
      const f = this.ctx.fonts;
      const x = 312, y = 36, w = 150, h = 96;
      panel(g, x, y, w, h, { fill: C.deepTeal, border: C.ice, accent: C.mint });
      f.small.draw(g, 'HUMAN TECHNOLOGY', x + 8, y + 6, { color: C.ice });
      const items: [string, string, string][] = [['rocket', 'rocket', 'SPACE TRAVEL'], ['atom', 'atom', 'NUCLEAR POWER'], ['burrito', 'burrito', 'MICROWAVE BURRITO']];
      items.forEach(([mk, spr, label], i) => {
        if (t < m[mk]) return;
        const yy = y + 20 + i * 24;
        drawSprite(g, spr, x + 10, yy, Math.round(lerp(0, 1, easeOutBack(clamp((t - m[mk]) / 0.2)))) || 1);
        f.tiny.draw(g, label, x + 28, yy + 4, { color: C.white });
      });
      const vis = window01(t, m.rocket - 0.2, m.rocket + 0.2) * (1 - window01(t, m.G07, m.G07 + 0.5));
      ditherOut(g, x - 2, y - 2, w + 6, h + 6, 1 - vis);
    }
  }

  fx(shot: Shot, t: number) {
    const m = shot.marks;
    if (shot.name === 'audit') {
      let sx = 0, sy = 0, flash = 0;
      if (t > m.illegal && t < m.illegal + 0.6) {
        const k = 1 - (t - m.illegal) / 0.6;
        sx = Math.sin(t * 60) * 2 * k;
        sy = Math.cos(t * 47) * 2 * k;
      }
      if (t > m.gavel && t < m.gavel + 0.5) {
        const k = 1 - (t - m.gavel) / 0.5;
        sx = Math.sin(t * 70) * 3 * k;
        sy = Math.cos(t * 53) * 3 * k;
        flash = k * 0.6;
      }
      return { bars: 18, shake: [sx, sy] as [number, number], flash };
    }
    if (shot.name === 'obvious' && t > m.power - 0.1 && t < m.power + 0.4) {
      const k = 1 - (t - m.power + 0.1) / 0.5;
      return { bars: 18, shake: [Math.sin(t * 50) * 1.5 * k, 0] as [number, number] };
    }
    return { bars: 18 };
  }
}

