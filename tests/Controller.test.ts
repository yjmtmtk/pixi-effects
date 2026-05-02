import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Movie } from '../src/core/Movie';
import { Controller } from '../src/Controller';

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
