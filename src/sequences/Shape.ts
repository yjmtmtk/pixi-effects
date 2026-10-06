import { Graphics, GraphicsPath } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { evaluateExpr, isExpr } from '../expr/Parser';
import { applyKeyframes, applyInitial, resolveAt, loopVars } from '../core/Timeline';
import { revertibleSet } from '../core/revertibleSet';
import { describeLayer } from '../core/lint';
import { type ColorSpace, type ColorInput } from '../expr/colorInterp';
import { tweenColor } from '../expr/colorTween';
import type { Scope } from '../expr/Scope';
import { makeGradientFill } from './gradientFill';
import { trimPolylines, rectOutline, ellipseOutline, flattenSvgPath, type Polyline } from './trimPath';
import { buildMorph, morphAt, type MorphPair } from './morphPath';
import { collectPropKeys } from '../space/specKeys';
import type {
  ShapeSequenceSpec, GradientSpec,
  LineShapeSpec, PolygonShapeSpec, PathShapeSpec,
  Props, Keyframe, PropValue,
} from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

// Style + geometry props live on the shape's `_state`, not on the Graphics.
// The shape redraws every frame from `_state`, so style AND scalar geometry
// props (width, radius, …) are both keyframable through the same pipeline.
//
// Style is uniform across shape kinds; geometry is shape-kind-specific.
// `LIVE_KEYS` is the union — any key in this set is stripped from the
// standard transform/keyframe pipeline and routed through `_state` instead.
type StyleKey = 'fillColor' | 'fillAlpha' | 'strokeColor' | 'strokeAlpha' | 'strokeWidth';
type GeometryKey = 'width' | 'height' | 'cornerRadius' | 'radius' | 'radiusX' | 'radiusY' | 'anchorX' | 'anchorY' | 'innerRadius' | 'startAngle' | 'endAngle' | 'trimStart' | 'trimEnd' | 'morph';
type LiveKey = StyleKey | GeometryKey;

const STYLE_KEYS = ['fillColor', 'fillAlpha', 'strokeColor', 'strokeAlpha', 'strokeWidth'] as const;
const COLOR_KEYS = new Set<LiveKey>(['fillColor', 'strokeColor']);

// Per-shape-kind set of geometry keys that are animatable. Array geometry
// (polygon points, line endpoints, path `d`) isn't animated in v1 — those
// are baked once at build. `anchorX` / `anchorY` are also animatable —
// useful for "morph from left-anchored to centred" tricks.
const TRIM_KEYS = ['trimStart', 'trimEnd'] as const;
const GEOMETRY_KEYS_BY_SHAPE: Record<ShapeSequenceSpec['shape'], readonly GeometryKey[]> = {
  rect:    ['width', 'height', 'cornerRadius', 'anchorX', 'anchorY', ...TRIM_KEYS],
  circle:  ['radius', 'anchorX', 'anchorY', ...TRIM_KEYS],
  ellipse: ['radiusX', 'radiusY', 'anchorX', 'anchorY', ...TRIM_KEYS],
  arc:     ['radius', 'innerRadius', 'startAngle', 'endAngle'],
  line:    [...TRIM_KEYS],
  polygon: [...TRIM_KEYS],
  path:    [...TRIM_KEYS, 'morph'],
};

// Shape kinds whose geometry is drawn relative to a configurable anchor —
// they don't need the build-time auto-pivot that user-coord shapes
// (line / polygon / path) rely on for visual centring.
const ANCHORED_SHAPES = new Set<ShapeSequenceSpec['shape']>(['rect', 'circle', 'ellipse', 'arc']);

interface ShapeState {
  // style
  fillStyle?: unknown;   // gradient fill argument for Graphics.fill, built once at build; wins over fillColor
  fillColor: string | number | undefined;
  fillAlpha: number;
  strokeColor: string | number | undefined;
  strokeAlpha: number;
  strokeWidth: number;
  // geometry (only the relevant subset for the shape kind is non-undefined)
  width?: number;
  height?: number;
  cornerRadius?: number;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  anchorX?: number;
  anchorY?: number;
  innerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  /** Stroke trim: the part of the outline drawn, as fractions 0–1 of its length. */
  trimStart?: number;
  trimEnd?: number;
  /** Path morph: how far from `d` (0) to `morphTo` (1). */
  morph?: number;
  // stroke style that is not animated
  strokeCap?: string;
  strokeJoin?: string;
}

