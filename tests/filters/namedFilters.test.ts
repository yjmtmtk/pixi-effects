import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pixi.js', () => {
  class Filter { apply() { /* duck-type marker */ } }
  class BlurFilter extends Filter { opts: unknown; constructor(o?: unknown) { super(); this.opts = o; } }
  class NoiseFilter extends Filter { opts: unknown; constructor(o?: unknown) { super(); this.opts = o; } }
  class AlphaFilter extends Filter { opts: unknown; constructor(o?: unknown) { super(); this.opts = o; } }
  class ColorMatrixFilter extends Filter {
    matrix: number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    calls: string[] = [];
    sepia() { this.calls.push('sepia'); }
    desaturate() { this.calls.push('desaturate'); }
    negative() { this.calls.push('negative'); }
  }
  return { Filter, BlurFilter, NoiseFilter, AlphaFilter, ColorMatrixFilter };
});

import { createFilter } from '../../src/filters';
import { registerFilterLibrary, resetFilterLibrary, needsFilterLibrary, ensureFilterLibrary, FILTER_TYPES } from '../../src/filters/named';
import type { FilterSpec } from '../../src/types';

class FakeFilter { apply() { /* duck-type marker */ } constructor(public opts?: Record<string, unknown>) {} }
class GlowFilter extends FakeFilter {}
class CRTFilter extends FakeFilter {}
class RGBSplitFilter extends FakeFilter {}
class DropShadowFilter extends FakeFilter {}
/** pixi-filters' PixelateFilter and EmbossFilter take their value as the first argument, not as options. */
class PixelateFilter { apply() { /* duck-type marker */ } constructor(public size?: unknown) {} }
class EmbossFilter { apply() { /* duck-type marker */ } constructor(public strength?: unknown) {} }
const FAKE_LIB = { GlowFilter, CRTFilter, RGBSplitFilter, DropShadowFilter, PixelateFilter, EmbossFilter, notAFilter: class {} };
const spec = (s: Record<string, unknown>) => s as unknown as FilterSpec;

beforeEach(() => { resetFilterLibrary(); });

describe('declarative filters: { type: "glow", … }', () => {
  it('builds a pixi-filters filter from its name, passing the other keys as its options', () => {
    registerFilterLibrary(FAKE_LIB);
    const f = createFilter(spec({ type: 'glow', name: 'halo', outerStrength: 3, color: '#ffd166' })) as unknown as GlowFilter & { _name?: string };
    expect(f).toBeInstanceOf(GlowFilter);
    expect(f.opts).toEqual({ outerStrength: 3, color: '#ffd166' });          // type and name are ours, not the filter's
    expect(f._name).toBe('halo');
  });

  it('finds the class by name, ignoring case (crt → CRTFilter, rgbSplit → RGBSplitFilter, dropShadow → DropShadowFilter)', () => {
    registerFilterLibrary(FAKE_LIB);
    expect(createFilter(spec({ type: 'crt' }))).toBeInstanceOf(CRTFilter);
    expect(createFilter(spec({ type: 'rgbSplit' }))).toBeInstanceOf(RGBSplitFilter);
    expect(createFilter(spec({ type: 'dropShadow' }))).toBeInstanceOf(DropShadowFilter);
  });

  it('pixelate and emboss take one plain value, so { size } and { strength } are passed as that value', () => {
    registerFilterLibrary(FAKE_LIB);
    expect((createFilter(spec({ type: 'pixelate', size: 8 })) as unknown as PixelateFilter).size).toBe(8);
    expect((createFilter(spec({ type: 'pixelate', size: [8, 12] })) as unknown as PixelateFilter).size).toEqual([8, 12]);
    expect((createFilter(spec({ type: 'emboss', strength: 6 })) as unknown as EmbossFilter).strength).toBe(6);
    expect((createFilter(spec({ type: 'pixelate' })) as unknown as PixelateFilter).size).toBeUndefined();
  });

  it('colorGradient: the filter\'s own `type` option would clash with the DSL\'s `type`, so it is called gradientType', () => {
    registerFilterLibrary({ ColorGradientFilter: class extends FakeFilter {} });
    const f = createFilter(spec({ type: 'colorGradient', gradientType: 'radial', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] })) as unknown as { opts: Record<string, unknown> };
    expect(f.opts.type).toBe(1);                                    // RADIAL
    expect('gradientType' in f.opts).toBe(false);
    expect((createFilter(spec({ type: 'colorGradient', gradientType: 'conic' })) as unknown as { opts: Record<string, unknown> }).opts.type).toBe(2);
    expect((createFilter(spec({ type: 'colorGradient' })) as unknown as { opts: Record<string, unknown> }).opts.type).toBeUndefined();   // the filter's own default: linear
    expect(() => createFilter(spec({ type: 'colorGradient', gradientType: 'spiral' }))).toThrow(/gradientType "spiral".*linear, radial or conic/s);
  });

  it('pixi.js\'s own filters need no extra package: blur, noise, alpha', () => {
    expect((createFilter(spec({ type: 'blur', strength: 8 })) as unknown as { opts: unknown }).opts).toEqual({ strength: 8 });
    expect((createFilter(spec({ type: 'noise', noise: 0.3, seed: 2 })) as unknown as { opts: unknown }).opts).toEqual({ noise: 0.3, seed: 2 });
    expect((createFilter(spec({ type: 'alpha', alpha: 0.5 })) as unknown as { opts: unknown }).opts).toEqual({ alpha: 0.5 });
  });

  it('colorMatrix takes a preset (sepia, grayscale, negative) or a 20-number matrix', () => {
    const sepia = createFilter(spec({ type: 'colorMatrix', preset: 'sepia' })) as unknown as { calls: string[] };
    expect(sepia.calls).toEqual(['sepia']);
    const gray = createFilter(spec({ type: 'colorMatrix', preset: 'grayscale' })) as unknown as { calls: string[] };
    expect(gray.calls).toEqual(['desaturate']);
    const m = Array.from({ length: 20 }, (_, i) => i);
    expect((createFilter(spec({ type: 'colorMatrix', matrix: m })) as unknown as { matrix: number[] }).matrix).toEqual(m);
  });

  it('an unknown type names the closest valid one', () => {
    registerFilterLibrary(FAKE_LIB);
    expect(() => createFilter(spec({ type: 'glwo' }))).toThrow(/unknown filter type "glwo".*did you mean "glow"/s);
    expect(() => createFilter(spec({ type: 'blurr' }))).toThrow(/did you mean "blur"/);
  });

  it('a library filter used before pixi-filters is loaded says what to do', () => {
    expect(() => createFilter(spec({ type: 'glow' }))).toThrow(/pixi-filters/);
  });

  it('lists every type it can build', () => {
    expect(FILTER_TYPES).toEqual(expect.arrayContaining(['blur', 'noise', 'alpha', 'colorMatrix', 'glow', 'crt', 'rgbSplit', 'dropShadow', 'oldFilm', 'pixelate', 'adjustment']));
    expect(FILTER_TYPES.length).toBeGreaterThanOrEqual(40);
  });
});

