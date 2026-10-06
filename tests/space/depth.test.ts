import { describe, it, expect } from 'vitest';
import { assignDepthOrder, type DepthItem } from '../../src/space/depth';

const item = (stackIndex: number, threeD: boolean, depth = 0): DepthItem => ({ stackIndex, threeD, depth });

describe('assignDepthOrder', () => {
  it('without threeD items every zIndex equals its stack index', () => {
    expect(assignDepthOrder([item(0, false), item(1, false), item(2, false)])).toEqual([0, 1, 2]);
  });

  it('a run of threeD items is drawn farthest-first over the same index slots', () => {
    // depths: idx0=100 (near), idx1=300 (far), idx2=200 -> far first: idx1, idx2, idx0
    expect(assignDepthOrder([item(0, true, 100), item(1, true, 300), item(2, true, 200)])).toEqual([2, 0, 1]);
  });

  it('a non-threeD layer between threeD layers splits the groups', () => {
    const z = assignDepthOrder([item(0, true, 100), item(1, false), item(2, true, 50), item(3, true, 80)]);
    // run [0] stays; run [2,3]: idx3 (80, farther) takes slot 2, idx2 (50) takes slot 3
    expect(z).toEqual([0, 1, 3, 2]);
  });

  it('ties keep stack order', () => {
    expect(assignDepthOrder([item(0, true, 10), item(1, true, 10)])).toEqual([0, 1]);
  });

  it('non-finite depth is treated as 0 (deterministic, no NaN sort)', () => {
    // NaN counts as 0, which is nearer than 5, so idx1 (farther) is drawn first.
    expect(assignDepthOrder([item(0, true, NaN), item(1, true, 5)])).toEqual([1, 0]);
  });

  it('preserves non-contiguous stack indices (e.g. skipped audio/camera layers)', () => {
    expect(assignDepthOrder([item(0, true, 1), item(3, true, 9)])).toEqual([3, 0]);
  });
});
