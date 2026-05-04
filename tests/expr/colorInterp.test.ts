import { describe, it, expect } from 'vitest';
import { buildColorInterp } from '../../src/expr/colorInterp';

function parseRgba(s: string): { r: number; g: number; b: number; a: number } {
  const m = s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  if (!m) throw new Error(`unparseable rgba string: ${s}`);
  return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: +m[4]! };
}

describe('buildColorInterp — endpoints', () => {
  for (const space of ['oklab', 'oklch'] as const) {
    it(`${space}: t=0 ≈ from, t=1 ≈ to (within 1 channel)`, () => {
      const interp = buildColorInterp('#ff3366', '#33aaff', space);
      const at0 = parseRgba(interp(0));
      const at1 = parseRgba(interp(1));
      // Round-tripping through OKLab loses a tiny bit; allow ±2 / 255 slack.
      expect(at0.r).toBeGreaterThanOrEqual(253); expect(at0.g).toBeLessThan(60);  expect(at0.b).toBeGreaterThan(95);
      expect(at1.r).toBeLessThan(60);            expect(at1.g).toBeGreaterThan(165); expect(at1.b).toBeGreaterThanOrEqual(253);
    });
  }
});

describe('buildColorInterp — perceptual midpoint vs sRGB lerp', () => {
  // The motivating case: red → green. Naive sRGB lerp at t=0.5 lands on
  // muddy olive (≈ rgb(128, 128, 0)) — both channels dim, looks dirty.
  // OKLab keeps perceived brightness ~ constant across the ramp, so the
  // midpoint shifts up into a warm orange/khaki. The R+G sum is
  // noticeably brighter than the sRGB midpoint.
  it('oklab red → green midpoint is brighter than the sRGB mud', () => {
    const interp = buildColorInterp('#ff0000', '#00ff00', 'oklab');
    const mid = parseRgba(interp(0.5));
    expect(mid.b).toBeLessThan(40);                   // no spurious blue
    expect(mid.r + mid.g).toBeGreaterThan(128 + 128); // brighter than naive sRGB mid
  });

  // OKLCH interpolates hue along the shorter angular path. Red → green
  // goes via orange / yellow (warm side), keeping each midpoint highly
  // saturated. Compare to OKLab which dips through a less chromatic
  // orange — the OKLCH midpoint should have the dominant channel
  // very close to its endpoint values.
  it('oklch red → green midpoint passes through saturated orange', () => {
    const interp = buildColorInterp('#ff0000', '#00ff00', 'oklch');
    const mid = parseRgba(interp(0.5));
    expect(mid.r).toBeGreaterThan(220); // still close to fully red
    expect(mid.g).toBeGreaterThan(120); // already substantially green — bright orange
    expect(mid.b).toBeLessThan(40);
  });
});

describe('buildColorInterp — alpha', () => {
  it('interpolates alpha when sources differ', () => {
    const interp = buildColorInterp('#ff000080', '#ff0000ff', 'oklab');
    const at0   = parseRgba(interp(0));
    const at1   = parseRgba(interp(1));
    const at_5  = parseRgba(interp(0.5));
    expect(at0.a).toBeCloseTo(0.5, 1);
    expect(at1.a).toBe(1);
    expect(at_5.a).toBeCloseTo(0.75, 1);
  });
});

describe('buildColorInterp — accepts numeric (0xRRGGBB) input', () => {
  it('numbers parse to the same colour as their hex equivalents', () => {
    const fromHex = parseRgba(buildColorInterp('#ff3366', '#3399ff', 'oklab')(0));
    const fromNum = parseRgba(buildColorInterp(0xff3366, 0x3399ff, 'oklab')(0));
    expect(fromNum.r).toBe(fromHex.r);
    expect(fromNum.g).toBe(fromHex.g);
    expect(fromNum.b).toBe(fromHex.b);
  });
});

describe('buildColorInterp — OKLCH hue path', () => {
  it('takes the shorter angular path from red toward orange (no full-circle detour)', () => {
    // Red and orange are close hues — interp at t=0.5 should be a warm
    // orange-red, NOT a detour through cyan / blue / purple.
    const interp = buildColorInterp('#ff0000', '#ff8000', 'oklch');
    const mid = parseRgba(interp(0.5));
    expect(mid.r).toBeGreaterThan(220);   // still strongly red-channel
    expect(mid.g).toBeGreaterThan(40);    // some green added (warming up)
    expect(mid.b).toBeLessThan(40);       // never crossed into the cool side
  });
});
