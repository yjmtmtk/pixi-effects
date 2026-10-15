import { describe, it, expect, vi } from 'vitest';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  const { MockWebGLRenderer } = await import('./mockRenderers');
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const real: any = await vi.importActual('three/addons/loaders/GLTFLoader.js');
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  class GLTFLoader extends real.GLTFLoader {
    async loadAsync() { return this.parseAsync(readFileSync(resolve(__dirname, '../fixtures/spin-box.gltf'), 'utf8'), ''); }
  }
  return { GLTFLoader };
});

import { registerThree } from '../../src/three/index';
import { model } from '../../src/index';
import { ThreeModelSequence } from '../../src/three/ThreeModelSequence';
import { buildSequenceTree } from '../../src/core/Composition';
import type { CompositionShape } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 5, frameRate: 30 };

describe("registerThree() also registers the three.js implementation of the neutral 'model' layer", () => {
  it("buildSequenceTree makes a ThreeModelSequence for type 'model'", async () => {
    registerThree();
    const out = await buildSequenceTree([model({ type: 'model', asset: 'x.gltf' })], shape, shape);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(ThreeModelSequence);
  });

  it("model() (the spec language's helper, from the main entry) is an identity helper preserving the spec object", () => {
    const spec = { type: 'model' as const, asset: 'x.glb', animation: 'Run' };
    expect(model(spec)).toBe(spec);
  });

  it("the page default renderer of registerThree({ renderer }) reaches a model layer too (a `three` block of its own wins)", async () => {
    const { MockWebGPURenderer } = await import('./mockRenderers');
    vi.doMock('three/webgpu', () => ({ WebGPURenderer: MockWebGPURenderer }));
    registerThree({ renderer: 'webgpu' });
    try {
      const out = await buildSequenceTree([model({ type: 'model', asset: 'x.gltf' })], shape, shape);
      expect((out[0] as any)._renderer).toBeInstanceOf(MockWebGPURenderer);
      const own = await buildSequenceTree([model({ type: 'model', asset: 'x.gltf', three: { renderer: 'webgl' } })], shape, shape);
      expect((own[0] as any)._renderer).not.toBeInstanceOf(MockWebGPURenderer);
    } finally { registerThree(); vi.doUnmock('three/webgpu'); }
  });
});
