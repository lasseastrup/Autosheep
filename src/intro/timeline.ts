import lines from './lines.json';
import manifest from './voice-manifest.json';
import type { AudioEngine, AudioEvent } from '../audio/engine';
import { SCORE, sectionEvents, phrase, INST, type Section } from '../audio/music';
import * as sfx from '../audio/sfx';

/**
 * The intro's edit decision list. Shots are laid out back-to-back; inside a shot the
 * cursor advances by each voice line's measured duration, so changing a line's audio
 * re-times everything after it automatically. Sets read `marks` to sync animation.
 */

type LineId = keyof typeof lines;
const LINES = lines as Record<string, { who: string; text: string }>;
const VOICE = manifest as Record<string, { duration: number; env: string }>;

export type Transition = { kind: 'cut' | 'fade' | 'iris' | 'white'; dur: number; x?: number; y?: number };

export interface Shot {
  name: string;
  set: string;
  start: number;
  end: number;
  marks: Record<string, number>; // local seconds
  in: Transition;
  out: Transition;
}

export interface VoiceCue {
  id: string;
  who: string;
  text: string;
  t: number;
  dur: number;
  env: string;
}

export interface Timeline {
  duration: number;
  shots: Shot[];
  voices: VoiceCue[];
  events: AudioEvent[];
}

// ------------------------------------------------------------------ word timing
function silenceRuns(id: string): [number, number][] {
  const env = VOICE[id].env;
  const runs: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= env.length; i++) {
    const quiet = i < env.length && env.charCodeAt(i) - 48 < 6;
    if (quiet && s < 0) s = i;
    if (!quiet && s >= 0) {
      if (i - s >= 4) runs.push([s / 60, i / 60]);
      s = -1;
    }
  }
  return runs;
}

/** Estimated offset of a word inside a line: character-proportional, snapped to pauses. */
export function wordTime(id: string, word: string, edge: 'start' | 'end' = 'start'): number {
  const text = LINES[id].text;
  const dur = VOICE[id].duration;
  const idx = text.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0) throw new Error(`"${word}" not in ${id}`);
  const runs = silenceRuns(id);
  if (edge === 'start') {
    const est = (dur * idx) / text.length;
    const near = runs.filter(([, e]) => e > est - 0.5 && e < est + 0.3);
    return near.length ? near[near.length - 1][1] : est;
  }
  const est = (dur * (idx + word.length)) / text.length;
  const near = runs.filter(([s]) => s > est - 0.3 && s < est + 0.5);
  return near.length ? near[0][0] : est;
}

// ------------------------------------------------------------------ builder
type SfxFn = (a: AudioEngine, when: number, o?: Record<string, number>) => void;

class ShotBuilder {
  cursor = 0;
  marks: Record<string, number> = {};
  voices: VoiceCue[] = [];
  local: { t: number; fn: SfxFn; o: Record<string, number>; dur?: number }[] = [];
  music: { name: string; from: number; to: number | 'end'; layers?: Record<number, string>; fadeOut?: number }[] = [];
  extra: ((start: number) => AudioEvent[])[] = [];
  transIn: Transition = { kind: 'cut', dur: 0 };
  transOut: Transition = { kind: 'cut', dur: 0 };

