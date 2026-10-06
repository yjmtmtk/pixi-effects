/**
 * Sample-level building blocks for synthesised sound effects, ported from the generator the owner
 * approved by ear (scripts/sfx/swoosh-candidates.mjs): seeded white noise, a Chamberlin state-variable
 * filter whose centre frequency moves every sample, envelope curves, constant-power pan, 3 ms edge
 * fades. Pure functions over Float32Array: no Web Audio, no DOM, no Math.random — the same input
 * always gives the same samples.
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';
/** A fixed value, or `[from, to]` swept over the voice (exponentially for Hz, linearly for pan). */
export type Range = number | readonly [number, number];

/**
 * Level over a voice, as a function of u = 0…1 (the voice's own progress, so it stretches with the sound):
 * - `bell`: smooth rise until `attack`, then a quadratic fall to 0 (swoosh).
 * - `fall`: linear rise until `attack`, then `(1 − u) ^ power` (clicks, pops, hits, bells).
 * - `swell`: `u ^ power`, cut over the last 3 % (a riser that ends at full level).
 * - `hold`: full level (a beep). Every voice also fades over 3 ms at both ends, so none clicks.
 */
export type Envelope =
  | { shape: 'bell'; attack: number }
  | { shape: 'fall'; attack: number; power: number }
  | { shape: 'swell'; power: number }
  | { shape: 'hold' };

export interface Filter {
  type: 'lowpass' | 'highpass' | 'bandpass';
  /** Cutoff / centre in Hz; a pair sweeps exponentially. */
  freq: Range;
  /** Resonance. Minimum 0.7 (the filter's stable range). */
  q: number;
}

export interface Voice {
  wave: Wave;
  /** Hz; a pair sweeps exponentially. Ignored for `'noise'`. */
  freq?: Range;
  filter?: Filter;
  env: Envelope;
  /** −1 (left) … 1 (right); a pair moves linearly. Default 0 (centre). */
  pan?: Range;
  /** Where in the sound this voice plays, as fractions 0–1 of the sound's length. Default 0 → 1. */
  from?: number;
  to?: number;
  /** Level relative to the other voices of the same sound. */
  gain: number;
}

/** The approved generator's PRNG (a 32-bit LCG): white noise in [-1, 1). Deterministic per seed. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

export const expSweep = (r: Range, u: number): number =>
  typeof r === 'number' ? r : r[0] * Math.pow(r[1] / r[0], u);
export const linSweep = (r: Range, u: number): number =>
  typeof r === 'number' ? r : r[0] + (r[1] - r[0]) * u;
export const smooth = (u: number): number => u * u * (3 - 2 * u);

export function envelope(env: Envelope, u: number): number {
  switch (env.shape) {
    case 'bell': return u < env.attack ? smooth(u / env.attack) : Math.pow(1 - (u - env.attack) / (1 - env.attack), 2);
    case 'fall': return Math.min(1, u / env.attack) * Math.pow(1 - u, env.power);
    case 'swell': return Math.pow(u, env.power) * (u > 0.97 ? (1 - u) / 0.03 : 1);
    case 'hold': return 1;
  }
}

/**
 * Chamberlin state-variable filter, exactly as in the approved generator while the cutoff stays below
 * sampleRate / 6. Above that the plain form blows up, so a voice whose sweep goes higher runs it twice
 * per sample (2× oversampling, cutoff capped at 0.3 × sampleRate), which is stable for q ≥ 0.7.
 */
export class Svf {
  private low = 0;
  private band = 0;
  private readonly q: number;
  constructor(private readonly type: Filter['type'], q: number, private readonly sampleRate: number, private readonly oversample: 1 | 2) {
    this.q = 1 / Math.max(0.7, q);
  }

  /** Whether a filter sweeping over `freq` needs the oversampled form at this rate. */
  static needsOversampling(freq: Range, sampleRate: number): boolean {
    const top = typeof freq === 'number' ? freq : Math.max(freq[0], freq[1]);
    return top > sampleRate / 6;
  }

