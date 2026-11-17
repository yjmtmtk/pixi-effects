/**
 * pixi-effects/3d — 3D scenes drawn by PixiJS 3D (`@pixi/3d`), the main 3D engine.
 *
 * Import this entry BEFORE `movie.init` and call `register3D()` once: PixiJS loads the 3D drawing code while its renderer starts, so a
 * renderer that started before `@pixi/3d` was imported cannot draw a `scene3d` layer. The core `pixi-effects` entry never loads `@pixi/3d`.
 */
import '@pixi/3d';                                                     // the import registers the 3D backends with PixiJS (they load at app.init)
import { AnimationPlayer, Model3D } from '@pixi/3d';
import { Assets, VERSION, extensions, ktxTranscoderUrls, loadKTX2, setKTXTranscoderPath } from 'pixi.js';
import { registerSequenceType, type SequenceCtor } from '../core/Composition';
import type { LayerSpec } from '../types';
import { Scene3DSequence } from './Scene3DSequence';
import type { Scene3DLayerSpec } from './types';

export { layerTexture } from './layerTexture';
export { loadModel, fitCamera } from './gltf';
export type { LoadModelOptions, LoadedModel, FitCameraOptions } from './gltf';
export type { LayerTexture, LayerTextureOptions } from './layerTexture';
export type { Scene3DContext, Scene3DSetupResult, Scene3DLayerSpec } from './types';

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
  registerKtx2();
}

const KTX_DEFAULT_JS = 'https://cdn.jsdelivr.net/npm/pixi.js/transcoders/ktx/libktx.js';
/**
 * A glTF whose textures are KTX2 (`KHR_texture_basisu`) loads with no line on the page for it: PixiJS's KTX2 loader is registered here (it
 * fetches nothing until a KTX2 texture is met), and its transcoder is pinned to the pixi.js in use (PixiJS's default is the newest one on the
 * CDN, so a page could change by itself). A transcoder path the page set itself (`setKTXTranscoderPath`) is left alone.
 */
function registerKtx2(): void {
  const parsers = (Assets as unknown as { loader?: { parsers?: Array<{ id?: string }> } }).loader?.parsers ?? [];
  if (!parsers.some((p) => p.id === 'ktx2')) extensions.add(loadKTX2);
  if (ktxTranscoderUrls.jsUrl === KTX_DEFAULT_JS) {
    const base = `https://cdn.jsdelivr.net/npm/pixi.js@${VERSION}/transcoders/ktx`;
    setKTXTranscoderPath({ jsUrl: `${base}/libktx.js`, wasmUrl: `${base}/libktx.wasm` });
  }
}

/** Typing helper: accepts a strongly-typed scene3d spec and returns it as a core LayerSpec, keeping `@pixi/3d` types out of the core union. */
export function scene3d(spec: Scene3DLayerSpec): LayerSpec {
  return spec as unknown as LayerSpec;
}
