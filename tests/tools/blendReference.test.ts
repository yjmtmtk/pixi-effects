import { describe, it, expect } from 'vitest';
import { BLEND, blendPixel, hexToRgb } from '../support/blendReference';

describe('the W3C reference blend functions', () => {
  const grey = (v: number): [number, number, number] => [v, v, v];
  it('multiply-like and extremes: overlay of mid-grey over x is x; difference of equal colours is black; exclusion with black is the backdrop', () => {
    expect(BLEND.overlay!(grey(0.25), grey(0.5))[0]).toBeCloseTo(0.25, 12);
    expect(BLEND.difference!(grey(0.4), grey(0.4))[0]).toBe(0);
    expect(BLEND.exclusion!(grey(0.7), grey(0))[0]).toBeCloseTo(0.7, 12);
    expect(BLEND['hard-light']!(grey(0.5), grey(1))[0]).toBe(1);
    expect(BLEND['linear-burn']!(grey(0.3), grey(0.4))[0]).toBe(0);
  });
  it('dodge and burn at the edges (W3C: a black backdrop stays black under dodge; a white one stays white under burn)', () => {
    expect(BLEND['color-dodge']!(grey(0), grey(0.9))[0]).toBe(0);
    expect(BLEND['color-dodge']!(grey(0.5), grey(1))[0]).toBe(1);
    expect(BLEND['color-burn']!(grey(1), grey(0.1))[0]).toBe(1);
    expect(BLEND['color-burn']!(grey(0.5), grey(0))[0]).toBe(0);
  });
  it('soft-light: a mid-grey source changes nothing; a bright source lightens a dark backdrop a little', () => {
    expect(BLEND['soft-light']!(grey(0.3), grey(0.5))[0]).toBeCloseTo(0.3, 12);
    expect(BLEND['soft-light']!(grey(0.2), grey(1))[0]).toBeGreaterThan(0.2);
    expect(BLEND['soft-light']!(grey(0.2), grey(1))[0]).toBeLessThan(0.5);
  });
  it('the non-separable modes keep their promises: luminosity keeps the backdrop hue, color keeps the backdrop luminance', () => {
    const cb = hexToRgb('#3366cc'), cs = hexToRgb('#ffcc00');
    const lum = (c: number[]) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
    expect(lum(BLEND.color!(cb, cs))).toBeCloseTo(lum(cb), 9);
    expect(lum(BLEND.luminosity!(cb, cs))).toBeCloseTo(lum(cs), 9);
    for (const c of [BLEND.hue!(cb, cs), BLEND.saturation!(cb, cs), BLEND.color!(cb, cs), BLEND.luminosity!(cb, cs)]) for (const v of c) { expect(v).toBeGreaterThanOrEqual(-1e-9); expect(v).toBeLessThanOrEqual(1 + 1e-9); }
  });
  it('blendPixel: alpha 1 over an opaque backdrop is the blend; alpha 0 is the backdrop; over a transparent backdrop it is the source (normal)', () => {
    const cb = hexToRgb('#336699'), cs = hexToRgb('#cc9933');
    const full = blendPixel('overlay', cb, 1, cs, 1);
    const B = BLEND.overlay!(cb, cs);
    expect(full[0]).toBeCloseTo(B[0] * 255, 9);
    expect(blendPixel('overlay', cb, 1, cs, 0).slice(0, 3).map(Math.round)).toEqual([0x33, 0x66, 0x99]);
    const over = blendPixel('overlay', cb, 0, cs, 1);
    expect(over.slice(0, 3).map(Math.round)).toEqual([0xcc, 0x99, 0x33]);
    expect(over[3]).toBe(255);
  });
});
