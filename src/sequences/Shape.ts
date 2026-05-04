import { Graphics, GraphicsPath } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { evaluateExpr, isExpr } from '../expr/Parser';
import { applyKeyframes, applyInitial, resolveAt } from '../core/Timeline';
import { buildColorInterp, type ColorSpace, type ColorInput } from '../expr/colorInterp';
import type { Scope } from '../expr/Scope';
import type {
  ShapeSequenceSpec,
  RectShapeSpec, CircleShapeSpec, EllipseShapeSpec,
  LineShapeSpec, PolygonShapeSpec, PathShapeSpec,
  Props, Keyframe, PropValue,
} from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

// Style props live on the shape's `_state`, not on the Graphics. We strip
// them out of the keyframe payload before handing the rest to the standard
// pipeline; style is tweened separately so we can interpolate colours
// correctly (gsap.utils.interpolate, not a numeric tween) and trigger a
// per-frame redraw.
type StyleKey = 'fillColor' | 'fillAlpha' | 'strokeColor' | 'strokeAlpha' | 'strokeWidth';
const STYLE_KEYS = new Set<StyleKey>([
  'fillColor', 'fillAlpha', 'strokeColor', 'strokeAlpha', 'strokeWidth',
]);
const COLOR_KEYS = new Set<StyleKey>(['fillColor', 'strokeColor']);

interface StyleState {
  fillColor: string | number | undefined;
  fillAlpha: number;
  strokeColor: string | number | undefined;
  strokeAlpha: number;
  strokeWidth: number;
}

export class ShapeSequence extends Sequence {
  declare spec: ShapeSequenceSpec;
  private _state: StyleState = {
    fillColor: undefined,
    fillAlpha: 1,
    strokeColor: undefined,
    strokeAlpha: 1,
    strokeWidth: 0,
  };
  private _drawGeometry: (g: Graphics) => void = () => {};

  async build(): Promise<void> {
    const graphics = new Graphics({ label: this.spec.name });
    graphics.cullable = true;
    this.target = graphics;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }

    // Resolve geometry expressions against the current scope. Geometry is
    // baked into a closure so onRender can re-issue it each frame —
    // animating geometry props themselves is still deferred, but style
    // animation needs the path commands to fire after every clear().
    const scope = this.scope();
    this._drawGeometry = (g: Graphics): void => drawShape(g, this.spec, scope);
    this._drawGeometry(graphics);
    seedStateFromInitial(this._state, this.spec.initial ?? {}, scope);
    applyState(graphics, this._state);

    const bounds = graphics.getLocalBounds();
    this.intrinsicWidth = bounds.width;
    this.intrinsicHeight = bounds.height;
    // Default pivot to the visual centre so `x` / `y` position the centre
    // for every shape kind — uniformly. Built-in primitives (rect, circle,
    // ellipse) are already drawn around (0, 0) so this is a no-op for them;
    // user-coord shapes (polygon, line, path) become naturally centred.
    // A user-supplied initial.pivotX / pivotY overrides this in bindTimeline.
    graphics.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

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
    // Non-style props go through the standard pipeline (transform, alpha,
    // filter uniforms, …).
    const initial = stripStyle(this.spec.initial);
    const keyframes = this.spec.keyframes
      ? this.spec.keyframes.map(stripStyleKeyframe)
      : undefined;
    applyInitial(this.target, initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>);
    applyKeyframes(timeline, this.target, keyframes, this.duration!, scope as unknown as Record<string, number>, [], offset);

    // Style: feed the same keyframe stream into a parallel set of tweens
    // targeting `_state`. Colour keys (fillColor / strokeColor) interpolate
    // through gsap.utils.interpolate (or OKLab / OKLCH if `colorSpace` is
    // set on the spec) so a hex-string tween blends smoothly between hues.
    const colorSpace: ColorSpace = (this.spec as { colorSpace?: ColorSpace }).colorSpace ?? 'rgb';
    bindStyleKeyframes(timeline, this._state, this.spec.keyframes ?? [], this.duration!, scope, offset, colorSpace);

