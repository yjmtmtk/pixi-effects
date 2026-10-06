import { describe, it, expect, vi } from 'vitest';
import { orbit } from '../../src/presets/orbit';
import { homeDistance } from '../../src/space/math';
import { lintSequence } from '../../src/space/lint';
import { lintTiming } from '../../src/core/lint';
import type { SequenceSpec } from '../../src/types';

const DEG = Math.PI / 180;

describe('orbit()', () => {
  it('returns a camera layer that starts at the default camera distance, looking at the centre', () => {
    const c = orbit({ duration: 6, degrees: 40 });
    expect(c.type).toBe('camera');
    const R = homeDistance(720, 40);
    const init = c.initial as Record<string, number>;
    expect(init.lookAtX).toBe(640);
    expect(init.lookAtY).toBe(360);
    expect(init.lookAtZ).toBe(0);
    expect(init.y).toBe(360);
    // starts at -degrees/2
    expect(init.x).toBeCloseTo(640 + R * Math.sin(-20 * DEG), 6);
    expect(init.z).toBeCloseTo(R * Math.cos(-20 * DEG), 6);
  });

  it('samples the arc into short linear keyframes (one per 0.1 s) that end at +degrees/2', () => {
    const c = orbit({ duration: 6, degrees: 40, ease: 'none' });
    const kfs = c.keyframes!;
    expect(kfs).toHaveLength(60);
    expect(kfs[0]).toMatchObject({ at: 0, duration: 0.1, ease: 'none' });
    expect(kfs[59]!.at).toBeCloseTo(5.9, 9);
    const R = homeDistance(720, 40);
    const last = kfs[59]!.to as Record<string, number>;
    expect(last.x).toBeCloseTo(640 + R * Math.sin(20 * DEG), 6);
    expect(last.z).toBeCloseTo(R * Math.cos(20 * DEG), 6);
    // the middle of a linear sweep is straight ahead
    const mid = kfs[29]!.to as Record<string, number>;
    expect(Math.abs(mid.x - (640 + R * Math.sin(-20 * DEG + 40 * DEG * 30 / 60 - 0 * DEG)))).toBeLessThan(1e-6);
  });

  it('applies the easing to the sweep angle, not to each segment', () => {
    const lin = orbit({ duration: 2, degrees: 60, ease: 'none' }).keyframes!;
    const eased = orbit({ duration: 2, degrees: 60, ease: 'power2.in' }).keyframes!;
    const xAt = (k: typeof lin, i: number) => (k[i]!.to as Record<string, number>).x;
    expect(xAt(eased, 4)).toBeLessThan(xAt(lin, 4));      // power2.in starts slow: less sweep done early
    expect(xAt(eased, 19)).toBeCloseTo(xAt(lin, 19), 6);  // both end at the same angle
    expect(eased.every(k => k.ease === 'none')).toBe(true);
  });

  it('honours start, radius, centre, canvas size, at and name; supports a sweep either way', () => {
    const c = orbit({ duration: 3, degrees: -90, start: 45, radius: 500, center: [100, 200], width: 800, height: 600, at: 2, name: 'cam' });
    expect(c).toMatchObject({ name: 'cam', at: 2, duration: 3 });
    const init = c.initial as Record<string, number>;
    expect(init.x).toBeCloseTo(100 + 500 * Math.sin(45 * DEG), 6);
    expect(init.z).toBeCloseTo(500 * Math.cos(45 * DEG), 6);
    expect(init.lookAtX).toBe(100);
    expect(init.lookAtY).toBe(200);
    const last = c.keyframes!.slice(-1)[0]!.to as Record<string, number>;
    expect(last.x).toBeCloseTo(100 + 500 * Math.sin(-45 * DEG), 6);
  });

  it('can carry fov, and the result lints clean', () => {
    const c = orbit({ duration: 4, degrees: 30, fov: 50 });
    expect((c.initial as Record<string, number>).fov).toBe(50);
    expect((c.initial as Record<string, number>).z).toBeCloseTo(homeDistance(720, 50) * Math.cos(-15 * DEG), 6);
    const w: string[] = [];
    lintSequence(c as SequenceSpec, m => w.push(m));
    lintTiming(c as SequenceSpec, 10, m => w.push(m));
    expect(w).toEqual([]);
  });

  it('rejects a non-positive duration', () => {
    expect(() => orbit({ duration: 0, degrees: 10 })).toThrow(/duration/);
    vi.fn();
  });
});
