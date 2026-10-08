import { describe, it, expect } from 'vitest';
import { sourceLookup, FRAME_EPS } from '../../src/core/sourceTime';

describe('sourceLookup', () => {
  it('a time that is a frame boundary up to float noise picks that frame, not the one before', () => {
    for (let k = 0; k < 90; k++) {
      const t = k / 30;
      const noisy = t - 1e-12;                      // what a tween can hand over at the boundary
      expect(Math.floor(sourceLookup(noisy, 3, false) * 30 + 1e-9)).toBe(k);
    }
  });
  it('does not move a time that sits well inside a frame', () => {
    expect(sourceLookup(1.0166, 3, false)).toBeCloseTo(1.0166 + FRAME_EPS, 12);
  });
  it('without loop it stays inside the file (negative and past the end)', () => {
    expect(sourceLookup(-1, 3, false)).toBe(0);
    expect(sourceLookup(9, 3, false)).toBe(3);
  });
  it('with loop it wraps, a negative time too', () => {
    expect(sourceLookup(3.5, 3, true)).toBeCloseTo(0.5 + FRAME_EPS, 9);
    expect(sourceLookup(-0.5, 3, true)).toBeCloseTo(2.5 + FRAME_EPS, 9);
  });
  it('an unknown length (0) only refuses negative times', () => {
    expect(sourceLookup(-2, 0, false)).toBe(0);
    expect(sourceLookup(2, 0, true)).toBe(2);
  });
});
