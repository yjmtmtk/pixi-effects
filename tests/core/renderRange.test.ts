import { describe, it, expect } from 'vitest';
import { resolveRange, sliceChannels, resolveRenderOptions } from '../../src/core/renderRange';

const ctx = { frameRate: 30, totalFrames: 300, duration: 10, rows: [
  { name: 'title', start: 1, end: 4, depth: 0 }, { name: 'inner', start: 2, end: 3, depth: 1 }, { name: 'text#2', start: 0, end: 10, depth: 0 },
] };

describe('resolveRange', () => {
  it('no range = every frame, as before (0 … totalFrames), not partial', () => {
    expect(resolveRange(undefined, ctx)).toEqual({ fromFrame: 0, toFrame: 300, fromSec: 0, toSec: 10, partial: false });
  });
  it('seconds become frames; the end frame is included like the full export does', () => {
    const r = resolveRange([2, 5], ctx);
    expect(r).toMatchObject({ fromFrame: 60, toFrame: 150, fromSec: 2, toSec: 5, partial: true });
  });
  it('a whole-movie range is not partial (the audio is not cut or faded)', () => {
    expect(resolveRange([0, 10], ctx).partial).toBe(false);
  });
  it('a name is that layer\'s span (top-level layers; the first match)', () => {
    expect(resolveRange('title', ctx)).toMatchObject({ fromFrame: 30, toFrame: 120, partial: true });
  });
  it('says what was wrong: unknown name (listing the names), backwards, past the end, shorter than a frame, not numbers', () => {
    expect(() => resolveRange('nope', ctx)).toThrow(/no layer named "nope".*title/s);
    expect(() => resolveRange('inner', ctx)).toThrow(/no layer named "inner"/);          // only top-level layers
    expect(() => resolveRange([5, 2], ctx)).toThrow(/must start before it ends/);
    expect(() => resolveRange([2, 12], ctx)).toThrow(/10 s long|past the end/);
    expect(() => resolveRange([2, 2.01], ctx)).toThrow(/shorter than one frame/);
    expect(() => resolveRange(['a', 3] as never, ctx)).toThrow(/numbers/);
  });
});

describe('sliceChannels', () => {
  const sr = 1000, ch = [Float32Array.from({ length: 4000 }, () => 1)];
  it('cuts exactly from..to seconds', () => {
    const [c] = sliceChannels(ch, sr, 1, 2.5, { fade: 0 });
    expect(c!.length).toBe(1500);
  });
  it('fades the cut edges only (10 ms), and not an edge that is the movie\'s own start or end', () => {
    const [both] = sliceChannels(ch, sr, 1, 2, { fade: 0.01 });
    expect(both![0]).toBe(0); expect(both![both!.length - 1]).toBeLessThan(0.2); expect(both![500]).toBe(1);
    const [noIn] = sliceChannels(ch, sr, 0, 2, { fade: 0.01, fadeIn: false });
    expect(noIn![0]).toBe(1);
  });
  it('past the end of the audio is silence, not an error', () => {
    const [c] = sliceChannels(ch, sr, 3.5, 4.5, { fade: 0 });
    expect(c!.length).toBe(1000); expect(c![0]).toBe(1); expect(c![600]).toBe(0);
  });
});

describe('resolveRenderOptions (draft)', () => {
  it('without draft: nothing changes (scale 1, the caller\'s bitrate and motion blur)', () => {
    expect(resolveRenderOptions({})).toEqual({ scale: 1, bitrate: undefined, motionBlur: undefined });
    expect(resolveRenderOptions({ video: { bitrate: 'very-high' }, motionBlur: false })).toEqual({ scale: 1, bitrate: 'very-high', motionBlur: false });
  });
  it('draft = half size, low quality, no motion blur', () => {
    expect(resolveRenderOptions({ draft: true })).toEqual({ scale: 0.5, bitrate: 'low', motionBlur: false });
  });
  it('what the caller says wins over the draft', () => {
    expect(resolveRenderOptions({ draft: true, scale: 0.25, video: { bitrate: 'high' }, motionBlur: { samples: 4 } as never }))
      .toEqual({ scale: 0.25, bitrate: 'high', motionBlur: { samples: 4 } });
  });
  it('a scale outside (0, 1] is an error that says so', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => resolveRenderOptions({ scale: bad })).toThrow(/scale must be above 0 and at most 1/);
  });
});
