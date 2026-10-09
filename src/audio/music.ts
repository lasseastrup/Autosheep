import type { AudioEngine, AudioEvent } from './engine';

/**
 * A tiny tracker: instruments are WebAudio synth voices, patterns are whitespace-separated
 * steps ('.' rest, '-' hold, 'D4', 'Bb3,D4,F4' chords, single letters for drums).
 *
 * Leitmotifs:
 *  - the Blorxian march (D minor): pompous, a bit too proud of itself — Gafoop
 *  - the sheep theme (G major): a pastoral flute tune
 *  - the main theme: the sheep tune played as a march — sheep, but organised
 */

type Inst = (a: AudioEngine, when: number, f: number, dur: number, vel: number, dest: AudioNode) => void;

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const freq = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const pulseWaves = new WeakMap<BaseAudioContext, PeriodicWave>();
function pulse(a: AudioEngine): PeriodicWave {
  let w = pulseWaves.get(a.ctx);
  if (!w) {
    const n = 32;
    const re = new Float32Array(n), im = new Float32Array(n);
    const duty = 0.25;
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = a.ctx.createPeriodicWave(re, im);
    pulseWaves.set(a.ctx, w);
  }
  return w;
}

function vibrato(a: AudioEngine, o: OscillatorNode, when: number, end: number, rate: number, cents: number, delay = 0.15): void {
  const lfo = a.osc('sine', rate, when, end, a.gain(0));
  const g = a.gain(0);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(cents, when + delay + 0.2);
  lfo.connect(g);
  g.connect(o.detune);
}

// ------------------------------------------------------------------ instruments
const lead: Inst = (a, when, f, dur, vel, dest) => {
  const g = a.gain(0, a.filter('lowpass', 3800, 0.5, dest));
  const end = a.env(g.gain, when, 0.01, Math.max(0.01, dur - 0.04), 0.08, 0.22 * vel);
  const o = a.ctx.createOscillator();
  o.setPeriodicWave(pulse(a));
  o.frequency.value = f;
  o.connect(g);
  o.start(when);
  o.stop(end);
  vibrato(a, o, when, end, 5.5, 12, 0.2);
};

const kazoo: Inst = (a, when, f, dur, vel, dest) => {
  const g = a.gain(0, dest);
  const end = a.env(g.gain, when, 0.02, Math.max(0.02, dur - 0.06), 0.06, 0.5 * vel);
  const mix = a.gain(1);
  const b1 = a.filter('bandpass', 950, 3, a.gain(1.6, g));
  const b2 = a.filter('bandpass', 2100, 5, a.gain(0.8, g));
  mix.connect(b1);
  mix.connect(b2);
  const o = a.osc('sawtooth', f, when, end, mix);
  vibrato(a, o, when, end, 6, 25, 0.05);
};

const brass: Inst = (a, when, f, dur, vel, dest) => {
  const lp = a.filter('lowpass', f * 1.2, 1.2, dest);
  lp.frequency.setValueAtTime(f * 1.2, when);
  lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 7), when + 0.07);
  lp.frequency.exponentialRampToValueAtTime(Math.min(7000, f * 3.5), when + 0.3);
  const g = a.gain(0, lp);
  const end = a.env(g.gain, when, 0.035, Math.max(0.02, dur - 0.06), 0.1, 0.2 * vel);
  for (const d of [-7, 7]) {
    const o = a.osc('sawtooth', f, when, end, g, d);
    vibrato(a, o, when, end, 5, 8, 0.3);
  }
};

const flute: Inst = (a, when, f, dur, vel, dest) => {
  const g = a.gain(0, dest);
  const end = a.env(g.gain, when, 0.06, Math.max(0.02, dur - 0.08), 0.12, 0.3 * vel);
  const o = a.osc('sine', f, when, end, g);
  const t = a.osc('triangle', f, when, end, a.gain(0.18, g));
  vibrato(a, o, when, end, 5, 14, 0.25);
  vibrato(a, t, when, end, 5, 14, 0.25);
  const br = a.gain(0, a.filter('bandpass', f * 2, 2, g));
  a.env(br.gain, when, 0.02, 0.05, 0.1, 0.12);
  a.noiseSrc(when, when + 0.3, br);
};

