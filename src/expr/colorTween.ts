import { gsap } from 'gsap';
import { buildColorInterp, type ColorSpace, type ColorInput } from './colorInterp';

type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * Shared colour-tween helper used by every sequence type that wants to
 * interpolate a colour-valued property smoothly through a chosen colour
 * space (sRGB / OKLab / OKLCH).
 *
 * Keys to the design:
 * 1. The interpolator is built inside `onStart`, not at bind time, so a
 *    chained-keyframe tween picks up the previous tween's end colour
 *    (rather than locking onto the initial spec value).
 * 2. `fromValue` is honoured if explicit; otherwise we read `target[key]`
 *    at tween start — matching GSAP's standard `.to()` semantic.
 * 3. The optional `onUpdate` hook lets the caller flag the target as dirty
 *    after each write (e.g. PIXI Text needs `_didChange = true` to
 *    re-rasterise its fill).
 */
export function tweenColor(
  timeline: Timeline,
  target: Record<string, unknown>,
  key: string,
  fromValue: ColorInput | undefined,
  toValue: ColorInput,
  duration: number,
  ease: string,
  at: number,
  colorSpace: ColorSpace,
  onUpdate?: () => void,
): void {
  let interp: ((p: number) => unknown) | null = null;
  const proxy = { p: 0 };
  timeline.fromTo(
    proxy,
    { p: 0 },
    {
      p: 1, duration, ease,
      onStart: () => {
        const start = (fromValue !== undefined ? fromValue : target[key]) as ColorInput | undefined;
        if (start === undefined) return;
        interp = colorSpace === 'rgb'
          ? (gsap.utils.interpolate(start, toValue) as (p: number) => unknown)
          : buildColorInterp(start, toValue, colorSpace);
      },
      onUpdate: () => {
        if (interp) {
          target[key] = interp(proxy.p);
          if (onUpdate) onUpdate();
        }
      },
    },
    at,
  );
}
