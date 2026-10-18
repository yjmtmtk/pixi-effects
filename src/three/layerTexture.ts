/**
 * `threeLayerTexture(ctx, 'screen')`: a live 2D layer (a `composition`) as the picture on a mesh of a `three` layer (a phone's screen, a television, a billboard, a label).
 *
 * The 2D layer stays a layer of the movie: the timeline drives it, its own `at` / `duration` / keyframes / filters apply. It is not drawn on the stage any more: just before the three layer draws,
 * PixiJS draws it into a texture, and the mesh shows that texture. Two routes, chosen by what the layer has:
 *   - the three layer draws on PixiJS's own GPU device (`renderer: 'webgpu'` in a WebGPU movie, the default): the texture is PixiJS's GPUTexture itself, used through three's `ExternalTexture`
 *     (no copy; 0.3 ms a frame measured). It is not decoded from sRGB by three (the texture is plain rgba8), so the material decodes it in its shader and the picture is flipped by its UV.
 *   - otherwise (the layer has a canvas of its own, or PixiJS is on WebGL): the pixels are read back into a canvas (1.6 ms a frame at 480 x 270, 4 ms at 1280 x 720) and three treats it as an ordinary
 *     sRGB canvas texture.
 * Both give the 2D layer's colours exactly (tests/films/three-layer-texture).
 */
import { Matrix, RenderTexture, type Container, type Renderer } from 'pixi.js';
import type { Material, Texture } from 'three';
import type { Sequence } from '../sequences/Base';
import type { ThreeContext } from './types';

export interface ThreeLayerTextureOptions {
  /** Pixels of the texture per pixel of the 2D layer: 2 for a screen that is seen large. Default 1. */
  resolution?: number;
}

export interface ThreeLayerTexture {
  /** An unlit material that shows the 2D layer: put it on a mesh (or on one face of a box: an array of materials). A screen shines by itself, so scene lights do not shade it. */
  material: Material;
  /** The three texture behind the material (colours are only right through `material`, which decodes them). */
  texture: Texture;
  /** The size of the texture in pixels. */
  width: number;
  height: number;
  /** Stop showing the layer (it is drawn on the stage again). Called when the three layer is destroyed. */
  dispose(): void;
}

/** What a three layer lends to `threeLayerTexture` (set on `ctx._host` by the layer itself). */
export interface ThreeLayerHost {
  /** A layer of the same composition by its name, among those built before this one. */
  findLayer(name: string): Sequence | null;
  /** The names of those layers, for the message when the name is wrong. */
  layerNames(): string[];
  pixiRenderer: Renderer | null;
  /** The three layer draws on PixiJS's GPU device (no copy is needed). */
  shared: boolean;
  /** Run `fn` just before every draw of the three layer; returns the function that stops it. */
  beforeDraw(fn: () => void): () => void;
  /** Remember a handle: a rebuild that keeps the three layer gives it the new tree's layer (`rebind`). */
  track(handle: Rebindable): void;
}

/** What a rebuild that keeps the three layer needs: show the layer of the new tree with the same name. */
export interface Rebindable { rebind(host: ThreeLayerHost): void; dispose(): void }

const label = 'pixi-effects: threeLayerTexture';

