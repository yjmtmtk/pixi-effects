import type { Timeline } from './timelineEngine';

/**
 * A `set` keyframe for values a tween cannot move (colours, text state, a flag): from `at` on the property is `value`, and what `read`
 * gives (the value before) at any time before. `property` names the property when tweens write it too, so the two are one channel of
 * the timeline and a tween after a set starts from the set's value. `write` is the way the caller writes it (it may redraw).
 */
export function revertibleSet<T>(
  timeline: Timeline,
  at: number,
  read: () => T,
  write: (value: T) => void,
  value: T,
  property?: [object, string],
): void {
  timeline.setValue(property?.[0] ?? read, property?.[1] ?? 'set', at, read, write, value);
}
