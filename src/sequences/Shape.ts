import { Graphics, GraphicsPath } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { evaluateExpr, isExpr } from '../expr/Parser';
import { applyKeyframes, applyInitial, resolveAt } from '../core/Timeline';
import { type ColorSpace, type ColorInput } from '../expr/colorInterp';
import { tweenColor } from '../expr/colorTween';
import type { Scope } from '../expr/Scope';
import type {
  ShapeSequenceSpec,
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
type GeometryKey = 'width' | 'height' | 'cornerRadius' | 'radius' | 'radiusX' | 'radiusY' | 'anchorX' | 'anchorY';
type LiveKey = StyleKey | GeometryKey;

const STYLE_KEYS = ['fillColor', 'fillAlpha', 'strokeColor', 'strokeAlpha', 'strokeWidth'] as const;
const COLOR_KEYS = new Set<LiveKey>(['fillColor', 'strokeColor']);

// Per-shape-kind set of geometry keys that are animatable. Array geometry
// (polygon points, line endpoints, path `d`) isn't animated in v1 — those
// are baked once at build. `anchorX` / `anchorY` are also animatable —
// useful for "morph from left-anchored to centred" tricks.
const GEOMETRY_KEYS_BY_SHAPE: Record<ShapeSequenceSpec['shape'], readonly GeometryKey[]> = {
  rect:    ['width', 'height', 'cornerRadius', 'anchorX', 'anchorY'],
  circle:  ['radius', 'anchorX', 'anchorY'],
  ellipse: ['radiusX', 'radiusY', 'anchorX', 'anchorY'],
  line:    [],
  polygon: [],
  path:    [],
};

// Shape kinds whose geometry is drawn relative to a configurable anchor —
// they don't need the build-time auto-pivot that user-coord shapes
// (line / polygon / path) rely on for visual centring.
const ANCHORED_SHAPES = new Set<ShapeSequenceSpec['shape']>(['rect', 'circle', 'ellipse']);

interface ShapeState {
  // style
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

    // Build the per-frame draw closure. For symmetric shapes (rect / circle /
    // ellipse) it pulls from _state so geometry tweens take effect; for
    // user-coord shapes (line / polygon / path) the geometry is immutable
    // and resolved once here.
    this._drawGeometry = makeDrawGeometry(this.spec, scope, this._state);

    this._drawGeometry(graphics);
    applyState(graphics, this._state);

    const bounds = graphics.getLocalBounds();
    this.intrinsicWidth = bounds.width;
    this.intrinsicHeight = bounds.height;
    // Auto-pivot only for user-coord shapes (line / polygon / path) — they
    // need it to compensate for whatever local origin the user picked.
    // Anchored shapes (rect / circle / ellipse) already control their own
    // origin via `anchorX` / `anchorY`; setting pivot here would double-up
    // and surprise the user.
    // A user-supplied initial.pivotX / pivotY overrides this in bindTimeline.
    if (!ANCHORED_SHAPES.has(this.spec.shape)) {
      graphics.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    }

    // Per-frame redraw: PIXI v8 `Container.onRender` fires during render, so
    // we read the (possibly tweened) `_state` and re-issue the geometry +
    // fill / stroke. Clearing first is essential because v8 records each
    // .fill()/.stroke() as a separate instruction — without clear() the
    // instruction list grows unbounded.
    graphics.onRender = () => {
      graphics.clear();
      this._drawGeometry(graphics);
      applyState(graphics, this._state);
    };

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const scope = this.scope();
    // Non-live props go through the standard pipeline (transform, alpha,
    // filter uniforms, …).
    const initial = stripLive(this.spec.initial, this._liveKeys);
    const keyframes = this.spec.keyframes
      ? this.spec.keyframes.map(kf => stripLiveKeyframe(kf, this._liveKeys))
      : undefined;
    applyInitial(this.target, initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>);
    applyKeyframes(timeline, this.target, keyframes, this.duration!, scope as unknown as Record<string, number>, [], offset);

    // Live props (style + scalar geometry) get a parallel set of tweens
    // targeting `_state`. Colour keys (fillColor / strokeColor) interpolate
    // through gsap.utils.interpolate (or OKLab / OKLCH if `colorSpace` is
    // set on the spec); geometry / alpha / width tween linearly through
    // GSAP's standard numeric interpolation.
    const colorSpace: ColorSpace = (this.spec as { colorSpace?: ColorSpace }).colorSpace ?? 'rgb';
    bindLiveKeyframes(timeline, this._state, this._liveKeys, this.spec.keyframes ?? [], this.duration!, scope, offset, colorSpace);

    const startTime = offset + this.at;
    const endTime = startTime + this.duration!;
    this.target.renderable = startTime <= 0;
    timeline.set(this.target, { renderable: true }, startTime);
    timeline.set(this.target, { renderable: false }, endTime);
  }
}

