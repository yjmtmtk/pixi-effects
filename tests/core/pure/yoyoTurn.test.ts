import { describe, it, expect } from 'vitest';
import { PureTimeline } from '../../../src/core/pure/PureTimeline';

// A rotation that swings with yoyo and an odd number of repeats, seen on the very frame where a swing turns (1.6 s at 30 fps is frame 48).
// The rotation's exact-end rule wrote the value the WHOLE tween ends on (an odd yoyo ends back at `from`) at the end of every forward swing,
// so a swinging lantern jumped back to its start for one frame every two swings (found in a fresh Opus sample, 2026-11-17).
describe('PureTimeline: a yoyo turns at its far end, on the frame where it turns', () => {
  it('pixi rotation -4° ↔ 4°, 1.6 s a swing, repeat 11 (odd), yoyo: 4° at 1.6 s and 4.8 s, -4° at 3.2 s, and the end is -4°', () => {
    const o = { rotation: 0 };
    const tl = new PureTimeline();
    tl.fromTo(o, { pixi: { rotation: -4 } }, { pixi: { rotation: 4 }, duration: 1.6, repeat: 11, yoyo: true, ease: 'sine.inOut' }, 0);
    // (rotation is kept in radians rounded to 5 decimals, as GSAP does: 3 decimals of a degree)
    const deg = (t: number) => { tl.time(t); return o.rotation * 180 / Math.PI; };
    expect(deg(47 / 30)).toBeCloseTo(3.95, 1);
    expect(deg(48 / 30)).toBeCloseTo(4, 3);
    expect(deg(96 / 30)).toBeCloseTo(-4, 3);
    expect(deg(144 / 30)).toBeCloseTo(4, 3);
    expect(deg(1.6 * 12)).toBeCloseTo(-4, 3);                         // 12 swings: an odd yoyo ends where it started
    expect(deg(30)).toBeCloseTo(-4, 3);
  });
});