describe('needsFilterLibrary / ensureFilterLibrary', () => {
  const comp = (filters: unknown[]) => ({ sequences: [{ type: 'composition', sequences: [{ type: 'text', filters }] }] });

  it('finds a named library filter anywhere in the composition (nested layers, masks)', () => {
    expect(needsFilterLibrary(comp([{ type: 'glow' }]))).toBe(true);
    expect(needsFilterLibrary({ sequences: [{ type: 'shape', mask: { type: 'shape', filters: [{ type: 'pixelate' }] } }] })).toBe(true);
  });

  it('is false for pixi.js\'s own filters, chromaKey, custom and a composition with no filters', () => {
    expect(needsFilterLibrary(comp([{ type: 'blur' }, { type: 'colorMatrix', preset: 'sepia' }, { type: 'chromaKey' }, { type: 'custom', filter: {} }]))).toBe(false);
    expect(needsFilterLibrary({ sequences: [{ type: 'text' }] })).toBe(false);
  });

  it('loads pixi-filters once, only when needed', async () => {
    const load = vi.fn(async () => FAKE_LIB);
    await ensureFilterLibrary(comp([{ type: 'blur' }]), load);
    expect(load).not.toHaveBeenCalled();
    await ensureFilterLibrary(comp([{ type: 'glow' }]), load);
    await ensureFilterLibrary(comp([{ type: 'crt' }]), load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(createFilter(spec({ type: 'glow' }))).toBeInstanceOf(GlowFilter);
  });

  it('a missing pixi-filters package says how to add it (import map entry or npm)', async () => {
    const load = async () => { throw new Error('Failed to resolve module specifier "pixi-filters"'); };
    await expect(ensureFilterLibrary(comp([{ type: 'glow' }]), load)).rejects.toThrow(/pixi-filters.*import map.*npm i pixi-filters/s);
  });

  it('an unknown type is reported before anything is loaded', async () => {
    const load = vi.fn(async () => FAKE_LIB);
    await expect(ensureFilterLibrary(comp([{ type: 'glwo' }]), load)).rejects.toThrow(/did you mean "glow"/);
    expect(load).not.toHaveBeenCalled();
  });
});
