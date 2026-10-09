import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  return comp;
}
const card = (o: Record<string, unknown> = {}) => ({ type: 'shape', shape: 'rect', width: 50, height: 50, threeD: true, ...o });
beforeEach(() => { vi.restoreAllMocks(); });

describe('a composition with light layers', () => {
  it('draws no light (a light has no picture) and keeps it out of layers()', async () => {
    const comp = await build([{ type: 'light', kind: 'ambient' }, { type: 'light', kind: 'point', name: 'key' }, card({ name: 'a' })]);
    expect(comp.layers().map(l => l.seq.spec.name)).toEqual(['a']);
  });

  it('says the composition-wide mistakes once, at build', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: 'light', kind: 'point' }, card()]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('ambient'));
    expect(said).toHaveLength(1);
  });

  it('a composition with no light layer asks nothing of the light checks: no warning even for castsShadows on layers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([card({ castsShadows: true }), card({ lit: false })]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a light layer written with threeD is still not a drawn layer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'light', kind: 'ambient', threeD: true }, card({ name: 'a' })]);
    expect(comp.layers().map(l => l.seq.spec.name)).toEqual(['a']);
  });
});
