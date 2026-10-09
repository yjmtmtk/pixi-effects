/**
 * The text notation of `music`: notes, chords, rests and drum grids, and the tempo map. Pure functions, no audio.
 * Ported from the spike the owner approved by ear (a score of 8 lines of text → a lo-fi tune that sounds like one).
 */

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const accidental = (s: string): number => (s === '#' ? 1 : s === 'b' ? -1 : 0);

/** Chord kinds as semitones above the root (a ninth is 14, an eleventh 17, a thirteenth 21). Voiced close, around octave 3. */
export const CHORD_KINDS: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], aug: [0, 4, 8], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], add11: [0, 4, 7, 17],
  7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mMaj7: [0, 3, 7, 11], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10],
  '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15],
  9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
  11: [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], 13: [0, 4, 7, 10, 14, 21], maj13: [0, 4, 7, 11, 14, 21], m13: [0, 3, 7, 10, 14, 21],
  'maj7#11': [0, 4, 7, 11, 18],
};

export const NOTE_FORMS = 'a note in lowercase like c4, f#3, bb2; a chord starting with a capital like Am7, G7, C@4, Am7/e; [c4 e4 g4]; _ for a rest; ~ to hold';

/** Spellings people reach for that are not chord kinds here, and the kind they mean (`Cmin7` → `Cm7`). */
const KIND_SPELLINGS: Record<string, string> = {
  maj: '', M: '', major: '', min: 'm', minor: 'm', mi: 'm', '-': 'm', min7: 'm7', mi7: 'm7', '-7': 'm7', minor7: 'm7', min9: 'm9', min6: 'm6', min11: 'm11',
  M7: 'maj7', Maj7: 'maj7', ma7: 'maj7', major7: 'maj7', M9: 'maj9', Maj9: 'maj9', sus: 'sus4', dom7: '7', dom: '7', '+': 'aug', o: 'dim', o7: 'dim7',
  'ø': 'm7b5', 'm7-5': 'm7b5', add: 'add9', '7sus': '7sus4', 'sus7': '7sus4', '9sus4': '7sus4', '6/9': '6', '69': '6',
};

