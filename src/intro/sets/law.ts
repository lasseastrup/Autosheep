import * as THREE from 'three';
import type { StageContext, StageSet } from '../stage';
import type { Shot } from '../timeline';
import { starfield, nebula } from '../../art/earth';
import { C } from '../../engine/palette';
import { clamp, easeOutBack, easeOutCubic, lerp, smooth, window01 } from '../../engine/rng';
import { rect, frame, offscreen, drawRotated, ditherFill } from '../../engine/ui';
import type { BitmapFont } from '../../engine/bitmapFont';
import { drawSprite } from '../../engine/sprites';

const BODY =
  'An invading power may exterminate any and every species of a conquered world, EXCEPT THE DOMINANT SPECIES, which shall be preserved in good order for the formal signing of the surrender (Form 77-B, in triplicate).';
const HIGHLIGHT = ['EXCEPT', 'THE', 'DOMINANT', 'SPECIES,'];

interface Word { w: string; x: number; y: number; width: number; hi: boolean }

function layout(f: BitmapFont, text: string, maxW: number, lh: number): Word[] {
  const words: Word[] = [];
  const space = f.measure(' ');
  let x = 0, y = 0, hiRun = 0;
  for (const w of text.split(' ')) {
    const width = f.measure(w);
    if (x + width > maxW && x > 0) {
      x = 0;
      y += lh;
    }
    const hi = hiRun < HIGHLIGHT.length && w === HIGHLIGHT[hiRun] ? (hiRun++, true) : false;
    words.push({ w, x, y, width, hi });
    x += width + space;
  }
  return words;
}

