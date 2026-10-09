import * as THREE from 'three';
import type { PixelRenderer, PostSettings } from '../engine/pixelRenderer';
import type { Fonts } from '../engine/bitmapFont';
import type { Shot, Timeline, VoiceCue } from './timeline';

/** What every set gets to work with. */
export interface StageContext {
  pr: PixelRenderer;
  fonts: Fonts;
  tl: Timeline;
  /** Mouth openness 0..1 for a speaker at timeline time T (lip flaps from the voice envelope). */
  mouth(who: string, T: number): number;
  /** The line a speaker is saying at T, if any. */
  speaking(who: string, T: number): VoiceCue | null;
}

export interface StageSet {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  palette?: string[];
  post?: Partial<PostSettings>;
  /** Called when a shot on this set begins (reset per-shot state). */
  enter?(shot: Shot): void;
  update(shot: Shot, t: number, T: number): void;
  overlay?(g: CanvasRenderingContext2D, shot: Shot, t: number, T: number): void;
  /** Screen effects for this frame (bars, shake, scanlines...). */
  fx?(shot: Shot, t: number): Partial<{ bars: number; shake: [number, number]; scanlines: number; flash: number; invert: number }>;
}

export function makeMouth(tl: Timeline) {
  const mouth = (who: string, T: number): number => {
    for (const v of tl.voices) {
      if (v.who !== who && !(who === 'gafoop' && v.who === 'gafoop_radio')) continue;
      const k = Math.floor((T - v.t) * 60);
      if (k < 0 || k >= v.env.length) continue;
      const e = (v.env.charCodeAt(k) - 48) / 74;
      return Math.min(1, e * 1.4);
    }
    return 0;
  };
  const speaking = (who: string, T: number): VoiceCue | null => tl.voices.find((v) => v.who === who && T >= v.t && T < v.t + v.dur) ?? null;
  return { mouth, speaking };
}
