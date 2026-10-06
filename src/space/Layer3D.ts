import { Container, Matrix, PerspectiveMesh, RenderTexture, Texture } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { DEG, projectLayer, type CameraBasis, type LayerTransform, type Rect } from './math';

/** Render textures are capped at this many pixels on the long side; larger layers are downscaled. */
export const MAX_TEXTURE_SIZE = 4096;
/**
 * Render textures are drawn at this multiple of the layer size (until the cap),
 * so a layer enlarged by perspective (z > 0) stays sharp instead of showing
 * jagged edges and soft text.
 */
export const SUPERSAMPLE = 2;
/** Mesh grid per side. 20 keeps steeply tilted planes free of visible affine warping. */
export const MESH_GRID = 20;

/** The slice of a Pixi renderer Layer3D needs (also what tests fake). */
export interface SpaceHost {
  render(options: {
    container: Container;
    target: RenderTexture;
    transform: Matrix;
    clear: boolean;
    clearColor: number[];
  }): void;
}

type Carrier = Container & { z?: number; rotationX?: number; rotationY?: number };

export function readLayerTransform(target: Container): LayerTransform {
  const c = target as Carrier;
  return {
    x: c.x, y: c.y, z: c.z ?? 0,
    rotationX: (c.rotationX ?? 0) * DEG,
    rotationY: (c.rotationY ?? 0) * DEG,
    rotationZ: c.rotation,
    scaleX: c.scale.x, scaleY: c.scale.y,
    pivotX: c.pivot.x, pivotY: c.pivot.y,
  };
}

/**
 * Draws one `threeD` sequence: its display object is rendered into a
 * RenderTexture (with its own 2D transform replaced, so layer-local content
 * lands at the texture origin) and shown on a PerspectiveMesh whose four
 * corners come from projecting the layer through the active camera.
 *
 * The sequence's `target` is never in the scene graph; the composition adds
 * `display` instead. `z`, `rotationX`, `rotationY` live on `target` as plain
 * numeric props so GSAP tweens them like any other prop.
 */
export class Layer3D {
  readonly display: PerspectiveMesh;
  /** Camera-space depth from the last update (larger = farther). */
  depth = 0;
  private rt: RenderTexture | null = null;
  private rtKey = '';

  constructor(
    private readonly seq: Sequence,
    private readonly frameOf: () => Rect,
  ) {
    const target = seq.target as Carrier;
    target.z ??= 0;
    target.rotationX ??= 0;
    target.rotationY ??= 0;
    this.display = new PerspectiveMesh({ texture: Texture.WHITE, verticesX: MESH_GRID, verticesY: MESH_GRID });
    if (seq.spec.name) this.display.label = seq.spec.name;
    this.display.visible = false;
  }

  update(host: SpaceHost, basis: CameraBasis): void {
    const target = this.seq.target as Carrier | null;
    if (!target || !target.renderable) return this.hide();

    const bounds = this.frameOf();
    const w = Math.ceil(bounds.width);
    const h = Math.ceil(bounds.height);
    if (!(w >= 1 && h >= 1) || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return this.hide();

    // The quad covers exactly the texture's pixel rect in layer space.
    const frame: Rect = { x: bounds.x, y: bounds.y, width: w, height: h };
    const projected = projectLayer(readLayerTransform(target), frame, basis);
    this.depth = projected.depth;
    if (!projected.visible) return this.hide();

    this.ensureTexture(w, h);
    // `transform` replaces the container's own local transform for this render
    // (Pixi RenderGroupSystem), while `container.alpha` still applies — so the
    // texture carries the layer's alpha and the mesh alpha stays at 1.
    host.render({
      container: target,
      target: this.rt!,
      transform: new Matrix().translate(-frame.x, -frame.y),
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    this.display.geometry.setCorners(...projected.corners);
    this.display.visible = true;
  }

  destroy(): void {
    this.display.destroy();
    this.rt?.destroy(true);
    this.rt = null;
  }

  private hide(): void {
    this.display.visible = false;
  }

  private ensureTexture(w: number, h: number): void {
    const resolution = Math.min(SUPERSAMPLE, MAX_TEXTURE_SIZE / Math.max(w, h));
    const key = `${w}x${h}@${resolution}`;
    if (this.rt && key === this.rtKey) return;
    const next = RenderTexture.create({ width: w, height: h, resolution, antialias: true });
    this.display.texture = next;
    this.rt?.destroy(true);
    this.rt = next;
    this.rtKey = key;
  }
}
