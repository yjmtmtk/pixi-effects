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

  it('the basic modes behave exactly as before (the last filter carries the mode)', async () => {
    const f1: Record<string, unknown> = { apply() {} };
    await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'screen', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    expect(f1.blendMode).toBe('screen');
    expect(made).toHaveLength(0);
  });
});
