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
  it('a sound inside a remapped composition is reported when it plays in the MOVIE\'s time, not in the composition\'s local time (no false "after the movie ends")', () => {
    const mix = pcm(4, t => (t >= 1 && t < 3 ? 0.5 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    // local time 0..4 of a composition at 0.5x that starts at movie time 1: the sound (local 0..1) plays in movie time 1..3; local 3..4 would be "after the movie" at 1x
    const warped: AudioDescriptor = { ...src('layer "late"', 'sfx "chime"', 0, 1), start: 3, end: 4, warp: t => (t < 1 ? NaN : 0.5 * (t - 1) + 3) };
    const r = analyzeAudio(mix, [warped], { peak: 0.5, peakAt: 1 }, 4, { window: 1 });
    const s = r.sources[0]!;
    expect(s.start).toBeCloseTo(1 + 0, 1);                                 // local 3 is reached at movie time 1
    expect(s.end).toBeCloseTo(3, 1);                                       // local 4 at movie time 3
    expect(r.issues.filter(i => /after the movie ends/.test(i))).toEqual([]);
  });

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
    const mix = pcm(2, t => (t < 0.3 ? 0.8 : t > 1.9 ? 0.5 : 0));       // 0.8, not 0.9: a hard step from 0.9 to 0 overshoots past 0 dBTP between samples
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

  describe('loudness, scenes, cues and notes', () => {
    const SR2 = 8000;
    const stereo = (seconds: number, fill: (t: number) => number) => {
      const d = Float32Array.from({ length: Math.round(seconds * SR2) }, (_, i) => fill(i / SR2));
      return { numberOfChannels: 2, sampleRate: SR2, length: d.length, getChannelData: () => d };
    };
    const hum = (amp: number) => (t: number) => amp * Math.sin(2 * Math.PI * 997 * t);

    it('measures the mix: integrated LUFS and true peak, no clipped samples', () => {
      const r = analyzeAudio(stereo(4, hum(10 ** (-20 / 20))), [], { peak: 0.1, peakAt: 0 }, 4);
      expect(Math.abs(r.loudness.integratedLufs! + 20)).toBeLessThan(0.2);
      expect(r.loudness.clippedSamples).toBe(0);
      expect(r.loudness.truePeakDb).toBeLessThan(-19);
    });

    it('measures each scene on its own, and marks a silent one', () => {
      const mix = stereo(4, t => (t < 2 ? hum(10 ** (-20 / 20))(t) : 0));
      const r = analyzeAudio(mix, [], { peak: 0.1, peakAt: 0 }, 4, { scenes: [{ name: 'intro', start: 0, end: 2 }, { name: 'quiet end', start: 2, end: 4 }] });
      expect(r.scenes.map(s => s.name)).toEqual(['intro', 'quiet end']);
      expect(Math.abs(r.scenes[0]!.lufs! + 20)).toBeLessThan(0.3);
      expect(r.scenes[0]!.silent).toBe(false);
      expect(r.scenes[1]!.silent).toBe(true);
      expect(r.scenes[1]!.lufs).toBeNull();
    });

    it('without scenes the whole movie is one scene', () => {
      const r = analyzeAudio(stereo(2, hum(0.1)), [], { peak: 0.1, peakAt: 0 }, 2);
      expect(r.scenes).toHaveLength(1);
      expect([r.scenes[0]!.from, r.scenes[0]!.to]).toEqual([0, 2]);
    });

    it('lists when each sound starts (the cues the waveform ticks)', () => {
      const r = analyzeAudio(pcm(2, () => 0.2), [src('layer "a"', 'sfx "pop"', 0.5, 0.7), src('layer "b"', 'sfx "hit"', 1.25, 1.5)], null, 2);
      expect(r.cues).toEqual([{ t: 0.5, name: 'layer "a" (sfx "pop")' }, { t: 1.25, name: 'layer "b" (sfx "hit")' }]);
    });

    it('clipping and a true peak above 0 dBTP are issues (the file would distort); a quiet, loud or silent mix is only a note', () => {
      const clipped = analyzeAudio(stereo(1, t => (Math.sin(2 * Math.PI * 100 * t) > 0 ? 1 : -1)), [], { peak: 1, peakAt: 0 }, 1);
      expect(clipped.issues.some(i => i.includes('full scale'))).toBe(true);
      const quiet = analyzeAudio(stereo(3, hum(10 ** (-45 / 20))), [], { peak: 0.01, peakAt: 0 }, 3);
      expect(quiet.issues).toEqual([]);
      expect(quiet.notes.some(n => /quiet/.test(n) && /14/.test(n))).toBe(true);
      const gap = analyzeAudio(stereo(5, t => (t < 1 ? hum(0.1)(t) : 0)), [], { peak: 0.1, peakAt: 0 }, 5);
      expect(gap.issues).toEqual([]);
      expect(gap.notes.some(n => /silent from 1(\.\d+)? s to 5(\.\d+)? s/.test(n))).toBe(true);
    });

    it('a movie of sparse sound effects does not bury the report in silence notes: three are listed, the rest counted', () => {
      const mix = stereo(12, t => (Math.floor(t) % 2 === 0 && t % 1 < 0.1 ? hum(0.1)(t) : 0));      // a blip every 2 s: six long silences
      const r = analyzeAudio(mix, [], { peak: 0.1, peakAt: 0 }, 12);
      const silent = r.notes.filter(n => /silent from/.test(n));
      expect(silent).toHaveLength(3);
      expect(r.notes.some(n => /and 3 more silent stretch/.test(n))).toBe(true);
      expect(r.loudness.silences.length).toBe(6);                                                      // the data keeps all of them
    });

    it('no audio: empty values, never undefined (a caller can always read them)', () => {
      const r = analyzeAudio(null, [], null, 5);
      expect(r.loudness).toEqual({ integratedLufs: null, truePeakDb: -120, clippedSamples: 0, silences: [] });
      expect([r.scenes, r.cues, r.notes]).toEqual([[], [], []]);
    });
  });
});
