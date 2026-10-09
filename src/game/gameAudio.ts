import { AudioEngine } from '../audio/engine';
import { SCORE, sectionEvents } from '../audio/music';
import * as sfx from '../audio/sfx';

/** Real-time audio for the game: a looping pastoral score and one-shot effects. */
export class GameAudio {
  readonly a: AudioEngine;
  private lastBleat = 0;
  private lastRattle = 0;

  constructor(readonly ctx: AudioContext) {
    this.a = new AudioEngine(ctx);
    this.a.music.gain.value = 0.26;
  }

  startMusic(): void {
    // an hour of the sheep theme; the engine schedules it a little at a time
    this.a.setEvents(sectionEvents(SCORE.pastoral, 0, 3600));
    this.a.startRealtime(0);
  }

  private get now(): number {
    return this.ctx.currentTime + 0.01;
  }

  /** A sheep bleats at screen position `pan` (-1..1) and loudness `vol`. */
  bleat(pan: number, vol: number, pitch: number, panicked: boolean): void {
    if (this.ctx.currentTime - this.lastBleat < (panicked ? 0.25 : 0.7) || vol < 0.05) return;
    this.lastBleat = this.ctx.currentTime;
    sfx.bleat(this.a, this.now, { pan: Math.max(-0.9, Math.min(0.9, pan)), vol: vol * (panicked ? 0.8 : 0.55), pitch, len: panicked ? 0.5 : 0.75 });
  }

  megaphone(): void {
    sfx.megaphone(this.a, this.now, { vol: 0.9 });
  }

  rattle(): void {
    if (this.ctx.currentTime - this.lastRattle < 0.45) return;
    this.lastRattle = this.ctx.currentTime;
    sfx.rattle(this.a, this.now, { dur: 0.42 });
  }

  gate(open: boolean): void {
    sfx.thud(this.a, this.now, { vol: 0.8, pitch: open ? 1.2 : 0.9 });
    if (!open) sfx.pop(this.a, this.now + 0.05, { pitch: 0.7 });
  }

  penned(): void {
    sfx.pop(this.a, this.now, { pitch: 1.6, vol: 0.4 });
  }

  win(): void {
    const t = this.now;
    sfx.stamp(this.a, t + 0.2);
    sfx.ding(this.a, t + 0.5);
    sfx.sparkle(this.a, t + 0.6, { pitch: 1.2 });
    sfx.gavel(this.a, t + 1.4, { vol: 1.1 });
  }
}
