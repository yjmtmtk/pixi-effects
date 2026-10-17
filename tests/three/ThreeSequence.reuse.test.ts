import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockWebGLRenderer } from './mockRenderers';

// the real three, a stand-in renderer: this file is about who owns a layer's scene and renderer while a rebuild replaces one tree with another (tests/films/three-reuse does it with a real browser)
vi.mock('three', async (orig) => ({ ...(await orig<typeof import('three')>()), WebGLRenderer: (await import('./mockRenderers')).MockWebGLRenderer }));

import { ThreeSequence } from '../../src/three/ThreeSequence';
import { resetThreeBudget, threeBudget } from '../../src/three/budget';
import type { ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const setup = vi.fn();
const root = (pool?: CompositionShape['reuse']): CompositionShape => ({ width: 960, height: 540, duration: 10, ...(pool ? { reuse: pool } : {}) });
const make = (over: Partial<ThreeSequenceSpec> = {}, pool?: CompositionShape['reuse']) => {
  const dispose = vi.fn();
  const seq = new ThreeSequence({ type: 'three', name: 'world', setup, update: () => {}, dispose, ...over } as unknown as SequenceSpec, null, root(pool));
  return { seq, dispose };
};
const rendererOf = (seq: ThreeSequence) => (seq as any)._renderer as MockWebGLRenderer;
const poolOf = (donors: ThreeSequence[]): CompositionShape['reuse'] => {
  const free = donors.map((d) => ({ key: d.reuseKey(), d }));
  return { claim: (key: string) => { const i = free.findIndex((f) => f.key === key); return i < 0 ? null : (free.splice(i, 1)[0]!.d as never); } };
};
beforeEach(() => { setup.mockClear(); resetThreeBudget(); });

describe('a layer that takes over the state of a layer of the tree it replaces', () => {
  it('does not run setup, uses the same scene and renderer, and the old layer goes on being the one that draws until the swap', async () => {
    const old = make().seq; await old.build();
    const { seq } = make({ update: () => {} }, poolOf([old])); await seq.build();
    expect(setup).toHaveBeenCalledTimes(1);
    expect((seq as any)._scene).toBe((old as any)._scene);
    expect(rendererOf(seq)).toBe(rendererOf(old));
    expect(seq.target, 'its own sprite').not.toBe(old.target);
    expect(threeBudget().webgl, 'one renderer, counted once').toBe(1);
  });

  it('the old layer destroyed BEFORE the swap (the new tree was thrown away, or the old one is destroyed first) lets nothing go while the new one still holds it; the new one destroyed uncommitted lets nothing go either', async () => {
    const a = make(); await a.seq.build();
    const b = make({}, poolOf([a.seq])); await b.seq.build();
    b.seq.destroy();                                                          // the rebuild failed: the old tree is the owner still
    expect(a.dispose).not.toHaveBeenCalled();
    expect(rendererOf(a.seq).disposed).toBe(false);
    expect(threeBudget().webgl).toBe(1);
    a.seq.destroy();                                                          // and now the real end of the old layer
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(threeBudget().webgl).toBe(0);
  });

  it('after the swap the new layer owns it: the old layer being destroyed lets nothing go, the new one being destroyed lets it all go, once', async () => {
    const a = make(); await a.seq.build();
    const renderer = rendererOf(a.seq);
    const b = make({}, poolOf([a.seq])); await b.seq.build();
    b.seq.commitReuse();
    a.seq.destroy();
    expect(a.dispose).not.toHaveBeenCalled();
    expect(renderer.disposed).toBe(false);
    expect(threeBudget().webgl).toBe(1);
    b.seq.destroy();
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(a.dispose).not.toHaveBeenCalled();
    expect(renderer.disposed).toBe(true);
    expect(threeBudget().webgl).toBe(0);
  });

  it('an old layer nobody claimed is destroyed as before (the layer is gone from the new composition)', async () => {
    const a = make(); await a.seq.build();
    const renderer = rendererOf(a.seq);
    a.seq.destroy();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.disposed).toBe(true);
  });

  it('is another layer when setup, size or an option differs, when it has no name, or when it says reuse: false', async () => {
    const a = make(); await a.seq.build();
    const other = vi.fn();
    for (const over of [{ setup: other }, { width: 200, height: 100 }, { antialias: false }, { followCamera: true }, { name: 'other' }, { reuse: false }, { resolution: 2 }]) {
      const s = make(over as Partial<ThreeSequenceSpec>, poolOf([a.seq])).seq; await s.build();
      expect((s as any)._scene, JSON.stringify(over)).not.toBe((a.seq as any)._scene);
    }
    expect(a.seq.reuseKey()).not.toBeNull();
    const noName = make({ name: undefined }); await noName.seq.build();
    expect(noName.seq.reuseKey(), 'no name: never kept').toBeNull();
    const off = make({ reuse: false }); await off.seq.build();
    expect(off.seq.reuseKey(), 'reuse: false: never kept').toBeNull();
  });

  it('a layer that has been given away cannot be lent again', async () => {
    const a = make(); await a.seq.build();
    const b = make({}, poolOf([a.seq])); await b.seq.build(); b.seq.commitReuse();
    expect(a.seq.reuseKey()).toBeNull();
  });
});
