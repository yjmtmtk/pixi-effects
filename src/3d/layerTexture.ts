/**
 * `layerTexture(ctx, 'screen')`: a live 2D layer (a `composition`) as the picture on a mesh of a `scene3d` layer (a phone's screen, a television, a billboard, a label).
 *
 * The 2D layer stays a layer of the movie: the timeline drives it, its own `at` / `duration` / keyframes / filters apply. It is not drawn on the stage any more: before each
 * frame of the scene3d layer (after the timeline has put every layer at that frame), PixiJS draws it into a RenderTexture, and the material shows that texture. PixiJS 3D takes
 * a PixiJS texture as it is: no copy, no read-back, the same on WebGL and WebGPU.
 */
import { Matrix, RenderTexture, type Container, type Renderer } from 'pixi.js';
import { FlatMaterial } from '@pixi/3d';
import type { Sequence } from '../sequences/Base';
import type { Scene3DContext } from './types';

export interface LayerTextureOptions {
  /** Pixels of the texture per pixel of the 2D layer: 2 for a screen that is seen large. Default 1. */
  resolution?: number;
  /** The 2D layer's empty and half-transparent parts let what is behind the mesh show through (a sticker, a hologram). Default `false`: an opaque screen, empty parts black. */
  transparent?: boolean;
}

export interface LayerTexture {
  /** An unlit material that shows the 2D layer: put it on a mesh. A screen shines by itself, so the scene's lights do not shade it. */
  material: FlatMaterial;
  /** The texture behind the material (a PixiJS RenderTexture, redrawn every frame). */
  texture: RenderTexture;
  /** The size of the texture in pixels. */
  width: number;
  height: number;
  /** Stop showing the layer (it is drawn on the stage again). Called when the scene3d layer is destroyed. */
  dispose(): void;
}

/** What a scene3d layer lends to `layerTexture` (on its context, not enumerable). */
export interface LayerTextureHost {
  findLayer(name: string): Sequence | null;
  layerNames(): string[];
  pixiRenderer: Renderer | null;
  /** Run `fn` before every frame of the scene3d layer is drawn; returns the function that stops it. */
  beforeDraw(fn: () => void): () => void;
  /** Remember a handle (picking through the mesh, keeping the layer hidden, rebinding after a rebuild). */
  track(handle: ShownLayer): () => void;
}

/** What the scene3d layer keeps of each layer shown on a mesh. */
export interface ShownLayer {
  material: unknown;
  source(): Sequence;
  /** Where in the source (0..1 across, 0..1 down) a point (u, v) of the mesh's uv shows. */
  sourceAt(u: number, v: number): { x: number; y: number };
  /** After a rebuild that keeps the scene3d layer: find the layer of the new tree (throws if it is gone); the function returned shows it from the swap on. */
  prepare(host: LayerTextureHost): () => void;
  keepHidden(): void;
  dispose(): void;
}

export const HOST = Symbol.for('pixi-effects:scene3d-host');
const label = 'pixi-effects: layerTexture';

export async function layerTexture(ctx: Scene3DContext, name: string, options: LayerTextureOptions = {}): Promise<LayerTexture> {
  const host = (ctx as unknown as Record<symbol, LayerTextureHost | undefined>)[HOST];
  if (!host) throw new Error(`${label}: call it from the setup of a scene3d layer: const screen = await layerTexture(ctx, 'screen')`);
  if (typeof name !== 'string' || !name) throw new Error(`${label}: the second argument is the name of a 2D layer: layerTexture(ctx, 'screen')`);
  const resolution = options.resolution ?? 1;
  if (!(Number.isFinite(resolution) && resolution > 0 && resolution <= 4)) throw new Error(`${label}: resolution is a number from above 0 to 4 (2 = twice the pixels), got ${JSON.stringify(options.resolution)}`);
  const pixi = host.pixiRenderer;
  if (!pixi) throw new Error(`${label}: PixiJS's renderer is not available here (the movie is not ready)`);
  const source = host.findLayer(name);
  if (!source) {
    const names = host.layerNames();
    throw new Error(`${label}: no layer named "${name}" before this scene3d layer${names.length ? ` (the layers built before it: ${names.map((n) => `"${n}"`).join(', ')})` : ''}. ` +
      'A layer shown on a mesh must be listed BEFORE the scene3d layer, in the same composition, and have that name.');
  }
  if (source.spec.type !== 'composition') {
    throw new Error(`${label}: "${name}" is a ${source.spec.type} layer: a layer shown on a mesh must be a composition (wrap it: { type: 'composition', name: '${name}', width: 480, height: 270, sequences: [ … ] })`);
  }
  const logicalW = Math.max(1, Math.round(source.intrinsicWidth)), logicalH = Math.max(1, Math.round(source.intrinsicHeight));
  const rt = RenderTexture.create({ width: logicalW, height: logicalH, resolution, autoGenerateMipmaps: true });
  const transparent = options.transparent === true;
  // a RenderTexture's rows run top to bottom and a plane's v runs up: flipped by the material, the picture is upright on a default PlaneGeometry (and on a CubeGeometry's sides)
  const material = new FlatMaterial({ baseColorTexture: rt, uvTransform: new Matrix(1, 0, 0, -1, 0, 1), ...(transparent ? { alphaMode: 'blend' as const } : {}) });

  let current: Sequence = source;
  let display = source.target as Container;
  let sx = logicalW / source.intrinsicWidth, sy = logicalH / source.intrinsicHeight;
  let hidden = false;
  const hide = (): void => { display.visible = false; hidden = true; };
  hide();
  // The stage's cull skips what is hidden, so the layers of the source keep the `culled` flag of their last measure against the PICTURE: un-cull them (the texture is the layer's own rectangle).
  const uncull = (c: Container): void => { if (c.culled) c.culled = false; for (const k of c.children) uncull(k); };
  const refresh = (): void => {
    display.visible = true;
    uncull(display);
    try { pixi.render({ container: display, target: rt, transform: new Matrix().scale(sx, sy), clear: true, clearColor: [0, 0, 0, transparent ? 0 : 1] }); } finally { display.visible = false; }
    rt.source.updateMipmaps();
  };
  const stop = host.beforeDraw(refresh);
  refresh();

  let disposed = false;
  const handle: ShownLayer & LayerTexture = {
    material, texture: rt, width: Math.round(logicalW * resolution), height: Math.round(logicalH * resolution),
    source: () => current,
    sourceAt: (u, v) => ({ x: u, y: 1 - v }),                    // a plane's uv: v runs up; the texture's rows run down
    prepare(next) {
      const again = next.findLayer(name);
      if (disposed) return () => {};
      if (!again) throw new Error(`${label}: after a rebuild there is no layer "${name}" before the scene3d layer any more`);
      return () => {
        current = again;
        display = again.target as Container;
        sx = logicalW / again.intrinsicWidth; sy = logicalH / again.intrinsicHeight;
        hide();
        refresh();
      };
    },
    keepHidden() { if (hidden && !disposed) display.visible = false; },
    dispose() {
      if (disposed) return;
      disposed = true;
      untrack();
      stop();
      if (hidden) { display.visible = true; hidden = false; }
      try { material.destroy?.(); } catch { /* gone with the scene */ }
      try { rt.destroy(true); } catch { /* the renderer is gone */ }
    },
  };
  const untrack = host.track(handle);
  return handle;
}
