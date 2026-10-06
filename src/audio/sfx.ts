import { lcg, renderVoice, tilt, type Envelope, type Filter, type Range, type Voice } from './dsp';
import { PRESETS, SFX_PRESETS } from './presets';
import { suggestName, warnUnknownOptions } from '../core/options';
import type { SfxPreset, SfxVoice } from '../types';

export { SFX_PRESETS };

/** Peak of a sound at `volume: 1` (−12 dBFS), so several sounds can overlap before the mix has to limit. */
export const SFX_PEAK = 0.25;
export const MIN_LENGTH = 0.02;
export const MAX_LENGTH = 10;
export const MAX_PITCH = 24;
export const MAX_VOICES = 16;
/** Length of a custom (`voices`) sound when the layer gives no `duration`. */
export const CUSTOM_LENGTH = 0.5;

/** A validated sound: everything renderSfx needs. Same value ⇒ same samples (at a given sample rate). */
export interface ResolvedSfx {
  /** A preset, or null for a custom sound (then `voices` is set). */
  preset: SfxPreset | null;
  voices?: Voice[];
  pitch: number;
  brightness: number;
  seed: number;
  /** Seconds. */
  length: number;
}

const OPTION_KEYS = ['preset', 'voices', 'pitch', 'brightness', 'seed'] as const;
const VOICE_KEYS = ['wave', 'freq', 'filter', 'envelope', 'pan', 'from', 'to', 'gain'] as const;
const WAVES = ['sine', 'triangle', 'square', 'saw', 'noise'] as const;
const FILTERS = ['lowpass', 'highpass', 'bandpass'] as const;
const ENVELOPES: Record<NonNullable<SfxVoice['envelope']>, Envelope> = {
  fall: { shape: 'fall', attack: 0.02, power: 3 },
  bell: { shape: 'bell', attack: 0.3 },
  swell: { shape: 'swell', power: 2 },
  hold: { shape: 'hold' },
};
/** Layer fields an author may put inside `sfx` by mistake. */
const LAYER_KEYS = ['duration', 'length', 'volume', 'at', 'loop'];

/** Words authors reach for, mapped to the preset that makes that sound. */
const SFX_ALIASES: Record<string, SfxPreset> = {
  whoosh: 'swoosh', swish: 'swoosh', woosh: 'swoosh', transition: 'swoosh', flick: 'swipe',
  ding: 'chime', bell: 'chime', success: 'chime',
  impact: 'hit', thud: 'hit', boom: 'hit', slam: 'hit', kick: 'hit',
  tick: 'click', tap: 'click', ui: 'click',
  blip: 'beep', alert: 'beep', countdown: 'beep',
  key: 'typewriter', keystroke: 'typewriter', typing: 'typewriter', type: 'typewriter',
  rise: 'riser', uplifter: 'riser', build: 'riser',
  sparkle: 'coin', collect: 'coin', reward: 'coin',
  static: 'glitch', error: 'glitch', bubble: 'pop',
};
/** Other words authors reach for (option, wave, filter and envelope names). */
const WORD_ALIASES: Record<string, string> = {
  waveform: 'wave', frequency: 'freq', hz: 'freq', env: 'envelope', volume: 'gain', level: 'gain',
  bright: 'brightness', tone: 'brightness', semitones: 'pitch', sawtooth: 'saw', white: 'noise',
  lp: 'lowpass', hp: 'highpass', bp: 'bandpass', decay: 'fall', fade: 'fall', attack: 'bell', rise: 'swell', sustain: 'hold',
};

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);

const guess = (name: string, valid: readonly string[]): string | null => {
  const alias = WORD_ALIASES[name.toLowerCase()];
  return alias && valid.includes(alias) ? alias : suggestName(name, valid);
};
const didYouMean = (g: string | null) => (g ? ` — did you mean "${g}"?` : '');
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function sfxDefaultLength(preset: SfxPreset): number {
  return PRESETS[preset].length;
}

/** A number or a `[from, to]` pair, clamped to [lo, hi]; anything else → `fallback`, with a warning. */
function range(v: unknown, lo: number, hi: number, fallback: Range, what: string, warn: Warn): Range {
  if (v === undefined) return fallback;
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (ok(v)) return clamp(v, lo, hi);
  if (Array.isArray(v) && v.length === 2 && ok(v[0]) && ok(v[1])) return [clamp(v[0], lo, hi), clamp(v[1], lo, hi)];
  warn(`pixi-effects: ${what} must be a number or [from, to] (got ${JSON.stringify(v)}); using ${JSON.stringify(fallback)}`);
  return fallback;
}