/** Why a bare token that starts with a capital letter is not a chord, as one sentence with the fix (or null when it is something else). */
function capitalHint(tok: string): string | null {
  if (/^[A-G][#b]?-?\d$/.test(tok)) return `it starts with a capital letter, so it is read as a chord; write the note in lowercase: ${tok.toLowerCase()}`;
  const m = /^([A-G][#b]?)([^@/\s]*)((?:@\d)?(?:\/[a-gA-G][#b]?)?)$/.exec(tok);
  if (!m) return null;
  const fix = KIND_SPELLINGS[m[2]!];
  return fix === undefined ? null : `the chord kind "${m[2]}" is not known; did you mean "${m[1]}${fix}${m[3]}"?`;
}

/** `c4` / `f#3` / `Bb2` → MIDI number (c4 = 60), or null. */
export function noteToMidi(name: string): number | null {
  const m = /^([a-gA-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]!.toLowerCase()]! + accidental(m[2]!);
}

/** `Am7` → MIDI notes (root in octave 3); `C@4` puts the root in octave 4, `Am7/e` puts e in the bass. Null when it is not a chord. */
export function chordToMidi(sym: string): number[] | null {
  const m = /^([A-G])([#b]?)([^@/\s]*)(?:@(\d))?(?:\/([a-gA-G][#b]?))?$/.exec(sym);
  if (!m) return null;
  const kind = CHORD_KINDS[m[3]!];
  if (!kind) return null;
  const root = SEMI[m[1]!.toLowerCase()]! + accidental(m[2]!);
  const oct = m[4] !== undefined ? Number(m[4]) : 3;
  const notes = kind.map(i => 12 * (oct + 1) + root + i);
  if (m[5]) notes.unshift(12 * oct + SEMI[m[5][0]!.toLowerCase()]! + accidental(m[5][1] ?? ''));
  return notes;
}

/** One note or chord of a track: where (beats from the start), how long (beats), which MIDI notes, how hard (0–1). */
export interface MusicEvent { t: number; dur: number; midi: number[]; vel: number }

/**
 * A track's `notes` string → events. Tokens are separated by spaces (`|` is ignored: use it for bars).
 * `c4`, `c4:2`, `c4:0.5`  a note (`:` = length in beats, default `step`) · `Am7:4`, `C@4:2`, `Am7/e:4`  a chord · `[c4 e4 g4]:2`  a chord note by note ·
 * `_`, `_:2`  a rest · `~`, `~:1`  hold (lengthens the note before) · `!` accent, `,` soft, before or after the length: `c4!:1`, `c4:1!`.
 * Throws an Error that names the token.
 */
export function parseNotes(str: string, step = 1): { events: MusicEvent[]; length: number } {
  const events: MusicEvent[] = [];
  let t = 0;
  for (const raw of String(str).replace(/\|/g, ' ').match(/\[[^\]]*\](?::[\d.]+)?[!,]?|\S+/g) ?? []) {
    let tok = raw, vel = 0.8;
    const mark = (c: string) => { vel = c === '!' ? 1 : 0.55; };
    if (/[!,]$/.test(tok)) { mark(tok.slice(-1)); tok = tok.slice(0, -1); }
    let dur = step;
    const dm = /:([\d.]+)$/.exec(tok);
    if (dm) { dur = Number(dm[1]); tok = tok.slice(0, dm.index); }
    if (/[!,]$/.test(tok)) { mark(tok.slice(-1)); tok = tok.slice(0, -1); }
    if (!(dur > 0) || !Number.isFinite(dur)) throw new Error(`"${raw}" has a length of ${dm?.[1]} beats; a length must be a positive number of beats (c4:2)`);
    if (tok === '_') { t += dur; continue; }
    if (tok === '~') { if (events.length) events[events.length - 1]!.dur += dur; t += dur; continue; }
    let midi: Array<number | null> | null;
    if (tok.startsWith('[')) midi = tok.slice(1, -1).trim().split(/\s+/).map(noteToMidi);
    else if (/^[A-G]/.test(tok)) midi = chordToMidi(tok);                 // a capital letter starts a chord (G7, C5, C6), a lowercase one a note (g7, c5, c6): never both
    else midi = [noteToMidi(tok)];
    if (!midi || midi.length === 0 || midi.some(x => x === null)) {
      const hint = /^[A-G]/.test(tok) && !tok.startsWith('[') ? capitalHint(tok) : null;
      throw new Error(`cannot read "${raw}"${hint ? `: ${hint}` : ''} (${NOTE_FORMS})`);
    }
    events.push({ t, dur, midi: midi as number[], vel });
    t += dur;
  }
  return { events, length: t };
}

/** A drum pattern: `x` a hit, `o` a soft hit, `.` nothing (spaces and `|` are ignored). Step = 1/`grid` of a beat. */
export function parseDrumGrid(grid: string): { hits: Array<{ i: number; vel: number }>; steps: number } {
  const hits: Array<{ i: number; vel: number }> = [];
  let i = 0;
  for (const ch of String(grid).replace(/[\s|]/g, '')) {
    if (ch === 'x' || ch === 'X') hits.push({ i, vel: 1 });
    else if (ch === 'o' || ch === 'O') hits.push({ i, vel: 0.5 });
    else if (ch !== '.' && ch !== '-' && ch !== '_') throw new Error(`"${ch}" in the drum pattern "${grid}": use x (hit), o (soft hit), . (nothing)`);
    i++;
  }
  return { hits, steps: i };
}

/** Tempo as `[beat, bpm]` points; between two points the tempo changes linearly (a ritardando), before / after it holds. */
export type TempoPoints = Array<[number, number]>;

/** Beats → seconds for a tempo map (exact integral of 60 / bpm). */
export class TempoMap {
  private readonly points: TempoPoints;
  private readonly secAt: number[] = [0];

  constructor(bpm: number | TempoPoints) {
    this.points = typeof bpm === 'number' ? [[0, bpm]] : [...bpm].sort((a, b) => a[0] - b[0]);
    if (this.points[0]![0] > 0) this.points.unshift([0, this.points[0]![1]]);
    for (let i = 1; i < this.points.length; i++) {
      const [b0, t0] = this.points[i - 1]!, [b1, t1] = this.points[i]!;
      this.secAt.push(this.secAt[i - 1]! + TempoMap.span(b1 - b0, t0, t1));
    }
  }

  /** Seconds taken by `db` beats while the tempo goes from `t0` to `t1` bpm. */
  private static span(db: number, t0: number, t1: number): number {
    return Math.abs(t1 - t0) < 1e-9 ? (60 * db) / t0 : (60 * db * Math.log(t1 / t0)) / (t1 - t0);
  }

  seconds(beat: number): number {
    if (beat <= 0) return (60 * beat) / this.points[0]![1];
    let i = this.points.length - 1;
    while (i > 0 && this.points[i]![0] > beat) i--;
    const [b0, t0] = this.points[i]!;
    const next = this.points[i + 1];
    if (!next) return this.secAt[i]! + (60 * (beat - b0)) / t0;
    const t = t0 + ((next[1] - t0) * (beat - b0)) / (next[0] - b0);
    return this.secAt[i]! + TempoMap.span(beat - b0, t0, t);
  }

  /** The tempo at a beat. */
  bpmAt(beat: number): number {
    if (beat <= this.points[0]![0]) return this.points[0]![1];
    for (let i = 1; i < this.points.length; i++) {
      const [b0, t0] = this.points[i - 1]!, [b1, t1] = this.points[i]!;
      if (beat < b1) return t0 + ((t1 - t0) * (beat - b0)) / (b1 - b0);
    }
    return this.points[this.points.length - 1]![1];
  }
}
