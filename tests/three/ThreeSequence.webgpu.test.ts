import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockWebGLRenderer, MockWebGPURenderer } from './mockThree';
mockThreeModule();

import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
const makeSeq = (over: Partial<ThreeSequenceSpec> = {}) =>
  new ThreeSequence({ type: 'three', setup: vi.fn(), ...over } as unknown as SequenceSpec, shape, shape);
const rendererOf = (seq: ThreeSequence) => (seq as any)._renderer;

describe("a three layer with renderer: 'webgpu'", () => {
  it('uses three/webgpu\'s WebGPURenderer, waits for its init, and hands it to setup as ctx.renderer', async () => {
    const setup = vi.fn();
    const seq = makeSeq({ renderer: 'webgpu', setup });
    await seq.build();
    const r = rendererOf(seq) as MockWebGPURenderer;
    expect(r).toBeInstanceOf(MockWebGPURenderer);
    expect(r.initCalls).toBe(1);
    expect(r.opts).toMatchObject({ alpha: true, antialias: true });
    expect(setup.mock.calls[0]![0].renderer).toBe(r);
    expect(r.log[0]).toBe('init');                                  // never render before the device exists
    expect(r.setSizeCalls[0]).toEqual([1280, 720, false]);
    expect(r.clearColor).toEqual([0x000000, 0]);
  });

  it('draws frame 0 at build and every frame in awaitFrameAt with render() after init (renderAsync is deprecated in three and warns)', async () => {
    const seq = makeSeq({ renderer: 'webgpu' });
    await seq.build();
    const r = rendererOf(seq) as MockWebGPURenderer;
    expect(r.renderCalls).toHaveLength(1);
    await seq.awaitFrameAt(1);
    await seq.awaitFrameAt(2);
    expect(r.renderCalls).toHaveLength(3);
  });

  it('dispose releases the renderer (no WebGL context to lose)', async () => {
    const seq = makeSeq({ renderer: 'webgpu' });
    await seq.build();
    const r = rendererOf(seq) as MockWebGPURenderer;
    seq.destroy();
    expect(r.disposed).toBe(true);
  });
});

describe('a WebGPU renderer that cannot start', () => {
  it('rejects the build with its own reason and releases what it made', async () => {
    const orig = MockWebGPURenderer.prototype.init;
    let made: MockWebGPURenderer | null = null;
    MockWebGPURenderer.prototype.init = async function (this: MockWebGPURenderer) { made = this; throw new Error('no adapter'); };
    try {
      await expect(makeSeq({ renderer: 'webgpu' }).build()).rejects.toThrow('no adapter');
      expect(made!.disposed).toBe(true);
    } finally { MockWebGPURenderer.prototype.init = orig; }
  });
});

describe('the renderer option', () => {
  it("is 'webgl' when absent: the WebGLRenderer, as before", async () => {
    const seq = makeSeq();
    await seq.build();
    expect(rendererOf(seq)).toBeInstanceOf(MockWebGLRenderer);
  });

  it("says what is allowed when it is anything else (a typo such as 'webgpu2' or 'gpu' must not pick a renderer silently)", async () => {
    for (const bad of ['gpu', 'webgpu2', 'WebGPU', 3 as unknown as string]) {
      const seq = makeSeq({ renderer: bad as 'webgl' });
      await expect(seq.build(), String(bad)).rejects.toThrow(/renderer.*'webgl' or 'webgpu'/);
    }
  });
});
