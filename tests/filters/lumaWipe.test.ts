import { describe, it, expect, vi } from 'vitest';
// the real Assets.get answers at once (undefined for a name nobody loaded); the shared mock's answers a Promise
vi.mock('pixi.js', async () => ({ ...(await import('../space/mockPixi')).createPixiMock(), Assets: { get: () => undefined } }));
import { builtInLuma, LUMA_MAPS, LumaWipeFilter } from '../../src/filters/LumaWipe';

const uniforms = (f: LumaWipeFilter) => (f.resources.lumaUniforms as unknown as { uniforms: Record<string, number> }).uniforms;

describe('the built-in luma maps (the same formulas as the shader)', () => {
  it('linear is left (dark) to right (light); diagonal is the corners; radial is the middle (dark) out to the corners (light), the aspect corrected', () => {
    expect(LUMA_MAPS).toEqual(['linear', 'diagonal', 'radial']);
    expect(builtInLuma('linear', 0, 0.5, 16 / 9)).toBe(0);
    expect(builtInLuma('linear', 1, 0.5, 16 / 9)).toBe(1);
    expect(builtInLuma('linear', 0.25, 0.9, 16 / 9)).toBe(0.25);
    expect(builtInLuma('diagonal', 0, 0, 1)).toBe(0);
    expect(builtInLuma('diagonal', 1, 1, 1)).toBe(1);
    expect(builtInLuma('diagonal', 1, 0, 1)).toBeCloseTo(0.5, 12);
    expect(builtInLuma('radial', 0.5, 0.5, 16 / 9)).toBe(0);
    expect(builtInLuma('radial', 0, 0, 16 / 9)).toBeCloseTo(1, 12);
    expect(builtInLuma('radial', 1, 1, 16 / 9)).toBeCloseTo(1, 12);
    // a circle on screen, not an ellipse: 0.1 of the width to the right and 0.2 of the height up are the same distance when the width is twice the height
    const a = builtInLuma('radial', 0.5 + 0.1, 0.5, 2), b = builtInLuma('radial', 0.5, 0.5 + 0.2, 2);
    expect(a).toBeCloseTo(b, 12);
  });
  it('is clamped to 0..1', () => {
    expect(builtInLuma('radial', -1, -1, 1)).toBe(1);
    expect(builtInLuma('linear', 2, 0, 1)).toBe(1);
    expect(builtInLuma('linear', -2, 0, 1)).toBe(0);
  });
});

describe('LumaWipeFilter', () => {
  it('progress is a plain number GSAP can move; softness, invert and flip are options', () => {
    const f = new LumaWipeFilter({ map: 'linear', softness: 0.2, invert: true, flip: true });
    expect(f.uProgress).toBe(0);
    f.uProgress = 0.5;
    expect(f.uProgress).toBe(0.5);
    expect(uniforms(f).uSoftness).toBe(0.2);
    expect(uniforms(f).uInvert).toBe(1);
    expect(uniforms(f).uFlip).toBe(1);
  });
  it('a built-in map needs no texture (mode 1–3); any other name is a texture asset (mode 0)', () => {
    const mode = (name: string) => uniforms(new LumaWipeFilter({ map: name })).uMode;
    expect(mode('linear')).toBe(1);
    expect(mode('diagonal')).toBe(2);
    expect(mode('radial')).toBe(3);
    expect(mode('swirl')).toBe(0);
  });
  it('an unknown map name says so once, with the likely built-in name, and still draws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const applied: unknown[] = [];
    const fm = { applyFilter: (...a: unknown[]) => applied.push(a) };
    const f = new LumaWipeFilter({ map: 'radail' });
    f.apply(fm, {}, {}, true);
    f.apply(fm, {}, {}, true);
    const said = warn.mock.calls.map(c => String(c[0]));
    warn.mockRestore();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('"radail"');
    expect(said[0]).toContain('did you mean "radial"');
    expect(applied).toHaveLength(2);
  });
  it('a built-in map never looks anything up and never warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new LumaWipeFilter({ map: 'diagonal' }).apply({ applyFilter() {} }, {}, {}, true);
    const n = warn.mock.calls.length;
    warn.mockRestore();
    expect(n).toBe(0);
  });
});
