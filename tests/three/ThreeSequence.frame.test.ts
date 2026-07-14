import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockWebGLRenderer } from './mockThree';
mockThreeModule();

import { Sprite } from 'pixi.js';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

async function build(over: Partial<ThreeSequenceSpec> = {}): Promise<ThreeSequence> {
  const spec = { type: 'three', setup: vi.fn(), duration: 4, ...over } as unknown as SequenceSpec;
  const seq = new ThreeSequence(spec, shape, shape);
  await seq.build();
  return seq;
}

describe('ThreeSequence.awaitFrameAt', () => {
  it('calls update with the local time, then renders, then uploads the texture', async () => {
    const calls: string[] = [];
    const update = vi.fn(() => calls.push('update'));
    const seq = await build({ update });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    const origRender = renderer.render.bind(renderer);
    renderer.render = (s, c) => { calls.push('render'); origRender(s, c); };
    const upload = vi.spyOn((seq.target as Sprite).texture.source, 'update')
      .mockImplementation(function (this: unknown) { calls.push('upload'); return this as never; });

    await seq.awaitFrameAt(1.5);

    expect(update).toHaveBeenCalledWith(1.5, (seq as any)._ctx);
    expect(calls).toEqual(['update', 'render', 'upload']);
    upload.mockRestore();
  });

  it('clamps local time into [0, duration]', async () => {
    const update = vi.fn();
    const seq = await build({ update });
    await seq.awaitFrameAt(-0.25);
    await seq.awaitFrameAt(99);
    expect(update).toHaveBeenNthCalledWith(1, 0, expect.anything());
    expect(update).toHaveBeenNthCalledWith(2, 4, expect.anything());
  });

  it('renders with the adopted camera', async () => {
    const custom = { isMockCamera: true, projection: 1 };
    const seq = await build({ setup: () => ({ camera: custom as never }) });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    await seq.awaitFrameAt(0);
    expect(renderer.renderCalls.at(-1)!.camera).toBe(custom);
  });

  it('contains update() throws: warns once, keeps rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update = vi.fn(() => { throw new Error('user bug'); });
    const seq = await build({ update });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    const before = renderer.renderCalls.length;

    await seq.awaitFrameAt(1);
    await seq.awaitFrameAt(2);

    expect(renderer.renderCalls.length).toBe(before + 2); // still renders
    expect(warn).toHaveBeenCalledTimes(1);                // warned once, not per frame
    warn.mockRestore();
  });

  it('is a no-op after destroy', async () => {
    const update = vi.fn();
    const seq = await build({ update });
    const renderer = (seq as any)._renderer as MockWebGLRenderer; // captured before destroy nulls it
    const before = renderer.renderCalls.length;
    seq.destroy();
    await seq.awaitFrameAt(1);
    expect(update).not.toHaveBeenCalled();
    expect(renderer.renderCalls.length).toBe(before);
  });
});

describe('ThreeSequence.destroy', () => {
  it('runs user dispose with the ctx, then disposes the renderer and loses the context', async () => {
    const order: string[] = [];
    const dispose = vi.fn(() => order.push('user'));
    const seq = await build({ dispose });
    const ctx = (seq as any)._ctx;
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    const origDispose = renderer.dispose.bind(renderer);
    renderer.dispose = () => { order.push('renderer'); origDispose(); };

    seq.destroy();

    expect(dispose).toHaveBeenCalledWith(ctx);
    expect(order).toEqual(['user', 'renderer']);
    expect(renderer.contextLost).toBe(true);
    expect(seq.target).toBeNull();
  });

  it('survives a throwing user dispose', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seq = await build({ dispose: () => { throw new Error('bad cleanup'); } });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(() => seq.destroy()).not.toThrow();
    expect(renderer.disposed).toBe(true);
    warn.mockRestore();
  });
});
