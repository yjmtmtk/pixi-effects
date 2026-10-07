import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => { throw new Error('a music layer must not load an asset'); };
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { mixdown } from '../../src/core/AudioMixer';
import type { AudioDescriptor, CompositionShape, SequenceSpec } from '../../src/types';

const root: CompositionShape = { width: 1280, height: 720, duration: 20 };
async function build(sequences: unknown[], duration = 20) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration, sequences: sequences as SequenceSpec[] }, null, { ...root, duration });
  await comp.build();
  const audios: AudioDescriptor[] = [];
  comp.collectAudio(audios, 0);
  return audios;
}
const rms = (d: Float32Array, sr: number, t0: number, t1: number) => { let s = 0; const a = Math.round(t0 * sr), b = Math.round(t1 * sr); for (let i = a; i < b; i++) s += d[i]! * d[i]!; return Math.sqrt(s / (b - a)); };
const tune = { bpm: 120, humanize: 0, tracks: [{ inst: 'keys', notes: 'c4:2 e4:2 g4:2 c5:2' }] };      // 8 beats = 4 s, + 2.5 s tail

beforeEach(() => { vi.restoreAllMocks(); });

describe('audio layer with music', () => {
  it('needs no asset; lasts its notes plus the tail by default, or exactly its duration', async () => {
    const audios = await build([
      { type: 'audio', name: 'm', music: tune, at: 1 },
      { type: 'audio', name: 'cut', music: tune, at: 0, duration: 3 },
    ]);
    expect(audios.map(a => [a.layer, a.source, a.start, a.end])).toEqual([['layer "m"', 'music', 1, 7.5], ['layer "cut"', 'music', 0, 3]]);
    expect(audios.every(a => a.synth && !a.buffer && !a.loop)).toBe(true);
  });

  it('music that would outlast the movie ends with it, with no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = await build([{ type: 'audio', music: tune, at: 2 }], 5);
    expect(audios[0]!.end).toBe(5);
    expect(warn).not.toHaveBeenCalled();
  });

  it('loop: true fills the layer: until the movie ends, or the duration given', async () => {
    const audios = await build([{ type: 'audio', music: tune, loop: true }, { type: 'audio', music: tune, loop: true, at: 2, duration: 9 }], 12);
    expect(audios.map(a => [a.start, a.end])).toEqual([[0, 12], [2, 11]]);
  });

  it('a layer that lasts longer than its music says so and how to fix it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: 'audio', name: 'bgm', music: tune, duration: 15 }]);
    expect(warn.mock.calls.join('\n')).toMatch(/layer "bgm".*music is 6\.5s.*silent after 6\.5s.*loop: true/s);
  });

  it('a mistake in the score warns once and leaves the layer silent; the rest of the movie builds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = await build([{ type: 'audio', name: 'bgm', music: { tracks: [] } }, { type: 'audio', sfx: 'pop', at: 1 }]);
    expect(warn.mock.calls.join('\n')).toMatch(/layer "bgm".*bpm is required/);
    expect(audios.map(a => a.source)).toEqual(['sfx "pop"']);
  });

  it('both sfx / asset and music: the music plays and the warning says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = await build([{ type: 'audio', name: 'x', music: tune, sfx: 'pop' }]);
    expect(audios.map(a => a.source)).toEqual(['music']);
    expect(warn.mock.calls.join('\n')).toMatch(/both sfx and music/);
  });

  it('puts sound in the mix at its `at`, scaled by volume, and nowhere else', async () => {
    const sr = 8000;
    const loud = (await mixdown(await build([{ type: 'audio', music: tune, at: 2, volume: 1 }], 12), 12, sr))!.getChannelData(0);
    const quiet = (await mixdown(await build([{ type: 'audio', music: tune, at: 2, volume: 0.5 }], 12), 12, sr))!.getChannelData(0);
    expect(rms(loud, sr, 0, 1.99)).toBe(0);
    expect(rms(loud, sr, 2.2, 3.5)).toBeGreaterThan(0.02);
    expect(rms(quiet, sr, 2.2, 3.5)).toBeCloseTo(rms(loud, sr, 2.2, 3.5) * 0.5, 3);
  });

  it('volume keyframes fade the music like any audio layer', async () => {
    const sr = 8000;
    const mix = (await mixdown(await build([{ type: 'audio', music: { ...tune, tracks: [{ inst: 'pad', notes: '[c3 g3 e4]:16' }] }, keyframes: [{ at: 0, from: { volume: 0 }, to: { volume: 1 }, duration: 6 }] }], 12), 12, sr))!.getChannelData(0);
    expect(rms(mix, sr, 0.5, 1.5)).toBeLessThan(rms(mix, sr, 5, 6) * 0.5);
  });
});
