import { describe, it, expect, vi } from 'vitest';
import { followPath } from '../../src/presets/followPath';

const tweens = (k: any[]) => k.slice(1);

describe('followPath(): a layer travelling along an SVG path, as keyframes', () => {
  it('starts with a set at the first point, then one linear step per sample', () => {
    const k = followPath({ d: 'M 0 0 L 100 0', duration: 2, frameRate: 10 }) as any[];
    expect(k[0]).toMatchObject({ at: 0, set: { x: 0, y: 0 } });
    expect(tweens(k)).toHaveLength(20);
    expect(tweens(k)[0]).toMatchObject({ at: 0, duration: 0.1, ease: 'none' });
    expect(tweens(k)[0].to.x).toBeCloseTo(5, 6);
    expect(tweens(k).at(-1).to.x).toBeCloseTo(100, 6);
    expect(tweens(k).at(-1).at + tweens(k).at(-1).duration).toBeCloseTo(2, 6);
  });

  it('`at` offsets the whole run', () => {
    const k = followPath({ d: 'M 0 0 L 100 0', at: 1.5, duration: 1, frameRate: 4 }) as any[];
    expect(k[0].at).toBe(1.5);
    expect(tweens(k)[0].at).toBe(1.5);
    expect(tweens(k).at(-1).at + tweens(k).at(-1).duration).toBeCloseTo(2.5, 6);
  });

  it('the ease shapes the progress along the path, not the keyframes', () => {
    const k = followPath({ d: 'M 0 0 L 100 0', duration: 2, frameRate: 10, ease: 'power2.in' }) as any[];
    expect(tweens(k)[9].to.x).toBeCloseTo(12.5, 4);        // half way in time = power2.in(0.5) = 0.125 of the way along
    expect(tweens(k)[9].ease).toBe('none');
    expect(tweens(k).at(-1).to.x).toBeCloseTo(100, 6);
  });

  it('from / to are fractions of the path: go only part of the way, or backwards', () => {
    const half = followPath({ d: 'M 0 0 L 100 0', duration: 1, frameRate: 4, from: 0.5, to: 1 }) as any[];
    expect(half[0].set.x).toBeCloseTo(50, 6);
    expect(tweens(half).at(-1).to.x).toBeCloseTo(100, 6);
    const back = followPath({ d: 'M 0 0 L 100 0', duration: 1, frameRate: 4, from: 1, to: 0 }) as any[];
    expect(back[0].set.x).toBeCloseTo(100, 6);
    expect(tweens(back).at(-1).to.x).toBeCloseTo(0, 6);
  });

  it('follows the shape of the path: an L turns the corner at the right time', () => {
    const k = followPath({ d: 'M 0 0 L 100 0 L 100 100', duration: 2, frameRate: 2 }) as any[];
    // 200 long, 4 samples: 50, 100 (the corner), 150, 200
    const pts = tweens(k).map(t => [t.to.x, t.to.y]);
    expect(pts[0]).toEqual([expect.closeTo(50, 6), expect.closeTo(0, 6)]);
    expect(pts[1]).toEqual([expect.closeTo(100, 6), expect.closeTo(0, 6)]);
    expect(pts[2]).toEqual([expect.closeTo(100, 6), expect.closeTo(50, 6)]);
    expect(pts[3]).toEqual([expect.closeTo(100, 6), expect.closeTo(100, 6)]);
  });

  it('a curve: every sample is on it (a circle through four arcs stays at its radius)', () => {
    const d = 'M 200 100 A 100 100 0 1 1 0 100 A 100 100 0 1 1 200 100';       // a circle of radius 100 around (100, 100)
    const k = followPath({ d, duration: 3, frameRate: 20 }) as any[];
    for (const t of tweens(k)) expect(Math.hypot(t.to.x - 100, t.to.y - 100)).toBeGreaterThan(97);
    for (const t of tweens(k)) expect(Math.hypot(t.to.x - 100, t.to.y - 100)).toBeLessThan(101);
  });

  it('a closed path comes back to where it began', () => {
    const k = followPath({ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z', duration: 2, frameRate: 8 }) as any[];
    expect(tweens(k).at(-1).to.x).toBeCloseTo(0, 6);
    expect(tweens(k).at(-1).to.y).toBeCloseTo(0, 6);
  });

  describe('orient', () => {
    it('without it only x and y are keyframed', () => {
      const k = followPath({ d: 'M 0 0 L 100 0', duration: 1, frameRate: 4 }) as any[];
      expect('rotation' in k[0].set).toBe(false);
      expect('rotation' in tweens(k)[0].to).toBe(false);
    });

    it('turns the layer to face the way it is going (degrees; down is 90) and `rotate` adds an offset', () => {
      const right = followPath({ d: 'M 0 0 L 100 0', duration: 1, frameRate: 4, orient: true }) as any[];
      expect(right[0].set.rotation).toBeCloseTo(0, 6);
      const down = followPath({ d: 'M 0 0 L 0 100', duration: 1, frameRate: 4, orient: true }) as any[];
      expect(down[0].set.rotation).toBeCloseTo(90, 6);
      const off = followPath({ d: 'M 0 0 L 0 100', duration: 1, frameRate: 4, orient: true, rotate: -90 }) as any[];
      expect(off[0].set.rotation).toBeCloseTo(0, 6);
    });

    it('never jumps by a turn: going round a circle the angle keeps growing instead of wrapping from 180 to −180', () => {
      const d = 'M 200 100 A 100 100 0 1 1 0 100 A 100 100 0 1 1 200 100';
      const k = followPath({ d, duration: 3, frameRate: 30, orient: true }) as any[];
      const angles = [k[0].set.rotation, ...tweens(k).map(t => t.to.rotation)];
      for (let i = 1; i < angles.length; i++) expect(Math.abs(angles[i] - angles[i - 1])).toBeLessThan(30);
      expect(Math.abs(angles.at(-1) - angles[0])).toBeGreaterThan(300);              // a full turn
    });
  });

  it('several sub-paths are walked one after the other', () => {
    const k = followPath({ d: 'M 0 0 L 100 0 M 0 50 L 100 50', duration: 2, frameRate: 2 }) as any[];
    const ys = tweens(k).map(t => t.to.y);
    expect(ys[0]).toBeCloseTo(0, 6);
    expect(ys.at(-1)).toBeCloseTo(50, 6);
  });

  it('rejects what cannot work, naming the option', () => {
    expect(() => followPath({ d: 'M 0 0 L 100 0', duration: 0 })).toThrow(/duration/);
    expect(() => followPath({ d: 'M 0 0 L 100 0', duration: 1, frameRate: 0 })).toThrow(/frameRate/);
    expect(() => followPath({ d: '', duration: 1 })).toThrow(/\bd\b/);
    expect(() => followPath({ d: 'M 5 5', duration: 1 })).toThrow(/path/);
    expect(() => followPath({ d: 'M 0 0 L 100 0', duration: 100, frameRate: 60 })).toThrow(/too many/);
    expect(() => followPath({ d: 'M 0 0 L 100 0', duration: 1, from: 2 })).toThrow(/from/);
  });

  it('warns about a misspelt option', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    followPath({ d: 'M 0 0 L 100 0', duration: 1, framerate: 30 } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/framerate.*frameRate/s));
    warn.mockRestore();
  });
});
