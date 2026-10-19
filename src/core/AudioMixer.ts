import { measureLoudness } from '../audio/loudness';
import type { AudioDescriptor } from '../types';
import { resampleThrough, playSpan } from './audioRemap';
export type { AudioDescriptor };

export async function mixdown(
  audios: AudioDescriptor[],
  totalDuration: number,
  sampleRate = 44100,
  /** Runs between the slices of the work (`done` is how much of the whole mixdown is made, 0..1) and may wait: the page can paint. */
  pace?: (done: number) => Promise<void> | void,
): Promise<AudioBuffer | null> {
  if (audios.length === 0) return null;
  // how much each sound weighs in `pace`: a synthesised one by its length (the music is nearly all of the time), a file very little
  const weight = (a: AudioDescriptor): number => (a.synth ? Math.max(1, a.end - a.start) : 0.2);
  const all = audios.reduce((s, a) => s + weight(a), 0) + 0.5;                         // + the final render
  let made = 0;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);
  // A synthesised sound is rendered once per mix, at the mix's own rate, however often it is used.
  const synthesised = new Map<string, AudioBuffer>();
  const bufferOf = async (a: AudioDescriptor, inner?: (done: number) => Promise<void> | void): Promise<AudioBuffer | null> => {
    if (a.buffer) return a.buffer;
    if (!a.synth) return null;
    let buf = synthesised.get(a.synth.key);
    if (!buf) {
      const [left, right] = a.synth.renderAsync ? await a.synth.renderAsync(sampleRate, inner) : a.synth.render(sampleRate);
      buf = ctx.createBuffer(2, left.length, sampleRate);
      buf.getChannelData(0).set(left);
      buf.getChannelData(1).set(right);
      synthesised.set(a.synth.key, buf);
    }
    return buf;
  };
  for (const a of audios) {
    const w = weight(a), base = made;
    const buffer = await bufferOf(a, pace ? (f) => pace((base + w * f) / all) : undefined);
    made += w;
    if (pace) await pace(made / all);
    if (!buffer) continue;
    if (a.warp || a.sourceMap) {
      // A time remap: resample the sound through the maps into a buffer of its own, then play that one straight. (`start` is in the
      // sound's own time here, so the "starts before the movie" check below does not apply.)
      const r = resampleThrough(a, buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0), buffer.sampleRate, sampleRate, totalDuration);
      if (!r) continue;
      const out = ctx.createBuffer(2, r.L.length, sampleRate);
      out.getChannelData(0).set(r.L);
      out.getChannelData(1).set(r.R);
      const rendered = ctx.createBufferSource();
      rendered.buffer = out;
      rendered.connect(ctx.destination);
      rendered.start(r.at);
      continue;
    }
    // Web Audio throws on a negative time. A sound that starts before the movie (a negative `at`, e.g.
    // `at = hit - duration` near 0) is mixed from 0 with its first seconds cut off, and its volume points
    // are clamped to 0.
    const begin = Math.max(0, a.start);
    const skipped = begin - a.start;
    if (skipped > 0) {
      console.warn(
        `pixi-effects: ${a.layer ?? 'an audio layer'} starts at ${a.start.toFixed(2)}s, before the movie starts, so its first ${skipped.toFixed(2)}s are cut off. ` +
        `Start it at 0 or later.`,
      );
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!a.loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(a.initialVolume ?? 1, begin);
    for (const kf of a.volumeKeyframes ?? []) {
      gain.gain.linearRampToValueAtTime(kf.value, Math.max(0, kf.time));
    }
    src.connect(gain).connect(ctx.destination);
    src.start(begin, skipped);
    src.stop(Math.max(begin, a.end));
  }
  return await ctx.startRendering();
}

/** Peak of the mix before limiting, and where it is. `peak > 1` means the mix had to be limited. */
export interface MixStats {
  peak: number;
  peakAt: number;
  /** Set when the movie asked for a loudness (`init({ loudness })`): what was done to the mix to get there. */
  loudness?: LoudnessResult;
}

/**
 * What `normalizeMix` did: the target asked for, the gain applied (dB), the loudness the mix has now (null: nothing to measure) and whether the target was out of reach (`limited`: the mix has
 * peaks so far above its body that even `MAX_LIMIT_DB` of limiting did not get it there). `limiterDb` is the most the limiter took off a peak (absent: it did nothing) and `limiterAt` where (s).
 */
export interface LoudnessResult { target: number; gainDb: number; reachedLufs: number | null; limited: boolean; limiterDb?: number; limiterAt?: number }

/** Above this the mix is bent smoothly toward 1 instead of clipping. */
const KNEE = 0.9;

/** The highest true peak a normalised mix may have (dBTP): a little under full scale, so the encoder does not clip it. */
export const LOUDNESS_CEILING_DB = -1;

/** The most the limiter of `normalizeMix` may take off a peak (dB): more would be pumping, not mastering. A click 30 dB over its bed is out of reach, and is said to be. */
const MAX_LIMIT_DB = 10;

/**
 * Copy `source` times `gain` into `out` and pull every peak that would pass `ceil` (linear) down, with a look-ahead limiter: the reduction starts 3 ms before the peak, so nothing is clipped, and
 * lets go over 80 ms, so a bass note is not modulated. The channels are limited together (one gain for all). Pure and deterministic. Returns the largest reduction (dB) and where (s).
 */
