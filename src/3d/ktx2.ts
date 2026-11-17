/**
 * KTX2 textures (glTF `KHR_texture_basisu`) for `loadModel`. PixiJS 3D reads them only when PixiJS's KTX2 loader is registered, and then it
 * PREFERS them over a PNG / JPEG fallback in the same texture. So the loader is registered only for a file that has a texture with no other
 * image (it could not load at all otherwise); a file with a fallback keeps drawing the fallback, as in 1.0: no network, the same picture on
 * every GPU. The transcoder is pinned to the pixi.js in use (PixiJS's default is the newest one on the CDN), each URL only while it is still
 * PixiJS's default (a path the page set itself is left alone).
 */
import { Assets, VERSION, extensions, ktxTranscoderUrls, loadKTX2, setKTXTranscoderPath } from 'pixi.js';

const DEFAULT_JS = 'https://cdn.jsdelivr.net/npm/pixi.js/transcoders/ktx/libktx.js';
const DEFAULT_WASM = 'https://cdn.jsdelivr.net/npm/pixi.js/transcoders/ktx/libktx.wasm';

/** Does this glTF have a texture whose only image is KTX2 (`KHR_texture_basisu` and no `source`)? */
export function needsKtx2(json: { textures?: Array<{ source?: number; extensions?: { KHR_texture_basisu?: unknown } }> } | null): boolean {
  return !!json?.textures?.some((t) => t.extensions?.KHR_texture_basisu !== undefined && t.source === undefined);
}

/** Register PixiJS's KTX2 loader (once) and pin its transcoder. */
export function ensureKtx2(): void {
  const parsers = (Assets as unknown as { loader?: { parsers?: Array<{ id?: string }> } }).loader?.parsers ?? [];
  if (!parsers.some((p) => p.id === 'ktx2')) extensions.add(loadKTX2);
  const base = `https://cdn.jsdelivr.net/npm/pixi.js@${VERSION}/transcoders/ktx`;
  const pin: { jsUrl?: string; wasmUrl?: string } = {};
  if (ktxTranscoderUrls.jsUrl === DEFAULT_JS) pin.jsUrl = `${base}/libktx.js`;
  if (ktxTranscoderUrls.wasmUrl === DEFAULT_WASM) pin.wasmUrl = `${base}/libktx.wasm`;
  if (pin.jsUrl || pin.wasmUrl) setKTXTranscoderPath(pin);
}
