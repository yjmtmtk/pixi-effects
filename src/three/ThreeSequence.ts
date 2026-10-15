import { Sprite, Texture } from 'pixi.js';
import { PerspectiveCamera, Scene, WebGLRenderer, type Camera } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PathRouters } from '../core/Timeline';
import type { PropValue } from '../types';
import type { ThreeContext, ThreeSequenceSpec } from './types';
import { checkRendererKind, getPageRenderer } from './defaults';

export class ThreeSequence extends Sequence {
  private _renderer: WebGLRenderer | WebGPURenderer | null = null;
  /** The renderer this layer draws with (`'webgl'` or `'webgpu'`), once it is built. */
  renderer: 'webgl' | 'webgpu' | null = null;
  /** The backend under it: `'webgl'`, `'webgpu'`, or `'webgl2'` when three's WebGPURenderer found no WebGPU in this browser and used its own WebGL2 backend (the same picture). */
  backend: 'webgl' | 'webgpu' | 'webgl2' | null = null;
  private _gpu = false;                       // renderer: 'webgpu': async init and async render
  private _scene: Scene | null = null;
  private _camera: Camera | null = null;
  private _ctx: ThreeContext | null = null;
  private _objects: Record<string, object> = {};
  private _warnedUpdate = false;
  private _warnedNodeFrame = false;
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
    const antialias = spec.antialias ?? true;
    const kind = spec.renderer ?? getPageRenderer();
    checkRendererKind(kind, "a three layer's renderer");
    this._gpu = kind === 'webgpu';
    this.renderer = kind;
    let renderer: WebGLRenderer | WebGPURenderer;
    if (this._gpu) {
      let mod: typeof import('three/webgpu');
      try { mod = await import('three/webgpu'); } catch (err) {
        throw new Error(`pixi-effects: renderer: 'webgpu' needs three 0.17x or later with "three/webgpu" in the import map (${err instanceof Error ? err.message : err})`);
      }
      renderer = new mod.WebGPURenderer({ canvas, alpha: true, antialias });
      this._renderer = renderer;
      // The device is made here: nothing may render before. Where there is no WebGPU three uses its own WebGL2 backend and says so with a warning: that is not a problem
      // (it draws the same picture), so it becomes `backend: 'webgl2'` instead of a line in the author's console.
      const warn = console.warn;
      let noGpu = false;
      console.warn = (...args: unknown[]) => { if (/WebGPU is not available/.test(String(args[0]))) noGpu = true; else warn.apply(console, args as []); };
      try { await renderer.init(); }
      catch (err) { this._disposeRenderer(); throw err; }
      finally { console.warn = warn; }
      this.backend = noGpu ? 'webgl2' : 'webgpu';
    } else {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias });
      this._renderer = renderer;
      this.backend = 'webgl';
    }
    try {
      renderer.setSize(Math.round(width * resolution), Math.round(height * resolution), false);
      renderer.setClearColor(0x000000, 0);

      const scene = new Scene();
      const camera: Camera = new PerspectiveCamera(50, width / height, 0.1, 2000);
      const ctx: ThreeContext = { scene, camera, renderer, width, height };

      let result: Awaited<ReturnType<ThreeSequenceSpec['setup']>>;
      try { result = await spec.setup(ctx); } catch (err) { throw this._gpu ? this._explainWebGpuError(err, spec.name) : err; }
      if (result?.camera) ctx.camera = result.camera;
      this._scene = scene;
      this._camera = ctx.camera;
      this._ctx = ctx;
      this._objects = { ...(result?.objects ?? {}) };
      if (!('camera' in this._objects)) this._objects.camera = this._camera;

      if (this._gpu) this._checkWebGpuMaterials(scene, spec.name);
      // Frame 0 so the texture is never blank before the first tick.
      this._draw(0);

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
    this._draw(t);
    (this.target as Sprite | null)?.texture.source.update();
  }

  /**
   * One render of the scene at the layer-local time `t`. WebGPURenderer.render() needs `await init()` first (done in build); it queues the GPU work, and PixiJS reads the canvas after.
   *
   * Three's WebGPU node system updates the light uniforms (and its `time`) once per FRAME ID, and bumps that id in its own requestAnimationFrame loop only. Renders that
   * follow each other in one task (a seek, an export) would all show the lights of the last animation frame: a lamp keyframed with `three.lamp.intensity` would not move.
   * So before each render the layer advances the node frame itself, and gives `time` the layer's own time (not three's wall clock).
   */
  private _draw(t: number): void {
    if (!this._renderer || !this._scene || !this._camera) return;
    if (this._gpu) this._advanceNodeFrame(t);
    this._renderer.render(this._scene, this._camera);
  }

  /**
   * The author chose renderer: 'webgpu'. Three's WebGPU renderer turns materials into node materials: a ShaderMaterial / RawShaderMaterial cannot run there (three logs an error on
   * every render and draws a default material) and `onBeforeCompile` (a patch of the WebGL shader text) is ignored without a word. Stop, once, naming the first such material and the fix,
   * instead of drawing a picture that is wrong without saying so.
   */
  private _checkWebGpuMaterials(scene: Scene, layerName: string | undefined): void {
    const bad: string[] = [];
    const seen = new Set<unknown>();
    const check = (m: unknown): void => {
      if (!m || typeof m !== 'object' || seen.has(m)) return;
      seen.add(m);
      const mat = m as { type?: string; name?: string; isShaderMaterial?: boolean; isRawShaderMaterial?: boolean };
      const label = `${mat.name ? `"${mat.name}" ` : ''}${mat.type ?? 'material'}`;
      if (mat.isShaderMaterial || mat.isRawShaderMaterial) bad.push(`${label} is a ShaderMaterial (it cannot run on the WebGPU renderer)`);
      else if (Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')) bad.push(`${label} sets onBeforeCompile (the WebGPU renderer ignores it)`);
    };
    scene.traverse?.((o: unknown) => {
      const mats = (o as { material?: unknown }).material;
      for (const m of Array.isArray(mats) ? mats : [mats]) check(m);
    });
    if (!bad.length) return;
    this._disposeRenderer();
    throw new Error(`pixi-effects: three layer${layerName ? ` "${layerName}"` : ''} with renderer: 'webgpu': ${bad[0]}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''}. ` +
      `Add renderer: 'webgl' to this layer (or registerThree({ renderer: 'webgl' }) for the page), or write the look with three's node materials (TSL).`);
  }

  /** The one setup failure everybody meets on the WebGPU renderer: a PMREMGenerator imported from 'three' reads WebGL state the WebGPU renderer does not have. */
  private _explainWebGpuError(err: unknown, layerName: string | undefined): unknown {
    if (err instanceof TypeError && /reading 'buffers'|renderer\.state/.test(err.message)) {
      return new Error(`pixi-effects: three layer${layerName ? ` "${layerName}"` : ''} with renderer: 'webgpu': setup used a WebGL-only helper, most likely a PMREMGenerator imported from 'three'. ` +
        `Import it from 'three/webgpu' (import * as THREE from 'three/webgpu'), or add renderer: 'webgl' to this layer.`, { cause: err });
    }
    return err;
  }

  private _advanceNodeFrame(t: number): void {
    const frame = (this._renderer as unknown as { _nodes?: { nodeFrame?: { update?: () => void; time: number; deltaTime: number } } })._nodes?.nodeFrame;
    if (!frame || typeof frame.update !== 'function') {
      if (!this._warnedNodeFrame) {
        this._warnedNodeFrame = true;
        console.warn("pixi-effects: this three has no node frame to advance (renderer: 'webgpu'): a light animated by keyframes may not follow the time in a seek or an export; use renderer: 'webgl' or report the three version");
      }
      return;
    }
    frame.update();
    frame.time = t;
    frame.deltaTime = 1 / ((this.root as { frameRate?: number }).frameRate ?? 30);
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
      if (!this._gpu) (this._renderer as WebGLRenderer).forceContextLoss();
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
