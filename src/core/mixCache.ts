import type { AudioDescriptor } from '../types';

const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object): number => { let n = ids.get(o); if (!n) { n = nextId++; ids.set(o, n); } return n; };

/**
 * A string that is the same for two sets of sounds exactly when they mix to the same samples, or null when that cannot be told (a time remap is a
 * function; a sound with neither a buffer nor a synth key): then the sound is mixed again, never reused by guess. What only names a layer is left out.
 */
export function mixKey(audios: readonly AudioDescriptor[], duration: number, sampleRate: number): string | null {
  const parts: unknown[] = [];
  for (const a of audios) {
    if (a.warp || a.sourceMap) return null;
    const what = a.buffer ? `b${idOf(a.buffer)}` : a.synth ? `s${a.synth.key}` : null;
    if (what === null) return null;
    parts.push([what, a.loop, a.start, a.end, a.initialVolume, a.volumeKeyframes.map(k => [k.time, k.value])]);
  }
  return JSON.stringify([duration, sampleRate, parts]);
}

/** The last mix and what was made with it (the loudness statistics), for the next `rebuild` of the same sounds. */
export class MixCache<Extra = unknown> {
  private key: string | null = null;
  private buffer: AudioBuffer | null = null;
  private extra: Extra | undefined;

  get(key: string | null): { buffer: AudioBuffer; extra: Extra } | null {
    if (key === null || key !== this.key || !this.buffer) return null;
    return { buffer: this.buffer, extra: this.extra as Extra };
  }

  /** Keep this mix for `key`; a null key (not comparable) keeps nothing. */
  set(key: string | null, buffer: AudioBuffer | null, extra?: Extra): void {
    this.key = key; this.buffer = key === null ? null : buffer; this.extra = extra;
  }
}