export class ShapeSequence extends Sequence {
  declare spec: ShapeSequenceSpec;
  private _state: ShapeState = {
    fillColor: undefined,
    fillAlpha: 1,
    strokeColor: undefined,
    strokeAlpha: 1,
    strokeWidth: 0,
  };
  // Closure that draws the path commands for this shape kind from the
  // (possibly tweened) `_state`. Bound once at build; called on every frame
  // by `Container.onRender`.
  private _drawGeometry: (g: Graphics) => void = () => {};
  private _liveKeys = new Set<LiveKey>(STYLE_KEYS);

  async build(): Promise<void> {
    const graphics = new Graphics({ label: this.spec.name });
    graphics.cullable = true;
    this.target = graphics;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }

    const scope = this.scope();
    const geomKeys = GEOMETRY_KEYS_BY_SHAPE[this.spec.shape];
    for (const k of geomKeys) this._liveKeys.add(k);

    // Seed _state with geometry from the spec (resolved against the scope
    // for expression support like `width: 'W * 0.5'`) and the initial style.
    seedGeometry(this._state, this.spec, scope);
    seedStyle(this._state, this.spec.initial ?? {}, scope);
    seedStrokeStyle(this._state, this.spec, this.spec.initial ?? {}, describeLayer(this.spec));
    if (this.spec.shape === 'arc') {
      this._state.startAngle ??= 0;
      this._state.endAngle ??= 360;
      const top = this.spec as unknown as Record<string, unknown>, ini = (this.spec.initial ?? {}) as Record<string, unknown>;
      if ('trimStart' in top || 'trimEnd' in top || 'trimStart' in ini || 'trimEnd' in ini) {
        console.warn(`pixi-effects: ${describeLayer(this.spec)}: trimStart / trimEnd do not apply to an arc: animate its endAngle (and startAngle) instead`);
      }
    } else {
      this._state.trimStart ??= 0;
      this._state.trimEnd ??= 1;
    }
    const gradientSpec = this.spec.fillGradient ?? (this.spec.initial as { fillGradient?: GradientSpec } | undefined)?.fillGradient;
    if (gradientSpec) this._state.fillStyle = makeGradientFill(gradientSpec);

    // Build the per-frame draw closure. For symmetric shapes (rect / circle /
    // ellipse) it pulls from _state so geometry tweens take effect; for
    // user-coord shapes (line / polygon / path) the geometry is immutable
    // and resolved once here.
    const morph = this._setupMorph();
    this._drawGeometry = makeDrawGeometry(this.spec, scope, this._state, morph);
    this._outline = makeOutline(this.spec, scope, this._state, morph);

    // Measure the WHOLE shape (a layer that starts fully trimmed still has its size and centre).
    const { trimStart, trimEnd } = this._state;
    this._state.trimStart = 0; this._state.trimEnd = 1;
    this._drawGeometry(graphics);
    applyState(graphics, this._state);

    const bounds = graphics.getLocalBounds();
    this._state.trimStart = trimStart; this._state.trimEnd = trimEnd;
    this.intrinsicWidth = bounds.width;
    this.intrinsicHeight = bounds.height;
    // Auto-pivot only for user-coord shapes (line / polygon / path) — they
    // need it to compensate for whatever local origin the user picked.
    // Anchored shapes (rect / circle / ellipse) already control their own
    // origin via `anchorX` / `anchorY`; setting pivot here would double-up
    // and surprise the user.
    // A user-supplied initial.pivotX / pivotY overrides this in bindTimeline.
    if (!ANCHORED_SHAPES.has(this.spec.shape)) {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      graphics.pivot.set(cx, cy);
      // Pivot at the centre means x,y places the centre. When the author gives no x / y the points
      // are meant as plain coordinates, so default the position to that centre (the shape then
      // appears exactly where its points say). An explicit initial x / y still wins, per axis.
      const init = (this.spec.initial ?? {}) as Record<string, unknown>;
      if (init.x === undefined) graphics.x = cx;
      if (init.y === undefined) graphics.y = cy;
    }

