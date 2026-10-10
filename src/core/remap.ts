import { gsap } from 'gsap';
import { createTimeline } from './timelineEngine';
import { applyKeyframes } from './Timeline';
import type { Keyframe, KeyframeProps } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * Time remap. A layer's own time is a keyframed property, `time` (seconds of the layer's content: a video's position in the file, a
 * composition's local playhead). `speed` is the same thing as one straight tween. Everything reuses the keyframe pipeline (`at`,
 * `duration`, `ease`, `repeat`, `yoyo`, `from` / `to` / `set`), pointed at a plain clock object instead of a display object.
 */
export interface TimeRemap {
  /** the keyframes that touch `time`, with the key renamed to the clock's property */
  timeKfs: Keyframe[];
  /** the layer's other keyframes (`time` taken out): what goes on the display object, or undefined when none is left */
  restKfs: Keyframe[] | undefined;
  /** `initial` without `time` */
  restInitial: Record<string, unknown> | undefined;
  /** `initial.time` */
  start: number | undefined;
  speed: number | undefined;
}

const BAGS = ['set', 'to', 'from'] as const;

export function timeRemapOf(spec: { initial?: Record<string, unknown>; keyframes?: Keyframe[]; speed?: number }, prop = 'time'): TimeRemap | null {
  const hasInitial = !!spec.initial && 'time' in spec.initial;
  const hasKf = (spec.keyframes ?? []).some(kf => BAGS.some(b => kf[b] && 'time' in kf[b]!));
  const speed = typeof spec.speed === 'number' && Number.isFinite(spec.speed) && spec.speed !== 0 ? spec.speed : undefined;   // a bad speed is warned about by lintRemap and ignored
  if (!hasInitial && !hasKf && speed === undefined) return null;
  const timeKfs: Keyframe[] = [];
  const restKfs: Keyframe[] = [];
  for (const kf of spec.keyframes ?? []) {
    const t: Keyframe = { ...kf }, r: Keyframe = { ...kf };
    let touched = false, left = false;
    for (const b of BAGS) {
      const bag = kf[b] as Record<string, unknown> | undefined;
      if (!bag) { delete t[b]; delete r[b]; continue; }
      const { time, ...others } = bag;
      if ('time' in bag) { touched = true; t[b] = { [prop]: time } as KeyframeProps; } else delete t[b];
      if (Object.keys(others).length) { r[b] = others as KeyframeProps; left = true; } else delete r[b];
    }
    if (touched) timeKfs.push(t);
    if (!touched || left) restKfs.push(r);
  }
  let restInitial = spec.initial;
  let start: number | undefined;
  if (hasInitial) {
    const { time, ...others } = spec.initial!;
    start = typeof time === 'number' && Number.isFinite(time) ? time : undefined;   // a non-number is warned about by lintRemap and ignored
    restInitial = others;
  }
  return { timeKfs, restKfs: restKfs.length ? restKfs : undefined, restInitial, start, speed };
}

/** A negative number is counted back from the end of the content (as `at` is from the end of its layer); stops at the start. Expressions are left alone. */
export function resolveFromEnd(remap: TimeRemap, length: number, prop: string): TimeRemap {
  const fix = (v: unknown): unknown => (typeof v === 'number' && v < 0 ? Math.max(0, length + v) : v);
  const timeKfs = remap.timeKfs.map(kf => {
    const out: Keyframe = { ...kf };
    for (const b of BAGS) {
      const bag = kf[b] as Record<string, unknown> | undefined;
      if (bag && prop in bag) out[b] = { ...bag, [prop]: fix(bag[prop]) } as KeyframeProps;
    }
    return out;
  });
  return { ...remap, timeKfs, start: remap.start === undefined ? undefined : (fix(remap.start) as number) };
}

/** `timeRemapOf` + `resolveFromEnd`: what a layer keeps. A null `length` leaves negative numbers as they are. */
export function remapOf(spec: Parameters<typeof timeRemapOf>[0], prop: string, length: number | null): TimeRemap | null {
  const r = timeRemapOf(spec, prop);
  return r && length !== null ? resolveFromEnd(r, length, prop) : r;
}

/** How much of its own time a remapped composition's children can use: the lifespan, or further when the clock runs ahead of it. Children default to it. */
export function contentLength(remap: TimeRemap, duration: number): number {
  let m = duration;
  if (remap.speed !== undefined) m = Math.max(m, Math.abs(remap.speed) * duration);
  if (remap.start !== undefined) m = Math.max(m, remap.start + (remap.speed ?? 1) * duration);
  for (const kf of remap.timeKfs) {
    for (const b of BAGS) {
      const bag = kf[b] as Record<string, unknown> | undefined;
      const v = bag && Object.values(bag)[0];
      if (typeof v === 'number') m = Math.max(m, v);
    }
  }
  return m;
}

/**
 * Tween `clock[prop]` through the layer's `time` keyframes, or through `speed` when there are none. `duration` is the layer's
 * lifespan; `at` its start on `timeline`. With keyframes, `initial.time` is the value before the first one.
 */
export function bindClock(timeline: Timeline, clock: object, prop: string, remap: TimeRemap, duration: number, at: number, scope: Record<string, number>): void {
  if (remap.timeKfs.length) {
    if (remap.start !== undefined) timeline.set(clock, { [prop]: remap.start }, at);
    applyKeyframes(timeline, clock, remap.timeKfs, duration, scope, [], at);
    return;
  }
  const s = remap.speed ?? 1;
  const from = remap.start ?? (s < 0 ? -s * duration : 0);
  timeline.fromTo(clock, { [prop]: from }, { [prop]: from + s * duration, duration, ease: 'none' }, at);
}

/** The clock as a function of the movie's time, with the range it covers. */
export interface ClockTable { at(t: number): number; min: number; max: number }

/**
 * The clock sampled every millisecond from a throwaway timeline (no scene is touched): what the mixer needs to follow a remap, and
 * the range the clock reaches (for "a layer starts after the clock can reach it"). `to` is the last moment that matters.
 */
export function clockTable(remap: TimeRemap, prop: string, duration: number, at: number, scope: Record<string, number>, to: number): ClockTable {
  const probe = createTimeline({ paused: true });
  const clock: Record<string, number> = { [prop]: remap.start ?? 0 };
  bindClock(probe, clock, prop, remap, duration, at, scope);
  probe.time(probe.duration()); probe.time(0);
  const h = 1 / 1000;
  const n = Math.max(2, Math.ceil(to / h) + 2);
  const tab = new Float64Array(n);
  let min = Infinity, max = -Infinity;
  for (let k = 0; k < n; k++) {
    probe.time(k * h);
    const v = clock[prop]!;
    tab[k] = v;
    const t = k * h;
    if (t >= at && t <= at + duration) { if (v < min) min = v; if (v > max) max = v; }
  }
  probe.kill();
  return {
    at(t: number): number {
      const x = Math.min(Math.max(t / h, 0), n - 1.000001);
      const k = Math.floor(x), f = x - k;
      return tab[k]! * (1 - f) + tab[k + 1]! * f;
    },
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
  };
}
