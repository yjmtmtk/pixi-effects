import type { Keyframe } from '../types';
import { warnUnknownOptions } from '../core/options';
import { rand } from '../expr/random';

const WIGGLE_KEYS = ['at', 'duration', 'freq', 'seed', 'ease', 'props'] as const;
const MAX_STEPS = 2000;

export interface WiggleProp {
  /** The value the property rests at: a number or an expression (`'W/2'`). The wiggle starts and ends here. */
  around: number | string;
  /** How far it strays from `around` (same unit as the property). */
  amp: number;
}

export interface WiggleOptions {
  /** Start, in seconds from the start of the layer. Default 0. */
  at?: number;
  /** How long it shakes, in seconds. Required. */
  duration: number;
  /** New random targets per second. Default 3 (a drift); 8 and up reads as a shake. */
  freq?: number;
  /** Another seed is another take of the same shake. Default 0. */
  seed?: number;
  /** GSAP ease between targets. Default `'sine.inOut'`; `'none'` gives straight, jittery lines. */
  ease?: string;
  /** The properties to move, each independently: `{ x: { around: 960, amp: 6 }, rotation: { around: 0, amp: 1.5 } }`. */
  props: Record<string, WiggleProp>;
}

/**
 * A seeded wiggle as keyframes: put the result in a layer's `keyframes`
 * (spread it next to others: `keyframes: [...wiggle({ … }), { at: 4, to: … }]`).
 *
 * Expressions are evaluated once when the layer is built, so a wiggle cannot
 * be an expression; it is baked into ordinary keyframes instead. The targets
 * come from the seed, so playback, seeking and export all agree. The last step
 * returns every property to `around`, so the layer is not left offset.
 */
export function wiggle(opts: WiggleOptions): Keyframe[] {
  warnUnknownOptions('wiggle()', opts, WIGGLE_KEYS);
  const { at = 0, duration, freq = 3, seed = 0, ease = 'sine.inOut', props } = opts;
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`wiggle(): duration must be a positive number of seconds, got ${duration}`);
  if (!(Number.isFinite(freq) && freq > 0)) throw new Error(`wiggle(): freq must be a positive number (steps per second), got ${freq}`);
  const names = Object.keys(props ?? {});
  if (names.length === 0) throw new Error('wiggle(): props is empty; name at least one property, e.g. props: { x: { around: 100, amp: 8 } }');
  for (const n of names) {
    const p = props[n]!;
    if (!Number.isFinite(p.amp)) throw new Error(`wiggle(): props.${n}.amp must be a number, got ${p.amp}`);
    if (p.around === undefined || p.around === null || p.around === '') throw new Error(`wiggle(): props.${n}.around is missing`);
  }
  const steps = Math.ceil(duration * freq - 1e-9);
  if (steps > MAX_STEPS) throw new Error(`wiggle(): ${steps} steps is too many (max ${MAX_STEPS}); lower freq or duration`);

  const set: Record<string, number | string> = {};
  for (const n of names) set[n] = props[n]!.around;
  const out: Keyframe[] = [{ at, set }];
  const stepLen = duration / steps;
  for (let s = 0; s < steps; s++) {
    const to: Record<string, number | string> = {};
    names.forEach((n, pi) => {
      const p = props[n]!;
      if (s === steps - 1) { to[n] = p.around; return; }
      const off = (rand(seed * 7919 + pi * 104729 + s * 31 + 1) * 2 - 1) * p.amp;
      to[n] = typeof p.around === 'number'
        ? p.around + off
        : `(${p.around}) ${off < 0 ? '-' : '+'} ${Math.abs(off)}`;
    });
    out.push({ at: at + s * stepLen, to, duration: stepLen, ease });
  }
  return out;
}
