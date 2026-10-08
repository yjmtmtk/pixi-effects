import { describe, it, expect } from 'vitest';
import { measureLoudness, findSilences } from '../../src/audio/loudness';

/** The straightforward 4x true peak (every sample, every phase, bounds-checked): the reference the fast one must equal. */
function referenceTruePeak(chans: Float32Array[]): number {
  const half = 12, phases = [0.25, 0.5, 0.75];
  const kernel = phases.map(p => Array.from({ length: 2 * half }, (_, j) => { const k = j - half + 1, x = k - p, s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); return s * (0.5 + 0.5 * Math.cos(Math.PI * x / (half + 1))); }));
  let peak = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) {
    peak = Math.max(peak, Math.abs(c[i]!));
    for (let pi = 0; pi < 3; pi++) { let v = 0; for (let j = 0; j < 2 * half; j++) { const idx = i + j - half + 1; if (idx >= 0 && idx < c.length) v += c[idx]! * kernel[pi]![j]!; } peak = Math.max(peak, Math.abs(v)); }
  }
  return Math.round(200 * Math.log10(Math.max(peak, 1e-6))) / 10;
}
const noise = (n: number, seed: number, amp: number): Float32Array => { let a = seed; return Float32Array.from({ length: n }, () => { a = (a * 1664525 + 1013904223) >>> 0; return amp * (a / 2147483648 - 1); }); };

const sine = (sr: number, seconds: number, hz: number, peak: number, phase = 0): Float32Array =>
  Float32Array.from({ length: Math.round(sr * seconds) }, (_, i) => peak * Math.sin(2 * Math.PI * hz * i / sr + phase));
const dbfs = (x: number) => 20 * Math.log10(x);

describe('measureLoudness (ITU-R BS.1770)', () => {
  it.each([48000, 44100])('stereo 997 Hz sine at -20 dBFS peak, same in both channels, is -20 LUFS (+-0.1) at %i Hz', (sr) => {
    const s = sine(sr, 5, 997, 10 ** (-20 / 20));
    const m = measureLoudness([s, s], sr);
    expect(Math.abs(m.integratedLufs! + 20)).toBeLessThan(0.1);
  });
  it('mono: the same sine is 3 LU quieter (one channel)', () => {
    const s = sine(48000, 5, 997, 10 ** (-20 / 20));
    expect(Math.abs(measureLoudness([s], 48000).integratedLufs! + 23.01)).toBeLessThan(0.1);
  });
  it('silence is gated out: 3 s of sound and 3 s of silence measure about like the sound alone (not 3 LU lower, as an average over time would)', () => {
    const sr = 48000, a = sine(sr, 3, 997, 10 ** (-20 / 20));
    const both = new Float32Array(sr * 6); both.set(a);
    const lufs = measureLoudness([both, both], sr).integratedLufs!;
    expect(lufs).toBeGreaterThan(-20.4);                              // the few blocks that straddle the end of the sound are partly quiet: at most a few tenths of a LU
    expect(lufs).toBeLessThanOrEqual(-19.99);
  });
  it('shorter than one 400 ms block, or all silence: null (no number is better than a wrong one)', () => {
    expect(measureLoudness([sine(48000, 0.2, 997, 0.5)], 48000).integratedLufs).toBeNull();
    expect(measureLoudness([new Float32Array(48000 * 2)], 48000).integratedLufs).toBeNull();
  });
  it('true peak sees what the samples miss: a sine at fs/4 whose samples are all +-0.707 peaks at 0 dBTP', () => {
    const s = sine(48000, 1, 12000, 1, Math.PI / 4);
    const m = measureLoudness([s], 48000);
    expect(Math.abs(m.samplePeakDb - dbfs(Math.SQRT1_2))).toBeLessThan(0.05);
    expect(Math.abs(m.truePeakDb - 0)).toBeLessThan(0.15);
  });
  it('counts clipped samples (at or beyond full scale)', () => {
    const s = new Float32Array(1000).fill(0.5); s[10] = 1; s[11] = -1.2; s[12] = 0.9999;
    expect(measureLoudness([s], 48000).clippedSamples).toBe(2);
  });
});

describe('measureLoudness: the options and the speed-ups keep the numbers', () => {
  it('truePeak: false skips the oversampled peak (null) and changes nothing else', () => {
    const s = sine(48000, 2, 997, 0.3);
    const full = measureLoudness([s, s], 48000), lite = measureLoudness([s, s], 48000, { truePeak: false });
    expect(lite.truePeakDb).toBeNull();
    expect([lite.integratedLufs, lite.samplePeakDb, lite.clippedSamples]).toEqual([full.integratedLufs, full.samplePeakDb, full.clippedSamples]);
  });
  it('the fast true peak equals the straightforward one: noise, a quiet tone with one loud click, a fs/4 sine, silence, a very short signal', () => {
    const click = sine(48000, 1, 440, 0.05); click[24000] = 0.7; click[24001] = 0.7;
    const cases: Float32Array[][] = [
      [noise(48000, 1, 0.5), noise(48000, 2, 0.4)], [click], [sine(48000, 1, 12000, 1, Math.PI / 4)], [new Float32Array(5000)], [Float32Array.from([0.2, 0.9, 0.9, 0.2])], [new Float32Array(0)],
    ];
    for (const ch of cases) expect(measureLoudness(ch, 48000).truePeakDb, String(ch[0]?.length)).toBe(referenceTruePeak(ch));
  });
});

describe('findSilences', () => {
  it('lists runs of at least minLength seconds below the threshold, in seconds', () => {
    const sr = 1000, x = new Float32Array(10 * sr);
    for (let i = 0; i < 2 * sr; i++) x[i] = 0.5;                       // sound 0-2 s, silence 2-6 s, sound 6-7 s, silence 7-10 s
    for (let i = 6 * sr; i < 7 * sr; i++) x[i] = 0.5;
    expect(findSilences([x], sr, { minLength: 1 })).toEqual([{ from: 2, to: 6 }, { from: 7, to: 10 }]);
    expect(findSilences([x], sr, { minLength: 3.5 })).toEqual([{ from: 2, to: 6 }]);
  });
});
