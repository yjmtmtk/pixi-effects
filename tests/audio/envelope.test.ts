import { describe, it, expect, vi } from 'vitest';
import { computeEnvelope, bpmEnvelope } from '../../src/audio/envelope';

const SR = 44100;
/** A mono AudioBuffer-like built from a function of time. */
function signal(seconds: number, f: (t: number) => number, sampleRate = SR) {
  const data = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < data.length; i++) data[i] = f(i / sampleRate);
  return { sampleRate, numberOfChannels: 1, length: data.length, getChannelData: () => data };
}
const sine = (hz: number, amp = 0.8) => (t: number) => amp * Math.sin(2 * Math.PI * hz * t);
/** A kick drum: a 60 Hz sine with a fast decay, every `period` seconds. */
const kicks = (period: number, amp = 0.9) => (t: number) => { const dt = t % period; return amp * Math.sin(2 * Math.PI * 60 * dt) * Math.exp(-dt * 18); };

describe('computeEnvelope: what the sound is doing, frame by frame', () => {
  it('has one value per video frame for the level and for every band, between 0 and 1', () => {
    const env = computeEnvelope(signal(2, sine(440)), { frameRate: 30 });
    expect(env.frameRate).toBe(30);
    expect(env.duration).toBeCloseTo(2, 3);
    expect(env.frames).toBe(61);                                            // 0 … 60 inclusive
    for (const name of ['level', 'bass', 'mid', 'treble']) {
      expect(env.series[name]).toHaveLength(61);
      for (const v of env.series[name]!) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });

  it('silence is zero everywhere, with no beats and no tempo', () => {
    const env = computeEnvelope(signal(2, () => 0));
    expect(Math.max(...env.series.level!)).toBe(0);
    expect(Math.max(...env.series.bass!)).toBe(0);
    expect(env.beats).toEqual([]);
    expect(env.bpm).toBeNull();
  });

  it('a steady tone is a steady level, and lives in the band that holds its pitch', () => {
    const mid = computeEnvelope(signal(2, sine(800)));
    expect(mid.series.level![30]).toBeGreaterThan(0.9);
    expect(mid.series.mid![30]).toBeGreaterThan(0.9);
    expect(mid.series.bass![30]).toBeLessThan(0.1);
    expect(mid.series.treble![30]).toBeLessThan(0.1);
    const bass = computeEnvelope(signal(2, sine(70)));
    expect(bass.series.bass![30]).toBeGreaterThan(0.9);
    expect(bass.series.mid![30]).toBeLessThan(0.1);
    const treble = computeEnvelope(signal(2, sine(6000)));
    expect(treble.series.treble![30]).toBeGreaterThan(0.9);
    expect(treble.series.bass![30]).toBeLessThan(0.1);
  });

  it('it follows loudness: a tone that drops by 12 dB drops in level, on a log (perceptual) scale', () => {
    const env = computeEnvelope(signal(4, t => sine(800, t < 2 ? 0.8 : 0.2)(t)));
    const loud = env.series.level![30]!, quiet = env.series.level![90]!;
    expect(loud).toBeGreaterThan(0.9);
    expect(quiet).toBeGreaterThan(0.5); expect(quiet).toBeLessThan(0.8);       // 1 − 12 / 36 ≈ 0.67
  });

  it('a loud file and the same file at a tenth of the volume give the same shape (it is the shape that matters)', () => {
    const a = computeEnvelope(signal(2, sine(800, 0.8)));
    const b = computeEnvelope(signal(2, sine(800, 0.08)));
    expect(b.series.level![30]).toBeGreaterThan(0.9);
    expect(Math.abs(a.series.level![30]! - b.series.level![30]!)).toBeLessThan(0.1);
  });

  it('stereo is mixed down; a bad band range is an error that names the band', () => {
    const left = new Float32Array(SR).map((_, i) => 0.8 * Math.sin(2 * Math.PI * 800 * i / SR)), right = new Float32Array(SR);
    const stereo = { sampleRate: SR, numberOfChannels: 2, length: SR, getChannelData: (c: number) => (c === 0 ? left : right) };
    expect(computeEnvelope(stereo).series.mid![15]).toBeGreaterThan(0.8);
    expect(() => computeEnvelope(signal(1, sine(800)), { bands: { low: [500, 100] } })).toThrow(/low.*500.*100/s);
    expect(() => computeEnvelope(signal(1, sine(800)), { frameRate: 0 })).toThrow(/frameRate/);
  });

  it('your own bands, and a misspelt option is named', () => {
    const env = computeEnvelope(signal(2, sine(1000)), { bands: { voice: [300, 3400], air: [8000, 16000] } });
    expect(env.series.voice![30]).toBeGreaterThan(0.9);
    expect(env.series.air![30]).toBeLessThan(0.1);
    expect(env.series.bass).toBeUndefined();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    computeEnvelope(signal(1, sine(800)), { framerate: 24 } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/framerate.*frameRate/s));
    warn.mockRestore();
  });

  it('at(t, series) interpolates between frames, clamps outside, and defaults to the level', () => {
    const env = computeEnvelope(signal(2, sine(800)), { frameRate: 10 });
    const s = env.series.level!;
    expect(env.at(0.1)).toBeCloseTo(s[1]!, 9);
    expect(env.at(0.15)).toBeCloseTo((s[1]! + s[2]!) / 2, 9);
    expect(env.at(-5)).toBe(s[0]);
    expect(env.at(99)).toBe(s[s.length - 1]);
    expect(env.at(0.1, 'mid')).toBeCloseTo(env.series.mid![1]!, 9);
    expect(() => env.at(0, 'nope')).toThrow(/nope.*level.*bass/s);
  });
});

