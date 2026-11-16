import { parseEase } from './_ease';
import { warnUnknownOptions } from '../core/options';
import { DEFAULT_FOV, DEG } from '../space/math';
import type { CameraLayerSpec, Keyframe } from '../types';

const ORBIT_KEYS = ['duration', 'degrees', 'startAngle', 'radius', 'center', 'fov', 'ease', 'dollyZoom', 'at', 'name', 'samplesPerSecond'] as const;

export interface OrbitOptions {
  /** Length of the move in seconds. Required, > 0. */
  duration: number;
  /** Total sweep in degrees (negative = the other way). The camera passes straight-ahead (angle 0) in the middle when `startAngle` is left at its default. */
  degrees: number;
  /** Angle the move starts at, in degrees (0 = straight in front of the centre). Default `-degrees / 2`. */
  startAngle?: number;
  /** Distance from the centre. Default: the default camera distance for the movie's height and `fov` (so `z = 0` is 1:1 at angle 0). */
  radius?: number;
  /** The point to circle around and look at, in composition pixels. Default: the middle of the movie (`W/2`, `H/2`). */
  center?: [number, number];
  /** Vertical field of view, degrees. Default 40. Written to the camera. */
  fov?: number;
  /** Easing of the sweep as a whole (any ease name). Default `'sine.inOut'`. */
  ease?: string;
  /**
   * A dolly zoom while orbiting: `fov` animates from `from` to `to` (degrees) and the radius follows it
   * (`R = (height/2) / tan(fov/2)`), so the `z = 0` plane keeps its size while the perspective changes.
   * Cannot be combined with `radius`. `ease` defaults to the sweep's ease.
   */
  dollyZoom?: { from: number; to: number; ease?: string };
  /** Start time in seconds (composition time, like any layer). */
  at?: number | import('../types').Moment;
  name?: string;
  /** Sampling density. Default one segment per 0.1 s. */
  samplesPerSecond?: number;
}

/**
 * A camera that orbits a point. There is no per-frame expression in the DSL, so the circle is sampled
 * into short linear keyframes (the easing is applied to the angle). Drop the result into `sequences[]`
 * next to `threeD` layers.
 *
 * ```ts
 * orbit({ duration: 6, degrees: 40 })                       // sweep ±20° around the centre
 * orbit({ duration: 4, degrees: 90, startAngle: 0, radius: 900 })
 * ```
 *
 * `z` is specified, so it no longer follows `fov`. For a dolly zoom WHILE orbiting pass
 * `dollyZoom: { from: 38, to: 64 }`: `fov` animates and the radius follows it (`z = (H/2) / tan(fov/2)`),
 * keeping the `z = 0` plane the same size.
 */
export function orbit(opts: OrbitOptions): CameraLayerSpec {
  warnUnknownOptions('orbit()', opts, ORBIT_KEYS);
  const {
    duration, degrees, fov, ease = 'sine.inOut', samplesPerSecond = 10,
  } = opts;
  if (!(duration > 0)) throw new Error(`pixi-effects: orbit duration must be > 0 (got ${duration})`);
  const dolly = opts.dollyZoom;
  if (dolly && opts.radius !== undefined) {
    throw new Error('pixi-effects: orbit() cannot combine `radius` with `dollyZoom` — the radius follows the animated fov');
  }
  // the centre and the default radius follow the movie's size (W, H in the camera's expressions), so a 1920 × 1080 movie orbits its own middle
  const centre = opts.center;
  const cx: number | string = centre ? centre[0] : 'W/2', cy: number | string = centre ? centre[1] : 'H/2';
  const fixedR = opts.radius;
  const start = opts.startAngle ?? -degrees / 2;
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  /** cx + R·u, where R is `radius` or the camera's home distance for this fov: H / (2 tan(fov/2)) */
  const along = (base: number | string, u: number, f: number): number | string => {
    if (fixedR !== undefined) return typeof base === 'number' ? r6(base + fixedR * u) : `${base} + ${r6(fixedR * u)}`;
    const k = Number((u / (2 * Math.tan((f * DEG) / 2))).toPrecision(12));
    return typeof base === 'number' ? (base === 0 ? `H*${k}` : `${base} + H*${k}`) : `${base} + H*${k}`;
  };
  const steps = Math.max(1, Math.round(duration * samplesPerSecond));
  const easeFn = parseEase(ease);
  const dollyEase = dolly ? parseEase(dolly.ease ?? ease) : null;
  const pos = (i: number): Record<string, number | string> => {
    const p = i / steps;
    const a = (start + degrees * easeFn(p)) * DEG;
    const f = dolly ? dolly.from + (dolly.to - dolly.from) * dollyEase!(p) : fov ?? DEFAULT_FOV;
    return { x: along(cx, Math.sin(a), f), z: along(0, Math.cos(a), f), ...(dolly ? { fov: r6(f) } : {}) };
  };

  const keyframes: Keyframe[] = [];
  for (let i = 0; i < steps; i++) {
    keyframes.push({ at: (duration * i) / steps, to: pos(i + 1), duration: duration / steps, ease: 'none' });
  }
  const p0 = pos(0);
  const spec: CameraLayerSpec = {
    type: 'camera',
    duration,
    initial: {
      x: p0.x!, y: cy, z: p0.z!, lookAtX: cx, lookAtY: cy, lookAtZ: 0,
      ...(p0.fov !== undefined ? { fov: p0.fov as number } : fov !== undefined ? { fov } : {}),
    },
    keyframes,
  };
  if (opts.at !== undefined) spec.at = opts.at;
  if (opts.name !== undefined) spec.name = opts.name;
  return spec;
}
