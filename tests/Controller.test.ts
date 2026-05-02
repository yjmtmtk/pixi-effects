import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
