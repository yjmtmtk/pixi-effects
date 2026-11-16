import { describe, it, expect, vi } from 'vitest';
import { orbit } from '../../src/presets/orbit';
import { homeDistance } from '../../src/space/math';
import { lintSequence } from '../../src/space/lint';
import { lintTiming } from '../../src/core/lint';
import type { LayerSpec } from '../../src/types';
import { evaluateExpr } from '../../src/expr/Parser';

const DEG = Math.PI / 180;
// the centre and the default radius are expressions of the movie's size: read them at a size
const at = (W: number, H: number) => (o: unknown): Record<string, number> => Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? evaluateExpr(v, { W, H, w: W, h: H }) : v as number]));
const v720 = at(1280, 720);

describe('orbit()', () => {
  it('returns a camera layer that starts at the default camera distance, looking at the centre', () => {
    const c = orbit({ duration: 6, degrees: 40 });
    expect(c.type).toBe('camera');
    const R = homeDistance(720, 40);
    const init = v720(c.initial);
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
    const last = v720(kfs[59]!.to);
    expect(last.x).toBeCloseTo(640 + R * Math.sin(20 * DEG), 6);
    expect(last.z).toBeCloseTo(R * Math.cos(20 * DEG), 6);
    // the middle of a linear sweep is straight ahead
    const mid = v720(kfs[29]!.to);
    expect(Math.abs(mid.x - (640 + R * Math.sin(-20 * DEG + 40 * DEG * 30 / 60 - 0 * DEG)))).toBeLessThan(1e-6);
  });

  it('applies the easing to the sweep angle, not to each segment', () => {
    const lin = orbit({ duration: 2, degrees: 60, ease: 'none' }).keyframes!;
    const eased = orbit({ duration: 2, degrees: 60, ease: 'power2.in' }).keyframes!;
    const xAt = (k: typeof lin, i: number) => v720(k[i]!.to).x!;
    expect(xAt(eased, 4)).toBeLessThan(xAt(lin, 4));      // power2.in starts slow: less sweep done early
    expect(xAt(eased, 19)).toBeCloseTo(xAt(lin, 19), 6);  // both end at the same angle
    expect(eased.every(k => k.ease === 'none')).toBe(true);
  });

  it('honours startAngle, radius, centre, at and name; supports a sweep either way', () => {
    const c = orbit({ duration: 3, degrees: -90, startAngle: 45, radius: 500, center: [100, 200], at: 2, name: 'cam' });
    expect(c).toMatchObject({ name: 'cam', at: 2, duration: 3 });
    const init = v720(c.initial);
    expect(init.x).toBeCloseTo(100 + 500 * Math.sin(45 * DEG), 6);
    expect(init.z).toBeCloseTo(500 * Math.cos(45 * DEG), 6);
    expect(init.lookAtX).toBe(100);
    expect(init.lookAtY).toBe(200);
    const last = v720(c.keyframes!.slice(-1)[0]!.to);
    expect(last.x).toBeCloseTo(100 + 500 * Math.sin(-45 * DEG), 6);
  });

  it('can carry fov, and the result lints clean', () => {
    const c = orbit({ duration: 4, degrees: 30, fov: 50 });
    expect(v720(c.initial).fov).toBe(50);
    expect(v720(c.initial).z).toBeCloseTo(homeDistance(720, 50) * Math.cos(-15 * DEG), 6);
    const w: string[] = [];
    lintSequence(c as LayerSpec, m => w.push(m));
    lintTiming(c as LayerSpec, 10, m => w.push(m));
    expect(w).toEqual([]);
  });

  it('the centre and the default radius follow the movie\'s size: a 1920 × 1080 movie orbits its own middle', () => {
    const init = at(1920, 1080)(orbit({ duration: 6, degrees: 0 }).initial);
    expect(init.lookAtX).toBe(960);
    expect(init.lookAtY).toBe(540);
    expect(init.z).toBeCloseTo(homeDistance(1080, 40), 6);
  });

  it('rejects a non-positive duration', () => {
    expect(() => orbit({ duration: 0, degrees: 10 })).toThrow(/duration/);
    vi.fn();
  });

  describe('dollyZoom', () => {
    const R = (fov: number) => 360 / Math.tan((fov * DEG) / 2);

    it('animates fov while the radius follows it, so the z = 0 plane keeps its size', () => {
      const c = orbit({ duration: 2, degrees: 0, startAngle: 0, ease: 'none', dollyZoom: { from: 40, to: 80 } });
      const init = v720(c.initial);
      expect(init.fov).toBe(40);
      expect(init.z).toBeCloseTo(R(40), 6);
      const kfs = c.keyframes!;
      const mid = v720(kfs[9]!.to);           // 10th of 20 segments => progress 0.5
      expect(mid.fov).toBeCloseTo(60, 6);
      expect(mid.z).toBeCloseTo(R(60), 6);
      const last = v720(kfs[19]!.to);
      expect(last.fov).toBeCloseTo(80, 6);
      expect(last.z).toBeCloseTo(R(80), 6);
      expect(last.x).toBeCloseTo(640, 6);                          // no sweep: stays in front of the centre
    });

    it('combines with the sweep: position = centre + R(fov)·(sin a, cos a)', () => {
      const c = orbit({ duration: 2, degrees: 60, startAngle: -30, ease: 'none', dollyZoom: { from: 40, to: 70 } });
      const last = v720(c.keyframes!.slice(-1)[0]!.to);
      expect(last.fov).toBeCloseTo(70, 6);
      expect(last.x).toBeCloseTo(640 + R(70) * Math.sin(30 * DEG), 6);
      expect(last.z).toBeCloseTo(R(70) * Math.cos(30 * DEG), 6);
    });

    it('its own ease can differ from the sweep ease; radius cannot be combined with it', () => {
      const a = orbit({ duration: 2, degrees: 0, startAngle: 0, ease: 'none', dollyZoom: { from: 40, to: 80, ease: 'power2.in' } });
      const b = orbit({ duration: 2, degrees: 0, startAngle: 0, ease: 'none', dollyZoom: { from: 40, to: 80 } });
      expect(v720(a.keyframes![4]!.to).fov!).toBeLessThan(v720(b.keyframes![4]!.to).fov!);
      expect(() => orbit({ duration: 2, degrees: 10, radius: 900, dollyZoom: { from: 40, to: 80 } })).toThrow(/radius/);
    });
  });
});

