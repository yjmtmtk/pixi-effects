import { fft } from '../core/spectrum';
import { warnUnknownOptions } from '../core/options';

/** The part of an `AudioBuffer` the analysis reads (so it can be tested with plain arrays). */
export interface AudioLike {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

export interface EnvelopeOptions {
  /** One value per video frame: use your movie's `frameRate`. Default 30. */
  frameRate?: number;
  /** Frequency bands in Hz, `{ name: [from, to] }`. Default `{ bass: [20, 150], mid: [150, 2000], treble: [2000, 10000] }`. */
  bands?: Record<string, [number, number]>;
  /** The band the beats are looked for in (default `'bass'`, or `'level'` if there is no such band). */
  beatBand?: string;
  /** More (above 1) or fewer (below 1) beats. Default 1. */
  beatSensitivity?: number;
}

/** What a piece of sound does over time, as numbers between 0 and 1, one per video frame, plus where its beats are. */
export interface AudioEnvelope {
  frameRate: number;
  /** Seconds of sound. */
  duration: number;
  /** Values per series (`frames`). */
  frames: number;
  /** `level` (the overall loudness) and one series per band, each 0–1 on a log (perceptual) scale. */
  series: Record<string, Float32Array>;
  /** Times of the beats, in seconds. */
  beats: number[];
  /** The tempo estimated from the beats (null if there are too few). */
  bpm: number | null;
  /** The value of a series at a time (seconds): interpolated between frames, held at the ends. `series` defaults to `'level'`. */
  at(time: number, series?: string): number;
}

const DEFAULT_BANDS: Record<string, [number, number]> = { bass: [20, 150], mid: [150, 2000], treble: [2000, 10000] };
const WINDOW = 2048;
const RANGE_DB = 36;                         // 36 dB below the loudest is zero
const MIN_BEAT_GAP = 0.2;                    // seconds
const OPTION_KEYS = ['frameRate', 'bands', 'beatBand', 'beatSensitivity'] as const;

function makeAt(frameRate: number, series: Record<string, Float32Array>): AudioEnvelope['at'] {
  return (time, name = 'level') => {
    const s = series[name];
    if (!s) throw new Error(`pixi-effects: this envelope has no series "${name}" (it has: ${Object.keys(series).join(', ')})`);
    const x = Math.min(Math.max(time * frameRate, 0), s.length - 1);
    const i = Math.floor(x), f = x - i;
    return i + 1 < s.length ? s[i]! + (s[i + 1]! - s[i]!) * f : s[i]!;
  };
}

function percentile(values: Float32Array | Float64Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!;
}

function pickBeats(strength: Float32Array, frameRate: number, sensitivity: number): number[] {
  const n = strength.length;
  const flux = new Float64Array(n);
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, strength[i]! - strength[i - 1]!);
  const half = Math.max(2, Math.round(frameRate * 0.5));
  const gap = Math.max(1, Math.round(MIN_BEAT_GAP * frameRate));
  const beats: number[] = [];
  let last = -gap;
  for (let i = 1; i < n; i++) {
    const v = flux[i]!;
    if (v < 0.12 / sensitivity || v < flux[i - 1]! || v <= (flux[i + 1] ?? 0)) continue;       // big enough, and the top of its little hill
    let mean = 0, sq = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { mean += flux[j]!; sq += flux[j]! * flux[j]!; count++; }
    mean /= count;
    const std = Math.sqrt(Math.max(0, sq / count - mean * mean));
    if (v < mean + 1.0 * std / sensitivity) continue;                                             // and clearly above what is around it
    if (i - last < gap) { if (beats.length && v > flux[last]!) { beats[beats.length - 1] = i / frameRate; last = i; } continue; }
    beats.push(i / frameRate); last = i;
  }
  return beats;
}

function tempo(beats: number[]): number | null {
  if (beats.length < 4) return null;
  const gaps = beats.slice(1).map((b, i) => b - beats[i]!).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  return Math.round((60 / median) * 10) / 10;
}

