import { View3D, type Container3D } from '@pixi/3d';
import { AlphaFilter, type Container, type Filter, type Renderer } from 'pixi.js';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PathRouters } from '../core/Timeline';
import { COMMON } from '../core/layerKeys';
import { suggestName } from '../core/options';
import { NOT_PURE } from '../core/purity';
import type { PropValue } from '../types';
import type { Scene3DContext, Scene3DSequenceSpec } from './types';

/** The keys a scene3d layer has besides the common ones. */
const OWN_KEYS = ['width', 'height', 'view', 'resolution', 'setup', 'update', 'dispose'] as const;
/** Keys a `three` layer has that a scene3d layer does not have yet (they come in a later release). */
const THREE_ONLY = ['followCamera', 'followLights', 'followFog', 'renderer', 'shareGpu', 'antialias', 'reuse'] as const;
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
  /** Clips left playing after `update` (nobody posed them: `autoPlay`): the layer poses them from its own time every frame. */
  private _playedClips = new Set<ClipState>();
  /** The layer's own last filter: what PixiJS 3D ignores on its view (alpha, its parents' alpha, a basic blend mode) applied to the view's picture. Only there while needed. */
  private _look: AlphaFilter | null = null;

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
    const mode = String(view.blendMode ?? 'normal');
    const blends = mode === 'add' || mode === 'screen' || mode === 'multiply';
    const need = alpha < 1 || blends;
    const current = (view.filters ?? []) as readonly Filter[];
    const others = current.filter(f => f !== this._look);
    if (need) {
      const look = (this._look ??= new AlphaFilter({ alpha: 1 }));
      look.alpha = alpha;
      look.blendMode = (blends ? mode : 'normal') as AlphaFilter['blendMode'];
      if (current[current.length - 1] !== look) view.filters = [...others, look];
    } else if (others.length !== current.length) {
      view.filters = others.length ? others : null;
    }
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
   * The layer takes it over and poses it from its own time (its speed and loop kept), so it plays in the video as it would in a page. A clip `update` poses itself
   * (`gotoAndStop(t)` stops it) is left alone.
   */
  private _poseClips(t: number): void {
    for (const player of this._players) {
      for (const label of player.animationLabels) {
        const state = player.getState(label);
        if (state.playing) this._playedClips.add(state);
      }
    }
    for (const state of this._playedClips) {
      const length = state.animation.duration;
      const x = t * (state.animationSpeed ?? 1);
      state.gotoAndStop(length > 0 ? (state.loop ? ((x % length) + length) % length : Math.min(Math.max(x, 0), length)) : 0);
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
    this._playedClips.clear();
    this._destroyView();
    this._look?.destroy();
    this._look = null;
    super.destroy();
  }
}

/** What the layer uses of a PixiJS 3D animation player (public API only). */
interface ClipState { readonly playing: boolean; readonly animation: { duration: number }; animationSpeed?: number; loop: boolean; gotoAndStop(time: number): unknown }
interface ClipPlayer { autoUpdate?: unknown; readonly animationLabels: readonly string[]; getState(label: string): ClipState }

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}