    const startTime = offset + this.at;
    const endTime = startTime + this.duration!;
    this.target.renderable = startTime <= 0;
    timeline.set(this.target, { renderable: true }, startTime);
    timeline.set(this.target, { renderable: false }, endTime);
  }
}

function stripStyle(props: Props | undefined): Props | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const k of Object.keys(props)) {
    if (STYLE_KEYS.has(k as StyleKey)) { changed = true; continue; }
    out[k] = (props as Record<string, unknown>)[k];
  }
  return changed ? (out as unknown as Props) : props;
}

function stripStyleKeyframe(kf: Keyframe): Keyframe {
  return {
    ...kf,
    set: stripStyle(kf.set),
    to: stripStyle(kf.to),
    from: stripStyle(kf.from),
  };
}

function pickStyle(props: Props | undefined): Partial<StyleState> | null {
  if (!props) return null;
  const out: Partial<StyleState> = {};
  let any = false;
  for (const k of Object.keys(props)) {
    if (STYLE_KEYS.has(k as StyleKey)) {
      (out as Record<string, unknown>)[k] = (props as Record<string, unknown>)[k];
      any = true;
    }
  }
  return any ? out : null;
}

function resolveStyleValue(key: StyleKey, value: unknown, scope: Scope): unknown {
  if (COLOR_KEYS.has(key)) return value; // hex string or number — pass through
  if (typeof value === 'number') return value;
  if (isExpr(value)) return evaluateExpr(value, scope as unknown as Record<string, number>);
  const parsed = parseFloat(value as string);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function seedStateFromInitial(state: StyleState, initial: Props, scope: Scope): void {
  const style = pickStyle(initial);
  if (!style) return;
  for (const [k, v] of Object.entries(style)) {
    (state as unknown as Record<string, unknown>)[k] = resolveStyleValue(k as StyleKey, v, scope);
  }
}

function applyState(g: Graphics, s: StyleState): void {
  if (s.fillColor !== undefined) {
    g.fill({ color: s.fillColor, alpha: s.fillAlpha });
  }
  if (s.strokeColor !== undefined && s.strokeWidth > 0) {
    g.stroke({ color: s.strokeColor, alpha: s.strokeAlpha, width: s.strokeWidth });
  }
}

function bindStyleKeyframes(
  timeline: Timeline,
  state: StyleState,
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
      const style = pickStyle(kf.set);
      if (style) {
        for (const [k, v] of Object.entries(style)) {
          const resolved = resolveStyleValue(k as StyleKey, v, scope);
          timeline.call(() => { (state as unknown as Record<string, unknown>)[k] = resolved; }, [], at);
        }
      }
    }

    const fromStyle = pickStyle(kf.from);
    const toStyle = pickStyle(kf.to);
    const allKeys = new Set<string>([
      ...(fromStyle ? Object.keys(fromStyle) : []),
      ...(toStyle ? Object.keys(toStyle) : []),
    ]);
    for (const k of allKeys) {
      const key = k as StyleKey;
      const fromRaw = fromStyle?.[key];
      const toRaw = toStyle?.[key];
      // Crucially, only resolve `from` when the user actually specified it.
      // Otherwise leave it undefined so the tween captures the live state
      // value WHEN it starts (not at bind time, which would lock every
      // chained keyframe back to the initial value — masking later changes).
      const fromValue = fromRaw !== undefined ? resolveStyleValue(key, fromRaw, scope) : undefined;
      const toValue   = toRaw   !== undefined ? resolveStyleValue(key, toRaw,   scope) : undefined;
      tweenStyleKey(timeline, state, key, fromValue, toValue, duration, ease, at, colorSpace);
    }
  }
}

