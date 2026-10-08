import { gsap } from 'gsap';
import { applyKeyframes } from './Timeline';
import type { Keyframe, KeyframeProps } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * SPIKE: time remap. A layer's own time can be a keyframed property, `time` (seconds of the layer's content: a video's source position,
 * a composition's local playhead). `speed` is sugar for one straight tween of it. Everything reuses the keyframe pipeline (`at`, `duration`,
 * `ease`, `repeat`, `yoyo`, `from` / `to` / `set`), pointed at a plain clock object instead of a display object.
 */
export interface TimeRemap {
  /** keyframes that only touch `time` (the key is renamed to `prop`) */
  timeKfs: Keyframe[];
  /** the layer's other keyframes, with `time` taken out */
  restKfs: Keyframe[] | undefined;
  restInitial: Record<string, unknown> | undefined;
  /** `initial.time` */
  start: number | undefined;
  speed: number | undefined;
}

const BAGS = ['set', 'to', 'from'] as const;

export function timeRemapOf(spec: { initial?: Record<string, unknown>; keyframes?: Keyframe[]; speed?: number }, prop = 'time'): TimeRemap | null {
  const hasInitial = !!spec.initial && 'time' in spec.initial;
  const hasKf = (spec.keyframes ?? []).some(kf => BAGS.some(b => kf[b] && 'time' in kf[b]!));
  if (!hasInitial && !hasKf && spec.speed === undefined) return null;
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
    start = Number(time);
    restInitial = others;
  }
  return { timeKfs, restKfs: restKfs.length ? restKfs : undefined, restInitial, start, speed: spec.speed };
}

/**
 * Tween `target[prop]` (a clock) through the layer's `time` keyframes, or through `speed` when there are none.
 * `duration` is the layer's lifespan; `at` its start on `timeline`.
 */
export function bindClock(timeline: Timeline, clock: object, prop: string, remap: TimeRemap, duration: number, at: number, scope: Record<string, number>): void {
  if (remap.timeKfs.length) {
    applyKeyframes(timeline, clock, remap.timeKfs, duration, scope, [], at);
    return;
  }
  const s = remap.speed ?? 1;
  const from = remap.start ?? (s < 0 ? -s * duration : 0);
  timeline.fromTo(clock, { [prop]: from }, { [prop]: from + s * duration, duration, ease: 'none' }, at);
}

/** The mistakes a remap can make, said once when the layer is built. */
export function lintRemap(spec: { type: string; name?: string; initial?: Record<string, unknown>; keyframes?: Keyframe[]; speed?: number }, warn: (m: string) => void): void {
  const who = spec.name ? `layer "${spec.name}"` : `unnamed ${spec.type} layer`;
  const remappable = spec.type === 'video' || spec.type === 'composition' || spec.type === 'audio';
  const keyed = (spec.keyframes ?? []).some(kf => BAGS.some(b => kf[b] && 'time' in kf[b]!));
  const initial = !!spec.initial && 'time' in spec.initial;
  if (!remappable && (keyed || initial || spec.speed !== undefined)) {
    warn(`pixi-effects: ${who}: "${keyed || initial ? 'time' : 'speed'}" only works on video, audio and composition layers; put this layer in a composition and remap that (it is ignored here)`);
  }
  if (!remappable) return;
  if (spec.speed !== undefined && (!Number.isFinite(spec.speed) || spec.speed === 0)) {
    warn(`pixi-effects: ${who}: speed ${String(spec.speed)} cannot be used: use a number other than 0 (negative plays backward); to hold a moment key \`time\` to the same value twice`);
  }
  if (spec.speed !== undefined && keyed) {
    warn(`pixi-effects: ${who}: speed and keyframed \`time\` are both set; \`time\` wins and speed is ignored. Use one of them`);
  }
  for (const [i, kf] of (spec.keyframes ?? []).entries()) {
    if (BAGS.some(b => kf[b] && 'time' in kf[b]!) && kf.set && (kf.set as Record<string, unknown>).time !== undefined && Object.keys(kf.set).length === 1 && !kf.to && !kf.from) {
      continue;
    }
    for (const b of BAGS) {
      const v = (kf[b] as Record<string, unknown> | undefined)?.time;
      if (v !== undefined && typeof v !== 'number') warn(`pixi-effects: ${who}: keyframes[${i}].${b}.time must be a number of seconds, got ${JSON.stringify(v)}`);
    }
  }
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
 * The clock as a function of the parent's time, sampled every millisecond from a throwaway timeline (no scene is touched): what the mixer
 * needs to follow a remap. `to` is the last moment that matters.
 */
export function clockTable(remap: TimeRemap, prop: string, duration: number, at: number, scope: Record<string, number>, to: number): (t: number) => number {
  const probe = gsap.timeline({ paused: true });
  const clock: Record<string, number> = { [prop]: remap.start ?? 0 };
  bindClock(probe, clock, prop, remap, duration, at, scope);
  probe.time(probe.duration()); probe.time(0);
  const h = 1 / 1000;
  const n = Math.max(2, Math.ceil(to / h) + 2);
  const tab = new Float64Array(n);
  for (let k = 0; k < n; k++) { probe.time(k * h); tab[k] = clock[prop]!; }
  probe.kill();
  return (t: number) => {
    const x = Math.min(Math.max(t / h, 0), n - 1.000001);
    const k = Math.floor(x), f = x - k;
    return tab[k]! * (1 - f) + tab[k + 1]! * f;
  };
}
