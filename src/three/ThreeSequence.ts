import { Sprite, Texture } from 'pixi.js';
import { PerspectiveCamera, Scene, WebGLRenderer, type Camera } from 'three';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PathRouters } from '../core/Timeline';
import type { PropValue } from '../types';
import type { ThreeContext, ThreeSequenceSpec } from './types';

export class ThreeSequence extends Sequence {
  private _renderer: WebGLRenderer | null = null;
  private _scene: Scene | null = null;
  private _camera: Camera | null = null;
  private _ctx: ThreeContext | null = null;
  private _objects: Record<string, object> = {};
  private _warnedUpdate = false;
  private _warnedPaths = new Set<string>();

  private get _threeSpec(): ThreeSequenceSpec {
    return this.spec as unknown as ThreeSequenceSpec;
  }

  protected override pathRouters(): PathRouters {
    return { three: (path) => this._resolveThreePath(path) };
  }

  async build(): Promise<void> {
    const spec = this._threeSpec;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }

    // Resolve layer size. Expressions see the usual scope; intrinsic w/h are
    // still 0 here (same chicken-and-egg as shapes), so W/H/GW/GH carry it.
    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    const width = resolveDim(spec.width, scope) ?? this.parent?.width ?? this.root.width;
    const height = resolveDim(spec.height, scope) ?? this.parent?.height ?? this.root.height;
    const resolution = spec.resolution ?? 1;

    // Offscreen canvas — never attached to the DOM. document.createElement
    // (not OffscreenCanvas) so PIXI's Texture.from and three both accept it.
    const canvas = document.createElement('canvas');
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this._renderer = renderer;
    try {
      renderer.setSize(Math.round(width * resolution), Math.round(height * resolution), false);
      renderer.setClearColor(0x000000, 0);

      const scene = new Scene();
      const camera: Camera = new PerspectiveCamera(50, width / height, 0.1, 2000);
      const ctx: ThreeContext = { scene, camera, renderer, width, height };

      const result = await spec.setup(ctx);
      if (result?.camera) ctx.camera = result.camera;
      this._scene = scene;
      this._camera = ctx.camera;
      this._ctx = ctx;
      this._objects = { ...(result?.objects ?? {}) };
      if (!('camera' in this._objects)) this._objects.camera = this._camera;

      // Frame 0 so the texture is never blank before the first tick.
      renderer.render(scene, this._camera);

      const texture = Texture.from(canvas);
      const sprite = new Sprite({ texture, label: spec.name });
      sprite.cullable = true;
      // Texture is canvas-sized (layer px × resolution); scale back to comp px.
      sprite.width = width;
      sprite.height = height;
      this.target = sprite;
      this.intrinsicWidth = width;
      this.intrinsicHeight = height;
      this.buildFilters();
    } catch (err) {
      this._disposeRenderer();
      throw err;
    }
  }

  /**
   * Per-frame sync hook. Movie._awaitVideoFrames duck-types on this method
   * (same contract as VideoSequence) and awaits it inside gotoFrame — the
   * single frame path shared by playback and export, which is what makes
   * three layers deterministic in both.
   */
  async awaitFrameAt(local: number): Promise<void> {
    if (!this._renderer || !this._scene || !this._camera || !this._ctx) return;
    const spec = this._threeSpec;
    const t = Math.max(0, Math.min(local, this.duration ?? local));
    if (spec.update) {
      try {
        spec.update(t, this._ctx);
      } catch (err) {
        if (!this._warnedUpdate) {
          this._warnedUpdate = true;
          console.warn('pixi-effects: three update() threw (reported once) —', err);
        }
      }
    }
    this._renderer.render(this._scene, this._camera);
    (this.target as Sprite | null)?.texture.source.update();
  }

  private _resolveThreePath(path: string): { target: object; prop: string } | null {
    const segs = path.split('.');
    if (segs.length < 2) {
      this._warnPath(path, 'needs at least <object>.<prop>');
      return null;
    }
    let obj: unknown = this._objects[segs[0]!];
    if (obj == null) {
      this._warnPath(path, `unknown object "${segs[0]}" — expose it via setup's { objects }`);
      return null;
    }
    for (let i = 1; i < segs.length - 1; i++) {
      obj = (obj as Record<string, unknown>)[segs[i]!];
      if (obj == null) {
        this._warnPath(path, `"${segs[i]}" is undefined along the path`);
        return null;
      }
    }
    const prop = segs[segs.length - 1]!;
    if (typeof obj !== 'object' || !(prop in (obj as object))) {
      this._warnPath(path, `no property "${prop}"`);
      return null;
    }
    return { target: obj as object, prop };
  }

  private _warnPath(path: string, why: string): void {
    if (this._warnedPaths.has(path)) return;
    this._warnedPaths.add(path);
    console.warn(`pixi-effects: keyframe path three.${path} ${why}; skipped`);
  }

  private _disposeRenderer(): void {
    if (!this._renderer) return;
    try {
      this._renderer.dispose();
      this._renderer.forceContextLoss();
    } catch (err) {
      console.warn('pixi-effects: three renderer dispose threw —', err);
    }
    this._renderer = null;
  }

  override destroy(): void {
    const spec = this._threeSpec;
    if (this._ctx && spec.dispose) {
      try { spec.dispose(this._ctx); } catch (err) {
        console.warn('pixi-effects: three dispose() threw —', err);
      }
    }
    const texture = (this.target as Sprite | null)?.texture;
    this._disposeRenderer();
    this._scene = null;
    this._camera = null;
    this._ctx = null;
    this._objects = {};
    super.destroy();
    texture?.destroy(true); // canvas-backed source is per-sequence; safe to kill
  }
}

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}
