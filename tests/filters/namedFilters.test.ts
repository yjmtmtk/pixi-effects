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
  class GpuProgram { static from(o: unknown) { return { rebuilt: true, ...(o as object) }; } }
  return { Filter, BlurFilter, NoiseFilter, AlphaFilter, ColorMatrixFilter, GpuProgram };
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
class BulgePinchFilter extends FakeFilter {}
/** pixi-filters 6.1.5's RadialBlurFilter: the JS side writes uKernelSize as an i32, the WGSL struct reads an f32. */
const wgsl = (type: string) => ({ name: 'radial-blur-filter', vertex: { source: 'v', entryPoint: 'mainVertex' }, fragment: { source: `struct RadialBlurUniforms { uRadian: f32, uKernelSize: ${type}, };`, entryPoint: 'mainFragment' } });
class RadialBlurFilter extends FakeFilter { gpuProgram: unknown; constructor(o?: Record<string, unknown>) { super(o); this.gpuProgram = wgsl((globalThis as { __kernelType?: string }).__kernelType ?? 'f32'); } }
const FAKE_LIB = { RadialBlurFilter, BulgePinchFilter, GlowFilter, CRTFilter, RGBSplitFilter, DropShadowFilter, PixelateFilter, EmbossFilter, notAFilter: class {} };
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

  it('object options are copied: animating a leaf of a point (filters.s.red.x) never writes into the author\'s spec', () => {
    registerFilterLibrary(FAKE_LIB);
    const red = { x: 0, y: 0 }, shadow = { offset: { x: 7, y: 7 }, colors: ['#fff', '#000'] };
    const f = createFilter(spec({ type: 'rgbSplit', red, extra: shadow })) as unknown as RGBSplitFilter & { opts: { red: { x: number }; extra: { offset: { x: number }; colors: string[] } } };
    f.opts.red.x = 30;                       // what a keyframe on 'filters.s.red.x' does to the filter's own object
    f.opts.extra.offset.x = 99;
    f.opts.extra.colors[0] = '#f00';
    expect(red).toEqual({ x: 0, y: 0 });
    expect(shadow).toEqual({ offset: { x: 7, y: 7 }, colors: ['#fff', '#000'] });
    expect(f.opts.red).not.toBe(red);
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

describe('an option that is undefined (a misspelt variable, a missing field) is not passed to the filter, and is said', () => {
  it('leaves the key out so the filter keeps its default (pixi-filters\' own defaults are overwritten by an explicit undefined: bloom then fails with "reading x" at init)', () => {
    registerFilterLibrary(FAKE_LIB);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = createFilter(spec({ type: 'glow', outerStrength: undefined, color: '#ffd166' })) as unknown as GlowFilter;
    expect('outerStrength' in (f.opts ?? {})).toBe(false);
    expect(f.opts).toEqual({ color: '#ffd166' });
  });

  it('works for pixi.js\'s own filters and for the single-value ones too', () => {
    registerFilterLibrary(FAKE_LIB);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(Object.keys((createFilter(spec({ type: 'blur', strength: undefined })) as unknown as { opts: object }).opts)).toEqual([]);
    expect((createFilter(spec({ type: 'pixelate', size: undefined })) as unknown as PixelateFilter).size).toBeUndefined();
  });

  it('warns once per filter, naming the filter and the options, and says the default is used', () => {
    registerFilterLibrary(FAKE_LIB);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createFilter(spec({ type: 'glow', outerStrength: undefined, distance: undefined }));
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain('glow');
    expect(text).toContain('outerStrength');
    expect(text).toContain('distance');
    expect(text).toMatch(/undefined/);
    expect(text).toMatch(/default/);
  });

  it('is silent when every option has a value', () => {
    registerFilterLibrary(FAKE_LIB);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createFilter(spec({ type: 'glow', outerStrength: 3 }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('needsFilterLibrary / ensureFilterLibrary', () => {
  const comp = (filters: unknown[]) => ({ sequences: [{ type: 'composition', sequences: [{ type: 'text', filters }] }] });

  it('finds a named library filter anywhere in the composition (nested layers, masks)', () => {
    expect(needsFilterLibrary(comp([{ type: 'glow' }]))).toBe(true);
    expect(needsFilterLibrary({ sequences: [{ type: 'shape', mask: { type: 'shape', filters: [{ type: 'pixelate' }] } }] })).toBe(true);
  });

  it('finds it in a mask written as { layer: <spec>, invert }, and rejects an unknown type there too', () => {
    expect(needsFilterLibrary({ sequences: [{ type: 'shape', mask: { layer: { type: 'shape', filters: [{ type: 'glow' }] }, invert: true } }] })).toBe(true);
    expect(() => needsFilterLibrary({ sequences: [{ type: 'shape', mask: { layer: { type: 'shape', filters: [{ type: 'glwo' }] }, invert: true } }] })).toThrow(/glwo/);
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

describe('bulgePinch.center is a fraction of the layer (0-1), not pixels: a pixel-looking value is said, since it moves the bulge out of the layer and nothing shows', () => {
  beforeEach(() => { registerFilterLibrary(FAKE_LIB); vi.restoreAllMocks(); });

  it('warns for { x: 900, y: 500 } (and an [x, y] array), naming what to write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createFilter(spec({ type: 'bulgePinch', center: { x: 900, y: 500 }, radius: 190, strength: 0.8 }));
    expect(warn).toHaveBeenCalledTimes(1);
    const m = String(warn.mock.calls[0]![0]);
    expect(m).toMatch(/bulgePinch\.center is 0-1 of the layer/);
    expect(m).toMatch(/\{ x: 0\.5, y: 0\.5 \} is its middle/);
    expect(m).toMatch(/900/);
    createFilter(spec({ type: 'bulgePinch', center: [900, 500] }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('is silent for a fraction, for no centre, and for a point a little outside the layer (1.2)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createFilter(spec({ type: 'bulgePinch', center: { x: 0.5, y: 0.5 } }));
    createFilter(spec({ type: 'bulgePinch', radius: 100 }));
    createFilter(spec({ type: 'bulgePinch', center: { x: 1.2, y: -0.2 } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('other filters keep centres in pixels: twist.offset 640 is not warned about', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerFilterLibrary({ ...FAKE_LIB, TwistFilter: class extends FakeFilter {} });
    createFilter(spec({ type: 'twist', offset: { x: 640, y: 360 } }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('radialBlur on WebGPU: pixi-filters declares uKernelSize as i32 in JS but f32 in WGSL, so the blur was skipped (the filter did nothing on the default backend)', () => {
  beforeEach(() => { registerFilterLibrary(FAKE_LIB); });

  it('the filter is built with a WGSL that reads uKernelSize as an i32 like the JS side writes it', () => {
    (globalThis as { __kernelType?: string }).__kernelType = 'f32';
    const f = createFilter(spec({ type: 'radialBlur', angle: 40, kernelSize: 15 })) as unknown as { gpuProgram: { rebuilt?: boolean; fragment: { source: string; entryPoint: string }; vertex: { source: string } } };
    expect(f.gpuProgram.rebuilt).toBe(true);
    expect(f.gpuProgram.fragment.source).toContain('uKernelSize: i32,');
    expect(f.gpuProgram.fragment.source).not.toContain('uKernelSize: f32');
    expect(f.gpuProgram.fragment.entryPoint).toBe('mainFragment');
    expect(f.gpuProgram.vertex.source).toBe('v');
  });

  it('a pixi-filters that has fixed it is left alone', () => {
    (globalThis as { __kernelType?: string }).__kernelType = 'i32';
    const f = createFilter(spec({ type: 'radialBlur', angle: 40 })) as unknown as { gpuProgram: { rebuilt?: boolean } };
    expect(f.gpuProgram.rebuilt).toBeUndefined();
    delete (globalThis as { __kernelType?: string }).__kernelType;
  });
});
