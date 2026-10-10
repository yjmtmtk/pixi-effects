import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('../../src/core/Renderer', () => ({ exportFrames: vi.fn() }));
import { Movie } from '../../src/core/Movie';
import { normalizeStops } from '../../src/core/stops';
import { createTimeline } from '../../src/core/timelineEngine';

/** A manual clock: requestAnimationFrame callbacks run only when the test advances time. */
let now = 0;
let nextId = 1;
let callbacks = new Map<number, (t: number) => void>();            // by id: GSAP's own ticker also uses requestAnimationFrame / cancelAnimationFrame
function advance(ms: number, step = 16): void {
  const end = now + ms;
  while (now < end) {
    now = Math.min(end, now + step);
    const run = [...callbacks.values()]; callbacks = new Map();
    run.forEach(cb => cb(now));
  }
}
const settle = () => new Promise<void>(r => setTimeout(r, 0));
async function run(ms: number): Promise<void> { for (let t = 0; t < ms; t += 50) { advance(50, 50); await settle(); } }       // (50 ms steps: fewer turns of the event loop, so it stays fast on a busy machine)

function movieWithStops(raw: Parameters<typeof normalizeStops>[0], totalFrames = 300, frameRate = 30) {
  const m = new Movie();
  const a = m as unknown as Record<string, unknown>;
  const drawn: number[] = [];
  Object.assign(a, { _initState: 'ready', totalFrames, frameRate, duration: totalFrames / frameRate });
  a.timeline = createTimeline({ paused: true }).add(gsap.to({}, { duration: totalFrames / frameRate }));
  a._rootSequence = {}; a.app = {};
  a._awaitVideoFrames = async () => {};
  a._updateSpace = () => {};
  a._renderNow = () => { drawn.push(Math.round((a.timeline as { time(): number }).time() * frameRate)); };
  a.stops = normalizeStops(raw, totalFrames / frameRate, frameRate);
  const events: Array<[string, unknown]> = [];
  m.on('stop', e => events.push(['stop', e]));
  m.on('play', () => events.push(['play', null]));
  m.on('pause', () => events.push(['pause', null]));
  m.on('ended', () => events.push(['ended', null]));
  return { m, a, drawn, events };
}
beforeEach(() => {
  now = 0; nextId = 1; callbacks = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { const id = nextId++; callbacks.set(id, cb); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id); });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const DECK = [{ at: 2, page: 'A' }, { at: 4 }, { at: 6, page: 'B' }, { at: 8 }];     // frames 60 120 180 240 of 300

describe('movie.next(): play to the next stop and stop there', () => {
  it('plays from the start up to the first stop, pauses exactly on its frame, and says so', async () => {
    const { m, events } = movieWithStops(DECK);
    const done = m.next();
    expect(m.isPlaying).toBe(true);
    await run(3000);
    await done;
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBe(60);
    expect(events.filter(e => e[0] === 'stop')).toHaveLength(1);
    expect(events.find(e => e[0] === 'stop')![1]).toMatchObject({ index: 0, stop: { at: 2, page: 'A' } });
    expect(m.stopIndex).toBe(0);
  });

  it('from a stop it goes to the next one (not further), then the next press goes on', async () => {
    const { m } = movieWithStops(DECK);
    m.next(); await run(2500);
    expect(m.currentFrame).toBe(60);
    const second = m.next(); await run(2500); await second;
    expect(m.currentFrame).toBe(120);
    expect(m.stopIndex).toBe(1);
  });

  it('pressing again while it is playing toward a stop skips the rest of the animation: it lands on that stop at once', async () => {
    const { m, events } = movieWithStops(DECK);
    m.next(); await run(500);
    expect(m.currentFrame).toBeLessThan(60);
    const skip = m.next();
    await skip;
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBe(60);
    expect(events.filter(e => e[0] === 'stop')).toHaveLength(1);
  });

  it('after the last stop it plays to the end (and says ended); at the end it does nothing', async () => {
    const { m, events } = movieWithStops(DECK);
    await m.goToStop(3);
    const last = m.next(); await run(3000); await last;
    expect(m.currentFrame).toBe(300);
    expect(events.some(e => e[0] === 'ended')).toBe(true);
    await m.next();
    expect(m.currentFrame).toBe(300);
  });

  it('a movie with no stops: next() just plays to the end', async () => {
    const { m } = movieWithStops([]);
    m.next(); await run(11000);
    expect(m.currentFrame).toBe(300);
  });

  it('an ordinary play() ignores the stops', async () => {
    const { m } = movieWithStops(DECK);
    m.play(); await run(3000);
    expect(m.isPlaying).toBe(true);
    expect(m.currentFrame).toBeGreaterThan(60);
  });

  it('a pause by hand while it is playing toward a stop cancels the stop; the promise still settles', async () => {
    const { m } = movieWithStops(DECK);
    const p = m.next(); await run(500);
    m.pause();
    await p;
    await run(3000);
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBeLessThan(60);
  });
});

describe('movie.prev(), goToStop(), goToPage()', () => {
  it('prev() jumps back to the previous stop, at once (no reverse playback), and stays there', async () => {
    const { m, events } = movieWithStops(DECK);
    await m.goToStop(2);
    await m.prev();
    expect(m.currentFrame).toBe(120);
    expect(m.isPlaying).toBe(false);
    expect(events.filter(e => e[0] === 'stop').map(e => (e[1] as { index: number }).index)).toEqual([2, 1]);
  });

  it('prev() from the first stop goes to the start; from the start it does nothing', async () => {
    const { m } = movieWithStops(DECK);
    await m.goToStop(0);
    await m.prev();
    expect(m.currentFrame).toBe(0);
    await m.prev();
    expect(m.currentFrame).toBe(0);
  });

  it('prev() while playing stops playback and goes back to the stop before where it is', async () => {
    const { m } = movieWithStops(DECK);
    await m.goToStop(1);
    m.next(); await run(1200);                                           // on its way from stop 1 toward stop 2
    await m.prev();
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBe(120);
  });

  it('goToStop(i) lands on stop i; a bad index says so and does nothing', async () => {
    const { m } = movieWithStops(DECK);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await m.goToStop(3);
    expect(m.currentFrame).toBe(240);
    await m.goToStop(9);
    expect(m.currentFrame).toBe(240);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/goToStop\(9\)/));
  });

  it('goToPage(n) lands on the first stop of page n (0-based)', async () => {
    const { m } = movieWithStops(DECK);
    await m.goToPage(1);
    expect(m.currentFrame).toBe(180);
    await m.goToPage(0);
    expect(m.currentFrame).toBe(60);
  });

  it('page and step positions: pageIndex, pageCount, stopIndex', async () => {
    const { m } = movieWithStops(DECK);
    expect(m.pageCount).toBe(2);
    expect(m.pageIndex).toBe(-1);                                        // before the first stop
    await m.goToStop(1);
    expect([m.stopIndex, m.pageIndex]).toEqual([1, 0]);
    await m.goToStop(2);
    expect([m.stopIndex, m.pageIndex]).toEqual([2, 1]);
  });

  it('an outside seek (gotoFrame) while it plays toward a stop cancels that stop: playback goes on past it', async () => {
    const { m } = movieWithStops(DECK);
    const p = m.next(); await run(300);
    await m.gotoFrame(10);
    await p;                                                              // the promise settles when the stop is cancelled
    await run(3000);
    expect(m.isPlaying).toBe(true);
    expect(m.currentFrame).toBeGreaterThan(60);
  });
});