function tweenStyleKey(
  timeline: Timeline,
  state: StyleState,
  key: StyleKey,
  fromValue: unknown,    // undefined = pick up live state at tween start
  toValue: unknown,
  duration: number,
  ease: string,
  at: number,
  colorSpace: ColorSpace,
): void {
  if (COLOR_KEYS.has(key) && toValue !== undefined) {
    // Build the colour interpolator at tween start so chained keyframes
    // pick up the previous tween's end colour automatically.
    let interp: ((p: number) => unknown) | null = null;
    const proxy = { p: 0 };
    timeline.fromTo(
      proxy,
      { p: 0 },
      {
        p: 1, duration, ease,
        onStart: () => {
          const startColor = (fromValue !== undefined ? fromValue : (state as unknown as Record<string, unknown>)[key]) as ColorInput | undefined;
          if (startColor === undefined) return; // nothing to tween from
          interp = colorSpace === 'rgb'
            ? (gsap.utils.interpolate(startColor, toValue as ColorInput) as (p: number) => unknown)
            : buildColorInterp(startColor, toValue as ColorInput, colorSpace);
        },
        onUpdate: () => { if (interp) (state as unknown as Record<string, unknown>)[key] = interp(proxy.p); },
      },
      at,
    );
  } else if (toValue !== undefined) {
    // Numeric keys (fillAlpha, strokeAlpha, strokeWidth).
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

function drawShape(g: Graphics, spec: ShapeSequenceSpec, scope: Scope): void {
  switch (spec.shape) {
    case 'rect':     drawRect(g, spec, scope); break;
    case 'circle':   drawCircle(g, spec, scope); break;
    case 'ellipse':  drawEllipse(g, spec, scope); break;
    case 'line':     drawLine(g, spec, scope); break;
    case 'polygon':  drawPolygon(g, spec, scope); break;
    case 'path':     drawPath(g, spec); break;
  }
}

function drawRect(g: Graphics, spec: RectShapeSpec, scope: Scope): void {
  const w = num(spec.width, scope);
  const h = num(spec.height, scope);
  const r = spec.cornerRadius !== undefined ? num(spec.cornerRadius, scope) : 0;
  // Centred on the local origin so anchor / pivot semantics line up with
  // the other primitives.
  if (r > 0) g.roundRect(-w / 2, -h / 2, w, h, r);
  else       g.rect(-w / 2, -h / 2, w, h);
}

function drawCircle(g: Graphics, spec: CircleShapeSpec, scope: Scope): void {
  g.circle(0, 0, num(spec.radius, scope));
}

function drawEllipse(g: Graphics, spec: EllipseShapeSpec, scope: Scope): void {
  g.ellipse(0, 0, num(spec.radiusX, scope), num(spec.radiusY, scope));
}

function drawLine(g: Graphics, spec: LineShapeSpec, scope: Scope): void {
  g.moveTo(num(spec.from[0], scope), num(spec.from[1], scope));
  g.lineTo(num(spec.to[0], scope),   num(spec.to[1], scope));
}

function drawPolygon(g: Graphics, spec: PolygonShapeSpec, scope: Scope): void {
  if (spec.points.length === 0) return;
  const flat: number[] = [];
  for (const [x, y] of spec.points) flat.push(num(x, scope), num(y, scope));
  g.poly(flat, !spec.open);
}

function drawPath(g: Graphics, spec: PathShapeSpec): void {
  // PIXI v8: GraphicsPath accepts an SVG `d`-string directly. We add it as a
  // sub-path so spec.initial's fill / stroke apply to it cleanly (going
  // through GraphicsContext.svg() would replace the whole context — and the
  // SVG parser bakes its own default styling, defeating our style controls).
  g.path(new GraphicsPath(spec.d));
}

function num(v: PropValue, scope: Scope): number {
  if (typeof v === 'number') return v;
  if (isExpr(v)) return evaluateExpr(v, scope as unknown as Record<string, number>);
  const parsed = parseFloat(v);
  return Number.isNaN(parsed) ? 0 : parsed;
}
