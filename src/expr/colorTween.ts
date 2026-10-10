import { buildColorInterp, type ColorSpace, type ColorInput } from './colorInterp';
import { interpolateColors, type Timeline } from '../core/timelineEngine';

/** `'#rrggbb'` for a number, a CSS colour string as it is. */
const css = (c: ColorInput): string => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

/**
 * Shared colour-tween helper used by every sequence type that wants to
 * interpolate a colour-valued property smoothly through a chosen colour
 * space (sRGB / OKLab / OKLCH).
 *
 * Keys to the design:
 * 1. The interpolator is built from the colour before the tween (the end of the
 *    keyframe before it, or the layer's own), so a chained-keyframe tween picks
 *    up the previous tween's end colour (rather than locking onto the initial spec value).
 * 2. `fromValue` is honoured if explicit; otherwise we read `target[key]`
 *    at tween start — like any other `.to()`.
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
  // the colour at a time is made from the colour before the tween, which the timeline knows without playing
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
}