export async function threeLayerTexture(ctx: ThreeContext, name: string, options: ThreeLayerTextureOptions = {}): Promise<ThreeLayerTexture> {
  const host = ctx._host;
  if (!host) throw new Error(`${label}: call it from the setup of a three layer: const screen = await threeLayerTexture(ctx, 'screen')`);
  if (typeof name !== 'string' || !name) throw new Error(`${label}: the second argument is the name of a 2D layer: threeLayerTexture(ctx, 'screen')`);
  const resolution = options.resolution ?? 1;
  if (!(Number.isFinite(resolution) && resolution > 0 && resolution <= 4)) throw new Error(`${label}: resolution is a number from above 0 to 4 (2 = twice the pixels), got ${JSON.stringify(options.resolution)}`);
  const pixi = host.pixiRenderer;
  if (!pixi) throw new Error(`${label}: PixiJS's renderer is not available here (the movie is not ready)`);

  const source = host.findLayer(name);
  if (!source) {
    const names = host.layerNames();
    throw new Error(`${label}: no layer named "${name}" before this three layer${names.length ? ` (the layers built before it: ${names.map((n) => `"${n}"`).join(', ')})` : ''}. ` +
      `A layer shown on a mesh must be listed BEFORE the three layer, in the same composition, and have that name.`);
  }
  if (source.spec.type !== 'composition') {
    throw new Error(`${label}: "${name}" is a ${source.spec.type} layer: a layer shown on a mesh must be a composition (wrap it: { type: 'composition', name: '${name}', width: 480, height: 270, sequences: [ … ] })`);
  }

  const width = Math.max(1, Math.round(source.intrinsicWidth * resolution)), height = Math.max(1, Math.round(source.intrinsicHeight * resolution));
  const rt = RenderTexture.create({ width, height, resolution: 1 });
  const gpuTexture = host.shared && pixi.name === 'webgpu' ? (pixi as unknown as { texture: { getGpuSource?: (s: unknown) => unknown } }).texture.getGpuSource?.(rt.source) : undefined;

  let texture: Texture, material: Material, readCanvas: HTMLCanvasElement | null = null;
  if (gpuTexture) {
    // three's WebGPU renderer takes a GPUTexture made on its own device; sRGB decoding is done by the material (an external texture is read as plain rgba8)
    let webgpu: typeof import('three/webgpu'), tsl: typeof import('three/tsl');
    try { [webgpu, tsl] = await Promise.all([import('three/webgpu'), import('three/tsl')]); } catch (err) {
      throw new Error(`${label}: needs "three/webgpu" and "three/tsl" in the import map (${err instanceof Error ? err.message : err})`);
    }
    const ext = new webgpu.ExternalTexture(gpuTexture as never);
    ext.colorSpace = webgpu.NoColorSpace;
    ext.repeat.set(1, -1); ext.offset.set(0, 1);                    // the GPU texture's rows run top to bottom: a texture that three uploads is flipped, this is not
    const m = new webgpu.MeshBasicNodeMaterial();
    m.colorNode = tsl.sRGBTransferEOTF(tsl.texture(ext)) as never;
    m.toneMapped = false;
    texture = ext; material = m;
  } else {
    const three = await import('three');
    readCanvas = document.createElement('canvas');
    readCanvas.width = width; readCanvas.height = height;
    const ct = new three.CanvasTexture(readCanvas);
    ct.colorSpace = three.SRGBColorSpace;
    texture = ct;
    material = new three.MeshBasicMaterial({ map: ct, toneMapped: false });
  }

  let display: Container = source.target as Container;
  let sx = width / source.intrinsicWidth, sy = height / source.intrinsicHeight;
  let hidden = false;
  const hide = (): void => { display.visible = false; hidden = true; };
  hide();

  // drawn at the layer's own place in the frame: the timeline has put every layer at this frame before a three layer draws. The layer's own transform is left out (identity): its content is at (0, 0) to (width, height).
  const refresh = (): void => {
    const m = new Matrix().scale(sx, sy);
    display.visible = true;
    try { pixi.render({ container: display, target: rt, transform: m, clear: true, clearColor: [0, 0, 0, 0] }); } finally { display.visible = false; }
    if (readCanvas) {
      const g = readCanvas.getContext('2d')!;
      g.clearRect(0, 0, width, height);
      g.drawImage(pixi.extract.canvas(rt) as unknown as CanvasImageSource, 0, 0);
      texture.needsUpdate = true;
    }
  };
  const stop = host.beforeDraw(refresh);
  refresh();

  const handle: ThreeLayerTexture & Rebindable = {
    material, texture, width, height,
    rebind(next) {
      const again = next.findLayer(name);
      if (!again) throw new Error(`${label}: after a rebuild there is no layer "${name}" before the three layer any more`);
      display = again.target as Container;
      sx = width / again.intrinsicWidth; sy = height / again.intrinsicHeight;          // a layer that changed size is drawn stretched to the texture
      hide();
      refresh();
    },
    dispose() {
      stop();
      if (hidden) { display.visible = true; hidden = false; }
      try { rt.destroy(true); } catch { /* the renderer is gone */ }
      texture.dispose?.(); material.dispose?.();
    },
  };
  host.track(handle);
  return handle;
}
