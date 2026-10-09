import type { AudioEngine } from './engine';

/**
 * Procedural sound effects. Each takes the engine, a context start time and options, and
 * builds its own little node graph. No samples: everything is oscillators, noise and filters.
 */

type Opts = { vol?: number; pan?: number; pitch?: number; dur?: number; reverb?: number };

function out(a: AudioEngine, o: Opts, defVol = 1): AudioNode {
  const g = a.gain((o.vol ?? 1) * defVol);
  const p = a.panner(o.pan ?? 0, a.sfx);
  g.connect(p);
  if (o.reverb) {
    const s = a.gain(o.reverb, a.reverbIn);
    g.connect(s);
  }
  return g;
}

/** A sheep "baaa-a-a": sawtooth glottal source with wobble, through vowel formants. */
export function bleat(a: AudioEngine, when: number, o: Opts & { len?: number } = {}): void {
  const len = o.len ?? 0.85;
  const f0 = 270 * (o.pitch ?? 1);
  const dest = out(a, o, 0.55);
  const end = when + len + 0.3;

  const amp = a.gain(0);
  // vowel formants for a nasal "eh/aa"
  const formants: [number, number, number][] = [[720, 7, 1.0], [1350, 9, 0.55], [2550, 12, 0.3], [3400, 14, 0.12]];
  const lp = a.filter('lowpass', 300, 0.7, dest);
  lp.frequency.setValueAtTime(300, when);
  lp.frequency.exponentialRampToValueAtTime(5200, when + 0.06); // the "b"
  for (const [f, q, gv] of formants) {
    const bp = a.filter('bandpass', f, q);
    const g = a.gain(gv * 3.2, lp);
    amp.connect(bp);
    bp.connect(g);
  }

  const src = a.osc('sawtooth', f0, when, end, amp);
  const src2 = a.osc('square', f0 * 1.003, when, end, a.gain(0.25, amp));
  for (const s of [src, src2]) {
    s.frequency.setValueAtTime(f0 * 0.82, when);
    s.frequency.exponentialRampToValueAtTime(f0 * 1.04, when + 0.08);
    s.frequency.exponentialRampToValueAtTime(f0, when + 0.25);
    s.frequency.exponentialRampToValueAtTime(f0 * 0.86, when + len);
  }
  // the characteristic quaver: pitch + amplitude wobble, deepening through the call
  const lfo = a.osc('sine', 9.5, when, end, a.gain(0));
  const lfoPitch = a.gain(0);
  lfo.connect(lfoPitch);
  lfoPitch.connect(src.frequency);
  lfoPitch.gain.setValueAtTime(f0 * 0.01, when);
  lfoPitch.gain.linearRampToValueAtTime(f0 * 0.06, when + len);
  const lfoAmp = a.gain(0);
  lfo.connect(lfoAmp);
  lfoAmp.connect(amp.gain);
  lfoAmp.gain.setValueAtTime(0.02, when);
  lfoAmp.gain.linearRampToValueAtTime(0.32, when + len * 0.9);

  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(0.55, when + 0.04);
  amp.gain.setValueAtTime(0.55, when + len * 0.7);
  amp.gain.linearRampToValueAtTime(0, when + len);
  // breath
  const n = a.noiseSrc(when, end, a.filter('bandpass', 2400, 1.2, a.gain(0.0, dest)));
  void n;
}

export function zap(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.35);
  const p = o.pitch ?? 1;
  const g = a.gain(0, dest);
  const end = a.env(g.gain, when, 0.005, 0.12, 0.18, 1);
  const s1 = a.osc('square', 2600 * p, when, end, g);
  s1.frequency.exponentialRampToValueAtTime(140 * p, when + 0.3);
  const s2 = a.osc('sawtooth', 1900 * p, when, end, a.gain(0.6, g));
  s2.frequency.exponentialRampToValueAtTime(90 * p, when + 0.32);
  const ng = a.gain(0, a.filter('highpass', 3000, 0.7, dest));
  a.env(ng.gain, when, 0.002, 0.03, 0.05, 0.6);
  a.noiseSrc(when, when + 0.2, ng);
}

export function poof(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.6);
  const lp = a.filter('lowpass', 5000, 0.8, dest);
  lp.frequency.setValueAtTime(5000, when);
  lp.frequency.exponentialRampToValueAtTime(180, when + 0.55);
  const g = a.gain(0, lp);
  const end = a.env(g.gain, when, 0.004, 0.05, 0.5, 1);
  a.noiseSrc(when, end, g);
  const pg = a.gain(0, dest);
  a.env(pg.gain, when, 0.002, 0.02, 0.1, 0.8);
  const pop = a.osc('sine', 700 * (o.pitch ?? 1), when, when + 0.2, pg);
  pop.frequency.exponentialRampToValueAtTime(70, when + 0.15);
}