    // Per-frame redraw: PIXI v8 `Container.onRender` fires during render, so
    // we read the (possibly tweened) `_state` and re-issue the geometry +
    // fill / stroke. Clearing first is essential because v8 records each
    // .fill()/.stroke() as a separate instruction — without clear() the
    // instruction list grows unbounded.
    graphics.onRender = () => {
      if (this._fresh) { this._fresh = false; return; }   // syncFrame() already drew this frame
      this._redraw();
    };

    this._redraw();
    this.buildFilters();
  }

  /** The prepared morph between `d` and `morphTo`, or null (and a warning when the spec asked for one that cannot work). */
  private _setupMorph(): { pairs: MorphPair[]; to: string } | null {
    const who = describeLayer(this.spec);
    const top = this.spec as unknown as Record<string, unknown>;
    const wanted = this.spec.shape === 'path' && (this._state.morph !== undefined || collectPropKeys(this.spec).has('morph'));
    if (this.spec.shape !== 'path') {
      if ('morphTo' in top) console.warn(`pixi-effects: ${who}: morphTo only works on a path shape (shape: 'path'); ignored`);
      return null;
    }
    if (top.morphTo === undefined) {
      if (wanted) console.warn(`pixi-effects: ${who}: morph needs morphTo (the outline to morph into); ignored`);
      return null;
    }
    let points = 128;
    if (top.morphPoints !== undefined) {
      const n = Number(top.morphPoints);
      if (Number.isInteger(n) && n >= 8 && n <= 2048) points = n;
      else console.warn(`pixi-effects: ${who}: morphPoints must be a whole number from 8 to 2048, got ${String(top.morphPoints)}; using 128`);
    }
    const pairs = buildMorph(flattenSvgPath(this.spec.d), flattenSvgPath(String(top.morphTo)), points);
    if (pairs.length === 0) {
      console.warn(`pixi-effects: ${who}: morphTo "${String(top.morphTo)}" (or d) draws nothing, so there is nothing to morph; ignored`);
      return null;
    }
    this._state.morph ??= 0;
    return { pairs, to: String(top.morphTo) };
  }

  private _fresh = false;
  private _outline: (() => Polyline[]) | null = null;

  private _redraw(): void {
    const graphics = this.target as Graphics;
    const s = this._state;
    graphics.clear();
    const trimmed = (s.trimStart ?? 0) > 0 || (s.trimEnd ?? 1) < 1;
    if (!trimmed || !this._outline || !(s.strokeColor !== undefined && s.strokeWidth > 0)) {
      this._drawGeometry(graphics);
      applyState(graphics, s);
      return;
    }
    // A trim is for the stroke (like After Effects): the fill, if any, is the whole shape; then only the part of
    // the outline between trimStart and trimEnd is stroked.
    if (s.fillStyle || s.fillColor !== undefined) {
      this._drawGeometry(graphics);
      applyFill(graphics, s);
      graphics.beginPath();
    }
    const parts = trimPolylines(this._outline(), s.trimStart ?? 0, s.trimEnd ?? 1);
    if (parts.length === 0) return;                           // nothing drawn on yet (trimEnd 0)
    for (const part of parts) {
      if (part.closed) { graphics.poly(part.pts, true); continue; }
      graphics.moveTo(part.pts[0]!, part.pts[1]!);
      for (let i = 2; i < part.pts.length; i += 2) graphics.lineTo(part.pts[i]!, part.pts[i + 1]!);
    }
    applyStroke(graphics, s);
  }

  /**
   * Draw from the tweened `_state` before the culler runs. The culler measures the geometry as last
   * drawn; a layer drawn only inside `onRender` is culled on stale bounds (a rect growing from
   * `width: 0` at the left edge was skipped after a jump seek, and one frame late in playback).
   */
  override syncFrame(): void {
    super.syncFrame();
    if (!this.target?.renderable) return;
    this._redraw();
    this._fresh = true;
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const scope = this.scope();
    const startTime = offset + this.at;   // keyframe `at` is sequence-local
    // Non-live props go through the standard pipeline (transform, alpha,
    // filter uniforms, …).
    const initial = stripLive(stripGradient(this.spec.initial), this._liveKeys);
    const keyframes = this.spec.keyframes
      ? this.spec.keyframes.map(kf => stripLiveKeyframe(kf, this._liveKeys))
      : undefined;
    applyInitial(this.target, initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>);
    applyKeyframes(timeline, this.target, keyframes, this.duration!, scope as unknown as Record<string, number>, [], startTime);

    // Live props (style + scalar geometry) get a parallel set of tweens
    // targeting `_state`. Colour keys (fillColor / strokeColor) interpolate
    // through gsap.utils.interpolate (or OKLab / OKLCH if `colorSpace` is
    // set on the spec); geometry / alpha / width tween linearly through
    // GSAP's standard numeric interpolation.
    const colorSpace: ColorSpace = (this.spec as { colorSpace?: ColorSpace }).colorSpace ?? 'rgb';
    bindLiveKeyframes(timeline, this._state, this._liveKeys, this.spec.keyframes ?? [], this.duration!, scope, startTime, colorSpace);

    this.absoluteStart = startTime;
    const endTime = startTime + this.duration!;
    this.target.renderable = startTime <= 0;
    timeline.set(this.target, { renderable: true }, startTime);
    timeline.set(this.target, { renderable: false }, endTime);
  }
}

