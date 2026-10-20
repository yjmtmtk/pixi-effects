import { describe, it, expect } from 'vitest';
import { mixdown, normalizeMix, cleanMix, type AudioDescriptor } from '../../src/core/AudioMixer';
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
    const r = await normalizeMix(b, -16);
    expect(r.gainDb).toBeGreaterThan(10);
    expect(lufs(b).integratedLufs!).toBeCloseTo(-16, 0);
    expect(r.limited).toBe(false);
    expect(r.reachedLufs).toBeCloseTo(lufs(b).integratedLufs!, 1);
  });

  it('brings a loud mix down to the target too (a target, not a floor)', async () => {
    const b = await mix(tone('loud', 0.9, 4), 4);
    expect(lufs(b).integratedLufs!).toBeGreaterThan(-8);
    const r = await normalizeMix(b, -16);
    expect(r.gainDb).toBeLessThan(-5);
    expect(lufs(b).integratedLufs!).toBeCloseTo(-16, 0);
  });

  it('reaches the target with a click on top of a quiet bed: a limiter takes the click down (a trial: 5 of 16 films stopped at -17 to -20 for want of this)', async () => {
    const b = await mix(tone('peaky', 0.05, 4, { at: 2, peak: 0.5 }), 4);     // the click is 20 dB over the bed
    const r = await normalizeMix(b, -16);
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
    const r = await normalizeMix(peaky, -16);
    const before = plain.getChannelData(0)[24000];                          // 0.5 s in, 2.5 s before the click
    expect(peaky.getChannelData(0)[24000]).toBeCloseTo(before! * 10 ** (r.gainDb / 20), 3);
  });

  it('a mix whose peak is not over the ceiling gets the gain only (no limiter): the same samples as before', async () => {
    const b = await mix(tone('steady', 0.04, 4), 4), plain = await mix(tone('steady', 0.04, 4), 4);
    const r = await normalizeMix(b, -16);
    expect(r.limiterDb ?? 0).toBe(0);
    const g = 10 ** (r.gainDb / 20);
    for (const i of [1000, 24000, 100000]) expect(b.getChannelData(0)[i]).toBeCloseTo(plain.getChannelData(0)[i]! * g, 5);
  });

  it("an extreme mix (a click 30 dB over a very quiet bed) stops short, and says so: the limiter never takes more than 10 dB off, and the peak stays at or under -1 dBTP", async () => {
    const b = await mix(tone('extreme', 0.02, 4, { at: 2, peak: 0.6 }), 4);
    const r = await normalizeMix(b, -16);
    expect(r.limited).toBe(true);
    expect(r.reachedLufs!).toBeLessThan(-16);
    expect(Math.abs(r.reachedLufs! - lufs(b).integratedLufs!)).toBeLessThanOrEqual(0.11);
    expect(r.limiterDb!).toBeLessThanOrEqual(10.5);
    const tp = measureLoudness([b.getChannelData(0), b.getChannelData(1)], SR).truePeakDb!;
    expect(tp).toBeLessThanOrEqual(-1 + 0.05);
    expect(tp).toBeGreaterThan(-1.6);                                         // and it went up to the ceiling (between the samples: a click of alternating samples is higher there): no gain is wasted
  });

  it('leaves silence alone (nothing to measure)', async () => {
    const b = await mix(tone('nothing', 0, 2), 2);
    const r = await normalizeMix(b, -16);
    expect(r).toEqual({ target: -16, gainDb: 0, reachedLufs: null, limited: false });
    expect(peakOf(b)).toBe(0);
  });

  it('is the same every time: the same mix gives the same samples', async () => {
    const a = await mix(tone('same', 0.05, 3), 3), c = await mix(tone('same', 0.05, 3), 3);
    await normalizeMix(a, -16); await normalizeMix(c, -16);
    expect(Array.from(a.getChannelData(0).slice(1000, 1010))).toEqual(Array.from(c.getChannelData(0).slice(1000, 1010)));
  });
});

