import { describe, it, expect } from 'vitest';
import { pickActiveCamera, findOverlap } from '../../src/space/camera';
import { collectPropKeys } from '../../src/space/specKeys';

const win = (start: number, end: number) => ({ start, end });

describe('pickActiveCamera', () => {
  const cuts = [win(0, 5), win(5, 10)];
  it('picks the camera whose lifespan covers t ([start, end))', () => {
    expect(pickActiveCamera(cuts, 0, 10)).toBe(cuts[0]);
    expect(pickActiveCamera(cuts, 4.99, 10)).toBe(cuts[0]);
    expect(pickActiveCamera(cuts, 5, 10)).toBe(cuts[1]);
  });
  it('keeps the last camera active on the final frame (t === comp end)', () => {
    expect(pickActiveCamera(cuts, 10, 10)).toBe(cuts[1]);
  });
  it('does not extend a camera that ends before the comp end', () => {
    const early = [win(2, 4)];
    expect(pickActiveCamera(early, 4, 10)).toBeNull();
    expect(pickActiveCamera(early, 1, 10)).toBeNull();
  });
  it('overlap: the last-listed (top-most) camera wins', () => {
    const o = [win(0, 8), win(4, 10)];
    expect(pickActiveCamera(o, 5, 10)).toBe(o[1]);
    expect(pickActiveCamera(o, 2, 10)).toBe(o[0]);
  });
  it('no cameras -> null', () => {
    expect(pickActiveCamera([], 1, 10)).toBeNull();
  });
});

describe('findOverlap', () => {
  it('returns the first overlapping pair of indices', () => {
    expect(findOverlap([win(0, 5), win(4, 9)])).toEqual([0, 1]);
  });
  it('touching windows are not an overlap (a camera cut)', () => {
    expect(findOverlap([win(0, 5), win(5, 9)])).toBeNull();
  });
  it('none / single -> null', () => {
    expect(findOverlap([])).toBeNull();
    expect(findOverlap([win(0, 3)])).toBeNull();
  });
});

describe('collectPropKeys', () => {
  it('gathers keys from initial and every keyframe bag', () => {
    const keys = collectPropKeys({
      initial: { x: 1, z: 2 },
      keyframes: [{ at: 0, to: { fov: 50 } }, { at: 1, from: { lookAtX: 1 }, to: { lookAtX: 2 } }, { at: 2, set: { y: 3 } }],
    });
    expect([...keys].sort()).toEqual(['fov', 'lookAtX', 'x', 'y', 'z']);
  });
  it('handles missing initial / keyframes', () => {
    expect(collectPropKeys({}).size).toBe(0);
  });
});
