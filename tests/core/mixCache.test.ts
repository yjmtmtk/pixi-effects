import { describe, it, expect } from 'vitest';
import { mixKey, MixCache } from '../../src/core/mixCache';
import type { AudioDescriptor } from '../../src/types';

const buf = () => ({ duration: 2 } as unknown as AudioBuffer);
const d = (over: Partial<AudioDescriptor> = {}): AudioDescriptor => ({ loop: false, start: 0, end: 4, initialVolume: 0.8, volumeKeyframes: [], synth: { key: 'sfx:pop:1', render: () => [new Float32Array(1), new Float32Array(1)] }, ...over });

describe('mixKey: when two sets of sounds are the same mix', () => {
  it('the same sounds give the same key, however many times the layer was rebuilt (a synth by its key, a file by its buffer)', () => {
    const b = buf();
    expect(mixKey([d()], 10, 44100)).toBe(mixKey([d()], 10, 44100));
    expect(mixKey([d({ synth: undefined, buffer: b })], 10, 44100)).toBe(mixKey([d({ synth: undefined, buffer: b })], 10, 44100));
    expect(mixKey([d({ synth: undefined, buffer: b })], 10, 44100)).not.toBe(mixKey([d({ synth: undefined, buffer: buf() })], 10, 44100));
  });

  it('anything that changes what is heard changes the key: start, end, loop, volume, its keyframes, which sound, the length, the sample rate, the order of layers', () => {
    const base = mixKey([d()], 10, 44100);
    for (const over of [{ start: 1 }, { end: 5 }, { loop: true }, { initialVolume: 0.5 }, { volumeKeyframes: [{ time: 1, value: 0 }] }, { synth: { key: 'sfx:pop:2', render: () => [new Float32Array(1), new Float32Array(1)] } }] as Array<Partial<AudioDescriptor>>) {
      expect(mixKey([d(over)], 10, 44100), JSON.stringify(Object.keys(over))).not.toBe(base);
    }
    expect(mixKey([d()], 11, 44100)).not.toBe(base);
    expect(mixKey([d()], 10, 48000)).not.toBe(base);
    expect(mixKey([d({ start: 1 }), d({ start: 2 })], 10, 44100)).not.toBe(mixKey([d({ start: 2 }), d({ start: 1 })], 10, 44100));
  });

  it('what only names the layer does not change the mix (layer name, source text, the music read-back)', () => {
    expect(mixKey([d({ layer: 'a', source: 'sfx "pop"' })], 10, 44100)).toBe(mixKey([d({ layer: 'b', source: 'other' })], 10, 44100));
  });

  it('a time remap (a function) cannot be compared: no key, so the sound is mixed again (correctness first); a descriptor with neither buffer nor synth too', () => {
    expect(mixKey([d({ warp: t => t })], 10, 44100)).toBeNull();
    expect(mixKey([d({ sourceMap: u => u })], 10, 44100)).toBeNull();
    expect(mixKey([d({ synth: undefined })], 10, 44100)).toBeNull();
  });

  it('no sounds is a key too (nothing to mix is the same as before)', () => {
    expect(mixKey([], 10, 44100)).toBe(mixKey([], 10, 44100));
  });
});

describe('MixCache holds the last mix', () => {
  it('returns it for the same key, and forgets it for another or for null', () => {
    const c = new MixCache<{ stats: number }>();
    const b = buf();
    expect(c.get('k')).toBeNull();
    c.set('k', b, { stats: 1 });
    expect(c.get('k')).toEqual({ buffer: b, extra: { stats: 1 } });
    expect(c.get('other')).toBeNull();
    c.set(null, b, { stats: 2 });                                            // not cacheable: stored nothing
    expect(c.get('k')).toBeNull();
    expect(c.get(null)).toBeNull();
  });
});
