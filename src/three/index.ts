/**
 * pixi-effects/three — optional three.js integration.
 *
 * Import this entry only when you use `type: 'three'` sequences; the core
 * `pixi-effects` entry never touches three.js. Call `registerThree()` once
 * before Movie.init builds a composition containing a three sequence.
 */
import { registerSequenceType, type SequenceCtor } from '../core/Composition';
import { ThreeSequence } from './ThreeSequence';
import { checkRendererKind, setPageRenderer, type ThreeRendererKind } from './defaults';
import type { SequenceSpec } from '../types';
import type { ThreeSequenceSpec } from './types';

export { ThreeSequence } from './ThreeSequence';
export { threeGltf, threeFrameCamera } from './gltf';
export { threeLayerTexture } from './layerTexture';
export type { ThreeLayerTexture, ThreeLayerTextureOptions } from './layerTexture';
export type { ThreeGltfModel, ThreeGltfOptions, ThreeFrameCameraOptions } from './gltf';
export type { ThreeContext, ThreeSetupResult, ThreeSequenceSpec } from './types';
export type { ThreeRendererKind } from './defaults';

/**
 * Register the 'three' sequence type. Explicit call so `sideEffects: false` bundlers can't drop it; calling it again is fine.
 * `registerThree({ renderer: 'webgpu' })` makes every three layer that does not name a `renderer` of its own use three's WebGPU renderer; the default is `'webgl'`
 * (the last call wins).
 */
export function registerThree(options: { renderer?: ThreeRendererKind } = {}): void {
  const kind = options.renderer ?? 'webgl';
  checkRendererKind(kind, "registerThree's renderer");
  setPageRenderer(kind);
  registerSequenceType('three', ThreeSequence as unknown as SequenceCtor);
}

/**
 * Typing helper: accepts a strongly-typed three spec and returns it as a
 * core SequenceSpec, keeping three.js types out of the core union.
 */
export function three(spec: ThreeSequenceSpec): SequenceSpec {
  return spec as unknown as SequenceSpec;
}
