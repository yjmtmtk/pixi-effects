import { describe, it, expect, vi } from 'vitest';
import { noteToMidi, chordToMidi, parseNotes, parseDrumGrid, TempoMap } from '../../src/audio/music/notation';
import { resolveMusic, musicKey } from '../../src/audio/music/resolve';
import { renderMusic, musicLength, musicBeatTimes, MUSIC_PEAK } from '../../src/audio/music/render';

const warnings = () => { const w: string[] = []; return { w, warn: (m: string) => { w.push(m); } }; };
const SR = 8000;                                                       // a low rate keeps these renders quick
const rms = (d: Float32Array, t0: number, t1: number) => { let s = 0; const a = Math.round(t0 * SR), b = Math.round(t1 * SR); for (let i = a; i < b; i++) s += d[i]! * d[i]!; return Math.sqrt(s / (b - a)); };

describe('notation', () => {
  it('notes: letter, accidental, octave (c4 is 60)', () => {
    expect(noteToMidi('c4')).toBe(60);
    expect(noteToMidi('a4')).toBe(69);
    expect(noteToMidi('f#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
    expect(noteToMidi('h4')).toBeNull();
    expect(noteToMidi('c')).toBeNull();
  });

  it('chords: kinds, the root octave, a bass note, and the extended kinds an AI reaches for', () => {
    expect(chordToMidi('C')).toEqual([48, 52, 55]);
    expect(chordToMidi('Am7')).toEqual([57, 60, 64, 67]);
    expect(chordToMidi('C@4')).toEqual([60, 64, 67]);
    expect(chordToMidi('Am7/e')).toEqual([40, 57, 60, 64, 67]);                 // the bass note an octave below the chord
    expect(chordToMidi('Bm7b5')).toEqual([59, 62, 65, 69]);
    expect(chordToMidi('G7sus4')).toEqual([55, 60, 62, 65]);
    expect(chordToMidi('D9')).toEqual([50, 54, 57, 60, 64]);
    expect(chordToMidi('Bbmaj7')).toEqual([58, 62, 65, 69]);
    expect(chordToMidi('C13')?.length).toBe(6);
    expect(chordToMidi('Cfoo')).toBeNull();
  });

  it('notes strings: lengths, rests, holds, accents in either order, chords written out', () => {
    const { events, length } = parseNotes('c4 e4:2 _:0.5 g4:0.5 ~:1 [c4 e4 g4]:2! Am7,:1', 1);
    expect(events.map(e => [e.t, e.dur, e.midi.length, e.vel])).toEqual([[0, 1, 1, 0.8], [1, 2, 1, 0.8], [3.5, 1.5, 1, 0.8], [5, 2, 3, 1], [7, 1, 4, 0.55]]);
    expect(length).toBe(8);
    expect(parseNotes('c4!:1 e4:1!').events.map(e => e.vel)).toEqual([1, 1]);
    expect(parseNotes('c4 d4 | e4 f4', 0.5).events.map(e => e.t)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('a capital letter is a chord and a lowercase one is a note: G7 is G dominant seventh, g7 is a very high note, C5 is a power chord', () => {
    expect(parseNotes('G7').events[0]!.midi).toEqual([55, 59, 62, 65]);
    expect(parseNotes('g7').events[0]!.midi).toEqual([103]);
    expect(parseNotes('C5').events[0]!.midi).toEqual([48, 55]);
    expect(parseNotes('Bb7:2').events[0]!.midi).toEqual([58, 62, 65, 68]);
    expect(parseNotes('C6 c6').events.map(e => e.midi.length)).toEqual([4, 1]);
    expect(parseNotes('[C4 E4 G4]').events[0]!.midi).toEqual([60, 64, 67]);      // inside brackets every name is a note: nothing to mix up there
  });

  it('a capital letter with an octave that is not a chord says to write the note in lowercase', () => {
    expect(() => parseNotes('c4 Bb2 e4')).toThrow(/"Bb2".*capital.*chord.*bb2/s);
    expect(() => parseNotes('A4')).toThrow(/a4/);
  });

  it('a chord kind that is not known suggests the nearest spelling', () => {
    expect(() => parseNotes('Cmin7')).toThrow(/did you mean "Cm7"/);
    expect(() => parseNotes('Cmaj')).toThrow(/did you mean "C"/);
    expect(() => parseNotes('Csus')).toThrow(/did you mean "Csus4"/);
    expect(() => parseNotes('CM7')).toThrow(/did you mean "Cmaj7"/);
    expect(() => parseNotes('Gfoo')).toThrow(/cannot read "Gfoo"/);
  });

  it('a token that cannot be read is named, with what is allowed', () => {
    expect(() => parseNotes('c4 h9 e4')).toThrow(/cannot read "h9".*Am7.*rest/s);
    expect(() => parseNotes('c4:0')).toThrow(/length/);
  });

  it('drum patterns: x hit, o soft hit, . nothing', () => {
    expect(parseDrumGrid('x..o | x...')).toEqual({ hits: [{ i: 0, vel: 1 }, { i: 3, vel: 0.5 }, { i: 4, vel: 1 }], steps: 8 });
    expect(() => parseDrumGrid('x.q.')).toThrow(/"q".*x \(hit\)/);
  });

  it('tempo map: constant, a ramp (exact integral), held after the last point', () => {
    expect(new TempoMap(120).seconds(8)).toBeCloseTo(4, 9);
    const ramp = new TempoMap([[0, 120], [8, 60]]);
    let numeric = 0;
    for (let i = 0; i < 8000; i++) { const b = (i + 0.5) / 1000; numeric += (60 / (120 - 7.5 * b)) / 1000; }
    expect(ramp.seconds(8)).toBeCloseTo(numeric, 5);
    expect(ramp.seconds(10)).toBeCloseTo(ramp.seconds(8) + 2, 9);       // 60 bpm after the ramp: 1 s per beat
    expect(ramp.bpmAt(4)).toBeCloseTo(90, 9);
    expect(new TempoMap([[4, 100]]).seconds(4)).toBeCloseTo(2.4, 9);   // a first point after 0 holds backwards
  });
});

describe('resolveMusic: every mistake is named', () => {
  const ok = { bpm: 100, tracks: [{ inst: 'keys', notes: 'Cmaj7:4' }] };

  it('a good score resolves with no warnings; length is the notes, the tail is added after', () => {
    const { w, warn } = warnings();
    const m = resolveMusic({ bpm: 120, tracks: [{ inst: 'keys', notes: 'c4:4 d4:4' }] }, 'layer "m"', warn)!;
    expect(w).toEqual([]);
    expect(m.beats).toBe(8);
    expect(m.seconds).toBeCloseTo(4, 9);
    expect(musicLength(m)).toBeCloseTo(4 + 2.5, 9);
  });

  it('bpm is required, and music must be an object', () => {
    const a = warnings();
    expect(resolveMusic({ tracks: [] }, 'layer "m"', a.warn)).toBeNull();
    expect(a.w.join('\n')).toMatch(/bpm is required/);
    const b = warnings();
    expect(resolveMusic('lofi', 'layer "m"', b.warn)).toBeNull();
    expect(b.w.join('\n')).toMatch(/must be an object/);
  });

  it('an unknown instrument or drum is named, with a suggestion', () => {
    const { w, warn } = warnings();
    resolveMusic({ bpm: 100, tracks: [{ inst: 'piano', notes: 'c4' }, { inst: 'pluk', notes: 'c4' }, { inst: 'keys', notes: 'c4:4' }], drums: { hihat: 'x...', kikc: 'x...' } }, 'layer "m"', warn);
    const text = w.join('\n');
    expect(text).toMatch(/tracks\[0\].*"piano".*did you mean "keys"/);
    expect(text).toMatch(/tracks\[1\].*"pluk".*did you mean "pluck"/);
    expect(text).toMatch(/drums.*"hihat".*did you mean "hat"/);
    expect(text).toMatch(/drums.*"kikc".*did you mean "kick"/);
  });

  it('an unreadable note names the track and the token; the other tracks still play', () => {
    const { w, warn } = warnings();
    const m = resolveMusic({ bpm: 100, tracks: [{ inst: 'keys', notes: 'c4 xx9' }, { inst: 'bass', notes: 'c2:4' }] }, 'layer "m"', warn)!;
    expect(w.join('\n')).toMatch(/tracks\[0\] \(keys\).*cannot read "xx9"/);
    expect(m.tracks.map(t => t.inst)).toEqual(['bass']);
  });

  it('misspelt options and layer fields inside music are named', () => {
    const { w, warn } = warnings();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});          // misspelt option names are reported by the shared helper
    resolveMusic({ ...ok, swng: 0.1, duration: 8, tracks: [{ inst: 'keys', notes: 'c4:4', volum: 0.5 }] }, 'layer "m"', warn);
    const text = [...w, ...spy.mock.calls.map(c => String(c[0]))].join('\n');
    spy.mockRestore();
    expect(text).toMatch(/swng.*swing/);
    expect(text).toMatch(/"duration" goes on the audio layer/);
    expect(text).toMatch(/volum.*vol/);
  });

  it('numbers out of range are clamped with a warning; a wrong type falls back', () => {
    const { w, warn } = warnings();
    const m = resolveMusic({ ...ok, swing: 2, reverb: 'lots', grid: 3, tracks: [{ inst: 'keys', notes: 'c4:4', pan: 5, tone: 'dark' }] }, 'layer "m"', warn)!;
    expect(m.swing).toBe(0.4);
    expect(m.reverb).toBe(0.22);
    expect(m.grid).toBe(3);
    expect(m.tracks[0]!.pan).toBe(1);
    expect(m.tracks[0]!.tone).toBe(1);
    expect(w.length).toBe(4);
  });

  it('no notes at all is silent and says why (drums alone do not set a length)', () => {
    const { w, warn } = warnings();
    expect(resolveMusic({ bpm: 100, drums: { kick: 'x...' } }, 'layer "m"', warn)).toBeNull();
    expect(w.join('\n')).toMatch(/no notes.*drums alone/s);
  });

  it('drum sections: from / to limit where a pattern plays; vol points are sorted', () => {
    const m = resolveMusic({ bpm: 100, tracks: [{ inst: 'keys', vol: [[8, 0.8], [0, 0]], notes: '_:16' }], drums: [{ kick: 'x...' }, { from: 8, to: 12, snare: '..x.' }] }, 'layer "m"')!;
    expect(m.drums.map(d => [d.from, d.to])).toEqual([[0, Infinity], [8, 12]]);
    expect(m.tracks[0]!.vol).toEqual([[0, 0], [8, 0.8]]);
  });

  it('the key changes when anything audible changes, and not otherwise', () => {
    const a = resolveMusic(ok, 'x')!, b = resolveMusic({ ...ok }, 'x')!, c = resolveMusic({ ...ok, seed: 2 }, 'x')!;
    expect(musicKey(a, 10, false)).toBe(musicKey(b, 10, false));
    expect(musicKey(a, 10, false)).not.toBe(musicKey(c, 10, false));
    expect(musicKey(a, 10, false)).not.toBe(musicKey(a, 11, false));
    expect(musicKey(a, 10, false)).not.toBe(musicKey(a, 10, true));
  });
});

describe('renderMusic', () => {
  const base = {
    bpm: 120, seed: 3,
    tracks: [{ inst: 'keys', notes: 'c4:1 e4:1 g4:1 c5:1' }, { inst: 'bass', notes: 'c2:2 g1:2' }],
    drums: { kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.' },
  };
  const render = (o: object, length?: number, loop = false) => {
    const m = resolveMusic({ ...base, ...o }, 'x')!;
    return renderMusic(m, SR, length ?? musicLength(m), loop);
  };

  it('is deterministic: the same music gives the same samples; another seed gives other ones', () => {
    const a = render({}), b = render({}), c = render({ seed: 4 });
    expect(Array.from(a[0]).every((x, i) => x === b[0][i])).toBe(true);
    expect(Array.from(a[0]).some((x, i) => x !== c[0][i])).toBe(true);
  });

  it('is as long as asked, stereo, finite, audible, and peaks at MUSIC_PEAK', () => {
    const m = resolveMusic(base, 'x')!;
    const [l, r] = renderMusic(m, SR, 6, false);
    expect(l.length).toBe(6 * SR);
    expect(r.length).toBe(6 * SR);
    expect(Array.from(l).every(Number.isFinite)).toBe(true);
    let peak = 0;
    for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
    expect(peak).toBeGreaterThan(MUSIC_PEAK * 0.97);
    expect(peak).toBeLessThanOrEqual(MUSIC_PEAK + 1e-6);
    expect(rms(l, 0.1, 1.5)).toBeGreaterThan(0.02);
  });

  it('cut short, it fades to silence at the cut; longer, it is silent after the music', () => {
    const cut = render({}, 1.5)[0];
    expect(Math.abs(cut[cut.length - 1]!)).toBeLessThan(1e-3);
    const m = resolveMusic(base, 'x')!;
    const long = renderMusic(m, SR, musicLength(m) + 4, false)[0];
    expect(rms(long, musicLength(m) + 1, musicLength(m) + 4)).toBeLessThan(1e-3);
  });

  it('loop repeats the music until the layer ends', () => {
    const m = resolveMusic({ bpm: 120, seed: 1, humanize: 0, reverb: 0, tracks: [{ inst: 'pluck', notes: 'c4:1 _:3' }] }, 'x')!;
    const l = renderMusic(m, SR, 8, true)[0];
    expect(rms(l, 0, 0.5)).toBeGreaterThan(0.01);                       // beat 0
    expect(rms(l, 2.0, 2.5)).toBeGreaterThan(0.01);                     // the second pass (loop = 2 s)
    expect(rms(l, 6.0, 6.5)).toBeGreaterThan(0.01);                     // and the fourth
    const once = renderMusic(m, SR, 8, false)[0];
    expect(rms(once, 6.0, 6.5)).toBeLessThan(1e-3);
  });

  it('a vol fade is a fade: the same track is quiet early and loud late', () => {
    const l = render({ tracks: [{ inst: 'pad', vol: [[0, 0], [8, 1]], notes: '[c3 g3 e4]:8' }], drums: undefined })[0];
    expect(rms(l, 0.2, 0.8)).toBeLessThan(rms(l, 3.2, 3.8) * 0.6);
  });

  it('a track with tone: 0 is darker (less high-frequency movement) than the same track open', () => {
    const roughness = (d: Float32Array) => { let s = 0; for (let i = 1; i < d.length; i++) s += Math.abs(d[i]! - d[i - 1]!); return s / d.length; };
    const open = render({ tracks: [{ inst: 'lead', notes: 'c3:4' }], drums: undefined, reverb: 0 })[0];
    const dark = render({ tracks: [{ inst: 'lead', tone: 0, notes: 'c3:4' }], drums: undefined, reverb: 0 })[0];
    const ro = roughness(open) / (rms(open, 0.2, 1.8)), rd = roughness(dark) / (rms(dark, 0.2, 1.8));
    expect(rd).toBeLessThan(ro * 0.8);
  });

  it('a ritardando really slows the notes: the same notes take longer with a tempo ramp', () => {
    const steady = resolveMusic({ bpm: 120, tracks: [{ inst: 'keys', notes: 'c4:8' }] }, 'x')!;
    const slowing = resolveMusic({ bpm: [[0, 120], [4, 60]], tracks: [{ inst: 'keys', notes: 'c4:8' }] }, 'x')!;
    expect(slowing.seconds).toBeGreaterThan(steady.seconds + 1);
  });

  it('every instrument and drum makes sound at several sample rates', () => {
    const insts = ['keys', 'pluck', 'pad', 'bass', 'sub', 'lead', 'bell', 'musicbox'];
    const drums = ['kick', 'snare', 'hat', 'openhat', 'clap', 'rim', 'tom', 'crash', 'shaker', 'sleigh'];
    for (const sr of [8000, 22050, 48000]) {
      for (const inst of insts) {
        const m = resolveMusic({ bpm: 120, reverb: 0, tracks: [{ inst, notes: 'c4:1' }] }, 'x')!;
        const l = renderMusic(m, sr, 1.5, false)[0];
        expect(Array.from(l).every(Number.isFinite), `${inst} at ${sr}`).toBe(true);
        expect(Math.max(...Array.from(l).map(Math.abs)), `${inst} at ${sr}`).toBeGreaterThan(0.01);
      }
    }
    for (const kind of drums) {
      const m = resolveMusic({ bpm: 120, reverb: 0, tracks: [{ inst: 'keys', vol: 0, notes: '_:2' }], drums: { [kind]: 'x...' } }, 'x')!;
      const l = renderMusic(m, 8000, 1.5, false)[0];
      expect(Math.max(...Array.from(l).map(Math.abs)), kind).toBeGreaterThan(0.01);
    }
  });

  it('beat times: the kick hits when there is a kick, otherwise every beat', () => {
    const withKick = resolveMusic({ bpm: 120, tracks: [{ inst: 'keys', notes: '_:4' }], drums: { kick: 'x.......' } }, 'x')!;   // 8 sixteenths = 2 beats, so a kick every 2 beats
    expect(musicBeatTimes(withKick).map(t => Math.round(t * 100) / 100)).toEqual([0, 1]);
    const none = resolveMusic({ bpm: 120, tracks: [{ inst: 'keys', notes: '_:4' }] }, 'x')!;
    expect(musicBeatTimes(none).map(t => Math.round(t * 100) / 100)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('a drum pattern in sections plays only inside its from / to', () => {
    const m = resolveMusic({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst: 'keys', vol: 0, notes: '_:8' }], drums: { from: 4, to: 8, kick: 'x...' } }, 'x')!;
    const l = renderMusic(m, SR, 5, false)[0];
    expect(rms(l, 0, 1.9)).toBeLessThan(1e-4);                           // beats 0–4 = seconds 0–2: silence
    expect(rms(l, 2, 2.2)).toBeGreaterThan(0.01);
  });
});

describe('the warnings use console.warn by default', () => {
  it('resolveMusic without a warn function prints a pixi-effects warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveMusic({ tracks: [] }, 'layer "m"');
    expect(spy.mock.calls[0]![0]).toMatch(/^pixi-effects: layer "m": music.bpm is required/);
    spy.mockRestore();
  });
});

describe('the music is rendered in slices a page can paint between (the load of a long reel froze the page for 4 s)', () => {
  const spec = { bpm: 120, tracks: [{ inst: 'pluck', notes: 'c4:1 e4:1 g4:1 c5:1' }, { inst: 'pad', notes: 'Am:4' }], drums: [{ pattern: 'x.x.x.x.' }], reverb: 0.3 } as never;
  it('the sliced render gives exactly the samples of the one-piece render, and it hands control back many times', async () => {
    const { renderMusicAsync } = await import('../../src/audio/music/render');
    const m = resolveMusic(spec, 'test')!;
    const [l1, r1] = renderMusic(m, SR, musicLength(m));
    const fractions: number[] = [];
    const [l2, r2] = await renderMusicAsync(m, SR, musicLength(m), false, async (f) => { fractions.push(f); });
    expect(l2).toEqual(l1); expect(r2).toEqual(r1);
    expect(fractions.length).toBeGreaterThan(10);
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]!).toBeGreaterThanOrEqual(fractions[i - 1]!);   // it only goes forward
    expect(fractions.at(-1)!).toBeLessThanOrEqual(1);
  });
});
