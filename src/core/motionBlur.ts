import { warnUnknownOptions } from './options';

export interface MotionBlurOptions {
  /** How many moments one frame is drawn at before they are averaged (2–64). More is smoother and slower. Default 8. */
  samples?: number;
  /** How long the shutter is open, as a fraction of the frame time (0–1]. `0.5` is a 180° shutter (the film look). Default 0.5. */
  shutter?: number;
}

/** `true` (8 samples, 180° shutter), a sample count, or `{ samples, shutter }`; `false` is off. */
export type MotionBlurSpec = boolean | number | MotionBlurOptions;

export interface ResolvedMotionBlur { samples: number; shutter: number }

const DEFAULTS: ResolvedMotionBlur = { samples: 8, shutter: 0.5 };

/** A motion blur setting as `{ samples, shutter }`, or null for off. Says which option is wrong. */
export function resolveMotionBlur(spec: MotionBlurSpec | null | undefined, where: string): ResolvedMotionBlur | null {
  if (spec === undefined || spec === null || spec === false) return null;
  const o: MotionBlurOptions = spec === true ? {} : typeof spec === 'number' ? { samples: spec } : spec;
  if (typeof spec === 'object') warnUnknownOptions(`${where} motionBlur`, o, ['samples', 'shutter']);
  const samples = o.samples ?? DEFAULTS.samples, shutter = o.shutter ?? DEFAULTS.shutter;
  if (!(Number.isInteger(samples) && samples >= 2 && samples <= 64)) throw new Error(`pixi-effects: ${where}: motionBlur samples must be a whole number from 2 to 64, got ${samples}`);
  if (!(Number.isFinite(shutter) && shutter > 0 && shutter <= 1)) throw new Error(`pixi-effects: ${where}: motionBlur shutter must be a fraction of the frame time above 0 and up to 1 (0.5 is a 180° shutter), got ${shutter}`);
  return { samples, shutter };
}

/** The moments (seconds) frame `frame` is exposed over: the middles of `samples` equal slices of the shutter interval, centred on the frame time, kept inside the movie. */
export function blurTimes(frame: number, frameRate: number, mb: ResolvedMotionBlur, duration: number): number[] {
  const t = frame / frameRate, width = mb.shutter / frameRate;
  return Array.from({ length: mb.samples }, (_, k) => Math.min(Math.max(t + ((k + 0.5) / mb.samples - 0.5) * width, 0), duration));
}
