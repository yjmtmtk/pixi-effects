import type { Keyframe } from '../types';
import { warnUnknownOptions } from '../core/options';
import { parseEase } from './_ease';

const KEYS = ['points', 'at', 'duration', 'ease', 'look', 'lookAhead', 'smooth', 'from', 'to', 'frameRate'] as const;
const MAX_STEPS = 4000;
const PER_SPAN = 48;                                                 // samples per span of the curve, for the arc-length table

type P3 = [number, number, number];

export interface CameraPathOptions {
  /** The route: `[x, y, z]` points the camera passes, in order (at least two). */
  points: Array<[number, number, number]>;
  /** Start, in seconds from the start of the camera layer. Default 0. */
  at?: number;
  /** How long the flight takes, in seconds. Required. */
  duration: number;
  /** GSAP ease for the progress along the route (default `'none'`: constant speed; `'power2.in'` is an accelerating rush). */
  ease?: string;
  /** Where the camera looks: a fixed `[x, y, z]`, or `'ahead'` (default): a point further along the route, so it faces where it flies. */
  look?: [number, number, number] | 'ahead';
  /** With `look: 'ahead'`: how far ahead, as a fraction 0–1 of the route's length (default 0.08). Past the end it continues along the last direction. */
  lookAhead?: number;
  /** `true` (default): a smooth curve through the points (Catmull-Rom). `false`: straight lines between them. */
  smooth?: boolean;
  /** Where on the route to start and stop, as fractions 0–1 of its length (default 0 → 1). `from: 1, to: 0` flies it backwards. */
  from?: number;
  to?: number;
  /** Samples per second: set it to your movie's `frameRate`. Default 30. */
  frameRate?: number;
}

/**
 * A camera flight as keyframes for `x`, `y`, `z`, `lookAtX`, `lookAtY` and `lookAtZ`: put the result in a camera layer's `keyframes`.
 * The route is walked by arc length (an even speed whatever the curve; an `ease` shapes it) and sampled once per frame as short
 * straight steps, so the camera is exactly on the route at every rendered frame when `frameRate` matches the movie's.
 *
 * ```js
 * { type: 'camera', keyframes: cameraPath({ points: [[640, 360, 2400], [700, 340, 900], [640, 360, -1500]], duration: 8, ease: 'power2.in', frameRate: 30 }) }
 * ```
 */
export function cameraPath(opts: CameraPathOptions): Keyframe[] {
  warnUnknownOptions('cameraPath()', opts, KEYS);
  const { points, at = 0, duration, ease = 'none', look = 'ahead', lookAhead = 0.08, smooth = true, from = 0, to = 1, frameRate = 30 } = opts;
  if (!Array.isArray(points) || points.length < 2) throw new Error('cameraPath(): points needs at least two points: [[x, y, z], [x, y, z], …]');
  points.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw new Error(`cameraPath(): points[${i}] must be [x, y, z] numbers, got ${JSON.stringify(p)}`);
  });
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`cameraPath(): duration must be a positive number of seconds, got ${duration}`);
  if (!(Number.isFinite(frameRate) && frameRate > 0)) throw new Error(`cameraPath(): frameRate must be a positive number (samples per second), got ${frameRate}`);
  if (look !== 'ahead' && !(Array.isArray(look) && look.length === 3 && look.every(Number.isFinite))) throw new Error(`cameraPath(): look must be 'ahead' or [x, y, z] numbers, got ${JSON.stringify(look)}`);
  if (!(Number.isFinite(lookAhead) && lookAhead >= 0 && lookAhead <= 1)) throw new Error(`cameraPath(): lookAhead must be a fraction of the route between 0 and 1, got ${lookAhead}`);
  for (const [n, v] of [['from', from], ['to', to]] as const) {
    if (!(Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error(`cameraPath(): ${n} must be a fraction of the route between 0 and 1, got ${v}`);
  }
  const steps = Math.max(1, Math.round(duration * frameRate));
  if (steps > MAX_STEPS) throw new Error(`cameraPath(): ${steps} samples is too many (max ${MAX_STEPS}); lower frameRate or duration`);

  // the route as a dense polyline with its cumulative length (the curve is sampled once; the walk is by arc length)
  const curve: P3[] = [];
  if (smooth && points.length > 2) {
    const pts = points as P3[];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(i + 2, pts.length - 1)]!;
      for (let s = 0; s < PER_SPAN; s++) curve.push(catmullRom(p0, p1, p2, p3, s / PER_SPAN));
    }
    curve.push(pts[pts.length - 1]!);
  } else curve.push(...(points as P3[]));
  const cum = [0];
  for (let i = 1; i < curve.length; i++) cum.push(cum[i - 1]! + dist(curve[i - 1]!, curve[i]!));
  const total = cum[cum.length - 1]!;
  if (!(total > 0)) throw new Error('cameraPath(): the route has no length (the points are all the same)');

  const find = (s: number): number => {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid]! <= s) lo = mid; else hi = mid; }
    return lo;
  };
  const along = (fraction: number): P3 => {
    const s = fraction * total;
    if (s >= total) {                                                  // past the end: carry on in the last direction
      const a = curve[curve.length - 2]!, b = curve[curve.length - 1]!, len = dist(a, b) || 1, extra = s - total;
      return [b[0] + ((b[0] - a[0]) / len) * extra, b[1] + ((b[1] - a[1]) / len) * extra, b[2] + ((b[2] - a[2]) / len) * extra];
    }
    const i = find(Math.max(s, 0)), span = cum[i + 1]! - cum[i]!, t = span > 0 ? (s - cum[i]!) / span : 0;
    const a = curve[i]!, b = curve[i + 1]!;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  const shape = parseEase(ease);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const sample = (k: number): Record<string, number> => {
    const p = from + (to - from) * shape(k / steps);
    const pos = along(Math.min(Math.max(p, 0), 1));
    const target = look === 'ahead' ? along(Math.max(p + (to >= from ? lookAhead : -lookAhead), 0)) : look;
    return { x: round(pos[0]), y: round(pos[1]), z: round(pos[2]), lookAtX: round(target[0]), lookAtY: round(target[1]), lookAtZ: round(target[2]) };
  };

  const out: Keyframe[] = [{ at, set: sample(0) }];
  const step = duration / steps;
  for (let k = 1; k <= steps; k++) out.push({ at: round(at + (k - 1) * step), to: sample(k), duration: round(step), ease: 'none' });
  return out;
}

const dist = (a: P3, b: P3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

function catmullRom(p0: P3, p1: P3, p2: P3, p3: P3, t: number): P3 {
  const t2 = t * t, t3 = t2 * t;
  const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (3 * b - a - 3 * d + e) * t3);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])];
}