function limitInto(source: Float32Array[], out: Float32Array[], gain: number, ceil: number, sampleRate: number): { reductionDb: number; at: number } {
  const n = source[0]?.length ?? 0;
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of source) { const a = Math.abs(c[i]!) * gain; if (a > p) p = a; }
    req[i] = p > ceil ? ceil / p : 1;
  }
  const L = Math.max(1, Math.round(0.003 * sampleRate));
  // 1. the lowest gain asked for in the next L samples (a sliding minimum, so the dip starts before the peak)
  const mn = new Float32Array(n), dq = new Int32Array(n); let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && req[dq[tail - 1]!]! >= req[i]!) tail--;
    dq[tail++] = i;
    while (dq[head]! > i + L) head++;
    mn[i] = req[dq[head]!]!;
  }
  // 2. the average of the last L+1 of those: the gain falls in a straight ramp that is never above what the sample asks for, then 3. lets go slowly
  const release = 1 - Math.exp(-1 / (0.08 * sampleRate));
  let run = 0, prev = 1, lowest = 1, lowestAt = 0;
  const gains = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    run += mn[i]!; if (i > L) run -= mn[i - L - 1]!;
    const avg = run / Math.min(i + 1, L + 1);
    const g = Math.min(avg, prev + (1 - prev) * release);
    gains[i] = g; prev = g;
    if (g < lowest) { lowest = g; lowestAt = i; }
  }
  for (let ch = 0; ch < source.length; ch++) {
    const s = source[ch]!, o = out[ch]!;
    for (let i = 0; i < n; i++) { const v = s[i]! * gain * gains[i]!; o[i] = v > ceil ? ceil : v < -ceil ? -ceil : v; }          // (the clamp is a guard: the ramp above is never over the ceiling)
  }
  return { reductionDb: lowest < 1 ? -20 * Math.log10(lowest) : 0, at: lowestAt / sampleRate };
}

/**
 * Bring the whole mix to `target` LUFS (ITU-R BS.1770 integrated loudness): one gain, up or down, and a look-ahead limiter that takes a click or a hit down so that no peak passes
 * `LOUDNESS_CEILING_DB` (true peak). A mix with peaks that no limiter should be asked for (more than `MAX_LIMIT_DB`) stops short of the target (`limited: true`, `reachedLufs` says where it
 * ended). A mix whose peak is under the ceiling gets the gain only. Silence is left alone. Pure and deterministic; run before `limitMix`, which then has nothing to do.
 */
export function normalizeMix(buffer: AudioBuffer, target: number): LoudnessResult {
  const chans: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) chans.push(buffer.getChannelData(ch));
  const sr = buffer.sampleRate;
  const m = measureLoudness(chans, sr, { truePeak: false });
  if (m.integratedLufs === null) return { target, gainDb: 0, reachedLufs: null, limited: false };
  const original = chans.map(c => Float32Array.from(c));
  let gainDb = target - m.integratedLufs;
  let ceilDb = LOUDNESS_CEILING_DB;
  let applied = { reductionDb: 0, at: 0 }, measured = m;
  for (let round = 0; round < 8; round++) {
    const cap = MAX_LIMIT_DB + ceilDb - m.samplePeakDb;                             // the gain at which the loudest sample needs MAX_LIMIT_DB of limiting
    if (gainDb > cap) gainDb = cap;
    applied = limitInto(original, chans, 10 ** (gainDb / 20), 10 ** (ceilDb / 20), sr);
    measured = measureLoudness(chans, sr);
    const overTp = measured.truePeakDb! - LOUDNESS_CEILING_DB;
    if (overTp > 0.02) { ceilDb -= overTp + 0.02; continue; }                       // between the samples the peak is higher than at them: the ceiling for the samples goes down by that
    const deficit = target - measured.integratedLufs!;                              // the limiter takes a little loudness with it: ask for that much more gain (as far as the cap allows)
    if (Math.abs(deficit) <= 0.15) break;
    const next = Math.min(gainDb + deficit, cap);
    if (Math.abs(next - gainDb) < 0.05) break;
    gainDb = next;
  }
  const limited = measured.integratedLufs! < target - 0.15;
  const reduction = Math.round(applied.reductionDb * 10) / 10;
  return {
    target, gainDb: Math.round(gainDb * 10) / 10, reachedLufs: measured.integratedLufs, limited,
    ...(reduction >= 0.1 ? { limiterDb: reduction, limiterAt: Math.round(applied.at * 100) / 100 } : {}),
  };
}

/**
 * Keep the finished mix inside [-1, 1]: samples above KNEE are soft-limited (tanh), so overlapping sounds
 * never wrap or crackle in the encoder. Pure and deterministic; a mix that never exceeds KNEE is untouched.
 * Warns once, naming the layers that play at the loudest moment, when the mix went over 1.
 */
export function limitMix(buffer: AudioBuffer, audios: AudioDescriptor[]): MixStats {
  let peak = 0;
  let peakIndex = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const x = Math.abs(d[i]!);
      if (x > peak) { peak = x; peakIndex = i; }
      if (x > KNEE) d[i] = Math.sign(d[i]!) * (KNEE + (1 - KNEE) * Math.tanh((x - KNEE) / (1 - KNEE)));
    }
  }
  const peakAt = peakIndex / buffer.sampleRate;
  if (peak > 1) {
    const playing = audios.map(a => ({ a, ...playSpan(a, buffer.duration) })).filter(s => s.start <= peakAt && peakAt < s.end).map(s => s.a.layer ?? 'an audio layer');
    console.warn(
      `pixi-effects: the audio mix peaks at ${peak.toFixed(2)} (${(20 * Math.log10(peak)).toFixed(1)} dBFS) at ${peakAt.toFixed(2)}s, so it was limited ` +
      `(it would distort). Playing there: ${[...new Set(playing)].join(', ')}. Lower their volume.`,
    );
  }
  return { peak, peakAt };
}
