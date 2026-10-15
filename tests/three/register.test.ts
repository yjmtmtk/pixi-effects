import { describe, it, expect } from 'vitest';
import { mockThreeModule } from './mockThree';
mockThreeModule();

import { registerThree, three } from '../../src/three/index';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import { buildSequenceTree } from '../../src/core/Composition';
import type { CompositionShape } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 5 };

import { MockWebGLRenderer, MockWebGPURenderer } from './mockThree';

describe('registerThree({ renderer }): the page-level default of the three layers', () => {
  const rendererOf = async (over: Record<string, unknown> = {}) => {
    const seq = (await buildSequenceTree([three({ type: 'three', setup: () => {}, ...over } as any)], shape, shape))[0] as ThreeSequence;
    return (seq as any)._renderer;
  };

  it("is 'webgl' without options, as before", async () => {
    registerThree();
    expect(await rendererOf()).toBeInstanceOf(MockWebGLRenderer);
  });

  it("registerThree({ renderer: 'webgpu' }) makes layers with no renderer of their own use WebGPU", async () => {
    registerThree({ renderer: 'webgpu' });
    try { expect(await rendererOf()).toBeInstanceOf(MockWebGPURenderer); } finally { registerThree(); }
  });

  it("a layer's own renderer wins over the page default, in both directions", async () => {
    registerThree({ renderer: 'webgpu' });
    try { expect(await rendererOf({ renderer: 'webgl' })).toBeInstanceOf(MockWebGLRenderer); } finally { registerThree(); }
    registerThree();
    expect(await rendererOf({ renderer: 'webgpu' })).toBeInstanceOf(MockWebGPURenderer);
  });

  it('a bad page default is refused when it is registered, saying what is allowed', () => {
    expect(() => registerThree({ renderer: 'gpu' as any })).toThrow(/'webgl' or 'webgpu'/);
  });
});

describe('registerThree', () => {
  it('makes buildSequenceTree construct ThreeSequence for type "three"', async () => {
    registerThree();
    const spec = three({ type: 'three', setup: () => {} });
    const out = await buildSequenceTree([spec], shape, shape);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(ThreeSequence);
  });

  it('is idempotent', async () => {
    registerThree();
    registerThree();
    const out = await buildSequenceTree([three({ type: 'three', setup: () => {} })], shape, shape);
    expect(out).toHaveLength(1);
  });

  it('three() is an identity helper preserving the spec object', () => {
    const spec = { type: 'three' as const, setup: () => {}, at: 1 };
    expect(three(spec)).toBe(spec);
  });
});
