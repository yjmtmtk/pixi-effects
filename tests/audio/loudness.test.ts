import { describe, it, expect } from 'vitest';
import { measureLoudness, findSilences } from '../../src/audio/loudness';

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

describe('findSilences', () => {
  it('lists runs of at least minLength seconds below the threshold, in seconds', () => {
    const sr = 1000, x = new Float32Array(10 * sr);
    for (let i = 0; i < 2 * sr; i++) x[i] = 0.5;                       // sound 0-2 s, silence 2-6 s, sound 6-7 s, silence 7-10 s
    for (let i = 6 * sr; i < 7 * sr; i++) x[i] = 0.5;
    expect(findSilences([x], sr, { minLength: 1 })).toEqual([{ from: 2, to: 6 }, { from: 7, to: 10 }]);
    expect(findSilences([x], sr, { minLength: 3.5 })).toEqual([{ from: 2, to: 6 }]);
  });
});
