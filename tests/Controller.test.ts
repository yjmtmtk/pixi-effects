import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Movie } from '../src/core/Movie';
import { Controller } from '../src/Controller';
import { formatTime, frameToPercent, pxToFrame } from '../src/Controller';

type Listener = (...args: unknown[]) => void;

function makeFakeMovie(overrides: Partial<Movie> = {}): Movie {
  const listeners: Record<string, Listener[]> = {};
  const fake = {
    isPlaying: false,
    currentFrame: 0,
    totalFrames: 240,
    frameRate: 30,
    duration: 8,
    _volume: 1,
    _muted: false,
    get volume() { return this._volume; },
    set volume(v: number) { this._volume = v; },
    get muted() { return this._muted; },
    set muted(v: boolean) { this._muted = v; },
    play() { this.isPlaying = true; },
    pause() { this.isPlaying = false; },
    async gotoFrame(f: number) { this.currentFrame = f; },
    toggleMute() { this._muted = !this._muted; return this._muted; },
    async render() { return new Blob(); },
    on(event: string, fn: Listener) {
      (listeners[event] ??= []).push(fn);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners[event] ?? []) fn(...args);
    },
    ...overrides,
  } as unknown as Movie;
  return fake;
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  document.body.appendChild(c);
  return c;
}

describe('Controller — mounting', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.position = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('wraps canvas when parent is not positioned and inserts the controller bar', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });

    const wrap = canvas.parentElement!;
    expect(wrap.classList.contains('movie-controller-wrap')).toBe(true);
    expect(wrap.querySelector('.movie-controller')).not.toBeNull();
    ctrl.destroy();
  });

  it('does not wrap when parent is already positioned', () => {
    const canvas = makeCanvas();
    const parent = canvas.parentElement!;
    parent.style.position = 'relative';
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });

    expect(canvas.parentElement).toBe(parent);
    expect(parent.querySelector('.movie-controller')).not.toBeNull();
    ctrl.destroy();
  });

  it('destroy removes the bar and unwraps the canvas', () => {
    const canvas = makeCanvas();
    const originalParent = canvas.parentElement!;
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });

    expect(canvas.parentElement!.classList.contains('movie-controller-wrap')).toBe(true);

    ctrl.destroy();
    expect(canvas.parentElement).toBe(originalParent);
    expect(originalParent.querySelector('.movie-controller')).toBeNull();
    expect(originalParent.querySelector('.movie-controller-wrap')).toBeNull();
  });

  it('destroy on a non-wrapped (already-positioned) parent leaves the parent intact', () => {
    const canvas = makeCanvas();
    const parent = canvas.parentElement!;
    parent.style.position = 'relative';
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    ctrl.destroy();

    expect(canvas.parentElement).toBe(parent);
    expect(parent.querySelector('.movie-controller')).toBeNull();
  });

  it('destroy is idempotent (second call is a no-op)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    ctrl.destroy();
    expect(() => ctrl.destroy()).not.toThrow();
    // Canvas should remain in its original parent (document.body), not double-moved.
    expect(canvas.parentElement).toBe(document.body);
  });
});

describe('Controller — styles', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('injects exactly one stylesheet on construct, removes it on destroy', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });

    const styles = document.head.querySelectorAll('style[data-movie-controller]');
    expect(styles.length).toBe(1);

    ctrl.destroy();
    expect(document.head.querySelectorAll('style[data-movie-controller]').length).toBe(0);
  });

  it('injects only one stylesheet even with multiple controllers', () => {
    const c1 = makeCanvas();
    const c2 = makeCanvas();
    const m = makeFakeMovie();
    const a = new Controller(m, { canvas: c1 });
    const b = new Controller(m, { canvas: c2 });
    expect(document.head.querySelectorAll('style[data-movie-controller]').length).toBe(1);
    a.destroy();
    expect(document.head.querySelectorAll('style[data-movie-controller]').length).toBe(1);
    b.destroy();
    expect(document.head.querySelectorAll('style[data-movie-controller]').length).toBe(0);
  });
});

describe('Controller — pure helpers', () => {
  it('formatTime: renders M:SS without leading zero on minutes', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
  });
  it('formatTime: handles negatives by clamping to 0', () => {
    expect(formatTime(-1)).toBe('0:00');
  });
  it('frameToPercent: returns clamped 0..100', () => {
    expect(frameToPercent(0, 100)).toBe(0);
    expect(frameToPercent(50, 100)).toBe(50);
    expect(frameToPercent(100, 100)).toBe(100);
    expect(frameToPercent(150, 100)).toBe(100);
    expect(frameToPercent(-1, 100)).toBe(0);
    expect(frameToPercent(0, 0)).toBe(0);
  });
  it('pxToFrame: maps clientX within rect to a frame, rounded and clamped', () => {
    const rect = { left: 100, width: 200 } as DOMRect;
    expect(pxToFrame(100, rect, 100)).toBe(0);
    expect(pxToFrame(200, rect, 100)).toBe(50);
    expect(pxToFrame(300, rect, 100)).toBe(100);
    expect(pxToFrame(50, rect, 100)).toBe(0);
    expect(pxToFrame(500, rect, 100)).toBe(100);
    expect(pxToFrame(150, rect, 100)).toBe(25);
  });
});

