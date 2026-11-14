import { Assets, Container, Matrix, Point, RenderTexture, type Renderer, type Texture } from 'pixi.js';
import { Sequence } from './Base';
import type { CanvasCheck } from './Canvas';
import { evaluateExpr } from '../expr/Parser';
import { buildScope } from '../expr/Scope';
import type { PathRouters } from '../core/Timeline';
import { NOT_PURE } from '../core/purity';
import { SetupValues } from '../core/setupValues';
import type { Scene2DContext, Scene2DSequenceSpec } from '../types';

/**
 * The layer's display object: a container whose `anchor` (the point of its box the layer's x / y name, 0..1 like a sprite's) is its pivot in the box's pixels, so
 * `anchorX` / `anchorY` place a scene2d layer as they place a canvas layer. The author's scene is a child of it (`ctx.root`), never this container itself.
 */
class Scene2DBox extends Container {
  boxWidth = 1;
  boxHeight = 1;
  private _ax = 0;
  private _ay = 0;
  readonly anchor = (() => {
    const box = this;
    return {
      get x(): number { return box._ax; },
      set x(v: number) { box._ax = v; box.pivot.x = v * box.boxWidth; },
      get y(): number { return box._ay; },
      set y(v: number) { box._ay = v; box.pivot.y = v * box.boxHeight; },
      set(x: number, y = x): void { this.x = x; this.y = y; },
    };
  })();
}

/** What the layer uses of a PixiJS AnimatedSprite (public API only). */
interface Flipbook { playing: boolean; loop: boolean; animationSpeed: number; totalFrames: number; autoUpdate: boolean; gotoAndStop(frame: number): void; play(): void; _durations?: number[] | null }
const isFlipbook = (n: unknown): n is Flipbook => {
  const f = n as Partial<Flipbook>;
  return typeof f.gotoAndStop === 'function' && typeof f.totalFrames === 'number' && typeof f.animationSpeed === 'number' && 'autoUpdate' in (n as object);
};

/** The labels PixiJS gives a node made without one (its kind): no name, so a hit on it is named by its nearest labelled ancestor. */
const DEFAULT_LABELS = new Set(['Container', 'Graphics', 'Sprite', 'AnimatedSprite', 'TilingSprite', 'NineSliceSprite', 'Text', 'BitmapText', 'HTMLText', 'Mesh', 'MeshSimple',
  'MeshPlane', 'MeshRope', 'PerspectiveMesh', 'ParticleContainer', 'RenderContainer', 'DOMContainer']);

/** A number for each function: two layers are the same layer only when their `setup` is the same function. */
const ids = new WeakMap<object, number>();
let lastId = 0;
function idOf(fn: unknown): number {
  if (typeof fn !== 'function') return 0;
  let id = ids.get(fn);
  if (id === undefined) { id = ++lastId; ids.set(fn, id); }
  return id;
}

/**
 * `type: 'scene2d'`: PixiJS 2D display objects built by the author's code and set from the time. `setup` fills `ctx.root` once; `awaitFrameAt` (the one frame path
 * playback, a seek and an export share) runs `update(t)`, poses the flipbooks left playing, and PixiJS draws the root with the rest of the stage.
 */
export class Scene2DSequence extends Sequence {
  private _box: Scene2DBox | null = null;
  private _ctx: Scene2DContext | null = null;
  private _objects: Record<string, object> = {};
  private _flipbooks: Flipbook[] = [];
  private _warned = new Set<string>();
  /** What a rebuild matches this layer by; null: never kept (`reuse: false`, no `name`). */
  private _key: string | null = null;
  /** The layer of the tree being replaced whose scene this one takes over at the swap (`commitReuse`): until then it is not this layer's. */
  private _borrowed: Scene2DSequence | null = null;
  /** True once another layer took this layer's scene: destroying this one must not let it go. */
  private _donated = false;
  /** What setup left on the objects the keyframes reach, shared with a layer that takes the scene over (core/setupValues.ts). */
  private _setupValues = new SetupValues();

  private get _spec(): Scene2DSequenceSpec { return this.spec as unknown as Scene2DSequenceSpec; }

  private _who(): string {
    const name = this._spec.name;
    return `pixi-effects: scene2d layer${name ? ` "${name}"` : ''}`;
  }

