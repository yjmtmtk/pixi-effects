import type { MusicOptions } from '../types';

/**
 * The sound of `music` as a Web Audio `AudioBuffer` you can play yourself (a music box page, a jingle on a button, your own player):
 *
 * ```js
 * const buffer = await musicBuffer({ bpm: 96, tracks: [{ inst: 'keys', notes: 'Cmaj7:4 Am7:4' }] });
 * const src = audioContext.createBufferSource(); src.buffer = buffer; src.connect(audioContext.destination); src.start();
 * ```
 *
 * `sampleRate` defaults to 44100; `duration` (seconds) cuts it or, with `loop: true`, repeats the music up to it. Warnings are printed
 * like for an audio layer; throws, saying why, when the score cannot play (no `bpm`, no notes). Async: the synthesiser is its own chunk.
 */
export async function musicBuffer(music: MusicOptions, options: { sampleRate?: number; duration?: number; loop?: boolean } = {}): Promise<AudioBuffer> {
  const { resolveMusic, renderMusic, musicLength } = await import('./music');
  const messages: string[] = [];
  const m = resolveMusic(music, 'musicBuffer()', msg => messages.push(msg));
  if (!m) throw new Error(`pixi-effects: musicBuffer(): ${messages.join(' ') || 'the music has nothing to play'}`);
  for (const msg of messages) console.warn(msg);
  const sampleRate = options.sampleRate ?? 44100;
  const length = options.duration ?? musicLength(m);
  if (!(Number.isFinite(length) && length > 0)) throw new Error(`pixi-effects: musicBuffer(): duration must be a positive number of seconds, got ${String(options.duration)}`);
  const [left, right] = renderMusic(m, sampleRate, length, !!options.loop);
  const buffer: AudioBuffer = typeof AudioBuffer === 'function'
    ? new AudioBuffer({ length: left.length, sampleRate, numberOfChannels: 2 })
    : new OfflineAudioContext(2, left.length, sampleRate).createBuffer(2, left.length, sampleRate);
  buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
  return buffer;
}
