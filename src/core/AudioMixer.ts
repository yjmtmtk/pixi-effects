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
}

/** Above this the mix is bent smoothly toward 1 instead of clipping. */
const KNEE = 0.9;

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
