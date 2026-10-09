import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { setBlendFilterFactory } from '../../src/core/blend';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  return comp;
}
const blendOf = (comp: CompositionSequence, i: number) => {
  const l = comp.layers()[i]!;
  return (l.display as unknown as { blendMode?: string }).blendMode;
};
beforeEach(() => { vi.restoreAllMocks(); });

describe('blendMode on a layer', () => {
  it('add / screen / multiply are set on the layer\'s display object; the default is untouched', async () => {
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 10, blendMode: 'add' },
      { type: 'shape', shape: 'circle', radius: 10, blendMode: 'screen' },
      { type: 'text', text: 'a', blendMode: 'multiply' },
      { type: 'shape', shape: 'circle', radius: 10 },
    ]);
    expect([0, 1, 2].map(i => blendOf(comp, i))).toEqual(['add', 'screen', 'multiply']);
    expect(blendOf(comp, 3)).toBeUndefined();
  });

  it('applies to a composition (the whole group blends) and to a threeD layer\'s mesh', async () => {
    const comp = await build([
      { type: 'composition', width: 200, height: 200, blendMode: 'add', sequences: [{ type: 'shape', shape: 'circle', radius: 10 }] },
      { type: 'shape', shape: 'circle', radius: 10, threeD: true, blendMode: 'screen' },
    ]);
    expect(blendOf(comp, 0)).toBe('add');
    expect(blendOf(comp, 1)).toBe('screen');
  });

  it('warns about a mode it does not support, with the likely name and the choices, and leaves the layer alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, name: 'halo', blendMode: 'softlight' }]);
    expect(blendOf(comp, 0)).toBeUndefined();
    const msg = warn.mock.calls.map(c => String(c[0])).find(m => m.includes('blendMode'))!;
    expect(msg).toContain('layer "halo"');
    expect(msg).toContain('"softlight"');
    expect(msg).toContain('did you mean "soft-light"?');
    expect(msg).toMatch(/add.*screen.*multiply/);
  });

  it('a layer with filters blends through its LAST filter, not the container (a container blend applies inside the filter pass: multiply rendered black)', async () => {
    const f1: Record<string, unknown> = { apply() {} }, f2: Record<string, unknown> = { apply() {} };
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 10, blendMode: 'multiply',
        filters: [{ type: 'custom', name: 'a', filter: f1 }, { type: 'custom', name: 'b', filter: f2 }] },
      { type: 'shape', shape: 'circle', radius: 10, blendMode: 'add' },
    ]);
    expect(blendOf(comp, 0)).toBeUndefined();            // the container stays normal
    expect(f1.blendMode).toBeUndefined();                // intermediate passes stay normal
    expect(f2.blendMode).toBe('multiply');               // only the pass that draws onto the backdrop blends
    expect(blendOf(comp, 1)).toBe('add');                // layers without filters are unchanged
  });
});

describe('an advanced blendMode', () => {
  const made: Array<{ mode: string; blendMode?: unknown; destroy(): void }> = [];
  beforeEach(() => {
    made.length = 0;
    setBlendFilterFactory(mode => { const f = { mode, destroy() {} }; made.push(f); return f; });
  });

  it('on a layer with no filters is set on the display object, like the basic modes (Pixi draws it through the registered filter)', async () => {
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'soft-light' }]);
    expect(blendOf(comp, 0)).toBe('soft-light');
    expect(made).toHaveLength(0);
  });

  it('on a layer WITH filters becomes one more filter, last in the chain (a mode on the last filter would only blend a basic mode)', async () => {
    const f1: Record<string, unknown> = { apply() {} };
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    const display = comp.layers()[0]!.display as unknown as { filters: unknown[]; blendMode?: string };
    expect(display.filters).toHaveLength(2);
    expect(display.filters[0]).toBe(f1);
    expect((display.filters[1] as { mode: string }).mode).toBe('overlay');
    expect(f1.blendMode).toBeUndefined();            // the layer's own filter stays normal
    expect(display.blendMode).toBeUndefined();       // and so does the container
  });

  it('with the blends not registered (no factory), a layer with filters warns once and draws normal; one without filters is left to Pixi', async () => {
    setBlendFilterFactory(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f1: Record<string, unknown> = { apply() {} };
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, name: 'glow', blendMode: 'overlay', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    const display = comp.layers()[0]!.display as unknown as { filters: unknown[] };
    expect(display.filters).toHaveLength(1);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('blendMode'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('layer "glow"');
    expect(said[0]).toMatch(/not set up|could not/);
  });

  it('with the blends not registered, a layer with NO filters warns too (it used to be left to Pixi\'s own message) and is drawn normal', async () => {
    setBlendFilterFactory(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, name: 'glow', blendMode: 'soft-light' }]);
    expect(blendOf(comp, 0)).toBeUndefined();
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('blendMode'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('layer "glow"');
    expect(said[0]).toMatch(/not registered/);
  });

  it('the basic modes behave exactly as before (the last filter carries the mode)', async () => {
    const f1: Record<string, unknown> = { apply() {} };
    await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'screen', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    expect(f1.blendMode).toBe('screen');
    expect(made).toHaveLength(0);
  });
});

