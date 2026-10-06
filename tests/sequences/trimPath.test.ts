import { describe, it, expect } from 'vitest';
import { trimPolylines, rectOutline, ellipseOutline, flattenSvgPath, type Polyline } from '../../src/sequences/trimPath';

const line = (pts: number[], closed = false): Polyline => ({ pts, closed });
const close = (a: number[], b: number[]) => { expect(a.length).toBe(b.length); a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6)); };

describe('trimPolylines — the part of an outline between two fractions of its length', () => {
  it('a straight line: 0.25 → 0.75 is the middle half', () => {
    const out = trimPolylines([line([0, 0, 100, 0])], 0.25, 0.75);
    expect(out).toHaveLength(1);
    close(out[0]!.pts, [25, 0, 75, 0]);
    expect(out[0]!.closed).toBe(false);
  });

  it('cuts inside a segment and keeps the corners it passes (an L shape)', () => {
    // 100 right then 100 down: total 200; 0 → 0.75 = 150 long = the whole first leg and half the second
    const out = trimPolylines([line([0, 0, 100, 0, 100, 100])], 0, 0.75);
    close(out[0]!.pts, [0, 0, 100, 0, 100, 50]);
  });

  it('start >= end, or an empty outline, is nothing', () => {
    expect(trimPolylines([line([0, 0, 100, 0])], 0.5, 0.5)).toEqual([]);
    expect(trimPolylines([line([0, 0, 100, 0])], 0.8, 0.2)).toEqual([]);
    expect(trimPolylines([], 0, 1)).toEqual([]);
  });

  it('start / end are clamped to 0..1', () => {
    close(trimPolylines([line([0, 0, 100, 0])], -3, 7)[0]!.pts, [0, 0, 100, 0]);
  });

  it('a closed outline counts its closing segment, and the whole of it stays closed', () => {
    const square = line([0, 0, 100, 0, 100, 100, 0, 100], true);        // perimeter 400
    const whole = trimPolylines([square], 0, 1);
    expect(whole).toHaveLength(1);
    expect(whole[0]!.closed).toBe(true);
    const most = trimPolylines([square], 0, 0.875);                     // 350: through the closing edge's first half
    expect(most[0]!.closed).toBe(false);
    close(most[0]!.pts, [0, 0, 100, 0, 100, 100, 0, 100, 0, 50]);
  });

  it('several sub-paths share one length: the range runs through them in order', () => {
    // two 100-long lines: 0.25 → 0.75 = the second half of the first and the first half of the second
    const out = trimPolylines([line([0, 0, 100, 0]), line([0, 50, 100, 50])], 0.25, 0.75);
    expect(out).toHaveLength(2);
    close(out[0]!.pts, [50, 0, 100, 0]);
    close(out[1]!.pts, [0, 50, 50, 50]);
  });
});

describe('outlines of the primitive shapes', () => {
  it('a rectangle starts at its top-left corner and goes clockwise; a corner radius adds arcs, not length 0', () => {
    const r = rectOutline(0, 0, 100, 50, 0);
    expect(r.closed).toBe(true);
    close(r.pts, [0, 0, 100, 0, 100, 50, 0, 50]);
    const rounded = rectOutline(0, 0, 100, 50, 10);
    expect(rounded.pts.length).toBeGreaterThan(16);
    expect(rounded.pts[0]).toBeCloseTo(10, 6);                         // starts after the rounded corner
  });

  it('an ellipse starts at 12 o\'clock and goes clockwise', () => {
    const e = ellipseOutline(0, 0, 40, 40);
    expect(e.closed).toBe(true);
    expect(e.pts[0]).toBeCloseTo(0, 6);
    expect(e.pts[1]).toBeCloseTo(-40, 6);
    const quarter = trimPolylines([e], 0, 0.25)[0]!.pts;               // a quarter turn ends at 3 o'clock
    expect(quarter[quarter.length - 2]).toBeCloseTo(40, 4);
    expect(quarter[quarter.length - 1]).toBeCloseTo(0, 4);
  });
});

describe('flattenSvgPath', () => {
  it('turns an SVG d (curves included) into polylines, keeping the closed flag per sub-path', () => {
    const out = flattenSvgPath('M 0 0 C 50 0 50 100 100 100 L 100 150 Z M 200 0 L 250 0');
    expect(out).toHaveLength(2);
    expect(out[0]!.closed).toBe(true);
    expect(out[0]!.pts.length).toBeGreaterThan(20);                    // the curve is sampled
    expect(out[1]).toEqual({ pts: [200, 0, 250, 0], closed: false });
  });
});
