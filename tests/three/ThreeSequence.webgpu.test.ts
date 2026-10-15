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

describe("three's WebGPU node frame (the light uniforms follow it)", () => {
  it('is advanced before every render, so a seek or an export (many renders in one task) shows this frame\'s lights, not the last animation frame\'s', async () => {
    const seq = makeSeq({ renderer: 'webgpu' });
    await seq.build();
    const r = rendererOf(seq) as MockWebGPURenderer;
    await seq.awaitFrameAt(1);
    await seq.awaitFrameAt(1);                                                 // the same time twice, and no animation frame in between
    await seq.awaitFrameAt(0.5);
    expect(new Set(r.frameIdsAtRender).size, `frame ids at render: ${r.frameIdsAtRender}`).toBe(r.renderCalls.length);
  });

  it("gives three's `time` the layer's own time (not the wall clock), so a TSL time node is a function of t", async () => {
    const seq = makeSeq({ renderer: 'webgpu' });
    await seq.build();
    const r = rendererOf(seq) as MockWebGPURenderer;
    await seq.awaitFrameAt(2.5);
    await seq.awaitFrameAt(0.75);
    expect(r.timesAtRender!.slice(1)).toEqual([2.5, 0.75]);
  });

  it('only warns, once, when this three has no node frame to advance (a future version), and still renders', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seq = makeSeq({ renderer: 'webgpu' });
    await seq.build();
    const r = rendererOf(seq) as MockWebGPURenderer;
    r._nodes = undefined;
    await seq.awaitFrameAt(1);
    await seq.awaitFrameAt(2);
    expect(r.renderCalls.length).toBeGreaterThanOrEqual(3);
    expect(warn.mock.calls.filter((c) => /node frame/.test(String(c[0])))).toHaveLength(1);
    warn.mockRestore();
  });

  it('is not touched on the WebGL renderer', async () => {
    const seq = makeSeq();
    await seq.build();
    await seq.awaitFrameAt(1);
    expect((rendererOf(seq) as MockWebGLRenderer)._nodes).toBeUndefined();
  });
});

describe('materials the WebGPU renderer cannot use as written', () => {
  const warnings = (warn: ReturnType<typeof vi.spyOn>) => warn.mock.calls.map((c) => String(c[0])).filter((m) => /WebGPU/.test(m));

  it("warns, naming the layer and the material, when a material sets onBeforeCompile (the WebGPU renderer ignores it: the effect would silently be missing)", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seq = makeSeq({ renderer: 'webgpu', name: 'product', setup: (ctx) => { (ctx.scene as any).add({ material: { type: 'MeshStandardMaterial', name: 'mirror', onBeforeCompile() {} } }); } });
    await seq.build();
    const w = warnings(warn);
    warn.mockRestore();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/product/);
    expect(w[0]).toMatch(/mirror|MeshStandardMaterial/);
    expect(w[0]).toMatch(/onBeforeCompile/);
    expect(w[0]).toMatch(/renderer: 'webgl'/);
  });

  it('warns for a ShaderMaterial or RawShaderMaterial (they do not run on the WebGPU renderer), once per layer, however many meshes share it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shared = { type: 'ShaderMaterial', isShaderMaterial: true };
    const seq = makeSeq({ renderer: 'webgpu', setup: (ctx) => { (ctx.scene as any).add({ material: shared }, { material: shared }, { material: [shared] }); } });
    await seq.build();
    const w = warnings(warn);
    warn.mockRestore();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/ShaderMaterial/);
  });

  it('says nothing for ordinary materials, and nothing on the WebGL renderer for the same ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fancy = { material: { type: 'ShaderMaterial', isShaderMaterial: true, onBeforeCompile() {} } };
    await makeSeq({ renderer: 'webgpu', setup: (ctx) => { (ctx.scene as any).add({ material: { type: 'MeshStandardMaterial' } }); } }).build();
    await makeSeq({ setup: (ctx) => { (ctx.scene as any).add(fancy); } }).build();
    const w = warnings(warn);
    warn.mockRestore();
    expect(w).toEqual([]);
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
