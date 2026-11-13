/**
 * pixi-effects/3d — 3D scenes drawn by PixiJS 3D (`@pixi/3d`), the main 3D engine.
 *
 * Import this entry BEFORE `movie.init` and call `register3D()` once: PixiJS loads the 3D drawing code while its renderer starts, so a
 * renderer that started before `@pixi/3d` was imported cannot draw a `scene3d` layer. The core `pixi-effects` entry never loads `@pixi/3d`.
 */
import '@pixi/3d';                                                     // the import registers the 3D backends with PixiJS (they load at app.init)
import { AnimationPlayer, Model3D } from '@pixi/3d';
import { VERSION } from 'pixi.js';
import { registerSequenceType, type SequenceCtor } from '../core/Composition';
import type { SequenceSpec } from '../types';
import { Scene3DSequence } from './Scene3DSequence';
import type { Scene3DSequenceSpec } from './types';

export { Scene3DSequence } from './Scene3DSequence';
export { layerTexture } from './layerTexture';
export { loadModel, fitCamera } from './gltf';
export type { LoadModelOptions, LoadedModel, FitCameraOptions } from './gltf';
export type { LayerTexture, LayerTextureOptions } from './layerTexture';
export type { Scene3DContext, Scene3DSetupResult, Scene3DSequenceSpec } from './types';

let saidVersion = false;

/** PixiJS 3D needs pixi.js 8.23.0 or later. */
function versionAtLeast(v: string, min: [number, number]): boolean {
  const [a, b] = v.split('.').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;             // an unbuilt PixiJS ("$_VERSION"): nothing to say
  return a! > min[0] || (a === min[0] && b! >= min[1]);
}

/**
 * Register the `scene3d` layer type. Explicit call so `sideEffects: false` bundlers cannot drop it; calling it again is fine.
 * It also turns off the self-updating of models and animation players (they would move with the browser's clock, not the video's time):
 * pose a clip from the time in `update` with `model.player.getState(name).gotoAndStop(t)`.
 */
export function register3D(): void {
  if (!saidVersion && !versionAtLeast(String(VERSION), [8, 23])) {
    saidVersion = true;
    console.warn(`pixi-effects: PixiJS 3D needs pixi.js 8.23.0 or later (this page has ${VERSION}): put pixi.js@8.23.0 in the import map`);
  }
  (Model3D as unknown as { defaultOptions: { autoUpdate: boolean } }).defaultOptions.autoUpdate = false;
  (AnimationPlayer as unknown as { defaultOptions: { autoUpdate: boolean } }).defaultOptions.autoUpdate = false;
  registerSequenceType('scene3d', Scene3DSequence as unknown as SequenceCtor);
}

/** Typing helper: accepts a strongly-typed scene3d spec and returns it as a core SequenceSpec, keeping `@pixi/3d` types out of the core union. */
export function scene3d(spec: Scene3DSequenceSpec): SequenceSpec {
  return spec as unknown as SequenceSpec;
}
