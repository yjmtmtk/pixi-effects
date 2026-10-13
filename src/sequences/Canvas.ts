import { Sprite, Texture } from 'pixi.js';
import { Sequence } from './Base';
import { evaluateExpr } from '../expr/Parser';
import { buildScope } from '../expr/Scope';
import { describeLayer } from '../core/lint';
import { suggestName } from '../core/options';
import type { PathRouters } from '../core/Timeline';
import type { CanvasInfo, CanvasSequenceSpec, PropValue } from '../types';

const MAX_SIZE = 8192;
const MIN_RESOLUTION = 0.25;
const MAX_RESOLUTION = 4;
/** What makes a picture depend on more than the time. */
const NOT_PURE = /\bMath\s*\.\s*random\s*\(|\bDate\s*\.\s*now\s*\(|\bperformance\s*\.\s*now\s*\(|\bnew\s+Date\s*\(/;

/** A small seeded generator (mulberry32): the same seed gives the same sequence. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `type: 'canvas'`: a picture drawn by a function of the time into a canvas of the layer's own. Like the shader layer it is a sprite whose texture is a canvas redrawn
 * for every frame (`awaitFrameAt`, the one frame path playback and export share). The canvas is cleared before every call and nothing a call sets survives into the next
 * (`save` / `restore`), so the same time and the same `params` give the same pixels. It cannot see or paint on what is below it in the stack.
 */
export class CanvasSequence extends Sequence {
  private canvas: HTMLCanvasElement | null = null;
  private w = 1;
  private h = 1;
  private res = 1;
  private fps = 30;
  private layerW = 1;
  private layerH = 1;
  private seed = 0;
  private smoothing = true;
  private drawFn: CanvasSequenceSpec['draw'] | null = null;
  private state: unknown;
  /** The current value of every param: what keyframes move (`params.amount`). */
  private carrier: Record<string, number> = {};
  private failed = false;
  private warnedDraw = false;
  private warnedPaths = new Set<string>();
  private lastKey = '';
  private lastLocal = 0;

  private get canvasSpec(): CanvasSequenceSpec { return this.spec as unknown as CanvasSequenceSpec; }

  protected override pathRouters(): PathRouters {
    return { params: (path) => this.resolveParam(path) };
  }

  async build(): Promise<void> {
    const spec = this.canvasSpec;
    const who = describeLayer(spec);
    if (this.duration === undefined) this.duration = this.parent?.duration ?? this.root.duration;
    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    this.layerW = this.size('width', spec.width, scope, this.parent?.width ?? this.root.width, who);
    this.layerH = this.size('height', spec.height, scope, this.parent?.height ?? this.root.height, who);
    const r = spec.resolution;
    if (r === undefined) this.res = 1;
    else if (typeof r === 'number' && Number.isFinite(r) && r >= MIN_RESOLUTION && r <= MAX_RESOLUTION) this.res = r;
    else {
      this.res = typeof r === 'number' && Number.isFinite(r) ? Math.min(MAX_RESOLUTION, Math.max(MIN_RESOLUTION, r)) : 1;
      console.warn(`pixi-effects: ${who}: resolution must be a number from ${MIN_RESOLUTION} to ${MAX_RESOLUTION} (canvas pixels per layer pixel), got ${JSON.stringify(r)}: ${this.res} is used`);
    }
    const longest = Math.max(this.layerW, this.layerH);
    if (longest * this.res > MAX_SIZE) {                           // a canvas wider than the GPU's texture limit would be blank or fail without a word
      const fitted = MAX_SIZE / longest;
      console.warn(`pixi-effects: ${who}: ${this.layerW}×${this.layerH} at resolution ${this.res} would be a canvas of ${Math.round(longest * this.res)} pixels, more than ${MAX_SIZE}: resolution ${Math.round(fitted * 1000) / 1000} is used (lower the size or the resolution)`);
      this.res = fitted;
    }
    this.w = Math.max(1, Math.round(this.layerW * this.res));
    this.h = Math.max(1, Math.round(this.layerH * this.res));
    this.fps = this.root.frameRate ?? 30;
    this.seed = typeof spec.seed === 'number' && Number.isFinite(spec.seed) ? Math.floor(spec.seed) : 0;
    this.smoothing = spec.smoothing !== false;

    const params = spec.params;
    if (params !== undefined) {
      if (params === null || typeof params !== 'object' || Array.isArray(params)) {
        console.warn(`pixi-effects: ${who}: params must be an object of numbers, got ${JSON.stringify(params)}: ignored`);
      } else {
        const bad: string[] = [];
        for (const [k, v] of Object.entries(params)) {
          if (typeof v === 'number' && Number.isFinite(v)) this.carrier[k] = v; else bad.push(`"${k}"`);
        }
        if (bad.length) console.warn(`pixi-effects: ${who}: params ${bad.join(', ')} ${bad.length > 1 ? 'are' : 'is'} not a number, so ${bad.length > 1 ? 'they are' : 'it is'} ignored (params holds numbers that keyframes can animate as 'params.<name>')`);
      }
    }

    if (typeof spec.draw === 'function') {
      this.drawFn = spec.draw;
      if (NOT_PURE.test(spec.draw.toString())) {
        console.warn(`pixi-effects: ${who}: draw calls Math.random, Date.now, performance.now or new Date, so it is not deterministic: the same frame would draw differently in playback, in a seek and in an export. Use info.random() (seeded), or derive the value from t`);
      }
    } else {
      this.failed = true;
      console.warn(`pixi-effects: ${who}: a canvas layer needs draw: (ctx, t, info) => { … } (a function that draws the picture at time t); the layer is drawn as a checkerboard`);
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w; this.canvas.height = this.h;
    const sprite = new Sprite({ texture: Texture.from(this.canvas), label: spec.name });
    if (!this.smoothing) (sprite.texture.source as unknown as { scaleMode: string }).scaleMode = 'nearest';       // the picture is this layer's own: hard pixels when it is scaled up too
    sprite.width = this.layerW; sprite.height = this.layerH;
    this.target = sprite;
    this.intrinsicWidth = this.layerW; this.intrinsicHeight = this.layerH;
    this.buildFilters();

    if (typeof spec.setup === 'function' && !this.failed) {
      try { this.state = await spec.setup(this.info(0)); }
      catch (e) { this.failed = true; this.say(`setup failed: ${e instanceof Error ? e.message : String(e)}; the layer is drawn as a checkerboard`); }
    }
    this.drawAt(0);
  }

  async awaitFrameAt(local: number): Promise<void> {
    this.drawAt(Math.max(0, Math.min(local, this.duration ?? local)));
  }

  private size(name: 'width' | 'height', v: PropValue | undefined, scope: Record<string, number>, fallback: number, who: string): number {
    if (v === undefined) return fallback;
    const n = typeof v === 'number' ? v : evaluateExpr(v, scope);
    if (!Number.isFinite(n) || n < 1) { console.warn(`pixi-effects: ${who}: ${name} must be a number of pixels of at least 1 (or an expression), got ${JSON.stringify(v)}: ${fallback} is used`); return fallback; }
    if (n > MAX_SIZE) { console.warn(`pixi-effects: ${who}: ${name} ${n} is more than ${MAX_SIZE}: ${MAX_SIZE} is used`); return MAX_SIZE; }
    return n;
  }

  private say(why: string): void {
    if (this.warnedDraw) return;
    this.warnedDraw = true;
    console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${why}`);
  }

  private info(local: number): CanvasInfo {
    const duration = this.duration ?? 0;
    return {
      frame: Math.round(local * this.fps), duration, progress: duration > 0 ? local / duration : 0,
      width: this.layerW, height: this.layerH, resolution: this.res, frameRate: this.fps,
      params: { ...this.carrier }, state: this.state, random: seeded(this.seed),
    };
  }

  /** Resolve `params.amount` for the keyframe pipeline; a name nobody declared is said once and dropped. */
  private resolveParam(path: string): { target: object; prop: string } | null {
    if (path in this.carrier && !path.includes('.')) return { target: this.carrier, prop: path };
    if (!this.warnedPaths.has(path)) {
      this.warnedPaths.add(path);
      const guess = suggestName(path.split('.')[0]!, Object.keys(this.carrier));
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: keyframe path params.${path} names no param "${path}"${guess ? `; did you mean "${guess}"?` : ''} (declare it in params with a starting value); skipped`);
    }
    return null;
  }

  private drawAt(local: number): void {
    const c = this.canvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) { this.say('this browser gave no 2D context for the layer\'s canvas, so nothing can be drawn'); return; }
    const key = `${local}|${JSON.stringify(this.carrier)}`;
    if (key === this.lastKey) return;                              // the same frame again: nothing changes
    this.lastKey = key;
    this.lastLocal = local;
    if (!this.paint(ctx, c, local)) this.lastKey = '';             // a draw that threw: try this frame again next time
    (this.target as Sprite | null)?.texture.source.update();
  }

  /** Draws one frame of the layer into `ctx` (the layer's own canvas, or the scratch one of the determinism check). false: `draw` threw. */
  private paint(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, local: number): boolean {
    // A draw that does not balance its own save() must not leak into the next frame: where the context has `reset()` it is reset (state, transform, clip, the saved stack)
    const hasReset = 'reset' in ctx && typeof (ctx as { reset?: unknown }).reset === 'function';
    const fresh = (): void => { if (hasReset) (ctx as { reset(): void }).reset(); else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); } };
    fresh();
    if (this.failed || !this.drawFn) { this.checkerboard(ctx, c); return true; }
    if (!hasReset) ctx.save();
    let ok = true;
    try {
      ctx.scale(this.res, this.res);
      ctx.imageSmoothingEnabled = this.smoothing;
      this.drawFn(ctx, local, this.info(local));
    } catch (e) {
      if (!hasReset) { ctx.restore(); ctx.save(); }
      fresh();
      this.say(`draw threw at ${local.toFixed(2)} s: ${e instanceof Error ? e.message : String(e)}; that frame is drawn as a checkerboard (the other frames are tried again)`);
      this.checkerboard(ctx, c);
      ok = false;
    }
    if (!hasReset) ctx.restore();
    return ok;
  }

  /**
   * Draws each of `times` twice and returns the times where the two pictures differ (a draw that uses Math.random, the clock or state that outlives the call). The picture
   * the layer showed before is drawn again at the end. A layer that failed has nothing to check.
   */
  checkDeterminism(times: number[]): number[] {
    if (!this.canvas || this.failed || !this.drawFn) return [];
    // A scratch canvas of the same size that is read from the start (`willReadFrequently`: drawn by the CPU): reading the pixels of the layer's own canvas a few times would make
    // Chrome move it from the GPU to the CPU in the middle of the check, and the two rasterisers anti-alias a few pixels differently, which is not the author's fault.
    const scratch = document.createElement('canvas');
    scratch.width = this.w; scratch.height = this.h;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    // Each moment is drawn in the order given and again in the opposite order, and the two pictures of a moment are compared (by a hash of the pixels, so a 4K canvas costs no
    // copy). Two draws in a row at one time would miss state that builds up from call to call (an integrator that moves by the time since the last call).
    const hash = (): number => {
      const d = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
      let h = 0x811c9dc5;
      for (let i = 0; i < d.length; i++) { h ^= d[i]!; h = Math.imul(h, 0x01000193); }
      return h >>> 0;
    };
    const once = (t: number): number => { this.paint(ctx, scratch, t); return hash(); };
    const first = times.map(once);
    const second = [...times].reverse().map(once).reverse();
    scratch.width = scratch.height = 1;                            // let the memory go
    return times.filter((_, i) => first[i] !== second[i]);
  }

  private checkerboard(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement): void {
    const s = 32;                                                   // a loud checkerboard, not a silent blank
    for (let y = 0; y < c.height; y += s) for (let x = 0; x < c.width; x += s) { ctx.fillStyle = (((x / s) + (y / s)) & 1) ? '#ff00ff' : '#220022'; ctx.fillRect(x, y, s, s); }
  }

  override destroy(): void {
    const texture = (this.target as Sprite | null)?.texture;
    if (this.canvas) { this.canvas.width = this.canvas.height = 1; this.canvas = null; }
    super.destroy();
    texture?.destroy(true);                                        // the canvas source is this layer's own
  }
}