// ─── State seeding ───────────────────────────────────────────────────────

function seedGeometry(state: ShapeState, spec: ShapeSequenceSpec, scope: Scope): void {
  const keys = GEOMETRY_KEYS_BY_SHAPE[spec.shape];
  const initial = (spec.initial ?? {}) as Record<string, PropValue | undefined>;
  for (const k of keys) {
    // Same vocabulary as every other layer: geometry may be written at the top
    // level (next to `shape`) or in `initial`; the top level wins.
    const v = (spec as unknown as Record<string, PropValue | undefined>)[k] ?? initial[k];
    if (v !== undefined) (state as unknown as Record<string, unknown>)[k] = num(v, scope);
  }
}

const STROKE_CAPS = ['butt', 'round', 'square'];
const STROKE_JOINS = ['miter', 'round', 'bevel'];

/** `strokeCap` / `strokeJoin` (top level or in `initial`): words, not animatable. */
function seedStrokeStyle(state: ShapeState, spec: object, initial: Props, who: string): void {
  const top = spec as Record<string, unknown>;
  const ini = initial as Record<string, unknown>;
  const pick = (key: string, valid: string[]): string | undefined => {
    const v = top[key] ?? ini[key];
    if (v === undefined) return undefined;
    if (valid.includes(String(v))) return String(v);
    console.warn(`pixi-effects: ${who}: ${key} "${v}" is not one of ${valid.join(', ')}; ignored`);
    return undefined;
  };
  state.strokeCap = pick('strokeCap', STROKE_CAPS);
  state.strokeJoin = pick('strokeJoin', STROKE_JOINS);
}

function seedStyle(state: ShapeState, initial: Props, scope: Scope): void {
  for (const k of STYLE_KEYS) {
    const v = (initial as Record<string, unknown>)[k];
    if (v === undefined) continue;
    (state as unknown as Record<string, unknown>)[k] = COLOR_KEYS.has(k) ? v : numOrZero(v, scope);
  }
}

// ─── Strip live keys from the spec.initial / spec.keyframes that go to PixiPlugin ──

function stripGradient(props: Props | undefined): Props | undefined {
  if (!props || !('fillGradient' in props || 'strokeCap' in props || 'strokeJoin' in props)) return props;
  const { fillGradient: _drop, strokeCap: _cap, strokeJoin: _join, ...rest } = props as Record<string, unknown>;
  return rest as unknown as Props;
}

function stripLive(props: Props | undefined, liveKeys: Set<LiveKey>): Props | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const k of Object.keys(props)) {
    if (liveKeys.has(k as LiveKey)) { changed = true; continue; }
    out[k] = (props as Record<string, unknown>)[k];
  }
  return changed ? (out as unknown as Props) : props;
}

function stripLiveKeyframe(kf: Keyframe, liveKeys: Set<LiveKey>): Keyframe {
  return {
    ...kf,
    set: stripLive(kf.set, liveKeys),
    to: stripLive(kf.to, liveKeys),
    from: stripLive(kf.from, liveKeys),
  };
}

function pickLive(props: Props | undefined, liveKeys: Set<LiveKey>): Record<string, unknown> | null {
  if (!props) return null;
  const out: Record<string, unknown> = {};
  let any = false;
  for (const k of Object.keys(props)) {
    if (liveKeys.has(k as LiveKey)) {
      out[k] = (props as Record<string, unknown>)[k];
      any = true;
    }
  }
  return any ? out : null;
}