/** A custom voice as written by an author → the engine's voice, with every mistake named. Null = skip it. */
function resolveVoice(raw: unknown, where: string, warn: Warn): Voice | null {
  if (!raw || typeof raw !== 'object') {
    warn(`pixi-effects: ${where} must be an object like { wave: 'noise', filter: { type: 'bandpass', freq: [500, 5000] } }. The voice is skipped.`);
    return null;
  }
  const v = raw as Record<string, unknown>;
  warnUnknownOptions(where, v, VOICE_KEYS);
  if (!(WAVES as readonly string[]).includes(String(v.wave))) {
    warn(`pixi-effects: ${where}: unknown wave "${v.wave}"${didYouMean(guess(String(v.wave), WAVES))} (waves: ${WAVES.join(', ')}). The voice is skipped.`);
    return null;
  }
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const out: Voice = {
    wave: v.wave as Voice['wave'],
    freq: range(v.freq, 20, 20000, 440, `${where}.freq`, warn),
    env: ENVELOPES.fall,
    pan: range(v.pan, -1, 1, 0, `${where}.pan`, warn),
    from: clamp(num(v.from, 0), 0, 1),
    to: clamp(num(v.to, 1), 0, 1),
    gain: Math.max(0, num(v.gain, 1)),
  };
  if (v.envelope !== undefined) {
    const e = String(v.envelope);
    if (e in ENVELOPES) out.env = ENVELOPES[e as keyof typeof ENVELOPES];
    else warn(`pixi-effects: ${where}: unknown envelope "${e}"${didYouMean(guess(e, Object.keys(ENVELOPES)))} (envelopes: ${Object.keys(ENVELOPES).join(', ')}); using "fall"`);
  }
  if (v.filter !== undefined) {
    const f = v.filter as Record<string, unknown> | null;
    const t = f && typeof f === 'object' ? String(f.type) : String(f);
    if (!f || typeof f !== 'object' || !(FILTERS as readonly string[]).includes(t)) {
      warn(`pixi-effects: ${where}.filter: unknown type "${t}"${didYouMean(guess(t, FILTERS))} (types: ${FILTERS.join(', ')}). No filter.`);
    } else {
      warnUnknownOptions(`${where}.filter`, f, ['type', 'freq', 'q']);
      out.filter = { type: t as Filter['type'], freq: range(f.freq, 20, 20000, 1000, `${where}.filter.freq`, warn), q: Math.max(0.7, num(f.q, 0.7)) };
    }
  }
  return out;
}

/**
 * Check an author's `sfx` value and the layer's `duration`, warn about anything that will not do what
 * they meant, and return the sound to render — or null (the layer stays silent) when nothing usable is left.
 */
