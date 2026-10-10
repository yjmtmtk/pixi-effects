import type { MusicOptions } from '../types';
import type { MusicEvents } from './music/events';

export type { MusicEvents, MusicNote, MusicTrackEvents, MusicDrumEvents, MusicDrumHit, MusicSummary } from './music/events';

/**
 * What a `music` score plays, as data: every note and chord with its beat, time, bar, pitches and name, and every drum hit. Use it to make the
 * picture follow the score (light the keys that sound, show the chord name, flash on the snare) without analysing the audio. Do it before
 * `movie.init`, with the same `music` object the layer uses:
 *
 * ```js
 * const ev = await musicEvents(music);
 * ev.tracks[0].notes;      // [{ beat: 0, time: 0, duration: 4, bar: 1, name: 'Am7', midi: [57, 60, 64, 67], ... }, ...]
 * ev.drums[0].hits;        // [{ beat: 0, time: 0, ... }]  (kind: 'kick')
 * ```
 * Swing and humanize are not applied: the times are the written ones. A score that cannot play throws, with the reason.
 */
export async function musicEvents(music: MusicOptions): Promise<MusicEvents> {
  // The synthesiser is its own chunk: pages that never use music never load it.
  const { resolveMusic } = await import('./music');
  const { describeEvents } = await import('./music/events');
  const messages: string[] = [];
  const m = resolveMusic(music, 'musicEvents()', msg => messages.push(msg));
  if (!m) throw new Error(`pixi-effects: musicEvents(): ${messages.join(' ') || 'the music has nothing to play'}`);
  for (const msg of messages) console.warn(msg);
  return describeEvents(m);
}
