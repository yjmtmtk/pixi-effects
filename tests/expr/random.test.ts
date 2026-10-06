import { describe, it, expect } from 'vitest';
import { random, rand, noise } from '../../src/expr/random';

describe('seeded randomness', () => {
  it('rand(seed): the same seed always gives the same number in [0, 1); different seeds differ', () => {
    expect(rand(7)).toBe(rand(7));
    expect(rand(7)).not.toBe(rand(8));
    for (let i = 0; i < 500; i++) {
      const v = rand(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rand spreads out: 2000 seeds cover the range roughly evenly', () => {
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 2000; i++) buckets[Math.floor(rand(i) * 10)]++;
    for (const n of buckets) expect(n).toBeGreaterThan(130);   // 200 expected per bucket
  });

  it('random(seed): a repeatable stream, independent per seed', () => {
    const a = random(3), b = random(3), c = random(4);
    const sa = [a(), a(), a(), a()], sb = [b(), b(), b(), b()], sc = [c(), c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  it('noise(x, seed): deterministic, within [-1, 1], continuous, and different per seed', () => {
    expect(noise(1.37, 5)).toBe(noise(1.37, 5));
    expect(noise(1.37, 5)).not.toBe(noise(1.37, 6));
    let maxStep = 0, prev = noise(0, 1);
    for (let x = 0.01; x < 20; x += 0.01) {
      const v = noise(x, 1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      maxStep = Math.max(maxStep, Math.abs(v - prev));
      prev = v;
    }
    expect(maxStep).toBeLessThan(0.1);     // smooth: no jumps between neighbouring samples
  });

  it('noise is 0-seeded by default and handles negative / huge inputs without NaN', () => {
    expect(noise(2.5)).toBe(noise(2.5, 0));
    expect(Number.isFinite(noise(-3.2, 1))).toBe(true);
    expect(Number.isFinite(noise(1e9, 1))).toBe(true);
  });
});
