import { describe, it, expect } from 'vitest';
import { lintTiming } from '../../src/core/lint';
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
