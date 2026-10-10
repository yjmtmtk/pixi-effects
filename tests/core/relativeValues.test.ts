import { describe, it, expect, vi } from 'vitest';
import { applyKeyframes, applyInitial } from '../../src/core/Timeline';
import { normalizeProps } from '../../src/expr/normalizeProps';
import { createTimeline } from '../../src/core/timelineEngine';
import type { Timeline } from '../../src/core/timelineEngine';

const scope = { GW: 1920, GH: 1080, W: 1920, H: 1080, w: 100, h: 100 } as Record<string, number>;

function build(target: Record<string, number>, keyframes: unknown[], duration = 4) {
  const tl = createTimeline({ paused: true });
  applyKeyframes(tl, target, keyframes as never, duration, scope, [], 0);
  tl.time(0);
  return tl;
}
const at = (tl: Timeline, t: number) => { tl.time(t); return tl; };

describe('relative values: "+=36" and "-=36" in a keyframe are measured from where the layer is', () => {
  it('to: "+=36" moves 36 further, and seeking back puts it where it was', () => {
    const o = { x: 10 };
    const tl = build(o, [{ at: 0, duration: 1, to: { x: '+=36' } }]);
    expect(at(tl, 0.5) && o.x).toBe(28);
    expect(at(tl, 1) && o.x).toBe(46);
    expect(at(tl, 0) && o.x).toBe(10);
  });

  it('from: "-=36" starts 36 before where the layer stands and arrives there: the slide-in', () => {
    const o = { x: 100 };
    const tl = build(o, [{ at: 0, duration: 1, from: { x: '-=36' } }]);
    expect(at(tl, 0) && o.x).toBe(64);
    expect(at(tl, 0.5) && o.x).toBe(82);
    expect(at(tl, 1) && o.x).toBe(100);
  });

  it('the right side is an expression: "+=GW*0.1" is 192', () => {
    const o = { x: 0 };
    const tl = build(o, [{ at: 0, duration: 1, to: { x: '+=GW*0.1' } }]);
    expect(at(tl, 1) && o.x).toBe(192);
    expect(normalizeProps({ x: '-=GW/2', y: '+= 3' }, scope, { relative: 'allow' })).toEqual({ x: '-=960', y: '+=3' });
  });

  it('keyframes one after another stack: each is measured from where the one before ended, in any order of seeking', () => {
    const o = { x: 0 };
    const tl = build(o, [{ at: 0, duration: 1, to: { x: '+=10' } }, { at: 1, duration: 1, to: { x: '+=10' } }, { at: 2, duration: 1, to: { x: '-=5' } }]);
    const want = (t: number) => (t <= 1 ? 10 * t : t <= 2 ? 10 + 10 * (t - 1) : 20 - 5 * (t - 2));
    for (const t of [3, 0.5, 2.5, 0, 1.5, 3, 1, 2, 0.25]) expect(at(tl, t) && o.x, `t=${t}`).toBeCloseTo(want(Math.min(t, 3)), 6);
  });

  it('set: "+=5" adds at that moment', () => {
    const o = { x: 1 };
    const tl = build(o, [{ at: 1, set: { x: '+=5' } }]);
    expect(at(tl, 0.5) && o.x).toBe(1);
    expect(at(tl, 1.5) && o.x).toBe(6);
  });

  it('a plain number or a plain expression is exactly as before', () => {
    const o = { x: 7 };
    const tl = build(o, [{ at: 0, duration: 1, to: { x: 'GW/2' } }]);
    expect(at(tl, 1) && o.x).toBe(960);
  });
});

describe('relative values where they have no meaning say so, and never become a silent 0', () => {
  it('the from side of a from+to keyframe (a start has nothing to be relative to) warns and reads the number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = { x: 0 };
    const tl = build(o, [{ at: 0, duration: 1, from: { x: '+=10' }, to: { x: 100 } }]);
    expect(warn.mock.calls.some(c => /relative/i.test(String(c[0])) && /from/.test(String(c[0])))).toBe(true);
    expect(at(tl, 0) && o.x).toBe(10);
    warn.mockRestore();
  });

  it('in initial it warns and is read as the number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = { x: 0 };
    applyInitial(o, { x: '+=36' }, scope);
    expect(warn.mock.calls.some(c => /relative/i.test(String(c[0])) && /initial/.test(String(c[0])))).toBe(true);
    expect(o.x).toBe(36);
    warn.mockRestore();
  });

  it('normalizeProps outside a keyframe never returns a relative string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeProps({ a: '-=36' }, scope)).toEqual({ a: -36 });
    warn.mockRestore();
  });
});