const pluck: Inst = (a, when, f, dur, vel, dest) => {
  const lp = a.filter('lowpass', 7000, 1, dest);
  lp.frequency.setValueAtTime(Math.min(9000, f * 10), when);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), when + 0.25);
  const g = a.gain(0, lp);
  const rel = Math.min(1.2, 0.25 + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(0.32 * vel, when + 0.004);
  g.gain.setTargetAtTime(0.0001, when + 0.004, rel / 3.5);
  a.osc('sawtooth', f, when, when + rel + 0.3, g);
  a.osc('square', f * 2, when, when + rel + 0.3, a.gain(0.15, g));
};

const harpsi: Inst = (a, when, f, dur, vel, dest) => {
  const hp = a.filter('highpass', 180, 0.7, dest);
  const g = a.gain(0, hp);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(0.18 * vel, when + 0.003);
  g.gain.setTargetAtTime(0.0001, when + 0.003, 0.35);
  a.osc('sawtooth', f, when, when + 1.6, g);
  a.osc('sawtooth', f * 2, when, when + 1.2, a.gain(0.35, g), 4);
  void dur;
};

const bass: Inst = (a, when, f, dur, vel, dest) => {
  const g = a.gain(0, dest);
  const end = a.env(g.gain, when, 0.008, Math.max(0.02, dur - 0.05), 0.07, 0.5 * vel);
  a.osc('triangle', f, when, end, g);
  a.osc('sine', f / 2, when, end, a.gain(0.6, g));
  a.osc('square', f, when, end, a.filter('lowpass', f * 3, 1, a.gain(0.12, g)));
};

const pad: Inst = (a, when, f, dur, vel, dest) => {
  const lp = a.filter('lowpass', 1100, 0.4, dest);
  const g = a.gain(0, lp);
  const end = a.env(g.gain, when, Math.min(0.7, dur * 0.4), Math.max(0.05, dur - 0.5), 0.9, 0.07 * vel);
  for (const d of [-9, 0, 9]) a.osc('sawtooth', f, when, end, g, d);
  const send = a.gain(0.6, a.reverbIn);
  g.connect(send);
};

const celesta: Inst = (a, when, f, dur, vel, dest) => {
  const g = a.gain(0, dest);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(0.14 * vel, when + 0.003);
  g.gain.setTargetAtTime(0.0001, when + 0.003, 0.5);
  a.osc('sine', f, when, when + 2.5, g);
  a.osc('sine', f * 4, when, when + 0.6, a.gain(0.15, g));
  g.connect(a.gain(0.9, a.reverbIn));
  void dur;
};

const trombone: Inst = (a, when, f, dur, vel, dest) => {
  const lp = a.filter('lowpass', 600, 4, dest);
  const g = a.gain(0, lp);
  const end = a.env(g.gain, when, 0.05, Math.max(0.05, dur - 0.1), 0.15, 0.45 * vel);
  const o = a.osc('sawtooth', f, when, end, g);
  // the "wah": a mute opening and closing
  const lfo = a.osc('sine', dur > 1 ? 4 : 2.2, when, end, a.gain(0));
  const lg = a.gain(450);
  lfo.connect(lg);
  lg.connect(lp.frequency);
  if (dur > 1) vibrato(a, o, when, end, 4, 30, 0.2);
};

