import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, LayerSpec } from '../../src/types';

// How a composition draws itself as one picture (tests/films/composition-group proves the pixels): the group pass is in the filter list only
// while it changes the picture, so a composition at alpha 1 costs nothing.
const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
const rect = (extra: Record<string, unknown> = {}) => ({ type: 'shape', shape: 'rect', width: 10, height: 10, ...extra });
async function root(layers: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 10, layers } as unknown as LayerSpec as never, shape, shape);
  await comp.build();
  return comp;
}
type Display = { alpha: number; filters: Array<{ alpha?: number; enabled?: boolean }> | null };
const group = (comp: CompositionSequence, i = 0) => comp.layers()[i]!.display as unknown as Display;

describe('a composition is one picture: the group pass', () => {
  it('is not in the filter list at alpha 1 and at 0; between them it is, carrying the alpha; the container reads back the alpha written', async () => {
    const comp = await root([{ type: 'composition', width: 100, height: 100, layers: [rect()] }]);
    const d = group(comp);
    expect(d.filters ?? []).toEqual([]);
    d.alpha = 0.4;
    expect(d.alpha).toBe(0.4);
    expect(d.filters).toHaveLength(1);
    expect(d.filters![0]!.alpha).toBe(0.4);
    d.alpha = 0;
    expect(d.filters ?? []).toEqual([]);
    d.alpha = 1;
    expect(d.filters ?? []).toEqual([]);
  });

  it('comes after the composition\'s own filters and before what the parent added (a matte), and leaves them in place when it goes', async () => {
    const comp = await root([{ type: 'composition', width: 100, height: 100, filters: [{ type: 'alpha', alpha: 0.9 }], layers: [rect()] }]);
    const d = group(comp);
    const own = d.filters![0];
    const matte = { alpha: undefined };
    d.filters = [...d.filters!, matte];
    d.alpha = 0.5;
    expect(d.filters).toHaveLength(3);
    expect(d.filters![0]).toBe(own);
    expect(d.filters![1]!.alpha).toBe(0.5);
    expect(d.filters![2]).toBe(matte);
    d.alpha = 1;
    expect(d.filters).toEqual([own, matte]);
  });

  it('a composition with a blendMode keeps the pass at every alpha (it blends as one picture)', async () => {
    const comp = await root([{ type: 'composition', width: 100, height: 100, blendMode: 'multiply', layers: [rect()] }]);
    const d = group(comp);
    expect(d.filters).toHaveLength(1);
    d.alpha = 1;
    expect(d.filters).toHaveLength(1);
  });

  it('a composition whose layers blend with what is behind it (a blendMode, at any depth) is not isolated: its alpha goes to each layer, as before', async () => {
    for (const inner of [rect({ blendMode: 'screen' }), { type: 'composition', width: 10, height: 10, layers: [rect({ blendMode: 'add' })] }]) {
      const comp = await root([{ type: 'composition', width: 100, height: 100, layers: [inner] }]);
      const d = group(comp);
      d.alpha = 0.5;
      expect(d.filters ?? [], JSON.stringify(inner)).toEqual([]);
      expect(Object.getOwnPropertyDescriptor(d, 'alpha')?.get, 'no alpha accessor of its own').toBeUndefined();
    }
  });

  it('a composition used as a stencil mask has no group pass (a filter inside a stencil mask writes its whole box into the stencil)', async () => {
    const comp = await root([rect({ mask: { type: 'composition', width: 50, height: 50, initial: { alpha: 0.5 }, layers: [rect()] } })]);
    const mask = comp.layers()[0]!.seq.maskSequence!.target as unknown as Display;
    mask.alpha = 0.5;
    expect(mask.filters ?? []).toEqual([]);
  });
});

describe('a component\'s number params', () => {
  it('are words in the composition\'s own expressions (its initial, its keyframes), not only in its layers\'', async () => {
    const comp = await root([{ type: 'composition', width: 100, height: 100, params: { margin: 40 }, initial: { x: 'margin * 2', y: 'margin' }, layers: [rect({ initial: { x: 'margin' } })] }]);
    comp.bindTimeline((await import('../../src/core/timelineEngine')).createTimeline({ paused: true }));
    const placed = comp.layers()[0]!.display as unknown as { x: number; y: number };
    expect(placed.x).toBe(80);
    expect(placed.y).toBe(40);
  });

  it('a param given as a number in text (after a {variable} was put in) is a number word too', async () => {
    const comp = await root([{ type: 'composition', width: 100, height: 100, params: { margin: '25' }, initial: { x: 'margin' }, layers: [rect()] }]);
    comp.bindTimeline((await import('../../src/core/timelineEngine')).createTimeline({ paused: true }));
    expect((comp.layers()[0]!.display as unknown as { x: number }).x).toBe(25);
  });
});
