import { describe, it, expect } from 'vitest';
import { wiggle } from '../../src/presets/wiggle';
import { particles } from '../../src/presets/particles';
import { followPath } from '../../src/presets/followPath';

// Presets that compute many times from `at` cannot add to a moment by name: they refuse it with what to write (it used to become NaN).
describe('a preset given a moment by name in at', () => {
  it('a preset that returns keyframes says: seconds here, a moment in a keyframe of your own', () => {
    expect(() => wiggle({ at: 'host@in' as never, duration: 1, props: { x: { around: 0, amp: 5 } } })).toThrow(/wiggle\(\): at "host@in" is a moment by name: give seconds from the start of the layer here/);
    expect(() => followPath({ d: 'M0 0 L10 0', at: 'host@in' as never, duration: 1 })).toThrow(/followPath\(\): at "host@in"/);
  });
  it('a preset that returns layers says: put them in a composition at that moment', () => {
    expect(() => particles({ count: 3, at: 'host@in' as never, life: [1, 1], area: { x: 0, y: 0 } } as never)).toThrow(/particles\(\): at "host@in" is a moment by name: .*\{ type: 'composition', at: 'host@in', sequences: particles\(\{ …, at: 0 \}\) \}/);
  });
  it('seconds still work, and no at is 0', () => {
    expect(wiggle({ at: 1, duration: 1, props: { x: { around: 0, amp: 5 } } })[0]!.at).toBeGreaterThanOrEqual(1);
    expect(particles({ count: 2, life: [1, 1], speed: [10, 20], area: { x: 0, y: 0 } } as never).length).toBe(2);
  });
});

describe('how often a preset samples is samplesPerSecond in every preset', () => {
  it('the old names say the new one (frameRate, sampleRate, stepsPerSecond)', async () => {
    const { vi } = await import('vitest');
    const { orbit } = await import('../../src/presets/orbit');
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    followPath({ d: 'M0 0 L10 0', duration: 1, frameRate: 30 } as never);
    particles({ count: 1, life: [1, 1], area: { x: 0, y: 0 }, sampleRate: 20 } as never);
    orbit({ duration: 1, degrees: 90, stepsPerSecond: 10 } as never);
    const said = w.mock.calls.map(c => String(c[0]));
    w.mockRestore();
    expect(said.filter(s => /did you mean "samplesPerSecond"\?/.test(s))).toHaveLength(3);
  });
});
