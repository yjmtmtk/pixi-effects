import { describe, it, expect, vi } from 'vitest';
import { wiggle } from '../../src/presets/wiggle';

describe('wiggle()', () => {
  it('returns keyframes: a set at the start, then one tween per step; the last one returns to the centre', () => {
    const k = wiggle({ duration: 2, freq: 3, seed: 1, props: { x: { around: 100, amp: 10 } } });
    expect(k[0]).toMatchObject({ at: 0, set: { x: 100 } });
    const tweens = k.slice(1);
    expect(tweens).toHaveLength(6);                       // 2 s × 3 per second
    expect(tweens.at(-1)!.to).toEqual({ x: 100 });
    for (const t of tweens.slice(0, -1)) expect(Math.abs((t.to!.x as number) - 100)).toBeLessThanOrEqual(10);
  });

  it('is deterministic: the same seed gives the same keyframes, another seed another shake', () => {
    const a = wiggle({ duration: 2, seed: 4, props: { x: { around: 0, amp: 5 } } });
    const b = wiggle({ duration: 2, seed: 4, props: { x: { around: 0, amp: 5 } } });
    const c = wiggle({ duration: 2, seed: 5, props: { x: { around: 0, amp: 5 } } });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('every property moves independently (x and y do not shake in lockstep)', () => {
    const k = wiggle({ duration: 2, seed: 1, props: { x: { around: 0, amp: 5 }, y: { around: 0, amp: 5 } } });
    const xs = k.slice(1, -1).map(t => t.to!.x), ys = k.slice(1, -1).map(t => t.to!.y);
    expect(xs).not.toEqual(ys);
  });

  it('`at` offsets the whole run; steps tile the duration exactly; ease and freq are honoured', () => {
    const k = wiggle({ at: 1.5, duration: 1, freq: 4, ease: 'none', props: { rotation: { around: 0, amp: 2 } } });
    expect(k[0]!.at).toBe(1.5);
    const tweens = k.slice(1);
    expect(tweens).toHaveLength(4);
    expect(tweens[0]).toMatchObject({ at: 1.5, duration: 0.25, ease: 'none' });
    expect(tweens.at(-1)!.at! + tweens.at(-1)!.duration!).toBeCloseTo(2.5, 10);
  });

  it('`around` may be an expression: offsets are appended to it', () => {
    const k = wiggle({ duration: 1, freq: 2, props: { x: { around: 'W/2', amp: 10 } } });
    expect(k[0]!.set).toEqual({ x: 'W/2' });
    expect(String(k[1]!.to!.x)).toMatch(/^\(W\/2\) [+-] \d/);
    expect(k.at(-1)!.to).toEqual({ x: 'W/2' });
  });

  it('a duration that is not a whole number of steps still tiles it (steps are rounded up)', () => {
    const k = wiggle({ duration: 1.1, freq: 3, props: { x: { around: 0, amp: 1 } } });
    const tweens = k.slice(1);
    expect(tweens).toHaveLength(4);
    expect(tweens.reduce((s, t) => s + t.duration!, 0)).toBeCloseTo(1.1, 10);
  });

  it('rejects values that cannot work, naming the option', () => {
    expect(() => wiggle({ duration: 0, props: { x: { around: 0, amp: 1 } } })).toThrow(/duration/);
    expect(() => wiggle({ duration: 1, freq: 0, props: { x: { around: 0, amp: 1 } } })).toThrow(/freq/);
    expect(() => wiggle({ duration: 1, props: {} })).toThrow(/props/);
    expect(() => wiggle({ duration: 1, props: { x: { around: 0, amp: NaN } } })).toThrow(/amp/);
  });

  it('warns about a misspelt option, like the other presets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    wiggle({ duration: 1, frequency: 3, props: { x: { around: 0, amp: 1 } } } as any);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/frequency/));
    warn.mockRestore();
  });
});
