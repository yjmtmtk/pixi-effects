import { suggestName, warnUnknownOptions } from '../../core/options';
import type { MusicOptions } from '../../types';
import { DRUMS, INSTRUMENTS, type DrumName, type InstrumentName, type VoiceOptions } from './instruments';
import { parseDrumGrid, parseNotes, TempoMap, type MusicEvent, type TempoPoints } from './notation';

export const MAX_TRACKS = 16;
export const MAX_SECONDS = 180;
export const MAX_NOTES = 20000;
export const DEFAULT_TAIL = 2.5;

const OPTION_KEYS = ['bpm', 'meter', 'tracks', 'drums', 'grid', 'swing', 'reverb', 'humanize', 'drumVol', 'transpose', 'tail', 'seed'] as const;
const TRACK_KEYS = ['inst', 'notes', 'vol', 'pan', 'step', 'strum', 'legato', 'tone', 'reverb', 'attack', 'release', 'ring', 'transpose'] as const;
/** Layer fields an author may put inside `music` by mistake. */
const LAYER_KEYS = ['duration', 'length', 'volume', 'at', 'loop'];

/** Words authors reach for, mapped to the instrument that makes that sound. */
const INSTRUMENT_ALIASES: Record<string, InstrumentName> = {
  piano: 'keys', ep: 'keys', rhodes: 'keys', epiano: 'keys', electricpiano: 'keys', keyboard: 'keys', organ: 'pad',
  guitar: 'pluck', harp: 'pluck', koto: 'pluck', strings: 'pad', synth: 'lead', melody: 'lead', flute: 'lead',
  glockenspiel: 'bell', glock: 'bell', chime: 'bell', vibes: 'bell', 'music-box': 'musicbox', music_box: 'musicbox', musicbox: 'musicbox',
  sinebass: 'sub', '808': 'sub', bassline: 'bass',
};
const DRUM_ALIASES: Record<string, DrumName> = {
  bd: 'kick', bassdrum: 'kick', sd: 'snare', hihat: 'hat', hh: 'hat', closedhat: 'hat', oh: 'openhat', cymbal: 'crash', tambourine: 'shaker',
  sleighbells: 'sleigh', jingle: 'sleigh', bells: 'sleigh',
};

