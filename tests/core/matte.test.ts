import { describe, it, expect } from 'vitest';
import { maskSourceOf, refNames, usesMatteRoute, MATTE_CHANNELS, matteProblems } from '../../src/core/matte';
import type { SequenceSpec } from '../../src/types';

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

describe('a shader layer as an inline mask', () => {
  it('goes through the matte filter: a sprite stencil mask would be drawn on top of the layer (as an image mask once was)', () => {
    expect(usesMatteRoute({ mask: { type: 'shader', fragment: 'x' } })).toBe(true);
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

const sp = (o: unknown) => o as SequenceSpec;
describe('matteProblems', () => {
  const sibs = [
    sp({ type: 'shape', shape: 'circle', name: 'disc' }),
    sp({ type: 'shape', shape: 'rect', name: 'band', at: 1, duration: 2 }),
    sp({ type: 'shape', shape: 'rect', name: 'dup' }), sp({ type: 'shape', shape: 'rect', name: 'dup' }),
    sp({ type: 'shape', shape: 'rect', name: 'solid', threeD: true }),
    sp({ type: 'shape', shape: 'rect', name: 'masked', mask: 'disc' }),
    sp({ type: 'null', name: 'rig' }),
  ];
  const layer = (o: Record<string, unknown>) => sp({ type: 'text', text: 'a', name: 'title', ...o });
  const run = (o: Record<string, unknown>, span = 10) => matteProblems(layer(o), [...sibs, layer(o)], span);

  it('no mask, an inline mask, and a good reference: nothing to say', () => {
    expect(run({})).toEqual([]);
    expect(run({ mask: { type: 'shape', shape: 'circle' } })).toEqual([]);
    expect(run({ mask: 'disc' })).toEqual([]);
  });
  it('a name no layer has, with did-you-mean', () => {
    const p = run({ mask: 'dsic' });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('mask "dsic": no layer with that name');
    expect(p[0]).toContain('did you mean "disc"?');
    expect(run({ mask: 'zzz' })[0]).not.toContain('did you mean');
  });
  it('two layers with the name (the first is used), a matte that is threeD, a matte that has a mask of its own, a layer that masks itself', () => {
    expect(run({ mask: 'dup' })[0]).toMatch(/2 layers are named "dup".*first/);
    expect(run({ mask: 'solid' })[0]).toMatch(/"solid" is a threeD layer.*cannot be a matte/);
    expect(run({ mask: 'masked' })[0]).toMatch(/"masked" has a mask of its own.*ignored/);
    expect(run({ mask: 'title' })[0]).toMatch(/masks itself/);
  });
  it('the matte must be on screen for as long as the layer is: a matte that starts late or ends early leaves the layer invisible', () => {
    const p = run({ mask: 'band', at: 0, duration: 5 });             // band is on 1–3 s, the layer 0–5 s
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/"band" is on screen from 1s to 3s.*layer from 0s to 5s/);
    expect(run({ mask: 'band', at: 1.5, duration: 1 })).toEqual([]);  // covered
  });
  it('a layer with a parent (it is in the null layer\'s space, the matte in the composition\'s) says what to do; maskInverted with a reference says invert', () => {
    expect(run({ mask: 'disc', parent: 'rig' })[0]).toMatch(/parent.*mask the null layer/);
    expect(run({ mask: 'disc', maskInverted: true })[0]).toMatch(/maskInverted.*invert: true/);
  });
  it('the problems of the reference itself (a wrong channel) are said once, with the layer', () => {
    const p = run({ mask: { layer: 'disc', channel: 'luminance' } });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/did you mean "luma"\?/);
  });
});
