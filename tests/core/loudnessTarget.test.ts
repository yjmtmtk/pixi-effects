import { describe, it, expect } from 'vitest';
import { mixdown, normalizeMix, type AudioDescriptor } from '../../src/core/AudioMixer';
import { measureLoudness } from '../../src/audio/loudness';

const SR = 48000;
/** A 440 Hz tone of the given peak, with an optional loud click at `clickAt` seconds (to make a peaky mix). */
const tone = (key: string, peak: number, seconds: number, click?: { at: number; peak: number }): AudioDescriptor['synth'] => ({ key, render: (sr: number) => {
  const n = Math.round(sr * seconds), ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = peak * Math.sin(2 * Math.PI * 440 * i / sr);
  if (click) { const c = Math.round(click.at * sr); for (let i = 0; i < 20; i++) ch[c + i] = click.peak * (i % 2 ? 1 : -1); }
  return [ch, Float32Array.from(ch)];
} });
const src = (synth: AudioDescriptor['synth'], end: number): AudioDescriptor => ({ synth, layer: 'layer "t"', source: 'sfx "t"', loop: false, start: 0, end, initialVolume: 1, volumeKeyframes: [] });
const mix = async (synth: AudioDescriptor['synth'], seconds: number) => (await mixdown([src(synth, seconds)], seconds, SR))!;
const peakOf = (b: AudioBuffer) => { let p = 0; for (const x of b.getChannelData(0)) p = Math.max(p, Math.abs(x)); return p; };
const lufs = (b: AudioBuffer) => measureLoudness([b.getChannelData(0), b.getChannelData(1)], SR, { truePeak: false });

describe('normalizeMix: the whole mix brought to a loudness (LUFS)', () => {
  it('raises a quiet mix to the target', async () => {
    const b = await mix(tone('quiet', 0.04, 4), 4);
    expect(lufs(b).integratedLufs!).toBeLessThan(-25);
    const r = normalizeMix(b, -16);
    expect(r.gainDb).toBeGreaterThan(10);
    expect(lufs(b).integratedLufs!).toBeCloseTo(-16, 0);
    expect(r.limited).toBe(false);
    expect(r.reachedLufs).toBeCloseTo(lufs(b).integratedLufs!, 1);
  });

  it('brings a loud mix down to the target too (a target, not a floor)', async () => {
    const b = await mix(tone('loud', 0.9, 4), 4);
    expect(lufs(b).integratedLufs!).toBeGreaterThan(-8);
    const r = normalizeMix(b, -16);
    expect(r.gainDb).toBeLessThan(-5);
    expect(lufs(b).integratedLufs!).toBeCloseTo(-16, 0);
  });

  it("stops short when the loudest moment would clip, and says so: the peak stays at or under -1 dBFS and the mix is quieter than the target", async () => {
    const b = await mix(tone('peaky', 0.02, 4, { at: 2, peak: 0.6 }), 4);
    const r = normalizeMix(b, -16);
    expect(r.limited).toBe(true);
    expect(r.reachedLufs!).toBeLessThan(-16);
    expect(r.reachedLufs!).toBeCloseTo(lufs(b).integratedLufs!, 1);
    const peak = peakOf(b);
    expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
    expect(peak).toBeGreaterThan(10 ** (-1.5 / 20));                          // and it went right up to the ceiling: no gain is wasted
  });

  it('leaves silence alone (nothing to measure)', async () => {
    const b = await mix(tone('nothing', 0, 2), 2);
    const r = normalizeMix(b, -16);
    expect(r).toEqual({ target: -16, gainDb: 0, reachedLufs: null, limited: false });
    expect(peakOf(b)).toBe(0);
  });

  it('is the same every time: the same mix gives the same samples', async () => {
    const a = await mix(tone('same', 0.05, 3), 3), c = await mix(tone('same', 0.05, 3), 3);
    normalizeMix(a, -16); normalizeMix(c, -16);
    expect(Array.from(a.getChannelData(0).slice(1000, 1010))).toEqual(Array.from(c.getChannelData(0).slice(1000, 1010)));
  });
});
