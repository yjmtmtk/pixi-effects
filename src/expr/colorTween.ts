import { gsap } from 'gsap';
import { buildColorInterp, type ColorSpace, type ColorInput } from './colorInterp';
import { interpolateColors, isPure } from '../core/timelineEngine';

type Timeline = ReturnType<typeof gsap.timeline>;

/** `'#rrggbb'` for a number, a CSS colour string as it is. */
const css = (c: ColorInput): string => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

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
  loop: Record<string, number | boolean> = {},
): void {
  if (isPure(timeline)) {
    // the timeline of our own: the colour at a time is made from the colour before the tween, which it knows without playing
    const none = (): unknown => undefined;
    timeline.tweenValue<ColorInput | undefined>({
      holder: target, id: key,
      get: () => target[key] as ColorInput | undefined,
      set: (v) => { if (v === undefined) return; target[key] = v; if (onUpdate) onUpdate(); },
      from: fromValue !== undefined ? () => fromValue : undefined,
      to: () => toValue,
      make: (a, b) => (a === undefined ? (none as (p: number) => undefined)
        : colorSpace === 'rgb' ? (interpolateColors(css(a), css(b!)) as (p: number) => ColorInput)
        : (buildColorInterp(a, b!, colorSpace) as (p: number) => ColorInput)),
      duration, ease, at, repeat: loop.repeat as number | undefined, yoyo: loop.yoyo as boolean | undefined, repeatDelay: loop.repeatDelay as number | undefined,
    });
    return;
  }
  let interp: ((p: number) => unknown) | null = null;
  const proxy = { p: 0 };
  timeline.fromTo(
    proxy,
    { p: 0 },
    {
      p: 1, duration, ease, ...loop,
      onStart: () => {
        const start = (fromValue !== undefined ? fromValue : target[key]) as ColorInput | undefined;
        if (start === undefined) return;
        interp = colorSpace === 'rgb'
          ? (gsap.utils.interpolate(css(start), css(toValue)) as (p: number) => unknown)   // a number is a colour here: lerping 0xff0000 → 0x00ff00 as a number gives 0x7fff80, not olive
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
