import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/core/Renderer', () => ({ exportFrames: vi.fn() }));
import { Movie } from '../../src/core/Movie';
import { createTimeline } from '../../src/core/timelineEngine';
import { spacer } from '../../src/core/pure/PureTimeline';

/** A manual clock: requestAnimationFrame callbacks run only when the test advances time. */
let now = 0;
let nextId = 1;
let callbacks = new Map<number, (t: number) => void>();
function advance(ms: number, step = 16): void {
  const end = now + ms;
  while (now < end) {
    now = Math.min(end, now + step);
    const run = [...callbacks.values()]; callbacks = new Map();
    run.forEach(cb => cb(now));
  }
}
const settle = () => new Promise<void>(r => setTimeout(r, 0));
async function run(ms: number): Promise<void> { for (let t = 0; t < ms; t += 50) { advance(50, 50); await settle(); } }

/** A "ready" Movie without a GPU: 300 frames at 30 fps (10 s). */
function readyMovie(totalFrames = 300, frameRate = 30) {
  const m = new Movie();
  const a = m as unknown as Record<string, any>;
  const drawn: number[] = [];
  Object.assign(a, { _initState: 'ready', totalFrames, frameRate, duration: totalFrames / frameRate });
  a.timeline = createTimeline({ paused: true }).add(spacer(totalFrames / frameRate));
  a._rootSequence = {}; a.app = {};
  a._awaitVideoFrames = async () => {};
  a._updateSpace = () => {};
  a._renderNow = () => { drawn.push(Math.round((a.timeline as { time(): number }).time() * frameRate)); };
  const events: string[] = [];
  m.on('play', () => events.push('play'));
  m.on('pause', () => events.push('pause'));
  m.on('ended', () => events.push('ended'));
  return { m, a, drawn, events };
}
beforeEach(() => {
  now = 0; nextId = 1; callbacks = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { const id = nextId++; callbacks.set(id, cb); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id); });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('movie.playUntil(seconds): play and pause exactly at a time', () => {
  it('plays from the playhead up to that time, pauses on exactly that frame and resolves true', async () => {
    const { m, events } = readyMovie();
    const done = m.playUntil(2);
    expect(m.isPlaying).toBe(true);
    await run(3000);
    expect(await done).toBe(true);
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBe(60);
    expect(events).toEqual(['play', 'pause']);
  });

  it('from there it goes on to the next time, and never past it', async () => {
    const { m } = readyMovie();
    const first = m.playUntil(2); await run(2500); await first;
    const second = m.playUntil(4); await run(2500);
    expect(await second).toBe(true);
    expect(m.currentFrame).toBe(120);
  });

  it('with no time it plays to the end and resolves true when it has ended (a time at or past the end is the same)', async () => {
    const { m, events } = readyMovie();
    const toEnd = m.playUntil(); await run(11000);
    expect(await toEnd).toBe(true);
    expect(m.currentFrame).toBe(300);
    expect(events).toContain('ended');
    const { m: m2 } = readyMovie();
    const past = m2.playUntil(99); await run(11000);
    expect(await past).toBe(true);
    expect(m2.currentFrame).toBe(300);
  });

  it('a time at or before the playhead has nothing to play toward: it pauses and resolves false at once', async () => {
    const { m } = readyMovie();
    await m.gotoFrame(90);
    m.play();
    expect(await m.playUntil(3)).toBe(false);                      // 3 s is frame 90: where it already is
    expect(m.isPlaying).toBe(false);
    expect(await m.playUntil(1)).toBe(false);
    expect(m.currentFrame).toBe(90);
  });

  it('a pause() by hand cancels it: the promise settles false and the movie stays short of the time', async () => {
    const { m } = readyMovie();
    const p = m.playUntil(2); await run(500);
    m.pause();
    expect(await p).toBe(false);
    await run(3000);
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBeLessThan(60);
  });

  it('a seek by someone else cancels it: the promise settles false and playback goes on past that time', async () => {
    const { m } = readyMovie();
    const p = m.playUntil(2); await run(300);
    await m.gotoFrame(10);
    expect(await p).toBe(false);
    await run(3000);
    expect(m.isPlaying).toBe(true);
    expect(m.currentFrame).toBeGreaterThan(60);
  });

  it('a new playUntil replaces the one in flight (the first settles false, the second is the target)', async () => {
    const { m } = readyMovie();
    const a = m.playUntil(2); await run(300);
    const b = m.playUntil(4); await run(4000);
    expect(await a).toBe(false);
    expect(await b).toBe(true);
    expect(m.currentFrame).toBe(120);
  });

  it('plain play() ignores any time: nothing pauses it', async () => {
    const { m } = readyMovie();
    m.play(); await run(3000);
    expect(m.isPlaying).toBe(true);
    expect(m.currentFrame).toBeGreaterThan(60);
  });

  it('before init it resolves false and does nothing', async () => {
    const m = new Movie();
    expect(await m.playUntil(1)).toBe(false);
    expect(m.isPlaying).toBe(false);
  });
});

describe('movie.peek(fn): look around, then put the movie back', () => {
  it('pauses, runs fn, and puts the playhead back; seeks made inside are not reported as seeks (no seeking / seeked)', async () => {
    const { m } = readyMovie();
    await m.gotoFrame(100);
    m.play();
    const seeks: string[] = [];
    m.on('seeking', () => seeks.push('seeking'));
    m.on('seeked', () => seeks.push('seeked'));
    const seen: number[] = [];
    const out = await m.peek(async () => { await m.gotoFrame(10, true); seen.push(m.currentFrame); await m.gotoFrame(50, true); seen.push(m.currentFrame); return 'ok'; });
    expect(out).toBe('ok');
    expect(seen).toEqual([10, 50]);
    expect(m.isPlaying).toBe(false);
    expect(m.currentFrame).toBe(100);
    expect(seeks).toEqual([]);
  });

  it('puts the playhead back even when fn throws, and rethrows', async () => {
    const { m } = readyMovie();
    await m.gotoFrame(40);
    await expect(m.peek(async () => { await m.gotoFrame(5, true); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(m.currentFrame).toBe(40);
  });

  it('before init it throws like the other tools (the movie is not ready)', async () => {
    const m = new Movie();
    await expect(m.peek(async () => 1)).rejects.toThrow(/peek/);
  });
});

describe('movie.snapshot() options', () => {
  it('quality reaches the encoder (a JPEG for a PDF needs it)', async () => {
    const { a, m } = readyMovie();
    const asked: unknown[] = [];
    a._captureFrame = async (_f: number, o: unknown) => { asked.push(o); return 'x'; };
    await m.snapshot(5, { type: 'image/jpeg', quality: 0.6, as: 'dataURL' });
    expect(asked[0]).toMatchObject({ type: 'image/jpeg', quality: 0.6, as: 'dataURL' });
  });
});