/** Classic theremin flying-saucer warble. */
export function ufo(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 3;
  const dest = out(a, o, 0.18);
  const g = a.gain(0, dest);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1, when + Math.min(0.8, dur * 0.3));
  g.gain.setValueAtTime(1, when + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, when + dur);
  const base = 380 * (o.pitch ?? 1);
  const s = a.osc('sine', base, when, when + dur + 0.1, g);
  s.frequency.setValueAtTime(base * 0.7, when);
  s.frequency.linearRampToValueAtTime(base * 1.25, when + dur * 0.5);
  s.frequency.linearRampToValueAtTime(base * 0.8, when + dur);
  const vib = a.osc('sine', 7, when, when + dur + 0.1, a.gain(0));
  const vg = a.gain(base * 0.09);
  vib.connect(vg);
  vg.connect(s.frequency);
  const t = a.osc('triangle', base * 2, when, when + dur + 0.1, a.gain(0.15, g));
  vg.connect(t.frequency);
  a.osc('sine', 58, when, when + dur + 0.1, a.gain(0.9, g));
}

export function rumble(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 4;
  const dest = out(a, o, 0.9);
  const g = a.gain(0, dest);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(1, when + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  a.noiseSrc(when, when + dur, a.filter('lowpass', 140, 0.9, g), 0.5);
  a.osc('sine', 36, when, when + dur, a.gain(0.7, g));
  a.osc('sawtooth', 55, when, when + dur, a.filter('lowpass', 160, 1, a.gain(0.25, g)));
}

export function whoosh(a: AudioEngine, when: number, o: Opts & { from?: number; to?: number } = {}): void {
  const dur = o.dur ?? 0.6;
  const dest = out(a, o, 0.5);
  const bp = a.filter('bandpass', o.from ?? 300, 1.6, dest);
  bp.frequency.setValueAtTime(o.from ?? 300, when);
  bp.frequency.exponentialRampToValueAtTime(o.to ?? 3000, when + dur);
  const g = a.gain(0, bp);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1, when + dur * 0.6);
  g.gain.linearRampToValueAtTime(0, when + dur);
  a.noiseSrc(when, when + dur, g);
}

export function crash(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.9);
  const lp = a.filter('lowpass', 3000, 0.7, dest);
  lp.frequency.setValueAtTime(3000, when);
  lp.frequency.exponentialRampToValueAtTime(90, when + 1.6);
  const g = a.gain(0, lp);
  const end = a.env(g.gain, when, 0.003, 0.15, 1.4, 1);
  a.noiseSrc(when, end, g, 0.7);
  const tg = a.gain(0, dest);
  a.env(tg.gain, when, 0.002, 0.05, 0.6, 1);
  const th = a.osc('sine', 110, when, when + 0.8, tg);
  th.frequency.exponentialRampToValueAtTime(32, when + 0.5);
  // debris
  for (let i = 0; i < 9; i++) {
    const t = when + 0.15 + i * 0.09 + (i % 3) * 0.03;
    const dg = a.gain(0, a.filter('bandpass', 1200 + i * 330, 4, dest));
    a.env(dg.gain, t, 0.001, 0.01, 0.05, 0.5);
    a.noiseSrc(t, t + 0.1, dg);
  }
}

export function beep(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.12);
  const g = a.gain(0, dest);
  const len = o.dur ?? 0.06;
  const end = a.env(g.gain, when, 0.002, len, 0.02, 1);
  a.osc('square', 1000 * (o.pitch ?? 1), when, end, g);
}

/** A run of computer beeps, deterministic from `when`. */
export function chatter(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 1;
  const notes = [1, 1.5, 1.25, 2, 0.75, 1.33, 1.78, 1.12];
  let k = Math.floor(when * 13) % notes.length;
  for (let t = 0; t < dur; t += 0.075) {
    if ((k * 7 + Math.floor(t * 40)) % 5 !== 0) beep(a, when + t, { ...o, pitch: notes[k % notes.length] * (o.pitch ?? 1), dur: 0.04 });
    k++;
  }
}

export function scanSweep(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 1.5;
  const dest = out(a, o, 0.12);
  for (let t = 0; t < dur; t += 0.5) {
    const g = a.gain(0, dest);
    a.env(g.gain, when + t, 0.02, 0.35, 0.1, 1);
    const s = a.osc('sine', 500, when + t, when + t + 0.5, g);
    s.frequency.exponentialRampToValueAtTime(2200, when + t + 0.45);
    a.osc('square', 250, when + t, when + t + 0.5, a.gain(0.08, g)).frequency.exponentialRampToValueAtTime(1100, when + t + 0.45);
  }
}

