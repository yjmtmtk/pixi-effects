import { describe, it, expect } from 'vitest';
import {
  blurRadius, looksLikeLayerName, withFocusResolved, layerInitialZ, focusProblems,
  DEFAULT_APERTURE, MIN_BLUR, MAX_BLUR,
} from '../../src/space/focus';
import { homeDistance } from '../../src/space/math';
import type { SequenceSpec } from '../../src/types';

const focal = homeDistance(720, 40);          // the home camera: focal length = camera distance = 989.09 px at 720p
const sp = (o: unknown) => o as SequenceSpec;

describe('blurRadius', () => {
  it('is 0 on the focal plane, and grows with |1/d − 1/s| and with aperture (closed form: aperture × focal × |1/d − 1/s| / 2)', () => {
    const s = focal;                                                  // the z = 0 plane
    expect(blurRadius(30, focal, s, s)).toBe(0);
    const d = s + 400;                                                // a layer at z = −400
    const want = (60 * focal * Math.abs(1 / d - 1 / s)) / 2;
    expect(blurRadius(60, focal, d, s)).toBeCloseTo(want, 12);
    expect(blurRadius(60, focal, d, s)).toBeCloseTo(8.64, 1);        // worked out by hand: 60 × |989.09/1389.09 − 1| / 2
    expect(blurRadius(30, focal, d, s)).toBeCloseTo(blurRadius(60, focal, d, s) / 2, 12);
    expect(blurRadius(30, focal, s - 300, s)).toBeGreaterThan(0);     // nearer than the focus blurs too
  });
  it('is 0 when off or when the geometry is meaningless', () => {
    expect(blurRadius(0, focal, 1400, focal)).toBe(0);
    expect(blurRadius(30, focal, 0, focal)).toBe(0);                  // the layer is at the camera plane
    expect(blurRadius(30, focal, -5, focal)).toBe(0);                 // behind it
    expect(blurRadius(30, focal, 1400, 0)).toBe(0);                   // the focal plane is at or behind the camera
    expect(blurRadius(30, focal, 1400, -3)).toBe(0);
    expect(blurRadius(NaN, focal, 1400, focal)).toBe(0);
  });
  it('is capped at MAX_BLUR, and the constants are what the docs say', () => {
    expect(blurRadius(100000, focal, focal + 900, focal)).toBe(MAX_BLUR);
    expect(DEFAULT_APERTURE).toBe(30);
    expect(MIN_BLUR).toBe(0.05);
  });
});

describe('looksLikeLayerName', () => {
  it('tells a layer name from a number expression', () => {
    for (const n of ['title', 'front', 'bg-photo', 'card_2', 'Title']) expect(looksLikeLayerName(n)).toBe(true);
    for (const e of ['GW/2', '250', '-120', 'H * 0.5', '(GH)', 'GW', 'W', 'contain', 't', 'd', 'T']) expect(looksLikeLayerName(e)).toBe(false);
  });
});

describe('withFocusResolved', () => {
  const zOf = (n: string) => ({ front: 0, back: -400 } as Record<string, number>)[n];
  it('rewrites a layer name in initial, set, to and from, and leaves numbers and expressions alone', () => {
    const props = {
      initial: { focus: 'front', aperture: 40, x: 1 },
      keyframes: [{ at: 1, from: { focus: 'front' }, to: { focus: 'back' }, duration: 1 }, { at: 2, set: { focus: 250 } }, { at: 3, to: { focus: 'GW/2' } }],
    };
    const out = withFocusResolved(props, zOf);
    expect(out.initial).toEqual({ focus: 0, aperture: 40, x: 1 });
    expect(out.keyframes![0]).toMatchObject({ from: { focus: 0 }, to: { focus: -400 } });
    expect(out.keyframes![1]!.set).toEqual({ focus: 250 });
    expect(out.keyframes![2]!.to).toEqual({ focus: 'GW/2' });
    expect(props.initial.focus).toBe('front');                         // the spec itself is not touched
  });
  it('a name that does not resolve becomes 0 (the z = 0 plane; the lint says so)', () => {
    expect(withFocusResolved({ initial: { focus: 'nope' } }, zOf).initial).toEqual({ focus: 0 });
  });
  it('passes through a camera with no focus', () => {
    const props = { initial: { fov: 50 } };
    expect(withFocusResolved(props, zOf)).toEqual(props);
  });
});

describe('layerInitialZ', () => {
  it('reads a number, evaluates an expression, defaults to 0', () => {
    expect(layerInitialZ({ initial: { z: -250 } }, {})).toBe(-250);
    expect(layerInitialZ({ initial: { z: 'GW / 4' } }, { GW: 1280 } as never)).toBe(320);
    expect(layerInitialZ({ initial: { x: 5 } }, {})).toBe(0);
    expect(layerInitialZ({}, {})).toBe(0);
  });
});

describe('focusProblems', () => {
  const sibs = [
    sp({ type: 'text', name: 'title', threeD: true, text: 'a', initial: { z: 0 } }),
    sp({ type: 'image', name: 'label', asset: 'a' }),
    sp({ type: 'shape', shape: 'rect', name: 'mover', threeD: true, initial: { z: 0 }, keyframes: [{ at: 0, to: { z: 300 }, duration: 1 }] }),
  ];
  it('a threeD layer, a number and an expression are fine', () => {
    expect(focusProblems({ initial: { focus: 'title' } }, sibs)).toEqual([]);
    expect(focusProblems({ initial: { focus: 120 }, keyframes: [{ at: 0, to: { focus: 'GW/2' } }] }, sibs)).toEqual([]);
    expect(focusProblems({ initial: { fov: 50 } }, sibs)).toEqual([]);
  });
  it('a name no layer has, with did-you-mean', () => {
    expect(focusProblems({ initial: { focus: 'tilte' } }, sibs)).toEqual([{ kind: 'missing', name: 'tilte', hint: 'title' }]);
    expect(focusProblems({ initial: { focus: 'zzz' } }, sibs)).toEqual([{ kind: 'missing', name: 'zzz', hint: null }]);
  });
  it('a layer that is not threeD', () => {
    expect(focusProblems({ initial: { focus: 'label' } }, sibs)).toEqual([{ kind: 'not-threeD', name: 'label' }]);
  });
  it('a layer whose z moves later (only the first z is read)', () => {
    expect(focusProblems({ initial: { focus: 'mover' } }, sibs)).toEqual([{ kind: 'moving', name: 'mover' }]);
  });
  it('says each problem once, however many times the name is written', () => {
    const kfs = [{ at: 0, from: { focus: 'tilte' }, to: { focus: 'tilte' } }, { at: 1, to: { focus: 'tilte' } }];
    expect(focusProblems({ initial: { focus: 'tilte' }, keyframes: kfs }, sibs)).toHaveLength(1);
  });
});
