import { describe, it, expect } from 'vitest';
import { withFade } from '../../src/transforms/withFade';
import type { TextSequenceSpec, ImageSequenceSpec } from '../../src/types';

describe('withFade()', () => {
  describe('in', () => {
    it('sets initial.alpha = 0 and appends a keyframe at spec.at', () => {
      const spec: TextSequenceSpec = {
        type: 'text',
        text: 'hello',
        at: 5,
        duration: 4,
        initial: { x: 'GW/2' },
      };
      withFade(spec, { in: 0.6 });
      expect(spec.initial?.alpha).toBe(0);
      expect(spec.initial?.x).toBe('GW/2');
      expect(spec.keyframes).toEqual([
        { at: 5, to: { alpha: 1 }, duration: 0.6 },
      ]);
    });

    it('preserves pre-existing keyframes', () => {
      const spec: TextSequenceSpec = {
        type: 'text',
        text: 'hello',
        at: 0,
        duration: 3,
        keyframes: [{ at: 1, to: { x: 100 }, duration: 0.5 }],
      };
      withFade(spec, { in: 0.4 });
      expect(spec.keyframes).toEqual([
        { at: 1, to: { x: 100 }, duration: 0.5 },
        { at: 0, to: { alpha: 1 }, duration: 0.4 },
      ]);
    });

    it('treats missing spec.at as 0', () => {
      const spec: TextSequenceSpec = { type: 'text', text: 'h', duration: 3 };
      withFade(spec, { in: 0.3 });
      expect(spec.keyframes?.[0]).toEqual({ at: 0, to: { alpha: 1 }, duration: 0.3 });
    });

    it('skips emitting anything when in is 0 or omitted', () => {
      const spec: TextSequenceSpec = { type: 'text', text: 'h', at: 0, duration: 1 };
      withFade(spec, {});
      expect(spec.initial).toBeUndefined();
      expect(spec.keyframes).toBeUndefined();
    });
  });

  describe('out', () => {
    it('appends an alpha→0 keyframe anchored to (at + duration - out)', () => {
      const spec: ImageSequenceSpec = {
        type: 'image', asset: 'p', at: 10, duration: 6,
      };
      withFade(spec, { out: 0.5 });
      expect(spec.keyframes).toEqual([
        { at: 15.5, to: { alpha: 0 }, duration: 0.5 },
      ]);
    });

    it('throws if spec.duration is not set', () => {
      const spec: TextSequenceSpec = { type: 'text', text: 'h', at: 0 };
      expect(() => withFade(spec, { out: 0.5 })).toThrow(/spec\.duration/);
    });
  });

  describe('in + out', () => {
    it('emits both keyframes and returns the same spec reference', () => {
      const spec: ImageSequenceSpec = {
        type: 'image', asset: 'p', at: 2, duration: 5,
      };
      const result = withFade(spec, { in: 0.4, out: 0.6 });
      expect(result).toBe(spec);
      expect(spec.initial?.alpha).toBe(0);
      expect(spec.keyframes).toEqual([
        { at: 2,   to: { alpha: 1 }, duration: 0.4 },
        { at: 6.4, to: { alpha: 0 }, duration: 0.6 },
      ]);
    });
  });
});
