import type { Stop } from '../index';

/** The first stop beyond `frame` (standing on a stop, the next one). */
export function nextStopAfter(stops: readonly Stop[], frame: number): Stop | null {
  return stops.find(s => s.frame > frame) ?? null;
}

/** The last stop before `frame` (standing on a stop, the one before it). */
export function previousStopBefore(stops: readonly Stop[], frame: number): Stop | null {
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i]!.frame < frame) return stops[i]!;
  return null;
}

/** The stop the playhead is on or has just passed, or null before the first. */
export function stopAtOrBefore(stops: readonly Stop[], frame: number): Stop | null {
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i]!.frame <= frame) return stops[i]!;
  return null;
}

/** The stop that begins each page. */
export function pageStarts(stops: readonly Stop[]): Stop[] {
  return stops.filter(s => s.pageStart);
}

/**
 * The stops whose pictures stand for the pages (`which: 'pages'`, default) or for every stop. A page's picture is, in order: the stop flagged
 * `pdf: true` (the last such one, or the first with `pick: 'first'`), else the last (or first) stop not flagged `pdf: false`, else, for a page
 * list, its last (or first) stop, and for a PDF (`pdf: true` here) nothing: the page is left out. With `which: 'stops'` a PDF leaves out the
 * stops flagged `pdf: false`.
 */
export function pictureStops(stops: readonly Stop[], opts: { which?: 'pages' | 'stops'; pick?: 'last' | 'first'; pdf?: boolean } = {}): Stop[] {
  if (opts.which === 'stops') return opts.pdf ? stops.filter(s => s.pdf !== false) : [...stops];
  const byPage = new Map<number, Stop[]>();
  for (const s of stops) byPage.set(s.pageIndex, [...(byPage.get(s.pageIndex) ?? []), s]);
  const take = (list: Stop[]): Stop | undefined => (opts.pick === 'first' ? list[0] : list[list.length - 1]);
  const picks: Stop[] = [];
  for (const list of byPage.values()) {
    const flagged = list.filter(s => s.pdf === true);
    const usable = list.filter(s => s.pdf !== false);
    const one = take(flagged.length ? flagged : usable.length ? usable : (opts.pdf ? [] : list));
    if (one) picks.push(one);
  }
  return picks;
}

/** The share (0–1) of pixels that differ by more than `threshold` (0–255) in any colour channel between two RGBA pixel arrays of the same size. */
export function changedFraction(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 12): number {
  const n = Math.min(a.length, b.length) >> 2;
  if (n === 0) return 0;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const k = i << 2;
    if (Math.abs(a[k]! - b[k]!) > threshold || Math.abs(a[k + 1]! - b[k + 1]!) > threshold || Math.abs(a[k + 2]! - b[k + 2]!) > threshold) changed++;
  }
  return changed / n;
}
