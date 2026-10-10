import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/core/Renderer', () => ({ exportFrames: vi.fn() }));
import { Movie } from '../../src/core/Movie';
import { normalizeStops, changedFraction } from '../../src/core/stops';
import { createTimeline } from '../../src/core/timelineEngine';
import { spacer } from '../../src/core/pure/PureTimeline';

/** A "ready" Movie without a GPU; the picture of a frame is a 10-pixel strip made by `pixels(frame)`. */
function movieWith(raw: Parameters<typeof normalizeStops>[0], pixels: (frame: number) => number[]) {
  const m = new Movie();
  const a = m as unknown as Record<string, any>;
  Object.assign(a, { _initState: 'ready', totalFrames: 300, frameRate: 30, duration: 10 });
  a.timeline = createTimeline({ paused: true }).add(spacer(10));
  a._rootSequence = {}; a.app = {};
  a._awaitVideoFrames = async () => {}; a._updateSpace = () => {}; a._renderNow = () => {};
  a.stops = normalizeStops(raw, 10, 30);
  const asked: number[] = [];
  a._framePixels = async (frame: number) => { asked.push(frame); return Uint8ClampedArray.from(pixels(frame).flatMap(v => [v, v, v, 255])); };
  return { m, a, asked };
}
const flat = () => Array(10).fill(100);

beforeEach(() => { vi.restoreAllMocks(); });

describe('changedFraction', () => {
  it('is the share of pixels that differ by more than the threshold in any colour channel', () => {
    const a = Uint8ClampedArray.from([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const b = Uint8ClampedArray.from([0, 0, 0, 255, 5, 0, 0, 255, 0, 40, 0, 255, 0, 0, 0, 255]);
    expect(changedFraction(a, b, 12)).toBe(0.25);                    // only the third pixel moved by more than 12
    expect(changedFraction(a, b, 3)).toBe(0.5);
    expect(changedFraction(a, a)).toBe(0);
  });
});

describe('movie.inspectStops()', () => {
  it('a stop whose picture has stopped changing is settled', async () => {
    const { m } = movieWith([2, 5], flat);
    const r = await m.inspectStops();
    expect(r.issues).toEqual([]);
    expect(r.stops.map(s => [s.index, s.frame, s.moving, s.settled])).toEqual([[0, 60, 0, true], [1, 150, 0, true]]);
  });

  it('a stop that lands while the picture is still changing is named, with the page, the time and what to do', async () => {
    // the right half of the strip is still fading around frame 150 (it changes by 30 every frame)
    const { m } = movieWith([{ at: 2, page: 'Intro' }, { at: 5, page: 'Fade' }], f => Array.from({ length: 10 }, (_, i) => (i < 5 || f < 147 || f >= 153 ? 100 : 100 + (f - 146) * 30)));
    const r = await m.inspectStops();
    expect(r.stops.map(s => s.settled)).toEqual([true, false]);
    expect(r.stops[1]!.moving).toBe(0.5);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatch(/stop 2.*"Fade".*5(\.0)? s.*still changing.*50%.*pdf: true/s);
  });

  it('compares the stop with a few frames before it (lookback, default 3) and says how sensitive it is (tolerance)', async () => {
    const { m, asked } = movieWith([5], f => Array.from({ length: 10 }, (_, i) => (i === 0 && f === 150 ? 200 : 100)));
    expect((await m.inspectStops()).stops[0]!.moving).toBe(0.1);
    expect(asked).toEqual([150, 147]);
    expect((await m.inspectStops({ tolerance: 0.2 })).stops[0]!.settled).toBe(true);        // 10 % moved is within 20 %
    asked.length = 0;
    await m.inspectStops({ lookback: 1 });
    expect(asked).toEqual([150, 149]);
  });

  it('a stop at the very start has nothing before it; one near the start is compared with frame 0', async () => {
    const { m, asked } = movieWith([{ at: 0 }, { at: 0.05 }], flat);          // frames 0 and 2 (3 frames back would be before the start)
    const r = await m.inspectStops();
    expect(r.stops.map(s => s.settled)).toEqual([true, true]);
    expect(asked).toEqual([2, 0]);
  });

  it('leaves the playhead where it was, paused, and a movie without stops has nothing to inspect', async () => {
    const { m, a } = movieWith([2], flat);
    await m.gotoFrame(100, true);
    await m.inspectStops();
    expect(m.currentFrame).toBe(100);
    expect(m.isPlaying).toBe(false);
    expect(a.stops).toHaveLength(1);
    expect(await movieWith([], flat).m.inspectStops()).toEqual({ stops: [], issues: [] });
  });

  it('says which option is misspelt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await movieWith([2], flat).m.inspectStops({ lookbak: 2 } as never);
    expect(warn.mock.calls.join('\n')).toMatch(/lookbak.*lookback/s);
  });
});
