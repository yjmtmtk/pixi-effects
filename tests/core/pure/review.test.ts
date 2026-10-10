import { describe, it, expect } from 'vitest';
import { PureTimeline } from '../../../src/core/pure/PureTimeline';
import { setNow } from '../../../src/core/timelineEngine';

describe('findings of the fresh review of the pure timeline', () => {
  it('a setter with a side effect (a video frame, a text redraw) runs when the value changes, not on every frame', () => {
    let writes = 0, v = 0;
    const holder = { get x() { return v; }, set x(n: number) { writes++; v = n; } };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.to(holder, { x: 10, duration: 1 }, 2);
    tl.time(0); tl.time(0.5); tl.time(1); tl.time(1.5);          // before the tween: the value does not change
    expect(writes).toBeLessThanOrEqual(1);
    tl.time(5); tl.time(5.2); tl.time(6);                         // after it: the same
    expect(writes).toBeLessThanOrEqual(3);
  });

  it('a colour tween after a colour set on the same property interpolates (it does not jump)', () => {
    const o = { fill: '#000000' };
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.setValue(o, 'fill', 0, () => o.fill, v => { o.fill = v; }, '#ff0000');
    tl.tweenValue<string>({
      holder: o, id: 'fill', get: () => o.fill, set: v => { o.fill = v; },
      to: () => '#0000ff', make: (a, b) => (p) => (p >= 1 ? b : p <= 0 ? a : `mix${p}`), duration: 2, ease: 'none', at: 1,
    });
    tl.time(2);
    expect(o.fill).toBe('mix0.5');
  });

  it('a tween keeps its own setter when it shares a property with a set', () => {
    const o = { v: 0 }; let redraws = 0;
    const tl = new PureTimeline({ defaults: { ease: 'none' } });
    tl.setValue(o, 'v', 0, () => o.v, n => { o.v = n; }, 5);
    tl.tweenValue<number>({ holder: o, id: 'v', get: () => o.v, set: n => { o.v = n; redraws++; }, to: () => 10, make: (a, b) => p => a + (b - a) * p, duration: 2, ease: 'none', at: 1 });
    tl.time(2);
    expect(redraws).toBeGreaterThan(0);
  });

  it('setNow reads rgb() and #rrggbbaa tints like a tween does', () => {
    const o = { tint: 0xffffff };
    setNow(o, { pixi: { tint: 'rgb(255,0,0)' } });
    expect(o.tint).toBe(0xff0000);
    setNow(o, { pixi: { tint: '#00ff0080' } });
    expect(o.tint).toBe(0x00ff00);
  });
});
