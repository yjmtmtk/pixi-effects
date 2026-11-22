/**
 * The building blocks every voice of `music` shares: the sample rate of the render, a biquad, band-limited saws, envelopes.
 * Moved out of instruments.ts unchanged (the same expressions, so the same samples).
 */

export interface Bus { L: Float32Array; R: Float32Array }
export type Rand = () => number;

/** Per-track knobs an instrument may use. */
export interface VoiceOptions {
  /** Seconds the sound fades in (pad, lead). */
  attack?: number;
  /** Seconds the sound fades out after the written length. */
  release?: number;
  /** Seconds a bell / music box keeps ringing. */
  ring?: number;
  /** The pulse width of `square`, 0.05–0.5 (0.5 is a square wave). */
  width?: number;
  /** Glide: the note starts this many semitones away from its pitch and slides to it in `bendTime` seconds (mono voices only). */
  bend?: number;
  bendTime?: number;
}

export type Voice = (midi: number, dur: number, vel: number, out: Bus, start: number, rnd: Rand, o: VoiceOptions) => void;

export const TAU = Math.PI * 2;
// eslint-disable-next-line import/no-mutable-exports
export let SR = 44100;
/** Only setSampleRate (instruments.ts) calls this: it also clears the voices' tables. */
export function setSR(sr: number): void { SR = sr; }

export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(type: 'lp' | 'hp' | 'bp', fc: number, q = 0.707) { this.set(type, fc, q); }
  /** Change the cutoff without clearing the state (so it can move while a sound plays). */
  set(type: 'lp' | 'hp' | 'bp', fc: number, q = 0.707): void {
    const w = (TAU * Math.min(fc, SR * 0.45)) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    const a0 = 1 + al;
    let b0: number, b1: number, b2: number;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  /** All four memories are so small that anything this filter outputs from silence on rounds to 0 in a Float32Array (below half its smallest number). */
  settled(): boolean {
    return Math.abs(this.x1) < 1e-47 && Math.abs(this.x2) < 1e-47 && Math.abs(this.y1) < 1e-47 && Math.abs(this.y2) < 1e-47;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export const polyblep = (t: number, dt: number): number => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
export const saw = (ph: number, dt: number): number => 2 * ph - 1 - polyblep(ph, dt);
export const adsr = (t: number, dur: number, a: number, d: number, s: number, r: number): number => {
  if (t < dur) return t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : s;
  const base = dur < a ? dur / a : dur < a + d ? 1 - (1 - s) * ((dur - a) / d) : s;
  return Math.max(0, base * (1 - (t - dur) / r));
};

/** The pitch factor of a glide at time t (null when the note does not glide: the voice then runs exactly as it did before glide). */
export function glideOf(o: VoiceOptions): ((t: number) => number) | null {
  const b = o.bend ?? 0, T = o.bendTime ?? 0;
  if (!b || !(T > 0)) return null;
  return t => (t >= T ? 1 : 2 ** ((b * (1 - t / T)) / 12));
}
