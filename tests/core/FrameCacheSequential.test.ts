import { describe, it, expect, vi } from 'vitest';
import { FrameCache, type FrameSink } from '../../src/core/FrameCache';

/** A fake video of `n` frames at 30 fps: samples() yields them in order from the one that covers `start`; getSample(t) is the old random-access call. */
function fakeVideo(n: number, opts: { bytes?: number; failAt?: number } = {}) {
  const frames = Array.from({ length: n }, (_, i) => ({ id: i, close: vi.fn(), allocationSize: () => opts.bytes ?? 3_000_000 }));
  const log = { samplesCalls: [] as number[], getSampleCalls: 0, pulls: 0, iteratorReturns: 0 };
  const sample = (i: number) => ({ timestamp: i / 30, toVideoFrame: () => frames[i] as unknown as VideoFrame, close: vi.fn() });
  const covering = (t: number) => Math.min(n - 1, Math.max(0, Math.floor(t * 30 + 1e-6)));
  const sink: FrameSink = {
    async getSample(t) { log.getSampleCalls++; return t < 0 ? null : sample(covering(t)); },
    async *samples(start = 0) {
      log.samplesCalls.push(start);
      try {
        for (let i = covering(start); i < n; i++) { log.pulls++; if (opts.failAt === i) throw new DOMException('boom', 'EncodingError'); yield sample(i); }
      } finally { log.iteratorReturns++; }
    },
  };
  return { frames, sink, log };
}
const idOf = (f: unknown) => (f as { id: number } | null)?.id ?? null;

