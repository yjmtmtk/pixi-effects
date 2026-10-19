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

  it('reaches the target with a click on top of a quiet bed: a limiter takes the click down (a trial: 5 of 16 films stopped at -17 to -20 for want of this)', async () => {
    const b = await mix(tone('peaky', 0.05, 4, { at: 2, peak: 0.5 }), 4);     // the click is 20 dB over the bed
    const r = normalizeMix(b, -16);
    expect(r.limited, 'the target is reachable').toBe(false);
    expect(lufs(b).integratedLufs!).toBeGreaterThan(-16.3);
    expect(lufs(b).integratedLufs!).toBeLessThan(-15.7);
    expect(r.reachedLufs!).toBeCloseTo(lufs(b).integratedLufs!, 1);
    expect(r.limiterDb!).toBeGreaterThan(3);                                  // it says how hard it had to pull the peak down, and where
    expect(r.limiterAt!).toBeGreaterThan(1.9); expect(r.limiterAt!).toBeLessThan(2.1);
    expect(measureLoudness([b.getChannelData(0), b.getChannelData(1)], SR).truePeakDb!, 'the true peak, not only the sample peak').toBeLessThanOrEqual(-1 + 0.05);
  });

  it('the limiter leaves the bed alone: a sample far from the click is the bed times the gain, to the last digit', async () => {
    const plain = await mix(tone('bed', 0.05, 4), 4), peaky = await mix(tone('bed', 0.05, 4, { at: 3, peak: 0.5 }), 4);
    const r = normalizeMix(peaky, -16);
    const before = plain.getChannelData(0)[24000];                          // 0.5 s in, 2.5 s before the click
    expect(peaky.getChannelData(0)[24000]).toBeCloseTo(before! * 10 ** (r.gainDb / 20), 3);
  });

  it('a mix whose peak is not over the ceiling gets the gain only (no limiter): the same samples as before', async () => {
    const b = await mix(tone('steady', 0.04, 4), 4), plain = await mix(tone('steady', 0.04, 4), 4);
    const r = normalizeMix(b, -16);
    expect(r.limiterDb ?? 0).toBe(0);
    const g = 10 ** (r.gainDb / 20);
    for (const i of [1000, 24000, 100000]) expect(b.getChannelData(0)[i]).toBeCloseTo(plain.getChannelData(0)[i]! * g, 5);
  });

  it("an extreme mix (a click 30 dB over a very quiet bed) stops short, and says so: the limiter never takes more than 10 dB off, and the peak stays at or under -1 dBTP", async () => {
    const b = await mix(tone('extreme', 0.02, 4, { at: 2, peak: 0.6 }), 4);
    const r = normalizeMix(b, -16);
    expect(r.limited).toBe(true);
    expect(r.reachedLufs!).toBeLessThan(-16);
    expect(r.reachedLufs!).toBeCloseTo(lufs(b).integratedLufs!, 1);
    expect(r.limiterDb!).toBeLessThanOrEqual(10.5);
    const tp = measureLoudness([b.getChannelData(0), b.getChannelData(1)], SR).truePeakDb!;
    expect(tp).toBeLessThanOrEqual(-1 + 0.05);
    expect(tp).toBeGreaterThan(-1.6);                                         // and it went up to the ceiling (between the samples: a click of alternating samples is higher there): no gain is wasted
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
