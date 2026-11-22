import { describe, it, expect } from 'vitest';
import { resolveMusic } from '../../src/audio/music/resolve';
import { renderMusic, musicLength } from '../../src/audio/music/render';

// The wider palette of `music`: new instruments, per-track effects, drum kits. Everything here is off unless a score writes it
// (the pinned checksums in music.test.ts hold the old sound to the bit).

const warnings = () => { const w: string[] = []; return { w, warn: (m: string) => { w.push(m); } }; };
const NEW = ['piano', 'organ', 'strings', 'brass', 'choir', 'flute', 'guitar', 'saw', 'supersaw', 'square', '808', 'marimba'];
const KITS = ['classic', '808', 'acoustic', 'lofi', 'chip'];
const DRUMS = ['kick', 'snare', 'hat', 'openhat', 'clap', 'rim', 'tom', 'crash', 'shaker', 'sleigh'];

const render = (music: object, sr = 8000, length?: number) => {
  const m = resolveMusic(music, 'x', () => {})!;
  return renderMusic(m, sr, length ?? musicLength(m), false);
};
const rmsOf = (d: Float32Array, sr: number, t0: number, t1: number) => { let s = 0; const a = Math.round(t0 * sr), b = Math.round(t1 * sr); for (let i = a; i < b; i++) s += d[i]! * d[i]!; return Math.sqrt(s / Math.max(1, b - a)); };
/** How bright a stretch is: the RMS of the first difference over the RMS (a sine at f gives about 2·sin(π f / sr)). */
const brightness = (d: Float32Array, sr: number, t0: number, t1: number) => {
  const a = Math.round(t0 * sr), b = Math.round(t1 * sr);
  let s = 0, ds = 0;
  for (let i = a + 1; i < b; i++) { s += d[i]! * d[i]!; const x = d[i]! - d[i - 1]!; ds += x * x; }
  return Math.sqrt(ds / Math.max(s, 1e-12));
};
/** The fundamental of a stretch by autocorrelation (the lag with the strongest match between minHz and maxHz). */
const pitch = (d: Float32Array, sr: number, t0: number, t1: number, minHz = 50, maxHz = 2000) => {
  const a = Math.round(t0 * sr), n = Math.round((t1 - t0) * sr);
  const x = d.subarray(a, a + n);
  let mean = 0; for (const v of x) mean += v; mean /= n;
  const lo = Math.floor(sr / maxHz), hi = Math.ceil(sr / minHz);
  const r = (lag: number) => { let s = 0; for (let i = 0; i + lag < n; i++) s += (x[i]! - mean) * (x[i + lag]! - mean); return s / (n - lag); };
  const r0 = r(0);
  let best = lo, bestV = -Infinity;
  const vals: number[] = [];
  for (let lag = lo; lag <= hi; lag++) vals[lag] = r(lag);
  // the first lag whose correlation is close to the best one (avoids picking twice the period)
  for (let lag = lo; lag <= hi; lag++) if (vals[lag]! > bestV) { bestV = vals[lag]!; best = lag; }
  for (let lag = lo; lag <= hi; lag++) if (vals[lag]! > 0.9 * bestV && vals[lag]! >= (vals[lag - 1] ?? -Infinity) && vals[lag]! >= (vals[lag + 1] ?? -Infinity)) { best = lag; break; }
  // parabolic refinement
  const y0 = vals[best - 1] ?? vals[best]!, y1 = vals[best]!, y2 = vals[best + 1] ?? vals[best]!;
  const den = y0 - 2 * y1 + y2, shift = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
  void r0;
  return sr / (best + shift);
};