// ─── State seeding ───────────────────────────────────────────────────────

function seedGeometry(state: ShapeState, spec: ShapeSequenceSpec, scope: Scope): void {
  const keys = GEOMETRY_KEYS_BY_SHAPE[spec.shape];
  for (const k of keys) {
    const v = (spec as unknown as Record<string, PropValue | undefined>)[k];
    if (v !== undefined) (state as unknown as Record<string, unknown>)[k] = num(v, scope);
  }
}

function seedStyle(state: ShapeState, initial: Props, scope: Scope): void {
  for (const k of STYLE_KEYS) {
    const v = (initial as Record<string, unknown>)[k];
    if (v === undefined) continue;
    (state as unknown as Record<string, unknown>)[k] = COLOR_KEYS.has(k) ? v : numOrZero(v, scope);
  }
}

// ─── Strip live keys from the spec.initial / spec.keyframes that go to PixiPlugin ──

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
  if (s.fillColor !== undefined) {
    g.fill({ color: s.fillColor, alpha: s.fillAlpha });
  }
  if (s.strokeColor !== undefined && s.strokeWidth > 0) {
    g.stroke({ color: s.strokeColor, alpha: s.strokeAlpha, width: s.strokeWidth });
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
};

function makeDrawGeometry(spec: ShapeSequenceSpec, scope: Scope, state: ShapeState): (g: Graphics) => void {
  const stateDrawer = STATE_DRAWERS[spec.shape];
  if (stateDrawer) return (g: Graphics) => stateDrawer(g, state);
  switch (spec.shape) {
    case 'line':    return makeLineDraw(spec, scope);
    case 'polygon': return makePolygonDraw(spec, scope);
    case 'path':    return makePathDraw(spec);
  }
  return () => {};
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

    if (kf.set) {
      const live = pickLive(kf.set, liveKeys);
      if (live) {
        for (const [k, v] of Object.entries(live)) {
          const resolved = resolveLiveValue(k as LiveKey, v, scope);
          timeline.call(() => { (state as unknown as Record<string, unknown>)[k] = resolved; }, [], at);
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
      tweenLiveKey(timeline, state, key, fromValue, toValue, duration, ease, at, colorSpace);
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
): void {
  if (COLOR_KEYS.has(key) && toValue !== undefined) {
    tweenColor(
      timeline,
      state as unknown as Record<string, unknown>,
      key,
      fromValue as ColorInput | undefined,
      toValue as ColorInput,
      duration, ease, at, colorSpace,
    );
  } else if (toValue !== undefined) {
    // Numeric keys (alpha, width, geometry).
    if (fromValue !== undefined) {
      // Only force a starting value when `from` was explicit on the keyframe.
      timeline.fromTo(state, { [key]: fromValue }, { [key]: toValue, duration, ease }, at);
    } else {
      // Standard `.to()` picks up the live state value at tween start —
      // chains correctly through prior keyframes.
      timeline.to(state, { [key]: toValue, duration, ease }, at);
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