function resolveLiveValue(key: LiveKey, value: unknown, scope: Scope): unknown {
  if (COLOR_KEYS.has(key)) return value; // colour: pass through as-is
  return numOrZero(value, scope);
}

// ─── Per-frame redraw ────────────────────────────────────────────────────

function applyState(g: Graphics, s: ShapeState): void {
  applyFill(g, s);
  applyStroke(g, s);
}
function applyFill(g: Graphics, s: ShapeState): void {
  if (s.fillStyle) {
    g.fill(s.fillStyle as never);
  } else if (s.fillColor !== undefined) {
    g.fill({ color: s.fillColor, alpha: s.fillAlpha });
  }
}
function applyStroke(g: Graphics, s: ShapeState): void {
  if (s.strokeColor !== undefined && s.strokeWidth > 0) {
    g.stroke({
      color: s.strokeColor, alpha: s.strokeAlpha, width: s.strokeWidth,
      ...(s.strokeCap ? { cap: s.strokeCap as 'butt' | 'round' | 'square' } : {}),
      ...(s.strokeJoin ? { join: s.strokeJoin as 'miter' | 'round' | 'bevel' } : {}),
    });
  }
}

// ─── drawShape closures (live for symmetric shapes, frozen for the rest) ──
//
// The closure returned here is what `Container.onRender` calls every frame.
// For rect / circle / ellipse it captures a reference to `_state`, so any
// tween of width / radius / etc. is reflected on the next render.
// For line / polygon / path the geometry is baked at build time and the
// closure is constant — they aren't animatable in v1.

function drawRectFromState(g: Graphics, s: ShapeState): void {
  const w = s.width ?? 0;
  const h = s.height ?? 0;
  const r = s.cornerRadius ?? 0;
  const ax = s.anchorX ?? 0.5;
  const ay = s.anchorY ?? 0.5;
  // The local origin sits at (anchorX * w, anchorY * h) of the rect.
  // anchorX:0 → left edge at origin (rect grows rightward when w animates).
  // anchorX:0.5 → centred (default).
  // (`0 - x` rather than `-x` to avoid JS's -0 quirk in the ax=0 case.)
  const x = 0 - ax * w;
  const y = 0 - ay * h;
  if (r > 0) g.roundRect(x, y, w, h, r);
  else       g.rect(x, y, w, h);
}
function drawCircleFromState(g: Graphics, s: ShapeState): void {
  const r = s.radius ?? 0;
  const ax = s.anchorX ?? 0.5;
  const ay = s.anchorY ?? 0.5;
  // Anchor on the bbox of the circle: (ax, ay) in [0..1] × bbox (2r × 2r).
  // ax:0 → left edge at origin (centre at +r along x).
  g.circle((0.5 - ax) * 2 * r, (0.5 - ay) * 2 * r, r);
}
function drawEllipseFromState(g: Graphics, s: ShapeState): void {
  const rx = s.radiusX ?? 0;
  const ry = s.radiusY ?? 0;
  const ax = s.anchorX ?? 0.5;
  const ay = s.anchorY ?? 0.5;
  g.ellipse((0.5 - ax) * 2 * rx, (0.5 - ay) * 2 * ry, rx, ry);
}
const DEG = Math.PI / 180;

