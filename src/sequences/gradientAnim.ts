import { gsap } from 'gsap';
import { Texture, FillGradient } from 'pixi.js';
import { cssColor, gradientOptions, paintRadial, type RadialCtx } from './gradient';
import { buildColorInterp, type ColorSpace } from '../expr/colorInterp';
import { suggestName } from '../core/options';
import { kfDuration } from '../core/spring';
import { resolveAt, loopVars } from '../core/Timeline';
import { revertibleSet } from '../core/revertibleSet';
import { interpolateColors, isPure } from '../core/timelineEngine';
import type { GradientSpec, Keyframe, Props } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

/** The live numbers of an animated `fillGradient`. Every colour is a CSS string. */
export interface GradState {
  type: 'linear' | 'radial';
  angle: number;
  center: [number, number];
  innerRadius: number;
  radius: number;
  stops: Array<{ offset: number; color: string }>;
}

/** What a keyframe's `fillGradient` may carry. `type` is only here to say it cannot change. */
const PATCH_KEYS = ['type', 'angle', 'center', 'innerRadius', 'radius', 'stops'] as const;

export function gradStateFrom(g: GradientSpec): GradState {
  return {
    type: g.type ?? 'linear',
    angle: g.angle ?? 90,
    center: [...(g.center ?? [0.5, 0.5])] as [number, number],
    innerRadius: g.innerRadius ?? 0,
    radius: g.radius ?? 0.5,
    stops: (g.stops ?? []).map(s => (Array.isArray(s) ? { offset: s[0], color: cssColor(s[1]) } : { offset: s.offset, color: cssColor(s.color) })),
  };
}

/**
 * `base` with the keys of `patch` replaced. What cannot be tweened (another number of stops, a new `type`, a patch that is not an
 * object) is ignored here: `validateGradientKeyframes` has said so, once, when the layer was built.
 */
export function mergeGrad(base: GradState, patch: unknown): GradState {
  const out: GradState = { ...base, center: [...base.center] as [number, number], stops: base.stops.map(s => ({ ...s })) };
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return out;
  const p = patch as Record<string, unknown>;
  if (typeof p.angle === 'number') out.angle = p.angle;
  if (Array.isArray(p.center)) out.center = [Number(p.center[0]), Number(p.center[1])];
  if (typeof p.innerRadius === 'number') out.innerRadius = p.innerRadius;
  if (typeof p.radius === 'number') out.radius = p.radius;
  if (p.stops !== undefined) {
    const next = gradStateFrom({ stops: p.stops as GradientSpec['stops'] }).stops;
    if (next.length === base.stops.length) out.stops = next;
  }
  return out;
}

const objectHint = "a keyframe's fillGradient must be an object like { angle: 200, stops: [[0, '#f00'], [1, '#00f']] }";

/**
 * The mistakes a keyframe can make with `fillGradient`, said ONCE when the layer is built (not in a tween's `onStart`, which runs again
 * at every seek). `spec` is the layer's spec: its gradient (top level or in `initial`) and its keyframes.
 */