describe('new instruments', () => {
  it('resolve with no warning, and the words people reach for point at them', () => {
    const { w, warn } = warnings();
    const m = resolveMusic({ bpm: 100, tracks: NEW.map(inst => ({ inst, notes: 'c4:1' })) }, 'x', warn)!;
    expect(w).toEqual([]);
    expect(m.tracks.map(t => t.inst)).toEqual(NEW);
    const b = warnings();
    resolveMusic({ bpm: 100, tracks: [{ inst: 'violin', notes: 'c4' }, { inst: 'trumpet', notes: 'c4' }, { inst: 'chiptune', notes: 'c4' }, { inst: 'xylophone', notes: 'c4' }, { inst: 'hammond', notes: 'c4' }, { inst: 'electricguitar', notes: 'c4' }, { inst: 'keys', notes: 'c4' }] }, 'x', b.warn);
    const text = b.w.join('\n');
    expect(text).toMatch(/"violin".*did you mean "strings"/);
    expect(text).toMatch(/"trumpet".*did you mean "brass"/);
    expect(text).toMatch(/"chiptune".*did you mean "square"/);
    expect(text).toMatch(/"xylophone".*did you mean "marimba"/);
    expect(text).toMatch(/"hammond".*did you mean "organ"/);
    expect(text).toMatch(/"electricguitar".*did you mean "guitar"/);
    expect(text).toMatch(/instruments: keys, pluck, pad, bass, sub, lead, bell, musicbox, piano, organ/);
  });

  it('every new instrument makes finite, audible sound at several sample rates', () => {
    for (const sr of [8000, 22050, 48000]) for (const inst of NEW) {
      const [l, r] = render({ bpm: 120, reverb: 0, tracks: [{ inst, notes: 'c4:1' }] }, sr, 1.5);
      expect(Array.from(l).every(Number.isFinite) && Array.from(r).every(Number.isFinite), `${inst} at ${sr}`).toBe(true);
      expect(Math.max(...Array.from(l).map(Math.abs)), `${inst} at ${sr}`).toBeGreaterThan(0.01);
    }
  });

  it('a pitched instrument plays the note written: a4 is 440 Hz (808 an octave down: a2 is 110 Hz)', () => {
    const SR = 22050;
    for (const inst of NEW) {
      const note = inst === '808' ? 'a2:2' : 'a4:2';
      const want = inst === '808' ? 110 : 440;
      const [l] = render({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst, notes: note, legato: 1 }] }, SR, 1.2);
      const t0 = inst === 'marimba' || inst === 'piano' || inst === 'guitar' ? 0.08 : 0.35;
      const f = pitch(l, SR, t0, t0 + 0.12, 60, 1200);
      expect(f / want, `${inst}: ${f.toFixed(1)} Hz`).toBeGreaterThan(0.97);
      expect(f / want, `${inst}: ${f.toFixed(1)} Hz`).toBeLessThan(1.03);
    }
  });

  it('is deterministic: the same score gives the same samples', () => {
    for (const inst of NEW) {
      const s = { bpm: 110, tracks: [{ inst, notes: 'Am:2 c5:1 e5:1' }] };
      expect(Buffer.from(render(s)[0].buffer).equals(Buffer.from(render(s)[0].buffer)), inst).toBe(true);
    }
  });

  it('square: width changes the sound, and width on another instrument is named', () => {
    const a = render({ bpm: 120, reverb: 0, tracks: [{ inst: 'square', notes: 'a4:1' }] })[0];
    const b = render({ bpm: 120, reverb: 0, tracks: [{ inst: 'square', notes: 'a4:1', width: 0.125 }] })[0];
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(false);
    const { w, warn } = warnings();
    resolveMusic({ bpm: 120, tracks: [{ inst: 'keys', notes: 'a4:1', width: 0.25 }] }, 'x', warn);
    expect(w.join('\n')).toMatch(/width.*only.*square/);
  });
});

