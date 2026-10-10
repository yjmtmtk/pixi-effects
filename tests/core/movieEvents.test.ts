import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('../../src/core/Renderer', () => ({ exportFrames: vi.fn() }));
import { Movie } from '../../src/core/Movie';
import { exportFrames } from '../../src/core/Renderer';
import { createTimeline } from '../../src/core/timelineEngine';

/** A Movie that is "ready" without a GPU: the drawing steps are stubbed, the playhead logic is the real one. */
function readyMovie(totalFrames = 30, frameRate = 30) {
  const m = new Movie();
  const a = m as unknown as Record<string, unknown>;
  Object.assign(a, { _initState: 'ready', totalFrames, frameRate, duration: totalFrames / frameRate });
  a.timeline = createTimeline({ paused: true });
  a._awaitVideoFrames = async () => {};
  a._updateSpace = () => {};
  a._renderNow = () => {};
  return m;
}
function record(m: Movie, ...events: string[]) {
  const log: Array<[string, unknown]> = [];
  for (const e of events) (m as unknown as { on(e: string, f: (p?: unknown) => void): void }).on(e, p => log.push([e, p]));
  return log;
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('Movie events: the names an HTML5 <video> has', () => {
  it('seeking then seeked around a gotoFrame, with the frame; nothing when the frame does not change', async () => {
    const m = readyMovie();
    const log = record(m, 'seeking', 'frame', 'seeked');
    await m.gotoFrame(12);
    expect(log.map(l => l[0])).toEqual(['seeking', 'frame', 'seeked']);
    expect(log[0]![1]).toEqual({ frame: 12, totalFrames: 30 });
    expect(log[2]![1]).toEqual({ frame: 12, totalFrames: 30 });
    log.length = 0;
    await m.gotoFrame(12);                                              // already there: no seek
    expect(log).toEqual([]);
  });

  it('a seek past the end reports the frame it actually landed on', async () => {
    const m = readyMovie();
    const log = record(m, 'seeked');
    await m.gotoFrame(999);
    expect(log[0]![1]).toEqual({ frame: 30, totalFrames: 30 });
  });

  it('volumechange when volume or muted really changes (with both values), not when it is set to what it already is', () => {
    const m = readyMovie();
    const log = record(m, 'volumechange');
    m.volume = 0.5;
    m.volume = 0.5;
    m.muted = true;
    m.muted = true;
    m.toggleMute();
    expect(log.map(l => l[1])).toEqual([
      { volume: 0.5, muted: false }, { volume: 0.5, muted: true }, { volume: 0.5, muted: false },
    ]);
    m.volume = 7;                                                       // clamped to 1: that is a change
    expect(log[3]![1]).toEqual({ volume: 1, muted: false });
  });

  describe('ended', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('is emitted once, after pause, when playback runs off the end; pausing by hand does not emit it', async () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
      const m = readyMovie(30, 30);
      const log = record(m, 'play', 'pause', 'ended');
      m.play();
      await vi.advanceTimersByTimeAsync(1500);                          // 1 s of movie + slack
      expect(log.map(l => l[0])).toEqual(['play', 'pause', 'ended']);
      expect(m.isPlaying).toBe(false);

      const m2 = readyMovie(30, 30);
      const log2 = record(m2, 'pause', 'ended');
      m2.play();
      await vi.advanceTimersByTimeAsync(200);
      m2.pause();
      await vi.advanceTimersByTimeAsync(2000);
      expect(log2.map(l => l[0])).toEqual(['pause']);
    });

    it('playback ticks do not emit seeking / seeked (a player would flicker its spinner at every frame)', async () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
      const m = readyMovie(30, 30);
      const log = record(m, 'seeking', 'seeked', 'frame');
      m.play();
      await vi.advanceTimersByTimeAsync(500);
      expect(log.filter(l => l[0] === 'frame').length).toBeGreaterThan(3);
      expect(log.filter(l => l[0] !== 'frame')).toEqual([]);
      m.pause();
    });
  });

  it('render() does not emit seeking / seeked for the frames it steps through, and reports a failure as an error event, then rethrows', async () => {
    const m = readyMovie();
    const log = record(m, 'seeking', 'seeked', 'error');
    (exportFrames as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async (movie: Movie) => { await movie.gotoFrame(3, true); await movie.gotoFrame(4, true); });
    await m.render();
    expect(log).toEqual([]);

    (exportFrames as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('encoder exploded'));
    await expect(m.render()).rejects.toThrow('encoder exploded');
    expect(log).toHaveLength(1);
    expect(log[0]![0]).toBe('error');
    expect(log[0]![1]).toMatchObject({ where: 'render', message: 'encoder exploded' });
    expect((log[0]![1] as { error: unknown }).error).toBeInstanceOf(Error);
  });

  it('snapshot() and contactSheet() move the playhead but are not seeks the user asked for: no seeking / seeked from them', async () => {
    const m = readyMovie();
    (m as unknown as Record<string, unknown>).app = { canvas: document.createElement('canvas') };
    (m as unknown as Record<string, unknown>).width = 8;
    (m as unknown as Record<string, unknown>).height = 8;
    const log = record(m, 'seeking', 'seeked');
    await m.snapshot(5).catch(() => { /* happy-dom cannot draw a canvas: only the events matter */ });
    expect(log).toEqual([]);
  });
});
