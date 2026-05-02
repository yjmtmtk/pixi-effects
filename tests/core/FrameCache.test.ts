import { describe, it, expect, vi } from 'vitest';
import { FrameCache, type FrameSink } from '../../src/core/FrameCache';

interface FakeFrame { id: number; close: ReturnType<typeof vi.fn> }

function makeFakeFrame(id: number): FakeFrame {
  return { id, close: vi.fn() };
}

function makeFakeSink(frames: { timestamp: number; frame: FakeFrame }[]): FrameSink {
  return {
    async getSample(time: number) {
      let best = frames[0]!;
      for (const f of frames) {
        if (f.timestamp <= time && f.timestamp >= best.timestamp) best = f;
      }
      return {
        timestamp: best.timestamp,
        toVideoFrame: () => best.frame as unknown as VideoFrame,
        close: vi.fn(),
      };
    },
  };
}

describe('FrameCache', () => {
  it('returns a frame for a given time', async () => {
    const f0 = makeFakeFrame(0);
    const f1 = makeFakeFrame(1);
    const sink = makeFakeSink([
      { timestamp: 0,    frame: f0 },
      { timestamp: 0.5,  frame: f1 },
    ]);
    const cache = new FrameCache(sink, { capacity: 2 });
    expect(await cache.getFrameAt(0.0)).toBe(f0 as unknown);
    expect(await cache.getFrameAt(0.5)).toBe(f1 as unknown);
  });

  it('evicts oldest when over capacity, calling close()', async () => {
    const fs = [makeFakeFrame(0), makeFakeFrame(1), makeFakeFrame(2)];
    const sink = makeFakeSink([
      { timestamp: 0,   frame: fs[0]! },
      { timestamp: 0.5, frame: fs[1]! },
      { timestamp: 1.0, frame: fs[2]! },
    ]);
    const cache = new FrameCache(sink, { capacity: 2 });
    await cache.getFrameAt(0);
    await cache.getFrameAt(0.5);
    await cache.getFrameAt(1.0);
    expect(fs[0]!.close).toHaveBeenCalled();
    expect(fs[1]!.close).not.toHaveBeenCalled();
    expect(fs[2]!.close).not.toHaveBeenCalled();
  });

  it('dispose closes all cached frames', async () => {
    const fs = [makeFakeFrame(0), makeFakeFrame(1)];
    const sink = makeFakeSink([
      { timestamp: 0,   frame: fs[0]! },
      { timestamp: 0.5, frame: fs[1]! },
    ]);
    const cache = new FrameCache(sink, { capacity: 5 });
    await cache.getFrameAt(0);
    await cache.getFrameAt(0.5);
    cache.dispose();
    expect(fs[0]!.close).toHaveBeenCalled();
    expect(fs[1]!.close).toHaveBeenCalled();
  });
});