describe('computeEnvelope: beats', () => {
  it('finds the kicks of a 120 bpm pattern on the beat (within a frame or two), and the tempo', () => {
    const env = computeEnvelope(signal(8, kicks(0.5)), { frameRate: 30 });
    expect(env.beats.length).toBeGreaterThanOrEqual(14);
    expect(env.beats.length).toBeLessThanOrEqual(17);
    for (const b of env.beats) { const off = Math.abs(b / 0.5 - Math.round(b / 0.5)) * 0.5; expect(off).toBeLessThan(0.07); }
    expect(env.bpm).toBeGreaterThan(116); expect(env.bpm).toBeLessThan(124);
  });

  it('a slower pattern gives a slower tempo', () => {
    const env = computeEnvelope(signal(8, kicks(0.75)), { frameRate: 30 });
    expect(env.bpm).toBeGreaterThan(76); expect(env.bpm).toBeLessThan(84);                 // 80 bpm
  });

  it('a steady tone has no beats', () => {
    expect(computeEnvelope(signal(4, sine(60))).beats).toEqual([]);
  });

  it('is deterministic: the same sound gives the same beats', () => {
    const a = computeEnvelope(signal(4, kicks(0.5))), b = computeEnvelope(signal(4, kicks(0.5)));
    expect(a.beats).toEqual(b.beats);
  });
});

describe('bpmEnvelope: a stand-in with no audio file, on a tempo you choose', () => {
  it('has beats exactly on the beat, the tempo you asked for, and a pulse that decays after each', () => {
    const env = bpmEnvelope(120, { duration: 4, frameRate: 30 });
    expect(env.beats).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(env.bpm).toBe(120);
    expect(env.frames).toBe(121);
    expect(env.series.bass![0]).toBeCloseTo(1, 6);                                          // the kick, right on the beat
    expect(env.series.bass![7]).toBeLessThan(env.series.bass![2]!);                         // decaying
    expect(env.series.bass![15]).toBeCloseTo(1, 6);                                         // the next beat
  });

  it('the bands play different parts: bass on every beat, mid on the off-beats (a snare on 2 and 4), treble on the eighths', () => {
    const env = bpmEnvelope(120, { duration: 4, frameRate: 30 });
    const f = (t: number) => Math.round(t * 30);
    expect(env.series.mid![f(0)]).toBeLessThan(0.2);                                        // beat 1: no snare
    expect(env.series.mid![f(0.5)]).toBeGreaterThan(0.9);                                   // beat 2: snare
    const slow = bpmEnvelope(90, { duration: 4, frameRate: 30 });                           // (90 bpm: the eighth at 1/3 s is exactly frame 10)
    expect(slow.series.treble![10]).toBeGreaterThan(0.9);                                   // an eighth in between the beats
    expect(slow.series.treble![5]).toBeLessThan(slow.series.treble![10]!);
    expect(env.series.level![f(0)]).toBeGreaterThan(0.9);
  });

  it('is deterministic, validates, and may swing', () => {
    expect(bpmEnvelope(100, { duration: 2 }).series.level).toEqual(bpmEnvelope(100, { duration: 2 }).series.level);
    expect(() => bpmEnvelope(0, { duration: 2 })).toThrow(/bpm/);
    expect(() => bpmEnvelope(120, { duration: 0 })).toThrow(/duration/);
  });
});

import { audioEnvelope } from '../../src/audio/envelope';
import { afterEach, beforeEach } from 'vitest';

describe('audioEnvelope(source): decode a file, then analyse it', () => {
  const tone = signal(2, sine(800));
  let decoded: unknown[] = [];
  beforeEach(() => {
    decoded = [];
    vi.stubGlobal('OfflineAudioContext', class { constructor(public ch: number, public len: number, public rate: number) {} async decodeAudioData(data: ArrayBuffer) { decoded.push(data); if (new Uint8Array(data)[0] === 0xff) throw new Error('bad data'); return tone; } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('missing') ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } : { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches a URL, decodes it and returns the envelope', async () => {
    const env = await audioEnvelope('music/loop.mp3', { frameRate: 30 });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('music/loop.mp3');
    expect(env.series.mid![30]).toBeGreaterThan(0.9);
    expect(env.frames).toBe(61);
  });

  it('takes a Blob / File, an ArrayBuffer, or an AudioBuffer you already have', async () => {
    await audioEnvelope(new Blob([new Uint8Array([1, 2, 3])]));
    await audioEnvelope(new Uint8Array([1, 2, 3]).buffer);
    expect(decoded).toHaveLength(2);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    const env = await audioEnvelope(tone as unknown as AudioBuffer);
    expect(decoded).toHaveLength(2);                                            // an AudioBuffer is not decoded again
    expect(env.series.level![10]).toBeGreaterThan(0.9);
  });

  it('a file that cannot be fetched or decoded says which and why', async () => {
    await expect(audioEnvelope('music/missing.mp3')).rejects.toThrow(/music\/missing\.mp3.*404/s);
    await expect(audioEnvelope(new Uint8Array([0xff, 0, 0]).buffer)).rejects.toThrow(/could not decode.*bad data/s);
  });
});
