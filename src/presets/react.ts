import type { Keyframe } from '../types';
import type { AudioEnvelope } from '../audio/envelope';
import { warnUnknownOptions } from '../core/options';

const KEYS = ['at', 'duration', 'props', 'audioOffset', 'loop', 'frameRate'] as const;
const PROP_KEYS = ['base', 'amount', 'band', 'beats', 'decay', 'attack', 'release', 'invert', 'curve'] as const;
const MAX_STEPS = 4000;

export interface ReactProp {
  /** The value at rest (a level of 0). Default 0. */
  base?: number;
  /** How far the value goes at a level of 1 (can be negative). Required. */
  amount: number;
  /** Which series of the envelope drives it: `'level'` (default) or a band (`'bass'`, `'mid'`, `'treble'`, or your own). */
  band?: string;
  /** Follow the beats instead: a jump to full on each beat, falling off after it (see `decay`). */
  beats?: boolean;
  /** With `beats`: seconds for the pulse to fall to 37 %. Default 0.2. */
  decay?: number;
  /** Smoothing, in seconds, for a level that rises (`attack`) and falls (`release`), like a level meter: a quick rise and a slow fall looks like a bounce. Default none. */
  attack?: number;
  release?: number;
  /** Use 1 − level (it gets smaller as the sound gets louder). */
  invert?: boolean;
  /** Raise the level to this power first: above 1 only the loud parts move it (a punchier look), below 1 even the quiet ones do. Default 1. */
  curve?: number;
}

export interface ReactOptions {
  /** Start, in seconds from the start of the layer. Default 0. */
  at?: number;
  /** How long it follows the sound, in seconds. Required. */
  duration: number;
  /** The properties to move and how, each its own way: `{ scale: { base: 1, amount: 0.3, band: 'bass' }, alpha: { base: 0.3, amount: 0.7 } }`. */
  props: Record<string, ReactProp>;
  /** Where in the sound the layer's start is, in seconds (the layer starts 2 s after the music began: `audioOffset: 2`). Default 0. */
  audioOffset?: number;
  /** The sound repeats (a looping music layer) instead of the last value being held. */
  loop?: boolean;
  /** Samples per second (default: the envelope's, so one per video frame). Lower it for a long layer, the steps get longer. */
  frameRate?: number;
}

/**
 * Keyframes that follow a sound: `base + amount × level` sampled once per frame from an envelope (`audioEnvelope()` for a real file,
 * `bpmEnvelope()` for a tempo), so playback, seeking and export all agree. Put the result in a layer's `keyframes`.
 *
 * ```js
 * const env = await audioEnvelope('music.mp3', { frameRate: 30 });
 * { type: 'shape', shape: 'circle', radius: 120, initial: { x: 640, y: 360 },
 *   keyframes: react(env, { duration: 12, props: { scale: { base: 1, amount: 0.4, band: 'bass', attack: 0.02, release: 0.2 } } }) }
 * ```
 */
export function react(env: AudioEnvelope, options: ReactOptions): Keyframe[] {
  warnUnknownOptions('react()', options, KEYS);
  const { at = 0, duration, props, audioOffset = 0, loop = false } = options;
  const frameRate = options.frameRate ?? env.frameRate;
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`react(): duration must be a positive number of seconds, got ${duration}`);
  if (!(Number.isFinite(frameRate) && frameRate > 0)) throw new Error(`react(): frameRate must be a positive number, got ${frameRate}`);
  const names = Object.keys(props ?? {});
  if (names.length === 0) throw new Error('react(): props is empty; name at least one property, e.g. props: { scale: { base: 1, amount: 0.3 } }');
  for (const n of names) {
    const p = props[n]!;
    warnUnknownOptions(`react() props.${n}`, p, PROP_KEYS);
    if (!Number.isFinite(p.amount)) throw new Error(`react(): props.${n}.amount must be a number, got ${p.amount}`);
    if (!p.beats && p.band !== undefined && !env.series[p.band]) throw new Error(`react(): props.${n}: band "${p.band}" is not in this envelope (it has: ${Object.keys(env.series).join(', ')})`);
    if (p.beats && !(p.decay === undefined || (Number.isFinite(p.decay) && p.decay > 0))) throw new Error(`react(): props.${n}.decay must be a positive number of seconds, got ${p.decay}`);
  }
  const steps = Math.max(1, Math.round(duration * frameRate));
  if (steps > MAX_STEPS) throw new Error(`react(): too many keyframes (${steps} steps, max ${MAX_STEPS}); lower frameRate (now ${frameRate}) or duration`);

  const wrap = (a: number): number => (loop && env.duration > 0 ? ((a % env.duration) + env.duration) % env.duration : a);
  const beatPulse = (a: number, decay: number): number => {
    const beats = env.beats;
    let lo = 0, hi = beats.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (beats[mid]! <= a + 1e-9) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    if (found < 0) return 0;
    return Math.exp(-(a - beats[found]!) / decay);
  };

  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const state: Record<string, number> = {};
  const values = (k: number): Record<string, number> => {
    const t = k / frameRate, a = wrap(audioOffset + t);
    const out: Record<string, number> = {};
    for (const n of names) {
      const p = props[n]!;
      let x = p.beats ? beatPulse(a, p.decay ?? 0.2) : env.at(a, p.band ?? 'level');
      if (p.invert) x = 1 - x;
      const prev = state[n];
      if (prev !== undefined && (p.attack || p.release)) {
        const tau = x > prev ? p.attack ?? 0 : p.release ?? 0;
        if (tau > 0) x = prev + (x - prev) * (1 - Math.exp(-(1 / frameRate) / tau));
      }
      state[n] = x;
      const shaped = p.curve && p.curve !== 1 ? Math.pow(Math.max(0, x), p.curve) : x;
      out[n] = round((p.base ?? 0) + p.amount * shaped);
    }
    return out;
  };

  const out: Keyframe[] = [{ at, set: values(0) }];
  const step = duration / steps;
  for (let k = 1; k <= steps; k++) out.push({ at: round6(at + (k - 1) * step), to: values(k), duration: round6(step), ease: 'none' });
  return out;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
