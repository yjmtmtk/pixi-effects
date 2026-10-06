import { parseEase } from './_ease';
import { homeDistance, DEFAULT_FOV, DEG } from '../space/math';
import type { CameraSequenceSpec, Keyframe } from '../types';

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
 * `z` is specified, so it no longer follows `fov`; to add a dolly zoom on top of an orbit, write your
 * own `fov` and `z = (H/2) / tan(fov/2)` keyframes.
 */
export function orbit(opts: OrbitOptions): CameraSequenceSpec {
  const {
    duration, degrees, width = 1280, height = 720, fov, ease = 'sine.inOut', stepsPerSecond = 10,
  } = opts;
  if (!(duration > 0)) throw new Error(`pixi-effects: orbit duration must be > 0 (got ${duration})`);
  const [cx, cy] = opts.center ?? [width / 2, height / 2];
  const R = opts.radius ?? homeDistance(height, fov ?? DEFAULT_FOV);
  const start = opts.start ?? -degrees / 2;
  const steps = Math.max(1, Math.round(duration * stepsPerSecond));
  const easeFn = parseEase(ease);
  const pos = (i: number) => {
    const a = (start + degrees * easeFn(i / steps)) * DEG;
    return { x: cx + R * Math.sin(a), z: R * Math.cos(a) };
  };

  const keyframes: Keyframe[] = [];
  for (let i = 0; i < steps; i++) {
    keyframes.push({ at: (duration * i) / steps, to: pos(i + 1), duration: duration / steps, ease: 'none' });
  }
  const p0 = pos(0);
  const spec: CameraSequenceSpec = {
    type: 'camera',
    duration,
    initial: { x: p0.x, y: cy, z: p0.z, lookAtX: cx, lookAtY: cy, lookAtZ: 0, ...(fov !== undefined ? { fov } : {}) },
    keyframes,
  };
  if (opts.at !== undefined) spec.at = opts.at;
  if (opts.name !== undefined) spec.name = opts.name;
  return spec;
}