describe('FrameCache, sequential reading — one decoder pass for a movie that asks for frame after frame', () => {
  it('serves 100 frames in order from ONE samples() pass (the first request is a getSample: nothing says yet that frames will follow)', async () => {
    const v = fakeVideo(120);
    const cache = new FrameCache(v.sink, { capacity: 8 });
    for (let i = 0; i < 100; i++) expect(idOf(await cache.getFrameAt(i / 30 + 0.001))).toBe(i);
    expect(v.log.samplesCalls.length).toBe(1);
    expect(v.log.getSampleCalls).toBe(1);                                        // not 100: that was the 20 ms seek per frame
  });

  it('the same time again, or a time inside the same frame, pulls nothing more', async () => {
    const v = fakeVideo(60);
    const cache = new FrameCache(v.sink, { capacity: 8 });
    await cache.getFrameAt(0.5);
    expect(idOf(await cache.getFrameAt(0.55))).toBe(16);                         // starts the pass
    const pulls = v.log.pulls, singles = v.log.getSampleCalls;
    expect(idOf(await cache.getFrameAt(0.55))).toBe(16);
    expect(idOf(await cache.getFrameAt(0.56))).toBe(16);
    expect(idOf(await cache.getFrameAt(0.5))).toBe(15);                          // held: the pass moved on, the frame is still here
    expect(v.log.pulls).toBe(pulls);
    expect(v.log.getSampleCalls).toBe(singles);
  });

  it('a request far from the last one (a seek) is one getSample, not a new pass; the running pass is closed', async () => {
    const v = fakeVideo(300);
    const cache = new FrameCache(v.sink, { capacity: 3 });
    for (let i = 100; i < 140; i++) await cache.getFrameAt(i / 30);
    expect(idOf(await cache.getFrameAt(2))).toBe(60);
    expect(v.log.samplesCalls.length).toBe(1);
    expect(v.log.getSampleCalls).toBe(2);                                    // the first request and the seek
    expect(v.log.iteratorReturns).toBeGreaterThanOrEqual(1);                 // the pass was closed, not left running
    expect(idOf(await cache.getFrameAt(2))).toBe(60);                        // the same seek again: held
  });

  it('playing backwards (frame after frame, going down) decodes a window behind the request once, so most steps are answered from what is held', async () => {
    const v = fakeVideo(300);
    const cache = new FrameCache(v.sink, { capacity: 30 });
    for (let i = 200; i >= 100; i--) expect(idOf(await cache.getFrameAt(i / 30 + 0.001))).toBe(i);
    expect(v.log.getSampleCalls).toBeLessThanOrEqual(2);
    expect(v.log.samplesCalls.length).toBeLessThanOrEqual(5);                  // not one pass per frame (101)
  });

  it('a jump far ahead is one getSample instead of decoding everything in between; frames asked next to it then start a pass', async () => {
    const v = fakeVideo(900);
    const cache = new FrameCache(v.sink, { capacity: 4 });
    await cache.getFrameAt(0);
    expect(idOf(await cache.getFrameAt(20))).toBe(600);
    expect(v.log.samplesCalls.length).toBe(0);
    expect(idOf(await cache.getFrameAt(20.04))).toBe(601);
    expect(v.log.samplesCalls.length).toBe(1);
    expect(v.log.pulls).toBeLessThan(10);
  });

  it('before the first frame the answer is null (like getSample); past the last frame it is the last frame', async () => {
    const v = fakeVideo(30);
    const cache = new FrameCache(v.sink, { capacity: 4 });
    expect(await cache.getFrameAt(-0.5)).toBeNull();
    expect(idOf(await cache.getFrameAt(5))).toBe(29);
    expect(idOf(await cache.getFrameAt(6))).toBe(29);
  });

  it('requests that arrive at once (live playback ticks) are answered in order from one pass', async () => {
    const v = fakeVideo(60);
    const cache = new FrameCache(v.sink, { capacity: 8 });
    const got = await Promise.all([0.0, 0.034, 0.068, 0.1].map(t => cache.getFrameAt(t)));
    expect(got.map(idOf)).toEqual([0, 1, 2, 3]);
    expect(v.log.samplesCalls.length).toBe(1);
  });

  it('keeps at most `capacity` frames (closing the oldest) and never the one it stands on; dispose closes everything and the pass', async () => {
    const v = fakeVideo(40);
    const cache = new FrameCache(v.sink, { capacity: 3 });
    for (let i = 0; i < 10; i++) await cache.getFrameAt(i / 30);
    expect(v.frames[0]!.close).toHaveBeenCalled();
    expect(v.frames[9]!.close).not.toHaveBeenCalled();
    cache.dispose();
    expect(v.frames[9]!.close).toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 0));                                  // an async generator finishes its `finally` a tick after return()
    expect(v.log.iteratorReturns).toBe(1);
  });

  it('a big frame (4K) lowers the number it holds: a budget of bytes, not a count of 30', async () => {
    const small = fakeVideo(40, { bytes: 3_000_000 });
    const big = fakeVideo(40, { bytes: 50_000_000 });
    const a = new FrameCache(small.sink, { capacity: 30 }); const b = new FrameCache(big.sink, { capacity: 30 });
    for (let i = 0; i < 40; i++) { await a.getFrameAt(i / 30); await b.getFrameAt(i / 30); }
    expect(a.heldFrames).toBe(30);
    expect(b.heldFrames).toBeLessThanOrEqual(3);
    expect(b.heldFrames).toBeGreaterThanOrEqual(2);
  });

  it('a decoder error gives null for that request and the next request starts a fresh pass', async () => {
    const v = fakeVideo(40, { failAt: 5 });
    const cache = new FrameCache(v.sink, { capacity: 8 });
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(idOf(await cache.getFrameAt(4 / 30))).toBe(4);
    expect(await cache.getFrameAt(5 / 30)).toBeNull();
    debug.mockRestore();
    expect(idOf(await cache.getFrameAt(2))).toBe(39);                         // a seek past the failing frame: the last one
    expect(v.log.samplesCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('a sink without samples() still works the old way (getSample per time)', async () => {
    const v = fakeVideo(20);
    const cache = new FrameCache({ getSample: v.sink.getSample }, { capacity: 4 });
    expect(idOf(await cache.getFrameAt(0.2))).toBe(6);
    expect(v.log.getSampleCalls).toBe(1);
  });
});

function i0(t: number) { return t; }
