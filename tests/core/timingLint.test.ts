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

  it('warns when a keyframe starts inside the layer but is cut off by its end (a fade-out that never finishes), and says how much of it plays', () => {
    // the layer lives 0.5 s .. 5 s (duration 4.5); the fade-out starts at 4.2 s of the layer and takes 0.8 s: only 0.3 s of it plays
    const w = run({ type: 'text', name: 'scene1', text: 'a', at: 0.5, duration: 4.5, keyframes: [{ at: 4.2, to: { alpha: 0 }, duration: 0.8 }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('layer "scene1"');
    expect(w[0]).toContain('keyframes[0]');
    expect(w[0]).toMatch(/4\.2s.*5s/);                                   // where the keyframe runs
    expect(w[0]).toMatch(/layer ends at 4\.5s/);
    expect(w[0]).toMatch(/last 63%/);                                    // (5 - 4.5) / 0.8
    expect(w[0]).toMatch(/start of this layer/);
  });

  it('a layer without a duration lives until its composition ends: the keyframe is judged against what is left of it', () => {
    const w = run({ type: 'text', name: 'late', text: 'a', at: 9, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 3 }] });      // 1 s left, a 3 s tween
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/layer ends at 1s/);
  });

  it('does not warn for a small overshoot, a keyframe that fits, a repeating keyframe, a spring (auto) or a negative at', () => {
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 3.5, to: { alpha: 0 }, duration: 0.6 }] })).toEqual([]);     // 0.1 of 0.6 is cut: fine
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 4 }] })).toEqual([]);
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 2, to: { scale: 1.1 }, duration: 1, repeat: 5, yoyo: true }] })).toEqual([]);
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: 3, to: { scale: 2 }, duration: 'auto', ease: 'spring(1,100,10)' }] })).toEqual([]);
    expect(run({ type: 'text', text: 'a', duration: 4, keyframes: [{ at: -0.5, to: { alpha: 0 }, duration: 1 }] })).toEqual([]);
  });

  it('only a fade (alpha) is judged: a drift or a zoom that is still going when the layer ends is on purpose; and a cut of a few frames is nothing', () => {
    expect(run({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 0, to: { y: 900 }, duration: 6 }] })).toEqual([]);          // confetti still falling
    expect(run({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 0, to: { scale: 2 }, duration: 6 }] })).toEqual([]);
    expect(run({ type: 'text', text: 'a', duration: 2.95, keyframes: [{ at: 2.9, to: { alpha: 0 }, duration: 0.1 }] })).toEqual([]);   // 0.05 s cut
  });

  it('lintTiming tags the late-keyframe warning so a caller can group it', () => {
    const kinds: Array<string | undefined> = [];
    lintTiming({ type: 'text', text: 'a', duration: 3, keyframes: [{ at: 4, to: { alpha: 0 } }] } as unknown as SequenceSpec, 10, (_m, kind) => kinds.push(kind));
    expect(kinds).toEqual(['late-keyframe']);
  });
});
