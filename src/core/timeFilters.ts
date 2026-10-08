import type { Sequence } from '../sequences/Base';

/** A filter that wants to know which moment is drawn (`grain`). */
export interface TimeFilter { setTime(t: number): void }

/** Every filter in the layer tree that has `setTime`, found once after the build (the movie feeds them before each draw). */
export function collectTimeFilters(seq: Sequence, out: TimeFilter[] = []): TimeFilter[] {
  for (const f of seq.filters ?? []) if (typeof (f as unknown as Partial<TimeFilter>).setTime === 'function') out.push(f as unknown as TimeFilter);
  if (seq.maskSequence) collectTimeFilters(seq.maskSequence, out);
  for (const child of (seq as Sequence & { _children?: Sequence[] })._children ?? []) collectTimeFilters(child, out);
  return out;
}
