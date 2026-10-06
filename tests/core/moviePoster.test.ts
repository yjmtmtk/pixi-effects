import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('../../src/core/Renderer', () => ({ exportFrames: vi.fn() }));
import { Movie } from '../../src/core/Movie';
import { normalizePoster } from '../../src/core/poster';

/** A "ready" Movie without a GPU: the drawing steps are stubbed and counted, the playhead logic is the real one. */
function readyMovie(totalFrames = 60, frameRate = 30) {
  const m = new Movie();
  const a = m as unknown as Record<string, unknown>;
  const drawn: number[] = [];
  Object.assign(a, { _initState: 'ready', totalFrames, frameRate, duration: totalFrames / frameRate });
  a.timeline = gsap.timeline({ paused: true }).add(gsap.to({}, { duration: totalFrames / frameRate }));      // a timeline with a length, as init() makes it
  a._rootSequence = {}; a.app = {};                                                                        // what _requireReady looks for
  a._awaitVideoFrames = async () => {};
  a._updateSpace = () => {};
  a._renderNow = () => { drawn.push(Math.round((a.timeline as { time(): number }).time() * frameRate)); };      // the frame the timeline is at when it draws
  return { m, a, drawn };
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('normalizePoster — the poster time option', () => {
  it('no poster is null; seconds are kept and become a frame number', () => {
    expect(normalizePoster(undefined, 12, 30)).toEqual({ seconds: null, frame: null });
    expect(normalizePoster(9.5, 12, 30)).toEqual({ seconds: 9.5, frame: 285 });
    expect(normalizePoster(0, 12, 30)).toEqual({ seconds: 0, frame: 0 });
  });

  it('a time past the end is clamped to the last frame, a negative one counts back from the end, and both say so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizePoster(20, 12, 30)).toEqual({ seconds: 12, frame: 360 });
    expect(String(warn.mock.calls[0]![0])).toMatch(/poster.*20.*12/s);
    expect(normalizePoster(-2, 12, 30)).toEqual({ seconds: 10, frame: 300 });                  // like a keyframe's negative `at`
    warn.mockRestore();
  });

  it('something that is not a finite number is ignored with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizePoster('9' as never, 12, 30)).toEqual({ seconds: null, frame: null });
    expect(normalizePoster(Number.NaN, 12, 30)).toEqual({ seconds: null, frame: null });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('a movie with a poster time', () => {
  it('shows the poster picture without moving the playhead: currentFrame stays 0, the canvas is drawn at the poster frame', async () => {
    const { m, a, drawn } = readyMovie();
    Object.assign(a, { poster: 1, _posterFrame: 30 });
    await (m as unknown as { _showPoster(): Promise<void> })._showPoster();
    expect(drawn).toEqual([30]);
    expect(m.currentFrame).toBe(0);
    expect(m.poster).toBe(1);
    expect(m.posterFrame).toBe(30);
  });

  it('the first gotoFrame(0) really draws frame 0 (it must not be skipped as "already there"), and the poster state is over', async () => {
    const { m, a, drawn } = readyMovie();
    Object.assign(a, { poster: 1, _posterFrame: 30 });
    await (m as unknown as { _showPoster(): Promise<void> })._showPoster();
    drawn.length = 0;
    await m.gotoFrame(0);
    expect(drawn).toEqual([0]);
    await m.gotoFrame(0);                       // now it is skipped, as before
    expect(drawn).toEqual([0]);
  });

  it('play() starts from 0, not from the poster', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { m, a, drawn } = readyMovie();
    Object.assign(a, { poster: 1, _posterFrame: 30 });
    await (m as unknown as { _showPoster(): Promise<void> })._showPoster();
    drawn.length = 0;
    m.play();
    await vi.advanceTimersByTimeAsync(100);
    m.pause();
    vi.useRealTimers();
    expect(drawn[0]).toBe(0);
    expect(Math.max(...drawn)).toBeLessThan(10);
  });

  it('without a poster nothing changes: poster / posterFrame are null', () => {
    const { m } = readyMovie();
    expect(m.poster).toBeNull();
    expect(m.posterFrame).toBeNull();
  });

  it('posterImage() is the picture at the poster time and leaves the movie as it was: still showing the poster, or back at the frame it was at', async () => {
    const { m, a, drawn } = readyMovie();
    Object.assign(a, { poster: 1, _posterFrame: 30 });
    const shots: number[] = [];
    (a as { snapshot: unknown }).snapshot = async (frame: number) => { shots.push(frame); a.currentFrame = frame; return new Blob(['x']); };      // the real one seeks there and stays
    await (m as unknown as { _showPoster(): Promise<void> })._showPoster();
    drawn.length = 0;
    const img = await m.posterImage();
    expect(img).toBeInstanceOf(Blob);
    expect(shots).toEqual([30]);
    expect(drawn[drawn.length - 1]).toBe(30);                       // the canvas shows the poster again
    expect(m.currentFrame).toBe(0);

    await m.gotoFrame(12);                                          // the viewer moved on: the poster state is over
    drawn.length = 0;
    await m.posterImage();
    expect(m.currentFrame).toBe(12);
    expect(drawn[drawn.length - 1]).toBe(12);                       // back at frame 12, not at the poster
  });

  it('posterImage() of a movie without a poster is frame 0', async () => {
    const { m, a } = readyMovie();
    const shots: number[] = [];
    (a as { snapshot: unknown }).snapshot = async (frame: number) => { shots.push(frame); a.currentFrame = frame; return new Blob(['x']); };      // the real one seeks there and stays
    await m.posterImage();
    expect(shots).toEqual([0]);
  });
});
