import { describe, it, expect } from 'vitest';
import { spectralCentroid } from '../../src/core/spectrum';

const SR = 48000;
const sine = (hz: number, seconds = 0.5) => Float32Array.from({ length: SR * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR));

describe('spectralCentroid', () => {
  it('is the frequency of a pure tone', () => {
    expect(spectralCentroid(sine(1000), SR)).toBeGreaterThan(950);
    expect(spectralCentroid(sine(1000), SR)).toBeLessThan(1100);
    expect(spectralCentroid(sine(4000), SR)).toBeGreaterThan(3850);
    expect(spectralCentroid(sine(4000), SR)).toBeLessThan(4200);
  });
  it('sits between two tones of equal level, measures only the given range, and is 0 for silence', () => {
    const hi = sine(3000);
    const mix = sine(500).map((x, i) => x + hi[i]!);
    const c = spectralCentroid(mix, SR);
    expect(c).toBeGreaterThan(1400);
    expect(c).toBeLessThan(2100);
    const two = new Float32Array(SR);
    two.set(sine(500), 0);
    two.set(sine(3000), SR / 2);
    expect(spectralCentroid(two, SR, SR / 2, SR)).toBeGreaterThan(2800);
    expect(spectralCentroid(new Float32Array(SR), SR)).toBe(0);
  });
});
