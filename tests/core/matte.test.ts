import { describe, it, expect } from 'vitest';
import { maskSourceOf, refNames, usesMatteRoute, MATTE_CHANNELS } from '../../src/core/matte';

describe('maskSourceOf', () => {
  it('a layer spec (it has a type) is an inline mask, as it always was', () => {
    const spec = { type: 'shape', shape: 'circle', radius: 10 };
    expect(maskSourceOf(spec)).toEqual({ kind: 'inline', spec });
  });
  it('a string is the name of another layer: alpha, not inverted', () => {
    expect(maskSourceOf('wipe')).toEqual({ kind: 'refs', refs: [{ layer: 'wipe', channel: 'alpha', invert: false }], problems: [] });
  });
  it('{ layer, channel, invert } is a reference with its options; missing options take the defaults', () => {
    expect(maskSourceOf({ layer: 'v', channel: 'luma', invert: true })).toEqual({ kind: 'refs', refs: [{ layer: 'v', channel: 'luma', invert: true }], problems: [] });
    expect(maskSourceOf({ layer: 'v' })).toEqual({ kind: 'refs', refs: [{ layer: 'v', channel: 'alpha', invert: false }], problems: [] });
  });
  it('an array is several references (intersect), names and objects mixed', () => {
    const s = maskSourceOf(['panel', { layer: 'hole', invert: true }]);
    expect(s).toEqual({ kind: 'refs', refs: [{ layer: 'panel', channel: 'alpha', invert: false }, { layer: 'hole', channel: 'alpha', invert: true }], problems: [] });
  });
  it('a wrong channel or a non-boolean invert is a problem with what to write, and the default is used', () => {
    const a = maskSourceOf({ layer: 'v', channel: 'luminance' });
    expect(a.kind).toBe('refs');
    if (a.kind === 'refs') {
      expect(a.refs[0]!.channel).toBe('alpha');
      expect(a.problems[0]).toMatch(/channel "luminance".*did you mean "luma"\?/);
    }
    const b = maskSourceOf({ layer: 'v', invert: 'yes' });
    if (b.kind === 'refs') { expect(b.refs[0]!.invert).toBe(false); expect(b.problems[0]).toMatch(/invert.*true or false/); }
    const c = maskSourceOf({ layer: 'v', channel: 'red' });
    if (c.kind === 'refs') expect(c.problems[0]).toMatch(/alpha.*luma/);
  });
  it('a layer spec inside an array is ignored with a problem (name it instead); an object with neither type nor layer is nothing', () => {
    const s = maskSourceOf(['a', { type: 'shape', shape: 'circle' }]);
    expect(s.kind).toBe('refs');
    if (s.kind === 'refs') {
      expect(s.refs.map(r => r.layer)).toEqual(['a']);
      expect(s.problems[0]).toMatch(/inside a list.*name/);
    }
    expect(maskSourceOf({ foo: 1 })).toEqual({ kind: 'none' });
    expect(maskSourceOf(undefined)).toEqual({ kind: 'none' });
    expect(maskSourceOf(null)).toEqual({ kind: 'none' });
    expect(maskSourceOf(7)).toEqual({ kind: 'none' });
    expect(maskSourceOf([])).toEqual({ kind: 'none' });
  });
});

describe('refNames', () => {
  it('lists each referenced layer once, in order', () => {
    expect(refNames(['a', { layer: 'b' }, 'a'])).toEqual(['a', 'b']);
    expect(refNames('x')).toEqual(['x']);
    expect(refNames({ type: 'shape' })).toEqual([]);
    expect(refNames(undefined)).toEqual([]);
  });
});

describe('usesMatteRoute (which inline masks go through the matte filter)', () => {
  it('an inverted mask and a text, image or video mask do; a plain shape mask (the stencil) and no mask do not', () => {
    expect(usesMatteRoute({ mask: { type: 'shape', shape: 'circle' }, maskInverted: true })).toBe(true);
    expect(usesMatteRoute({ mask: { type: 'text', text: 'a' } })).toBe(true);
    expect(usesMatteRoute({ mask: { type: 'image', asset: 'a' } })).toBe(true);
    expect(usesMatteRoute({ mask: { type: 'video', asset: 'a' } })).toBe(true);
    expect(usesMatteRoute({ mask: { type: 'shape', shape: 'circle' } })).toBe(false);
    expect(usesMatteRoute({ mask: { type: 'composition' } })).toBe(false);
    expect(usesMatteRoute({})).toBe(false);
    expect(usesMatteRoute({ mask: 'name' })).toBe(false);          // a reference is not inline
  });
  it('the channels are alpha and luma', () => {
    expect(MATTE_CHANNELS).toEqual(['alpha', 'luma']);
  });
});
