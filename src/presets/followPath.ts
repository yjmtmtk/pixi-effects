import type { Keyframe } from '../types';
import { warnUnknownOptions } from '../core/options';
import { flattenSvgPath } from '../sequences/trimPath';
import { parseEase } from './_ease';

const KEYS = ['d', 'at', 'duration', 'ease', 'from', 'to', 'orient', 'rotate', 'frameRate'] as const;
const MAX_STEPS = 2000;

export interface FollowPathOptions {
  /** The route, as SVG path data in the same canvas coordinates the layer's `x` / `y` use. Several sub-paths are walked in order. */
  d: string;
  /** Start, in seconds from the start of the layer. Default 0. */
  at?: number;
  /** How long the trip takes, in seconds. Required. */
  duration: number;
  /** GSAP ease for the progress along the path (default `'none'`: constant speed). */
  ease?: string;
  /** Where on the path to start and stop, as fractions 0–1 of its length (default 0 → 1). `from: 1, to: 0` goes backwards. */
  from?: number;
  to?: number;
  /** Turn the layer to face the way it is going (keyframes `rotation`, in degrees). Default false. */
  orient?: boolean;
  /** With `orient`: degrees added to the heading (`-90` for an image that points up). Default 0. */
  rotate?: number;
  /** Samples per second: set it to your movie's `frameRate` so the layer is exactly on the path at every frame. Default 30. */
  frameRate?: number;
}

interface Segment { x0: number; y0: number; x1: number; y1: number; start: number; len: number }

/**
 * A layer travelling along an SVG path, as keyframes for `x` and `y` (and `rotation` with `orient`). Put the result in a
 * layer's `keyframes`; the layer's own `x` / `y` are the points of the path, so give circles and shapes their centre there
 * and text `anchorX: 0.5, anchorY: 0.5`.
 *
 * The path is walked by arc length (so the speed is even whatever the curve) and sampled once per frame as short straight
 * steps, which keeps the layer on the path at every rendered frame when `frameRate` matches the movie's.
 *
 * ```js
 * { type: 'shape', shape: 'circle', radius: 12, initial: { fillColor: '#ffd166' },
 *   keyframes: followPath({ d: 'M 100 600 C 300 100 900 100 1180 600', duration: 4, ease: 'power2.inOut', frameRate: 30 }) }
 * ```
 */
export function followPath(opts: FollowPathOptions): Keyframe[] {
  warnUnknownOptions('followPath()', opts, KEYS);
  const { d, at = 0, duration, ease = 'none', from = 0, to = 1, orient = false, rotate = 0, frameRate = 30 } = opts;
  if (typeof d !== 'string' || d.trim() === '') throw new Error('followPath(): d must be SVG path data, e.g. "M 100 600 C 300 100 900 100 1180 600"');
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`followPath(): duration must be a positive number of seconds, got ${duration}`);
  if (!(Number.isFinite(frameRate) && frameRate > 0)) throw new Error(`followPath(): frameRate must be a positive number (samples per second), got ${frameRate}`);
  for (const [n, v] of [['from', from], ['to', to]] as const) {
    if (!(Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error(`followPath(): ${n} must be a fraction of the path between 0 and 1, got ${v}`);
  }
  const steps = Math.max(1, Math.round(duration * frameRate));
  if (steps > MAX_STEPS) throw new Error(`followPath(): ${steps} samples is too many (max ${MAX_STEPS}); lower frameRate or duration`);

  const segments: Segment[] = [];
  let total = 0;
  for (const line of flattenSvgPath(d)) {
    const p = line.closed ? [...line.pts, line.pts[0]!, line.pts[1]!] : line.pts;
    for (let i = 2; i < p.length; i += 2) {
      const len = Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!);
      if (len === 0) continue;
      segments.push({ x0: p[i - 2]!, y0: p[i - 1]!, x1: p[i]!, y1: p[i + 1]!, start: total, len });
      total += len;
    }
  }
  if (!(total > 0)) throw new Error(`followPath(): the path "${d}" has no length (it needs at least two different points)`);

  const find = (s: number): Segment => {
    let lo = 0, hi = segments.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segments[mid]!.start + segments[mid]!.len < s) lo = mid + 1; else hi = mid; }
    return segments[lo]!;
  };
  const at_ = (fraction: number): { x: number; y: number; heading: number } => {
    const s = Math.min(Math.max(fraction, 0), 1) * total;
    const g = find(s);
    const t = Math.min(Math.max((s - g.start) / g.len, 0), 1);
    return { x: g.x0 + (g.x1 - g.x0) * t, y: g.y0 + (g.y1 - g.y0) * t, heading: Math.atan2(g.y1 - g.y0, g.x1 - g.x0) * 180 / Math.PI };
  };

  const shape = parseEase(ease);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  let turn = 0;                                                       // heading is kept continuous: 179° → 181°, not −179°
  const sample = (k: number): Record<string, number> => {
    const p = from + (to - from) * shape(k / steps);
    const pt = at_(p);
    const out: Record<string, number> = { x: round(pt.x), y: round(pt.y) };
    if (orient) {
      let h = pt.heading + rotate;
      if (k === 0) turn = h;
      else { let delta = h - turn; delta -= 360 * Math.round(delta / 360); turn += delta; }
      out.rotation = round(turn);
    }
    return out;
  };

  const out: Keyframe[] = [{ at, set: sample(0) }];
  const step = duration / steps;
  for (let k = 1; k <= steps; k++) out.push({ at: round(at + (k - 1) * step), to: sample(k), duration: round(step), ease: 'none' });
  return out;
}