  wait(s: number): this {
    this.cursor += s;
    return this;
  }
  mark(name: string, at = this.cursor): this {
    this.marks[name] = at;
    return this;
  }
  /** Speak a line at the cursor; marks `<id>` (start) and `<id>.end`. */
  say(id: LineId, gap = 0.3, overlap = 0): this {
    const v = VOICE[id];
    const start = this.cursor - overlap;
    this.voices.push({ id, who: LINES[id].who, text: LINES[id].text, t: start, dur: v.duration, env: v.env });
    this.marks[id] = start;
    this.marks[`${id}.end`] = start + v.duration;
    this.cursor = start + v.duration + gap;
    return this;
  }
  /** Mark the moment a word is spoken in a line already placed. */
  word(id: LineId, word: string, name: string, edge: 'start' | 'end' = 'start'): this {
    this.marks[name] = this.marks[id] + wordTime(id, word, edge);
    return this;
  }
  sfx(fn: SfxFn, at: number = this.cursor, o: Record<string, number> = {}): this {
    this.local.push({ t: at, fn, o, dur: o.dur });
    return this;
  }
  score(name: string, from = 0, to: number | 'end' = 'end', layers?: Record<number, string>, fadeOut?: number): this {
    this.music.push({ name, from, to, layers, fadeOut });
    return this;
  }
  phrase(make: (start: number) => AudioEvent[]): this {
    this.extra.push(make);
    return this;
  }
  fadeIn(dur = 0.6): this {
    this.transIn = { kind: 'fade', dur };
    return this;
  }
  fadeOut(dur = 0.6): this {
    this.transOut = { kind: 'fade', dur };
    return this;
  }
  irisOut(x: number, y: number, dur = 1.0): this {
    this.transOut = { kind: 'iris', dur, x, y };
    return this;
  }
  irisIn(x: number, y: number, dur = 0.8): this {
    this.transIn = { kind: 'iris', dur, x, y };
    return this;
  }
  whiteIn(dur = 0.4): this {
    this.transIn = { kind: 'white', dur };
    return this;
  }
}

