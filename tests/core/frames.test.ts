import { describe, it, expect } from 'vitest';
import { pickFrames, sheetLayout } from '../../src/core/frames';

describe('pickFrames', () => {
  it('spreads count frames evenly from the first to the last frame', () => {
    expect(pickFrames(180, 4)).toEqual([0, 60, 120, 180]);
    expect(pickFrames(100, 3)).toEqual([0, 50, 100]);
  });
  it('clamps, dedupes and handles tiny inputs', () => {
    expect(pickFrames(2, 6)).toEqual([0, 1, 2]);
    expect(pickFrames(10, 1)).toEqual([0]);
    expect(pickFrames(0, 5)).toEqual([0]);
  });
});

describe('sheetLayout', () => {
  it('arranges n cells in rows of `columns`, each cell keeping the source aspect plus a label strip', () => {
    const l = sheetLayout(6, 3, 480, 1280, 720, 24);
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(2);
    expect(l.cellW).toBe(480);
    expect(l.cellH).toBe(270);                       // 480 * 720 / 1280
    expect(l.width).toBe(3 * 480);
    expect(l.height).toBe(2 * (270 + 24));
    expect(l.positions).toHaveLength(6);
    expect(l.positions[0]).toEqual({ x: 0, y: 0 });
    expect(l.positions[4]).toEqual({ x: 480, y: 270 + 24 });
  });
  it('never makes more columns than cells', () => {
    const l = sheetLayout(2, 5, 300, 1000, 500, 20);
    expect(l.cols).toBe(2);
    expect(l.rows).toBe(1);
  });
});