describe('track effects', () => {
  const tone = (extra: object, inst = 'sub', notes = 'a3:4') => render({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst, notes, legato: 1, ...extra }] }, 22050, 2.4)[0];

  it('accepts every new key with no warning; bad values are named and fall back', () => {
    const good = warnings();
    resolveMusic({ bpm: 120, kit: '808', tracks: [
      { inst: 'guitar', notes: 'E5:4', drive: 0.7, crush: 0.2, tone: [[0, 0.3], [4, 1]], resonance: 0.6, chorus: 0.4, delay: 0.3, sidechain: 0.5 },
      { inst: 'saw', notes: 'c4 e4', glide: 0.08, delay: { beats: 0.5, mix: 0.3, feedback: 0.4 }, arp: { mode: 'updown', rate: 0.25, octaves: 2 } },
      { inst: 'square', notes: 'C:4', arp: 'up', width: 0.25 },
    ], drums: [{ kick: 'x...' }, { from: 4, kit: 'acoustic', snare: '..x.' }] }, 'x', good.warn);
    expect(good.w).toEqual([]);
    const bad = warnings();
    const m = resolveMusic({ bpm: 120, kit: 'tr808', tracks: [
      { inst: 'pad', notes: 'C:4', drive: 3, arp: 'upwards', glide: 0.1, tone: [[0, 'x']] },
      { inst: 'saw', notes: 'c4', delay: { beat: 0.5 } },
    ], drums: { kick: 'x...' } }, 'x', bad.warn)!;
    const text = bad.w.join('\n');
    expect(text).toMatch(/drive 3 is outside 0–1/);
    expect(text).toMatch(/arp "upwards".*did you mean "up"/);
    expect(text).toMatch(/glide.*pad.*(lead|mono)/);
    expect(text).toMatch(/tone must be a number.*points/);
    expect(text).toMatch(/kit "tr808".*did you mean "808"/);
    expect(text).toMatch(/delay.*beat.*beats/);
    expect(m.tracks[0]!.drive).toBe(1);
  });

  it('drive adds harmonics: a driven sine is brighter than a clean one', () => {
    expect(brightness(tone({ drive: 0.8 }), 22050, 0.3, 1.5)).toBeGreaterThan(brightness(tone({}), 22050, 0.3, 1.5) * 1.3);
  });

  it('crush adds the hiss of fewer bits and a lower rate', () => {
    expect(brightness(tone({ crush: 0.8 }), 22050, 0.3, 1.5)).toBeGreaterThan(brightness(tone({}), 22050, 0.3, 1.5) * 1.5);
  });

  it('tone as points is a filter sweep: dark at the start, bright at the end', () => {
    const swept = tone({ tone: [[0, 0], [4, 1]] }, 'supersaw', 'a2:4');
    expect(brightness(swept, 22050, 1.6, 1.9)).toBeGreaterThan(brightness(swept, 22050, 0.1, 0.4) * 2);
  });

  it('resonance changes a filtered sound and stays finite', () => {
    const a = tone({ tone: 0.4 }, 'saw', 'a2:4'), b = tone({ tone: 0.4, resonance: 0.9 }, 'saw', 'a2:4');
    expect(Array.from(b).every(Number.isFinite)).toBe(true);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(false);
  });

  it('chorus widens a mono sound: left and right differ', () => {
    const m = resolveMusic({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst: 'sub', notes: 'a3:4', chorus: 0.8 }] }, 'x')!;
    const [L, R] = renderMusic(m, 22050, 2, false);
    let diff = 0; for (let i = 0; i < L.length; i++) diff += Math.abs(L[i]! - R[i]!);
    const plain = renderMusic(resolveMusic({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst: 'sub', notes: 'a3:4' }] }, 'x')!, 22050, 2, false);
    let diff0 = 0; for (let i = 0; i < L.length; i++) diff0 += Math.abs(plain[0][i]! - plain[1][i]!);
    expect(diff).toBeGreaterThan(diff0 * 10 + 1);
  });

  it('delay repeats a short note: there is sound where the echo falls, and none without the delay', () => {
    const SR = 22050;
    const s = (extra: object) => render({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst: 'marimba', notes: 'a4:0.25 _:3.75', ...extra }] }, SR, 2.5)[0];
    const dry = s({}), wet = s({ delay: { beats: 1, mix: 0.6, feedback: 0.3 } });       // one beat at 120 bpm = 0.5 s
    expect(rmsOf(wet, SR, 0.5, 0.6)).toBeGreaterThan(rmsOf(dry, SR, 0.5, 0.6) * 3 + 1e-4);
    expect(rmsOf(wet, SR, 1.0, 1.1)).toBeGreaterThan(rmsOf(dry, SR, 1.0, 1.1) * 3 + 1e-5);
  });

  it('sidechain ducks the track under every kick (the drums can be silent: the kick still drives it)', () => {
    const SR = 8000;
    const s = (sc: number) => render({ bpm: 120, reverb: 0, humanize: 0, drumVol: 0, tracks: [{ inst: 'sub', notes: 'a3:8', sidechain: sc, legato: 1 }], drums: { kick: 'x...' } }, SR, 4)[0];
    const pumped = s(0.9), flat = s(0);
    // a kick every 0.5 s: just after it the track is low, just before the next one it has come back
    const after = rmsOf(pumped, SR, 1.0, 1.06), before = rmsOf(pumped, SR, 1.38, 1.48);
    expect(after).toBeLessThan(before * 0.5);
    expect(rmsOf(flat, SR, 1.0, 1.06) / rmsOf(flat, SR, 1.38, 1.48)).toBeGreaterThan(0.7);
  });

  it('glide slides from the previous note: the second note starts below its pitch and arrives at it', () => {
    const SR = 22050;
    const s = (glide?: number) => render({ bpm: 60, reverb: 0, humanize: 0, tracks: [{ inst: 'saw', notes: 'a3:1 a4:1', legato: 1, ...(glide ? { glide } : {}) }] }, SR, 2.2)[0];
    const g = s(0.4), plain = s();
    // after the first note's release (0.12 s), while the glide (0.4 s) is still on its way
    expect(pitch(g, SR, 1.15, 1.25, 150, 600)).toBeLessThan(400);
    expect(pitch(plain, SR, 1.15, 1.25, 150, 600)).toBeGreaterThan(420);
    expect(pitch(g, SR, 1.6, 1.75, 150, 600) / 440).toBeCloseTo(1, 1);
  });

  it('arp turns a chord into single notes at the rate, over the octaves, in the order asked', () => {
    const ev = (arp: unknown) => resolveMusic({ bpm: 120, tracks: [{ inst: 'square', notes: 'C:2', arp }] }, 'x')!.tracks[0]!.events.map(e => [e.t, e.dur, e.midi]);
    expect(ev('up')).toEqual([[0, 0.25, [48]], [0.25, 0.25, [52]], [0.5, 0.25, [55]], [0.75, 0.25, [48]], [1, 0.25, [52]], [1.25, 0.25, [55]], [1.5, 0.25, [48]], [1.75, 0.25, [52]]]);
    expect(ev({ mode: 'down', rate: 0.5 }).map(e => e[2])).toEqual([[55], [52], [48], [55]]);
    expect(ev({ mode: 'updown', rate: 0.5, octaves: 2 }).map(e => e[2])).toEqual([[48], [52], [55], [60]]);
    expect(ev({ mode: 'updown', rate: 0.25, octaves: 2 }).map(e => (e[2] as number[])[0])).toEqual([48, 52, 55, 60, 64, 67, 64, 60]);
    const r1 = ev('random'), r2 = ev('random');
    expect(r1).toEqual(r2);                                                            // seeded: random is the same every time
    // a single note is left alone
    expect(resolveMusic({ bpm: 120, tracks: [{ inst: 'square', notes: 'c4:2', arp: 'up' }] }, 'x')!.tracks[0]!.events.map(e => e.midi)).toEqual([[60]]);
  });
});