describe('Controller — bar DOM', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('renders progress bar, play/mute/time/spacer/export', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    expect(root.querySelector('.mc-progress')).not.toBeNull();
    expect(root.querySelector('.mc-progress-fill')).not.toBeNull();
    expect(root.querySelector('.mc-progress-thumb')).not.toBeNull();
    expect(root.querySelector('.mc-bar')).not.toBeNull();
    expect(root.querySelector('.mc-play')).not.toBeNull();
    expect(root.querySelector('.mc-mute')).not.toBeNull();
    expect(root.querySelector('.mc-time')!.textContent).toBe('0:00 / 0:00');
    expect(root.querySelector('.mc-export')).not.toBeNull();
    ctrl.destroy();
  });

  it('omits export button when showExportButton is false', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas, showExportButton: false });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    expect(root.querySelector('.mc-export')).toBeNull();
    ctrl.destroy();
  });
});

describe('Controller — playback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('ready event sets aria-valuemax and refreshes total time', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie({ totalFrames: 300, frameRate: 30, duration: 10 } as Partial<Movie>);
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const progress = canvas.parentElement!.querySelector('.mc-progress')!;
    expect(progress.getAttribute('aria-valuemax')).toBe('300');
    const time = canvas.parentElement!.querySelector('.mc-time')!;
    expect(time.textContent).toBe('0:00 / 0:10');
    ctrl.destroy();
  });

  it('frame event updates progress fill and time text', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie({ totalFrames: 200, frameRate: 25, duration: 8 } as Partial<Movie>);
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    movie.emit('frame', { frame: 100, totalFrames: 200 });
    const fill = canvas.parentElement!.querySelector('.mc-progress-fill') as HTMLDivElement;
    const thumb = canvas.parentElement!.querySelector('.mc-progress-thumb') as HTMLDivElement;
    expect(fill.style.width).toBe('50%');
    expect(thumb.style.left).toBe('50%');
    const time = canvas.parentElement!.querySelector('.mc-time')!;
    expect(time.textContent).toBe('0:04 / 0:08');
    ctrl.destroy();
  });

  it('play button click toggles movie play/pause and swaps icon', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const playBtn = canvas.parentElement!.querySelector('.mc-play') as HTMLButtonElement;
    expect(movie.isPlaying).toBe(false);
    expect(playBtn.innerHTML).toContain('M3 2 L13 8 L3 14 Z'); // play triangle
    playBtn.click();
    expect(movie.isPlaying).toBe(true);
    expect(playBtn.innerHTML).toContain('<rect'); // pause bars
    playBtn.click();
    expect(movie.isPlaying).toBe(false);
    expect(playBtn.innerHTML).toContain('M3 2 L13 8 L3 14 Z');
    ctrl.destroy();
  });
});

describe('Controller — scrubbing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('pointerdown on progress pauses if playing and seeks to position', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie({ totalFrames: 100 } as Partial<Movie>);
    movie.isPlaying = true;
    const seeks: number[] = [];
    movie.gotoFrame = async (f: number) => { seeks.push(f); movie.currentFrame = f; };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');

    const progress = canvas.parentElement!.querySelector('.mc-progress') as HTMLDivElement;
    // Stub getBoundingClientRect because happy-dom returns zeros.
    progress.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 16, width: 200, height: 16, x: 0, y: 0, toJSON() { return {}; } });
    progress.setPointerCapture = () => {};
    progress.releasePointerCapture = () => {};

    const down = new PointerEvent('pointerdown', { clientX: 100, pointerId: 1 });
    progress.dispatchEvent(down);
    expect(movie.isPlaying).toBe(false);
    expect(seeks).toEqual([50]);
    expect(progress.classList.contains('mc-scrubbing')).toBe(true);
    ctrl.destroy();
  });

  it('pointermove while scrubbing seeks; pointerup resumes if was playing', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie({ totalFrames: 100 } as Partial<Movie>);
    movie.isPlaying = true;
    const seeks: number[] = [];
    movie.gotoFrame = async (f: number) => { seeks.push(f); movie.currentFrame = f; };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const progress = canvas.parentElement!.querySelector('.mc-progress') as HTMLDivElement;
    progress.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 16, width: 200, height: 16, x: 0, y: 0, toJSON() { return {}; } });
    progress.setPointerCapture = () => {};
    progress.releasePointerCapture = () => {};

    progress.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }));
    progress.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, pointerId: 1 }));
    progress.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerId: 1 }));
    progress.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, pointerId: 1 }));

    expect(seeks).toEqual([0, 40, 100, 100]);
    expect(movie.isPlaying).toBe(true);
    expect(progress.classList.contains('mc-scrubbing')).toBe(false);
    ctrl.destroy();
  });

  it('pointermove without scrubbing does NOT seek', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie({ totalFrames: 100 } as Partial<Movie>);
    const seeks: number[] = [];
    movie.gotoFrame = async (f: number) => { seeks.push(f); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const progress = canvas.parentElement!.querySelector('.mc-progress') as HTMLDivElement;
    progress.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 16, width: 200, height: 16, x: 0, y: 0, toJSON() { return {}; } });
    progress.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, pointerId: 1 }));
    expect(seeks).toEqual([]);
    ctrl.destroy();
  });
});

