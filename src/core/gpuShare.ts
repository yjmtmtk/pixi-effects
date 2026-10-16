/**
 * The GPU device PixiJS draws with, for a layer that draws on the same device (a `three` layer with `renderer: 'webgpu'`): it renders into a texture of its own and PixiJS samples that
 * texture directly, with no canvas of its own and no copy. A page keeps only so many canvases with a graphics context (about 32 for WebGPU); a device has no such limit.
 *
 * This leans on one PixiJS detail: `GpuTextureSystem` takes the `GPUTexture` of a source from `source._gpuData[renderer.uid]` when one is already there, and never makes its own.
 * `adopt` checks that the field is where it expects and throws when it is not (a PixiJS that changed it), so a layer falls back to its own canvas instead of drawing nothing.
 */
import type { Renderer, TextureSource } from 'pixi.js';

export interface SharedGpu {
  /** The `GPUDevice` of PixiJS's WebGPU renderer. */
  device: unknown;
  /** Make `source` sample `texture` (a `GPUTexture` made on `device` by someone else). The texture stays its maker's: destroying the source does not destroy it. */
  adopt(source: TextureSource, texture: unknown): void;
}

export function sharedGpuOf(renderer: Renderer | undefined): SharedGpu | undefined {
  const r = renderer as (Renderer & { gpu?: { device?: unknown } }) | undefined;
  if (!r || r.name !== 'webgpu' || !r.gpu?.device) return undefined;
  const uid = r.uid;
  return {
    device: r.gpu.device,
    adopt(source, texture) {
      const data = (source as unknown as { _gpuData?: Record<number, unknown> })._gpuData;
      if (!data || typeof data !== 'object') throw new Error('this PixiJS keeps no _gpuData on its texture sources');
      data[uid] = { textureView: null, textureViews: Object.create(null), gpuTexture: texture, destroy() { /* the texture is not ours */ } };
    },
  };
}
