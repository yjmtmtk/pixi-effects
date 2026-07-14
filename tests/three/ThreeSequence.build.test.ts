import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockScene, MockPerspectiveCamera, MockWebGLRenderer } from './mockThree';
mockThreeModule();

import { Sprite } from 'pixi.js';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec, ThreeContext } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };

function makeSeq(over: Partial<ThreeSequenceSpec> = {}): ThreeSequence {
  const spec = { type: 'three', setup: vi.fn(), ...over } as unknown as SequenceSpec;
  return new ThreeSequence(spec, shape, shape);
}

describe('ThreeSequence.build', () => {
  it('calls setup once with scene/camera/renderer/size context', async () => {
    const setup = vi.fn();
    const seq = makeSeq({ setup });
    await seq.build();
    expect(setup).toHaveBeenCalledTimes(1);
    const ctx = setup.mock.calls[0]![0] as ThreeContext;
    expect((ctx.scene as unknown as MockScene).isMockScene).toBe(true);
    expect(ctx.renderer).toBeInstanceOf(MockWebGLRenderer);
    expect(ctx.width).toBe(1280);
    expect(ctx.height).toBe(720);
    expect((ctx.camera as unknown as MockPerspectiveCamera).aspect).toBeCloseTo(1280 / 720);
  });

  it('defaults the layer to the parent composition size and produces a Sprite target', async () => {
    const seq = makeSeq();
    await seq.build();
    expect(seq.target).toBeInstanceOf(Sprite);
    expect(seq.intrinsicWidth).toBe(1280);
    expect(seq.intrinsicHeight).toBe(720);
  });

  it('resolves width/height expressions against the scope', async () => {
    const seq = makeSeq({ width: 'W * 0.5', height: 'H / 2' });
    await seq.build();
    expect(seq.intrinsicWidth).toBe(640);
    expect(seq.intrinsicHeight).toBe(360);
  });

  it('applies the resolution factor to the canvas, not the layer size', async () => {
    const seq = makeSeq({ width: 640, height: 360, resolution: 2 });
    await seq.build();
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(renderer.setSizeCalls[0]).toEqual([1280, 720, false]);
    expect(seq.intrinsicWidth).toBe(640);
    // Sprite is scaled back down to layer size in comp px.
    expect((seq.target as Sprite).width).toBeCloseTo(640);
  });

  it('renders once at build so the texture has frame-0 content', async () => {
    const seq = makeSeq();
    await seq.build();
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(renderer.renderCalls).toHaveLength(1);
  });

  it('sets a transparent clear color', async () => {
    const seq = makeSeq();
    await seq.build();
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(renderer.clearColor?.[1]).toBe(0);
  });

  it('adopts a camera returned from setup', async () => {
    const custom = new MockPerspectiveCamera(30, 1);
    const seq = makeSeq({ setup: () => ({ camera: custom as never }) });
    await seq.build();
    expect((seq as any)._camera).toBe(custom);
    expect(((seq as any)._ctx as ThreeContext).camera).toBe(custom);
  });

  it('merges returned objects and always includes camera implicitly', async () => {
    const cube = { rotation: { y: 0 } };
    const seq = makeSeq({ setup: () => ({ objects: { cube } }) });
    await seq.build();
    const objects = (seq as any)._objects as Record<string, object>;
    expect(objects.cube).toBe(cube);
    expect(objects.camera).toBe((seq as any)._camera);
  });

  it('disposes the renderer and rethrows when setup fails', async () => {
    const seq = makeSeq({ setup: () => { throw new Error('boom'); } });
    await expect(seq.build()).rejects.toThrow('boom');
    // The renderer created before the failure must not leak its context.
    // ThreeSequence keeps no renderer reference after cleanup.
    expect((seq as any)._renderer).toBeNull();
  });
});