/** The Intergalactic Code of Conquest, §42.7(b), and Form 77-B. */
export class LawSet implements StageSet {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 480 / 270, 0.1, 1000);
  post = { bloom: 0.6 };
  private stars = starfield(1200, 400, 11);
  private doc: HTMLCanvasElement | null = null;
  private words: Word[] = [];

  constructor(private ctx: StageContext) {
    this.scene.add(nebula(500), this.stars);
    this.camera.position.set(0, 0, 0);
  }

  private buildDoc(): HTMLCanvasElement {
    const f = this.ctx.fonts;
    const W = 300, H = 210;
    const [c, g] = offscreen(W, H);
    // parchment with darker deckled edges and a few dithered age spots
    rect(g, 0, 0, W, H, C.skin);
    ditherFill(g, 0, 0, W, 6, C.peach, 0.6);
    ditherFill(g, 0, H - 8, W, 8, C.peach, 0.6);
    ditherFill(g, 0, 0, 6, H, C.peach, 0.5);
    ditherFill(g, W - 6, 0, 6, H, C.peach, 0.5);
    for (const [x, y, r] of [[40, 160, 9], [250, 40, 7], [210, 180, 6]]) ditherFill(g, x - r, y - r, r * 2, r * 2, C.peach, 0.35);
    frame(g, 0, 0, W, H, C.tan);
    frame(g, 8, 8, W - 16, H - 16, C.terracotta);
    frame(g, 10, 10, W - 20, H - 20, C.tan);
    f.small.draw(g, 'THE INTERGALACTIC', W / 2, 18, { color: C.rust, align: 'center' });
    f.title.draw(g, 'CODE OF CONQUEST', W / 2, 28, { color: C.ink, align: 'center' });
    f.tiny.draw(g, 'VOLUME XLII  -  CHAPTER 7  -  NINTH REVISED EDITION', W / 2, 52, { color: C.clay, align: 'center' });
    rect(g, 40, 63, W - 80, 1, C.terracotta);
    drawSprite(g, 'star', W / 2 - 6, 58, 1);
    f.small.draw(g, '42.7 (b)  THE EXTERMINATION CLAUSE', 24, 74, { color: C.wine });
    this.words = layout(f.tiny, BODY, W - 48, 11);
    for (const w of this.words) f.tiny.draw(g, w.w, 24 + w.x, 90 + w.y, { color: C.ink });
    f.tiny.draw(g, '* Pens to be provided by the invader.', 24, 168, { color: C.clay });
    // wax seal
    g.fillStyle = C.crimson;
    g.beginPath();
    g.arc(W - 46, H - 34, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.scarlet;
    g.beginPath();
    g.arc(W - 47, H - 35, 11, 0, Math.PI * 2);
    g.fill();
    drawSprite(g, 'star', W - 53, H - 41, 1);
    return c;
  }

  update(_shot: Shot, t: number, T: number): void {
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = T;
    this.camera.rotation.set(0.1, t * 0.02, 0);
  }

  overlay(g: CanvasRenderingContext2D, shot: Shot, t: number): void {
    const f = this.ctx.fonts;
    if (!this.doc) this.doc = this.buildDoc();
    const m = shot.marks;
    // the document rises into view and drifts slowly
    const rise = easeOutCubic(clamp(t / 0.8));
    const formIn = window01(t, m.form - 0.2, m.form + 0.3);
    const x = Math.round(90 - formIn * 70);
    const y = Math.round(lerp(280, 22, rise) - smooth(t / 12) * 8);
    rect(g, x + 3, y + 3, 300, 210, C.black);
    g.drawImage(this.doc, x, y);
    // the highlighter sweep over "EXCEPT THE DOMINANT SPECIES"
    if (t > m.except - 0.1) {
      const k = clamp((t - m.except + 0.1) / 0.9);
      const hi = this.words.filter((w) => w.hi);
      const total = hi.reduce((s, w) => s + w.width + 4, 0);
      let drawn = total * k;
      for (const w of hi) {
        const take = Math.max(0, Math.min(w.width + 4, drawn));
        drawn -= w.width + 4;
        if (take <= 0) break;
        rect(g, x + 24 + w.x - 2, y + 90 + w.y - 2, take, 10, C.lemon);
        f.tiny.draw(g, w.w, x + 24 + w.x, y + 90 + w.y, { color: C.ink });
      }
      // a big "!" margin note
      if (k >= 1) f.title.draw(g, '!', x + 12, y + 88, { color: C.scarlet });
    }
    // Form 77-B slides in
    if (t > m.form - 0.2) {
      const k = easeOutBack(clamp((t - m.form + 0.2) / 0.5), 1.1);
      const fx = Math.round(lerp(500, 250, k)), fy = 60;
      rect(g, fx + 3, fy + 3, 200, 150, C.black);
      rect(g, fx, fy, 200, 150, C.white);
      frame(g, fx, fy, 200, 150, C.fog);
      rect(g, fx, fy, 200, 16, C.navy);
      f.small.draw(g, 'FORM 77-B  (1 OF 3)', fx + 8, fy + 4, { color: C.white });
      f.small.draw(g, 'SURRENDER OF A PLANET', fx + 8, fy + 24, { color: C.ink });
      const rows: [string, string][] = [['PLANET', 'EARTH'], ['DOMINANT SPECIES', ''], ['SIGNATURE', ''], ['PAW/HOOF PRINT', '']];
      rows.forEach(([label, val], i) => {
        const yy = fy + 42 + i * 24;
        f.tiny.draw(g, label, fx + 8, yy, { color: C.lilac });
        rect(g, fx + 8, yy + 16, 184, 1, C.fog);
        if (val) f.small.draw(g, val, fx + 10, yy + 8, { color: C.blue });
      });
      // "X" marks where to sign
      f.small.draw(g, 'X', fx + 10, fy + 98, { color: C.scarlet });
    }
    // APPROVED stamp
    if (t > m.stamp) {
      const k = clamp((t - m.stamp) / 0.12);
      const [st, sg] = offscreen(120, 30);
      sg.fillStyle = C.scarlet;
      sg.fillRect(0, 0, 120, 30);
      sg.clearRect(3, 3, 114, 24);
      f.title.draw(sg, 'APPROVED', 60, 4, { color: C.scarlet, align: 'center' });
      drawRotated(g, st, 352, 150, -0.22, lerp(2.4, 1, easeOutCubic(k)));
    }
  }

  fx(shot: Shot, t: number) {
    const m = shot.marks;
    if (t > m.stamp && t < m.stamp + 0.25) {
      const k = 1 - (t - m.stamp) / 0.25;
      return { shake: [Math.sin(t * 80) * 2 * k, Math.cos(t * 70) * 2 * k] as [number, number] };
    }
    return {};
  }
}
