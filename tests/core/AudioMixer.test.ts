import { describe, it, expect } from 'vitest';
import { mixdown, type AudioDescriptor } from '../../src/core/AudioMixer';

function makeBuffer(ctx: OfflineAudioContext, durationSec: number, value = 1): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sampleRate * durationSec, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = value;
  return buf;
}

describe('mixdown', () => {
  it('produces an AudioBuffer of the requested duration', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const buf = makeBuffer(probeCtx, 1, 0.5);
    const out = await mixdown([{
      buffer: buf, loop: false, start: 0, end: 1, initialVolume: 1, volumeKeyframes: [],
    } satisfies AudioDescriptor], 1);
    expect(out!.duration).toBeCloseTo(1, 1);
    expect(out!.numberOfChannels).toBe(2);
  });

  it('applies initialVolume', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const buf = makeBuffer(probeCtx, 1, 1);
    const out = await mixdown([{
      buffer: buf, loop: false, start: 0, end: 1, initialVolume: 0.25, volumeKeyframes: [],
    }], 1);
    const samples = out!.getChannelData(0);
    const mid = samples[Math.floor(samples.length / 2)];
    expect(mid).toBeCloseTo(0.25, 2);
  });

  it('linearly ramps volume keyframes', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const buf = makeBuffer(probeCtx, 2, 1);
    const out = await mixdown([{
      buffer: buf, loop: false, start: 0, end: 2, initialVolume: 0,
      volumeKeyframes: [{ time: 1, value: 1 }],
    }], 2);
    const samples = out!.getChannelData(0);
    const sampleRate = out!.sampleRate;
    const mid = samples[Math.floor(0.5 * sampleRate)];
    expect(mid).toBeCloseTo(0.5, 1);
  });
});
