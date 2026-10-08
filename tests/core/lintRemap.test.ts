import { describe, it, expect } from 'vitest';
import { lintKeys } from '../../src/core/lint';
import { layerKeys, PROP_KEYS } from '../../src/core/layerKeys';
import { suggestName } from '../../src/core/options';
import type { SequenceSpec } from '../../src/types';

const warns = (spec: unknown): string[] => { const out: string[] = []; lintKeys(spec as SequenceSpec, m => out.push(m)); return out; };

describe('the keys speed and time are known', () => {
  it('speed is a key of video, audio and composition layers; time is an animatable property', () => {
    for (const t of ['video', 'audio', 'composition']) expect(layerKeys({ type: t })).toContain('speed');
    expect(PROP_KEYS.has('time')).toBe(true);
  });
  it('a correct use is silent', () => {
    expect(warns({ type: 'video', asset: 'v', speed: 0.5 })).toEqual([]);
    expect(warns({ type: 'video', asset: 'v', initial: { time: 2 }, keyframes: [{ at: 0, from: { time: 0 }, to: { time: 3 }, duration: 1 }] })).toEqual([]);
    expect(warns({ type: 'composition', speed: -1, sequences: [] })).toEqual([]);
    expect(warns({ type: 'audio', asset: 'a', speed: 2 })).toEqual([]);
  });
});

describe('remap mistakes say what to write', () => {
  it('a typo (spped) gets a did-you-mean', () => {
    expect(warns({ type: 'video', asset: 'v', spped: 2 })[0]).toMatch(/"spped" is not a video layer key — did you mean "speed"\?/);
  });
  it('other names for the same thing point at speed / time (once each)', () => {
    expect(suggestName('playbackRate', ['asset', 'speed'])).toBe('speed');
    expect(suggestName('timeScale', ['asset', 'speed'])).toBe('speed');
    expect(suggestName('rate', ['asset', 'speed'])).toBe('speed');
    const w = warns({ type: 'video', asset: 'v', reverse: true, timeRemap: 1 });
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/"reverse" is not a key: write speed: -1/);
    expect(w[1]).toMatch(/"timeRemap" is not a key: animate time/);
    expect(warns({ type: 'composition', time: 3, sequences: [] })).toEqual([expect.stringMatching(/"time" belongs in initial or keyframes/)]);
  });
  it('speed or time on a layer that cannot be remapped', () => {
    const w = warns({ type: 'shape', shape: 'rect', width: 1, height: 1, speed: 2 });
    expect(w).toHaveLength(1);                                    // the key warning alone: no second message for the same mistake
    expect(w[0]).toMatch(/"speed" is not a rect shape key/);
    const t = warns({ type: 'text', text: 'a', initial: { time: 1 } });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatch(/"time" only works on video, audio and composition layers; put this layer in a composition and remap that/);
  });
  it('speed 0, a non-number speed, and speed together with keyframed time', () => {
    expect(warns({ type: 'video', asset: 'v', speed: 0 })[0]).toMatch(/speed 0 cannot be used: write a number other than 0 \(negative plays backward\); to hold a moment, key time to the same value twice/);
    expect(warns({ type: 'video', asset: 'v', speed: '2' })[0]).toMatch(/speed "2" cannot be used/);
    expect(warns({ type: 'video', asset: 'v', speed: 2, keyframes: [{ at: 0, to: { time: 3 }, duration: 1 }] })[0]).toMatch(/speed and keyframed time are both set; time wins/);
  });
  it('speed is a fixed setting: in initial or a keyframe it says to animate time', () => {
    const w = warns({ type: 'video', asset: 'v', keyframes: [{ at: 0, to: { speed: 2 }, duration: 1 }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/speed is a fixed setting, not an animatable property: write it on the layer \(speed: 2\); to change the speed over time, animate time/);
    expect(warns({ type: 'composition', initial: { speed: 2 }, sequences: [] })).toHaveLength(1);
  });
  it('speed and time on an sfx / music point at pitch', () => {
    const w = warns({ type: 'audio', sfx: 'pop', speed: 2 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/do not apply to a synthesised sound \(sfx, music\); change an sfx's pitch with pitch \(semitones\)/);
    expect(warns({ type: 'audio', music: { notes: 'c4' }, initial: { time: 1 } })).toHaveLength(1);
  });
  it('time that is not a number of seconds', () => {
    expect(warns({ type: 'video', asset: 'v', initial: { time: 'x' } })[0]).toMatch(/initial.time must be a number of seconds/);
    expect(warns({ type: 'video', asset: 'v', keyframes: [{ at: 0, to: { time: true }, duration: 1 }] })[0]).toMatch(/keyframes\[0\].to.time must be a number of seconds/);
    expect(warns({ type: 'video', asset: 'v', keyframes: [{ at: 0, to: { time: 'W / 2' }, duration: 1 }] })).toEqual([]);   // an expression string is a number at build
  });
});