/** A bed of 0.02 under short noise bursts (a hat every second): a noisy peak is the case where a lowered sample ceiling does not lower the true peak (review 2026-10-20). */
const hats = (key: string, seconds: number): AudioDescriptor['synth'] => ({ key, render: (sr: number) => {
  const n = Math.round(sr * seconds), ch = new Float32Array(n); let seed = 12345;
  for (let i = 0; i < n; i++) ch[i] = 0.02 * Math.sin(2 * Math.PI * 220 * i / sr);
  for (let b = 1; b < seconds; b++) for (let i = 0; i < Math.round(0.04 * sr); i++) { seed = (seed * 1664525 + 1013904223) >>> 0; ch[Math.round(b * sr) + i] += 0.5 * ((seed / 2 ** 32) * 2 - 1); }
  return [ch, Float32Array.from(ch)];
} });

describe('normalizeMix: what the review of 2026-10-20 found', () => {
  it('the true peak is held at -1 dBTP on a drum loop of noise hats (a lowered sample ceiling made it worse there), and the result describes the buffer it left', async () => {
    const loop: AudioDescriptor['synth'] = { key: 'loop', render: (sr: number) => {
      const n = Math.round(sr * 8), ch = new Float32Array(n); let seed = 777;
      for (let t = 0; t < 8; t += 0.25) for (let i = 0; i < Math.round(0.03 * sr); i++) { seed = (seed * 1664525 + 1013904223) >>> 0; ch[Math.round(t * sr) + i] += 0.3 * ((seed / 2 ** 32) * 2 - 1); }
      for (let t = 0; t < 8; t += 1) for (let i = 0; i < Math.round(0.15 * sr); i++) ch[Math.round(t * sr) + i] += 0.6 * Math.sin(2 * Math.PI * 60 * i / sr) * (1 - i / (0.15 * sr));
      return [ch, Float32Array.from(ch)];
    } };
    const b = await mix(loop, 8);
    const r = await normalizeMix(b, -12);
    const m = measureLoudness([b.getChannelData(0), b.getChannelData(1)], SR);
    expect(m.truePeakDb!).toBeLessThanOrEqual(-1 + 0.05);
    expect(r.reachedLufs!).toBeCloseTo(m.integratedLufs!, 1);                // what it says it reached is what the buffer measures
  });

  it('a target out of reach is said to be (limited) and the reported gain is still the gain applied', async () => {
    const b = await mix(hats('hats2', 6), 6), before = Float32Array.from(b.getChannelData(0));
    const r = await normalizeMix(b, -4);
    expect(r.limited).toBe(true);
    const i = Math.round(5.6 * SR);
    expect(20 * Math.log10(Math.abs(b.getChannelData(0)[i]!) / Math.abs(before[i]!))).toBeCloseTo(r.gainDb, 1);
  });

  it('it lets the page paint between its passes when asked to (a minute of mix took seconds in one block)', async () => {
    const b = await mix(tone('peaky2', 0.05, 4, { at: 2, peak: 0.5 }), 4);
    let yields = 0;
    await normalizeMix(b, -16, async () => { yields++; });
    expect(yields).toBeGreaterThan(0);
  });

  it('cleanMix: an Infinity or a NaN in the mix is made silent and counted (it silenced the whole film, or left the rest of it unmeasured)', async () => {
    const b = await mix(tone('bad', 0.1, 2), 2);
    b.getChannelData(0)[1000] = Infinity; b.getChannelData(1)[2000] = NaN; b.getChannelData(0)[3000] = -Infinity;
    const bad = cleanMix(b);
    expect(bad.count).toBe(3);
    expect(bad.firstAt).toBeCloseTo(1000 / SR, 6);
    expect(Array.from(b.getChannelData(0)).every(Number.isFinite) && Array.from(b.getChannelData(1)).every(Number.isFinite)).toBe(true);
    const r = await normalizeMix(b, -16);
    expect(Number.isFinite(r.gainDb)).toBe(true);
    expect(cleanMix(b).count).toBe(0);
  });
});

