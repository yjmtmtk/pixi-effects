import { describe, it, expect } from 'vitest';
import { onionAlphas, onionTimes } from '../../src/core/onion';

describe('onionTimes', () => {
  it('count times from `from` to `to`, both included', () => {
    expect(onionTimes(1, 3, 5)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(onionTimes(2, 2, 1)).toEqual([2]);
  });
});
describe('onionAlphas', () => {
  it('drawing each frame with these alphas, one over the other, gives the weighted mean: the first is opaque', () => {
    const a = onionAlphas(4, 0.25);
    expect(a[0]).toBe(1);
    // the final weight of frame i is a_i * product over later frames of (1 - a_j)
    const w = a.map((_, i) => a[i]! * a.slice(i + 1).reduce((p, x) => p * (1 - x), 1));
    expect(w.reduce((p, x) => p + x, 0)).toBeCloseTo(1, 10);
    const raw = [0.25, 0.5, 0.75, 1], total = raw.reduce((p, y) => p + y, 0);
    w.forEach((x, i) => expect(x).toBeCloseTo(raw[i]! / total, 10));
  });
  it('later frames weigh more in the result (the movement reads forwards); one frame is just itself', () => {
    const a = onionAlphas(5, 0.25);
    const w = a.map((_, i) => a[i]! * a.slice(i + 1).reduce((p, x) => p * (1 - x), 1));
    for (let i = 1; i < w.length; i++) expect(w[i]!).toBeGreaterThan(w[i - 1]!);
    expect(onionAlphas(1)).toEqual([1]);
  });
});
