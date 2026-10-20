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
 * lets go over 80 ms, so a bass note is not modulated. The channels are limited together (one gain for all). One pass over the samples with a few hundred floats of state (a sliding minimum over
 * the next 3 ms and a running mean of it), so a ten-minute mix costs no extra memory. Pure and deterministic. Returns the largest reduction (dB) and where (s).
 */
function limitInto(source: Float32Array[], out: Float32Array[], gain: number, ceil: number, sampleRate: number): { reductionDb: number; at: number } {
  const n = source[0]?.length ?? 0;
  const L = Math.max(1, Math.round(0.003 * sampleRate));
  const release = 1 - Math.exp(-1 / (0.08 * sampleRate));
  const reqAt = (i: number): number => {
    let p = 0;
    for (const c of source) { const a = Math.abs(c[i]!) * gain; if (a > p) p = a; }
    return p > ceil ? ceil / p : 1;
  };
  // the sliding minimum of what the samples ahead ask for: a deque of (index, value) in a ring of L + 2 places
  const size = L + 2, dqIdx = new Int32Array(size), dqVal = new Float32Array(size);
  let head = 0, count = 0, added = -1;                                      // the deque holds indices from the oldest at `head`
  const ring = new Float32Array(L + 1); let run = 0;                          // the last L + 1 minimums, for their mean
  let prev = 1, lowest = 1, lowestAt = 0;
  for (let i = 0; i < n; i++) {
    for (; added < Math.min(n - 1, i + L); ) {                               // take in what is now inside [i, i + L]
      added++;
      const v = reqAt(added);
      while (count > 0 && dqVal[(head + count - 1) % size]! >= v) count--;
      const at = (head + count) % size; dqIdx[at] = added; dqVal[at] = v; count++;
    }
    while (dqIdx[head]! < i) { head = (head + 1) % size; count--; }
    const mn = dqVal[head]!;
    const slot = i % (L + 1);
    if (i > L) run -= ring[slot]!;
    ring[slot] = mn; run += mn;
    const avg = run / Math.min(i + 1, L + 1);
    const g = Math.min(avg, prev + (1 - prev) * release);
    prev = g;
    if (g < lowest) { lowest = g; lowestAt = i; }
    for (let ch = 0; ch < source.length; ch++) { const v = source[ch]![i]! * gain * g; out[ch]![i] = v > ceil ? ceil : v < -ceil ? -ceil : v; }          // (the clamp is a guard: the ramp is never over the ceiling)
  }
  return { reductionDb: lowest < 1 ? -20 * Math.log10(lowest) : 0, at: lowestAt / sampleRate };
}

/** Make every sample of the mix a number: NaN and ±Infinity (a layer that produced one) are silenced, because one of them silenced the whole film or left everything after it unmeasured. */
export function cleanMix(buffer: AudioBuffer, audios?: AudioDescriptor[]): { count: number; firstAt: number } {
  let count = 0, first = -1;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i]!)) { d[i] = 0; count++; if (first < 0 || i < first) first = i; }
  }
  const firstAt = first < 0 ? 0 : first / buffer.sampleRate;
  if (count > 0 && audios) {
    const playing = audios.map(a => ({ a, ...playSpan(a, buffer.duration) })).filter(s => s.start <= firstAt && firstAt < s.end).map(s => s.a.layer ?? 'an audio layer');
    console.warn(`pixi-effects: ${count} sample(s) of the audio mix were not numbers (NaN or Infinity), first at ${firstAt.toFixed(2)}s, and were made silent. Playing there: ${[...new Set(playing)].join(', ') || 'nothing that is listed'}. A sound that produces these (a custom synth, a division by zero in a volume) is broken.`);
  }
  return { count, firstAt };
}

/**
 * Bring the whole mix to `target` LUFS (ITU-R BS.1770 integrated loudness): one gain, up or down, and a look-ahead limiter that takes a click or a hit on top of a quiet bed down so that no peak
 * passes `LOUDNESS_CEILING_DB` (true peak: a last fixed trim guarantees it). A mix with peaks that no limiter should be asked for (more than `MAX_LIMIT_DB`) stops short of the target
 * (`limited: true`; `reachedLufs` says where it ended). A mix whose peak is under the ceiling gets the gain only. Silence is left alone. `gainDb` is the gain the quiet parts of the mix really got.
 * Async only to let the page paint: `between` is awaited after each pass over the mix (a minute of mix is a second or two of measuring). Pure and deterministic; run before `limitMix`.
 */
