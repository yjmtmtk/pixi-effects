import { describe, it, expect } from 'vitest';
import { buildScope } from '../../src/expr/Scope';

const fakeSeq = (overrides: Record<string, unknown> = {}) => ({
  intrinsicWidth: 200,
  intrinsicHeight: 100,
  at: 0,
  duration: 5,
  parent: null,
  ...overrides,
}) as Parameters<typeof buildScope>[0];

const fakeRoot = { width: 1920, height: 1080, duration: 10 };

describe('buildScope', () => {
  it('exposes w/h from sequence intrinsic size', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.w).toBe(200);
    expect(s.h).toBe(100);
  });
  it('exposes W/H from immediate parent', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.W).toBe(800);
    expect(s.H).toBe(600);
  });
  it('exposes GW/GH from root', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.GW).toBe(1920);
    expect(s.GH).toBe(1080);
  });
  it('contain = min(W/w, H/h)', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.contain).toBe(4);
  });
  it('cover = max(W/w, H/h)', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.cover).toBe(6);
  });
  it('contain handles tall image in wide parent', () => {
    const seq = fakeSeq({ intrinsicWidth: 100, intrinsicHeight: 800 });
    const s = buildScope(seq, { width: 1920, height: 1080, duration: 10 }, fakeRoot);
    expect(s.contain).toBeCloseTo(1.35);
  });
  it('exposes t/d/T', () => {
    const seq = fakeSeq({ at: 2, duration: 3 });
    const s = buildScope(seq, { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.t).toBe(2);
    expect(s.d).toBe(3);
    expect(s.T).toBe(10);
  });
});
