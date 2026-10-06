import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
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

  it('warns about a mode it does not support, naming the choices, and leaves the layer alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, name: 'halo', blendMode: 'overlay' }]);
    expect(blendOf(comp, 0)).toBeUndefined();
    const msg = warn.mock.calls.map(c => String(c[0])).find(m => m.includes('blendMode'))!;
    expect(msg).toContain('layer "halo"');
    expect(msg).toContain('"overlay"');
    expect(msg).toMatch(/add.*screen.*multiply/);
  });
});