export async function normalizeMix(buffer: AudioBuffer, target: number, between?: () => Promise<void>): Promise<LoudnessResult> {
  const chans: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) chans.push(buffer.getChannelData(ch));
  const sr = buffer.sampleRate;
  const pause = async (): Promise<void> => { if (between) await between(); };
  const m = measureLoudness(chans, sr, { truePeak: false });
  if (m.integratedLufs === null) return { target, gainDb: 0, reachedLufs: null, limited: false };
  await pause();
  let gainDb = target - m.integratedLufs;
  let ceilDb = LOUDNESS_CEILING_DB;                                            // the ceiling of the SAMPLES: lower than the true-peak ceiling by what a peak overshoots between samples
  let applied = { reductionDb: 0, at: 0 };
  let final = m, original: Float32Array[] | null = null, cap = Infinity;
  if (gainDb + m.samplePeakDb <= ceilDb) {
    const gain = 10 ** (gainDb / 20);                                        // no peak reaches the ceiling: the gain only
    for (const d of chans) for (let i = 0; i < d.length; i++) d[i] = d[i]! * gain;
    await pause();
    final = measureLoudness(chans, sr);
  } else {
    original = chans.map(c => Float32Array.from(c));
    cap = MAX_LIMIT_DB + ceilDb - m.samplePeakDb;                            // the gain at which the loudest sample needs MAX_LIMIT_DB of limiting
    if (gainDb > cap) gainDb = cap;
    for (let round = 0; round < 3; round++) {
      cap = MAX_LIMIT_DB + ceilDb - m.samplePeakDb;
      if (gainDb > cap) gainDb = cap;
      applied = limitInto(original, chans, 10 ** (gainDb / 20), 10 ** (ceilDb / 20), sr);
      await pause();
      final = measureLoudness(chans, sr);
      await pause();
      const overTp = final.truePeakDb! - LOUDNESS_CEILING_DB;                // between the samples the peak is higher than at them: lower the ceiling by that
      const deficit = target - final.integratedLufs!;                        // the limiter takes a little loudness with it: ask for that much more gain (as far as the cap allows)
      if (round === 2 || (overTp <= 0.02 && (Math.abs(deficit) <= 0.15))) break;
      if (overTp > 0.02) ceilDb -= overTp + 0.02;
      const next = Math.min(gainDb + deficit, MAX_LIMIT_DB + ceilDb - m.samplePeakDb);
      if (overTp <= 0.02 && Math.abs(next - gainDb) < 0.05) break;
      gainDb = next;
    }
  }
  // The limiter must never leave the mix quieter than the plain way would (one gain, the loudest sample at the ceiling): when a click carries the loudness of the plain mix, limiting it can take the
  // very quiet bed back into the gate of the measurement and the integrated loudness FALLS. Then the plain gain is what is applied.
  if (original && final.integratedLufs !== null && m.integratedLufs !== null) {
    const plainDb = Math.min(target - m.integratedLufs, LOUDNESS_CEILING_DB - m.samplePeakDb);
    if (final.integratedLufs < m.integratedLufs + plainDb - 0.1) {
      const k = 10 ** (plainDb / 20);
      for (let ch = 0; ch < chans.length; ch++) { const o = original[ch]!, d = chans[ch]!; for (let i = 0; i < d.length; i++) d[i] = o[i]! * k; }
      gainDb = plainDb; applied = { reductionDb: 0, at: 0 };
      final = measureLoudness(chans, sr);
    }
  }
  // a last fixed trim makes the -1 dBTP certain where the rounds did not get there (a flat-topped noise peak overshoots more as it is limited more); the trim is linear, so the loudness shifts by it
  let trimDb = 0;
  if (final.truePeakDb! > LOUDNESS_CEILING_DB) {
    trimDb = final.truePeakDb! - LOUDNESS_CEILING_DB + 0.01;
    const k = 10 ** (-trimDb / 20);
    for (const d of chans) for (let i = 0; i < d.length; i++) d[i] = d[i]! * k;
    final = { ...final, integratedLufs: final.integratedLufs === null ? null : final.integratedLufs - trimDb };
  }
  const reached = final.integratedLufs === null ? null : Math.round(final.integratedLufs * 10) / 10;
  const reduction = Math.round(applied.reductionDb * 10) / 10;
  return {
    target, gainDb: Math.round((gainDb - trimDb) * 10) / 10, reachedLufs: reached, limited: reached !== null && reached < target - 0.15,
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
