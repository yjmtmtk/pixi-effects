import { gsap } from 'gsap';
import { Texture, FillGradient } from 'pixi.js';
import { gradientOptions } from './gradient';
import { buildColorInterp, type ColorSpace } from '../expr/colorInterp';
import { cssColor } from './gradient';
import { resolveAt, loopVars } from '../core/Timeline';
import { revertibleSet } from '../core/revertibleSet';
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

const PATCH_KEYS = ['type', 'angle', 'center', 'innerRadius', 'radius', 'stops'];

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

/** `base` with the keys of `patch` replaced. Warns (and keeps the base) about what cannot be tweened. */
export function mergeGrad(base: GradState, patch: unknown, who: string): GradState {
  const out: GradState = { ...base, center: [...base.center] as [number, number], stops: base.stops.map(s => ({ ...s })) };
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    console.warn(`pixi-effects: ${who}: a keyframe's fillGradient must be an object like { angle: 200, stops: [[0, '#f00'], [1, '#00f']] }; ignored`);
    return out;
  }
  const p = patch as Record<string, unknown>;
  for (const k of Object.keys(p)) {
    if (!PATCH_KEYS.includes(k)) console.warn(`pixi-effects: ${who}: fillGradient.${k} is not a gradient property (valid: ${PATCH_KEYS.join(', ')}); ignored`);
  }
  if (p.type !== undefined && p.type !== base.type) console.warn(`pixi-effects: ${who}: fillGradient.type cannot change over time (linear <-> radial); ignored`);
  if (typeof p.angle === 'number') out.angle = p.angle;
  if (Array.isArray(p.center)) out.center = [Number(p.center[0]), Number(p.center[1])];
  if (typeof p.innerRadius === 'number') out.innerRadius = p.innerRadius;
  if (typeof p.radius === 'number') out.radius = p.radius;
  if (p.stops !== undefined) {
    const next = gradStateFrom({ stops: p.stops as GradientSpec['stops'] }).stops;
    if (next.length !== base.stops.length) {
      console.warn(`pixi-effects: ${who}: a fillGradient keyframe must give the same number of stops as the gradient has (${base.stops.length}, got ${next.length}); the stops are left as they were`);
    } else out.stops = next;
  }
  return out;
}

/** Tween a gradient state through time: numbers linearly, stop colours through `colorSpace`. */
export function tweenGradient(
  timeline: Timeline,
  holder: { grad: GradState },
  fromPatch: unknown,
  toPatch: unknown,
  duration: number, ease: string, at: number,
  colorSpace: ColorSpace,
  who: string,
  onChange: () => void,
  loop: Record<string, number | boolean> = {},
): void {
  let a: GradState | null = null, b: GradState | null = null;
  let colors: Array<(p: number) => string> = [];
  const proxy = { p: 0 };
  timeline.fromTo(proxy, { p: 0 }, {
    p: 1, duration, ease, ...loop,
    onStart: () => {
      const live = holder.grad;
      a = fromPatch !== undefined ? mergeGrad(live, fromPatch, who) : live;
      b = toPatch !== undefined ? mergeGrad(a, toPatch, who) : a;
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

/** One canvas + one Texture per animated gradient, repainted in place (no new GPU object per frame). */
export class GradientPainter {
  private canvas = document.createElement('canvas');
  private tex: Texture;
  constructor(private size = 256) {
    this.canvas.width = size; this.canvas.height = size;
    this.tex = Texture.from(this.canvas);
  }
  private last: FillGradient | null = null;
  paint(g: GradState): any {
    if ((globalThis as any).__naive) {            // SPIKE ONLY: the naive "new FillGradient every frame" for the cost comparison
      this.last?.destroy();
      return (this.last = new FillGradient(gradientOptions({ angle: g.angle, stops: g.stops.map(s => [s.offset, s.color] as [number, string]) }) as never));
    }
    const ctx = this.canvas.getContext('2d')!, s = this.size;
    let grad: CanvasGradient;
    if (g.type === 'radial') {
      grad = ctx.createRadialGradient(g.center[0] * s, g.center[1] * s, g.innerRadius * s, g.center[0] * s, g.center[1] * s, g.radius * s);
    } else {
      const a = (g.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const h = (Math.abs(dx) + Math.abs(dy)) / 2;      // same line as gradient.ts: through the centre, corner to corner
      grad = ctx.createLinearGradient((0.5 - dx * h) * s, (0.5 - dy * h) * s, (0.5 + dx * h) * s, (0.5 + dy * h) * s);
    }
    for (const st of g.stops) grad.addColorStop(Math.min(1, Math.max(0, st.offset)), st.color);
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    this.tex.source.update();
    return { texture: this.tex, textureSpace: 'local' };
  }
}

/** Bind every `fillGradient` keyframe (`set` / `from` / `to`) of a layer onto `holder.grad`. */
export function bindGradientKeyframes(
  timeline: Timeline, holder: { grad: GradState }, keyframes: Keyframe[], duration: number, offset: number,
  colorSpace: ColorSpace, who: string, onChange: () => void,
): void {
  const bag = (b: Props | undefined): unknown => (b as Record<string, unknown> | undefined)?.fillGradient;
  for (const kf of keyframes) {
    const at = offset + resolveAt(kf.at, duration);
    const setV = bag(kf.set), fromV = bag(kf.from), toV = bag(kf.to);
    if (setV !== undefined) {
      revertibleSet<{ state?: GradState; patch?: unknown }>(timeline, at, () => ({ state: holder.grad }),
        v => { holder.grad = v.state ?? mergeGrad(holder.grad, v.patch, who); onChange(); }, { patch: setV });
    }
    if (fromV !== undefined || toV !== undefined) {
      tweenGradient(timeline, holder, fromV, toV, kf.duration ?? 0, kf.ease ?? 'none', at, colorSpace, who, onChange, loopVars(kf));
    }
  }
}

export const hasGradientKeys = (keyframes: Keyframe[] | undefined): boolean =>
  (keyframes ?? []).some(kf => [kf.set, kf.to, kf.from].some(b => b && (b as Record<string, unknown>).fillGradient !== undefined));
