import type { Sequence } from '../sequences/Base';

/** A filter that wants to know which moment is drawn (`grain`). */
export interface TimeFilter { setTime(t: number): void }

/**
 * Every filter in the layer tree that has `setTime`, found once after the build (the movie feeds them before each draw).
 * Inside a time-remapped composition a filter is told the composition's local time, not the movie's.
 */
export function collectTimeFilters(seq: Sequence, out: TimeFilter[] = [], clock: (() => number) | null = null): TimeFilter[] {
  for (const f of seq.filters ?? []) {
    if (typeof (f as unknown as Partial<TimeFilter>).setTime === 'function') {
      const tf = f as unknown as TimeFilter;
      out.push(clock ? { setTime: () => tf.setTime(clock()) } : tf);
    }
  }
  if (seq.maskSequence) collectTimeFilters(seq.maskSequence, out, clock);
  const own = (seq as Sequence & { localClock?: () => (() => number) | null }).localClock?.() ?? clock;
  for (const child of (seq as Sequence & { _children?: Sequence[] })._children ?? []) collectTimeFilters(child, out, own);
  return out;
}
