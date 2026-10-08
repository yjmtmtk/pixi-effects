// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resampleThrough } from '../../src/core/audioRemap';
import type { AudioDescriptor } from '../../src/types';

const SR = 22050;
const tone = (hz: number, seconds: number): Float32Array => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR));
/** A sweep from f0 to f1 Hz over `seconds` (the instantaneous frequency at time t is f0 + (f1 - f0) t / seconds). */
const chirp = (f0: number, f1: number, seconds: number): Float32Array => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => { const t = i / SR; return Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) / (2 * seconds)) * t * t)); });
/** Frequency of `x` in the window [t0, t1) seconds, by zero crossings. */
const hzIn = (x: Float32Array, t0: number, t1: number): number => {
  let n = 0;
  for (let i = Math.round(t0 * SR) + 1; i < Math.round(t1 * SR); i++) if ((x[i - 1]! < 0) !== (x[i]! < 0)) n++;
  return n / 2 / (t1 - t0);
};
const desc = (extra: Partial<AudioDescriptor>): AudioDescriptor => ({ loop: false, start: 0, end: 4, initialVolume: 1, volumeKeyframes: [], ...extra });

describe('resampleThrough', () => {
  it('speed 2 doubles the pitch, speed 0.5 halves it', () => {
    const src = tone(440, 4);
    const fast = resampleThrough(desc({ end: 2, sourceMap: u => 2 * u }), src, src, SR, SR, 3)!;
    expect(hzIn(fast.L, 0.3, 1.5)).toBeGreaterThan(880 * 0.97); expect(hzIn(fast.L, 0.3, 1.5)).toBeLessThan(880 * 1.03);
    const slow = resampleThrough(desc({ end: 4, sourceMap: u => 0.5 * u }), src, src, SR, SR, 4)!;
    expect(hzIn(slow.L, 0.3, 3)).toBeGreaterThan(220 * 0.97); expect(hzIn(slow.L, 0.3, 3)).toBeLessThan(220 * 1.03);
  });
  it('backward plays the sweep reversed: it starts high and ends low', () => {
    const src = chirp(200, 1000, 4);
    const rev = resampleThrough(desc({ end: 4, sourceMap: u => 4 - u }), src, src, SR, SR, 4)!;
    const first = hzIn(rev.L, 0.1, 0.4), last = hzIn(rev.L, 3.6, 3.9);
    expect(first).toBeGreaterThan(900); expect(last).toBeLessThan(300);
  });
  it('a freeze is silent (the position does not move)', () => {
    const src = tone(440, 4);
    const r = resampleThrough(desc({ end: 2, sourceMap: () => 1 }), src, src, SR, SR, 2)!;
    let peak = 0;
    for (let i = Math.round(0.2 * SR); i < r.L.length; i++) peak = Math.max(peak, Math.abs(r.L[i]!));
    expect(peak).toBeLessThan(1e-3);
  });
  it('warp: silent outside the span (NaN), and the sound follows the warped time', () => {
    const src = tone(440, 4);
    const r = resampleThrough(desc({ start: 0, end: 2, warp: t => (t < 1 || t > 3 ? NaN : t - 1) }), src, src, SR, SR, 4)!;
    expect(r.at).toBeGreaterThan(0.9);
    expect(r.at).toBeLessThan(1.1);
    expect(r.L.length / SR).toBeLessThan(2.3);
    expect(hzIn(r.L, 0.3, 1.5)).toBeGreaterThan(440 * 0.97);
  });
  it('volume points are read in the sound\'s own time (the ramp follows a reversed warp)', () => {
    const src = tone(440, 4);
    const r = resampleThrough(desc({ end: 4, sourceMap: u => 4 - u, volumeKeyframes: [{ time: 4, value: 0 }] }), src, src, SR, SR, 4)!;
    const rms = (a: number, b: number): number => { let s = 0, n = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) { s += r.L[i]! * r.L[i]!; n++; } return Math.sqrt(s / n); };
    expect(rms(0.2, 0.6)).toBeGreaterThan(rms(3.2, 3.6) * 2);       // fading from 1 at 0 s to 0 at 4 s
  });
  it('a sound that is never audible is null; the loop wraps the position', () => {
    const src = tone(440, 1);
    expect(resampleThrough(desc({ start: 2, end: 3, warp: () => 0 }), src, src, SR, SR, 4)).toBeNull();
    const looped = resampleThrough(desc({ loop: true, end: 3, sourceMap: u => u }), src, src, SR, SR, 3)!;
    expect(hzIn(looped.L, 1.2, 2.8)).toBeGreaterThan(440 * 0.97);   // still sounding after the 1 s buffer ended
  });
});