export function resolveSfx(sfx: unknown, duration: number | undefined, who: string, warn: Warn = defaultWarn): ResolvedSfx | null {
  const opts = (typeof sfx === 'string' ? { preset: sfx } : sfx) as Record<string, unknown> | null;
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
    warn(`pixi-effects: ${who}: sfx must be a preset name, { preset, pitch, brightness, seed } or { voices: [...] } (got ${JSON.stringify(sfx)}). The layer is silent.`);
    return null;
  }
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (LAYER_KEYS.includes(k)) warn(`pixi-effects: ${who}: "${k}" goes on the audio layer, not inside sfx (the sound's length is the layer's duration)`);
    else rest[k] = v;
  }
  warnUnknownOptions(`${who} sfx`, rest, OPTION_KEYS);

  let preset: SfxPreset | null = null;
  let voices: Voice[] | undefined;
  if (opts.voices !== undefined) {
    if (opts.preset !== undefined) warn(`pixi-effects: ${who}: sfx has both preset and voices — the voices play; remove one`);
    const list: unknown[] = Array.isArray(opts.voices) ? opts.voices : [];
    if (list.length > MAX_VOICES) warn(`pixi-effects: ${who}: sfx has ${list.length} voices; only the first ${MAX_VOICES} play`);
    voices = list.slice(0, MAX_VOICES).map((v, i) => resolveVoice(v, `${who} sfx.voices[${i}]`, warn)).filter((v): v is Voice => v !== null);
    if (voices.length === 0) {
      warn(`pixi-effects: ${who}: sfx.voices has no usable voice (example: { voices: [{ wave: 'noise', filter: { type: 'bandpass', freq: [500, 5000] }, envelope: 'bell' }] }). The layer is silent.`);
      return null;
    }
  } else {
    const name = String(opts.preset);
    if (!(SFX_PRESETS as string[]).includes(name)) {
      const g = SFX_ALIASES[name.toLowerCase()] ?? suggestName(name, SFX_PRESETS);
      warn(`pixi-effects: ${who}: unknown sfx preset "${name}"${didYouMean(g)} (presets: ${SFX_PRESETS.join(', ')}). The layer is silent.`);
      return null;
    }
    preset = name as SfxPreset;
  }

  const knob = (key: 'pitch' | 'brightness', max: number, unit: string): number => {
    const x = Number(opts[key] ?? 0);
    if (!Number.isFinite(x)) {
      warn(`pixi-effects: ${who}: sfx ${key} must be a number${unit} (got ${JSON.stringify(opts[key])}); using 0`);
      return 0;
    }
    if (Math.abs(x) > max) {
      warn(`pixi-effects: ${who}: sfx ${key} ${x} is outside ±${max}${unit}; using ${Math.sign(x) * max}`);
      return Math.sign(x) * max;
    }
    return x;
  };
  const pitch = knob('pitch', MAX_PITCH, ' semitones');
  const brightness = knob('brightness', 1, '');
  const rawSeed = Number(opts.seed ?? 0);
  const seed = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) : 0;

  const natural = preset ? PRESETS[preset].length : CUSTOM_LENGTH;
  let length = duration ?? natural;
  if (!(length >= MIN_LENGTH && length <= MAX_LENGTH)) {
    const clamped = Number.isFinite(length) ? clamp(length, MIN_LENGTH, MAX_LENGTH) : natural;
    warn(`pixi-effects: ${who}: an sfx lasts ${MIN_LENGTH}–${MAX_LENGTH}s (got duration ${length}); using ${clamped}`);
    length = clamped;
  }
  return { preset, ...(voices ? { voices } : {}), pitch, brightness, seed, length };
}

/** Cache key: equal keys render equal samples. */
export function sfxKey(s: ResolvedSfx): string {
  return `${s.preset ?? JSON.stringify(s.voices)}|${s.pitch}|${s.brightness}|${s.seed}|${s.length}`;
}

/** Seed of voice `i`'s noise: the preset's approved take, offset by the layer's `seed`. */
const noiseSeed = (base: number, seed: number, voice: number) => (base + seed * 977 + voice * 7919) >>> 0;

const transpose = (r: Range, p: number): Range => (typeof r === 'number' ? r * p : [r[0] * p, r[1] * p]);

/**
 * Stereo samples `[left, right]` of the sound at `sampleRate`. The louder channel peaks at exactly
 * SFX_PEAK × the preset's level (1 for a custom sound); both channels start and end at 0.
 */
export function renderSfx(s: ResolvedSfx, sampleRate: number): [Float32Array, Float32Array] {
  const p = 2 ** (s.pitch / 12);
  const def = s.preset ? PRESETS[s.preset] : null;
  const base = def?.seed ?? 0;
  const n = Math.max(2, Math.round(s.length * sampleRate));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const structure = lcg(noiseSeed(base, s.seed, 104729));
  const voices: Voice[] = def
    ? def.voices({ p, rand: () => (structure() + 1) / 2 })
    : s.voices!.map(v => ({ ...v, freq: transpose(v.freq ?? 440, p), ...(v.filter ? { filter: { ...v.filter, freq: transpose(v.filter.freq, p) } } : {}) }));
  voices.forEach((v, i) => renderVoice(left, right, v, sampleRate, lcg(noiseSeed(base, s.seed, i))));
  if (s.brightness !== 0) {
    tilt(left, s.brightness, sampleRate);
    tilt(right, s.brightness, sampleRate);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  if (peak > 0) {
    const scale = (SFX_PEAK * (def?.level ?? 1)) / peak;
    for (let i = 0; i < n; i++) {
      left[i] = left[i]! * scale;
      right[i] = right[i]! * scale;
    }
  }
  return [left, right];
}
