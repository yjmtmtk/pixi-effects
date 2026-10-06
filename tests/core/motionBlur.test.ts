import { describe, it, expect, vi } from 'vitest';
import { resolveMotionBlur, blurTimes } from '../../src/core/motionBlur';

describe('resolveMotionBlur', () => {
  it('true is 8 samples at a 180° shutter; a number is the sample count; an object fills in the rest', () => {
    expect(resolveMotionBlur(true, 'x')).toEqual({ samples: 8, shutter: 0.5 });
    expect(resolveMotionBlur(12, 'x')).toEqual({ samples: 12, shutter: 0.5 });
    expect(resolveMotionBlur({ shutter: 0.25 }, 'x')).toEqual({ samples: 8, shutter: 0.25 });
    expect(resolveMotionBlur({ samples: 16, shutter: 1 }, 'x')).toEqual({ samples: 16, shutter: 1 });
  });

  it('false, undefined and null are off', () => {
    expect(resolveMotionBlur(false, 'x')).toBeNull();
    expect(resolveMotionBlur(undefined, 'x')).toBeNull();
    expect(resolveMotionBlur(null as never, 'x')).toBeNull();
  });

  it('says which option is wrong', () => {
    expect(() => resolveMotionBlur(1, 'movie.render()')).toThrow(/movie\.render\(\).*samples.*2/s);
    expect(() => resolveMotionBlur(100, 'x')).toThrow(/samples/);
    expect(() => resolveMotionBlur({ samples: 4.5 }, 'x')).toThrow(/samples/);
    expect(() => resolveMotionBlur({ shutter: 0 }, 'x')).toThrow(/shutter/);
    expect(() => resolveMotionBlur({ shutter: 2 }, 'x')).toThrow(/shutter/);
  });

  it('warns about a misspelt key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveMotionBlur({ sample: 4 } as never, 'x');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/sample.*samples/s));
    warn.mockRestore();
  });
});

describe('blurTimes: the moments one frame is exposed over', () => {
  it('are spread evenly over the shutter interval, centred on the frame time', () => {
    // frame 30 at 30 fps = 1 s; half-open shutter 0.5 frame = 1/60 s wide; 4 samples at the middles of 4 equal slices
    const t = blurTimes(30, 30, { samples: 4, shutter: 0.5 }, 10);
    expect(t).toHaveLength(4);
    const width = 0.5 / 30;
    [-3, -1, 1, 3].forEach((k, i) => expect(t[i]).toBeCloseTo(1 + (k / 8) * width, 9));
  });

  it('their mean is the frame time', () => {
    const t = blurTimes(50, 24, { samples: 7, shutter: 1 }, 10);
    expect(t.reduce((a, b) => a + b, 0) / t.length).toBeCloseTo(50 / 24, 9);
  });

  it('never leave the movie: clamped to 0 and to the duration', () => {
    const first = blurTimes(0, 30, { samples: 4, shutter: 1 }, 2);
    expect(Math.min(...first)).toBe(0);
    const last = blurTimes(60, 30, { samples: 4, shutter: 1 }, 2);
    expect(Math.max(...last)).toBeLessThanOrEqual(2);
  });
});
