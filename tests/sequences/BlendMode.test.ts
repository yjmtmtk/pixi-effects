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

describe('blendMode on a layer with an inverted mask', () => {
  // an inverted mask is an alpha mask: the layer is drawn into a texture first and its own blend mode would apply inside it, against nothing
  // (multiply rendered black), and Pixi skips a parent's filter when a masked layer is inside. So the layer goes into a group whose one
  // filter blends, with the mask shape drawn over it with the `erase` blend (no alpha mask).
  const innerOf = (comp: CompositionSequence) => ((comp.target as unknown as { children: Array<{ children: unknown[] }> }).children[0]!);
  const hole = { type: 'shape', shape: 'circle', radius: 15 };
  const layer = (extra: Record<string, unknown>) => ({ type: 'shape', shape: 'rect', width: 50, height: 50, name: 'lit', ...extra });
  type Wrap = { children: Array<{ blendMode?: string; effects?: unknown[] }>; filters: Array<{ blendMode?: string; mode?: string }> };

  it('a basic mode: the group\'s one filter carries the mode; the layer stays normal and has no alpha mask; the mask shape erases', async () => {
    const comp = await build([layer({ blendMode: 'multiply', mask: hole, maskInverted: true })]);
    const wrap = innerOf(comp).children[0] as unknown as Wrap;
    const target = comp._children[0]!.target as unknown as { blendMode?: string; effects: unknown[] };
    expect(wrap.children[0]).toBe(target);
    expect(wrap.children).toHaveLength(2);
    expect(wrap.children[1]!.blendMode).toBe('erase');
    expect(wrap.filters).toHaveLength(1);
    expect(wrap.filters[0]!.blendMode).toBe('multiply');
    expect(target.blendMode).toBeUndefined();
    expect(target.effects).toHaveLength(0);
  });

  it('a mask with a filter of its own (a feathered hole) carries the erase on its LAST filter: a blend on the container would apply inside the filter pass and erase nothing', async () => {
    const f1: Record<string, unknown> = { apply() {} };
    const comp = await build([layer({ blendMode: 'multiply', maskInverted: true,
      mask: { ...hole, filters: [{ type: 'custom', name: 'soft', filter: f1 }] } })]);
    const wrap = innerOf(comp).children[0] as unknown as Wrap;
    expect(f1.blendMode).toBe('erase');
    expect(wrap.children[1]!.blendMode).toBeUndefined();
  });

  it('an advanced mode: the group\'s filter is the blend filter', async () => {
    const made: Array<{ mode: string; destroy(): void }> = [];
    setBlendFilterFactory(mode => { const f = { mode, destroy() {} }; made.push(f); return f; });
    const comp = await build([layer({ blendMode: 'overlay', mask: hole, maskInverted: true })]);
    const wrap = innerOf(comp).children[0] as unknown as Wrap;
    expect(wrap.filters).toHaveLength(1);
    expect(wrap.filters[0]!.mode).toBe('overlay');
    expect(wrap.children[1]!.blendMode).toBe('erase');
  });

  it('an advanced mode with the blends not registered warns once and draws the layer normal (no group filter)', async () => {
    setBlendFilterFactory(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([layer({ blendMode: 'overlay', mask: hole, maskInverted: true })]);
    const wrap = innerOf(comp).children[0] as unknown as Wrap;
    expect(wrap.filters ?? []).toHaveLength(0);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('blendMode'))).toHaveLength(1);
  });

  it('nothing changes without an inverted mask or without a blend mode: no group, the mask works as before', async () => {
    const comp = await build([
      layer({ blendMode: 'multiply', mask: hole }),                       // a stencil mask: the blend works as it is
      layer({ mask: hole, maskInverted: true }),                          // an inverted mask but no blend
      layer({ blendMode: 'add' }),
    ]);
    const kids = innerOf(comp).children as unknown[];
    const targets = comp._children.map(c => c.target);
    expect(kids).toContain(targets[0]);
    expect(kids).toContain(targets[1]);
    expect(kids).toContain(targets[2]);
    expect((targets[1] as unknown as { effects: unknown[] }).effects).toHaveLength(1);    // still an alpha mask effect
  });
});

describe('a blendMode on a layer destroyed with its composition', () => {
  it('destroys the blend filter it added and the group (with its filter) it made, so no GPU object is left behind', async () => {
    const made: Array<{ mode: string; destroyed: boolean; destroy(): void }> = [];
    setBlendFilterFactory(mode => { const f = { mode, destroyed: false, destroy() { f.destroyed = true; } }; made.push(f); return f; });
    const f1: Record<string, unknown> = { apply() {} };
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay', filters: [{ type: 'custom', name: 'a', filter: f1 }] },              // a blend filter appended
      { type: 'shape', shape: 'rect', width: 20, height: 20, blendMode: 'overlay', maskInverted: true, mask: { type: 'shape', shape: 'circle', radius: 5 } },   // a group with a blend filter
      { type: 'shape', shape: 'rect', width: 20, height: 20, blendMode: 'multiply', maskInverted: true, mask: { type: 'shape', shape: 'circle', radius: 5 } },  // a group with an AlphaFilter
    ]);
    const wraps = ((comp.target as unknown as { children: Array<{ children: Array<{ filters?: Array<{ destroyed?: boolean; destroy(): void }>; destroyed?: boolean }> }> }).children[0]!.children)
      .filter(c => Array.isArray(c.filters) && c.filters.length === 1 && c.children !== undefined && (c as unknown as { children: unknown[] }).children.length === 2);
    expect(made).toHaveLength(2);
    expect(wraps).toHaveLength(2);
    const alphaFilter = wraps.find(w => (w.filters![0] as { mode?: string }).mode === undefined)!.filters![0]! as { destroyed?: boolean; destroy(): void };
    const alphaDestroy = vi.spyOn(alphaFilter, 'destroy');
    comp.destroy();
    expect(made.every(f => f.destroyed)).toBe(true);                 // both blend filters
    expect(wraps.every(w => w.destroyed === true)).toBe(true);       // both groups
    expect(alphaDestroy).toHaveBeenCalled();                          // and the plain carrier of the multiply group
  });
});

describe('blendMode on a layer masked by a text layer', () => {
  it('warns once (the blend is lost in the alpha mask) and leaves the layer normal; no warning without a blend mode, or with an inverted shape mask', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = { type: 'text', text: 'I' };
    const comp = await build([{ type: 'shape', shape: 'rect', width: 50, height: 50, name: 'lit', blendMode: 'multiply', mask: text }]);
    expect(blendOf(comp, 0)).toBeUndefined();
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('text layer as the mask'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('layer "lit"');
    warn.mockClear();
    // an image or a video layer as the mask is the same (a Sprite mask is an alpha mask)
    await build([{ type: 'shape', shape: 'rect', width: 50, height: 50, name: 'lit2', blendMode: 'multiply', mask: { type: 'image', asset: 'a' } }]);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('image layer as the mask'))).toHaveLength(1);
    warn.mockClear();
    await build([{ type: 'shape', shape: 'rect', width: 50, height: 50, mask: text }]);
    await build([{ type: 'shape', shape: 'rect', width: 50, height: 50, blendMode: 'multiply', mask: { type: 'shape', shape: 'circle', radius: 5 }, maskInverted: true }]);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('text layer as the mask'))).toEqual([]);
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
