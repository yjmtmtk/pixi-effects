import { describe, it, expect } from 'vitest';
import { analyzeAudio, inspectSound } from '../../src/core/inspectAudio';
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
  it('a music layer\'s summary is passed through to its source, so the report can say what the score is', () => {
    const music = { bpm: 120, meter: 4, beats: 8, bars: 2, seconds: 4, tail: 2.5, tracks: [{ inst: 'keys', beats: 8, bars: 2, events: 2, perBar: ['C', 'G'] }], drums: [] };
    const r = analyzeAudio(pcm(4, t => 0.3 * Math.sin(2 * Math.PI * 1000 * t)), [{ ...src('layer "m"', 'music', 0, 4), music }], { peak: 0.3, peakAt: 1 }, 4, { window: 1 });
    expect(r.sources[0]!.music).toEqual(music);
    expect(analyzeAudio(pcm(4, () => 0.3), [src('layer "s"', 'sfx "pop"', 0, 1)], { peak: 0.3, peakAt: 0 }, 4, { window: 1 }).sources[0]).not.toHaveProperty('music');
  });
  it('a written music score much longer than what plays is a NOTE (advice, not a fault: music that outlasts the movie ends with it): how long it is and how much plays', () => {
    const music = (seconds: number) => ({ bpm: 100, meter: 4, beats: Math.round(seconds * 100 / 60), bars: 1, seconds, tail: 2.5, tracks: [], drums: [] });
    const run = (seconds: number, movie: number, start = 0, end = movie, loop = false) => analyzeAudio(pcm(movie, t => 0.2 * Math.sin(2 * Math.PI * 1000 * t)),
      [{ ...src('layer "bgm"', 'music', start, end), loop, music: music(seconds) }], { peak: 0.2, peakAt: 1 }, movie, { window: 1 });
    const long = run(19.2, 10);
    expect(long.issues.some(i => /bgm/.test(i) && /cut off/.test(i))).toBe(false);        // not a fault: a loop-style movie ends its music with it on purpose
    const note = long.notes.find(n => /bgm/.test(n))!;
    expect(note).toMatch(/layer "bgm" \(music\): the score is 19\.2s long but only 10s of it play/);
    expect(note).toMatch(/fewer bars/);
    expect(run(10, 10).notes.some(n => /score is/.test(n))).toBe(false);                   // fits
    expect(run(11.5, 10).notes.some(n => /score is/.test(n))).toBe(false);                 // a little over: a tail, not a cut
    expect(run(24, 12, 4).notes.find(n => /score is/.test(n))).toMatch(/only 8s of it play/);        // it starts at 4 s
    expect(run(24, 12, 0, 8).notes.find(n => /score is/.test(n))).toMatch(/only 8s of it play/);     // the LAYER ends at 8 s, before the movie does
    expect(run(19.2, 10, 0, 10, true).notes.some(n => /score is/.test(n))).toBe(false);    // a looping layer is meant to be cut
  });
  it('a sound the clock of its composition cuts short is said to be cut by the CLOCK (not by the end of the movie)', () => {
    const mix = pcm(11, t => (t >= 4 && t < 5.5 ? 0.3 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    // a 1.4 s sound at local 4.0 .. 5.4 in a composition whose clock runs 0 -> 4.5 and then stands still: the sound stops at 4.5 of its own time
    const cut: AudioDescriptor = { ...src('layer "sfx-chime"', 'sfx "chime"', 4, 5.4), warp: t => Math.min(t, 4.5) };
    const r = analyzeAudio(mix, [cut], { peak: 0.3, peakAt: 4.2 }, 11, { window: 1 });
    expect(r.issues.filter(i => /cut off/.test(i))).toEqual([expect.stringMatching(/layer "sfx-chime".*is cut off: its composition's clock only reaches 4\.50s \(the sound is 5\.40s long\)/)]);
    expect(r.issues.some(i => /cut off by the end of the movie/.test(i))).toBe(false);
  });
  it('a sound the clock lets finish is not cut off, even when it plays to the end of the movie', () => {
    const mix = pcm(4, t => (t >= 1 ? 0.3 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    const whole: AudioDescriptor = { ...src('layer "ok"', 'sfx "chime"', 3, 4), warp: t => (t < 1 ? NaN : 0.5 * (t - 1) + 3) };
    expect(analyzeAudio(mix, [whole], { peak: 0.3, peakAt: 1 }, 4, { window: 1 }).issues.filter(i => /cut off/.test(i))).toEqual([]);
  });

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

describe('analyzeAudio: a sound buried under the rest of the mix (an author who cannot listen needs the number)', () => {
  const loud = (t: number) => 0.5 * Math.sin(2 * Math.PI * 300 * t);                      // the bed: about −6 dBFS the whole time
  const sfx = (layer: string, start: number, amp: number): AudioDescriptor => ({
    synth: { key: layer, render: () => [tone(1000, 1, amp), tone(1000, 1, amp)] as [Float32Array, Float32Array] },
    layer, source: `sfx "${layer}"`, loop: false, start, end: start + 1, initialVolume: 1, volumeKeyframes: [],
  });
  const bed: AudioDescriptor = { ...src('layer "bed"', 'music', 0, 6), synth: { key: 'bed', render: () => [tone(300, 6, 0.5), tone(300, 6, 0.5)] as [Float32Array, Float32Array] } };
  const run = (amp: number) => analyzeAudio(pcm(6, t => loud(t) + (t >= 2 && t < 3 ? amp * Math.sin(2 * Math.PI * 1000 * t) : 0)), [bed, sfx('hit', 2, amp)], { peak: 0.5 + amp, peakAt: 2 }, 6, { window: 1 });

  it('each source says how far below the loudest sample of the mix (itself included) around its own loudest moment it is: an equal bed makes 6 dB, a tenth of its amplitude 20', () => {
    const quiet = run(0.04).sources.find(x => x.layer === 'hit')!;
    expect(quiet.belowMixDb).toBeGreaterThan(15);
    expect(run(0.5).sources.find(x => x.layer === 'hit')!.belowMixDb).toBeCloseTo(6, 0);                // as loud as the bed: the sum is 6 dB above it
  });

  it('short sound effects more than 12 dB under the mix get ONE note: how many, the worst one by name, the two levels and the moment', () => {
    const note = run(0.04).notes.find(n => /hit/.test(n))!;
    expect(note).toMatch(/1 sound effect is buried/);
    expect(note).toMatch(/the worst is hit \(sfx "hit"\)/);
    expect(note).toMatch(/buried/);
    expect(note).toMatch(/dBFS/);
    expect(note).toMatch(/at 2(\.\d+)? s/);
    expect(run(0.5).notes.some(n => /buried/.test(n))).toBe(false);
  });

  it('a music bed is never "buried", and a sound under the limit of 12 dB is left alone', () => {
    expect(run(0.04).notes.some(n => /bed/.test(n) && /buried/.test(n))).toBe(false);
    expect(run(0.3).notes.some(n => /buried/.test(n))).toBe(false);                       // about 9 dB under: still audible
  });

  it('layers with no name are counted one by one (they all carry the same label), and the volume is printed rounded', () => {
    const bedMix = pcm(8, t => loud(t) + (((t >= 2 && t < 3) || (t >= 4 && t < 5) || (t >= 6 && t < 7)) ? 0.04 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    const unnamed = (start: number): AudioDescriptor => ({ ...sfx('hit', start, 0.04), layer: undefined, volumeKeyframes: [], initialVolume: 0.30038536902602725 });
    const r = analyzeAudio(bedMix, [bed, unnamed(2), unnamed(4), unnamed(6)], { peak: 0.54, peakAt: 2 }, 8, { window: 1 });
    const note = r.notes.find(n => /buried/.test(n))!;
    expect(note).toMatch(/3 sound effects are buried/);
    expect(note).not.toMatch(/0\.30038/);
    expect(note).toMatch(/volume 0\.3\b/);
  });

  it('many of them, however often they play, are still one note that counts the distinct ones', () => {
    const bedMix = pcm(8, t => loud(t) + (((t >= 2 && t < 3) || (t >= 4 && t < 5)) ? 0.04 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    const r = analyzeAudio(bedMix, [bed, sfx('hit', 2, 0.04), sfx('hit', 4, 0.04), sfx('pop', 6, 0.04)], { peak: 0.54, peakAt: 2 }, 8, { window: 1 });
    expect(r.notes.filter(n => /buried/.test(n))).toHaveLength(1);
  });

  it('a sound with its own speed (sourceMap) is not measured: its loudest moment is not start + loudestAt', () => {
    const slowed: AudioDescriptor = { ...sfx('hit', 2, 0.04), sourceMap: (t: number) => t * 0.5 } as AudioDescriptor;
    const r = analyzeAudio(pcm(6, t => loud(t)), [bed, slowed], { peak: 0.5, peakAt: 2 }, 6, { window: 1 });
    expect(r.sources.find(x => x.layer === 'hit')).not.toHaveProperty('belowMixDb');
    expect(r.notes.some(n => /buried/.test(n))).toBe(false);
  });
});

describe('inspectSound: the sound of ANY file, measured with the code `check` uses for a movie', () => {
  const SR = 48000;
  /** A stereo 997 Hz sine at `dbfs` peak for `seconds`, with `gap` seconds of silence from `gapAt`. */
  const tone = (dbfs: number, seconds = 4, gap?: { at: number; for: number }) => {
    const n = Math.round(SR * seconds), amp = 10 ** (dbfs / 20), d = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; d[i] = gap && t >= gap.at && t < gap.at + gap.for ? 0 : Math.max(-1, Math.min(1, amp * Math.sin(2 * Math.PI * 997 * t))); }
    return { numberOfChannels: 2, sampleRate: SR, length: n, getChannelData: () => d };
  };

  it('a sine 6 dB lower is 6.0 ± 0.1 LU quieter (the loudness is BS.1770, not a guess)', () => {
    const a = inspectSound(tone(-20)).loudness.integratedLufs!, b = inspectSound(tone(-26)).loudness.integratedLufs!;
    expect(a - b).toBeGreaterThan(5.9);
    expect(a - b).toBeLessThan(6.1);
    expect(a).toBeLessThan(-15);
    expect(a).toBeGreaterThan(-30);
  });

  it('says its length, rate and channels; a sine with a gap has one silence of that gap; a clean sine has none and clips nothing', () => {
    const r = inspectSound(tone(-20, 6, { at: 2, for: 2 }));
    expect([r.duration, r.sampleRate, r.channels]).toEqual([6, SR, 2]);
    expect(r.loudness.silences).toHaveLength(1);
    expect(r.loudness.silences[0]!.from).toBeCloseTo(2, 1);
    expect(r.loudness.silences[0]!.to).toBeCloseTo(4, 1);
    const clean = inspectSound(tone(-20));
    expect(clean.loudness.silences).toEqual([]);
    expect(clean.loudness.clippedSamples).toBe(0);
  });

  it('counts the samples that hit full scale (a sine pushed past 0 dBFS and clipped)', () => {
    const loud = tone(6);                                                       // +6 dB, clipped to ±1 by the helper
    expect(inspectSound(loud).loudness.clippedSamples).toBeGreaterThan(100);
    expect(inspectSound(loud).peakDb).toBeGreaterThanOrEqual(-0.1);
  });

  it('the numbers are the ones analyzeAudio gives for the same samples (check and sound cannot disagree), and `window` sets the level rows', () => {
    const pcm = tone(-20);
    const whole = analyzeAudio(pcm, [], null, 4).loudness;
    expect(inspectSound(pcm).loudness).toEqual(whole);
    expect(inspectSound(pcm, { window: 1 }).windows.length).toBeLessThanOrEqual(5);
    expect(inspectSound(pcm, { window: 1 }).windows[0]).toMatchObject({ t: 0 });
    expect(Object.keys(inspectSound(pcm, { window: 1 }).windows[0]!).sort()).toEqual(['rmsDb', 't']);
  });

  it('a last window that is only a sliver of the window (a file that ends 36 ms into the next second) is not a row of its own', () => {
    const pcm = tone(-20, 3.036);                                                // 3 whole seconds and 36 ms
    const rows = inspectSound(pcm, { window: 1 }).windows;
    expect(rows.map(w => w.t)).toEqual([0, 1, 2]);
    expect(inspectSound(tone(-20, 3.6), { window: 1 }).windows.map(w => w.t)).toEqual([0, 1, 2, 3]);      // a window of 0.6 s is kept
    expect(inspectSound(tone(-20, 0.3), { window: 1 }).windows.length).toBe(1);                       // a short sound keeps its one row
  });

  it('a sound shorter than 0.4 s has no integrated loudness (null), not a made-up number', () => {
    expect(inspectSound(tone(-20, 0.2)).loudness.integratedLufs).toBeNull();
  });
});