describe('Controller — mute', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('mute button toggles movie.muted and swaps icon', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const muteBtn = canvas.parentElement!.querySelector('.mc-mute') as HTMLButtonElement;
    expect(movie.muted).toBe(false);
    expect(muteBtn.innerHTML).toContain('Q13 8 11 11'); // volumeOn waves
    muteBtn.click();
    expect(movie.muted).toBe(true);
    expect(muteBtn.innerHTML).toContain('M11 5 L15 11'); // volumeOff X
    muteBtn.click();
    expect(movie.muted).toBe(false);
    ctrl.destroy();
  });

  it('volume === 0 (not muted) shows volumeOff icon', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    movie.volume = 0;
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const muteBtn = canvas.parentElement!.querySelector('.mc-mute') as HTMLButtonElement;
    expect(muteBtn.innerHTML).toContain('M11 5 L15 11');
    ctrl.destroy();
  });
});

describe('Controller — export', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('clicking export shows overlay, calls movie.render, then hides overlay', async () => {
    const canvas = makeCanvas();
    let renderCalled = false;
    const movie = makeFakeMovie();
    movie.render = async () => { renderCalled = true; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const exportBtn = canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement;
    exportBtn.click();
    // Overlay appears synchronously
    expect(document.querySelector('.mc-export-overlay')).not.toBeNull();
    // Wait two microtask flushes for render() + setTimeout(0)
    await new Promise((r) => setTimeout(r, 600));
    expect(renderCalled).toBe(true);
    expect(document.querySelector('.mc-export-overlay')).toBeNull();
    ctrl.destroy();
  });

  it('progress events while exporting update the overlay text and bar', async () => {
    const canvas = makeCanvas();
    let resolveRender: ((b: Blob) => void) | null = null;
    const movie = makeFakeMovie();
    movie.render = () => new Promise<Blob>((res) => { resolveRender = res; });
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    (canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement).click();
    movie.emit('progress', { progress: 42, frame: 84, totalFrames: 200 });
    const fill = document.querySelector('.mc-export-fill') as HTMLDivElement;
    const text = document.querySelector('.mc-export-text') as HTMLDivElement;
    expect(fill.style.width).toBe('42%');
    expect(text.textContent).toContain('42%');
    expect(text.textContent).toContain('84');
    expect(text.textContent).toContain('200');
    resolveRender!(new Blob());
    await new Promise((r) => setTimeout(r, 600));
    ctrl.destroy();
  });
});

describe('Controller — visibility', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('starts visible', () => {
    const canvas = makeCanvas();
    const ctrl = new Controller(makeFakeMovie(), { canvas });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    expect(root.getAttribute('data-state')).toBe('visible');
    ctrl.destroy();
  });

  it('on play, hides after 2500ms of no pointer activity', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    (canvas.parentElement!.querySelector('.mc-play') as HTMLButtonElement).click();
    vi.advanceTimersByTime(2499);
    expect(root.getAttribute('data-state')).toBe('visible');
    vi.advanceTimersByTime(2);
    expect(root.getAttribute('data-state')).toBe('hidden');
    ctrl.destroy();
  });

  it('pointermove on wrapper resets the idle timer', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    const root = wrap.querySelector('.movie-controller')!;
    (wrap.querySelector('.mc-play') as HTMLButtonElement).click();
    vi.advanceTimersByTime(2000);
    wrap.dispatchEvent(new PointerEvent('pointermove'));
    vi.advanceTimersByTime(2000);
    expect(root.getAttribute('data-state')).toBe('visible');
    vi.advanceTimersByTime(600);
    expect(root.getAttribute('data-state')).toBe('hidden');
    ctrl.destroy();
  });

  it('mouseleave on wrapper hides immediately when playing', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    const root = wrap.querySelector('.movie-controller')!;
    (wrap.querySelector('.mc-play') as HTMLButtonElement).click();
    wrap.dispatchEvent(new MouseEvent('mouseleave'));
    expect(root.getAttribute('data-state')).toBe('hidden');
    ctrl.destroy();
  });

  it('pause forces visible and cancels idle timer', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    const root = wrap.querySelector('.movie-controller')!;
    const play = wrap.querySelector('.mc-play') as HTMLButtonElement;
    play.click(); // play
    wrap.dispatchEvent(new MouseEvent('mouseleave'));
    expect(root.getAttribute('data-state')).toBe('hidden');
    play.click(); // pause
    expect(root.getAttribute('data-state')).toBe('visible');
    vi.advanceTimersByTime(5000);
    expect(root.getAttribute('data-state')).toBe('visible');
    ctrl.destroy();
  });
});
