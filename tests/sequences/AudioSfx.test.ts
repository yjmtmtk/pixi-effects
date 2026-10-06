import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => { throw new Error('an sfx layer must not load an asset'); };
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { mixdown } from '../../src/core/AudioMixer';
import { sfxDefaultLength, renderSfx } from '../../src/audio/sfx';
import type { AudioDescriptor, CompositionShape, SequenceSpec } from '../../src/types';

const root: CompositionShape = { width: 1280, height: 720, duration: 3 };
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 3, sequences: sequences as SequenceSpec[] }, null, root);
  await comp.build();
  const audios: AudioDescriptor[] = [];
  comp.collectAudio(audios, 0);
  return audios;
}
const rms = (d: Float32Array, sr: number, t0: number, t1: number) => {
  let s = 0;
  const i0 = Math.round(t0 * sr), i1 = Math.round(t1 * sr);
  for (let i = i0; i < i1; i++) s += d[i]! * d[i]!;
  return Math.sqrt(s / (i1 - i0));
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('audio layer with sfx', () => {
  it('needs no asset; lasts the preset length by default, or exactly its duration', async () => {
    const audios = await build([
      { type: 'audio', name: 'p', sfx: 'pop', at: 1 },
      { type: 'audio', name: 'r', sfx: { preset: 'riser', pitch: -3 }, at: 0.5, duration: 1.5 },
    ]);
    expect(audios.map(a => [a.layer, a.source, a.start, a.end])).toEqual([
      ['layer "p"', 'sfx "pop"', 1, 1 + sfxDefaultLength('pop')],
      ['layer "r"', 'sfx "riser"', 0.5, 2],
    ]);
    expect(audios.every(a => a.synth && !a.buffer && !a.loop)).toBe(true);
  });

  it('puts sound in the mix at its `at` and nowhere else', async () => {
    const audios = await build([{ type: 'audio', sfx: 'pop', at: 1 }, { type: 'audio', sfx: 'hit', at: 2, volume: 0.5 }]);
    const sr = 8000;
    const d = (await mixdown(audios, 3, sr))!.getChannelData(0);
    expect(rms(d, sr, 0, 0.99)).toBe(0);
    expect(rms(d, sr, 1, 1.1)).toBeGreaterThan(0.02);
    expect(rms(d, sr, 1.3, 1.99)).toBe(0);
    expect(rms(d, sr, 2, 2.2)).toBeGreaterThan(0.01);
  });

  it('the mix holds exactly the synthesised samples × volume, from the sample at `at` (what play() and render() receive)', async () => {
    const sr = 8000;
    const audios = await build([{ type: 'audio', sfx: { preset: 'pop', seed: 3 }, at: 1, volume: 0.5 }]);
    const mix = (await mixdown(audios, 3, sr))!;
    const [l, r] = renderSfx({ preset: 'pop', pitch: 0, brightness: 0, seed: 3, length: sfxDefaultLength('pop') }, sr);
    const L = mix.getChannelData(0), R = mix.getChannelData(1);
    let worst = 0;
    for (let i = 0; i < l.length; i++) worst = Math.max(worst, Math.abs(L[sr + i]! - l[i]! * 0.5), Math.abs(R[sr + i]! - r[i]! * 0.5));
    expect(worst).toBeLessThan(1e-6);
    expect(Math.max(...L.subarray(0, sr).map(Math.abs))).toBe(0);
    expect(Math.max(...L.subarray(sr + l.length).map(Math.abs))).toBe(0);
  });

  it('a nested composition offsets its sfx like any child', async () => {
    const audios = await build([{ type: 'composition', at: 1, duration: 2, sequences: [{ type: 'audio', sfx: 'click', at: 0.5 }] }]);
    expect(audios[0]!.start).toBeCloseTo(1.5, 9);
  });

  it('warns about loop, asset + sfx, an unknown preset, and keyframes after the sound ends', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = await build([
      { type: 'audio', name: 'a', sfx: 'pop', loop: true },
      { type: 'audio', name: 'b', sfx: 'pop', asset: 'x' },
      { type: 'audio', name: 'c', sfx: 'whoosh' },
      { type: 'audio', name: 'd', sfx: 'chime', keyframes: [{ at: 2, to: { volume: 0 }, duration: 0.5 }] },
    ]);
    const msgs = warn.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => m.includes('layer "a"') && m.includes('loop has no effect'))).toBe(true);
    expect(msgs.some(m => m.includes('layer "b"') && m.includes('both asset and sfx'))).toBe(true);
    expect(msgs.some(m => m.includes('layer "c"') && m.includes('did you mean "swoosh"'))).toBe(true);
    expect(msgs.some(m => m.includes('layer "d"') && m.includes('after the sound ends'))).toBe(true);
    expect(audios.map(a => a.layer)).toEqual(['layer "a"', 'layer "b"', 'layer "d"']);   // "c" is silent
  });
});

describe('audio layer with sfx — keyframes that land outside the sound', () => {
  it('an end-relative keyframe longer than the sound (the cheatsheet fade on a 1 s riser) warns and cannot crash the mix', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = await build([{ type: 'audio', name: 'fade', sfx: 'riser', at: 0.5, keyframes: [{ at: -2, to: { volume: 0 }, duration: 2 }] }]);
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes('layer "fade"') && m.includes('before the sound begins'))).toBe(true);
    const out = await mixdown(audios, 3, 8000);          // must not throw (the strict mock rejects negative times like a browser)
    expect(out).not.toBeNull();
  });

  it('a negative `at` mixes without throwing and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audios = await build([{ type: 'audio', name: 'early', sfx: 'pop', at: -0.06 }]);
    const out = await mixdown(audios, 3, 8000);
    expect(out).not.toBeNull();
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes('layer "early"') && m.includes('before the movie'))).toBe(true);
  });
});

describe('audio layer with sfx — labels and duplicate warnings', () => {
  it('a custom sound is labelled sfx "custom", not sfx "null"', async () => {
    const audios = await build([{ type: 'audio', name: 'zap', sfx: { voices: [{ wave: 'square', freq: [800, 200] }] }, at: 1 }]);
    expect(audios[0]!.source).toBe('sfx "custom"');
  });

  it('a keyframe past the end of an sfx with no duration is reported once, against the sound (not also against the parent)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: 'audio', name: 'p', sfx: 'pop', keyframes: [{ at: 3.5, to: { volume: 0 }, duration: 0.2 }] }]);   // parent lasts 3 s: past its end too
    const msgs = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('layer "p"') && /keyframes\[0\]/.test(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('after the sound ends');
  });
});