describe('the same blendMode mistake in many layers', () => {
  it('is said once for a composition, however many layers have it (particles make hundreds); a different mistake is said again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: 40 }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 5, name: 'p' + i, blendMode: 'softlight' }));
    await build([...many, { type: 'shape', shape: 'circle', radius: 5, name: 'other', blendMode: 'glow' }]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('blendMode'));
    expect(said).toHaveLength(2);
    expect(said[0]).toContain('layer "p0"');
    expect(said[0]).toMatch(/40 layers|and 39 more/);
  });
});

describe('an inline mask that goes through the matte filter (inverted, text, image, video)', () => {
  const hole = { type: 'shape', shape: 'circle', radius: 15 };
  const layer = (extra: Record<string, unknown>) => ({ type: 'shape', shape: 'rect', width: 50, height: 50, name: 'lit', ...extra });
  const matteFilters = (display: unknown) => ((display as { filters?: Array<{ constructor: { name: string } }> }).filters ?? []).filter(f => f.constructor.name === 'MatteFilter');

  it('maskInverted: the layer has an inverted MatteFilter, the mask is not drawn, no alpha mask effect, no wrapper group', async () => {
    const comp = await build([layer({ mask: hole, maskInverted: true })]);
    const [l] = comp.layers();
    const filters = matteFilters(l!.display) as unknown as Array<{ resources: { matteUniforms: { uniforms: { uInvert: number } } } }>;
    expect(filters).toHaveLength(1);
    expect(filters[0]!.resources.matteUniforms.uniforms.uInvert).toBe(1);
    expect((l!.display as unknown as { effects: unknown[] }).effects).toHaveLength(0);
    // the layer and the matte's hidden sprite: no mask shape in the scene, no wrapper
    expect(((comp.target as unknown as { children: Array<{ children: unknown[] }> }).children[0]!).children).toHaveLength(2);
  });

  it('a text, image or video mask is a matte too (alpha)', async () => {
    for (const mask of [{ type: 'text', text: 'I' }, { type: 'image', asset: 'a' }]) {
      const comp = await build([layer({ mask })]);
      expect(matteFilters(comp.layers()[0]!.display), mask.type).toHaveLength(1);
    }
  });

  it('a plain shape mask is still the stencil: no filter, no matte sprite', async () => {
    const comp = await build([layer({ mask: hole })]);
    expect(matteFilters(comp.layers()[0]!.display)).toHaveLength(0);
  });

  it('blendMode with such a mask is applied after the matte (no warning that the blend is lost any more)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([layer({ blendMode: 'multiply', mask: { type: 'text', text: 'I' } }), layer({ blendMode: 'add', mask: hole, maskInverted: true, name: 'lit2' })]);
    const [a, b] = comp.layers();
    const lastOf = (d: unknown) => ((d as { filters: Array<{ blendMode?: string }> }).filters).slice(-1)[0]!;
    expect(lastOf(a!.display).blendMode).toBe('multiply');
    expect(lastOf(b!.display).blendMode).toBe('add');
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('as the mask'))).toEqual([]);
  });

  it('an advanced blend is a filter after the matte filter', async () => {
    setBlendFilterFactory(mode => ({ mode, destroy() {} } as never));
    const comp = await build([layer({ blendMode: 'overlay', mask: hole, maskInverted: true })]);
    const names = ((comp.layers()[0]!.display as unknown as { filters: Array<{ constructor: { name: string }; mode?: string }> }).filters).map(f => f.mode ?? f.constructor.name);
    expect(names).toEqual(['MatteFilter', 'overlay']);
  });

  it('destroy() destroys the matte filter and the blend filter it made, so no GPU object is left behind', async () => {
    const made: Array<{ mode: string; destroyed: boolean; destroy(): void }> = [];
    setBlendFilterFactory(mode => { const f = { mode, destroyed: false, destroy() { f.destroyed = true; } }; made.push(f); return f as never; });
    const comp = await build([layer({ blendMode: 'overlay', mask: { type: 'text', text: 'I' } })]);
    const [matte] = matteFilters(comp.layers()[0]!.display);
    const destroy = vi.spyOn(matte as unknown as { destroy(): void }, 'destroy');
    comp.destroy();
    expect(made).toHaveLength(1);
    expect(made[0]!.destroyed).toBe(true);
    expect(destroy).toHaveBeenCalled();
  });
});

describe('many advanced blends at once', () => {
  it('a composition with an advanced mode counts each layer inside it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const inside = Array.from({ length: 12 }, () => ({ type: 'shape', shape: 'circle', radius: 10 }));
    await build([{ type: 'composition', width: 200, height: 200, blendMode: 'overlay', sequences: inside }]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('advanced blendMode'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/12 layers/);
  });

  it('warns once when 10 or more layers with an advanced mode are on screen together, and not for a slideshow of them', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pile = Array.from({ length: 12 }, () => ({ type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay' }));
    await build(pile);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('advanced blendMode'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/12 layers/);
    warn.mockClear();
    const slides = Array.from({ length: 12 }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay', at: i * 0.5, duration: 0.5 }));
    await build(slides);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('advanced blendMode'))).toEqual([]);
  });
});
