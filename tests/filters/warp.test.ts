import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { WarpFilter, warpOffset, WARP_KINDS } from '../../src/filters/Warp';
import { createFilter } from '../../src/filters';
import { FILTER_TYPES } from '../../src/filters/named';
import { suggestName } from '../../src/core/options';

const wave = { strength: 8, scale: 100, speed: 0, angle: 0, seed: 0 };
const uniforms = (f: WarpFilter) => (f.resources.warpUniforms as unknown as { uniforms: Record<string, number> }).uniforms;
beforeEach(() => { vi.restoreAllMocks(); });

describe('warpOffset: wave (worked by hand)', () => {
  it('a wave travelling to the right shifts a pixel up and down by strength × sin(2π · x / scale)', () => {
    expect(warpOffset('wave', 0, 7, 0, wave).dy).toBeCloseTo(0, 12);
    expect(warpOffset('wave', 25, 7, 0, wave).dy).toBeCloseTo(8, 12);       // a quarter wavelength: the crest
    expect(warpOffset('wave', 50, 7, 0, wave).dy).toBeCloseTo(0, 12);
    expect(warpOffset('wave', 75, 7, 0, wave).dy).toBeCloseTo(-8, 12);
    expect(warpOffset('wave', 25, 7, 0, wave).dx).toBeCloseTo(0, 12);       // it moves the picture along the crest, not along the travel
  });
  it('time moves the wave: at speed 1 the crest that was at x = 25 is at x = 50 a quarter cycle later', () => {
    const o = { ...wave, speed: 1 };
    expect(warpOffset('wave', 25, 0, 0, o).dy).toBeCloseTo(8, 12);
    expect(warpOffset('wave', 25, 0, 0.25, o).dy).toBeCloseTo(0, 12);       // the phase is x / scale − speed · t = 0.25 − 0.25
    expect(warpOffset('wave', 50, 0, 0.25, o).dy).toBeCloseTo(8, 12);       // the crest is now at x = 50
    expect(warpOffset('wave', 0, 0, 0.25, o).dy).toBeCloseTo(-8, 12);       // and x = 0 is in the trough (phase −0.25)
  });
  it('at 90 degrees the wave travels down and shifts the picture sideways (dx = −strength · sin)', () => {
    const o = { ...wave, angle: 90 };
    const r = warpOffset('wave', 3, 25, 0, o);
    expect(r.dx).toBeCloseTo(-8, 12);
    expect(r.dy).toBeCloseTo(0, 6);
  });
  it('strength 0 shifts nothing', () => {
    expect(warpOffset('wave', 25, 3, 1, { ...wave, strength: 0 })).toEqual({ dx: -0, dy: 0 });
  });
});

describe('warpOffset: haze (constants from an independent Python implementation of the shader\'s integer hash and value noise)', () => {
  const h = { strength: 10, scale: 100, speed: 0, angle: 0, seed: 0 };
  it('matches the independent values to 1e-9', () => {
    const a = warpOffset('haze', 100, 50, 0, h);
    expect(a.dx).toBeCloseTo(2.300570148263583, 9); expect(a.dy).toBeCloseTo(-1.6126490188889964, 9);
    const b = warpOffset('haze', 130, 70, 0.5, { strength: 8, scale: 60, speed: 0.5, angle: 0, seed: 3 });
    expect(b.dx).toBeCloseTo(-1.2975062488677294, 9); expect(b.dy).toBeCloseTo(1.047937107775807, 9);
    const c = warpOffset('haze', -20, 10, 0, h);                              // negative lattice coordinates wrap like the shader's uint()
    expect(c.dx).toBeCloseTo(-9.00364608223713, 9); expect(c.dy).toBeCloseTo(-9.019249600127333, 9);
  });
  it('a pure function: the same input, the same output; another seed, another pattern; strength 0 and speed 0 behave', () => {
    expect(warpOffset('haze', 41, 17, 2, h)).toEqual(warpOffset('haze', 41, 17, 2, h));
    expect(warpOffset('haze', 41, 17, 0, { ...h, seed: 1 })).not.toEqual(warpOffset('haze', 41, 17, 0, h));
    const still = warpOffset('haze', 41, 17, 0, h);
    expect(warpOffset('haze', 41, 17, 9, h)).toEqual(still);                  // speed 0: time does not matter
    expect(warpOffset('haze', 41, 17, 9, { ...h, speed: 1 })).not.toEqual(still);
    expect(Math.abs(warpOffset('haze', 41, 17, 0, { ...h, strength: 0 }).dx)).toBe(0);
  });
  it('never shifts by more than strength', () => {
    for (let i = 0; i < 200; i++) {
      const r = warpOffset('haze', i * 13.7, i * 7.3, i * 0.1, { strength: 10, scale: 40, speed: 1, angle: 0, seed: 5 });
      expect(Math.abs(r.dx)).toBeLessThanOrEqual(10); expect(Math.abs(r.dy)).toBeLessThanOrEqual(10);
    }
  });
});

