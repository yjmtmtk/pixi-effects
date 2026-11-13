import { View3D, type Container3D } from '@pixi/3d';
import { AlphaFilter, Matrix, RenderTexture, type Container, type Filter, type Renderer } from 'pixi.js';
import type { CanvasCheck } from '../sequences/Canvas';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PathRouters } from '../core/Timeline';
import { COMMON } from '../core/layerKeys';
import { suggestName } from '../core/options';
import { NOT_PURE } from '../core/purity';
import { applyCameraState } from './spaceBridge';
import { blendFilterFor, isAdvancedBlend, type BlendFilterLike } from '../core/blend';
import type { PropValue } from '../types';
import type { Scene3DContext, Scene3DSequenceSpec } from './types';

/** The keys a scene3d layer has besides the common ones. */
const OWN_KEYS = ['width', 'height', 'view', 'resolution', 'setup', 'update', 'dispose', 'followCamera'] as const;
/** Keys a `three` layer has that a scene3d layer does not have yet (they come in a later release). */
const THREE_ONLY = ['followLights', 'followFog', 'renderer', 'shareGpu', 'antialias', 'reuse'] as const;
/** What the layer owns: given in `view`, they are ignored. */
const LAYER_OWNED = ['width', 'height', 'autoResize'] as const;

/**
 * A `scene3d` layer: a PixiJS 3D scene (`View3D`) drawn inside PixiJS's own renderer, in the layer's place in the stack. The author builds the scene in `setup` and
 * sets it from the time in `update`; `awaitFrameAt` (the per-frame hook `Movie` awaits for playback, seek and export alike) runs `update`, and PixiJS draws the view with the stage.
 */
export class Scene3DSequence extends Sequence {
  private _view: View3D | null = null;
  private _ctx: Scene3DContext | null = null;
  private _objects: Record<string, object> = {};
  private _warned = new Set<string>();
  /** The animation players under the root (found after setup). */
  private _players: ClipPlayer[] = [];
  /** The layer's own last filter: what PixiJS 3D ignores on its view (alpha, its parents' alpha, a basic blend mode) applied to the view's picture. Only there while needed. */
  private _look: AlphaFilter | null = null;
  /** An advanced blend mode on a layer with no filter of its own: its blend filter, owned by the layer (the view's own blend mode would be shut inside the look filter's pass). */
  private _blend: BlendFilterLike | null = null;
  /** The layer's time, what PixiJS 3D's shader time `uTime` reads once pinned (see `_pinShaderTime`). */
  private _time = 0;
  private _pinned = false;

  /** The PixiJS 3D view this layer shows (null before build and after destroy). */
  get view(): View3D | null { return this._view; }

  private get _spec(): Scene3DSequenceSpec {
    return this.spec as unknown as Scene3DSequenceSpec;
  }