  process(x: number, fc: number): number {
    if (this.oversample === 1) {
      const f = 2 * Math.sin((Math.PI * Math.min(fc, this.sampleRate * 0.45)) / this.sampleRate);
      return this.step(x, f);
    }
    const f = 2 * Math.sin((Math.PI * Math.min(fc, this.sampleRate * 0.3)) / (2 * this.sampleRate));
    this.step(x, f);
    return this.step(x, f);
  }

  private step(x: number, f: number): number {
    this.low += f * this.band;
    const high = x - this.low - this.q * this.band;
    this.band += f * high;
    return this.type === 'highpass' ? high : this.type === 'lowpass' ? this.low : this.band;
  }
}

function polyBlep(t: number, dt: number): number {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** One sample of a periodic `wave` at `phase` (0–1). `dt` = frequency / sampleRate (band-limits saw / square). */
export function oscillator(wave: Exclude<Wave, 'noise'>, phase: number, dt: number): number {
  switch (wave) {
    case 'sine': return Math.sin(2 * Math.PI * phase);
    case 'triangle': return 1 - 4 * Math.abs(phase - 0.5);
    case 'saw': return 2 * phase - 1 - polyBlep(phase, dt);
    case 'square': return (phase < 0.5 ? 1 : -1) + polyBlep(phase, dt) - polyBlep((phase + 0.5) % 1, dt);
  }
}

/** Seconds of linear fade at both ends of every voice (as in the approved generator). */
export const EDGE_FADE = 0.003;

/** Add one voice into the stereo pair `left` / `right` (the whole sound). `noise` is this voice's own generator. */
export function renderVoice(left: Float32Array, right: Float32Array, v: Voice, sampleRate: number, noise: () => number): void {
  const n = left.length;
  const i0 = Math.max(0, Math.min(n, Math.round((v.from ?? 0) * n)));
  const i1 = Math.max(i0, Math.min(n, Math.round((v.to ?? 1) * n)));
  const span = i1 - i0;
  if (span < 2) return;
  const filter = v.filter
    ? new Svf(v.filter.type, v.filter.q, sampleRate, Svf.needsOversampling(v.filter.freq, sampleRate) ? 2 : 1)
    : null;
  const fade = Math.max(1, Math.min(Math.round(EDGE_FADE * sampleRate), Math.floor(span / 2)));
  let phase = 0;
  for (let j = 0; j < span; j++) {
    const u = j / (span - 1);
    let x: number;
    if (v.wave === 'noise') {
      x = noise();
    } else {
      const dt = Math.min(expSweep(v.freq ?? 440, u), 0.45 * sampleRate) / sampleRate;
      x = oscillator(v.wave, phase, dt);
      phase += dt;
      if (phase >= 1) phase -= Math.floor(phase);
    }
    if (filter) x = filter.process(x, expSweep(v.filter!.freq, u));
    x *= envelope(v.env, u) * v.gain;
    if (j < fade) x *= j / fade;
    if (span - 1 - j < fade) x *= (span - 1 - j) / fade;
    const a = ((linSweep(v.pan ?? 0, u) + 1) * Math.PI) / 4;     // constant-power pan
    left[i0 + j] += x * Math.cos(a);
    right[i0 + j] += x * Math.sin(a);
  }
}

/**
 * Brightness as a tilt around 1.5 kHz: `out = low + (1 + b) × (x − low)`, `b` in [-1, 1]. −1 keeps only the
 * lows (dark, muffled), +1 doubles the highs (bright, crisp). In place; callers skip `b = 0` (so the default is exact).
 */
export function tilt(channel: Float32Array, b: number, sampleRate: number): void {
  const a = 1 - Math.exp((-2 * Math.PI * 1500) / sampleRate);
  let low = 0;
  for (let i = 0; i < channel.length; i++) {
    const x = channel[i]!;
    low += a * (x - low);
    channel[i] = low + (1 + b) * (x - low);
  }
  // the filter's memory would leave the last sample off zero: fade the end again
  const fade = Math.min(Math.round(EDGE_FADE * sampleRate), channel.length);
  for (let k = 0; k < fade; k++) channel[channel.length - 1 - k] = channel[channel.length - 1 - k]! * (k / fade);
}
