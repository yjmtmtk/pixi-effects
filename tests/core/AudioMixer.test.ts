import { describe, it, expect, vi } from 'vitest';
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

  it('sounds without a time remap mix exactly as they always did (a checksum of the whole mix: volume points, a loop, a start before the movie)', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const ramp = (seconds: number): AudioBuffer => {
      const buf = probeCtx.createBuffer(1, 44100 * seconds, 44100);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.sin((i / 44100) * 2 * Math.PI * 220) * (0.3 + 0.7 * (i / d.length));
      return buf;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await mixdown([
      { buffer: ramp(2), loop: false, start: 0, end: 2, initialVolume: 0.8, volumeKeyframes: [{ time: 1, value: 0.2 }, { time: 2, value: 1 }] },
      { buffer: ramp(1), loop: true, start: 0.5, end: 3, initialVolume: 0.5, volumeKeyframes: [] },
      { buffer: ramp(1), loop: false, start: -0.25, end: 1.5, initialVolume: 1, volumeKeyframes: [{ time: 0.5, value: 0.5 }] },
    ], 3);
    warn.mockRestore();
    let sum = 0, sumSq = 0;
    for (let ch = 0; ch < out!.numberOfChannels; ch++) { const d = out!.getChannelData(ch); for (let i = 0; i < d.length; i++) { sum += d[i]!; sumSq += d[i]! * d[i]!; } }
    // recorded from the mixer before the time remap existed: a change to the plain path would move these
    expect(sum).toBe(-105.91040364524865);
    expect(sumSq).toBe(60614.1673240818);
  });
});
