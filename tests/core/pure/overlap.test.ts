import { describe, it, expect } from 'vitest';
import { PureTimeline } from '../../../src/core/pure/PureTimeline';

// Two tweens on one property that overlap in time: the later one takes over from where the property IS when it starts (docs/dsl.md, Keyframes:
// "tween from whatever the property is at `at`"), not from where the earlier one would have ended. Before 0.55.x it started from the earlier one's
// end value, so the picture jumped (a slow drift with a short accent on top jumped to the drift's end; found by the 0.55 trial and 7 gallery pieces).
describe('PureTimeline: a tween that starts while another on the same property runs takes over without a jump', () => {
  const at = (tl: PureTimeline, o: { x: number }, t: number) => { tl.time(t); return o.x; };

  it('A x 40 → 160 over 0.5–1.5 s, B → 280 from 1 s over 1 s: B starts at 100 (where A is at 1 s), not at 160', () => {
    const o = { x: 40 };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(o, { x: 160, duration: 1 }, 0.5);
    tl.to(o, { x: 280, duration: 1 }, 1);
    expect(at(tl, o, 0.99)).toBeCloseTo(98.8, 4);
    expect(at(tl, o, 1)).toBeCloseTo(100, 4);
    expect(at(tl, o, 1.5)).toBeCloseTo(190, 4);
    expect(at(tl, o, 2)).toBeCloseTo(280, 4);
    expect(at(tl, o, 0.5)).toBeCloseTo(40, 4);                         // seeking back: A again, from its own start
  });

  it('the same answer in whatever order they are added and played (seeking back and forth)', () => {
    const o = { x: 40 };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(o, { x: 280, duration: 1 }, 1);
    tl.to(o, { x: 160, duration: 1 }, 0.5);
    for (const t of [2, 0, 1.5, 1, 0.75]) at(tl, o, t);
    expect(at(tl, o, 1.5)).toBeCloseTo(190, 4);
  });

  it('a slow drift with a short accent on top: the accent starts where the drift is, and holds its own end after', () => {
    const o = { x: 0 };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(o, { x: 100, duration: 10 }, 0);                             // a drift
    tl.to(o, { x: 0, duration: 1 }, 5);                                // an accent at 5 s, while the drift is at 50
    expect(at(tl, o, 5)).toBeCloseTo(50, 4);
    expect(at(tl, o, 5.5)).toBeCloseTo(25, 4);
    expect(at(tl, o, 8)).toBeCloseTo(0, 4);                            // the later one wins until something else starts
  });

  it('a tween that starts exactly when the one before ends starts from its end (a hand-over is not an overlap)', () => {
    const o = { x: 0 };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(o, { x: 100, duration: 1 }, 0);
    tl.to(o, { x: 200, duration: 1 }, 1);
    expect(at(tl, o, 1.5)).toBeCloseTo(150, 4);
  });

  it('with the same start the one added later writes the property, from where the property is then (the value before both)', () => {
    const o = { x: 40 };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(o, { x: 160, duration: 1 }, 0.5);
    tl.to(o, { x: 280, duration: 1 }, 0.5);
    expect(at(tl, o, 0.5)).toBeCloseTo(40, 4);
    expect(at(tl, o, 1)).toBeCloseTo(160, 4);                          // 40 + 240 * 0.5
  });

  it('a relative value is measured from where the property is when the tween starts', () => {
    const o = { x: 0 };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(o, { x: 100, duration: 2 }, 0);
    tl.to(o, { x: '+=10', duration: 1 }, 1);                           // at 1 s the drift is at 50: it goes to 60
    expect(at(tl, o, 2)).toBeCloseTo(60, 4);
  });
});
