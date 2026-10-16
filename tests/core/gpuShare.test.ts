import { describe, it, expect } from 'vitest';
import { TextureSource } from 'pixi.js';
import { sharedGpuOf } from '../../src/core/gpuShare';

const gpuRenderer = (uid = 7) => ({ name: 'webgpu', uid, gpu: { device: { label: 'pixi device' } } });

describe('sharedGpuOf: the GPU device Pixi draws with, for a layer that draws into the same device', () => {
  it('is the device of a PixiJS WebGPU renderer', () => {
    const r = gpuRenderer();
    expect(sharedGpuOf(r as never)?.device).toBe(r.gpu.device);
  });

  it('is nothing on a WebGL renderer, with no renderer, or when the renderer holds no device', () => {
    expect(sharedGpuOf({ name: 'webgl', uid: 1 } as never)).toBeUndefined();
    expect(sharedGpuOf(undefined)).toBeUndefined();
    expect(sharedGpuOf({ name: 'webgpu', uid: 1, gpu: {} } as never)).toBeUndefined();
  });

  it("adopt() makes the source sample a texture made elsewhere: Pixi finds it where it keeps its own (the renderer's uid), and destroying the source leaves the texture alone", () => {
    const r = gpuRenderer(42);
    const texture = { destroyed: false, destroy() { this.destroyed = true; } };
    const source = new TextureSource({ width: 8, height: 8, label: 'shared' });
    sharedGpuOf(r as never)!.adopt(source, texture);
    const data = (source as unknown as { _gpuData: Record<number, { gpuTexture: unknown; destroy(): void }> })._gpuData[42]!;
    expect(data.gpuTexture).toBe(texture);
    source.destroy();
    expect(texture.destroyed, 'the texture belongs to the layer that made it').toBe(false);
  });

  it('adopt() says so (and does not guess) when this PixiJS keeps its GPU textures somewhere else', () => {
    const r = gpuRenderer();
    expect(() => sharedGpuOf(r as never)!.adopt({} as never, {})).toThrow(/_gpuData/);
  });
});
