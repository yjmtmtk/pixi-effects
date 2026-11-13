import { Plane, Vector3, View3D, type Container3D } from '@pixi/3d';
import { AlphaFilter, Matrix, RenderTexture, type Container, type Filter, type Renderer } from 'pixi.js';
import type { CanvasCheck } from '../sequences/Canvas';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PathRouters } from '../core/Timeline';
import { COMMON } from '../core/layerKeys';
import { suggestName } from '../core/options';
import { NOT_PURE } from '../core/purity';
import { applyCameraState, FogMirror, LightMirror } from './spaceBridge';
import { HOST, type LayerTextureHost, type ShownLayer } from './layerTexture';
import { blendFilterFor, isAdvancedBlend, type BlendFilterLike } from '../core/blend';
import type { PropValue } from '../types';
import type { Scene3DContext, Scene3DSequenceSpec } from './types';

/** The keys a scene3d layer has besides the common ones. */
const OWN_KEYS = ['width', 'height', 'view', 'resolution', 'setup', 'update', 'dispose', 'followCamera', 'followLights', 'followFog', 'reuse'] as const;
/** Keys a `three` layer has that a scene3d layer does not have yet (they come in a later release). */
const THREE_ONLY = ['renderer', 'shareGpu', 'antialias'] as const;
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
  /** Things to do before every frame of the scene is drawn (the 2D layers shown on meshes: `layerTexture`), and their handles. */
  private _drawHooks = new Set<() => void>();
  private _shown: ShownLayer[] = [];
  /** What a rebuild matches this layer by (core/reuse.ts); null: never kept (`reuse: false`, no `name`, view options that are not plain data). */
  private _key: string | null = null;
  /** The layer of the tree being replaced whose scene this one takes over at the swap (`commitReuse`): until then it is not this layer's. */
  private _borrowed: Scene3DSequence | null = null;
  /** True once another layer took this layer's scene: destroying this one must not let it go. */
  private _donated = false;
  private _pendingRebinds: Array<() => void> = [];
  private _lightMirror: LightMirror | null = null;
  private _fogMirror: FogMirror | null = null;
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

    // A rebuild (setVars, resize) builds this layer while the old one still plays: when it cannot be told apart from one of the old tree it takes over that one's scene at the swap
    // (setup does not run again)
    this._key = spec.reuse === false || !spec.name ? null : reuseKeyOf(spec, width, height);
    const donor = this._key !== null ? (this.root.reuse?.claim(this._key) as Scene3DSequence | null | undefined) : null;
    if (donor && donor._lendable()) {
      this._borrow(donor, view, renderer ?? null, width, height);
      if (spec.followCamera) this._checkFollowShape(width, height);
      this.buildFilters();
      return;
    }

    const objects: Record<string, object> = {};
    const ctx: Scene3DContext = { view, root: view.root, camera: view.camera, renderer: renderer as Renderer, width, height, objects };
    Object.defineProperty(ctx, HOST, { value: this._makeHost(renderer ?? null), enumerable: false });
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

  /** Reuse (core/reuse.ts): the key this layer is matched by, while it can still lend its scene. */
  reuseKey(): string | null { return this._lendable() ? this._key : null; }
  private _lendable(): boolean { return !!this._view && !!this._ctx && !this._donated && !this._borrowed; }

  /**
   * Take over a layer of the tree being replaced. The view is a PixiJS display object with one parent, so the old view stays in the old tree (which goes on drawing while this tree is
   * built); this layer has a view of its own, and at the swap (`commitReuse`) the old view's whole scene, its camera with it, moves into this one. The objects setup made (and every
   * value an author kept from setup: the camera, the meshes) are the same objects.
   */
  private _borrow(d: Scene3DSequence, view: View3D, renderer: Renderer | null, width: number, height: number): void {
    const old = d._ctx!;
    this._borrowed = d;
    this._objects = d._objects;
    this._players = d._players;
    const ctx: Scene3DContext = { view, root: view.root, camera: old.camera, renderer: renderer as Renderer, width, height, objects: d._objects };
    const host = this._makeHost(renderer);
    Object.defineProperty(ctx, HOST, { value: host, enumerable: false });
    this._ctx = ctx;
    this._pendingRebinds = d._shown.map((h) => h.prepare(host));          // the 2D layers of the new tree are shown from the swap on, not before: the old layer goes on drawing its own
  }

  /** The new tree is on stage: the scene of the layer this one borrowed from moves into this layer's view, for good. */
  commitReuse(): void {
    const d = this._borrowed, view = this._view, ctx = this._ctx;
    if (!d || !view || !ctx) return;
    const from = d._view!;
    const own = view.camera;
    for (const child of [...from.root.children]) view.root.addChild(child);
    view.camera = ctx.camera;                                              // the old view's camera, now under this view's root
    if (own !== ctx.camera) { own.removeFromParent(); own.destroy(); }
    if (ctx.objects.view === from) ctx.objects.view = view;
    this._lightMirror = d._lightMirror;
    this._lightMirror?.rehome(view.root);
    this._fogMirror = null;                                                // made again for this view at the next frame
    this._shown = d._shown;
    this._drawHooks = d._drawHooks;
    d._donated = true;
    this._borrowed = null;
    for (const apply of this._pendingRebinds) apply();
    this._pendingRebinds = [];
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
    if (!spec.followCamera && !spec.followLights && !spec.followFog) return;
    const ctx = this._ctx, view = this._view;
    if (!ctx || !view) return;
    if (!this.parent?.spaceAt) {
      this._say('parent', 'followCamera / followLights / followFog need the layer to sit in a composition that has a camera or a light to follow; this layer\'s parent cannot say (it keeps its own camera and lights)');
      return;
    }
    const space = this.parent.spaceAt((this.absoluteStart ?? this.at) + t);
    ctx.space = space;
    if (spec.followCamera) applyCameraState(view.camera, space.camera);
    if (spec.followLights) (this._lightMirror ??= new LightMirror(view.root, Math.max(ctx.width, ctx.height) * 2, (m) => this._say(`light:${m}`, m), { x: ctx.width / 2, y: -ctx.height / 2, z: 0 })).update(space.lights);
    if (spec.followFog) {
      if (space.fog && space.fog.amount !== 1) this._say('fogAmount', `followFog: the camera's fogAmount is ${space.fog.amount}, and PixiJS 3D's fog has no amount below 1: the layer uses the full amount (set fogColor to the colour you want at the far end, or leave followFog off and set view.fog yourself from ctx.space.fog)`);
      (this._fogMirror ??= new FogMirror(view)).update(space.fog);
    }
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
    for (const h of this._shown) h.keepHidden();                         // a 2D layer shown on a mesh stays off the stage (a tween of autoAlpha writes visible = true)
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
    if (!this._ctx || this._borrowed) return;                            // a layer waiting for the swap: the scene is still the old layer's
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
    for (const hook of this._drawHooks) hook();                          // the 2D layers shown on meshes, drawn into their textures at this frame
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

  /** What `layerTexture` asks of this layer: the layers listed before it, PixiJS's renderer, and a place to hook in before every frame. */
  private _makeHost(renderer: Renderer | null): LayerTextureHost {
    return {
      findLayer: (name) => this.parent?.findLayer?.(name) ?? null,
      layerNames: () => this.parent?.layerNames?.() ?? [],
      pixiRenderer: renderer,
      beforeDraw: (fn) => { this._drawHooks.add(fn); return () => { this._drawHooks.delete(fn); }; },
      track: (handle) => { this._shown.push(handle); return () => { const i = this._shown.indexOf(handle); if (i >= 0) this._shown.splice(i, 1); }; },
    };
  }

  /** The 2D layer that a material shows (`layerTexture`), for a click on the mesh to reach it (movie.pick); null for any other material. */
  screenOf(material: unknown): { source: Sequence; at(u: number, v: number): { x: number; y: number } } | null {
    const handle = this._shown.find((h) => h.material === material);
    return handle ? { source: handle.source(), at: (u, v) => handle.sourceAt(u, v) } : null;
  }

  /** The view's global point at (u, v) of its picture (0..1, v down). */
  private _globalAt(u: number, v: number): { x: number; y: number } | null {
    const view = this._view;
    if (!view) return null;
    const b = view.getLocalBounds();
    return view.toGlobal({ x: b.x + u * b.width, y: b.y + v * b.height });
  }

  /**
   * Make the scene's meshes hit by a ray, exactly: PixiJS 3D only hits nodes whose eventMode is not 'passive', and by default against the mesh's bounding box (a sphere's corners
   * count, and the hit has no uv). A mesh the author left as it was gets eventMode 'static' and hitVolume 'geometry' (per triangle: the silhouette, the normal and the uv a 2D
   * layer on the mesh needs); the author's own choice is kept.
   */
  private _makePickable(): void {
    const root = this._view?.root as unknown as { traverse(cb: (n: unknown) => void): void } | undefined;
    root?.traverse((node) => {
      const n = node as { eventMode?: string; geometry?: unknown; hitVolume?: unknown };
      if (n.eventMode !== 'passive' || n.geometry === undefined) return;
      n.eventMode = 'static';
      if (n.hitVolume === undefined || n.hitVolume === null) n.hitVolume = 'geometry';
    });
  }

  /**
   * `movie.pick`: a ray through (u, v) of the layer's picture (0..1, v down) from the view's camera, and what it meets first: the object's name (its own label, or its nearest
   * labelled ancestor's), where (scene units), how far from the camera, and the node. Uses the transforms of the last render, which is the frame on screen. null when it meets nothing.
   */
  pickAt(u: number, v: number): { object: string; point: [number, number, number]; distance: number; object3d: unknown; uv?: { u: number; v: number }; material?: unknown } | null {
    const view = this._view;
    const at = this._globalAt(u, v);
    if (!view || !at) return null;
    this._makePickable();
    const hit = (view as unknown as { raycast(p: { x: number; y: number }): { target: unknown; point: { x: number; y: number; z: number }; distance: number; uv?: { x: number; y: number } | null } | null }).raycast(at);
    if (!hit) return null;
    let name = '';
    // a node made without a label carries its class name (PixiJS 3D's default: 'Mesh3D'): that is no name, the nearest ancestor's is
    for (let n = hit.target as { label?: string | null; parent?: unknown; constructor?: { name?: string } } | null; n && n !== (view.root as unknown); n = n.parent as typeof n) {
      if (n.label && n.label !== n.constructor?.name) { name = n.label; break; }
    }
    return {
      object: name, point: [hit.point.x, hit.point.y, hit.point.z], distance: hit.distance, object3d: hit.target,
      ...(hit.uv ? { uv: { u: hit.uv.x, v: hit.uv.y } } : {}), material: (hit.target as { material?: unknown }).material,
    };
  }

  /**
   * `hit.scene3d.grab(plane)`: a function of a point (u, v) of the layer's picture that gives where the pointer's ray meets a plane through the grabbed point, and how far that is
   * from it (`delta`): move the object by it. `plane`: 'screen' (facing the camera: the default), 'floor' (horizontal: y up), 'wall' (z constant), or a normal [x, y, z].
   * null where the ray never meets the plane.
   */
  dragPlane(point: [number, number, number], plane: 'screen' | 'floor' | 'wall' | [number, number, number] = 'screen'): (u: number, v: number) => { point: [number, number, number]; delta: [number, number, number] } | null {
    const view = this._view;
    const grabbed = new Vector3(...point);
    let normal: Vector3;
    if (plane === 'floor') normal = new Vector3(0, 1, 0);
    else if (plane === 'wall') normal = new Vector3(0, 0, 1);
    else if (Array.isArray(plane)) normal = new Vector3(...plane).normalize();
    else {
      const m = view?.camera.worldTransform.elements;                                   // the camera looks down its -z: its z axis is the plane's normal
      normal = m ? new Vector3(m[8], m[9], m[10]).normalize() : new Vector3(0, 0, 1);
    }
    const surface = new Plane().setFromNormalAndCoplanarPoint(normal, grabbed);
    return (u, v) => {
      const at = this._globalAt(u, v);
      if (!view || !at) return null;
      const meet = view.screenToRay(at).intersectPlane(surface, new Vector3());
      if (!meet) return null;
      return { point: [meet.x, meet.y, meet.z], delta: [meet.x - grabbed.x, meet.y - grabbed.y, meet.z - grabbed.z] };
    };
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
    // another layer has this layer's scene (or this layer never took the one it borrowed): the scene, the 2D layers on meshes and the lights are not this layer's to let go
    const kept = this._donated || this._borrowed !== null;
    if (!kept) {
      if (this._ctx && spec.dispose) {
        try { spec.dispose(this._ctx); } catch (err) { console.warn(`${this._who()}: dispose() threw —`, err); }
      }
      for (const h of [...this._shown]) { try { h.dispose(); } catch { /* the 2D layer is gone with its tree */ } }
      this._drawHooks.clear();
      this._lightMirror?.dispose();
    }
    this._shown = [];
    this._drawHooks = new Set();
    this._pendingRebinds = [];
    this._borrowed = null;
    this._lightMirror = null;
    this._fogMirror = null;
    this._ctx = null;
    this._objects = {};
    this._players = [];
    this._destroyView();                                                   // (a view whose scene moved on is empty)
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

/** A number for each function: two layers are the same layer only when their `setup` is the same function. */
const ids = new WeakMap<object, number>();
let lastId = 0;
function idOf(fn: unknown): number {
  if (typeof fn !== 'function') return 0;
  let id = ids.get(fn);
  if (id === undefined) { id = ++lastId; ids.set(fn, id); }
  return id;
}

/** The key a rebuild matches a scene3d layer by: its name, its setup, its size and its options. View options that are not plain data make the layer one that is built again. */
function reuseKeyOf(spec: Scene3DSequenceSpec, width: number, height: number): string | null {
  let view: string;
  try { view = JSON.stringify(spec.view ?? null) ?? 'null'; } catch { return null; }
  return JSON.stringify([spec.name, idOf(spec.setup), width, height, spec.resolution ?? 1, view, !!spec.followCamera, !!spec.followLights, !!spec.followFog]);
}

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}