export function typeBlip(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.05);
  const g = a.gain(0, dest);
  const end = a.env(g.gain, when, 0.001, 0.012, 0.02, 1);
  a.osc('square', 520 * (o.pitch ?? 1), when, end, g);
}

export function stamp(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.25, ...o }, 0.9);
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.002, 0.03, 0.18, 1);
  const s = a.osc('sine', 150, when, when + 0.3, g);
  s.frequency.exponentialRampToValueAtTime(45, when + 0.18);
  const ng = a.gain(0, a.filter('lowpass', 1800, 0.7, dest));
  a.env(ng.gain, when, 0.001, 0.02, 0.08, 0.8);
  a.noiseSrc(when, when + 0.2, ng);
}

export function gavel(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.8, ...o }, 1);
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.001, 0.02, 0.22, 1);
  const s = a.osc('sine', 300, when, when + 0.4, g);
  s.frequency.exponentialRampToValueAtTime(160, when + 0.1);
  a.osc('triangle', 820, when, when + 0.1, a.gain(0.4, g));
  const ng = a.gain(0, a.filter('bandpass', 1900, 1.5, dest));
  a.env(ng.gain, when, 0.001, 0.015, 0.06, 1);
  a.noiseSrc(when, when + 0.15, ng);
  const lg = a.gain(0, dest);
  a.env(lg.gain, when, 0.002, 0.05, 0.6, 0.9);
  a.osc('sine', 52, when, when + 0.9, lg).frequency.exponentialRampToValueAtTime(30, when + 0.6);
}

export function munch(a: AudioEngine, when: number, o: Opts & { count?: number } = {}): void {
  const dest = out(a, o, 0.5);
  const n = o.count ?? 5;
  for (let i = 0; i < n; i++) {
    const t = when + i * 0.17 + (i % 2) * 0.03;
    const g = a.gain(0, a.filter('bandpass', 2200 + (i % 3) * 600, 1.4, dest));
    a.env(g.gain, t, 0.002, 0.04, 0.05, 1);
    a.noiseSrc(t, t + 0.12, g, 1.3);
    const lg = a.gain(0, a.filter('lowpass', 400, 1, dest));
    a.env(lg.gain, t, 0.002, 0.03, 0.05, 0.7);
    a.noiseSrc(t, t + 0.1, lg, 0.6);
  }
}

/** "ah... ah... CHOO" — a sheep-sized sneeze. */
export function sneeze(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.6);
  for (let i = 0; i < 2; i++) {
    const t = when + i * 0.42;
    const bp = a.filter('bandpass', 700, 3, dest);
    bp.frequency.setValueAtTime(600 + i * 150, t);
    bp.frequency.linearRampToValueAtTime(1400 + i * 250, t + 0.3);
    const g = a.gain(0, bp);
    a.env(g.gain, t, 0.12, 0.12, 0.08, 0.6 + i * 0.2);
    a.noiseSrc(t, t + 0.4, g);
    const v = a.gain(0, a.filter('bandpass', 900, 4, dest));
    a.env(v.gain, t, 0.1, 0.12, 0.08, 0.3);
    a.osc('sawtooth', 330 + i * 60, t, t + 0.4, v).frequency.linearRampToValueAtTime(420 + i * 80, t + 0.3);
  }
  const t = when + 0.95;
  const g = a.gain(0, a.filter('bandpass', 2600, 0.8, dest));
  a.env(g.gain, t, 0.004, 0.06, 0.22, 1.6);
  a.noiseSrc(t, t + 0.4, g);
  const v = a.gain(0, a.filter('bandpass', 1100, 3, dest));
  a.env(v.gain, t, 0.004, 0.05, 0.15, 0.8);
  a.osc('sawtooth', 520, t, t + 0.3, v).frequency.exponentialRampToValueAtTime(260, t + 0.2);
}

/** Many hoof clicks + rumble for a stampede. */
export function stampede(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 2;
  const dest = out(a, o, 0.4);
  let seed = 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < dur; t += 0.022 + rnd() * 0.03) {
    const fade = 1 - t / dur;
    const g = a.gain(0, a.filter('bandpass', 900 + rnd() * 1400, 3, dest));
    a.env(g.gain, when + t, 0.001, 0.008, 0.03, 0.8 * fade);
    a.noiseSrc(when + t, when + t + 0.06, g);
  }
  rumble(a, when, { dur: dur * 0.8, vol: 0.25 * (o.vol ?? 1) });
}