function drawArcFromState(g: Graphics, s: ShapeState): void {
  const r = s.radius ?? 0;
  const ri = Math.max(0, Math.min(s.innerRadius ?? 0, r));
  const startDeg = s.startAngle ?? 0;
  let endDeg = s.endAngle ?? 360;
  if (!(r > 0) || endDeg === startDeg) return;                           // nothing to draw
  const filled = !!s.fillStyle || s.fillColor !== undefined;
  if (Math.abs(endDeg - startDeg) >= 360) {
    if (!filled) { g.circle(0, 0, r); return; }                          // a full stroke ring
    endDeg = startDeg + Math.sign(endDeg - startDeg) * 359.999;          // a filled full ring: a sliver short of closing (no hole trick needed)
  }
  const a0 = startDeg * DEG, a1 = endDeg * DEG;
  const ccw = a1 < a0;
  if (filled) g.moveTo(r * Math.cos(a0), r * Math.sin(a0));            // a sector starts its outline at the arc's start point
  g.arc(0, 0, r, a0, a1, ccw);                                           // an open arc starts where the arc starts: a moveTo first left a flat start cap
  if (!filled) return;                                                   // an open arc line: the stroke follows
  if (ri > 0) {
    g.lineTo(ri * Math.cos(a1), ri * Math.sin(a1));
    g.arc(0, 0, ri, a1, a0, !ccw);                                       // back along the inner edge
  } else {
    g.lineTo(0, 0);
  }
  g.closePath();
}
function makeLineDraw(spec: LineShapeSpec, scope: Scope): (g: Graphics) => void {
  const fx = num(spec.from[0], scope);
  const fy = num(spec.from[1], scope);
  const tx = num(spec.to[0], scope);
  const ty = num(spec.to[1], scope);
  return (g: Graphics) => { g.moveTo(fx, fy); g.lineTo(tx, ty); };
}
function makePolygonDraw(spec: PolygonShapeSpec, scope: Scope): (g: Graphics) => void {
  if (spec.points.length === 0) return () => {};
  const flat: number[] = [];
  for (const [x, y] of spec.points) flat.push(num(x, scope), num(y, scope));
  const closed = !spec.open;
  return (g: Graphics) => { g.poly(flat, closed); };
}
function makePathDraw(spec: PathShapeSpec): (g: Graphics) => void {
  // GraphicsPath accepts the SVG `d` directly; we apply it as a sub-path
  // so user fill / stroke aren't clobbered by the SVG parser's defaults.
  return (g: Graphics) => { g.path(new GraphicsPath(spec.d)); };
}

const STATE_DRAWERS: Partial<Record<ShapeSequenceSpec['shape'], (g: Graphics, s: ShapeState) => void>> = {
  rect:    drawRectFromState,
  circle:  drawCircleFromState,
  ellipse: drawEllipseFromState,
  arc:     drawArcFromState,
};

function makeDrawGeometry(spec: ShapeSequenceSpec, scope: Scope, state: ShapeState, morph: { pairs: MorphPair[]; to: string } | null): (g: Graphics) => void {
  const stateDrawer = STATE_DRAWERS[spec.shape];
  if (stateDrawer) return (g: Graphics) => stateDrawer(g, state);
  switch (spec.shape) {
    case 'line':    return makeLineDraw(spec, scope);
    case 'polygon': return makePolygonDraw(spec, scope);
    case 'path': {
      const plain = makePathDraw(spec);
      if (!morph) return plain;
      const last = makePathDraw({ ...spec, d: morph.to });
      return (g: Graphics) => {
        const t = state.morph ?? 0;
        if (t <= 0) plain(g);
        else if (t >= 1) last(g);                                    // the ends are the paths themselves, curves and all
        else for (const part of morphAt(morph.pairs, t)) drawPolyline(g, part);
      };
    }
  }
  return () => {};
}

function drawPolyline(g: Graphics, part: Polyline): void {
  if (part.closed) { g.poly(part.pts, true); return; }
  g.moveTo(part.pts[0]!, part.pts[1]!);
  for (let i = 2; i < part.pts.length; i += 2) g.lineTo(part.pts[i]!, part.pts[i + 1]!);
}

/** The outline a stroke trim walks along: the same geometry as the drawer, as polylines (null: no trim for this kind). */
function makeOutline(spec: ShapeSequenceSpec, scope: Scope, s: ShapeState, morph: { pairs: MorphPair[]; to: string } | null): (() => Polyline[]) | null {
  switch (spec.shape) {
    case 'rect': return () => {
      const w = s.width ?? 0, h = s.height ?? 0;
      return [rectOutline(0 - (s.anchorX ?? 0.5) * w, 0 - (s.anchorY ?? 0.5) * h, w, h, s.cornerRadius ?? 0)];
    };
    case 'circle': return () => {
      const r = s.radius ?? 0;
      return [ellipseOutline((0.5 - (s.anchorX ?? 0.5)) * 2 * r, (0.5 - (s.anchorY ?? 0.5)) * 2 * r, r, r)];
    };
    case 'ellipse': return () => {
      const rx = s.radiusX ?? 0, ry = s.radiusY ?? 0;
      return [ellipseOutline((0.5 - (s.anchorX ?? 0.5)) * 2 * rx, (0.5 - (s.anchorY ?? 0.5)) * 2 * ry, rx, ry)];
    };
    case 'line': {
      const lines: Polyline[] = [{ pts: [num(spec.from[0], scope), num(spec.from[1], scope), num(spec.to[0], scope), num(spec.to[1], scope)], closed: false }];
      return () => lines;
    }
    case 'polygon': {
      const pts: number[] = [];
      for (const [x, y] of spec.points) pts.push(num(x, scope), num(y, scope));
      const lines: Polyline[] = pts.length >= 4 ? [{ pts, closed: !spec.open }] : [];
      return () => lines;
    }
    case 'path': {
      if (morph) return () => morphAt(morph.pairs, s.morph ?? 0);
      let lines: Polyline[] | null = null;                    // flattened on first use: only a trimmed path needs it
      return () => (lines ??= flattenSvgPath(spec.d));
    }
    default: return null;
  }
}