export interface ResolvedTrack {
  inst: InstrumentName;
  events: MusicEvent[];
  length: number;
  vol: number | Array<[number, number]>;
  pan: number;
  strum: number;
  legato: number;
  tone: number;
  reverb: number;
  transpose: number;
  voice: VoiceOptions;
}
export interface ResolvedDrums {
  from: number;
  to: number;
  /** Beats one repeat of the pattern lasts. */
  repeat: number;
  drums: Array<{ kind: DrumName; hits: Array<{ i: number; vel: number }> }>;
}
export interface ResolvedMusic {
  tempo: TempoPoints;
  /** Beats in a bar: bar numbers and bar counts only, playback does not use it. */
  meter: number;
  /** The score gave a `meter` (when it did not, 4 is only assumed). */
  meterSet: boolean;
  swing: number;
  reverb: number;
  humanize: number;
  drumVol: number;
  grid: number;
  tail: number;
  seed: number;
  tracks: ResolvedTrack[];
  drums: ResolvedDrums[];
  /** Length of the music in beats (the longest track; drums fill up to it). */
  beats: number;
  /** Length of the music in seconds, without the tail. */
  seconds: number;
}

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Check an author's `music` value, warn about everything that will not do what they meant, and return what to render (null: silent). */
export function resolveMusic(music: unknown, who: string, warn: Warn = defaultWarn): ResolvedMusic | null {
  if (!music || typeof music !== 'object' || Array.isArray(music)) {
    warn(`pixi-effects: ${who}: music must be an object like { bpm: 96, tracks: [{ inst: 'keys', notes: 'Cmaj7:4 Am7:4' }], drums: { kick: 'x...x...' } } (got ${JSON.stringify(music)}). The layer is silent.`);
    return null;
  }
  const o = music as Record<string, unknown>;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (LAYER_KEYS.includes(k)) warn(`pixi-effects: ${who}: "${k}" goes on the audio layer, not inside music${k === 'duration' || k === 'length' ? ' (the music lasts as long as its notes; a shorter layer duration cuts it)' : ''}`);
    else rest[k] = v;
  }
  warnUnknownOptions(`${who} music`, rest, OPTION_KEYS);

  const num = (key: string, lo: number, hi: number, fallback: number): number => {
    const v = o[key];
    if (v === undefined) return fallback;
    if (!finite(v)) { warn(`pixi-effects: ${who}: music.${key} must be a number (got ${JSON.stringify(v)}); using ${fallback}`); return fallback; }
    if (v < lo || v > hi) { warn(`pixi-effects: ${who}: music.${key} ${v} is outside ${lo}–${hi}; using ${clamp(v, lo, hi)}`); return clamp(v, lo, hi); }
    return v;
  };

  // tempo
  let tempo: TempoPoints | null = null;
  if (finite(o.bpm)) tempo = [[0, clamp(o.bpm, 20, 400)]];
  else if (Array.isArray(o.bpm) && o.bpm.length > 0 && o.bpm.every(p => Array.isArray(p) && finite(p[0]) && finite(p[1]) && p[1] > 0)) {
    tempo = (o.bpm as Array<[number, number]>).map(([b, t]) => [Math.max(0, b), clamp(t, 20, 400)] as [number, number]).sort((a, b) => a[0] - b[0]);
  }
  if (!tempo) {
    warn(`pixi-effects: ${who}: music.bpm is required: beats per minute (96), or [beat, bpm] points for a tempo change ([[0, 96], [28, 96], [32, 60]]) (got ${JSON.stringify(o.bpm)}). The layer is silent.`);
    return null;
  }
  if (finite(o.bpm) && (o.bpm < 20 || o.bpm > 400)) warn(`pixi-effects: ${who}: music.bpm ${o.bpm} is outside 20–400; using ${tempo[0]![1]}`);

  const meter = num('meter', 1, 16, 4);
  const swing = num('swing', 0, 0.4, 0);
  const reverbAmount = num('reverb', 0, 0.6, 0.22);
  const humanize = num('humanize', 0, 0.06, 0.012);
  const drumVol = num('drumVol', 0, 1, 0.8);
  const grid = Math.round(num('grid', 1, 12, 4));
  const tail = num('tail', 0, 10, DEFAULT_TAIL);
  const transpose = num('transpose', -36, 36, 0);
  const seed = Math.trunc(num('seed', -1e9, 1e9, 1));

  // tracks
  const rawTracks: unknown[] = o.tracks === undefined ? [] : Array.isArray(o.tracks) ? o.tracks : [];
  if (o.tracks !== undefined && !Array.isArray(o.tracks)) warn(`pixi-effects: ${who}: music.tracks must be a list of { inst, notes } objects (got ${typeof o.tracks})`);
  if (rawTracks.length > MAX_TRACKS) warn(`pixi-effects: ${who}: music has ${rawTracks.length} tracks; only the first ${MAX_TRACKS} play`);
  const tracks: ResolvedTrack[] = [];
  let notes = 0;
  rawTracks.slice(0, MAX_TRACKS).forEach((raw, i) => {
    const where = `${who} music.tracks[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { warn(`pixi-effects: ${where} must be an object like { inst: 'keys', notes: 'c4 e4 g4' }. The track is skipped.`); return; }
    const t = raw as Record<string, unknown>;
    warnUnknownOptions(where, t, TRACK_KEYS);
    const name = String(t.inst);
    let inst = (INSTRUMENTS as readonly string[]).includes(name) ? (name as InstrumentName) : null;
    if (!inst) {
      const guess = INSTRUMENT_ALIASES[name.toLowerCase().replace(/\s+/g, '')] ?? (suggestName(name, INSTRUMENTS) as InstrumentName | null);
      warn(`pixi-effects: ${where}: unknown instrument "${name}"${guess ? ` — did you mean "${guess}"?` : ''} (instruments: ${INSTRUMENTS.join(', ')}). The track is skipped.`);
      return;
    }
    if (typeof t.notes !== 'string') { warn(`pixi-effects: ${where} (${inst}): notes must be a string like 'c4 e4 g4:2 _ Am7:4' (got ${JSON.stringify(t.notes)}). The track is skipped.`); return; }
    const knob = (key: string, lo: number, hi: number, fallback: number): number => {
      const v = t[key];
      if (v === undefined) return fallback;
      if (!finite(v)) { warn(`pixi-effects: ${where}: ${key} must be a number (got ${JSON.stringify(v)}); using ${fallback}`); return fallback; }
      if (v < lo || v > hi) { warn(`pixi-effects: ${where}: ${key} ${v} is outside ${lo}–${hi}; using ${clamp(v, lo, hi)}`); return clamp(v, lo, hi); }
      return v;
    };
    let parsed;
    try { parsed = parseNotes(t.notes, knob('step', 0.0625, 16, 1)); } catch (e) { warn(`pixi-effects: ${where} (${inst}): ${(e as Error).message}. The track is skipped.`); return; }
    notes += parsed.events.length;
    let vol: ResolvedTrack['vol'] = 0.8;
    if (t.vol !== undefined) {
      if (finite(t.vol)) vol = clamp(t.vol, 0, 1.5);
      else if (Array.isArray(t.vol) && t.vol.length > 0 && t.vol.every(p => Array.isArray(p) && finite(p[0]) && finite(p[1]))) {
        vol = (t.vol as Array<[number, number]>).map(([b, v]) => [b, clamp(v, 0, 1.5)] as [number, number]).sort((a, b) => a[0] - b[0]);
      } else warn(`pixi-effects: ${where}: vol must be a number (0.8) or [beat, level] points ([[0, 0], [8, 0.8]]) (got ${JSON.stringify(t.vol)}); using 0.8`);
    }
    const voice: VoiceOptions = {};
    for (const k of ['attack', 'release', 'ring'] as const) if (t[k] !== undefined) voice[k] = knob(k, k === 'ring' ? 0.1 : 0.001, k === 'ring' ? 6 : 8, 0.5);
    tracks.push({
      inst, events: parsed.events, length: parsed.length, vol, pan: knob('pan', -1, 1, 0), strum: knob('strum', 0, 0.2, 0), legato: knob('legato', 0.1, 1, 0.96),
      tone: knob('tone', 0, 1, 1), reverb: knob('reverb', 0, 1, 1), transpose: transpose + knob('transpose', -36, 36, 0), voice,
    });
  });
  if (notes > MAX_NOTES) { warn(`pixi-effects: ${who}: music has ${notes} notes; the limit is ${MAX_NOTES}. The layer is silent.`); return null; }

  // drums
  const sections: ResolvedDrums[] = [];
  const rawDrums: unknown[] = o.drums === undefined ? [] : Array.isArray(o.drums) ? o.drums : [o.drums];
  rawDrums.forEach((raw, i) => {
    const where = `${who} music.drums${Array.isArray(o.drums) ? `[${i}]` : ''}`;
    if (!raw || typeof raw !== 'object') { warn(`pixi-effects: ${where} must be an object like { kick: 'x...x...', snare: '....x...' } (steps: x hit, o soft hit, . nothing). It is skipped.`); return; }
    const d = raw as Record<string, unknown>;
    const drums: ResolvedDrums['drums'] = [];
    let steps = 0;
    for (const [key, pattern] of Object.entries(d)) {
      if (key === 'from' || key === 'to') continue;
      const kind = (DRUMS as readonly string[]).includes(key) ? (key as DrumName) : null;
      if (!kind) {
        const guess = DRUM_ALIASES[key.toLowerCase()] ?? (suggestName(key, DRUMS) as DrumName | null);
        warn(`pixi-effects: ${where}: unknown drum "${key}"${guess ? ` — did you mean "${guess}"?` : ''} (drums: ${DRUMS.join(', ')}, and from / to). It is skipped.`);
        continue;
      }
      if (typeof pattern !== 'string') { warn(`pixi-effects: ${where}.${key} must be a string of steps like 'x...x...' (got ${JSON.stringify(pattern)}). It is skipped.`); continue; }
      try {
        const g = parseDrumGrid(pattern);
        drums.push({ kind, hits: g.hits });
        steps = Math.max(steps, g.steps);
      } catch (e) { warn(`pixi-effects: ${where}.${key}: ${(e as Error).message}. It is skipped.`); }
    }
    if (drums.length === 0 || steps === 0) return;
    const from = finite(d.from) ? Math.max(0, d.from) : 0, to = finite(d.to) ? d.to : Infinity;
    if (d.from !== undefined && !finite(d.from)) warn(`pixi-effects: ${where}.from must be a beat number (got ${JSON.stringify(d.from)}); using 0`);
    sections.push({ from, to, repeat: steps / grid, drums });
  });

  const beats = Math.max(0, ...tracks.map(t => t.length), ...sections.map(s => (Number.isFinite(s.to) ? s.to : 0)));
  const map = new TempoMap(tempo);
  const seconds = map.seconds(beats);
  if (beats === 0) {
    warn(`pixi-effects: ${who}: music has no notes${sections.length ? ' (drums alone do not set the length: add a track, or a rest such as notes: \'_:16\')' : ''}. The layer is silent.`);
    return null;
  }
  if (seconds > MAX_SECONDS) { warn(`pixi-effects: ${who}: the music lasts ${Math.round(seconds)} s; the limit is ${MAX_SECONDS} s. The layer is silent.`); return null; }
  return { tempo, meter, meterSet: o.meter !== undefined, swing, reverb: reverbAmount, humanize, drumVol, grid, tail, seed, tracks, drums: sections, beats, seconds };
}

/** Cache key: equal keys render equal samples (the score is plain data, so its JSON is the key). */
export function musicKey(m: ResolvedMusic, length: number, loop: boolean): string {
  return `music|${JSON.stringify([m.tempo, m.swing, m.reverb, m.humanize, m.drumVol, m.grid, m.tail, m.seed, m.tracks, m.drums, length, loop])}`;
}