  private _say(key: string, message: string): void {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`${this._who()}: ${message}`);
  }

  private _who(): string {
    const name = this._spec.name;
    return `pixi-effects: scene3d layer${name ? ` "${name}"` : ''}`;
  }

  protected override pathRouters(): PathRouters {
    return { scene3d: (path) => this._resolvePath(path) };
  }

  async build(): Promise<void> {
    const spec = this._spec;
    if (this.duration === undefined) this.duration = this.parent?.duration ?? this.root.duration;
    this._checkKeys();
    this._checkTint();
    if (typeof spec.update === 'function' && NOT_PURE.test(spec.update.toString())) {
      this._say('pure', 'update calls Math.random, Date.now, performance.now or new Date, so it is not deterministic: the same frame would draw differently in playback, in a seek and in an export. Derive the value from t');
    }

    const renderer = this.root.pixiRenderer as Renderer | undefined;
    if (renderer && !(renderer.renderPipes as unknown as Record<string, unknown>).view3d) {
      throw new Error(`${this._who()}: PixiJS 3D was loaded after the renderer started; import 'pixi-effects/3d' (and call register3D()) before movie.init`);
    }

    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    const width = resolveDim(spec.width, scope) ?? this.parent?.width ?? this.root.width;
    const height = resolveDim(spec.height, scope) ?? this.parent?.height ?? this.root.height;
    const viewOptions: Record<string, unknown> = { ...(spec.view ?? {}) };
    const owned = LAYER_OWNED.filter(k => k in viewOptions);
    if (owned.length) {
      this._say('owned', `${owned.join(' / ')} belong${owned.length === 1 ? 's' : ''} on the layer, not in view; ignored`);
      for (const k of owned) delete viewOptions[k];
    }

    const view = new View3D({ cull: 'cpu', ...viewOptions, width, height, ...(spec.resolution !== undefined ? { resolution: spec.resolution } : {}) } as ConstructorParameters<typeof View3D>[0]);
    view.label = spec.name ?? 'scene3d';
    this._view = view;
    this.target = view;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;

    const objects: Record<string, object> = {};
    const ctx: Scene3DContext = { view, root: view.root, camera: view.camera, renderer: renderer as Renderer, width, height, objects };
    let result: Awaited<ReturnType<Scene3DSequenceSpec['setup']>>;
    try {
      result = await spec.setup(ctx);
    } catch (err) {
      this._destroyView();
      throw new Error(`${this._who()}: setup failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    Object.assign(objects, result?.objects ?? {});
    if (!('camera' in objects)) objects.camera = view.camera;
    if (!('view' in objects)) objects.view = view;
    this._objects = objects;
    this._ctx = ctx;
    this._stopSelfUpdating(view.root);
    if (spec.followCamera) this._checkFollowShape(width, height);
    this.buildFilters();
  }

  /** Unknown keys (with the likely one), and the keys only a three layer has yet. */
  private _checkKeys(): void {
    const valid: readonly string[] = [...COMMON, ...OWN_KEYS];
    for (const key of Object.keys(this.spec)) {
      if (valid.includes(key)) continue;
      if ((THREE_ONLY as readonly string[]).includes(key)) { this._say(`key:${key}`, `${key} is not on scene3d yet; a three layer has it (type: 'three')`); continue; }
      const guess = suggestName(key, valid);
      this._say(`key:${key}`, `unknown key "${key}"${guess ? `; did you mean "${guess}"?` : ''} (a scene3d layer has ${OWN_KEYS.join(', ')} and the keys every layer has)`);
    }
  }

  /**
   * PixiJS 3D (0.1.0) writes `performance.now()` into the shader time `uTime` of every view at every draw: a shader bit that reads it would follow the wall clock.
   * The view's global uniforms exist once PixiJS has drawn it; from then on `uTime` reads the layer's time and the pipe's write is ignored. Tried before every frame
   * until it holds (drawing the view on its own at build to make them sooner broke a stencil mask on it later). This reaches into the view's per-renderer data
   * (`_gpuData[renderer.uid].globalUniformGroup.uniforms`); when that is there but has no `uTime` (another version), say so once.
   */
  private _pinShaderTime(): void {
    if (this._pinned) return;
    const view = this._view, renderer = this.root.pixiRenderer as Renderer | undefined;
    if (!view || !renderer) return;
    const data = (view as unknown as { _gpuData?: Record<number, { globalUniformGroup?: { uniforms?: Record<string, unknown> } }> })._gpuData?.[renderer.uid];
    if (!data) return;                                                                   // not drawn yet
    this._pinned = true;
    const uniforms = data.globalUniformGroup?.uniforms;
    if (!uniforms || !('uTime' in uniforms)) {
      this._say('uTime', "could not tie PixiJS 3D's shader time uTime to the video's time (no global uniforms found): a custom shader bit that reads uTime follows the wall clock; give it a uniform you set from t instead");
      return;
    }
    Object.defineProperty(uniforms, 'uTime', { configurable: true, enumerable: true, get: () => this._time, set: () => { /* the pipe's wall clock: ignored */ } });
  }

  /**
   * `followCamera` (and, later, `followLights` / `followFog`): before each frame, ask the composition for its camera at this moment (the layer's time on the composition's
   * clock) and put the view's camera there. `ctx.space` keeps the raw numbers for `update`, which runs after and may override.
   */
  private _followSpace(t: number): void {
    const spec = this._spec;
    if (!spec.followCamera) return;
    const ctx = this._ctx, view = this._view;
    if (!ctx || !view) return;
    if (!this.parent?.spaceAt) {
      this._say('parent', 'followCamera needs the layer to sit in a composition that has a camera to follow; this layer\'s parent cannot say (it keeps its own camera)');
      return;
    }
    const space = this.parent.spaceAt((this.absoluteStart ?? this.at) + t);
    ctx.space = space;
    applyCameraState(view.camera, space.camera);
  }

  /** followCamera shows the whole composition through the layer's picture: a layer of another shape would show it squeezed or cut. Said once at build. */
  private _checkFollowShape(width: number, height: number): void {
    const p = this.parent;
    if (!p || !(p.width > 0 && p.height > 0)) return;
    if (Math.abs(width * p.height - height * p.width) <= 1e-3 * width * p.height) return;
    this._say('shape', `followCamera: the layer is ${width} x ${height} but the composition is ${p.width} x ${p.height}; the camera shows the whole composition, so the layer needs its aspect ratio (drop width / height to cover the composition)`);
  }

  /** PixiJS 3D draws the view in its materials' colours: a tint does nothing. Said once, at build. */
  private _checkTint(): void {
    const spec = this._spec as { initial?: Record<string, unknown>; keyframes?: Array<{ to?: Record<string, unknown>; from?: Record<string, unknown> }> };
    const uses = spec.initial?.tint !== undefined || (spec.keyframes ?? []).some(k => k?.to?.tint !== undefined || k?.from?.tint !== undefined);
    if (uses) this._say('tint', 'tint is ignored on a scene3d layer (PixiJS 3D draws its own colours): colour the materials, or put a filter on the layer');
  }

  /**
   * Every frame, before the draw: PixiJS 3D ignores the view's alpha (and its parents') and a basic blend mode, so when the layer is not at full strength or blends,
   * its picture goes through one AlphaFilter of the layer's own, last in its filter list, that applies them. A layer at alpha 1 with a normal blend has no such filter.
   */
  override syncFrame(): void {
    super.syncFrame();
    const view = this._view;
    if (!view) return;
    let alpha = 1;
    for (let c: Container | null = view; c; c = c.parent) alpha *= c.alpha;
    const current = (view.filters ?? []) as readonly Filter[];
    const others = current.filter(f => f !== this._look && f !== (this._blend as unknown));
    // Where the blend goes (blend.ts put it on the view, or on the last of the layer's filters):
    // - filters of its own (the author's, a matte, an advanced blend appended to them): the blend sits on the last of them; the look filter goes FIRST and only fades.
    // - no filter, a basic mode: the view's own mode is ignored by PixiJS 3D, so the look filter carries it, as the only pass.
    // - no filter, an advanced mode: a blend filter of the layer's own ends the chain (the view's own mode would be shut inside the look filter's pass); the view stays normal.
    const authored = String((this.spec as { blendMode?: unknown }).blendMode ?? 'normal');
    if (others.length === 0 && isAdvancedBlend(authored) && !this._blend) {
      this._blend = blendFilterFor(authored);
      if (this._blend) view.blendMode = 'normal';
    }
    const mode = String(view.blendMode ?? 'normal');
    const basic = others.length === 0 && (mode === 'add' || mode === 'screen' || mode === 'multiply');
    const need = alpha < 1 || basic;
    const own = this._blend && others.length === 0 ? [this._blend as unknown as Filter] : [];
    let next: Filter[] = [...others, ...own];
    if (need) {
      const look = (this._look ??= new AlphaFilter({ alpha: 1 }));
      look.alpha = alpha;
      look.blendMode = (basic ? mode : 'normal') as AlphaFilter['blendMode'];
      next = others.length || own.length ? [look, ...others, ...own] : [look];
    }
    if (next.length !== current.length || next.some((f, k) => f !== current[k])) view.filters = next.length ? next : null;
  }

  /**
   * Models, animation players and particle systems update themselves on PixiJS's shared ticker unless told otherwise: their picture would follow the browser's clock,
   * not the video's time. Turn that off on everything under the root, and say once what was turned off (the author drives them from `update`).
   */
  private _stopSelfUpdating(root: Container3D): void {
    const stopped: string[] = [];
    const visit = (node: unknown): void => {
      const n = node as { label?: string; constructor?: { name?: string }; autoUpdate?: unknown; player?: ClipPlayer };
      let hit = false;
      if (n.player && Array.isArray(n.player.animationLabels) && !this._players.includes(n.player)) this._players.push(n.player);
      if (n.player && n.player.autoUpdate === true) { n.player.autoUpdate = false; hit = true; }
      if (n.autoUpdate === true) { n.autoUpdate = false; hit = true; }
      if (hit) stopped.push(n.label || n.constructor?.name || 'a node');
    };
    (root as unknown as { traverse(cb: (n: unknown) => void): void }).traverse(visit);
    if (stopped.length) {
      this._say('autoUpdate', `turned off autoUpdate on ${stopped.join(', ')}: a video draws from the time, so drive them from update(t) (a model's clip: model.player.getState(name).gotoAndStop(t))`);
    }
  }

  /**
   * Per-frame hook, duck-typed by `Movie._awaitVideoFrames` (as the video and three layers are): the single frame path of playback, seek and export.
   * `update` sets the scene from the time; PixiJS draws the view with the rest of the stage.
   */
  async awaitFrameAt(local: number): Promise<void> {
    if (!this._ctx) return;
    const t = Math.max(0, Math.min(local, this.duration ?? local));
    this._time = t;
    this._pinShaderTime();
    this._followSpace(t);
    const update = this._spec.update;
    if (update) {
      try {
        update(t, this._ctx);
      } catch (err) {
        this._say('update', `update threw (reported once): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this._poseClips(t);
  }

  /**
   * A clip still playing after `update` (a model made with `autoPlay`, a `player.play(name)` in setup) is posed by nobody: it would move with the ticker, or not at all.
   * The layer poses it from its own time (its speed and loop kept) and leaves it playing, so it plays in the video as it would in a page. A clip `update` poses itself
   * (`gotoAndStop(t)` stops it) is left alone. Nothing is remembered from one frame to the next: the frame depends on this frame's `update` only.
   */
  private _poseClips(t: number): void {
    for (const player of this._players) {
      for (const label of player.animationLabels) {
        const state = player.getState(label);
        if (!state.playing) continue;
        const length = state.animation.duration;
        const x = t * (state.animationSpeed ?? 1);
        state.gotoAndStop(length > 0 ? (state.loop ? ((x % length) + length) % length : Math.min(Math.max(x, 0), length)) : 0);
        state.play();                                                                   // still playing: posed again next frame (no ticker advances it)
      }
    }
  }


  /**
   * The determinism check (`check`, `movie.review()`): the scene set by `update` and drawn at a few moments in two orders, with one draw thrown away first, and the pictures
   * compared, as the canvas and three layers are. A scene whose same frame is not the same picture (state kept from call to call, a clock, a player or particle system on its
   * own clock, a motion blur that reads the last frame) is reported. It draws the view alone into a texture of its own size with PixiJS's renderer; the next real frame sets
   * the scene again, so nothing is left behind.
   */
  checkDeterminism(times: number[]): CanvasCheck {
    const none: CanvasCheck = { differs: [], drawMs: 0, threw: [] };
    const view = this._view, ctx = this._ctx;
    const renderer = this.root.pixiRenderer as Renderer | undefined;
    if (!view || !ctx || !renderer) return none;
    const w = Math.max(1, Math.ceil(ctx.width)), h = Math.max(1, Math.ceil(ctx.height));
    const rt = RenderTexture.create({ width: w, height: h });
    // PixiJS makes a container it renders on its own a render group (AbstractRenderer.render: enableRenderGroup); a view left as one loses its stencil mask
    // in the stage's later draws (found 2026-11-13: check's contact sheet showed a masked scene3d unmasked). Put it back as it was.
    const wasGroup = view.isRenderGroup;
    const at = new Matrix().translate(view.anchor.x * w, view.anchor.y * h);       // the view alone, its top-left at the texture's
    const keep = w * h * 4 * times.length <= 96e6;
    const hash = (d: Uint8Array | Uint8ClampedArray): number => { let x = 0x811c9dc5; for (let i = 0; i < d.length; i++) { x ^= d[i]!; x = Math.imul(x, 0x01000193); } return x >>> 0; };
    const ms: number[] = [];
    const threw = new Set<number>();
    const update = this._spec.update;
    const once = (t: number, timed: boolean): Uint8Array | Uint8ClampedArray => {
      const from = performance.now();
      let pixels: Uint8Array | Uint8ClampedArray = new Uint8Array(0);
      try {
        this._time = t;
        this._followSpace(t);
        update?.(t, ctx);
        this._poseClips(t);
        renderer.render({ container: view, target: rt, clear: true, transform: at });
        pixels = renderer.extract.pixels(rt).pixels;
      } catch { threw.add(t); }
      if (timed) ms.push(performance.now() - from);
      return pixels;
    };
    try {
      for (const t of times) once(t, false);                                       // the warm-up
      const first = times.map(t => { const d = once(t, true); return keep ? d.slice() : hash(d); });
      const second = [...times].reverse().map(t => once(t, false)).reverse();
      const differs: CanvasCheck['differs'] = [];
      times.forEach((t, i) => {
        const a = first[i]!, b = second[i]!;
        if (typeof a === 'number') { if (a !== hash(b)) differs.push({ t, pixels: -1, maxDiff: -1 }); return; }
        let pixels = 0, maxDiff = 0;
        for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k]! - b[k]!); if (d) { pixels++; if (d > maxDiff) maxDiff = d; } }
        if (pixels) differs.push({ t, pixels, maxDiff });
      });
      ms.sort((x, y) => x - y);
      return { differs: differs.filter(d => !threw.has(d.t)), drawMs: ms.length ? ms[Math.floor(ms.length / 2)]! : 0, threw: times.filter(t => threw.has(t)) };
    } finally {
      rt.destroy(true);
      if (!wasGroup && view.isRenderGroup) view.disableRenderGroup();
    }
  }

  private _resolvePath(path: string): { target: object; prop: string } | null {
    const segs = path.split('.');
    if (segs.length < 2) { this._warnPath(path, 'needs at least <object>.<prop>'); return null; }
    let obj: unknown = this._objects[segs[0]!];
    if (obj == null) {
      this._warnPath(path, `unknown object "${segs[0]}" (known: ${Object.keys(this._objects).join(', ')}): expose it in setup's { objects }`);
      return null;
    }
    for (let i = 1; i < segs.length - 1; i++) {
      obj = (obj as Record<string, unknown>)[segs[i]!];
      if (obj == null) { this._warnPath(path, `"${segs[i]}" is undefined along the path`); return null; }
    }
    const prop = segs[segs.length - 1]!;
    if (typeof obj !== 'object' || !(prop in (obj as object))) { this._warnPath(path, `no property "${prop}"`); return null; }
    return { target: obj as object, prop };
  }

  private _warnPath(path: string, why: string): void {
    this._say(`path:${path}`, `keyframe path scene3d.${path}: ${why}; skipped`);
  }

  private _destroyView(): void {
    const view = this._view;
    this._view = null;
    if (this.target === view) this.target = null;
    try { view?.destroy({ children: true }); } catch (err) { console.warn(`${this._who()}: destroying the view threw —`, err); }
  }

  override destroy(): void {
    const spec = this._spec;
    if (this._ctx && spec.dispose) {
      try { spec.dispose(this._ctx); } catch (err) { console.warn(`${this._who()}: dispose() threw —`, err); }
    }
    this._ctx = null;
    this._objects = {};
    this._players = [];
    this._destroyView();
    this._look?.destroy();
    this._look = null;
    this._blend?.destroy();
    this._blend = null;
    super.destroy();
  }
}

/** What the layer uses of a PixiJS 3D animation player (public API only). */
interface ClipState { readonly playing: boolean; readonly animation: { duration: number }; animationSpeed?: number; loop: boolean; gotoAndStop(time: number): unknown; play(): unknown }
interface ClipPlayer { autoUpdate?: unknown; readonly animationLabels: readonly string[]; getState(label: string): ClipState }

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}
