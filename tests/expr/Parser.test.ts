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
