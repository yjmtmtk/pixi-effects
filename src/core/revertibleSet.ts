import type { gsap } from 'gsap';
import { isPure } from './timelineEngine';

type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * A `set` keyframe for values GSAP cannot tween directly (colours, text state).
 *
 * `timeline.call` runs forward only, and GSAP skips every callback of a zero-duration tween when
 * the playhead leaves its exact start time backwards — so a jump placed at 1 s stayed applied
 * after seeking back to 0. A property write is never skipped: GSAP tweens a proxy `p` from 0 to 1,
 * and the proxy's setter applies the value going forward and restores the previous one going back.
 */
export function revertibleSet<T>(
  timeline: Timeline,
  at: number,
  read: () => T,
  write: (value: T) => void,
  value: T,
  /** The property this writes, when tweens write it too (so the two are one channel of the pure timeline). */
  property?: [object, string],
): void {
  if (isPure(timeline)) { timeline.setValue(property?.[0] ?? read, property?.[1] ?? 'set', at, read, write, value); return; }
  let p = 0;
  let before: T;
  const proxy = {
    get p() { return p; },
    set p(next: number) {
      if (next >= 1 && p < 1) { before = read(); write(value); }
      else if (next < 1 && p >= 1) { write(before); }
      p = next;
    },
  };
  timeline.set(proxy, { p: 1 }, at);
}
