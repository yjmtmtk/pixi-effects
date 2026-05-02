import { describe, it, expect } from 'vitest';
import { normalizeProps } from '../../src/expr/normalizeProps';

describe('normalizeProps', () => {
  it('returns numbers unchanged', () => {
    expect(normalizeProps({ x: 100 }, { W: 800 })).toEqual({ x: 100 });
  });
  it('evaluates string values as expressions', () => {
    expect(normalizeProps({ x: 'W / 2' }, { W: 800 })).toEqual({ x: 400 });
  });
  it('recurses into nested objects', () => {
    const out = normalizeProps({ scale: { x: 'cover', y: 'cover' } }, { cover: 2 });
    expect(out).toEqual({ scale: { x: 2, y: 2 } });
  });
  it('evaluates strings inside arrays', () => {
    expect(normalizeProps({ pos: ['W/2', 'H/2'] }, { W: 800, H: 600 })).toEqual({ pos: [400, 300] });
  });
  it('preserves non-expression strings via skipKeys', () => {
    expect(normalizeProps(
      { fill: '#ff0000', x: 'W' },
      { W: 800 },
      { skipKeys: ['fill'] }
    )).toEqual({ fill: '#ff0000', x: 800 });
  });
  it('does not mutate the input', () => {
    const input = { x: 'W' };
    const out = normalizeProps(input, { W: 100 });
    expect(input).toEqual({ x: 'W' });
    expect(out).toEqual({ x: 100 });
  });
});
