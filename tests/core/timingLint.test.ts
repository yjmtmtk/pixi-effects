import { describe, it, expect } from 'vitest';
import { lintTiming, summarizeWarnings } from '../../src/core/lint';
import type { SequenceSpec } from '../../src/types';

function run(spec: unknown, parentDuration = 10): string[] {
  const out: string[] = [];
  lintTiming(spec as SequenceSpec, parentDuration, m => out.push(m));
  return out;
}

describe('lintTiming', () => {
  it('warns when a keyframe starts after the layer ends and explains that `at` is layer-local', () => {
    const w = run({ type: 'text', name: 'title', text: 'a', at: 2, duration: 3, keyframes: [{ at: 4, to: { alpha: 0 }, duration: 1 }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('layer "title"');
    expect(w[0]).toContain('keyframes[0]');
    expect(w[0]).toMatch(/never plays/);
    expect(w[0]).toMatch(/start of this layer/);
  });

  it('uses the parent duration when the layer has no duration', () => {
    expect(run({ type: 'text', text: 'a', keyframes: [{ at: 12, to: { alpha: 0 }, duration: 1 }] }, 10)).toHaveLength(1);
    expect(run({ type: 'text', text: 'a', keyframes: [{ at: 9, to: { alpha: 0 }, duration: 1 }] }, 10)).toHaveLength(0);
  });

  it('is silent for keyframes inside the layer, for `at` equal to a missing value, and for negative `at`', () => {
    expect(run({ type: 'text', text: 'a', at: 2, duration: 3, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1 }, { at: 2.5, to: { alpha: 0 } }, { at: -0.5, to: { x: 1 } }, { to: { y: 1 } }] })).toEqual([]);
  });

  it('warns when the layer itself starts after its composition ends', () => {
    const w = run({ type: 'shape', shape: 'rect', width: 1, height: 1, at: 12, duration: 2 }, 10);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/starts at 12s, after its composition ends \(10s\)/);
  });

  it('does not warn for a layer that starts exactly inside the composition', () => {
    expect(run({ type: 'shape', shape: 'rect', width: 1, height: 1, at: 9.9, duration: 2 }, 10)).toEqual([]);
  });
});

describe('summarizeWarnings', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `pixi-effects: layer "bar${i}": keyframes[360] starts at 12s, after the layer ends (duration 12s), so it never plays.`);

  it('prints a few of the same kind in full, then says how many more there are', () => {
    const out = summarizeWarnings(many(145));
    expect(out).toHaveLength(4);
    expect(out.slice(0, 3)).toEqual(many(3));
    expect(out[3]).toMatch(/142 more layers/);
    expect(out[3]).toMatch(/same problem/);
  });

  it('prints everything when there are only a few', () => {
    expect(summarizeWarnings(many(3))).toEqual(many(3));
    expect(summarizeWarnings([])).toEqual([]);
  });

  it('warns when a FADE starts inside the layer but is cut off by its end (a fade-out that never finishes), and says how much of it plays', () => {
    // the layer lives 0.5 s .. 5 s (duration 4.5); the fade-out starts at 4.2 s of the layer and takes 0.8 s: only 0.3 s of it plays
    const w = run({ type: 'text', name: 'scene1', text: 'a', at: 0.5, duration: 4.5, keyframes: [{ at: 4.2, to: { alpha: 0 }, duration: 0.8 }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('layer "scene1"');
    expect(w[0]).toContain('keyframes[0]');
    expect(w[0]).toMatch(/4\.2s to 5s/);                                // where the keyframe runs
    expect(w[0]).toMatch(/layer ends at 4\.5s/);
    expect(w[0]).toMatch(/last 63%/);                                    // (5 - 4.5) / 0.8
    expect(w[0]).toMatch(/start of this layer/);
    // a fade-in is a fade too (a 1.2 s fade on a 0.6 s layer), and the time is printed to the millisecond, not as a float tail
    const inn = run({ type: 'text', name: 'note', text: 'a', at: 3, duration: 0.6, keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 1.2 }] });
    expect(inn).toHaveLength(1);
    expect(inn[0]).toMatch(/last 50%/);
    expect(run({ type: 'text', name: 'f', text: 'a', duration: 0.1 + 0.2 + 0.4, keyframes: [{ at: 0.1 + 0.2, to: { alpha: 0 }, duration: 1 }] })[0]).toMatch(/runs from 0\.3s to 1\.3s/);
  });

  it('an `at` counted from the end is judged too: a 1 s fade that starts 0.5 s before the end loses half of it', () => {
    const w = run({ type: 'text', name: 'tail', text: 'a', duration: 4, keyframes: [{ at: -0.5, to: { alpha: 0 }, duration: 1 }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/3\.5s to 4\.5s/);
    expect(w[0]).toMatch(/last 50%/);
  });

  it('a layer without a duration lives until its composition ends: a keyframe that starts after that is the late-keyframe kind, not "the last 200%"', () => {
    const w = run({ type: 'text', name: 'late', text: 'a', at: 8, keyframes: [{ at: 3, to: { alpha: 0 }, duration: 1 }] });          // lives 2 s
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/starts at 3s, after the layer ends \(duration 2s\)/);
    expect(w[0]).not.toMatch(/last \d+%/);
    const part = run({ type: 'text', name: 'part', text: 'a', at: 9, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 3 }] });       // 1 s left, a 3 s fade
    expect(part).toHaveLength(1);
    expect(part[0]).toMatch(/layer ends at 1s/);
  });

  it('a layer that starts after its composition is said once ("never visible"), not again for its keyframes', () => {
    expect(run({ type: 'text', name: 'x', text: 'a', at: 12, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1 }] })).toHaveLength(1);
  });

  it('does not warn for a small overshoot, a fade that fits, a repeating or spring fade, or a set (which is instant)', () => {
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 3.5, to: { alpha: 0 }, duration: 0.6 }] })).toEqual([]);                       // 0.1 s of 0.6 is cut: under 0.2 s
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 3, to: { alpha: 0 }, duration: 1.2 }] })).toEqual([]);                        // 0.2 s of 1.2 s: over 0.2 s but 17%, under 25%
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 4 }] })).toEqual([]);                          // fits
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 2, to: { alpha: 0.5 }, duration: 1, repeat: 5, yoyo: true }] })).toEqual([]);  // a blink: meant to be cut
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 3, to: { alpha: 1 }, duration: 'auto', ease: 'spring(1,100,10)' }] })).toEqual([]);
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 3.5, set: { alpha: 0 }, duration: 2 }] })).toEqual([]);
  });

  it('only a fade to 0 or 1 is judged: a drift, a zoom, or a decaying flash (to 0.22) that is still going when the layer ends is on purpose', () => {
    expect(run({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 0, to: { y: 900 }, duration: 6 }] })).toEqual([]);          // confetti still falling
    expect(run({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 0, to: { scale: 2 }, duration: 6 }] })).toEqual([]);
    expect(run({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 2.8, to: { alpha: 0.22 }, duration: 0.4 }] })).toEqual([]);     // a flash that decays to a glow
    expect(run({ type: 'text', text: 'a', duration: 2.95, keyframes: [{ at: 2.9, to: { alpha: 0 }, duration: 0.1 }] })).toEqual([]);    // 0.05 s cut
  });

  it('lintTiming tags the late-keyframe warning so a caller can group it', () => {
    const kinds: Array<string | undefined> = [];
    lintTiming({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 4, to: { alpha: 0 } }] } as unknown as SequenceSpec, 10, (_m, kind) => kinds.push(kind));
    expect(kinds).toEqual(['late-keyframe']);
  });
});
