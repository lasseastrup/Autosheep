import { SCORE, sectionEvents } from '../audio/music';
import * as sfx from '../audio/sfx';
import { GameAudio } from '../game/gameAudio';

/**
 * The run's sounds: the valley's audio (bleats, the bucket) plus stationery, poofs, saucers
 * and level-ups, each rate-limited so a busy field is lively rather than a wall of noise. The
 * music is the invasion's march.
 */
export class RunAudio extends GameAudio {
  private last: Record<string, number> = {};

  /** True (and remembered) if `key` has not sounded within `gap` seconds. */
  private ok(key: string, gap: number): boolean {
    const t = this.ctx.currentTime;
    if (t - (this.last[key] ?? -99) < gap) return false;
    this.last[key] = t;
    return true;
  }

  private get t(): number {
    return this.ctx.currentTime + 0.01;
  }

  startMusic(): void {
    this.a.music.gain.value = 0.16;
    this.a.setEvents(sectionEvents(SCORE.invasion, 0, 3600));
    this.a.startRealtime(0);
  }

  stamp(pan: number): void {
    if (this.ok('stamp', 0.25)) sfx.stamp(this.a, this.t, { vol: 0.5, pan });
  }

  staple(): void {
    if (this.ok('staple', 0.12)) sfx.typeBlip(this.a, this.t, { vol: 0.35, pitch: 1.6 });
  }

  poof(pan: number, big: boolean): void {
    if (big || this.ok('poof', 0.06)) sfx.poof(this.a, this.t, { vol: big ? 0.9 : 0.35, pitch: big ? 0.7 : 1.1 + Math.random() * 0.5, pan });
  }

  bell(pan: number): void {
    if (this.ok('bell', 0.18)) sfx.ding(this.a, this.t, { vol: 0.18, pitch: 1.4 + Math.random() * 0.3, pan });
  }

  zap(pan: number): void {
    if (this.ok('zap', 0.1)) sfx.zap(this.a, this.t, { vol: 0.22, pitch: 1.3 + Math.random() * 0.4, pan });
  }

  crook(): void {
    if (this.ok('crook', 0.3)) sfx.whoosh(this.a, this.t, { dur: 0.25, from: 900, to: 2600, vol: 0.35 });
  }

  grabbed(pan: number): void {
    if (this.ok('grab', 0.4)) sfx.bleat(this.a, this.t, { pan, vol: 0.8, pitch: 1.25, len: 0.4 });
  }

  freed(pan: number): void {
    if (this.ok('free', 0.2)) sfx.pop(this.a, this.t, { pitch: 1.4, vol: 0.5, pan });
  }

  lost(): void {
    sfx.whoosh(this.a, this.t, { dur: 0.7, from: 300, to: 3200, vol: 0.45 });
    sfx.sparkle(this.a, this.t + 0.5, { pitch: 0.8, vol: 0.4 });
  }

  fleece(pan: number): void {
    if (this.ok('fleece', 0.15)) sfx.pop(this.a, this.t, { pitch: 0.8, vol: 0.6, pan });
  }

  /** A fleece off in a booth: snip, snip. */
  shear(pan: number): void {
    if (!this.ok('shear', 0.15)) return;
    sfx.pop(this.a, this.t, { pitch: 2.3, vol: 0.3, pan });
    sfx.pop(this.a, this.t + 0.08, { pitch: 2.0, vol: 0.3, pan });
  }

  pickup(): void {
    if (this.ok('pickup', 0.05)) sfx.pop(this.a, this.t, { pitch: 2.2 + Math.random() * 0.4, vol: 0.12 });
  }

  levelUp(): void {
    if (!this.ok('level', 0.3)) return;
    sfx.ding(this.a, this.t, { vol: 0.6 });
    sfx.sparkle(this.a, this.t + 0.08, { pitch: 1.3, vol: 0.5 });
  }

  card(): void {
    sfx.stamp(this.a, this.t, { vol: 0.8 });
  }

  hurt(): void {
    sfx.thud(this.a, this.t, { vol: 0.9, pitch: 0.8 });
  }

  knockedOut(): void {
    sfx.crash(this.a, this.t, { vol: 0.6 });
  }

  saucer(pan: number): void {
    if (this.ok('ufo', 1.5)) sfx.ufo(this.a, this.t, { dur: 2.4, vol: 0.45, pan });
  }

  claim(): void {
    sfx.sparkle(this.a, this.t, { pitch: 1.1, vol: 0.6 });
  }

  warn(): void {
    if (this.ok('warn', 3)) sfx.beep(this.a, this.t, { vol: 0.35, pitch: 0.7 });
  }

  hearing(): void {
    sfx.gavel(this.a, this.t + 0.1, { vol: 1.2 });
    this.win();
  }

  dismissed(): void {
    sfx.alarm(this.a, this.t, { dur: 1.2, vol: 0.5 });
  }

  stop(): void {
    this.a.stop();
  }
}