/**
 * Analyse a sound: its loudness and the energy in a few frequency bands, one value per video frame (0–1 on a log scale, all measured
 * against the loudest of them, so the balance between bands is kept and a quiet file looks like a loud one), and where its beats are.
 * Pure and deterministic: the same sound gives the same numbers.
 */
export function computeEnvelope(audio: AudioLike, options: EnvelopeOptions = {}): AudioEnvelope {
  warnUnknownOptions('audioEnvelope()', options, OPTION_KEYS);
  const frameRate = options.frameRate ?? 30;
  if (!(Number.isFinite(frameRate) && frameRate > 0)) throw new Error(`pixi-effects: audioEnvelope(): frameRate must be a positive number, got ${frameRate}`);
  const bands = options.bands ?? DEFAULT_BANDS;
  for (const [name, range] of Object.entries(bands)) {
    if (!(Array.isArray(range) && range.length === 2 && range[0] >= 0 && range[0] < range[1])) throw new Error(`pixi-effects: audioEnvelope(): band "${name}" must be [from, to] in Hz with from < to, got ${JSON.stringify(range)}`);
  }
  const sr = audio.sampleRate, length = audio.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < length; i++) mono[i]! += d[i]! / audio.numberOfChannels; }

  const duration = length / sr;
  const frames = Math.floor(duration * frameRate + 1e-9) + 1;
  const hop = sr / frameRate;
  const names = Object.keys(bands);
  const raw: Record<string, Float64Array> = { level: new Float64Array(frames) };
  for (const n of names) raw[n] = new Float64Array(frames);

  const re = new Float64Array(WINDOW), im = new Float64Array(WINDOW);
  const win = new Float64Array(WINDOW);
  let winPower = 0;
  for (let i = 0; i < WINDOW; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)); winPower += win[i]! * win[i]!; }
  winPower /= WINDOW;
  const binHz = sr / WINDOW;
  for (let f = 0; f < frames; f++) {
    const center = Math.round((f / frameRate) * sr);
    // the level: the RMS of one frame's worth of samples around the frame time
    let sum = 0, cnt = 0;
    for (let i = Math.max(0, Math.round(center - hop / 2)); i < Math.min(length, Math.round(center + hop / 2)); i++) { sum += mono[i]! * mono[i]!; cnt++; }
    raw.level![f] = cnt ? Math.sqrt(sum / cnt) : 0;
    // the bands: a Hann-windowed FFT around the frame time; power scaled so the bands add up to the RMS
    for (let i = 0; i < WINDOW; i++) { const k = center - WINDOW / 2 + i; re[i] = k >= 0 && k < length ? mono[k]! * win[i]! : 0; im[i] = 0; }
    fft(re, im);
    for (const n of names) {
      const [lo, hi] = bands[n]!;
      let p = 0;
      for (let b = Math.max(1, Math.ceil(lo / binHz)); b <= Math.min(WINDOW / 2 - 1, Math.floor(hi / binHz)); b++) p += re[b]! * re[b]! + im[b]! * im[b]!;
      raw[n]![f] = Math.sqrt((2 * p) / (WINDOW * WINDOW * winPower));
    }
  }

  let ref = 0;
  for (const s of Object.values(raw)) ref = Math.max(ref, percentile(s, 0.98));
  const series: Record<string, Float32Array> = {};
  for (const [name, s] of Object.entries(raw)) {
    const out = new Float32Array(frames);
    if (ref > 1e-7) for (let f = 0; f < frames; f++) { const v = s[f]!; out[f] = v > 0 ? Math.min(1, Math.max(0, 1 + (20 * Math.log10(v / ref)) / RANGE_DB)) : 0; }
    series[name] = out;
  }

  const beatName = options.beatBand ?? (series.bass ? 'bass' : 'level');
  if (!series[beatName]) throw new Error(`pixi-effects: audioEnvelope(): beatBand "${beatName}" is not one of ${Object.keys(series).join(', ')}`);
  const beats = ref > 1e-7 ? pickBeats(series[beatName]!, frameRate, options.beatSensitivity ?? 1) : [];
  return { frameRate, duration, frames, series, beats, bpm: tempo(beats), at: makeAt(frameRate, series) };
}

