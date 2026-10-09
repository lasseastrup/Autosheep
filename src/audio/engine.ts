/**
 * Audio engine shared by real-time playback and offline rendering (OfflineAudioContext for
 * the movie export). Everything is scheduled as timed events against a context clock, so the
 * same cue list produces the same mix in both modes.
 *
 * Graph:  music ─┐                      ┌─> reverb (convolver) ─┐
 *         sfx ───┼─> (sends) ───────────┘                       ├─> comp -> master -> out
 *         voice ─┘ ─────────────────────────────────────────────┘
 */
export type Ctx = BaseAudioContext;

export interface AudioEvent {
  t: number; // timeline seconds
  dur?: number; // if set, an event already running at a seek point is started part-way
  play: (a: AudioEngine, when: number, offset: number) => void;
}

export class AudioEngine {
  readonly ctx: Ctx;
  readonly out: GainNode;
  readonly music: GainNode;
  readonly musicDuck: GainNode;
  readonly sfx: GainNode;
  readonly voice: GainNode;
  readonly reverbIn: GainNode;
  readonly noise: AudioBuffer;
  private comp: DynamicsCompressorNode;
  private events: AudioEvent[] = [];
  private cursor = 0;
  private t0 = 0; // context time of timeline 0
  private timer: number | null = null;
  private live: AudioScheduledSourceNode[] = [];

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.comp.connect(this.out);
    this.out.connect(ctx.destination);

    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.musicDuck = ctx.createGain();
    this.music.connect(this.musicDuck);
    this.musicDuck.connect(this.comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.comp);
    this.voice = ctx.createGain();
    this.voice.gain.value = 1.0;
    this.voice.connect(this.comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    this.reverbIn.connect(reverb);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet);
    wet.connect(this.comp);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    let seed = 987654;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = (seed / 0x7fffffff) * 2 - 1;
        d[i] = n * Math.pow(1 - i / len, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------- building blocks
  gain(v = 1, dest?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  osc(type: OscillatorType, freq: number, when: number, stop: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    o.detune.value = detune;
    o.connect(dest);
    o.start(when);
    o.stop(stop);
    this.track(o);
    return o;
  }

  noiseSrc(when: number, stop: number, dest: AudioNode, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    // random-ish start offset so repeated noises differ
    s.start(when, (when * 7.31) % 1.9);
    s.stop(stop);
    this.track(s);
    return s;
  }

  filter(type: BiquadFilterType, freq: number, q = 1, dest?: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (dest) f.connect(dest);
    return f;
  }

  panner(pan: number, dest: AudioNode): AudioNode {
    if (!this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  /** Attack / hold / exponential-ish release envelope on a gain param. */
  env(p: AudioParam, when: number, attack: number, hold: number, release: number, peak: number): number {
    p.setValueAtTime(0.0001, when);
    p.linearRampToValueAtTime(peak, when + attack);
    p.setValueAtTime(peak, when + attack + hold);
    p.setTargetAtTime(0.0001, when + attack + hold, release / 4);
    return when + attack + hold + release + 0.05;
  }

  private track(n: AudioScheduledSourceNode): void {
    if (this.ctx instanceof AudioContext) {
      this.live.push(n);
      n.onended = () => {
        const i = this.live.indexOf(n);
        if (i >= 0) this.live.splice(i, 1);
      };
    }
  }

  // ---------------------------------------------------------------- scheduling
  setEvents(events: AudioEvent[]): void {
    this.events = [...events].sort((a, b) => a.t - b.t);
  }

  /** Real-time: start the timeline at `offset` seconds. Returns ctx time of timeline 0. */
  startRealtime(offset: number): number {
    const ctx = this.ctx as AudioContext;
    this.t0 = ctx.currentTime + 0.12 - offset;
    this.cursor = 0;
    // events already running at the seek point
    for (const e of this.events) {
      if (e.t >= offset) break;
      if (e.dur !== undefined && e.t + e.dur > offset) e.play(this, ctx.currentTime + 0.12, offset - e.t);
      this.cursor++;
    }
    const pump = () => {
      const horizon = ctx.currentTime - this.t0 + 0.6;
      while (this.cursor < this.events.length && this.events[this.cursor].t < horizon) {
        const e = this.events[this.cursor++];
        e.play(this, Math.max(this.t0 + e.t, ctx.currentTime + 0.005), 0);
      }
    };
    pump();
    this.timer = window.setInterval(pump, 50);
    return this.t0;
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const n of [...this.live]) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live = [];
  }

  /** Timeline time for real-time playback (seconds). */
  now(): number {
    return this.ctx.currentTime - this.t0;
  }

  /** Offline: schedule everything at once (ctx is an OfflineAudioContext). */
  scheduleAll(): void {
    for (const e of this.events) e.play(this, e.t + 0.0001, 0);
  }

  /** Duck the music under dialogue. */
  duck(when: number, dur: number, depth = 0.45): void {
    const p = this.musicDuck.gain;
    p.setTargetAtTime(depth, when - 0.05, 0.06);
    p.setTargetAtTime(1, when + dur + 0.15, 0.25);
  }
}