export function ding(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.4, ...o }, 0.22);
  const f = 1320 * (o.pitch ?? 1);
  for (const [r, v, d] of [[1, 1, 1.2], [2.76, 0.4, 0.5], [5.4, 0.2, 0.25]] as const) {
    const g = a.gain(0, dest);
    a.env(g.gain, when, 0.002, 0.01, d, v);
    a.osc('sine', f * r, when, when + d + 0.2, g);
  }
}

/** Falling-bomb whistle. */
export function whistleFall(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 2;
  const dest = out(a, o, 0.16);
  const g = a.gain(0, dest);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1, when + 0.3);
  g.gain.setValueAtTime(1, when + dur - 0.05);
  g.gain.linearRampToValueAtTime(0, when + dur);
  const s = a.osc('sine', 2100, when, when + dur, g);
  s.frequency.setValueAtTime(2100, when);
  s.frequency.exponentialRampToValueAtTime(380, when + dur);
  const vib = a.osc('sine', 6, when, when + dur, a.gain(0));
  const vg = a.gain(18);
  vib.connect(vg);
  vg.connect(s.frequency);
}

export function holoOn(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.5, ...o }, 0.25);
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.3, 0.6, 0.6, 1);
  const s = a.osc('sawtooth', 90, when, when + 1.8, a.filter('bandpass', 800, 4, g));
  s.frequency.exponentialRampToValueAtTime(720, when + 1.0);
  const trem = a.osc('square', 22, when, when + 1.8, a.gain(0));
  const tg = a.gain(0.4);
  trem.connect(tg);
  tg.connect(g.gain);
  a.osc('sine', 1760, when + 0.6, when + 1.8, a.gain(0.15, g));
}

export function alarm(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 1.6;
  const dest = out(a, o, 0.1);
  for (let t = 0; t < dur; t += 0.8) {
    const g = a.gain(0, a.filter('lowpass', 2500, 1, dest));
    a.env(g.gain, when + t, 0.02, 0.35, 0.05, 1);
    const s = a.osc('square', 620, when + t, when + t + 0.45, g);
    s.frequency.linearRampToValueAtTime(880, when + t + 0.4);
  }
}

export function recordScratch(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.5);
  const bp = a.filter('bandpass', 800, 2, dest);
  bp.frequency.setValueAtTime(400, when);
  bp.frequency.exponentialRampToValueAtTime(3500, when + 0.12);
  bp.frequency.exponentialRampToValueAtTime(300, when + 0.3);
  const g = a.gain(0, bp);
  a.env(g.gain, when, 0.005, 0.2, 0.1, 1);
  a.noiseSrc(when, when + 0.4, g);
}

export function cricket(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 2;
  const dest = out(a, o, 0.05);
  for (let t = 0; t < dur; t += 0.55) {
    for (let k = 0; k < 3; k++) {
      const tt = when + t + k * 0.045;
      const g = a.gain(0, dest);
      a.env(g.gain, tt, 0.003, 0.02, 0.01, 1);
      a.osc('sine', 4600, tt, tt + 0.05, g);
    }
  }
}

export function birds(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 4;
  const dest = out(a, { reverb: 0.3, ...o }, 0.05);
  let seed = Math.floor(when * 1000) + 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0.2; t < dur; t += 0.25 + rnd() * 0.9) {
    const n = 2 + Math.floor(rnd() * 3);
    const base = 2600 + rnd() * 2200;
    for (let k = 0; k < n; k++) {
      const tt = when + t + k * 0.09;
      const g = a.gain(0, a.panner(rnd() * 1.6 - 0.8, dest));
      a.env(g.gain, tt, 0.005, 0.03, 0.03, 1);
      const s = a.osc('sine', base, tt, tt + 0.08, g);
      s.frequency.exponentialRampToValueAtTime(base * (rnd() > 0.5 ? 1.35 : 0.75), tt + 0.06);
    }
  }
}

export function wind(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 6;
  const dest = out(a, o, 0.12);
  const lp = a.filter('lowpass', 500, 0.6, dest);
  const g = a.gain(0, lp);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1, when + 1.5);
  g.gain.setValueAtTime(1, when + dur - 1.5);
  g.gain.linearRampToValueAtTime(0, when + dur);
  a.noiseSrc(when, when + dur, g, 0.4);
  const lfo = a.osc('sine', 0.23, when, when + dur, a.gain(0));
  const lg = a.gain(260);
  lfo.connect(lg);
  lg.connect(lp.frequency);
}