/**
 * A stand-in for analysed music, on a tempo you choose: a kick on every beat (`bass`), a snare on 2 and 4 (`mid`), hats on the eighth
 * notes (`treble`), each a pulse that decays; `level` follows them. Beats are exactly on the beat. Use it with no audio file, or to
 * make visuals that match sound effects you place on the same tempo.
 */
export function bpmEnvelope(bpm: number, options: { duration: number; frameRate?: number; swing?: number }): AudioEnvelope {
  const { duration, frameRate = 30, swing = 0 } = options;
  if (!(Number.isFinite(bpm) && bpm > 0)) throw new Error(`pixi-effects: bpmEnvelope(): bpm must be a positive number, got ${bpm}`);
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`pixi-effects: bpmEnvelope(): duration must be a positive number of seconds, got ${duration}`);
  const beat = 60 / bpm;
  const frames = Math.round(duration * frameRate) + 1;
  const pulse = (hits: number[], decay: number, t: number): number => {
    let v = 0;
    for (let i = hits.length - 1; i >= 0; i--) { if (hits[i]! <= t + 1e-9) { v = Math.exp(-(t - hits[i]!) / decay); break; } }
    return v;
  };
  const beats: number[] = [], snares: number[] = [], hats: number[] = [];
  for (let k = 0; k * beat < duration - 1e-9; k++) {
    beats.push(round6(k * beat));
    if (k % 2 === 1) snares.push(round6(k * beat));
    hats.push(round6(k * beat), round6(k * beat + beat / 2 + swing * beat));
  }
  hats.sort((a, b) => a - b);
  const series: Record<string, Float32Array> = { level: new Float32Array(frames), bass: new Float32Array(frames), mid: new Float32Array(frames), treble: new Float32Array(frames) };
  for (let f = 0; f < frames; f++) {
    const t = f / frameRate;
    const b = pulse(beats, 0.14, t), m = pulse(snares, 0.1, t), h = pulse(hats, 0.045, t);
    series.bass![f] = b; series.mid![f] = m; series.treble![f] = h;
    series.level![f] = Math.max(b, m * 0.9, h * 0.55);
  }
  return { frameRate, duration, frames, series, beats, bpm, at: makeAt(frameRate, series) };
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** What `audioEnvelope()` can read: a URL (string), a Blob / File, the raw bytes of a file, or an `AudioBuffer` you already decoded. */
export type AudioEnvelopeSource = string | URL | Blob | ArrayBuffer | AudioBuffer;

/**
 * Decode an audio file and analyse it (see {@link computeEnvelope}). Do it before `movie.init`, with the same file the music layer plays,
 * and feed the result to `react()`:
 *
 * ```js
 * const env = await audioEnvelope('music.mp3', { frameRate: 30 });
 * ```
 */
export async function audioEnvelope(source: AudioEnvelopeSource, options: EnvelopeOptions = {}): Promise<AudioEnvelope> {
  let audio: AudioLike;
  if (typeof (source as AudioBuffer).getChannelData === 'function') audio = source as AudioBuffer;
  else {
    let data: ArrayBuffer;
    if (typeof source === 'string' || source instanceof URL) {
      const res = await fetch(String(source));
      if (!res.ok) throw new Error(`pixi-effects: audioEnvelope(): could not fetch ${String(source)} (${res.status})`);
      data = await res.arrayBuffer();
    } else if (source instanceof Blob) data = await source.arrayBuffer();
    else data = source as ArrayBuffer;
    const Ctx = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext
      ?? (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) throw new Error('pixi-effects: audioEnvelope() needs a browser with Web Audio (OfflineAudioContext)');
    try { audio = await new Ctx(1, 1, 44100).decodeAudioData(data.slice(0)); }
    catch (err) { throw new Error(`pixi-effects: audioEnvelope(): could not decode the audio (${err instanceof Error ? err.message : String(err)}); is it an mp3, wav, ogg, m4a or webm file?`); }
  }
  return computeEnvelope(audio, options);
}