// drums --------------------------------------------------------------------------
function kick(a: AudioEngine, when: number, vel: number, dest: AudioNode): void {
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.002, 0.04, 0.25, 0.9 * vel);
  const o = a.osc('sine', 150, when, when + 0.4, g);
  o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
}
function snare(a: AudioEngine, when: number, vel: number, dest: AudioNode, len = 0.16): void {
  const g = a.gain(0, a.filter('highpass', 900, 0.7, dest));
  a.env(g.gain, when, 0.002, 0.02, len, 0.45 * vel);
  a.noiseSrc(when, when + len + 0.1, g);
  const t = a.gain(0, dest);
  a.env(t.gain, when, 0.002, 0.01, 0.08, 0.3 * vel);
  a.osc('triangle', 190, when, when + 0.15, t);
}
function hat(a: AudioEngine, when: number, vel: number, dest: AudioNode, open = false): void {
  const g = a.gain(0, a.filter('highpass', 7500, 0.7, dest));
  a.env(g.gain, when, 0.001, 0.005, open ? 0.25 : 0.04, 0.18 * vel);
  a.noiseSrc(when, when + (open ? 0.4 : 0.1), g);
}
function timp(a: AudioEngine, when: number, vel: number, dest: AudioNode, f = 73): void {
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.004, 0.05, 1.3, 0.8 * vel);
  const o = a.osc('sine', f * 1.15, when, when + 1.6, g);
  o.frequency.exponentialRampToValueAtTime(f, when + 0.12);
  a.osc('sine', f * 1.5, when, when + 0.6, a.gain(0.2, g));
  const n = a.gain(0, a.filter('lowpass', 500, 0.8, dest));
  a.env(n.gain, when, 0.002, 0.02, 0.1, 0.5 * vel);
  a.noiseSrc(when, when + 0.2, n);
}
function cymbal(a: AudioEngine, when: number, vel: number, dest: AudioNode): void {
  const g = a.gain(0, a.filter('highpass', 4000, 0.5, dest));
  a.env(g.gain, when, 0.002, 0.05, 2.2, 0.25 * vel);
  a.noiseSrc(when, when + 2.6, g);
  g.connect(a.gain(0.5, a.reverbIn));
}
function log(a: AudioEngine, when: number, vel: number, dest: AudioNode): void {
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.002, 0.01, 0.18, 0.5 * vel);
  a.osc('sine', 210, when, when + 0.3, g).frequency.exponentialRampToValueAtTime(160, when + 0.15);
  a.osc('triangle', 420, when, when + 0.1, a.gain(0.25, g));
}
function anvilHit(a: AudioEngine, when: number, vel: number, dest: AudioNode): void {
  for (const [r, v, d] of [[1, 1, 0.6], [2.76, 0.6, 0.35], [5.2, 0.35, 0.2]] as const) {
    const g = a.gain(0, dest);
    a.env(g.gain, when, 0.001, 0.004, d, 0.12 * v * vel);
    a.osc('sine', 1046 * r, when, when + d + 0.1, g);
  }
}
function shaker(a: AudioEngine, when: number, vel: number, dest: AudioNode): void {
  const g = a.gain(0, a.filter('bandpass', 6000, 1.5, dest));
  a.env(g.gain, when, 0.01, 0.01, 0.05, 0.12 * vel);
  a.noiseSrc(when, when + 0.1, g);
}

function drum(a: AudioEngine, ch: string, when: number, vel: number, dest: AudioNode, stepDur: number): void {
  switch (ch) {
    case 'k': return kick(a, when, vel, dest);
    case 's': return snare(a, when, vel, dest);
    case 'r': for (let i = 0; i < 4; i++) snare(a, when + (i * stepDur) / 4, vel * (0.6 + i * 0.1), dest, 0.06); return;
    case 'h': return hat(a, when, vel, dest);
    case 'o': return hat(a, when, vel, dest, true);
    case 'T': return timp(a, when, vel, dest);
    case 'U': return timp(a, when, vel, dest, 98);
    case 'C': return cymbal(a, when, vel, dest);
    case 'l': return log(a, when, vel, dest);
    case 'a': return anvilHit(a, when, vel, dest);
    case 'x': return shaker(a, when, vel, dest);
  }
}

// ------------------------------------------------------------------ sequencer
export interface Track {
  inst: Inst | 'drums';
  pat: string;
  step?: number; // beats per step (0.5 = eighths)
  vol?: number;
  pan?: number;
  from?: number; // seconds from section start (or a mark name resolved by the caller)
  until?: number;
  transpose?: number;
  once?: boolean; // play the pattern once instead of looping
}

export interface Section {
  bpm: number;
  tracks: Track[];
  fadeOut?: number;
}

interface Step { notes: number[] | string; len: number }

function parse(pat: string, drums: boolean): (Step | null)[] {
  const toks = pat.split(/\s+/).filter((t) => t && t !== '|');
  const steps: (Step | null)[] = [];
  let last: Step | null = null;
  for (const t of toks) {
    if (t === '.') {
      steps.push(null);
      last = null;
    } else if (t === '-') {
      if (last) last.len++;
      steps.push(null);
    } else {
      last = { notes: drums ? t : t.split(',').map(midi), len: 1 };
      steps.push(last);
    }
  }
  return steps;
}

