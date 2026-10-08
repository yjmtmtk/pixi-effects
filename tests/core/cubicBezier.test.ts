// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
import { cubicBezierEase, cubicBezierProblem } from '../../src/core/cubicBezier';
import { checkEase, __resetEaseWarnings } from '../../src/core/ease';

/** The slow, obvious way: bisect x(t) = p with no cleverness. */
function reference(x1: number, y1: number, x2: number, y2: number, p: number): number {
  const bez = (a: number, b: number, t: number): number => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (bez(x1, x2, mid) < p) lo = mid; else hi = mid; }
  return bez(y1, y2, (lo + hi) / 2);
}

const CURVES: Array<[number, number, number, number]> = [
  [0.25, 0.1, 0.25, 1], [0.42, 0, 1, 1], [0, 0, 0.58, 1], [0.42, 0, 0.58, 1], [0.4, 0, 0.2, 1], [0.34, 1.56, 0.64, 1],
  [0.68, -0.6, 0.32, 1.6], [0, 0, 1, 1], [1, 0, 0, 1], [0, 1, 1, 0], [0.8, 0, 0.2, 1], [0.1, 0.9, 0.9, 0.1],
];

describe('cubicBezierEase', () => {
  it('is exactly 0 at 0 and 1 at 1', () => {
    for (const c of CURVES) { const f = cubicBezierEase(...c); expect(f(0)).toBe(0); expect(f(1)).toBe(1); }
  });
  it('matches a bisection reference within 1e-6 along every curve', () => {
    for (const c of CURVES) {
      const f = cubicBezierEase(...c);
      // (1, 0, 0, 1) has a flat spot in x(t) at t = 0.5, where the reference itself is only good to about 3e-6 in float arithmetic
      // (the ease returns exactly 0.5 there, which is right); every other curve is checked tightly.
      const limit = c[0] === 1 && c[1] === 0 && c[2] === 0 && c[3] === 1 ? 1e-5 : 1e-6;
      for (let i = 1; i < 1000; i++) expect(Math.abs(f(i / 1000) - reference(...c, i / 1000)), `curve ${c} at ${i / 1000}`).toBeLessThan(limit);
    }
  });
  it('(0,0,1,1) is a straight line and an overshooting curve really overshoots', () => {
    const lin = cubicBezierEase(0, 0, 1, 1);
    for (let i = 0; i <= 100; i++) expect(lin(i / 100)).toBeCloseTo(i / 100, 6);
    const over = cubicBezierEase(0.34, 1.56, 0.64, 1);
    expect(Math.max(...Array.from({ length: 1001 }, (_, i) => over(i / 1000)))).toBeGreaterThan(1.09);      // this curve peaks at about 1.098
  });
  it('is a pure function: a backwards sweep equals the forwards sweep (bit-identical)', () => {
    const f = cubicBezierEase(0.4, 0, 0.2, 1), g = cubicBezierEase(0.4, 0, 0.2, 1);
    const fwd = Array.from({ length: 501 }, (_, i) => f(i / 500));
    const back: number[] = [];
    for (let i = 500; i >= 0; i--) back.unshift(g(i / 500));
    expect(back).toEqual(fwd);
  });
});

describe('cubic-bezier as a GSAP ease', () => {
  it('gsap resolves the string, with or without spaces and a leading dot', () => {
    const a = gsap.parseEase('cubic-bezier(.4,0,.2,1)') as (p: number) => number;
    const b = gsap.parseEase('cubic-bezier(0.4, 0, 0.2, 1)') as (p: number) => number;
    const ref = cubicBezierEase(0.4, 0, 0.2, 1);
    for (let i = 0; i <= 20; i++) { expect(a(i / 20)).toBeCloseTo(ref(i / 20), 12); expect(b(i / 20)).toBeCloseTo(ref(i / 20), 12); }
  });
  it('a valid string says nothing; a malformed one is said once, and what it runs as', () => {
    __resetEaseWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkEase('cubic-bezier(.4,0,.2,1)', 'x');
    expect(warn).not.toHaveBeenCalled();
    checkEase('cubic-bezier(.4,0,.2)', 'layer "a"');
    checkEase('cubic-bezier(.4,0,.2)', 'layer "a"');
    checkEase('cubic-bezier(1.4,0,.2,1)', 'layer "b"');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toMatch(/cubic-bezier\(x1, y1, x2, y2\)/);
    expect(String(warn.mock.calls[0]![0])).toMatch(/runs as 'none'/);
    expect(String(warn.mock.calls[1]![0])).toMatch(/x1 and x2 must be between 0 and 1/);
    warn.mockRestore();
  });
  it('cubicBezierProblem: null for a good string', () => {
    expect(cubicBezierProblem('cubic-bezier(0.25, 0.1, 0.25, 1)')).toBeNull();
    expect(cubicBezierProblem('cubic-bezier(a,b,c,d)')).toMatch(/four numbers/);
  });
});
