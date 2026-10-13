import { describe, it, expect } from 'vitest';
import { samplePath } from '../../src/core/pathSample';

describe('samplePath(d): walk an SVG path by length (for draw-on lines, text on a path, things that follow a curve)', () => {
  const L = 'M 0 0 L 100 0 L 100 100';

  it('length is the arc length of all the sub-paths; at(u) is the point and the heading (radians) a fraction u of the way along', () => {
    const p = samplePath(L);
    expect(p.length).toBeCloseTo(200, 6);
    const a = p.at(0.25), b = p.at(0.75);
    expect([a.x, a.y, a.angle]).toEqual([50, 0, 0]);
    expect(b.x).toBeCloseTo(100, 6); expect(b.y).toBeCloseTo(50, 6); expect(b.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('u is clamped to 0..1', () => {
    const p = samplePath(L);
    expect(p.at(-1)).toMatchObject({ x: 0, y: 0 });
    expect(p.at(5)).toMatchObject({ x: 100, y: 100 });
  });

  it('several sub-paths are walked in order as one length', () => {
    const p = samplePath('M 0 0 L 10 0 M 0 20 L 10 20');
    expect(p.length).toBeCloseTo(20, 6);
    expect(p.at(0.75).y).toBeCloseTo(20, 6);
    expect(p.at(0.75).x).toBeCloseTo(5, 6);
  });

  it('trim(start, end) is the part between two fractions, as flat [x, y, x, y, …] pieces ready for moveTo / lineTo; no arguments is the whole path', () => {
    const p = samplePath(L);
    expect(p.trim(0, 0.75)).toEqual([[0, 0, 100, 0, 100, 50]]);
    expect(p.trim()).toEqual([[0, 0, 100, 0, 100, 100]]);
    expect(p.trim(0.5, 0.5)).toEqual([]);
  });

  it('a path with no length is a sentence, not a NaN picture', () => {
    expect(() => samplePath('M 5 5')).toThrow(/samplePath.*no length/);
    expect(() => samplePath('')).toThrow(/samplePath/);
  });

  it('a closed sub-path trimmed whole still has its closing side (the draw-on line of a rectangle must not lose its last edge when it reaches 1)', () => {
    const p = samplePath('M 0 0 L 100 0 L 100 100 L 0 100 Z');
    expect(p.length).toBe(400);
    expect(p.trim(0, 1)).toEqual([[0, 0, 100, 0, 100, 100, 0, 100, 0, 0]]);
    const almost = p.trim(0, 0.999)[0]!;
    expect(almost.slice(-2)[0]).toBe(0);                                   // both end on the way back to the start
  });
});
