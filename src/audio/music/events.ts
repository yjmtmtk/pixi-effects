import { TempoMap } from './notation';
import type { ResolvedMusic } from './resolve';

/** One note or chord of a track, as a score reader sees it. */
export interface MusicNote {
  /** Where it starts: beats from the start, and the same moment in seconds (the tempo map applied; swing and humanize are not). */
  beat: number;
  time: number;
  /** How long it is held, in beats and in seconds. */
  duration: number;
  seconds: number;
  /** The bar it starts in (1-based, from `meter`) and its beat inside that bar (1 = the downbeat, 1.5 = the "and" of 1). */
  bar: number;
  beatInBar: number;
  /** The audible MIDI notes (`music.transpose` and the track's `transpose` are in). */
  midi: number[];
  /** What the score called it: `Am7`, `c4`, `[c4 e4 g4]`. */
  name: string;
  /** More than one note at once. */
  chord: boolean;
  /** 0–1 (0.8 normal, 1 accented with `!`, 0.55 soft with `,`). */
  velocity: number;
}

export interface MusicTrackEvents {
  inst: string;
  /** The track's length in beats and in bars (not a whole number when a bar is short: that is what to look for). */
  beats: number;
  bars: number;
  notes: MusicNote[];
}

export interface MusicDrumHit { beat: number; time: number; bar: number; beatInBar: number; velocity: number }
export interface MusicDrumEvents { kind: string; hits: MusicDrumHit[] }

export interface MusicEvents {
  /** The tempo at the start. */
  bpm: number;
  meter: number;
  beats: number;
  bars: number;
  /** The music without its reverb tail. */
  seconds: number;
  tracks: MusicTrackEvents[];
  /** Every drum that is hit, over all sections, with every hit written out. */
  drums: MusicDrumEvents[];
}

/** What the `check` tool prints about a music layer: lengths in bars (a short track shows), what starts in each bar, where the drums play. */
export interface MusicSummary {
  bpm: number;
  meter: number;
  /** The score set `meter`; when false 4 is only assumed. */
  meterSet: boolean;
  beats: number;
  bars: number;
  seconds: number;
  tail: number;
  tracks: Array<{ inst: string; beats: number; bars: number; events: number; perBar: string[] }>;
  drums: Array<{ from: number; to: number; kinds: string[] }>;
}

const round = (x: number, digits = 4): number => Math.round(x * 10 ** digits) / 10 ** digits;
const barOf = (beat: number, meter: number): number => Math.floor(beat / meter + 1e-9) + 1;

export function describeEvents(m: ResolvedMusic): MusicEvents {
  const map = new TempoMap(m.tempo);
  const place = (beat: number) => { const bar = barOf(beat, m.meter); return { beat: round(beat), time: round(map.seconds(beat), 6), bar, beatInBar: round(beat - (bar - 1) * m.meter + 1) }; };
  const tracks = m.tracks.map(t => ({
    inst: t.inst,
    beats: t.length,
    bars: round(t.length / m.meter),
    notes: t.events.map((e): MusicNote => ({
      ...place(e.t), duration: round(e.dur), seconds: round(map.seconds(e.t + e.dur) - map.seconds(e.t), 6),
      midi: e.midi.map(n => n + t.transpose), name: e.name, chord: e.midi.length > 1, velocity: e.vel,
    })),
  }));
  const byKind = new Map<string, MusicDrumHit[]>();
  for (const s of m.drums) {
    const end = Math.min(s.to, m.beats);
    for (let rep = 0; s.from + rep * s.repeat < end - 1e-6; rep++) for (const d of s.drums) for (const h of d.hits) {
      const beat = s.from + rep * s.repeat + h.i / m.grid;
      if (beat >= end) continue;
      const list = byKind.get(d.kind) ?? [];
      list.push({ ...place(beat), velocity: h.vel });
      byKind.set(d.kind, list);
    }
  }
  const drums = [...byKind].map(([kind, hits]) => ({ kind, hits: hits.sort((a, b) => a.beat - b.beat) }));
  return { bpm: round(map.bpmAt(0), 2), meter: m.meter, beats: m.beats, bars: round(m.beats / m.meter), seconds: m.seconds, tracks, drums };
}

export function summarizeMusic(m: ResolvedMusic): MusicSummary {
  const map = new TempoMap(m.tempo);
  return {
    bpm: round(map.bpmAt(0), 2), meter: m.meter, meterSet: m.meterSet, beats: m.beats, bars: round(m.beats / m.meter), seconds: m.seconds, tail: m.tail,
    tracks: m.tracks.map(t => {
      const perBar: string[][] = Array.from({ length: Math.max(1, Math.ceil(t.length / m.meter - 1e-9)) }, () => []);
      for (const e of t.events) {
        const bar = barOf(e.t, m.meter), at = round(e.t - (bar - 1) * m.meter + 1);
        perBar[Math.min(perBar.length - 1, bar - 1)]!.push(at === 1 ? e.name : `${e.name}(${at})`);       // the beat in the bar, unless it is the downbeat (a bracket: `@` already means the octave in `C@4`)
      }
      return { inst: t.inst, beats: t.length, bars: round(t.length / m.meter), events: t.events.length, perBar: perBar.map(names => names.join(' ')) };
    }),
    // a section that starts at or after the end (or ends before it starts) never plays: render skips it, so the read-back does not list it
    drums: m.drums.filter(s => s.from < Math.min(s.to, m.beats) - 1e-6).map(s => ({ from: s.from, to: Math.min(s.to, m.beats), kinds: s.drums.filter(d => d.hits.length > 0).map(d => d.kind) })),
  };
}
