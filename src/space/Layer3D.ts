import { Container, Matrix, PerspectiveMesh, RenderTexture, Texture } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { DiscBlurFilter } from '../filters/DiscBlur';
import { MAX_BLUR, MIN_BLUR } from './focus';
import { describeLayer } from '../core/lint';
import { DEG, NEAR, projectLayer, type CameraBasis, type LayerTransform, type Rect } from './math';

/** Render textures are capped at this many pixels on the long side; larger layers are downscaled. */
export const MAX_TEXTURE_SIZE = 4096;
/**
 * Render textures are drawn at this multiple of the layer size (until the caps),
 * so a layer enlarged by perspective (z > 0) stays sharp instead of showing
 * jagged edges and soft text.
 */
export const SUPERSAMPLE = 2;
/** Total texture pixels per layer are capped here (≈ one 2048² target); resolution drops to fit. */
export const MAX_TEXTURE_PIXELS = 2048 * 2048;
/** MSAA multiplies target memory ~4x, so only small textures get it (supersampling covers the rest). */
export const ANTIALIAS_MAX_PIXELS = 1024 * 1024;
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

interface TextureSize { w: number; h: number; resolution: number; antialias: boolean }

/** Sum of the target's filter paddings: the texture must be this much larger on every side or filter output is clipped. */
function filterPadding(target: Container): number {
  const filters = (target as unknown as { filters?: ReadonlyArray<{ padding?: number }> | null }).filters;
  if (!Array.isArray(filters)) return 0;
  let pad = 0;
  for (const f of filters) pad += f?.padding ?? 0;
  return Number.isFinite(pad) && pad > 0 ? Math.ceil(pad) : 0;
}

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
  /**
   * Textures replaced by a bigger / smaller one. Destroying one right away warns "destroyed while still
   * bound": the mesh's bind group still points at it until the next render. They go at the next update,
   * by which time a frame has been drawn with the new texture.
   */
  private retired: RenderTexture[] = [];
  private size: TextureSize | null = null;
  private warnedBehind = false;
  /** Depth-of-field blur radius (px) from the last `setBlur`; 0 = no filter. */
  blur = 0;
  private blurFilter: DiscBlurFilter | null = null;
  private blendWas = 'normal';

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
    this.flushRetired();
    const target = this.seq.target as Carrier | null;
    // Pixi skips rendering (and clearing) a container that is not `visible`
    // (e.g. PixiPlugin autoAlpha at alpha 0), which would leave a stale texture.
    if (!target || !target.renderable || !target.visible) return this.hide();

    const bounds = this.frameOf();
    const pad = filterPadding(target);
    const needW = Math.ceil(bounds.width + 2 * pad);
    const needH = Math.ceil(bounds.height + 2 * pad);
    if (!(needW >= 1 && needH >= 1) || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return this.hide();

    const size = this.sizeFor(needW, needH);
    // The quad covers exactly the texture's pixel rect in layer space.
    const frame: Rect = { x: bounds.x - pad, y: bounds.y - pad, width: size.w, height: size.h };
    const projected = projectLayer(readLayerTransform(target), frame, basis);
    this.depth = projected.depth;
    if (!projected.visible) {
      if (!this.warnedBehind) {
        this.warnedBehind = true;
        if ((this.seq.spec as { hideBehindCamera?: boolean }).hideBehindCamera) return this.hide();     // on purpose: say nothing
        if (projected.depth > NEAR) {
          // the layer's own origin is in front of the camera: a tilt or a large size swings a CORNER past the camera plane
          console.warn(
            `pixi-effects: ${describeLayer(this.seq.spec)}: part of it (a corner) reaches the camera plane (z = ${(target.z ?? 0).toFixed(0)}, rotationX ${(target.rotationX ?? 0).toFixed(0)}°, rotationY ${(target.rotationY ?? 0).toFixed(0)}°), ` +
            `and a layer is hidden whole when any corner is at or behind it. Tilt it less (rotationX / rotationY), make it smaller, or keep the camera further away from it ` +
            `(the default camera sits at z = (height/2)/tan(fov/2), about 989 for 720p at fov 40).`,
          );
        } else {
          console.warn(
            `pixi-effects: ${describeLayer(this.seq.spec)} is at or behind the camera plane (z = ${(target.z ?? 0).toFixed(0)}) and is hidden. ` +
            `If that is unintended, lower its z or move the camera back (the default camera sits at z = (height/2)/tan(fov/2), about 989 for 720p at fov 40).`,
          );
        }
      }
      return this.hide();
    }

    this.ensureTexture(size);
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

  /**
   * Depth-of-field blur on the projected mesh (screen space), so a tilted or scaled layer blurs by the size it is drawn at.
   * A radius under MIN_BLUR removes the filter: a sharp layer costs nothing. A blend mode moves to the filter while it is on
   * (a filtered object blends as a whole), and comes back when it goes.
   */
  setBlur(radius: number): void {
    const d = this.display as unknown as { filters: unknown; blendMode: string };
    // No hysteresis on purpose: whether a layer has the filter must depend only on this frame's radius, never on the frame before it
    // (a frame is a pure function of the camera and the layers, whichever order frames are visited in). A layer hovering at the
    // threshold creates and destroys a cheap filter object each frame; that is the price of determinism.
    const r = radius > MIN_BLUR ? Math.min(radius, MAX_BLUR) : 0;
    this.blur = r;
    if (r === 0) {
      if (this.blurFilter) {
        d.filters = null;
        d.blendMode = this.blendWas;
        this.blurFilter.destroy();
        this.blurFilter = null;
      }
      return;
    }
    if (!this.blurFilter) {
      this.blurFilter = new DiscBlurFilter(r);
      this.blendWas = d.blendMode ?? 'normal';
      // only an explicit mode moves ('inherit' is Pixi's default for a container and 'normal' is the filter's own: nothing to move)
      if (this.blendWas !== 'normal' && this.blendWas !== 'inherit') { this.blurFilter.blendMode = this.blendWas as never; d.blendMode = 'normal'; }
      d.filters = [this.blurFilter];
    }
    this.blurFilter.radius = r;
  }

  destroy(): void {
    this.setBlur(0);
    this.display.destroy();
    this.rt?.destroy(true);
    this.rt = null;
    this.flushRetired();
  }

  private flushRetired(): void {
    for (const t of this.retired) t.destroy(true);
    this.retired = [];
  }

  private hide(): void {
    this.display.visible = false;
  }

  /**
   * Texture size for content of w×h. An existing texture is kept while it is at
   * least that big and at most 2x too big, so content whose bounds change every
   * frame (typewriter text, growing shapes) does not reallocate each frame.
   */
  private sizeFor(w: number, h: number): TextureSize {
    const cur = this.size;
    if (cur && cur.w >= w && cur.h >= h && cur.w <= 2 * w && cur.h <= 2 * h) return cur;
    const resolution = Math.min(
      SUPERSAMPLE,
      MAX_TEXTURE_SIZE / Math.max(w, h),
      Math.sqrt(MAX_TEXTURE_PIXELS / (w * h)),
    );
    const antialias = w * h * resolution * resolution <= ANTIALIAS_MAX_PIXELS;
    return { w, h, resolution, antialias };
  }

  private ensureTexture(size: TextureSize): void {
    if (this.rt && this.size === size) return;
    // Same sampling: resize the texture where it is. Replacing it makes Pixi warn that the old one was
    // destroyed while still bound, because the mesh keeps pointing at it until the next render.
    if (this.rt && this.size && this.size.antialias === size.antialias) {
      this.rt.resize(size.w, size.h, size.resolution);
      this.size = size;
      return;
    }
    const next = RenderTexture.create({
      width: size.w, height: size.h, resolution: size.resolution, antialias: size.antialias,
    });
    this.display.texture = next;
    if (this.rt) this.retired.push(this.rt);
    this.rt = next;
    this.size = size;
  }
}
