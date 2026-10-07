import type { MusicOptions } from '../types';
import { computeEnvelope, type AudioEnvelope, type EnvelopeOptions } from './envelope';

/**
 * What the `music` of an audio layer does over time, as numbers for `react()`: `level`, `bass`, `mid`, `treble` (or your own `bands`), one
 * value per video frame, from analysing the very sound the layer will play. The beats are exact (the kick hits, or every beat when there
 * is no kick) and `bpm` is the starting tempo. Do it before `movie.init`, with the same `music` object the layer uses:
 *
 * ```js
 * const music = { bpm: 96, tracks: [...], drums: {...} };
 * const env = await musicEnvelope(music, { frameRate: 30 });
 * // sequences: [{ type: 'audio', music }, { type: 'shape', ..., keyframes: react(env, { duration, props: { scale: { base: 1, amount: 0.3, band: 'bass' } } }) }]
 * ```
 */
export async function musicEnvelope(music: MusicOptions, options: EnvelopeOptions = {}): Promise<AudioEnvelope> {
  // The synthesiser is its own chunk: pages that never use music never load it.
  const { resolveMusic, renderMusic, musicLength, musicBeatTimes, TempoMap } = await import('./music');
  const messages: string[] = [];
  const m = resolveMusic(music, 'musicEnvelope()', msg => messages.push(msg));
  if (!m) throw new Error(`pixi-effects: musicEnvelope(): ${messages.join(' ') || 'the music has nothing to play'}`);
  for (const msg of messages) console.warn(msg);
  const sampleRate = 22050;
  const [left, right] = renderMusic(m, sampleRate, musicLength(m), false);
  const env = computeEnvelope({ sampleRate, numberOfChannels: 2, length: left.length, getChannelData: c => (c === 0 ? left : right) }, options);
  return { ...env, beats: musicBeatTimes(m, env.duration), bpm: Math.round(new TempoMap(m.tempo).bpmAt(0) * 100) / 100 };
}
