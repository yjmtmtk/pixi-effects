import { describe, it, expect, vi, afterEach } from 'vitest';
import { PureTimeline } from '../../src/core/pure/PureTimeline';
import { setNow } from '../../src/core/timelineEngine';

/** A filter like pixi-filters' RGBSplitFilter: `red` is a point object (`{ x, y }`) the filter reads when it draws. */
const splitLike = () => ({ apply() {}, red: { x: 0, y: 0 }, green: { x: 0, y: 0 } });

afterEach(() => vi.restoreAllMocks());

describe('a point option of a filter moves: "red.x" is a key like any other', () => {
  it('tweens the leaf of the point, and leaves the other leaf alone', () => {
    const f = splitLike();
    const tl = new PureTimeline();
    tl.to(f, { 'red.x': 10, duration: 1, ease: 'none' }, 0);
    tl.time(0.5);
    expect(f.red.x).toBeCloseTo(5, 5);
    expect(f.red.y).toBe(0);
    tl.time(1);
    expect(f.red.x).toBe(10);
  });

  it('works for set and fromTo too, for the second leaf, and for another point', () => {
    const f = splitLike();
    const tl = new PureTimeline();
    tl.set(f, { 'red.y': 4, 'green.x': 3 }, 0);
    tl.fromTo(f, { 'red.x': 0 }, { 'red.x': 8, duration: 2, ease: 'none' }, 1);
    tl.time(2);
    expect(f.red).toEqual({ x: 4, y: 4 });
    expect(f.green).toEqual({ x: 3, y: 0 });
    tl.time(0.5);
    expect(f.red.y).toBe(4);
  });

  it('no property called "red.x" is ever written on the filter', () => {
    const f = splitLike();
    const tl = new PureTimeline();
    tl.to(f, { 'red.x': 5, duration: 1 }, 0);
    tl.time(1);
    expect(Object.keys(f)).not.toContain('red.x');
  });

  it('a path that does not lead anywhere is said once, and ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = splitLike();
    const tl = new PureTimeline();
    tl.to(f, { 'blue.x': 5, duration: 1 }, 0);
    tl.time(0.5);
    tl.time(1);
    expect(Object.keys(f)).not.toContain('blue.x');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/blue\.x/);
  });
});

describe('a dotted key in initial (or a set written at once) is a path too', () => {
  it('setNow writes the leaf of the point, not a property called "red.x"', () => {
    const f = splitLike();
    setNow(f, { 'red.x': 5, 'green.y': 2 });
    expect(f.red).toEqual({ x: 5, y: 0 });
    expect(f.green).toEqual({ x: 0, y: 2 });
    expect(Object.keys(f)).not.toContain('red.x');
  });

  it('a path that leads nowhere is said once and ignored, here too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = splitLike();
    setNow(f, { 'nothing.x': 5 });
    setNow(f, { 'nothing.x': 6 });
    expect(Object.keys(f)).not.toContain('nothing.x');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
