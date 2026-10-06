import { describe, it, expect } from 'vitest';
import { resample, buildMorph, morphAt } from '../../src/sequences/morphPath';
import type { Polyline } from '../../src/sequences/trimPath';

const line = (pts: number[], closed = false): Polyline => ({ pts, closed });
const close = (a: number[], b: number[], digits = 6) => { expect(a.length).toBe(b.length); a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits)); };
const square = (...corner: [number, number][]) => line(corner.flat(), true);
const SQ = [[0, 0], [100, 0], [100, 100], [0, 100]] as [number, number][];

describe('resample: n points spread evenly by length', () => {
  it('an open line includes both ends', () => {
    close(resample(line([0, 0, 100, 0]), 5), [0, 0, 25, 0, 50, 0, 75, 0, 100, 0]);
  });
  it('a closed outline goes all the way round and does not repeat its first point', () => {
    close(resample(square(...SQ), 8), [0, 0, 50, 0, 100, 0, 100, 50, 100, 100, 50, 100, 0, 100, 0, 50]);
  });
  it('a path with no length is n copies of its point', () => {
    close(resample(line([5, 5, 5, 5]), 3), [5, 5, 5, 5, 5, 5]);
  });
});

describe('buildMorph / morphAt', () => {
  const sum = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0);

  it('t = 0 is the first outline, t = 1 the second, t = 0.5 the points half way between', () => {
    const pairs = buildMorph([line([0, 0, 100, 0])], [line([0, 100, 100, 200])], 5);
    close(morphAt(pairs, 0)[0]!.pts, [0, 0, 25, 0, 50, 0, 75, 0, 100, 0]);
    close(morphAt(pairs, 1)[0]!.pts, [0, 100, 25, 125, 50, 150, 75, 175, 100, 200]);
    close(morphAt(pairs, 0.5)[0]!.pts, [0, 50, 25, 62.5, 50, 75, 75, 87.5, 100, 100]);
  });

  it('a closed outline that starts at another corner does not twist: the same square morphs to itself', () => {
    const a = square(...SQ);
    const b = square([100, 100], [0, 100], [0, 0], [100, 0]);                      // same corners, same direction, another start
    const mid = morphAt(buildMorph([a], [b], 64), 0.5)[0]!.pts;
    expect(sum(mid, resample(a, 64))).toBeLessThan(1e-6);
  });

  it('nor when it runs the other way round', () => {
    const a = square(...SQ);
    const b = square([0, 0], [0, 100], [100, 100], [100, 0]);                      // the same square, counter-clockwise
    const mid = morphAt(buildMorph([a], [b], 64), 0.5)[0]!.pts;
    expect(sum(mid, resample(a, 64))).toBeLessThan(1e-6);
  });

  it('stays closed only when both are closed', () => {
    expect(buildMorph([square(...SQ)], [square(...SQ)], 8)[0]!.closed).toBe(true);
    expect(buildMorph([square(...SQ)], [line([0, 0, 50, 50])], 8)[0]!.closed).toBe(false);
  });

  it('an extra sub-path grows out of its own centre (or shrinks into it)', () => {
    const one = [square(...SQ)];
    const two = [square(...SQ), square([200, 200], [300, 200], [300, 300], [200, 300])];
    const grow = buildMorph(one, two, 8);
    expect(grow).toHaveLength(2);
    const start = morphAt(grow, 0)[1]!.pts;
    for (let i = 0; i < start.length; i += 2) { expect(start[i]).toBeCloseTo(250, 6); expect(start[i + 1]).toBeCloseTo(250, 6); }
    const shrink = buildMorph(two, one, 8);
    const end = morphAt(shrink, 1)[1]!.pts;
    for (let i = 0; i < end.length; i += 2) { expect(end[i]).toBeCloseTo(250, 6); expect(end[i + 1]).toBeCloseTo(250, 6); }
  });

  it('either side empty is nothing to morph', () => {
    expect(buildMorph([], [line([0, 0, 1, 1])], 8)).toEqual([]);
    expect(buildMorph([line([0, 0, 1, 1])], [], 8)).toEqual([]);
  });

  it('t outside 0..1 is clamped', () => {
    const pairs = buildMorph([line([0, 0, 100, 0])], [line([0, 100, 100, 100])], 3);
    close(morphAt(pairs, -2)[0]!.pts, [0, 0, 50, 0, 100, 0]);
    close(morphAt(pairs, 5)[0]!.pts, [0, 100, 50, 100, 100, 100]);
  });
});
