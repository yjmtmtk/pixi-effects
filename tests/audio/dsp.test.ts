import { describe, it, expect } from 'vitest';
import { lcg, expSweep, linSweep, envelope, Svf, oscillator, renderVoice, tilt, EDGE_FADE } from '../../src/audio/dsp';

const SR = 44100;
const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};

describe('lcg (the approved generator\'s noise)', () => {
  it('is deterministic per seed, differs between seeds, and stays in [-1, 1)', () => {
    const a = lcg(42), b = lcg(42), c = lcg(43);
    const xs = Array.from({ length: 1000 }, a);
    expect(Array.from({ length: 1000 }, b)).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every(x => x >= -1 && x < 1)).toBe(true);
  });
  it('matches the reference formula s = s * 1664525 + 1013904223 (mod 2^32)', () => {
    expect(lcg(1)()).toBe(((1664525 + 1013904223) >>> 0) / 2147483648 - 1);
  });
});

describe('sweeps and envelopes', () => {
  it('expSweep is exponential (geometric midpoint); linSweep is linear', () => {
    expect(expSweep(440, 0.7)).toBe(440);
    expect(expSweep([100, 400], 0.5)).toBeCloseTo(200, 9);
    expect(linSweep([-0.6, 0.6], 0.5)).toBeCloseTo(0, 9);
  });
  it('bell rises smoothly to 1 at `attack` and falls to 0 at the end', () => {
    const env = { shape: 'bell', attack: 0.32 } as const;
    expect(envelope(env, 0)).toBe(0);
    expect(envelope(env, 0.32)).toBeCloseTo(1, 9);
    expect(envelope(env, 0.16)).toBeCloseTo(0.5, 9);
    expect(envelope(env, 1)).toBe(0);
  });
  it('fall rises linearly over `attack`, then (1 − u) ^ power', () => {
    const env = { shape: 'fall', attack: 0.04, power: 3 } as const;
    expect(envelope(env, 0.02)).toBeCloseTo(0.5 * 0.98 ** 3, 9);
    expect(envelope(env, 0.5)).toBeCloseTo(0.125, 9);
    expect(envelope(env, 1)).toBe(0);
  });
  it('swell grows as u ^ power and is cut to 0 over the last 3 %', () => {
    const env = { shape: 'swell', power: 2.2 } as const;
    expect(envelope(env, 0.5)).toBeCloseTo(0.5 ** 2.2, 9);
    expect(envelope(env, 0.97)).toBeCloseTo(0.97 ** 2.2, 9);
    expect(envelope(env, 1)).toBe(0);
  });
});

describe('Svf (Chamberlin)', () => {
  const tone = (hz: number, type: 'lowpass' | 'highpass' | 'bandpass', cutoff: number, sr = SR) => {
    const f = new Svf(type, 0.707, sr, Svf.needsOversampling(cutoff, sr) ? 2 : 1);
    const out = new Float32Array(sr / 10);
    for (let i = 0; i < out.length; i++) out[i] = f.process(Math.sin((2 * Math.PI * hz * i) / sr), cutoff);
    return rms(out, out.length / 2);   // after it settles
  };
  it('low-pass passes lows and cuts highs; high-pass the other way round', () => {
    expect(tone(100, 'lowpass', 1000)).toBeGreaterThan(0.6);
    expect(tone(10000, 'lowpass', 1000)).toBeLessThan(0.02);
    expect(tone(10000, 'highpass', 1000)).toBeGreaterThan(0.6);
    expect(tone(100, 'highpass', 1000)).toBeLessThan(0.02);
  });
  it('oversamples only above sampleRate / 6, and stays bounded up to the top of the band', () => {
    expect(Svf.needsOversampling([500, 5200], 44100)).toBe(false);   // the approved swoosh runs the plain form
    expect(Svf.needsOversampling([2200, 9000], 44100)).toBe(true);
    for (const sr of [22050, 44100, 48000]) {
      for (const type of ['lowpass', 'highpass', 'bandpass'] as const) {
        const f = new Svf(type, 0.7, sr, 2);
        const noise = lcg(1);
        let max = 0;
        for (let i = 0; i < 20000; i++) max = Math.max(max, Math.abs(f.process(noise(), sr * 0.45)));
        expect(max).toBeLessThan(50);
      }
    }
  });
});

describe('oscillator / renderVoice', () => {
  it('every periodic wave stays within [-1.2, 1.2]', () => {
    for (const wave of ['sine', 'triangle', 'square', 'saw'] as const) {
      for (let k = 0; k < 1000; k++) expect(Math.abs(oscillator(wave, k / 1000, 0.01))).toBeLessThanOrEqual(1.2);
    }
  });
  it('renders only inside its from → to window, fading in and out over 3 ms', () => {
    const L = new Float32Array(SR / 10), R = new Float32Array(SR / 10);
    renderVoice(L, R, { wave: 'sine', freq: 440, from: 0.5, to: 1, env: { shape: 'hold' }, gain: 1 }, SR, lcg(1));
    expect(rms(L, 0, L.length / 2)).toBe(0);
    expect(rms(L, L.length / 2)).toBeGreaterThan(0.4);
    expect(L[L.length / 2]).toBe(0);
    expect(Math.abs(L[L.length - 1]!)).toBe(0);
    expect(Math.round(EDGE_FADE * SR)).toBe(132);
  });
  it('pans with constant power: centre is cos(π/4) on both sides, -1 is all left', () => {
    const L = new Float32Array(1000), R = new Float32Array(1000);
    renderVoice(L, R, { wave: 'sine', freq: 441, env: { shape: 'hold' }, gain: 1 }, SR, lcg(1));
    expect(rms(L, 200, 800)).toBeCloseTo(rms(R, 200, 800), 9);
    const L2 = new Float32Array(1000), R2 = new Float32Array(1000);
    renderVoice(L2, R2, { wave: 'sine', freq: 441, env: { shape: 'hold' }, pan: -1, gain: 1 }, SR, lcg(1));
    expect(rms(R2, 200, 800)).toBeLessThan(1e-9);
    expect(rms(L2, 200, 800) / rms(L, 200, 800)).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe('tilt (brightness)', () => {
  const level = (hz: number, b: number) => {
    const x = new Float32Array(SR / 10);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * hz * i) / SR);
    tilt(x, b, SR);
    return rms(x, x.length / 2);
  };
  it('+1 boosts highs and leaves lows; −1 removes highs and keeps lows', () => {
    expect(level(8000, 1) / level(8000, 0.0001)).toBeGreaterThan(1.8);
    expect(level(8000, -1)).toBeLessThan(0.15);
    expect(level(100, -1)).toBeGreaterThan(0.65);
    expect(level(100, 1)).toBeLessThan(0.75);
  });
});
