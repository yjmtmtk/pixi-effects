import { flattenSvgPath, trimPolylines } from '../sequences/trimPath';

/** A path walked by length: where a fraction of the way along is, which way it heads, and the part between two fractions. */
export interface PathSampler {
  /** The arc length of all the sub-paths together, in the path's own units. */
  length: number;
  /** The point a fraction `u` (0–1, clamped) of the length along, and the heading there in radians (`Math.atan2` of the direction, 0 = right, π/2 = down). */
  at(u: number): { x: number; y: number; angle: number };
  /** The part between the fractions `start` and `end` (default the whole path) as flat `[x, y, x, y, …]` pieces, one per sub-path it touches: draw each with `moveTo` / `lineTo` (a line that draws on). */
  trim(start?: number, end?: number): number[][];
}

interface Segment { x0: number; y0: number; x1: number; y1: number; start: number; len: number }

/**
 * Walks SVG path data by arc length, the way `followPath` does, for a `canvas` layer's `draw` (or anything that needs the points of a curve): text set along a curve, a leader
 * line that draws on, a petal that falls along a route. Curves are flattened the way the shape layer draws them. Build it once (module scope or `setup`), ask it every frame.
 *
 * ```js
 * const route = samplePath('M 40 300 C 200 20 400 20 560 300');
 * // in draw: const { x, y, angle } = route.at(t / 4); for (const piece of route.trim(0, t / 4)) { ctx.moveTo(piece[0], piece[1]); … }
 * ```
 */
export function samplePath(d: string): PathSampler {
  if (typeof d !== 'string' || d.trim() === '') throw new Error('samplePath(): d must be SVG path data, e.g. "M 40 300 C 200 20 400 20 560 300"');
  const lines = flattenSvgPath(d);
  const segments: Segment[] = [];
  let length = 0;
  for (const line of lines) {
    const p = line.closed ? [...line.pts, line.pts[0]!, line.pts[1]!] : line.pts;
    for (let i = 2; i < p.length; i += 2) {
      const len = Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!);
      if (len === 0) continue;
      segments.push({ x0: p[i - 2]!, y0: p[i - 1]!, x1: p[i]!, y1: p[i + 1]!, start: length, len });
      length += len;
    }
  }
  if (!(length > 0)) throw new Error(`samplePath(): the path "${d}" has no length (it needs at least two different points)`);
  const find = (s: number): Segment => {
    let lo = 0, hi = segments.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segments[mid]!.start + segments[mid]!.len < s) lo = mid + 1; else hi = mid; }
    return segments[lo]!;
  };
  return {
    length,
    at(u) {
      const s = Math.min(Math.max(Number.isFinite(u) ? u : 0, 0), 1) * length;
      const g = find(s);
      const t = Math.min(Math.max((s - g.start) / g.len, 0), 1);
      return { x: g.x0 + (g.x1 - g.x0) * t, y: g.y0 + (g.y1 - g.y0) * t, angle: Math.atan2(g.y1 - g.y0, g.x1 - g.x0) };
    },
    trim(start = 0, end = 1) {
      return trimPolylines(lines, start, end).map(l => l.pts);
    },
  };
}