export function hatchPop(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.5);
  const g = a.gain(0, a.filter('highpass', 1500, 0.7, dest));
  a.env(g.gain, when, 0.01, 0.15, 0.4, 0.8);
  a.noiseSrc(when, when + 0.7, g);
  const c = a.gain(0, dest);
  a.env(c.gain, when + 0.25, 0.002, 0.03, 0.15, 1);
  a.osc('square', 180, when + 0.25, when + 0.5, a.filter('lowpass', 700, 1, c)).frequency.exponentialRampToValueAtTime(90, when + 0.4);
}

export function cough(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.4);
  for (let i = 0; i < 3; i++) {
    const t = when + i * 0.28;
    const g = a.gain(0, a.filter('bandpass', 600 + i * 80, 2, dest));
    a.env(g.gain, t, 0.005, 0.06, 0.08, 1);
    a.noiseSrc(t, t + 0.2, g);
  }
}

export function sparkle(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.6, ...o }, 0.12);
  const notes = [2093, 2637, 3136, 4186];
  notes.forEach((f, i) => {
    const g = a.gain(0, dest);
    a.env(g.gain, when + i * 0.06, 0.002, 0.01, 0.4, 1);
    a.osc('sine', f * (o.pitch ?? 1), when + i * 0.06, when + i * 0.06 + 0.5, g);
  });
}

export function thud(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.8);
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.002, 0.02, 0.25, 1);
  a.osc('sine', 90 * (o.pitch ?? 1), when, when + 0.4, g).frequency.exponentialRampToValueAtTime(40, when + 0.25);
  const ng = a.gain(0, a.filter('lowpass', 900, 0.7, dest));
  a.env(ng.gain, when, 0.002, 0.02, 0.1, 0.6);
  a.noiseSrc(when, when + 0.2, ng);
}

export function pop(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, o, 0.25);
  const g = a.gain(0, dest);
  a.env(g.gain, when, 0.001, 0.01, 0.06, 1);
  const s = a.osc('sine', 500 * (o.pitch ?? 1), when, when + 0.12, g);
  s.frequency.exponentialRampToValueAtTime(1400 * (o.pitch ?? 1), when + 0.05);
}

export function steam(a: AudioEngine, when: number, o: Opts = {}): void {
  const dur = o.dur ?? 1.2;
  const dest = out(a, o, 0.25);
  const g = a.gain(0, a.filter('bandpass', 1900, 2.5, dest));
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1, when + 0.05);
  g.gain.setTargetAtTime(0, when + dur * 0.6, dur * 0.2);
  a.noiseSrc(when, when + dur, g);
  // whistle
  const w = a.gain(0, dest);
  w.gain.setValueAtTime(0, when);
  w.gain.linearRampToValueAtTime(0.35, when + 0.1);
  w.gain.setTargetAtTime(0, when + dur * 0.6, dur * 0.2);
  a.osc('sine', 1046, when, when + dur, w);
  a.osc('sine', 1318, when, when + dur, a.gain(0.6, w));
}

export function anvil(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.3, ...o }, 0.22);
  for (const [r, v, d] of [[1, 1, 0.9], [2.76, 0.7, 0.5], [5.2, 0.4, 0.3], [8.9, 0.2, 0.15]] as const) {
    const g = a.gain(0, dest);
    a.env(g.gain, when, 0.001, 0.005, d, v);
    a.osc('sine', 880 * r * (o.pitch ?? 1), when, when + d + 0.1, g);
  }
}

export function gong(a: AudioEngine, when: number, o: Opts = {}): void {
  const dest = out(a, { reverb: 0.6, ...o }, 0.3);
  const f = 110 * (o.pitch ?? 1);
  for (const [r, v, d] of [[1, 1, 3.5], [1.48, 0.6, 2.8], [2.15, 0.5, 2.2], [2.9, 0.35, 1.6], [3.62, 0.25, 1.2], [4.9, 0.15, 0.8]] as const) {
    const g = a.gain(0, dest);
    a.env(g.gain, when, 0.01, 0.02, d, v);
    a.osc('sine', f * r, when, when + d + 0.2, g, (r * 7) % 9);
  }
  const ng = a.gain(0, a.filter('bandpass', 400, 1, dest));
  a.env(ng.gain, when, 0.002, 0.02, 0.2, 0.6);
  a.noiseSrc(when, when + 0.3, ng);
}

export function clapperboard(a: AudioEngine, when: number, o: Opts = {}): void {
  stamp(a, when, { ...o, vol: (o.vol ?? 1) * 0.6 });
}