  private _say(key: string, message: string): void {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`${this._who()}: ${message}`);
  }

  protected override pathRouters(): PathRouters {
    return { scene2d: (path) => this._resolvePath(path) };
  }

  async build(): Promise<void> {
    const spec = this._spec;
    if (this.duration === undefined) this.duration = this.parent?.duration ?? this.root.duration;
    if (typeof spec.setup !== 'function') {
      throw new Error(`${this._who()}: a scene2d layer needs setup: ({ root }) => { … } (a function that adds PixiJS display objects to root)`);
    }
    if (typeof spec.update === 'function' && NOT_PURE.test(spec.update.toString())) {
      this._say('pure', 'update calls Math.random, Date.now, performance.now or new Date, so it is not deterministic: the same frame would draw differently in playback, in a seek and in an export. Derive the value from t (random(seed) from pixi-effects is repeatable)');
    }
    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    const width = dim(spec.width, scope) ?? this.parent?.width ?? this.root.width;
    const height = dim(spec.height, scope) ?? this.parent?.height ?? this.root.height;

    const box = new Scene2DBox({ label: spec.name ?? 'scene2d' });
    box.boxWidth = width; box.boxHeight = height;
    this._box = box;
    this.target = box;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;

    this._key = spec.reuse === false || !spec.name ? null : JSON.stringify(['scene2d', spec.name, idOf(spec.setup), width, height]);
    const donor = this._key !== null ? (this.root.reuse?.claim(this._key, this) as Scene2DSequence | null | undefined) : null;
    if (donor && donor._lendable()) {
      // the scene stays in the old layer (which goes on drawing) until the swap; the objects are the same ones, so keyframes bind to them now
      this._borrowed = donor;
      this._objects = donor._objects;
      this._flipbooks = donor._flipbooks;
      this._setupValues = donor._setupValues;
      this._ctx = { ...donor._ctx!, width, height };
      this.buildFilters();
      return;
    }

    const root = new Container({ label: 'root' });
    box.addChild(root);
    const renderer = this.root.pixiRenderer as Renderer;
    const objects: Record<string, object> = {};
    const ctx: Scene2DContext = { root, renderer, width, height, objects, texture: (name) => textureOf(name) };
    let result: Awaited<ReturnType<Scene2DSequenceSpec['setup']>>;
    try {
      result = await spec.setup(ctx);
    } catch (err) {
      box.destroy({ children: true });
      this._box = null; this.target = null;
      throw new Error(`${this._who()}: setup failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    Object.assign(objects, result?.objects ?? {});
    if (!('root' in objects)) objects.root = root;
    this._objects = objects;
    this._ctx = ctx;
    this._stopSelfUpdating(root);
    this.buildFilters();
  }

  /** Reuse (core/reuse.ts): the key this layer is matched by, while it can still lend its scene. */
  reuseKey(): string | null { return this._lendable() ? this._key : null; }
  private _lendable(): boolean { return !!this._box && !!this._ctx && !this._donated && !this._borrowed; }

  /** The new tree is on stage: the old layer's scene moves into this layer's box, for good. */
  commitReuse(): void {
    const d = this._borrowed, box = this._box;
    if (!d || !box || !this._ctx) return;
    this._setupValues.restore();                                          // the new timeline starts from setup's picture (the frame drawn next writes the rest)
    box.addChild(this._ctx.root);
    d._donated = true;
    this._borrowed = null;
  }

  /**
   * Anything that would move on PixiJS's shared ticker instead of the video's time is turned off: an AnimatedSprite is posed by the layer from its time (so a sprite left
   * playing still plays, frame for frame the same in a seek and an export); anything else with `autoUpdate` is said once (drive it from update). A sprite showing a
   * `<video>` plays by the browser's clock: said once.
   */
  private _stopSelfUpdating(root: Container): void {
    const stopped: string[] = [];
    const visit = (node: Container): void => {
      const n = node as unknown as { label?: string; constructor?: { name?: string }; autoUpdate?: unknown; texture?: { source?: { resource?: unknown } } };
      if (isFlipbook(node)) {
        if (!this._flipbooks.includes(node)) this._flipbooks.push(node);
        if (node.autoUpdate) node.autoUpdate = false;
      } else if (n.autoUpdate === true) {
        n.autoUpdate = false;
        stopped.push(n.label || n.constructor?.name || 'a node');
      }
      const resource = n.texture?.source?.resource;
      if (typeof HTMLVideoElement !== 'undefined' && resource instanceof HTMLVideoElement) {
        this._say('video', `a sprite shows a <video> texture, which plays by the browser's clock, not the video's time: use a video layer (type: 'video') for footage`);
      }
      for (const c of node.children ?? []) visit(c as Container);
    };
    visit(root);
    if (stopped.length) {
      this._say('autoUpdate', `turned off autoUpdate on ${stopped.join(', ')}: a video draws from the time, so drive them from update(t)`);
    }
  }

  /** An AnimatedSprite still playing after `update` is posed from the layer's time: frame floor(t × 60 × animationSpeed) (PixiJS counts ticks of 1/60 s), its loop and frame times kept. */
  private _poseFlipbooks(t: number): void {
    for (const f of this._flipbooks) {
      if (!f.playing || f.totalFrames <= 0) continue;
      const n = f.totalFrames;
      let frame: number;
      const durations = f._durations;
      if (durations && durations.length === n) {
        const total = durations.reduce((a, b) => a + b, 0);
        let ms = t * 1000 * Math.abs(f.animationSpeed);
        ms = f.loop && total > 0 ? ms % total : Math.min(ms, total);
        frame = 0;
        for (let acc = durations[0]!; frame < n - 1 && acc <= ms; acc += durations[++frame]!) { /* walk the frames */ }
      } else {
        const ticks = Math.floor(t * 60 * Math.abs(f.animationSpeed) + 1e-9);
        frame = f.loop ? ticks % n : Math.min(ticks, n - 1);
      }
      if (f.animationSpeed < 0) frame = n - 1 - frame;
      f.gotoAndStop(frame);
      f.play();                                                            // still playing: posed again next frame (no ticker advances it)
    }
  }

  /** Per-frame hook, duck-typed by the movie (as the video, canvas and 3D layers are). */
  async awaitFrameAt(local: number): Promise<void> {
    if (!this._ctx || this._borrowed) return;                            // a layer waiting for the swap: the scene is still the old layer's
    this._frame(Math.max(0, Math.min(local, this.duration ?? local)));
  }

  private _frame(t: number): void {
    const update = this._spec.update;
    if (update) {
      try { update(t, this._ctx!); }
      catch (err) { this._say('update', `update threw (reported once): ${err instanceof Error ? err.message : String(err)}`); }
    }
    this._poseFlipbooks(t);
  }

  /**
   * `follow` / `movie.project`: where an object of the scene is on the canvas (a name setup returned in `objects`, or the label of any node under the root): its origin,
   * through every transform above it; null while it or a container above it is hidden, undefined for no such object.
   */
  screenPoint(object: string): { x: number; y: number } | null | undefined {
    const node = this._nodeNamed(object);
    if (!node) return undefined;
    for (let c: Container | null = node; c && c !== this._ctx?.root; c = c.parent) if (!c.visible || !c.renderable) return null;
    const p = node.getGlobalPosition();
    return { x: p.x, y: p.y };
  }

  /** The names `screenPoint` knows: the objects setup returned, then the labelled nodes under the root. */
  objectNames(): string[] {
    const names = new Set(Object.keys(this._objects).filter((k) => this._nodeNamed(k)));
    const visit = (n: Container): void => { if (n.label && !DEFAULT_LABELS.has(n.label)) names.add(n.label); for (const c of n.children) visit(c); };
    if (this._ctx) for (const c of this._ctx.root.children) visit(c);
    return [...names];
  }

  private _nodeNamed(name: string): Container | null {
    const own = this._objects[name];
    if (own instanceof Container) return own;
    return (this._ctx?.root.getChildByLabel(name, true) as Container | null | undefined) ?? null;
  }

  /**
   * `movie.pick`: the top object of the scene under a canvas point, by PixiJS's own `containsPoint` (a Graphics by its shape, a Sprite or Text by its box) or its `hitArea`.
   * `eventMode: 'none'` and `interactiveChildren: false` are honoured; hidden, unrenderable and clear nodes are not hit. null: nothing of the scene is there (the point falls through).
   */
  pick2d(global: { x: number; y: number }): { object: string; node: Container; point: [number, number] } | null {
    const root = this._ctx?.root;
    if (!root || this._borrowed) return null;
    const hitIn = (node: Container): Container | null => {
      // what PixiJS's own event boundary leaves out: a hidden or clear node, one used as a mask (not measurable, not drawn), eventMode 'none'
      if (!node.visible || !node.renderable || node.alpha <= 0 || node.measurable === false) return null;
      const mode = (node as { eventMode?: string }).eventMode;
      if (mode === 'none') return null;
      const local = node.toLocal(global);
      const area = node === root ? null : (node as { hitArea?: { contains(x: number, y: number): boolean } | null }).hitArea;
      if (area && !area.contains(local.x, local.y)) return null;           // a hitArea that does not hold the point: nothing in it is hit either
      if (node.interactiveChildren !== false) {
        for (let i = node.children.length - 1; i >= 0; i--) { const h = hitIn(node.children[i] as Container); if (h) return h; }
      }
      if (node === root) return null;
      if (area) return node;
      const contains = (node as { containsPoint?: (p: Point) => boolean }).containsPoint;
      return typeof contains === 'function' && contains.call(node, new Point(local.x, local.y)) ? node : null;
    };
    const node = hitIn(root);
    if (!node) return null;
    let name = '';
    for (let n: Container | null = node; n && n !== root; n = n.parent) {
      if (n.label && !DEFAULT_LABELS.has(n.label) && n.label !== n.constructor?.name) { name = n.label; break; }
    }
    const p = root.toLocal(global);
    return { object: name, node, point: [p.x, p.y] };
  }

  /** `hit.scene2d.grab()`: for a canvas point, where it is in the grabbed node's parent's pixels and how far that is from where it was grabbed (`node.x += delta[0]`). */
  dragFrom(node: Container, global: { x: number; y: number }): (x: number, y: number) => { point: [number, number]; delta: [number, number] } {
    const space = node.parent ?? node;
    const from = space.toLocal(global);
    return (x, y) => {
      const p = space.toLocal({ x, y });
      return { point: [p.x, p.y], delta: [p.x - from.x, p.y - from.y] };
    };
  }

  /**
   * The determinism check (`check`, `movie.review()`): the scene set by `update` and drawn at a few moments in two orders, with one draw thrown away first, as the canvas and 3D
   * layers are. It draws the root alone into a texture of the box's size with PixiJS's renderer; the next real frame sets the scene again.
   */
  checkDeterminism(times: number[]): CanvasCheck {
    const none: CanvasCheck = { differs: [], drawMs: 0, threw: [] };
    const ctx = this._ctx;
    const renderer = this.root.pixiRenderer as Renderer | undefined;
    if (!ctx || !renderer || this._borrowed) return none;
    const root = ctx.root;
    const w = Math.max(1, Math.ceil(ctx.width)), h = Math.max(1, Math.ceil(ctx.height));
    const rt = RenderTexture.create({ width: w, height: h });
    const wasGroup = root.isRenderGroup;                                  // rendering a container on its own makes it a render group (a mask on it would stop working): put it back
    const keep = w * h * 4 * times.length <= 96e6;
    const hash = (d: Uint8Array | Uint8ClampedArray): number => { let x = 0x811c9dc5; for (let i = 0; i < d.length; i++) { x ^= d[i]!; x = Math.imul(x, 0x01000193); } return x >>> 0; };
    const ms: number[] = [];
    const threw = new Set<number>();
    const update = this._spec.update;
    const once = (t: number, timed: boolean): Uint8Array | Uint8ClampedArray => {
      const from = performance.now();
      let pixels: Uint8Array | Uint8ClampedArray = new Uint8Array(0);
      try {
        update?.(t, ctx);
        this._poseFlipbooks(t);
        renderer.render({ container: root, target: rt, clear: true, transform: new Matrix() });
        pixels = renderer.extract.pixels(rt).pixels;
      } catch { threw.add(t); }
      if (timed) ms.push(performance.now() - from);
      return pixels;
    };
    try {
      for (const t of times) once(t, false);
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
      if (!wasGroup && root.isRenderGroup) root.disableRenderGroup();
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
    return this._borrowed ? this._setupValues.view(obj as object, prop, () => this._borrowed !== null) : (this._setupValues.note(obj as object, prop), { target: obj as object, prop });
  }

  private _warnPath(path: string, why: string): void {
    this._say(`path:${path}`, `keyframe path scene2d.${path}: ${why}; skipped`);
  }

  override destroy(): void {
    const kept = this._donated || this._borrowed !== null;               // another layer has this scene, or this layer never took the one it borrowed
    if (!kept && this._ctx && this._spec.dispose) {
      try { this._spec.dispose(this._ctx); } catch (err) { console.warn(`${this._who()}: dispose() threw —`, err); }
    }
    // the box holds the scene only while this layer owns it (a donated scene moved to the new layer's box; a borrowed one never came here)
    const box = this._box;
    this._box = null;
    if (this.target === box) this.target = null;
    try { box?.destroy({ children: true }); } catch (err) { console.warn(`${this._who()}: destroying the scene threw —`, err); }
    this._ctx = null;
    this._objects = {};
    this._flipbooks = [];
    this._borrowed = null;
    super.destroy();
  }
}

/** A movie asset's texture by name; an unknown name says which names there are. */
function textureOf(name: string): Texture {
  if (Assets.cache.has(name)) {
    const t = Assets.get<Texture>(name);
    if (t && typeof (t as { source?: unknown }).source === 'object') return t;
    throw new Error(`asset "${name}" is not a picture (ctx.texture gives the texture of an image asset)`);
  }
  const known = [...((Assets.cache as unknown as { _cache?: Map<string, unknown> })._cache?.keys() ?? [])].filter(k => !/[/:.]/.test(k) && !k.startsWith('pixi-effects-'));
  throw new Error(`no asset named "${name}"${known.length ? ` (assets: ${known.join(', ')})` : ''}: list it in movie.init({ assets: [{ name, src }] })`);
}

function dim(v: number | string | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? v : evaluateExpr(v, scope);
}
