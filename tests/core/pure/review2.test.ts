import { describe, it, expect, vi } from 'vitest';
import { PureTimeline, spacer } from '../../../src/core/pure/PureTimeline';

const mk = () => new PureTimeline({ defaults: { ease: 'none' } });

describe('purity across timelines', () => {
  it('two children on one property: the one that starts last wins, whatever order they were added or played in', () => {
    const run = (times: number[]) => {
      const o = { x: 0 };
      const a = mk().to(o, { x: 100, duration: 1 }, 0);       // child A at 5
      const b = mk().to(o, { x: -50, duration: 1 }, 0);       // child B at 0
      const root = mk(); root.add(a, 5); root.add(b, 0); root.add(spacer(10), 0);
      let v = NaN;
      for (const t of times) { root.time(t); v = o.x; }
      return v;
    };
    const direct = run([5.5]);
    expect(run([0, 0.5, 5.5])).toBe(direct);
    expect(run([9, 5.5])).toBe(direct);
    expect(run([5.5, 5.6, 5.5])).toBe(direct);
  });

  it('a parent channel and a child on one property give the same answer played or sought', () => {
    const run = (times: number[]) => {
      const o = { x: 0 };
      const child = mk().to(o, { x: 100, duration: 1 }, 0);
      const root = mk(); root.to(o, { x: 50, duration: 4 }, 0); root.add(child, 1); root.add(spacer(8), 0);
      let v = NaN;
      for (const t of times) { root.time(t); v = o.x; }
      return v;
    };
    const direct = run([3]);
    expect(run([0, 1, 1.5, 2, 2.5, 3])).toBe(direct);
    expect(run([7, 3])).toBe(direct);
  });
});

describe('segments added after the first time()', () => {
  it('give what a timeline built in one go gives', () => {
    const late = { x: 0 };
    const a = mk(); a.to(late, { x: 10, duration: 1 }, 1); a.time(1.5); a.to(late, { x: 3, duration: 1 }, 0);
    const once = { x: 0 };
    const b = mk(); b.to(once, { x: 10, duration: 1 }, 1); b.to(once, { x: 3, duration: 1 }, 0);
    for (const t of [0, 0.5, 1, 1.5, 2, 3]) { a.time(t); b.time(t); expect(late.x, `t=${t}`).toBeCloseTo(once.x, 9); }
  });
});

describe('vars the pure timeline does not run are said, not dropped', () => {
  it('delay moves the start; onStart / onComplete warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = { x: 0 };
    const tl = mk(); tl.to(o, { x: 10, duration: 1, delay: 2 } as never, 1); tl.add(spacer(6), 0);
    tl.time(2.5); expect(o.x).toBe(0);
    tl.time(3.5); expect(o.x).toBeCloseTo(5, 6);
    expect(Object.keys(o)).toEqual(['x']);
    tl.to(o, { x: 1, duration: 1, onStart() {}, onComplete() {} } as never, 4);
    expect(warn.mock.calls.some(c => String(c[0]).includes('onStart'))).toBe(true);
    expect(Object.keys(o)).toEqual(['x']);
    warn.mockRestore();
  });
});

describe('colour strings on plain properties (a light, a camera fog colour)', () => {
  it('move through the colours, in any order of seeking', () => {
    const o = { color: '#ff0000' };
    const tl = mk(); tl.to(o, { color: '#0000ff', duration: 2 }, 1); tl.add(spacer(5), 0);
    for (const t of [0, 3, 2, 3.5, 0.5]) { tl.time(t); }
    tl.time(2); expect(o.color).toBe('rgba(128,0,128,1)');
    tl.time(0); expect(o.color).toBe('#ff0000');
    tl.time(4); expect(o.color).toBe('#0000ff');
  });
});
