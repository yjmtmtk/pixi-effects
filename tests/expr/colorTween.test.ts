import { describe, it, expect } from 'vitest';
import { tweenColor } from '../../src/expr/colorTween';
import { createTimeline } from '../../src/core/timelineEngine';

const mid = (from: string | number, to: string | number): unknown => {
  const target: Record<string, unknown> = { c: from };
  const tl = createTimeline({ paused: true });
  tweenColor(tl, target, 'c', undefined, to, 2, 'none', 0, 'rgb');
  tl.time(1);
  return target.c;
};

describe('tweenColor in rgb: a numeric colour is a colour, not a number to lerp', () => {
  it('0xff0000 → 0x00ff00 passes through olive, like the CSS strings do (not through the number half way)', () => {
    expect(mid('#ff0000', '#00ff00')).toBe('rgba(128,128,0,1)');
    expect(mid(0xff0000, 0x00ff00)).toBe('rgba(128,128,0,1)');
  });
  it('a numeric target from a string start, and the other way round', () => {
    expect(mid('#ff0000', 0x00ff00)).toBe('rgba(128,128,0,1)');
    expect(mid(0xff0000, '#00ff00')).toBe('rgba(128,128,0,1)');
  });
});