export function validateGradientKeyframes(
  spec: { keyframes?: Keyframe[]; fillGradient?: unknown; initial?: Props },
  who: string,
  warn: (message: string) => void = m => console.warn(m),
  kind: 'shape' | 'text' = 'shape',
): void {
  const said = new Set<string>();
  const say = (m: string): void => { if (!said.has(m)) { said.add(m); warn(`pixi-effects: ${who}: ${m}`); } };
  const startSpec = (spec.fillGradient ?? (spec.initial as { fillGradient?: unknown } | undefined)?.fillGradient) as GradientSpec | undefined;
  const start = startSpec && typeof startSpec === 'object' && Array.isArray(startSpec.stops) ? gradStateFrom(startSpec) : null;
  let animated = false;
  if (kind === 'text') {                                           // letters take a linear gradient only (a shape has the radial one too)
    const radial = (g: unknown): boolean => !!g && typeof g === 'object' && ['type', 'center', 'innerRadius', 'radius'].some(k => (g as Record<string, unknown>)[k] !== undefined && !(k === 'type' && (g as Record<string, unknown>).type === 'linear'));
    const asked = radial(startSpec) || (spec.keyframes ?? []).some(kf => [kf.set, kf.to, kf.from].some(b => radial((b as Record<string, unknown> | undefined)?.fillGradient)));
    if (asked) say('a text gradient is linear: type, center, innerRadius and radius are ignored (only angle and stops apply); use a shape for a radial gradient');
  }
  for (const kf of spec.keyframes ?? []) {
    for (const bag of [kf.set, kf.to, kf.from] as Array<Record<string, unknown> | undefined>) {
      if (!bag) continue;
      for (const [key, value] of Object.entries(bag)) {
        if (key === 'fillGradient') {
          animated = true;
          if (value === null || typeof value !== 'object' || Array.isArray(value)) { say(objectHint); continue; }
          const p = value as Record<string, unknown>;
          for (const k of Object.keys(p)) {
            if ((PATCH_KEYS as readonly string[]).includes(k)) continue;
            const guess = suggestName(k, PATCH_KEYS.filter(x => x !== 'type'));
            say(`fillGradient.${k} is not a gradient property${guess ? ` — did you mean "${guess}"?` : ''} (valid: ${PATCH_KEYS.join(', ')}); it is ignored`);
          }
          if (p.type !== undefined && start && p.type !== start.type) say('fillGradient.type cannot change over time (linear <-> radial); it is ignored');
          if (p.stops !== undefined && start) {
            const n = Array.isArray(p.stops) ? p.stops.length : 0;
            if (n !== start.stops.length) say(`a fillGradient keyframe must give the same number of stops as the gradient has (${start.stops.length}, got ${n}); the stops are left as they were`);
          }
        } else if (/^fillGradient\./i.test(key) || /^gradient/i.test(key)) {
          const tail = key.replace(/^fillGradient\./i, '').replace(/^gradient/i, '');
          const sub = tail ? tail[0]!.toLowerCase() + tail.slice(1) : 'angle';
          say(`"${key}" is not an animatable property: write fillGradient: { ${(PATCH_KEYS as readonly string[]).includes(sub) ? sub : 'angle'} } (the whole gradient is one object) in the keyframe's to / from / set`);
        }
      }
    }
  }
  if (animated && !start) say('a keyframe animates fillGradient but the layer has none to start from: give it a fillGradient first (top level or in initial)');
}

/** Tween a gradient state through time: numbers linearly, stop colours through `colorSpace`. */
export function tweenGradient(
  timeline: Timeline,
  holder: { grad: GradState },
  fromPatch: unknown,
  toPatch: unknown,
  duration: number, ease: string, at: number,
  colorSpace: ColorSpace,
  onChange: () => void,
  loop: Record<string, number | boolean> = {},
): void {
  if (isPure(timeline)) {
    // the timeline of our own: both ends come from the gradient before the tween, so nothing is kept between two seeks
    timeline.tweenValue<GradState>({
      holder, id: 'grad', get: () => holder.grad, set: (g) => { holder.grad = g; onChange(); },
      from: fromPatch !== undefined ? (prev) => mergeGrad(prev, fromPatch) : undefined,
      to: (start, prev) => (toPatch !== undefined ? mergeGrad(start, toPatch) : prev),
      make: (a, b) => {
        const colors = a.stops.map((s, i) => (colorSpace === 'rgb' ? interpolateColors(s.color, b.stops[i]!.color) : buildColorInterp(s.color, b.stops[i]!.color, colorSpace) as (p: number) => string));
        return (t) => {
          const l = (x: number, y: number): number => x + (y - x) * t;
          return {
            type: a.type, angle: l(a.angle, b.angle),
            center: [l(a.center[0], b.center[0]), l(a.center[1], b.center[1])],
            innerRadius: l(a.innerRadius, b.innerRadius), radius: l(a.radius, b.radius),
            stops: a.stops.map((s, i) => ({ offset: l(s.offset, b.stops[i]!.offset), color: colors[i]!(t) })),
          };
        };
      },
      duration, ease, at, repeat: loop.repeat as number | undefined, yoyo: loop.yoyo as boolean | undefined, repeatDelay: loop.repeatDelay as number | undefined,
    });
    return;
  }
  let a: GradState | null = null, b: GradState | null = null;
  let resting: GradState | null = null;                            // `from` alone runs to the gradient the layer had: kept from the first start, so a seek back and forward again does not take the `from` state for it
  let colors: Array<(p: number) => string> = [];
  const proxy = { p: 0 };
  timeline.fromTo(proxy, { p: 0 }, {
    p: 1, duration, ease, ...loop,
    onStart: () => {
      const live = holder.grad;
      a = fromPatch !== undefined ? mergeGrad(live, fromPatch) : live;
      if (toPatch === undefined) resting ??= live;
      b = toPatch !== undefined ? mergeGrad(a, toPatch) : resting!;
      colors = a.stops.map((s, i) => (colorSpace === 'rgb'
        ? (gsap.utils.interpolate(s.color, b!.stops[i]!.color) as (p: number) => string)
        : buildColorInterp(s.color, b!.stops[i]!.color, colorSpace)));
    },
    onUpdate: () => {
      if (!a || !b) return;
      const t = proxy.p;
      const l = (x: number, y: number): number => x + (y - x) * t;
      holder.grad = {
        type: a.type, angle: l(a.angle, b.angle),
        center: [l(a.center[0], b.center[0]), l(a.center[1], b.center[1])],
        innerRadius: l(a.innerRadius, b.innerRadius), radius: l(a.radius, b.radius),
        stops: a.stops.map((s, i) => ({ offset: l(s.offset, b!.stops[i]!.offset), color: colors[i]!(t) })),
      };
      onChange();
    },
  }, at);
}

