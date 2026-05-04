import { Graphics, GraphicsPath } from 'pixi.js';
import { Sequence } from './Base';
import { evaluateExpr, isExpr } from '../expr/Parser';
import { applyKeyframes, applyInitial } from '../core/Timeline';
import type { Scope } from '../expr/Scope';
import type {
  ShapeSequenceSpec,
  RectShapeSpec, CircleShapeSpec, EllipseShapeSpec,
  LineShapeSpec, PolygonShapeSpec, PathShapeSpec,
  Props, Keyframe, PropValue,
} from '../types';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

// Style props live on the shape, not the Graphics. We strip them out of
// `initial` / `keyframes` before handing things to the standard pipeline so
// they don't accidentally tween a non-existent Graphics property.
const STYLE_KEYS = new Set([
  'fillColor', 'fillAlpha',
  'strokeColor', 'strokeAlpha', 'strokeWidth',
]);

export class ShapeSequence extends Sequence {
  declare spec: ShapeSequenceSpec;

  async build(): Promise<void> {
    const graphics = new Graphics({ label: this.spec.name });
    graphics.cullable = true;
    this.target = graphics;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }

    // Resolve geometry expressions against the current scope. Geometry is
    // baked into the Graphics here — animating geometry would require a
    // per-frame redraw hook, which we deliberately defer.
    const scope = this.scope();
    drawShape(graphics, this.spec, scope);
    applyStaticStyle(graphics, this.spec.initial ?? {}, scope);

    const bounds = graphics.getLocalBounds();
    this.intrinsicWidth = bounds.width;
    this.intrinsicHeight = bounds.height;

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const scope = this.scope();
    const initial = stripStyle(this.spec.initial);
    const keyframes = this.spec.keyframes
      ? this.spec.keyframes.map(stripStyleKeyframe)
      : undefined;
    applyInitial(this.target, initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>);
    applyKeyframes(timeline, this.target, keyframes, this.duration!, scope as unknown as Record<string, number>, [], offset);
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
    if (STYLE_KEYS.has(k)) { changed = true; continue; }
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

// Apply fill / stroke from spec.initial. These are baked once at build —
// they do not tween in v1. Anything missing means "no fill" / "no stroke".
function applyStaticStyle(g: Graphics, initial: Props, scope: Scope): Graphics {
  const fillColor   = initial.fillColor;
  const fillAlpha   = initial.fillAlpha   !== undefined ? num(initial.fillAlpha,   scope) : 1;
  const strokeColor = initial.strokeColor;
  const strokeAlpha = initial.strokeAlpha !== undefined ? num(initial.strokeAlpha, scope) : 1;
  const strokeWidth = initial.strokeWidth !== undefined ? num(initial.strokeWidth, scope) : 0;
  if (fillColor !== undefined) g.fill({ color: fillColor as string | number, alpha: fillAlpha });
  if (strokeColor !== undefined && strokeWidth > 0) {
    g.stroke({ color: strokeColor as string | number, alpha: strokeAlpha, width: strokeWidth });
  }
  return g;
}

function num(v: PropValue, scope: Scope): number {
  if (typeof v === 'number') return v;
  if (isExpr(v)) return evaluateExpr(v, scope as unknown as Record<string, number>);
  const parsed = parseFloat(v);
  return Number.isNaN(parsed) ? 0 : parsed;
}
