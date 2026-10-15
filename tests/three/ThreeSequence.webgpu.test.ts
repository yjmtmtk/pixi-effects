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

describe("content the WebGPU renderer cannot run (the author chose renderer: 'webgpu': stop, with the fix, instead of drawing a broken picture)", () => {
  const fix = /renderer: 'webgl'/;

  it('a material that sets onBeforeCompile stops the build, naming the layer and the material', async () => {
    const seq = makeSeq({ renderer: 'webgpu', name: 'product', setup: (ctx) => { (ctx.scene as any).add({ material: { type: 'MeshStandardMaterial', name: 'mirror', onBeforeCompile() {} } }); } });
    const err = await seq.build().then(() => null, (e) => e as Error);
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/product/);
    expect(err!.message).toMatch(/mirror|MeshStandardMaterial/);
    expect(err!.message).toMatch(/onBeforeCompile/);
    expect(err!.message).toMatch(fix);
  });

  it('a ShaderMaterial or RawShaderMaterial stops it too, once however many meshes share it, and releases the renderer', async () => {
    const shared = { type: 'ShaderMaterial', isShaderMaterial: true };
    const seq = makeSeq({ renderer: 'webgpu', setup: (ctx) => { (ctx.scene as any).add({ material: shared }, { material: shared }, { material: [shared] }); } });
    await expect(seq.build()).rejects.toThrow(/ShaderMaterial/);
    expect((seq as any)._renderer).toBeNull();
  });

  it("the same content builds on the WebGL renderer (it is only 'webgpu' that cannot run it)", async () => {
    const fancy = { material: { type: 'ShaderMaterial', isShaderMaterial: true, onBeforeCompile() {} } };
    await expect(makeSeq({ setup: (ctx) => { (ctx.scene as any).add(fancy); } }).build()).resolves.toBeUndefined();
    await expect(makeSeq({ renderer: 'webgpu', setup: (ctx) => { (ctx.scene as any).add({ material: { type: 'MeshStandardMaterial' } }); } }).build()).resolves.toBeUndefined();
  });

  it("a PMREMGenerator taken from 'three' (not 'three/webgpu') fails inside setup with a TypeError nobody can act on: it is translated", async () => {
    const seq = makeSeq({ renderer: 'webgpu', name: 'rods', setup: () => { throw new TypeError("Cannot read properties of undefined (reading 'buffers')"); } });
    const err = await seq.build().then(() => null, (e) => e as Error);
    expect(err!.message).toMatch(/rods/);
    expect(err!.message).toMatch(/PMREMGenerator/);
    expect(err!.message).toMatch(/three\/webgpu/);
    expect(err!.message).toMatch(fix);
    expect(err!.cause).toBeInstanceOf(TypeError);                                     // the original is kept
  });

  it('any other error from setup passes through untouched', async () => {
    const boom = new Error('texture 404');
    await expect(makeSeq({ renderer: 'webgpu', setup: () => { throw boom; } }).build()).rejects.toBe(boom);
  });
});

describe("the backend (three's WebGPURenderer uses its own WebGL2 backend where the browser has no WebGPU: the same picture, so it is information, not a warning)", () => {
  it("is 'webgpu' normally, and 'webgl' on the WebGLRenderer", async () => {
    const gpu = makeSeq({ renderer: 'webgpu' }); await gpu.build();
    const gl = makeSeq(); await gl.build();
    expect(gpu.renderer).toBe('webgpu');
    expect(gpu.backend).toBe('webgpu');
    expect(gl.renderer).toBe('webgl');
    expect(gl.backend).toBe('webgl');
  });

  it("is 'webgl2' when three says WebGPU is not available, and that warning does not reach the console", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const orig = MockWebGPURenderer.prototype.init;
    MockWebGPURenderer.prototype.init = async function (this: MockWebGPURenderer) { console.warn('THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.'); };
    try {
      const seq = makeSeq({ renderer: 'webgpu' });
      await seq.build();
      expect(seq.backend).toBe('webgl2');
      expect(warn.mock.calls.filter((c) => /not available/.test(String(c[0])))).toEqual([]);
    } finally { MockWebGPURenderer.prototype.init = orig; warn.mockRestore(); }
  });

  it('another warning during init is not swallowed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const orig = MockWebGPURenderer.prototype.init;
    MockWebGPURenderer.prototype.init = async function (this: MockWebGPURenderer) { console.warn('something else'); };
    try { await makeSeq({ renderer: 'webgpu' }).build(); expect(warn.mock.calls.map((c) => String(c[0]))).toContain('something else'); }
    finally { MockWebGPURenderer.prototype.init = orig; warn.mockRestore(); }
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

describe('the antialias option', () => {
  it('is on by default, for both renderers (as it always was)', async () => {
    for (const renderer of ['webgl', 'webgpu'] as const) {
      const seq = makeSeq({ renderer });
      await seq.build();
      expect((rendererOf(seq) as any).opts?.antialias ?? (rendererOf(seq) as any).antialias, renderer).toBe(true);
    }
  });
  it('antialias: false reaches the renderer (WebGPU resolves the multisampling in linear light, before tone mapping, WebGL after: they only agree without it)', async () => {
    for (const renderer of ['webgl', 'webgpu'] as const) {
      const seq = makeSeq({ renderer, antialias: false });
      await seq.build();
      expect((rendererOf(seq) as any).opts?.antialias ?? (rendererOf(seq) as any).antialias, renderer).toBe(false);
    }
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
