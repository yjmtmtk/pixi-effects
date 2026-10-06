import { parseEase } from './_ease';
import { warnUnknownOptions } from '../core/options';
import { homeDistance, DEFAULT_FOV, DEG } from '../space/math';
import type { CameraSequenceSpec, Keyframe } from '../types';

const ORBIT_KEYS = ['duration', 'degrees', 'start', 'radius', 'center', 'width', 'height', 'fov', 'ease', 'dollyZoom', 'at', 'name', 'stepsPerSecond'] as const;

export interface OrbitOptions {
  /** Length of the move in seconds. Required, > 0. */
  duration: number;
  /** Total sweep in degrees (negative = the other way). The camera passes straight-ahead (angle 0) in the middle when `start` is left at its default. */
  degrees: number;
  /** Angle the move starts at, in degrees (0 = straight in front of the centre). Default `-degrees / 2`. */
  start?: number;
  /** Distance from the centre. Default: the default camera distance for `height` and `fov` (so `z = 0` is 1:1 at angle 0). */
  radius?: number;
  /** The point to circle around and look at, in composition pixels. Default: the centre of `width` × `height`. */
  center?: [number, number];
  /** Composition size, used for the default `center` and `radius`. Default 1280 × 720. */
  width?: number;
  height?: number;
  /** Vertical field of view, degrees. Default 40. Written to the camera. */
  fov?: number;
  /** Easing of the sweep as a whole (any GSAP ease). Default `'sine.inOut'`. */
  ease?: string;
  /**
   * A dolly zoom while orbiting: `fov` animates from `from` to `to` (degrees) and the radius follows it
   * (`R = (height/2) / tan(fov/2)`), so the `z = 0` plane keeps its size while the perspective changes.
   * Cannot be combined with `radius`. `ease` defaults to the sweep's ease.
   */
  dollyZoom?: { from: number; to: number; ease?: string };
  /** Start time in seconds (composition time, like any layer). */
  at?: number;
  name?: string;
  /** Sampling density. Default one segment per 0.1 s. */
  stepsPerSecond?: number;
}

/**
 * A camera that orbits a point. There is no per-frame expression in the DSL, so the circle is sampled
 * into short linear keyframes (the easing is applied to the angle). Drop the result into `sequences[]`
 * next to `threeD` layers.
 *
 * ```ts
 * orbit({ duration: 6, degrees: 40 })                       // sweep ±20° around the centre
 * orbit({ duration: 4, degrees: 90, start: 0, radius: 900 })
 * ```
 *
 * `z` is specified, so it no longer follows `fov`. For a dolly zoom WHILE orbiting pass
 * `dollyZoom: { from: 38, to: 64 }`: `fov` animates and the radius follows it (`z = (H/2) / tan(fov/2)`),
 * keeping the `z = 0` plane the same size.
 */
export function orbit(opts: OrbitOptions): CameraSequenceSpec {
  warnUnknownOptions('orbit()', opts, ORBIT_KEYS);
  const {
    duration, degrees, width = 1280, height = 720, fov, ease = 'sine.inOut', stepsPerSecond = 10,
  } = opts;
  if (!(duration > 0)) throw new Error(`pixi-effects: orbit duration must be > 0 (got ${duration})`);
  const dolly = opts.dollyZoom;
  if (dolly && opts.radius !== undefined) {
    throw new Error('pixi-effects: orbit() cannot combine `radius` with `dollyZoom` — the radius follows the animated fov');
  }
  const [cx, cy] = opts.center ?? [width / 2, height / 2];
  const fixedR = opts.radius ?? homeDistance(height, fov ?? DEFAULT_FOV);
  const start = opts.start ?? -degrees / 2;
  const steps = Math.max(1, Math.round(duration * stepsPerSecond));
  const easeFn = parseEase(ease);
  const dollyEase = dolly ? parseEase(dolly.ease ?? ease) : null;
  const pos = (i: number): Record<string, number> => {
    const p = i / steps;
    const a = (start + degrees * easeFn(p)) * DEG;
    if (!dolly) return { x: cx + fixedR * Math.sin(a), z: fixedR * Math.cos(a) };
    const f = dolly.from + (dolly.to - dolly.from) * dollyEase!(p);
    const R = homeDistance(height, f);
    return { x: cx + R * Math.sin(a), z: R * Math.cos(a), fov: f };
  };

  const keyframes: Keyframe[] = [];
  for (let i = 0; i < steps; i++) {
    keyframes.push({ at: (duration * i) / steps, to: pos(i + 1), duration: duration / steps, ease: 'none' });
  }
  const p0 = pos(0);
  const spec: CameraSequenceSpec = {
    type: 'camera',
    duration,
    initial: {
      x: p0.x!, y: cy, z: p0.z!, lookAtX: cx, lookAtY: cy, lookAtZ: 0,
      ...(p0.fov !== undefined ? { fov: p0.fov } : fov !== undefined ? { fov } : {}),
    },
    keyframes,
  };
  if (opts.at !== undefined) spec.at = opts.at;
  if (opts.name !== undefined) spec.name = opts.name;
  return spec;
}
