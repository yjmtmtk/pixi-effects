import { describe, it, expect } from 'vitest';
import { evaluateExpr, isExpr } from '../../src/expr/Parser';

describe('isExpr', () => {
  it('returns false for numbers', () => {
    expect(isExpr(42)).toBe(false);
    expect(isExpr(0)).toBe(false);
  });
  it('returns false for booleans', () => {
    expect(isExpr(true)).toBe(false);
  });
  it('returns true for strings that look like expressions', () => {
    expect(isExpr('W/2')).toBe(true);
    expect(isExpr('cover')).toBe(true);
    expect(isExpr('GW * 0.05')).toBe(true);
  });
  it('returns false for null/undefined', () => {
    expect(isExpr(null)).toBe(false);
    expect(isExpr(undefined)).toBe(false);
  });
});

describe('evaluateExpr', () => {
  it('evaluates simple arithmetic', () => {
    expect(evaluateExpr('1 + 2', {})).toBe(3);
  });
  it('uses scope variables', () => {
    expect(evaluateExpr('W / 2', { W: 800 })).toBe(400);
  });
  it('handles min/max via parser builtins', () => {
    expect(evaluateExpr('min(W, H)', { W: 100, H: 200 })).toBe(100);
  });
  it('returns 0 and warns on parse error', () => {
    expect(evaluateExpr('@@@', {})).toBe(0);
  });
});

describe('evaluateExpr — seeded randomness and small maths helpers', () => {
  it('rand(seed) and noise(x, seed) are deterministic and in range', () => {
    expect(evaluateExpr('rand(3)', {})).toBe(evaluateExpr('rand(3)', {}));
    expect(evaluateExpr('rand(3)', {})).not.toBe(evaluateExpr('rand(4)', {}));
    const n = evaluateExpr('noise(1.5, 2)', {});
    expect(n).toBeGreaterThanOrEqual(-1);
    expect(n).toBeLessThanOrEqual(1);
    expect(evaluateExpr('noise(1.5)', {})).toBe(evaluateExpr('noise(1.5, 0)', {}));
  });
  it('the seed can come from the scope, so every layer in a loop can have its own', () => {
    expect(evaluateExpr('W/2 + rand(t) * 100', { W: 800, t: 5 })).toBe(400 + evaluateExpr('rand(5)', {}) * 100);
  });
  it('lerp, clamp, smoothstep, mod, step, PI', () => {
    expect(evaluateExpr('lerp(10, 20, 0.25)', {})).toBe(12.5);
    expect(evaluateExpr('clamp(15, 0, 10)', {})).toBe(10);
    expect(evaluateExpr('clamp(-5, 0, 10)', {})).toBe(0);
    expect(evaluateExpr('smoothstep(0, 10, 5)', {})).toBeCloseTo(0.5, 10);
    expect(evaluateExpr('smoothstep(0, 10, -3)', {})).toBe(0);
    expect(evaluateExpr('smoothstep(0, 10, 99)', {})).toBe(1);
    expect(evaluateExpr('mod(7, 3)', {})).toBe(1);
    expect(evaluateExpr('mod(-1, 3)', {})).toBe(2);        // never negative, like a clock
    expect(evaluateExpr('step(5, 4)', {})).toBe(0);
    expect(evaluateExpr('step(5, 5)', {})).toBe(1);
    expect(evaluateExpr('sin(PI / 2)', {})).toBeCloseTo(1, 10);
  });
  it('PI is a constant that a scope variable cannot shadow', () => {
    expect(evaluateExpr('PI', { PI: 3 })).toBeCloseTo(Math.PI, 10);
  });
});