describe('drum kits', () => {
  const hit = (kind: string, kit?: string) => render({ bpm: 120, reverb: 0, humanize: 0, ...(kit ? { kit } : {}), tracks: [{ inst: 'keys', vol: 0, notes: '_:2' }], drums: { [kind]: 'x...............' } }, 8000, 1.2)[0];   // one hit: the pattern is 4 beats (2 s) long

  it('every drum of every kit makes sound', () => {
    for (const kit of KITS) for (const kind of DRUMS) {
      const l = hit(kind, kit);
      expect(Array.from(l).every(Number.isFinite), `${kit} ${kind}`).toBe(true);
      expect(Math.max(...Array.from(l).map(Math.abs)), `${kit} ${kind}`).toBeGreaterThan(0.01);
    }
  });

  it('classic is the sound with no kit; the other kits sound different', () => {
    for (const kind of DRUMS) expect(Buffer.from(hit(kind, 'classic').buffer).equals(Buffer.from(hit(kind).buffer)), kind).toBe(true);
    for (const kit of ['808', 'acoustic', 'lofi', 'chip']) {
      const differs = ['kick', 'snare', 'hat'].filter(kind => !Buffer.from(hit(kind, kit).buffer).equals(Buffer.from(hit(kind).buffer)));
      expect(differs, kit).toEqual(['kick', 'snare', 'hat']);
    }
  });

  it('a section can use its own kit', () => {
    const m = resolveMusic({ bpm: 120, kit: '808', tracks: [{ inst: 'keys', notes: '_:8' }], drums: [{ to: 4, kick: 'x...' }, { from: 4, kit: 'acoustic', kick: 'x...' }] }, 'x')!;
    expect(m.drums.map(d => d.kit)).toEqual(['808', 'acoustic']);
  });

  it('the 808 kick is long and low: half a second on it is still a good part of its attack (the mix is normalised, so compare within one)', () => {
    const SR = 8000, tail = (l: Float32Array) => rmsOf(l, SR, 0.45, 0.6) / rmsOf(l, SR, 0, 0.1);
    expect(tail(hit('kick', '808'))).toBeGreaterThan(tail(hit('kick')) * 3);
  });
});