export function sectionEvents(def: Section, start: number, end: number): AudioEvent[] {
  const events: AudioEvent[] = [];
  const beat = 60 / def.bpm;
  const fade = def.fadeOut ?? 0.4;
  for (const tr of def.tracks) {
    const isDrums = tr.inst === 'drums';
    const steps = parse(tr.pat, isDrums);
    const stepDur = (tr.step ?? 0.5) * beat;
    const from = start + (tr.from ?? 0);
    const until = Math.min(end, tr.until !== undefined ? start + tr.until : end);
    const loopLen = steps.length * stepDur;
    if (!steps.length) continue;
    // align loops to the section's bar grid, so late-entering layers stay in phase
    const firstLoop = Math.floor((from - start) / loopLen);
    for (let loop = firstLoop; ; loop++) {
      const loopStart = start + loop * loopLen;
      if (loopStart >= until || (tr.once && loop > firstLoop)) break;
      steps.forEach((st, i) => {
        if (!st) return;
        const t = loopStart + i * stepDur;
        if (t < from - 1e-6 || t >= until) return;
        const fadeGain = Math.max(0, Math.min(1, (end - t) / fade));
        const vel = (tr.vol ?? 1) * fadeGain;
        if (vel <= 0.01) return;
        const dur = st.len * stepDur;
        events.push({
          t,
          play: (a, when) => {
            const dest = a.panner(tr.pan ?? 0, a.music);
            if (isDrums) {
              for (const ch of st.notes as string) drum(a, ch, when, vel, dest, stepDur);
            } else {
              for (const n of st.notes as number[]) (tr.inst as Inst)(a, when, freq(n + (tr.transpose ?? 0)), dur * 0.97, vel, dest);
            }
          },
        });
      });
    }
  }
  return events;
}

/** One-off musical phrase at a time (stings, sad trombone, fanfares). */
export function phrase(inst: Inst | 'drums', pat: string, bpm: number, t: number, step = 0.5, vol = 1): AudioEvent[] {
  return sectionEvents({ bpm, tracks: [{ inst, pat, step, vol, once: true }], fadeOut: 0.01 }, t, t + 60);
}

// ------------------------------------------------------------------ the score
export const INST = { lead, kazoo, brass, flute, pluck, harpsi, bass, pad, celesta, trombone };

const MARCH_8 =
  'D3 - - D3 F3 - A3 - | Bb3 - A3 - G3 - F3 - | E3 - F3 G3 A3 - D3 - | A2 - - - - - . . | ' +
  'D3 - - D3 F3 - A3 - | D4 - C4 - Bb3 - A3 - | G3 - A3 Bb3 C4 - E3 - | D3 - - - - - . .';
const MARCH_BASS =
  'D2 - D2 - D2 - D2 - | Bb1 - Bb1 - Bb1 - Bb1 - | C2 - C2 - C2 - C2 - | A1 - A1 - A1 - A1 - | ' +
  'D2 - D2 - D2 - D2 - | Bb1 - Bb1 - G1 - G1 - | C2 - C2 - A1 - A1 - | D2 - - - - - - -';
const SHEEP_8 =
  'B4 - D5 - B4 A4 G4 - | A4 - B4 - A4 - E4 - | G4 - A4 B4 D5 - E5 D5 | B4 - - - A4 - - - | ' +
  'B4 - D5 - B4 A4 G4 - | A4 - B4 - A4 G4 E4 - | D4 - E4 G4 A4 - B4 A4 | G4 - - - - - - -';
const SHEEP_ARP =
  'G2 D3 G3 B3 D4 B3 G3 D3 | E2 B2 E3 G3 B3 G3 E3 B2 | C3 G3 C4 E4 G4 E4 C4 G3 | D3 A3 D4 F#4 A4 F#4 D4 A3 | ' +
  'G2 D3 G3 B3 D4 B3 G3 D3 | E2 B2 E3 G3 B3 G3 E3 B2 | C3 G3 C4 E4 D3 A3 D4 F#4 | G2 D3 G3 B3 D4 - - -';
const SHEEP_PAD =
  'G3,B3,D4 - - - - - - - | E3,G3,B3 - - - - - - - | C3,E3,G3 - - - - - - - | D3,F#3,A3 - - - - - - - | ' +
  'G3,B3,D4 - - - - - - - | E3,G3,B3 - - - - - - - | C3,E3,G3 - - - D3,F#3,A3 - - - | G3,B3,D4 - - - - - - -';
