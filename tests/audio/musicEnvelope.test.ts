import { describe, it, expect, vi } from 'vitest';
import { musicEnvelope } from '../../src/audio/musicEnvelope';

const music = {
  bpm: 120, seed: 2,
  tracks: [{ inst: 'bass', notes: 'c2:2 g1:2 c2:2 g1:2' }, { inst: 'bell', notes: '_:4 c6:1 e6:1 g6:2' }],
  drums: { kick: 'x.......' },
};

describe('musicEnvelope()', () => {
  it('analyses the sound the layer will play: level and bands per frame, as long as the music plus its tail', async () => {
    const env = await musicEnvelope(music, { frameRate: 30 });
    expect(env.frameRate).toBe(30);
    expect(Object.keys(env.series).sort()).toEqual(['bass', 'level', 'mid', 'treble']);
    expect(env.duration).toBeCloseTo(4 + 2.5, 1);
    expect(env.series.level!.length).toBe(env.frames);
    expect(Math.max(...env.series.level!)).toBeGreaterThan(0.9);
  });

  it('bass-heavy music has more bass early, and the bell makes treble appear later (the series follow the notes)', async () => {
    const env = await musicEnvelope(music, { frameRate: 30 });
    const mean = (s: Float32Array, t0: number, t1: number) => { let a = 0, n = 0; for (let f = Math.round(t0 * 30); f < Math.round(t1 * 30); f++) { a += s[f]!; n++; } return a / n; };
    expect(mean(env.series.treble!, 2.1, 3.4)).toBeGreaterThan(mean(env.series.treble!, 0.2, 1.5) + 0.1);
    expect(mean(env.series.bass!, 0.1, 0.4)).toBeGreaterThan(0.4);
  });

  it('the beats are exact (the kick hits) and bpm is the starting tempo', async () => {
    const env = await musicEnvelope(music, { frameRate: 30 });
    expect(env.beats.map(t => Math.round(t * 1000) / 1000)).toEqual([0, 1, 2, 3]);
    expect(env.bpm).toBe(120);
    const slowing = await musicEnvelope({ ...music, bpm: [[0, 90], [8, 60]], drums: undefined }, { frameRate: 30 });
    expect(slowing.bpm).toBe(90);
    expect(slowing.beats[0]).toBe(0);
  });

  it('at() reads a series at a time, and custom bands work like audioEnvelope', async () => {
    const env = await musicEnvelope(music, { frameRate: 24, bands: { low: [20, 200], high: [2000, 9000] } });
    expect(Object.keys(env.series).sort()).toEqual(['high', 'level', 'low']);
    expect(env.at(0.1, 'low')).toBeGreaterThanOrEqual(0);
    expect(() => env.at(0, 'bass')).toThrow(/no series "bass"/);
  });

  it('a score that cannot play is an error that says why; warnings are still printed', async () => {
    await expect(musicEnvelope({ tracks: [] } as never)).rejects.toThrow(/musicEnvelope\(\).*bpm is required/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await musicEnvelope({ bpm: 100, tracks: [{ inst: 'piano', notes: 'c4:2' }, { inst: 'keys', notes: 'c4:2' }] });
    expect(warn.mock.calls.join('\n')).toMatch(/"piano".*did you mean "keys"/);
    warn.mockRestore();
  });
});