describe('WarpFilter', () => {
  it('the options are uniforms; kind chooses the mode; the angle is in degrees; the filter pads by the strength', () => {
    const f = new WarpFilter({ kind: 'haze', strength: 12.2, scale: 50, speed: 2, angle: 90, seed: 4.7 });
    expect(uniforms(f)).toMatchObject({ uStrength: 12.2, uScale: 50, uSpeed: 2, uSeed: 4, uMode: 1 });
    expect(uniforms(f).uAngle).toBeCloseTo(Math.PI / 2, 12);
    expect(f.padding).toBe(13);
    expect(f.angle).toBeCloseTo(90, 9);
    expect(new WarpFilter().kind).toBe('wave');
  });
  it('setTime hands the frame\'s time to the shader; GSAP can move the options (getters and setters)', () => {
    const f = new WarpFilter();
    f.setTime(1.25);
    expect(uniforms(f).uTime).toBe(1.25);
    f.strength = 20; f.scale = 30; f.speed = 3; f.angle = 45; f.seed = 2; f.kind = 'haze';
    expect(uniforms(f)).toMatchObject({ uStrength: 20, uScale: 30, uSpeed: 3, uSeed: 2, uMode: 1 });
    expect(f.padding).toBe(20);
  });
  it('a kind, strength or scale that makes no sense is said once with what to write, and replaced', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = new WarpFilter({ kind: 'ripple' as never });
    const b = new WarpFilter({ strength: -3 });
    const c = new WarpFilter({ strength: 500 });
    const d = new WarpFilter({ scale: 0 });
    const said = warn.mock.calls.map(x => String(x[0]));
    expect(said).toHaveLength(4);
    expect(said[0]).toContain('kind "ripple"'); expect(said[0]).toContain('wave or haze');
    expect(a.kind).toBe('wave');
    expect(said[1]).toContain('strength -3'); expect(b.strength).toBe(0);
    expect(said[2]).toContain('strength 500'); expect(c.strength).toBe(200);
    expect(said[3]).toContain('scale 0'); expect(uniforms(d).uScale).toBe(1);
  });
  it('a negative seed is said once and is 0 (the three code paths would otherwise draw three different pictures)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = new WarpFilter({ kind: 'haze', seed: -3 });
    expect(uniforms(f).uSeed).toBe(0);
    expect(warn.mock.calls.map(x => String(x[0])).filter(m => m.includes('seed'))).toHaveLength(1);
    f.seed = -9;
    expect(uniforms(f).uSeed).toBe(0);
  });
  it('an option nobody knows is warned about (a typo)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new WarpFilter({ strenght: 5 } as never);
    expect(warn.mock.calls.map(x => String(x[0])).some(m => m.includes('strenght'))).toBe(true);
  });
});

describe('the warp filter by name', () => {
  it('{ type: \'warp\' } builds it and a name makes its options animatable', () => {
    const f = createFilter({ type: 'warp', name: 'heat', kind: 'haze', strength: 5 } as never);
    expect(f).toBeInstanceOf(WarpFilter);
    expect((f as unknown as { _name?: string })._name).toBe('heat');
    expect((f as unknown as WarpFilter).kind).toBe('haze');
  });
  it('warp is a filter type, and the names other programs use point to it', () => {
    expect(FILTER_TYPES).toContain('warp');
    for (const alias of ['distort', 'displace', 'ripple', 'wavy', 'heatHaze', 'haze']) expect(suggestName(alias, FILTER_TYPES), alias).toBe('warp');
    expect(WARP_KINDS).toEqual(['wave', 'haze']);
  });
});