/** Resolution of the painted gradient: a hard stop across a 1920 px shape stays sharp enough at 512. */
const PAINT_SIZE = 512;

/** One canvas + one Texture per animated gradient, repainted in place (no new GPU object per frame). */
export class GradientPainter {
  private canvas = document.createElement('canvas');
  private tex: Texture;
  constructor(private size = PAINT_SIZE) {
    this.canvas.width = size; this.canvas.height = size;
    this.tex = Texture.from(this.canvas);
    (globalThis as { __gradientPainters?: number }).__gradientPainters = ((globalThis as { __gradientPainters?: number }).__gradientPainters ?? 0) + 1;
  }
  /** Paint `g` and return what `Graphics.fill(...)` takes. */
  paint(g: GradState): { texture: Texture; textureSpace: 'local' } | FillGradient {
    const ctx = this.canvas.getContext('2d'), s = this.size;
    if (!ctx) return new FillGradient(gradientOptions({ angle: g.angle, stops: g.stops.map(x => [x.offset, x.color] as [number, string]) }) as never);   // no 2D canvas (a test, a worker): the plain linear fill
    ctx.clearRect(0, 0, s, s);
    if (g.type === 'radial') {
      paintRadial(ctx as unknown as RadialCtx, s, { stops: g.stops.map(x => [x.offset, x.color] as [number, string]), center: g.center, innerRadius: g.innerRadius, radius: g.radius });
    } else {
      const a = (g.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const h = (Math.abs(dx) + Math.abs(dy)) / 2;      // the same line as gradientOptions: through the centre, corner to corner
      const grad = ctx.createLinearGradient((0.5 - dx * h) * s, (0.5 - dy * h) * s, (0.5 + dx * h) * s, (0.5 + dy * h) * s);
      for (const st of g.stops) grad.addColorStop(Math.min(1, Math.max(0, st.offset)), st.color);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    }
    this.tex.source.update();
    return { texture: this.tex, textureSpace: 'local' };
  }
  /** Give the texture and the canvas back (a layer that is destroyed must not leave them). */
  destroy(): void {
    this.tex.destroy(true);
    this.canvas.width = this.canvas.height = 0;
    (globalThis as { __gradientPainters?: number }).__gradientPainters = Math.max(0, ((globalThis as { __gradientPainters?: number }).__gradientPainters ?? 1) - 1);
  }
}

/** Bind every `fillGradient` keyframe (`set` / `from` / `to`) of a layer onto `holder.grad`. */
export function bindGradientKeyframes(
  timeline: Timeline, holder: { grad: GradState }, keyframes: Keyframe[], duration: number, offset: number,
  colorSpace: ColorSpace, onChange: () => void,
): void {
  const bag = (b: Props | undefined): unknown => (b as Record<string, unknown> | undefined)?.fillGradient;
  for (const kf of keyframes) {
    const at = offset + resolveAt(kf.at, duration);
    const setV = bag(kf.set), fromV = bag(kf.from), toV = bag(kf.to);
    if (setV !== undefined && isPure(timeline)) {
      timeline.tweenValue<GradState>({
        holder, id: 'grad', get: () => holder.grad, set: (g) => { holder.grad = g; onChange(); },
        to: (start) => mergeGrad(start, setV), make: (_a, b) => () => b, duration: 0, ease: 'none', at,
      });
    } else if (setV !== undefined) {
      revertibleSet<{ state?: GradState; patch?: unknown }>(timeline, at, () => ({ state: holder.grad }),
        v => { holder.grad = v.state ?? mergeGrad(holder.grad, v.patch); onChange(); }, { patch: setV });
    }
    if (fromV !== undefined || toV !== undefined) {
      tweenGradient(timeline, holder, fromV, toV, kfDuration(kf), kf.ease ?? 'none', at, colorSpace, onChange, loopVars(kf));
    }
  }
}

export const hasGradientKeys = (keyframes: Keyframe[] | undefined): boolean =>
  (keyframes ?? []).some(kf => [kf.set, kf.to, kf.from].some(b => b && (b as Record<string, unknown>).fillGradient !== undefined));
