// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { playSpan } from '../../src/core/audioRemap';

describe('playSpan: when a (maybe remapped) sound plays, in the movie\'s time', () => {
  it('a sound without a warp plays from start to end', () => {
    expect(playSpan({ start: 1, end: 3 }, 10)).toEqual({ start: 1, end: 3 });
  });
  it('a warp of 2x: local time 0..4 happens in movie time 0..2', () => {
    const s = playSpan({ start: 0, end: 4, warp: t => 2 * t }, 10);
    expect(s.start).toBeCloseTo(0, 2);
    expect(s.end).toBeCloseTo(2, 2);
  });
  it('a reversed warp: the sound with local time 1..2 plays when the clock is there', () => {
    const s = playSpan({ start: 1, end: 2, warp: t => 4 - t }, 10);   // local 4 at movie 0, local 1 at movie 3
    expect(s.start).toBeCloseTo(2, 2);
    expect(s.end).toBeCloseTo(3, 2);
  });
  it('never audible: an empty span at the end', () => {
    expect(playSpan({ start: 5, end: 6, warp: () => 0 }, 4)).toEqual({ start: 4, end: 4 });
  });
});
