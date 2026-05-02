import type { AudioDescriptor } from '../types';
export type { AudioDescriptor };

export async function mixdown(
  audios: AudioDescriptor[],
  totalDuration: number,
  sampleRate = 44100,
): Promise<AudioBuffer | null> {
  if (audios.length === 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);
  for (const a of audios) {
    const src = ctx.createBufferSource();
    src.buffer = a.buffer;
    src.loop = !!a.loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(a.initialVolume ?? 1, a.start);
    for (const kf of a.volumeKeyframes ?? []) {
      gain.gain.linearRampToValueAtTime(kf.value, kf.time);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(a.start);
    src.stop(a.end);
  }
  return await ctx.startRendering();
}
