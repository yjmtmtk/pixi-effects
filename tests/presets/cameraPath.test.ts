import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cameraPath } from '../../src/presets/cameraPath';

beforeEach(() => { vi.restoreAllMocks(); });
type Kf = { at: number; set?: Record<string, number>; to?: Record<string, number>; duration?: number; ease?: string };
const run = (o: Parameters<typeof cameraPath>[0]) => cameraPath(o) as unknown as Kf[];

describe('cameraPath(): a camera flight as keyframes', () => {
  const straight = { points: [[0, 0, 1000], [0, 0, 0]] as Array<[number, number, number]>, duration: 2, frameRate: 30, smooth: false };

  it('starts with a set at `at`, then one linear step per frame that sets x, y, z and the look-at point', () => {
    const k = run({ ...straight, at: 1 });
    expect(k.length).toBe(1 + 60);
    expect(k[0]).toMatchObject({ at: 1, set: { x: 0, y: 0, z: 1000 } });
    expect(Object.keys(k[1]!.to!).sort()).toEqual(['lookAtX', 'lookAtY', 'lookAtZ', 'x', 'y', 'z']);
    expect(k[1]).toMatchObject({ at: 1, ease: 'none' });
    expect(k[1]!.duration).toBeCloseTo(1 / 30, 5);
    expect(k[60]!.to!.z).toBeCloseTo(0, 6);
  });

  it('constant speed by default: halfway in time is halfway along the path', () => {
    const k = run(straight);
    expect(k[30]!.to!.z).toBeCloseTo(500, 4);
    expect(k[15]!.to!.z).toBeCloseTo(750, 4);
  });

  it('an ease shapes the speed along the path (power2.in starts slow: an accelerating rush)', () => {
    const k = run({ ...straight, ease: 'power2.in' });
    expect(k[30]!.to!.z).toBeCloseTo(875, 3);                       // power2.in is a cubic: an eighth of the way at half the time
    expect(1000 - k[6]!.to!.z!).toBeLessThan(1000 - k[60]!.to!.z!) ;
  });

  it('looks ahead along the path by default, so the camera faces where it flies', () => {
    const k = run({ ...straight, lookAhead: 0.1 });
    expect(k[30]!.to!.lookAtZ).toBeCloseTo(500 - 100, 4);           // 10 % of 1000 further on
    expect(k[30]!.to!.lookAtX).toBeCloseTo(0, 6);
  });

  it('at the end the look-at point keeps going along the last direction instead of stopping', () => {
    const k = run({ ...straight, lookAhead: 0.1 });
    expect(k[60]!.to!.lookAtZ).toBeCloseTo(-100, 4);
  });

  it('a fixed look: [x, y, z] is the look-at point for every frame', () => {
    const k = run({ ...straight, look: [10, 20, -300] });
    expect(k[0]!.set).toMatchObject({ lookAtX: 10, lookAtY: 20, lookAtZ: -300 });
    expect(k[44]!.to).toMatchObject({ lookAtX: 10, lookAtY: 20, lookAtZ: -300 });
  });

  it('smooth (default) is a curve through every point at an even speed; smooth: false is straight lines between them', () => {
    const pts: Array<[number, number, number]> = [[0, 0, 1000], [300, 0, 500], [300, 200, 0], [0, 200, -500]];
    const curve = run({ points: pts, duration: 4, frameRate: 60 });
    for (const p of pts) {
      const near = Math.min(...curve.map(k => { const q = (k.set ?? k.to)!; return Math.hypot(q.x! - p[0], q.y! - p[1], q.z! - p[2]); }));
      expect(near, `passes through ${p}`).toBeLessThan(8);
    }
    const lines = run({ points: pts, duration: 4, frameRate: 60, smooth: false });
    const mid = lines.find(k => Math.abs((k.to ?? k.set!).x! - 300) < 0.5 && (k.to ?? k.set!).z! < 505 && (k.to ?? k.set!).z! > 495);
    expect(mid).toBeTruthy();
  });

  it('from / to take a part of the flight, and a reversed pair flies it backwards', () => {
    const half = run({ ...straight, from: 0, to: 0.5 });
    expect(half[60]!.to!.z).toBeCloseTo(500, 4);
    const back = run({ ...straight, from: 1, to: 0 });
    expect(back[0]!.set!.z).toBeCloseTo(0, 6);
    expect(back[60]!.to!.z).toBeCloseTo(1000, 4);
  });

  it('a mistake is an error that says what is wrong (points, duration, frameRate), a typo warns', () => {
    expect(() => cameraPath({ points: [[0, 0, 0]] as never, duration: 2 })).toThrow(/at least two points/);
    expect(() => cameraPath({ points: [[0, 0], [1, 1]] as never, duration: 2 })).toThrow(/\[x, y, z\]/);
    expect(() => cameraPath({ ...straight, duration: 0 })).toThrow(/duration/);
    expect(() => cameraPath({ ...straight, frameRate: 0 })).toThrow(/frameRate/);
    expect(() => cameraPath({ points: [[0, 0, 5], [0, 0, 5]], duration: 1 })).toThrow(/no length/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cameraPath({ ...straight, lookahead: 0.2 } as never);
    expect(warn.mock.calls.join('\n')).toMatch(/lookahead.*lookAhead/s);
  });
});
