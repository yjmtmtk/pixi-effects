import { describe, it, expect } from 'vitest';
import { analyzeAudio } from '../../src/core/inspectAudio';
import type { AudioDescriptor } from '../../src/types';

const SR = 8000;
const tone = (hz: number, seconds: number, amp: number) =>
  Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
function pcm(seconds: number, fill: (t: number) => number) {
  const d = Float32Array.from({ length: seconds * SR }, (_, i) => fill(i / SR));
  return { numberOfChannels: 1, sampleRate: SR, length: d.length, getChannelData: () => d };
}
const src = (layer: string, source: string, start: number, end: number, synth = true): AudioDescriptor => ({
  ...(synth ? { synth: { key: layer, render: () => [tone(1000, end - start, 0.5), tone(1000, end - start, 0.5)] as [Float32Array, Float32Array] } } : {}),
  ...(synth ? {} : { buffer: { numberOfChannels: 1, sampleRate: SR, length: 6 * SR, getChannelData: () => tone(200, 6, 0.1) } as unknown as AudioBuffer }),
  layer, source, loop: false, start, end, initialVolume: 1, volumeKeyframes: [],
});

describe('analyzeAudio', () => {
  it('measures every sound on its own (length, level, loudest moment, brightness) and the mix over time', () => {
    const mix = pcm(2, t => (t >= 0.5 && t < 0.7 ? 0.5 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    const r = analyzeAudio(mix, [src('layer "beep"', 'sfx "beep"', 0.5, 0.7)], { peak: 0.5, peakAt: 0.5 }, 2, { window: 0.5 });
    expect(r.windows.map(w => w.t)).toEqual([0, 0.5, 1, 1.5]);
    expect(r.windows[0]!.rmsDb).toBe(-120);
    expect(r.windows[0]!.brightnessHz).toBe(0);
    expect(r.windows[1]!.peakDb).toBeCloseTo(-6, 0);
    expect(r.windows[1]!.brightnessHz).toBeGreaterThan(900);
    expect(r.windows[1]!.brightnessHz).toBeLessThan(1100);
    const s = r.sources[0]!;
    expect([s.layer, s.source, s.start, s.end]).toEqual(['layer "beep"', 'sfx "beep"', 0.5, 0.7]);
    expect(s.peakDb).toBeCloseTo(-6, 0);
    expect(s.sound.length).toBeCloseTo(0.2, 3);
    expect(s.sound.peakDb).toBeCloseTo(-6, 0);
    expect(s.sound.loudestAt).toBeLessThan(0.2);
    expect(s.sound.brightnessHz).toBeGreaterThan(900);
    expect(s.sound.brightnessHz).toBeLessThan(1100);
    expect(r.issues).toEqual([]);
  });

  it('flags limiting, inaudible sources and an sfx cut off by the end of the movie', () => {
    const mix = pcm(2, t => (t < 0.3 ? 0.9 : t > 1.9 ? 0.5 : 0));
    const r = analyzeAudio(mix, [
      src('layer "a"', 'sfx "hit"', 0, 0.3),
      src('layer "quiet"', 'sfx "pop"', 1, 1.1),
      src('layer "late"', 'sfx "chime"', 1.9, 3.3),
      src('layer "bgm"', 'asset "bgm"', 0, 6, false),
    ], { peak: 1.4, peakAt: 0.1 }, 2);
    expect(r.issues).toHaveLength(3);
    expect(r.issues[0]).toContain('limited');
    expect(r.issues.some(i => i.includes('layer "quiet"') && i.includes('inaudible'))).toBe(true);
    expect(r.issues.some(i => i.includes('layer "late"') && i.includes('cut off'))).toBe(true);
    expect(r.issues.some(i => i.includes('layer "bgm"'))).toBe(false);   // a long music file ending with the movie is normal
    expect(r.sources.find(s => s.layer === 'layer "bgm"')!.sound.length).toBe(6);
  });

  it('says so when there is no audio at all', () => {
    const r = analyzeAudio(null, [], null, 5);
    expect(r.sources).toEqual([]);
    expect(r.issues[0]).toContain('no audio');
  });
});

describe('analyzeAudio — a layer made inaudible by its own volume, and a sane window', () => {
  it('flags a layer whose volume makes it inaudible even while something loud plays at the same time', () => {
    const mix = pcm(2, t => (t >= 1 && t < 1.1 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0));      // a loud chime is playing
    const quiet: AudioDescriptor = { ...src('layer "quiet"', 'sfx "pop"', 1, 1.1), initialVolume: 0.0001 };
    const loud = src('layer "chime"', 'sfx "chime"', 1, 1.1);
    const r = analyzeAudio(mix, [quiet, loud], { peak: 0.5, peakAt: 1 }, 2);
    expect(r.issues.some(i => i.includes('layer "quiet"') && i.includes('inaudible'))).toBe(true);
    expect(r.issues.some(i => i.includes('layer "chime"'))).toBe(false);
  });

  it('a layer whose volume is animated up later is not flagged for its starting volume', () => {
    const mix = pcm(2, t => (t >= 1 && t < 1.1 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0));
    const fadeIn: AudioDescriptor = { ...src('layer "fadein"', 'sfx "hit"', 1, 1.1), initialVolume: 0, volumeKeyframes: [{ time: 1.05, value: 0 }, { time: 1.1, value: 1 }] };
    const r = analyzeAudio(mix, [fadeIn], { peak: 0.5, peakAt: 1 }, 2);
    expect(r.issues.some(i => i.includes('inaudible'))).toBe(false);
  });

  it('a tiny `window` cannot ask for a million FFT windows', () => {
    const mix = pcm(1, () => 0);
    const r = analyzeAudio(mix, [], null, 1, { window: 1e-6 });
    expect(r.windows.length).toBeLessThanOrEqual(100);
  });
});