const THEME_BASS =
  'G2 . G2 . D2 . D2 . | E2 . E2 . B1 . B1 . | C2 . C2 . G1 . G1 . | D2 . D2 . A1 . D2 . | ' +
  'G2 . G2 . D2 . D2 . | E2 . E2 . B1 . B1 . | C2 . C2 . D2 . D2 . | G2 . G2 . G2 . . .';

export const SCORE: Record<string, Section> = {
  space: {
    bpm: 70,
    fadeOut: 1.5,
    tracks: [
      { inst: pad, pat: 'D3,A3,C4,E4,F4 - - - - - - - | Bb2,F3,A3,D4 - - - - - - - | G2,D3,F3,A3,Bb3 - - - - - - - | A2,E3,G3,D4 - - - A2,E3,G3,C#4 - - -', vol: 1.1 },
      { inst: bass, pat: 'D2 - - - - - - - | Bb1 - - - - - - - | G1 - - - - - - - | A1 - - - - - - -', vol: 0.5 },
      { inst: celesta, pat: 'A5 . E5 . F5 . C6 . | D6 . A5 . F5 . . . | D6 . Bb5 . A5 . F5 . | E5 . . . C#6 . . .', vol: 0.7, from: 4 },
    ],
  },
  armada: {
    bpm: 92,
    fadeOut: 0.6,
    tracks: [
      { inst: 'drums', pat: 'T . . . . . . . | T . . . . . T T | T . . . . . . . | T . T . T T T T', vol: 1 },
      { inst: 'drums', pat: 'r - . . r - . . | r - . . r r r r', vol: 0.5, from: 2.6 },
      { inst: bass, pat: MARCH_BASS, vol: 0.8 },
      { inst: brass, pat: MARCH_8, vol: 1, from: 2.6 },
      { inst: pad, pat: 'D3,F3,A3 - - - - - - - | Bb2,D3,F3 - - - - - - - | C3,E3,G3 - - - - - - - | A2,C#3,E3 - - - - - - -', vol: 0.9 },
    ],
  },
  bridge: {
    bpm: 116,
    fadeOut: 0.5,
    tracks: [
      { inst: pluck, pat: 'D2 . A1 . D2 . A1 . | Bb1 . F2 . Bb1 . F2 . | G1 . D2 . G1 . D2 . | A1 . E2 . A1 . C#2 .', vol: 1.1 },
      { inst: pluck, pat: '. D3,F3,A3 . D3,F3,A3 . D3,F3,A3 . D3,F3,A3 | . D3,F3,Bb3 . D3,F3,Bb3 . D3,F3,Bb3 . D3,F3,Bb3 | . D3,G3,Bb3 . D3,G3,Bb3 . D3,G3,Bb3 . D3,G3,Bb3 | . C#3,E3,A3 . C#3,E3,A3 . C#3,E3,A3 . C#3,E3,G3', vol: 0.45 },
      { inst: 'drums', pat: 'k h . h k h . h', vol: 0.6 },
      { inst: kazoo, pat: 'D4 . . D4 F4 . A4 . | Bb4 . A4 . G4 . F4 . | E4 . F4 G4 A4 . D4 . | A3 . . . . . . .', vol: 0.45, from: 4.1 },
    ],
  },
  scanner: {
    bpm: 128,
    fadeOut: 0.3,
    tracks: [
      { inst: lead, step: 0.25, vol: 0.55, pat: 'D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 | Bb3 D4 F4 Bb4 F4 D4 Bb3 D4 F4 Bb4 F4 D4 Bb3 D4 F4 Bb4 | C4 E4 G4 C5 G4 E4 C4 E4 G4 C5 G4 E4 C4 E4 G4 C5 | A3 C#4 E4 A4 E4 C#4 A3 C#4 E4 A4 E4 C#4 A3 C#4 E4 A4' },
      { inst: bass, pat: 'D2 . D2 . D2 . D2 . | Bb1 . Bb1 . Bb1 . Bb1 . | C2 . C2 . C2 . C2 . | A1 . A1 . A1 . A1 .', vol: 0.7 },
      { inst: 'drums', step: 0.25, pat: 'k . h . x . h . k . h . x . h h', vol: 0.5 },
    ],
  },
  law: {
    bpm: 96,
    fadeOut: 0.4,
    tracks: [
      { inst: harpsi, step: 0.25, vol: 0.9, pat: 'D5 A4 F#4 A4 D5 A4 F#4 A4 D5 A4 F#4 A4 D5 A4 F#4 A4 | G5 D5 B4 D5 G5 D5 B4 D5 G5 D5 B4 D5 G5 D5 B4 D5 | A5 E5 C#5 E5 A5 E5 C#5 E5 A5 E5 C#5 E5 A5 E5 C#5 E5 | D5 A4 F#4 A4 D5 A4 F#4 A4 F#5 E5 D5 C#5 D5 - - -' },
      { inst: harpsi, vol: 0.8, pat: 'D3 . A2 . D3 . A2 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . C#3 . | D3 . A2 . D3 - - -' },
    ],
  },
  invasion: {
    bpm: 152,
    fadeOut: 0.5,
    tracks: [
      { inst: 'drums', pat: 'k h s h k k s h | k h s h k k s s', vol: 0.9 },
      { inst: bass, step: 0.25, vol: 0.8, pat: 'D2 D2 D3 D2 F2 D2 G2 D2 A2 D2 F2 D2 E2 D2 C2 D2 | Bb1 Bb1 Bb2 Bb1 D2 Bb1 F2 Bb1 C2 C2 C3 C2 E2 C2 G2 C2' },
      { inst: brass, vol: 1, transpose: 12, pat: 'D3 - - D3 F3 - A3 - | Bb3 - A3 - G3 - F3 - | E3 - F3 G3 A3 - D3 - | A2 - - - D3 D3 D3 D3' },
      { inst: lead, vol: 0.4, transpose: 24, from: 6.3, pat: 'D3 - - D3 F3 - A3 - | Bb3 - A3 - G3 - F3 - | E3 - F3 G3 A3 - D3 - | A2 - - - D3 D3 D3 D3' },
    ],
  },
  audit: {
    bpm: 66,
    fadeOut: 0.8,
    tracks: [
      { inst: pad, pat: 'D2,A2,D3 - - - - - - - | D2,A2,Eb3 - - - - - - -', vol: 1.3 },
      { inst: 'drums', pat: 'T . T . . . . . | T . T . . . . .', vol: 0.55 },
      { inst: celesta, pat: 'A5 . . . Bb5 . . . | . . . . . . . . | A5 . . . G#5 . . . | . . . . . . . .', vol: 0.5, from: 3 },
    ],
  },
  pastoral: {
    bpm: 88,
    fadeOut: 1.2,
    tracks: [
      { inst: pluck, pat: SHEEP_ARP, vol: 0.5 },
      { inst: pad, pat: SHEEP_PAD, vol: 0.7 },
      { inst: flute, pat: SHEEP_8, vol: 1, from: 2.7 },
    ],
  },
  eras: {
    bpm: 120,
    fadeOut: 0.3,
    tracks: [
      { inst: 'drums', pat: 'l . l l . l . . | l . l l . l l l', vol: 0.9 },
      { inst: bass, pat: THEME_BASS, vol: 0.8 },
      // later layers get their `from` filled in from timeline marks
      { inst: pad, pat: SHEEP_PAD, vol: 0.6 },
      { inst: brass, pat: SHEEP_8, vol: 0.9, transpose: -12 },
      { inst: 'drums', pat: '. . a . . . a .', vol: 0.8 },
      { inst: 'drums', step: 0.25, pat: 'k . h . s . h . k k h . s . h h', vol: 0.8 },
      { inst: lead, pat: SHEEP_8, vol: 0.35 },
    ],
  },
  title: {
    bpm: 120,
    fadeOut: 2.5,
    tracks: [
      { inst: brass, once: true, vol: 1.1, pat: 'G2,D3,G3,B3 - - - - - . . | D4 - B3 - G3 - D4 - | G4 - - - - - - - | - - - - - - - -' },
      { inst: 'drums', once: true, pat: 'TC . . . . . r r | r r r r r r r r | Ck . . . . . . . | . . . . . . . .', vol: 0.9 },
      { inst: pad, pat: 'G3,B3,D4 - - - - - - - | C3,E3,G3 - - - - - - - | G3,B3,D4 - - - - - - - | G3,B3,D4 - - - - - - -', vol: 0.8, from: 4 },
      { inst: celesta, pat: 'G5 . D5 . B4 . D5 . | E5 . C5 . G4 . C5 . | D5 . B4 . G4 . B4 . | G5 . . . . . . .', vol: 0.5, from: 4 },
    ],
  },
};
