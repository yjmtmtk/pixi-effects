import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mixdown, limitMix, type AudioDescriptor } from '../../src/core/AudioMixer';

const SR = 8000;
const constant = (key: string, value: number, seconds: number, calls: number[] = []): AudioDescriptor['synth'] =>
  ({ key, render: (sr: number) => { calls.push(sr); const ch = () => new Float32Array(Math.round(sr * seconds)).fill(value); return [ch(), ch()]; } });
const synthAt = (synth: AudioDescriptor['synth'], start: number, end: number, layer = 'layer "s"'): AudioDescriptor =>
  ({ synth, layer, source: 'sfx "test"', loop: false, start, end, initialVolume: 1, volumeKeyframes: [] });

beforeEach(() => { vi.restoreAllMocks(); });

describe('mixdown — synthesised sources', () => {
  it('renders a synth at the mix sample rate, once per key, and places every use at its start', async () => {
    const calls: number[] = [];
    const s = constant('k', 0.5, 0.1, calls);
    const out = await mixdown([synthAt(s, 0, 0.1), synthAt(s, 0.5, 0.6)], 1, SR);
    expect(calls).toEqual([SR]);
    const d = out!.getChannelData(0);
    expect(d[Math.round(0.05 * SR)]).toBeCloseTo(0.5, 5);
    expect(d[Math.round(0.3 * SR)]).toBe(0);
    expect(d[Math.round(0.55 * SR)]).toBeCloseTo(0.5, 5);
    expect(out!.getChannelData(1)[Math.round(0.05 * SR)]).toBeCloseTo(0.5, 5);   // both channels
  });

  it('mixes synth and buffer sources together', async () => {
    const probe = new OfflineAudioContext(1, SR, SR);
    const buf = probe.createBuffer(1, SR, SR);
    buf.getChannelData(0).fill(0.25);
    const out = await mixdown([
      { buffer: buf, loop: false, start: 0, end: 1, initialVolume: 1, volumeKeyframes: [] },
      synthAt(constant('k', 0.5, 1), 0, 1),
    ], 1, SR);
    expect(out!.getChannelData(0)[SR / 2]).toBeCloseTo(0.75, 5);
  });
});

describe('limitMix', () => {
  it('leaves a mix that stays under the knee untouched and reports its peak', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = (await mixdown([synthAt(constant('a', 0.5, 1), 0, 1)], 1, SR))!;
    const stats = limitMix(out, []);
    expect(stats.peak).toBeCloseTo(0.5, 5);
    expect(out.getChannelData(0)[100]).toBeCloseTo(0.5, 5);
    expect(warn).not.toHaveBeenCalled();
  });

  it('soft-limits a mix that goes over 1, keeps it inside ±1 and names the layers playing at the peak', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = [synthAt(constant('a', 0.8, 1), 0, 1, 'layer "a"'), synthAt(constant('a', 0.8, 1), 0.5, 1.5, 'layer "b"')];
    const out = (await mixdown(audios, 2, SR))!;
    const stats = limitMix(out, audios);
    expect(stats.peak).toBeCloseTo(1.6, 5);
    expect(stats.peakAt).toBeGreaterThanOrEqual(0.5);
    expect(stats.peakAt).toBeLessThan(1);
    const d = out.getChannelData(0);
    expect(Math.max(...d)).toBeLessThanOrEqual(1);
    expect(d[Math.round(0.75 * SR)]).toBeGreaterThan(0.9);
    expect(d[Math.round(0.25 * SR)]).toBeCloseTo(0.8, 5);     // under the knee: unchanged
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('layer "a", layer "b"');
    expect(msg).toContain('Lower their volume');
  });
});

describe('mixdown — a time before the movie starts (a negative `at`, or an end-relative keyframe on a short sound)', () => {
  const ramp = (key: string, seconds: number): AudioDescriptor['synth'] =>
    ({ key, render: (sr: number) => { const n = Math.round(sr * seconds); const ch = () => Float32Array.from({ length: n }, (_, i) => (i + 1) / n); return [ch(), ch()]; } });

  it('a sound that starts at −0.1 s is mixed from 0, with its first 0.1 s cut off (no throw)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = (await mixdown([synthAt(ramp('r', 0.5), -0.1, 0.4, 'layer "early"')], 1, SR))!;
    const d = out.getChannelData(0);
    expect(d[0]).toBeCloseTo((0.1 * SR + 1) / (0.5 * SR), 3);        // what the sound has 0.1 s in
    expect(d[Math.round(0.3 * SR)]).toBeCloseTo((0.4 * SR + 1) / (0.5 * SR), 2);
    expect(d[Math.round(0.45 * SR)]).toBe(0);                          // it ends where it said it would
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('layer "early"');
    expect(String(warn.mock.calls[0]![0])).toMatch(/starts at -0\.10s, before the movie.*first 0\.10s/);
  });

  it('volume points before 0 are clamped to 0 instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a: AudioDescriptor = { ...synthAt(constant('k', 0.5, 1), 0, 1), volumeKeyframes: [{ time: -0.5, value: 1 }, { time: 0.5, value: 0 }] };
    const out = (await mixdown([a], 1, SR))!;
    expect(out.getChannelData(0)[10]).toBeGreaterThan(0.4);
  });
});
