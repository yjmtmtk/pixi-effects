import { describe, it, expect } from 'vitest';
import { resolveAt, normalizeKeyframe, partitionProps } from '../../src/core/Timeline';

describe('resolveAt', () => {
  it('passes through positive numbers', () => { expect(resolveAt(2.5, 10)).toBe(2.5); });
  it('passes through 0', () => { expect(resolveAt(0, 10)).toBe(0); });
  it('resolves negative as duration-relative', () => { expect(resolveAt(-0.5, 10)).toBe(9.5); });
  it('treats undefined as 0', () => { expect(resolveAt(undefined, 10)).toBe(0); });
});

describe('normalizeKeyframe', () => {
  it('defaults: at=0, duration=0, ease=none', () => {
    const out = normalizeKeyframe({ to: { x: 100 } }, 10);
    expect(out.at).toBe(0);
    expect(out.duration).toBe(0);
    expect(out.ease).toBe('none');
    expect(out.kind).toBe('to');
  });
  it('detects set kind', () => { expect(normalizeKeyframe({ at: 1, set: { x: 0 } }, 10).kind).toBe('set'); });
  it('detects from kind', () => { expect(normalizeKeyframe({ at: 1, from: { x: 0 } }, 10).kind).toBe('from'); });
  it('detects fromTo kind', () => { expect(normalizeKeyframe({ at: 1, from: { x: 0 }, to: { x: 100 } }, 10).kind).toBe('fromTo'); });
  it('resolves negative at', () => { expect(normalizeKeyframe({ at: -0.5, to: { alpha: 0 }, duration: 0.5 }, 10).at).toBe(9.5); });
});

describe('partitionProps', () => {
  it('routes plain keys to ownProps', () => {
    const out = partitionProps({ x: 100, alpha: 0.5 });
    expect(out.ownProps).toEqual({ x: 100, alpha: 0.5 });
    expect(out.filterProps).toEqual({});
  });
  it('routes filters.NAME.PROP to filterProps grouped by name', () => {
    const out = partitionProps({ 'filters.b.strength': 8, 'filters.k.threshold': 0.5 });
    expect(out.ownProps).toEqual({});
    expect(out.filterProps).toEqual({ b: { strength: 8 }, k: { threshold: 0.5 } });
  });
  it('groups multiple props of the same filter together', () => {
    const out = partitionProps({ 'filters.b.strength': 8, 'filters.b.quality': 4 });
    expect(out.filterProps).toEqual({ b: { strength: 8, quality: 4 } });
  });
  it('handles mixed own and filter props', () => {
    const out = partitionProps({ x: 100, 'filters.b.strength': 8 });
    expect(out.ownProps).toEqual({ x: 100 });
    expect(out.filterProps).toEqual({ b: { strength: 8 } });
  });
  it('preserves unrelated dot paths in ownProps', () => {
    const out = partitionProps({ 'style.fill': '#ff0000' });
    expect(out.ownProps).toEqual({ 'style.fill': '#ff0000' });
    expect(out.filterProps).toEqual({});
  });
});