describe('review fixes (2026-11-22)', () => {
  const SR = 48000;
  it('guitar is in tune on every note (the fractional delay reads forward): within 0.5 % at 48 kHz', () => {
    for (const [note, hz] of [['e2', 82.41], ['a2', 110], ['g4', 392], ['a4', 440], ['c5', 523.25], ['e5', 659.26]] as const) {
      const [l] = render({ bpm: 60, reverb: 0, humanize: 0, tracks: [{ inst: 'guitar', notes: `${note}:2`, legato: 1 }] }, SR, 1);
      const f = pitch(l, SR, 0.1, 0.3, 60, 1200);
      expect(Math.abs(f / hz - 1), `${note}: ${f.toFixed(2)} Hz`).toBeLessThan(0.005);
    }
  });

  it('a guitar note ends with a fade, not a cut (no sample jumps at its end)', () => {
    const [l] = render({ bpm: 120, reverb: 0, humanize: 0, tracks: [{ inst: 'guitar', notes: 'e2:0.5 _:3.5' }] }, SR, 1.5);
    let peak = 0, lastLoud = 0;
    for (let i = 0; i < l.length; i++) { peak = Math.max(peak, Math.abs(l[i]!)); if (Math.abs(l[i]!) > 1e-6) lastLoud = i; }
    // the last 2 ms before silence stay below 5 % of the peak
    let tail = 0; for (let i = lastLoud - Math.round(0.002 * SR); i <= lastLoud; i++) tail = Math.max(tail, Math.abs(l[i]!));
    expect(tail / peak).toBeLessThan(0.05);
  });

  it('a piano note held past its 8 s cap and a long-ringing marimba fade out instead of being cut', () => {
    for (const [inst, extra, len] of [['piano', {}, 10], ['marimba', { ring: 6 }, 7]] as const) {
      const [l] = render({ bpm: 60, reverb: 0, humanize: 0, tracks: [{ inst, notes: 'c4:10', ...extra }] }, 8000, len);
      let peak = 0, lastLoud = 0;
      for (let i = 0; i < l.length; i++) { peak = Math.max(peak, Math.abs(l[i]!)); if (Math.abs(l[i]!) > 1e-6) lastLoud = i; }
      let tail = 0; for (let i = lastLoud - 16; i <= lastLoud; i++) tail = Math.max(tail, Math.abs(l[i]!));
      expect(tail / peak, inst).toBeLessThan(0.01);
    }
  });

  it('with loop, a tone sweep starts again on every pass (as vol points do)', () => {
    const m = resolveMusic({ bpm: 120, reverb: 0, humanize: 0, tail: 0, tracks: [{ inst: 'supersaw', notes: 'a2:4', legato: 1, tone: [[0, 0], [4, 1]] }] }, 'x')!;
    const [l] = renderMusic(m, 22050, 4.4, true);              // two passes of 2 s
    expect(brightness(l, 22050, 2.1, 2.4)).toBeLessThan(brightness(l, 22050, 1.6, 1.9) * 0.6);
  });

  it('the lofi kit costs about what its drums last, not 2.4 s a hit', () => {
    const score = (kit?: string) => ({ bpm: 82, reverb: 0, ...(kit ? { kit } : {}), tracks: [{ inst: 'keys', vol: 0, notes: '_:128' }], drums: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' } });
    const time = (kit?: string) => { const m = resolveMusic(score(kit), 'x')!; const t0 = performance.now(); renderMusic(m, 22050, musicLength(m), false); return performance.now() - t0; };
    time(); time('lofi');                                         // warm up
    expect(time('lofi')).toBeLessThan(time() * 1.6 + 50);
  });

  it('arp notes count against the note limit', () => {
    const { w, warn } = warnings();
    const m = resolveMusic({ bpm: 120, tracks: Array.from({ length: 16 }, () => ({ inst: 'square', notes: Array(40).fill('C:4').join(' '), arp: { rate: 0.0625, octaves: 4 } })) }, 'x', warn);
    expect(m).toBeNull();
    expect(w.join('\n')).toMatch(/notes; the limit is/);
  });

  it('arp.octaves out of range or not a number is named', () => {
    const { w, warn } = warnings();
    resolveMusic({ bpm: 120, tracks: [{ inst: 'square', notes: 'C:4', arp: { octaves: 7 } }, { inst: 'square', notes: 'C:4', arp: { octaves: 'two' } }] }, 'x', warn);
    expect(w.filter(m => /arp\.octaves/.test(m)).length).toBe(2);
  });

  it('resonance with an open tone is named (the peak would sit above hearing and only lower the level)', () => {
    const { w, warn } = warnings();
    resolveMusic({ bpm: 120, tracks: [{ inst: 'saw', notes: 'c4:4', resonance: 0.6 }] }, 'x', warn);
    expect(w.join('\n')).toMatch(/resonance.*tone/);
  });

  it('a voice draws the same random numbers whether or not the render cuts inside its note', async () => {
    const { VOICES, setSampleRate } = await import('../../src/audio/music/instruments');
    setSampleRate(8000);
    for (const inst of NEW) {
      const count = (busLen: number) => {
        let n = 0; const rnd = () => { n++; return 0.5; };
        const bus = { L: new Float32Array(busLen), R: new Float32Array(busLen) };
        (VOICES as Record<string, (...a: unknown[]) => void>)[inst]!(60, 1, 0.8, bus, 0, rnd, {});
        return n;
      };
      expect(count(10), inst).toBe(count(8000 * 9));
    }
  });

  it('sidechain ducks on the kick where it really plays (after swing)', () => {
    const SR2 = 8000;
    const [l] = render({ bpm: 120, swing: 0.4, reverb: 0, humanize: 0, drumVol: 0, tracks: [{ inst: 'sub', notes: 'a3:8', sidechain: 0.9, legato: 1 }], drums: { kick: '..x...x...x...x.' } }, SR2, 4);
    // kicks on the off-beat eighths, swung by 0.2 beat (0.1 s): the dip is after the swung time, not before it
    const swung = 1.25 + 0.1;
    expect(rmsOf(l, SR2, swung + 0.005, swung + 0.04)).toBeLessThan(rmsOf(l, SR2, swung - 0.06, swung - 0.01) * 0.6);
  });
});