// ─── Bind keyframes onto _state ──────────────────────────────────────────

function bindLiveKeyframes(
  timeline: Timeline,
  state: ShapeState,
  liveKeys: Set<LiveKey>,
  keyframes: Keyframe[],
  parentDuration: number,
  scope: Scope,
  offset: number,
  colorSpace: ColorSpace,
): void {
  for (const kf of keyframes) {
    const at = offset + resolveAt(kf.at, parentDuration);
    const duration = kf.duration ?? 0;
    const ease = kf.ease ?? 'none';
    const loop = loopVars(kf);

    if (kf.set) {
      const live = pickLive(kf.set, liveKeys);
      if (live) {
        for (const [k, v] of Object.entries(live)) {
          const resolved = resolveLiveValue(k as LiveKey, v, scope);
          const live = state as unknown as Record<string, unknown>;
          revertibleSet(timeline, at, () => live[k], v2 => { live[k] = v2; }, resolved);
        }
      }
    }

    const fromLive = pickLive(kf.from, liveKeys);
    const toLive   = pickLive(kf.to,   liveKeys);
    const allKeys = new Set<string>([
      ...(fromLive ? Object.keys(fromLive) : []),
      ...(toLive   ? Object.keys(toLive)   : []),
    ]);
    for (const k of allKeys) {
      const key = k as LiveKey;
      const fromRaw = fromLive?.[key];
      const toRaw   = toLive?.[key];
      // Only resolve `from` when the user actually specified it.
      // Otherwise leave it undefined so the tween captures the live state
      // value WHEN it starts (not at bind time, which would lock every
      // chained keyframe back to the initial value — masking later changes).
      const fromValue = fromRaw !== undefined ? resolveLiveValue(key, fromRaw, scope) : undefined;
      const toValue   = toRaw   !== undefined ? resolveLiveValue(key, toRaw,   scope) : undefined;
      tweenLiveKey(timeline, state, key, fromValue, toValue, duration, ease, at, colorSpace, loop);
    }
  }
}

function tweenLiveKey(
  timeline: Timeline,
  state: ShapeState,
  key: LiveKey,
  fromValue: unknown,    // undefined = pick up live state at tween start
  toValue: unknown,
  duration: number,
  ease: string,
  at: number,
  colorSpace: ColorSpace,
  loop: Record<string, number | boolean>,
): void {
  if (COLOR_KEYS.has(key) && toValue !== undefined) {
    tweenColor(
      timeline,
      state as unknown as Record<string, unknown>,
      key,
      fromValue as ColorInput | undefined,
      toValue as ColorInput,
      duration, ease, at, colorSpace, undefined, loop,
    );
  } else if (toValue !== undefined) {
    // Numeric keys (alpha, width, geometry).
    if (fromValue !== undefined) {
      // Only force a starting value when `from` was explicit on the keyframe.
      timeline.fromTo(state, { [key]: fromValue }, { [key]: toValue, duration, ease, ...loop }, at);
    } else {
      // Standard `.to()` picks up the live state value at tween start —
      // chains correctly through prior keyframes.
      timeline.to(state, { [key]: toValue, duration, ease, ...loop }, at);
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────

function num(v: PropValue, scope: Scope): number {
  if (typeof v === 'number') return v;
  if (isExpr(v)) return evaluateExpr(v, scope as unknown as Record<string, number>);
  const parsed = parseFloat(v);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function numOrZero(v: unknown, scope: Scope): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return num(v, scope);
  return 0;
}