export function buildTimeline(): Timeline {
  const shots: Shot[] = [];
  const voices: VoiceCue[] = [];
  const events: AudioEvent[] = [];
  let T = 0;

  const shot = (name: string, set: string, fn: (s: ShotBuilder) => void, minDur = 0) => {
    const s = new ShotBuilder();
    fn(s);
    const dur = Math.max(s.cursor, minDur);
    const start = T;
    shots.push({ name, set, start, end: start + dur, marks: s.marks, in: s.transIn, out: s.transOut });
    for (const v of s.voices) {
      voices.push({ ...v, t: v.t + start });
      const id = v.id;
      events.push({
        t: v.t + start,
        dur: v.dur,
        play: (a, when, offset) => playVoice(a, id, when, offset),
      });
      events.push({ t: v.t + start, play: (a, when) => a.duck(when, v.dur) });
    }
    for (const e of s.local) events.push({ t: e.t + start, dur: e.dur, play: (a, when) => e.fn(a, when, e.o) });
    for (const m of s.music) {
      const def = SCORE[m.name];
      const to = m.to === 'end' ? dur : m.to;
      let section: Section = m.fadeOut !== undefined ? { ...def, fadeOut: m.fadeOut } : def;
      if (m.layers) {
        section = { ...section, tracks: def.tracks.map((tr, i) => (m.layers![i] !== undefined ? { ...tr, from: s.marks[m.layers![i]] - m.from } : tr)) };
      }
      events.push(...sectionEvents(section, start + m.from, start + to));
    }
    for (const x of s.extra) events.push(...x(start));
    T += dur;
  };

  // 1 ── space: the almanac, the planet, the apes ─────────────────────────────
  shot('open', 'space', (s) => {
    s.fadeIn(1.2).score('space');
    s.wait(1.0).mark('title').sfx(sfx.sparkle, 1.2, { vol: 0.8 }).wait(3.8);
    s.mark('earth').say('N01', 0.5);
    s.say('N02', 0.45);
    s.word('N02', 'fire', 'fire', 'end').word('N02', 'wheel', 'wheel', 'end').word('N02', 'democracy', 'democracy', 'end').word('N02', 'cats', 'cats', 'end');
    for (const k of ['fire', 'wheel', 'democracy', 'cats']) s.sfx(sfx.ding, s.marks[k], { pitch: k === 'cats' ? 1.5 : 1 });
    s.say('N03', 0.2);
    s.word('N03', 'fine', 'fine', 'end');
    s.sfx(sfx.stamp, s.marks.fine + 0.05);
    s.wait(1.2);
  });

  // 2 ── the armada ─────────────────────────────────────────────────────────
  shot('armada', 'space', (s) => {
    s.score('armada');
    s.sfx(sfx.rumble, 0, { dur: 7, vol: 1.2 });
    s.wait(1.4).say('N04', 0.5);
    s.mark('fleet').sfx(sfx.whoosh, s.cursor - 0.3, { dur: 0.8 });
    s.say('N05', 0.15);
    s.word('N05', 'invincible', 'one', 'start').word('N05', 'paperwork', 'two', 'start').word('N05', 'General', 'three', 'start');
    s.sfx(sfx.ufo, s.marks.fleet + 0.5, { dur: 3.5, vol: 0.6, pitch: 0.8 });
    s.sfx(sfx.recordScratch, s.marks['N05.end'] - 0.05, { vol: 0.8 });
    s.wait(0.25);
  });

  // 3 ── the bridge: General Gafoop ─────────────────────────────────────────
  shot('chair', 'bridge', (s) => {
    s.score('bridge');
    s.sfx(sfx.chatter, 0.2, { dur: 1.2, vol: 0.5 });
    s.wait(0.5).mark('spin').sfx(sfx.whoosh, 0.55, { dur: 0.7, from: 200, to: 1200 }).wait(1.4);
    s.mark('turned').wait(0.4);
    s.say('G01', 0.35);
    s.mark('blorp').wait(0.25).say('B01', 0.35);
  });

  shot('scan', 'scanner', (s) => {
    s.score('scanner');
    s.sfx(sfx.scanSweep, 0.1, { dur: 1.5 }).sfx(sfx.chatter, 0.3, { dur: 1.0, vol: 0.4, pitch: 1.5 });
    s.wait(1.1).say('C01', 0.35);
    s.word('C01', 'fed', 'fed', 'start').word('C01', 'groomed', 'groomed', 'start').word('C01', 'sheltered', 'sheltered', 'start').word('C01', 'chauffeured', 'chauffeured', 'start');
    for (const k of ['fed', 'groomed', 'sheltered', 'chauffeured']) s.sfx(sfx.beep, s.marks[k], { pitch: 1.6, dur: 0.05 });
    s.mark('devotion').say('C02', 0.6);
    s.sfx(sfx.beep, s.marks['C02.end'] + 0.1, { pitch: 2, dur: 0.25 });
  });

  shot('obvious', 'bridge', (s) => {
    s.score('bridge', 0, 'end');
    s.wait(0.2).say('G02', 0.3);
    s.mark('b02').say('B02', 0, 0);
    // Gafoop cuts Blorp off on "the..."
    s.say('G03', 0.6, 0.55);
    s.word('G03', 'power', 'power', 'start');
    s.sfx(sfx.thud, s.marks['G03'] + 0.05, { vol: 0.6 });
  });

  shot('baa', 'country', (s) => {
    s.sfx(sfx.birds, 0, { dur: 3.5 }).sfx(sfx.wind, 0, { dur: 3.6, vol: 0.6 });
    s.wait(0.9).mark('bleat').sfx(sfx.bleat, s.cursor, { pitch: 1.0, len: 0.9 }).wait(2.1);
    s.irisOut(240, 128, 0.9);
  });

  // 4 ── the law ────────────────────────────────────────────────────────────
  shot('law', 'law', (s) => {
    s.irisIn(240, 135, 0.7).score('law');
    s.wait(0.6).sfx(sfx.whoosh, 0.1, { dur: 0.5, from: 600, to: 2400 });
    s.say('N06', 0.35);
    s.word('N06', 'except', 'except', 'start');
    s.sfx(sfx.whoosh, s.marks.except, { dur: 0.6, from: 2000, to: 5000, vol: 0.4 });
    s.mark('form').sfx(sfx.whoosh, s.cursor - 0.2, { dur: 0.4 });
    s.say('N07', 0.3);
    s.mark('stamp').sfx(sfx.stamp, s.cursor, { vol: 1.2 }).wait(1.1);
    s.fadeOut(0.4);
  });

  // 5 ── the invasion ───────────────────────────────────────────────────────
  shot('invasion', 'country', (s) => {
    s.fadeIn(0.3);
    s.sfx(sfx.ufo, 0, { dur: 4, vol: 1, pitch: 1.1 }).sfx(sfx.ufo, 0.6, { dur: 3.5, vol: 0.7, pitch: 0.85, pan: 0.6 });
    s.wait(1.4).say('G04', 0.25);
    const z = s.cursor;
    const targets = ['jogger', 'tourist', 'farmer', 'suit', 'city'];
    targets.forEach((k, i) => {
      const t = z + i * 0.62;
      s.mark(`zap.${k}`, t).sfx(sfx.zap, t, { pitch: 1 + (i % 3) * 0.12, pan: (i % 2 ? 0.4 : -0.4) });
      if (k !== 'city') s.sfx(sfx.poof, t + 0.28, { pitch: 1 + i * 0.1 });
    });
    s.sfx(sfx.whoosh, z + 3.0, { dur: 1.2, from: 3000, to: 200, vol: 0.5 });
    s.score('invasion', 0, z + 3.3);
    s.wait(3.6).mark('calm');
    // nothing but wind: everything that was not a sheep is gone
    s.sfx(sfx.wind, s.cursor - 0.3, { dur: 7, vol: 0.9 });
    s.say('N08', 0.5);
    s.mark('bleat').sfx(sfx.bleat, s.cursor, { pitch: 1.12, len: 0.7 }).wait(1.5);
    s.fadeOut(0.5);
  });

  // 6 ── the audit ──────────────────────────────────────────────────────────
  shot('audit', 'bridge', (s) => {
    s.fadeIn(0.4);
    s.sfx(sfx.holoOn, 0.4).wait(2.2);
    s.mark('holo').say('A01', 0.35).say('A02', 0.5);
    s.mark('present').sfx(sfx.whoosh, s.cursor + 0.2, { dur: 0.5, vol: 0.4 }).wait(1.6);
    s.mark('eat').sfx(sfx.munch, s.cursor, { count: 6 }).wait(1.3);
    s.sfx(sfx.bleat, s.cursor, { pitch: 0.95, len: 0.7 }).wait(1.2);
    s.say('A03', 0.6);
    s.say('G05', 0.7);
    s.say('A04', 0.25);
    s.word('A04', 'illegal', 'illegal', 'start');
    s.sfx(sfx.alarm, s.marks.illegal, { dur: 2.4 });
    s.phrase((st) => [
      ...phrase(INST.brass, 'D3 . C#3 . G2,Bb2,C#3,E3 - - - - - - -', 96, st + s.marks.illegal, 0.5, 1.2),
      ...phrase('drums', 'T . T . TC . . . . . . .', 96, st + s.marks.illegal, 0.5, 1),
    ]);
    s.wait(0.3).say('A05', 0.35);
    s.say('G06', 0.35);
    s.mark('icons').say('A06', 0.35);
    s.word('A06', 'Space', 'rocket', 'start').word('A06', 'Nuclear', 'atom', 'start').word('A06', 'burrito', 'burrito', 'start');
    for (const k of ['rocket', 'atom', 'burrito']) s.sfx(sfx.pop, s.marks[k], { pitch: k === 'burrito' ? 0.7 : 1 });
    s.say('G07', 0.2);
    s.mark('trombone');
    s.phrase((st) => phrase(INST.trombone, 'Bb3 - A3 - Ab3 - G3 - - - - - - .', 92, st + s.marks.trombone, 0.5, 1));
    s.wait(3.2);
    s.mark('sentence').say('A07', 0.15);
    s.mark('gavel').sfx(sfx.gavel, s.cursor, { vol: 1.3 }).wait(1.3);
    s.score('audit', 0, s.marks.trombone);
    s.score('audit', s.marks.sentence - 0.2, s.marks.gavel + 0.6);
    s.fadeOut(0.25);
  });

  // 7 ── exile ──────────────────────────────────────────────────────────────
  shot('exile', 'country', (s) => {
    s.fadeIn(0.3);
    s.sfx(sfx.wind, 0, { dur: 22, vol: 0.6 });
    s.sfx(sfx.rumble, 0, { dur: 3.5, vol: 0.5 });
    s.wait(1.0).mark('eject').sfx(sfx.pop, s.cursor, { pitch: 0.6 }).sfx(sfx.whistleFall, s.cursor + 0.1, { dur: 2.6 });
    s.wait(1.4).mark('leave').sfx(sfx.whoosh, s.cursor, { dur: 0.6, from: 400, to: 6000, vol: 0.5 }).sfx(sfx.sparkle, s.cursor + 0.55, { pitch: 1.3 });
    s.wait(1.3).mark('crash').sfx(sfx.crash, s.cursor, { vol: 1.2 }).wait(1.9);
    s.mark('hatch').sfx(sfx.hatchPop, s.cursor).wait(1.3);
    s.mark('climb').sfx(sfx.cough, s.cursor + 0.6).wait(1.6);
    s.mark('speech').say('G08', 0.7);
    // no crickets left to fill the silence, so a distant sheep does it
    s.sfx(sfx.bleat, s.cursor + 0.2, { pitch: 0.9, len: 0.5, vol: 0.35, pan: 0.6 });
    s.wait(1.6).mark('sneeze').sfx(sfx.sneeze, s.cursor);
    s.mark('choo', s.cursor + 0.95);
    // the pastoral music stops dead at the sneeze
    s.score('pastoral', s.marks.hatch, s.marks.choo, undefined, 0.05);
    s.sfx(sfx.recordScratch, s.marks.choo + 0.02, { vol: 0.6 });
    s.sfx(sfx.stampede, s.marks.choo + 0.1, { dur: 2.6, vol: 1 });
    for (let i = 0; i < 5; i++) s.sfx(sfx.bleat, s.marks.choo + 0.15 + i * 0.33, { pitch: 0.9 + ((i * 37) % 5) * 0.08, len: 0.45, vol: 0.6, pan: i % 2 ? 0.5 : -0.5 });
    s.wait(3.6);
    s.say('N09', 1.4);
    s.fadeOut(0.6);
  }, 0);
  // 8 ── title ──────────────────────────────────────────────────────────────
  shot('title', 'title', (s) => {
    s.whiteIn(0.35);
    s.score('title');
    s.sfx(sfx.thud, 0.05, { vol: 1.1 });
    s.wait(5.2).mark('baa').sfx(sfx.bleat, s.cursor, { pitch: 1.05, len: 1.1, vol: 1.1 }).wait(4.5);
    s.mark('press').wait(3);
  });

  return { duration: T, shots, voices, events };
}

// ------------------------------------------------------------------ voice playback
const buffers = new Map<string, AudioBuffer>();
export async function loadVoices(ctx: BaseAudioContext, urls: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(urls).map(async ([id, url]) => {
      buffers.set(id, await ctx.decodeAudioData(await urlToArrayBuffer(url)));
    }),
  );
}

/** Inlined clips (single-file build) are decoded without fetch, which some sandboxes block. */
async function urlToArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  return (await fetch(url)).arrayBuffer();
}

function playVoice(a: AudioEngine, id: string, when: number, offset: number): void {
  const buf = buffers.get(id);
  if (!buf) return;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(a.voice);
  // the auditor and the computer sit in the room's reverb a little
  const who = LINES[id].who;
  if (who === 'auditor' || who === 'computer') src.connect(a.gain(who === 'auditor' ? 0.35 : 0.12, a.reverbIn));
  src.start(when, offset);
}
