import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Movie } from '../src/core/Movie';
import { Controller } from '../src/Controller';
import { formatTime, frameToPercent, pxToFrame, pxToFraction, extensionForMimeType } from '../src/Controller';

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
    pause() {
      const was = this.isPlaying;
      this.isPlaying = false;
      // Mirror real Movie.pause(): emits only on a true playing→paused transition.
      if (was) {
        for (const fn of listeners.pause ?? []) fn();
      }
    },
    async gotoFrame(f: number) { this.currentFrame = f; },
    toggleMute() { this._muted = !this._muted; return this._muted; },
    async render() { return new Blob(); },
    on(event: string, fn: Listener) {
      (listeners[event] ??= []).push(fn);
      return this;
    },
    off(event: string, fn: Listener) {
      const list = listeners[event];
      if (!list) return this;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
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

  it('destroy unsubscribes Movie listeners (no leaked refs)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    ctrl.destroy();
    // After destroy, emitting events must not throw or touch removed DOM.
    expect(() => movie.emit('ready')).not.toThrow();
    expect(() => movie.emit('frame', { frame: 1, totalFrames: 10 })).not.toThrow();
    expect(() => movie.emit('pause')).not.toThrow();
    expect(() => movie.emit('progress', { progress: 50, frame: 5, totalFrames: 10 })).not.toThrow();
  });

  it('destroy removes wrapper-level pointermove/mouseleave listeners (when not wrapped here)', () => {
    const canvas = makeCanvas();
    const parent = canvas.parentElement!;
    parent.style.position = 'relative';
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    ctrl.destroy();
    // Hand-attach a sentinel and dispatch — if Controller's listeners are still attached they'd touch
    // their (now nullified) state. The strongest assertion happy-dom supports is "no throw".
    expect(() => parent.dispatchEvent(new PointerEvent('pointermove'))).not.toThrow();
    expect(() => parent.dispatchEvent(new MouseEvent('mouseleave'))).not.toThrow();
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
  it('pxToFraction: returns clamped 0..1 with optional inset', () => {
    const rect = { left: 0, width: 100 } as DOMRect;
    expect(pxToFraction(0, rect)).toBe(0);
    expect(pxToFraction(50, rect)).toBe(0.5);
    expect(pxToFraction(100, rect)).toBe(1);
    expect(pxToFraction(-10, rect)).toBe(0);
    expect(pxToFraction(150, rect)).toBe(1);
    // With inset 4 on each side, effective range is left=4..96 (width 92).
    const insetRect = { left: 0, width: 100 } as DOMRect;
    expect(pxToFraction(4, insetRect, 4)).toBe(0);
    expect(pxToFraction(50, insetRect, 4)).toBeCloseTo(46 / 92, 5);
    expect(pxToFraction(96, insetRect, 4)).toBe(1);
    // Width zero or fully consumed by inset -> 0.
    expect(pxToFraction(10, { left: 0, width: 0 } as DOMRect)).toBe(0);
    expect(pxToFraction(10, { left: 0, width: 8 } as DOMRect, 4)).toBe(0);
  });
  it('extensionForMimeType: maps common video MIMEs, falls back to mp4', () => {
    expect(extensionForMimeType('video/mp4')).toBe('mp4');
    expect(extensionForMimeType('video/webm')).toBe('webm');
    expect(extensionForMimeType('video/quicktime')).toBe('mov');
    expect(extensionForMimeType('video/x-matroska')).toBe('mkv');
    expect(extensionForMimeType('')).toBe('mp4');
    expect(extensionForMimeType('application/octet-stream')).toBe('mp4');
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
    const progress = canvas.parentElement!.querySelector('.mc-progress') as HTMLDivElement;
    expect(progress.style.getPropertyValue('--mc-fill')).toBe('0.5');
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

  it('movie pause event refreshes play icon, cancels idle timer, forces bar visible', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    const playBtn = canvas.parentElement!.querySelector('.mc-play') as HTMLButtonElement;

    // Simulate movie playing (e.g. user clicked play earlier).
    movie.isPlaying = true;
    playBtn.innerHTML = '<rect/>'; // pretend pause icon is showing
    root.setAttribute('data-state', 'hidden'); // pretend bar auto-hid

    // Movie auto-pauses (or any pause): isPlaying flips to false, then emits 'pause'.
    movie.isPlaying = false;
    movie.emit('pause');

    expect(playBtn.innerHTML).toContain('M3 2 L13 8 L3 14 Z'); // play icon
    expect(root.getAttribute('data-state')).toBe('visible');
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

    // 12px inset on each side reduces effective track from 200 → 176px,
    // so clientX=80 maps to round((80-12)/176 * 100) = 39 (not 40).
    expect(seeks).toEqual([0, 39, 100, 100]);
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

  function openPopoverAndConfirm(canvas: HTMLCanvasElement): void {
    (canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement).click();
    (canvas.parentElement!.querySelector('.mc-export-confirm') as HTMLButtonElement).click();
  }

  it('clicking the download icon does NOT export immediately — only opens the popover', async () => {
    const canvas = makeCanvas();
    let renderCalled = false;
    const movie = makeFakeMovie();
    movie.render = async () => { renderCalled = true; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    (canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement).click();
    expect(document.querySelector('.mc-export-overlay')).toBeNull();
    expect(renderCalled).toBe(false);
    expect(canvas.parentElement!.querySelector('.mc-settings-popover')!.getAttribute('data-open')).toBe('true');
    ctrl.destroy();
  });

  it('confirm button shows overlay, calls movie.render, closes popover, then hides overlay', async () => {
    const canvas = makeCanvas();
    let renderCalled = false;
    const movie = makeFakeMovie();
    movie.render = async () => { renderCalled = true; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    openPopoverAndConfirm(canvas);
    // Overlay appears synchronously; popover is closed.
    expect(document.querySelector('.mc-export-overlay')).not.toBeNull();
    expect(canvas.parentElement!.querySelector('.mc-settings-popover')!.getAttribute('data-open')).toBe('false');
    await new Promise((r) => setTimeout(r, 600));
    expect(renderCalled).toBe(true);
    expect(document.querySelector('.mc-export-overlay')).toBeNull();
    ctrl.destroy();
  });

  it('progress overlay is mounted inside the controller root (canvas-scoped)', async () => {
    const canvas = makeCanvas();
    let resolveRender: ((b: Blob) => void) | null = null;
    const movie = makeFakeMovie();
    movie.render = () => new Promise<Blob>((res) => { resolveRender = res; });
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    openPopoverAndConfirm(canvas);
    const overlay = document.querySelector('.mc-export-overlay') as HTMLDivElement;
    const root = canvas.parentElement!.querySelector('.movie-controller') as HTMLDivElement;
    expect(overlay.parentElement).toBe(root);
    resolveRender!(new Blob());
    await new Promise((r) => setTimeout(r, 600));
    ctrl.destroy();
  });

  it('progress events while exporting update the overlay text and bar', async () => {
    const canvas = makeCanvas();
    let resolveRender: ((b: Blob) => void) | null = null;
    const movie = makeFakeMovie();
    movie.render = () => new Promise<Blob>((res) => { resolveRender = res; });
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    openPopoverAndConfirm(canvas);
    movie.emit('progress', { progress: 42, frame: 84, totalFrames: 200 });
    const fill = document.querySelector('.mc-export-fill') as HTMLDivElement;
    const text = document.querySelector('.mc-export-text') as HTMLDivElement;
    expect(fill.style.width).toBe('42%');
    expect(text.textContent).toContain('42%');
    expect(text.textContent).toContain('84');
    expect(text.textContent).toContain('200');
    expect(text.textContent).toContain('frames');
    resolveRender!(new Blob());
    await new Promise((r) => setTimeout(r, 600));
    ctrl.destroy();
  });

  it('triggers a download with a sensible filename + extension', async () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    movie.render = async () => new Blob(['fake'], { type: 'video/mp4' });
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');

    let clicked: HTMLAnchorElement | null = null;
    const origCreate = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag.toLowerCase() === 'a') {
        const a = el as HTMLAnchorElement;
        a.click = () => { clicked = a; };
      }
      return el;
    }) as typeof document.createElement;

    openPopoverAndConfirm(canvas);
    await new Promise((r) => setTimeout(r, 600));
    document.createElement = origCreate;

    expect(clicked).not.toBeNull();
    const a = clicked! as HTMLAnchorElement;
    expect(a.download).toMatch(/^movie-\d{8}-\d{6}\.mp4$/);
    expect(a.href).toMatch(/^blob:/);
    ctrl.destroy();
  });

  it('overlay copy is in English', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    openPopoverAndConfirm(canvas);
    expect(document.querySelector('.mc-export-title')!.textContent).toBe('Exporting video...');
    expect(document.querySelector('.mc-export-text')!.textContent).toBe('0% (0 / 0 frames)');
    ctrl.destroy();
  });

  it('confirm passes the current format + quality to movie.render()', async () => {
    const canvas = makeCanvas();
    let renderArgs: unknown = null;
    const movie = makeFakeMovie();
    movie.render = async (opts?: unknown) => { renderArgs = opts; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');

    // Pick non-default values via the popover selects (no need to open the popover for this).
    const fmt = canvas.parentElement!.querySelector('.mc-settings-format') as HTMLSelectElement;
    const q = canvas.parentElement!.querySelector('.mc-settings-quality') as HTMLSelectElement;
    fmt.value = 'webm';
    fmt.dispatchEvent(new Event('change', { bubbles: true }));
    q.value = 'medium';
    q.dispatchEvent(new Event('change', { bubbles: true }));

    openPopoverAndConfirm(canvas);
    await new Promise((r) => setTimeout(r, 600));
    expect(renderArgs).toEqual({
      format: 'webm',
      video: { bitrate: 'medium' },
      audio: { bitrate: 'medium' },
    });
    ctrl.destroy();
  });

  it('default export options are mp4 + high', async () => {
    const canvas = makeCanvas();
    let renderArgs: unknown = null;
    const movie = makeFakeMovie();
    movie.render = async (opts?: unknown) => { renderArgs = opts; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    openPopoverAndConfirm(canvas);
    await new Promise((r) => setTimeout(r, 600));
    expect(renderArgs).toEqual({
      format: 'mp4',
      video: { bitrate: 'high' },
      audio: { bitrate: 'high' },
    });
    ctrl.destroy();
  });

  it('Shift+E shortcut bypasses the popover and exports directly', async () => {
    const canvas = makeCanvas();
    let renderCalled = false;
    const movie = makeFakeMovie();
    movie.render = async () => { renderCalled = true; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', shiftKey: true }));
    await new Promise((r) => setTimeout(r, 600));
    expect(renderCalled).toBe(true);
    // Popover stays closed throughout the shortcut.
    expect(canvas.parentElement!.querySelector('.mc-settings-popover')!.getAttribute('data-open')).toBe('false');
    ctrl.destroy();
  });
});

describe('Controller — keyboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('Space toggles play/pause', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(movie.isPlaying).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(movie.isPlaying).toBe(false);
    ctrl.destroy();
  });

  it('ArrowLeft / ArrowRight step one frame', async () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie({ totalFrames: 100 } as Partial<Movie>);
    movie.currentFrame = 50;
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    await Promise.resolve();
    expect(movie.currentFrame).toBe(51);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    await Promise.resolve();
    expect(movie.currentFrame).toBe(50);
    ctrl.destroy();
  });

  it('ArrowUp / ArrowDown adjust volume by 5% and clamp', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    movie.volume = 0.5;
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    expect(movie.volume).toBeCloseTo(0.55, 5);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    expect(movie.volume).toBeCloseTo(0.45, 5);
    movie.volume = 0.98;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    expect(movie.volume).toBe(1);
    movie.volume = 0.02;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    expect(movie.volume).toBe(0);
    ctrl.destroy();
  });

  it('M toggles mute', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
    expect(movie.muted).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
    expect(movie.muted).toBe(false);
    ctrl.destroy();
  });

  it('keyboard ignored when target is INPUT, TEXTAREA, SELECT, or contenteditable', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag) as HTMLElement;
      document.body.appendChild(el);
      const ev = new KeyboardEvent('keydown', { code: 'Space' });
      Object.defineProperty(ev, 'target', { value: el });
      document.dispatchEvent(ev);
      expect(movie.isPlaying).toBe(false);
      el.parentNode?.removeChild(el);
    }
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    const ev = new KeyboardEvent('keydown', { code: 'Space' });
    Object.defineProperty(ev, 'target', { value: editable });
    document.dispatchEvent(ev);
    expect(movie.isPlaying).toBe(false);
    editable.remove();
    ctrl.destroy();
  });

  it('disabled by enableKeyboardShortcuts: false', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas, enableKeyboardShortcuts: false });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(movie.isPlaying).toBe(false);
    ctrl.destroy();
  });
});

describe('Controller — settings popover (DOM)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('renders the export button (acts as popover trigger)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const bar = canvas.parentElement!.querySelector('.mc-bar')!;
    const exportBtn = bar.querySelector('.mc-export') as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();
    expect(exportBtn.getAttribute('aria-expanded')).toBe('false');
    ctrl.destroy();
  });

  it('renders the popover with format/quality selects + Download confirm button (closed by default)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    const popover = root.querySelector('.mc-settings-popover') as HTMLDivElement;
    expect(popover).not.toBeNull();
    expect(popover.getAttribute('data-open')).toBe('false');
    const fmt = popover.querySelector('.mc-settings-format') as HTMLSelectElement;
    const q = popover.querySelector('.mc-settings-quality') as HTMLSelectElement;
    const confirm = popover.querySelector('.mc-export-confirm') as HTMLButtonElement;
    expect(Array.from(fmt.options).map((o) => o.value)).toEqual(['mp4', 'webm', 'mov']);
    expect(Array.from(q.options).map((o) => o.value)).toEqual(['low', 'medium', 'high', 'very-high']);
    expect(fmt.value).toBe('mp4');
    expect(q.value).toBe('high');
    expect(confirm).not.toBeNull();
    expect(confirm.textContent).toBe('Download');
    ctrl.destroy();
  });

  it('omits popover and download button when showExportButton is false', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas, showExportButton: false });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    expect(root.querySelector('.mc-export')).toBeNull();
    expect(root.querySelector('.mc-settings-popover')).toBeNull();
    expect(root.querySelector('.mc-export-confirm')).toBeNull();
    ctrl.destroy();
  });
});

describe('Controller — settings popover (interaction)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('clicking the download button toggles open/closed and aria-expanded', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const exportBtn = canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement;
    const popover = canvas.parentElement!.querySelector('.mc-settings-popover') as HTMLDivElement;
    expect(popover.getAttribute('data-open')).toBe('false');
    expect(exportBtn.getAttribute('aria-expanded')).toBe('false');
    exportBtn.click();
    expect(popover.getAttribute('data-open')).toBe('true');
    expect(exportBtn.getAttribute('aria-expanded')).toBe('true');
    exportBtn.click();
    expect(popover.getAttribute('data-open')).toBe('false');
    expect(exportBtn.getAttribute('aria-expanded')).toBe('false');
    ctrl.destroy();
  });

  it('Escape closes the popover', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const exportBtn = canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement;
    const popover = canvas.parentElement!.querySelector('.mc-settings-popover') as HTMLDivElement;
    exportBtn.click();
    expect(popover.getAttribute('data-open')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(popover.getAttribute('data-open')).toBe('false');
    ctrl.destroy();
  });

  it('outside pointerdown closes the popover; inside does not', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const exportBtn = canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement;
    const popover = canvas.parentElement!.querySelector('.mc-settings-popover') as HTMLDivElement;
    exportBtn.click();
    // Click inside popover (e.g. on a select) — stays open.
    const fmt = popover.querySelector('.mc-settings-format') as HTMLSelectElement;
    fmt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover.getAttribute('data-open')).toBe('true');
    // Click outside (document.body) — closes.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover.getAttribute('data-open')).toBe('false');
    ctrl.destroy();
  });

  it('changing format/quality selects updates Controller state', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const fmt = canvas.parentElement!.querySelector('.mc-settings-format') as HTMLSelectElement;
    const q = canvas.parentElement!.querySelector('.mc-settings-quality') as HTMLSelectElement;
    fmt.value = 'webm';
    fmt.dispatchEvent(new Event('change', { bubbles: true }));
    q.value = 'medium';
    q.dispatchEvent(new Event('change', { bubbles: true }));
    // Internal state isn't directly observable, but the next export call
    // exposes it. We verify that in Task 6.
    expect(fmt.value).toBe('webm');
    expect(q.value).toBe('medium');
    ctrl.destroy();
  });

  it('opening popover during playback prevents auto-hide; closing resumes it', () => {
    vi.useFakeTimers();
    try {
      const canvas = makeCanvas();
      const movie = makeFakeMovie();
      const ctrl = new Controller(movie, { canvas });
      movie.emit('ready');
      const root = canvas.parentElement!.querySelector('.movie-controller')!;
      const exportBtn = canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement;
      const play = canvas.parentElement!.querySelector('.mc-play') as HTMLButtonElement;

      play.click(); // play
      exportBtn.click(); // open popover

      // 5 seconds elapse — bar must stay visible because popover is open.
      vi.advanceTimersByTime(5000);
      expect(root.getAttribute('data-state')).toBe('visible');

      // Close popover; idle timer resumes; after 2.5s the bar hides.
      exportBtn.click();
      expect(root.getAttribute('data-state')).toBe('visible');
      vi.advanceTimersByTime(2501);
      expect(root.getAttribute('data-state')).toBe('hidden');
      ctrl.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Controller — volume slider', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('renders the volume container with mute button + slider, fill at 100% by default', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    expect(wrap.querySelector('.mc-volume')).not.toBeNull();
    const slider = wrap.querySelector('.mc-vol-slider') as HTMLDivElement;
    expect(slider).not.toBeNull();
    expect(slider.style.getPropertyValue('--mc-volume')).toBe('1');
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
    ctrl.destroy();
  });

  it('pointerdown + drag on the slider sets movie.volume and clears mute', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    movie.muted = true;
    movie.volume = 0;
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const slider = canvas.parentElement!.querySelector('.mc-vol-slider') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({ left: 0, top: 0, right: 78, bottom: 28, width: 78, height: 28, x: 0, y: 0, toJSON() { return {}; } });
    slider.setPointerCapture = () => {};
    slider.releasePointerCapture = () => {};

    slider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 39, pointerId: 1 }));
    expect(movie.muted).toBe(false);
    expect(movie.volume).toBeCloseTo(0.5, 2); // (39-4)/(78-8) = 35/70 = 0.5
    expect(slider.classList.contains('mc-scrubbing')).toBe(true);

    slider.dispatchEvent(new PointerEvent('pointermove', { clientX: 4, pointerId: 1 }));
    expect(movie.volume).toBe(0);

    slider.dispatchEvent(new PointerEvent('pointerup', { clientX: 4, pointerId: 1 }));
    expect(slider.classList.contains('mc-scrubbing')).toBe(false);
    ctrl.destroy();
  });

  it('wheel on the volume container adjusts volume by 5% (preventDefault)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    movie.volume = 0.5;
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const container = canvas.parentElement!.querySelector('.mc-volume') as HTMLDivElement;

    const upEvent = new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true });
    container.dispatchEvent(upEvent);
    expect(movie.volume).toBeCloseTo(0.55, 5);
    expect(upEvent.defaultPrevented).toBe(true);

    const downEvent = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
    container.dispatchEvent(downEvent);
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true }));
    expect(movie.volume).toBeCloseTo(0.45, 5);
    ctrl.destroy();
  });

  it('mute click syncs the slider visual to 0 (without changing movie.volume)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    movie.volume = 0.6;
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const slider = canvas.parentElement!.querySelector('.mc-vol-slider') as HTMLDivElement;
    expect(slider.style.getPropertyValue('--mc-volume')).toBe('0.6');
    (canvas.parentElement!.querySelector('.mc-mute') as HTMLButtonElement).click();
    expect(movie.muted).toBe(true);
    expect(movie.volume).toBe(0.6); // volume itself unchanged
    expect(slider.style.getPropertyValue('--mc-volume')).toBe('0'); // visual zeroed
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    ctrl.destroy();
  });
});

describe('Controller — fullscreen', () => {
  // Stub the Fullscreen API on the actual document + canvas-wrapper instances
  // (happy-dom's prototype chain is unreliable for these properties).
  function withFullscreenStub(canvas: HTMLCanvasElement) {
    const state = { current: null as Element | null };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get() { return state.current; },
    });
    const installOnElement = (el: Element) => {
      (el as any).requestFullscreen = () => {
        state.current = el;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      };
    };
    (document as any).exitFullscreen = () => {
      state.current = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    // Install on whatever ends up being the wrapper.
    installOnElement(canvas.parentElement!);
    return state;
  }

  afterEach(() => {
    delete (document as any).exitFullscreen;
    try { delete (document as any).fullscreenElement; } catch { /* property may be defined as accessor */ }
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('renders the fullscreen button', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const btn = canvas.parentElement!.querySelector('.mc-fullscreen') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Enter fullscreen');
    ctrl.destroy();
  });

  it('clicking the button enters fullscreen and swaps icon; clicking again exits', async () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const state = withFullscreenStub(canvas);
    const btn = canvas.parentElement!.querySelector('.mc-fullscreen') as HTMLButtonElement;
    const wrapper = canvas.parentElement!;
    btn.click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(state.current).toBe(wrapper);
    expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen');
    btn.click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(state.current).toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Enter fullscreen');
    ctrl.destroy();
  });

  it('F key toggles fullscreen', async () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const state = withFullscreenStub(canvas);
    const wrapper = canvas.parentElement!;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(state.current).toBe(wrapper);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(state.current).toBeNull();
    ctrl.destroy();
  });

  it('destroy exits fullscreen if controller owns it', async () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const state = withFullscreenStub(canvas);
    (canvas.parentElement!.querySelector('.mc-fullscreen') as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(state.current).not.toBeNull();
    ctrl.destroy();
    expect(state.current).toBeNull();
  });

  it('tags any wrapper (auto-created or reused) with data-mc-wrap so :fullscreen styles apply', () => {
    // Auto-wrapped case
    const c1 = makeCanvas();
    const ctrl1 = new Controller(makeFakeMovie(), { canvas: c1 });
    const w1 = c1.parentElement!;
    expect(w1.classList.contains('movie-controller-wrap')).toBe(true);
    expect(w1.hasAttribute('data-mc-wrap')).toBe(true);
    ctrl1.destroy();

    // Reused-parent case
    const c2 = makeCanvas();
    const reused = c2.parentElement!;
    reused.style.position = 'relative';
    const ctrl2 = new Controller(makeFakeMovie(), { canvas: c2 });
    expect(reused.hasAttribute('data-mc-wrap')).toBe(true);
    ctrl2.destroy();
    // Reused parent should be cleaned up so we don't leave attributes behind on the user's element.
    expect(reused.hasAttribute('data-mc-wrap')).toBe(false);
  });

  it('repositions the controller bar on fullscreenchange even if canvas size is unchanged', () => {
    // ResizeObserver only fires on size changes; entering fullscreen often shifts
    // the canvas position without changing its size (when the viewport is wide
    // enough that the canvas was already at intrinsic size). The controller must
    // still resync its overlay position in that case.
    const canvas = makeCanvas();
    const parent = canvas.parentElement!;
    parent.style.position = 'relative';

    // Pre-fullscreen layout: parent at (1440, 36), canvas at (1520, 558), 1280x720.
    parent.getBoundingClientRect = () => ({
      left: 1440, top: 36, right: 2880, bottom: 1800, width: 1440, height: 1764, x: 1440, y: 36,
      toJSON() { return {}; },
    });
    canvas.getBoundingClientRect = () => ({
      left: 1520, top: 558, right: 2800, bottom: 1278, width: 1280, height: 720, x: 1520, y: 558,
      toJSON() { return {}; },
    });

    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const root = parent.querySelector('.movie-controller') as HTMLDivElement;
    expect(root.style.left).toBe('80px');
    expect(root.style.top).toBe('522px');

    // Enter fullscreen: parent now spans the viewport, canvas is centered. Same size.
    parent.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 2880, bottom: 1800, width: 2880, height: 1800, x: 0, y: 0,
      toJSON() { return {}; },
    });
    canvas.getBoundingClientRect = () => ({
      left: 800, top: 540, right: 2080, bottom: 1260, width: 1280, height: 720, x: 800, y: 540,
      toJSON() { return {}; },
    });
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(root.style.left).toBe('800px');
    expect(root.style.top).toBe('540px');
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

  it('mouseleave on wrapper hides immediately regardless of playing state', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    const root = wrap.querySelector('.movie-controller')!;
    // Playing case
    (wrap.querySelector('.mc-play') as HTMLButtonElement).click();
    wrap.dispatchEvent(new MouseEvent('mouseleave'));
    expect(root.getAttribute('data-state')).toBe('hidden');
    // Pause and verify mouseleave still hides (YouTube-compatible).
    (wrap.querySelector('.mc-play') as HTMLButtonElement).click(); // pause
    // Pause shows the bar momentarily via kickIdleTimer.
    expect(root.getAttribute('data-state')).toBe('visible');
    wrap.dispatchEvent(new MouseEvent('mouseleave'));
    expect(root.getAttribute('data-state')).toBe('hidden');
    ctrl.destroy();
  });

  it('paused state also auto-hides after the idle delay (YouTube-compatible)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    const root = wrap.querySelector('.movie-controller')!;
    // Movie is paused (default). Trigger pointer activity to start the timer.
    wrap.dispatchEvent(new PointerEvent('pointermove'));
    expect(root.getAttribute('data-state')).toBe('visible');
    vi.advanceTimersByTime(2499);
    expect(root.getAttribute('data-state')).toBe('visible');
    vi.advanceTimersByTime(2);
    expect(root.getAttribute('data-state')).toBe('hidden');
    ctrl.destroy();
  });

  it('pause click triggers a fresh idle timer (bar shows then hides on idle)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const wrap = canvas.parentElement!;
    const root = wrap.querySelector('.movie-controller')!;
    const play = wrap.querySelector('.mc-play') as HTMLButtonElement;
    play.click(); // play
    vi.advanceTimersByTime(2501);
    expect(root.getAttribute('data-state')).toBe('hidden');
    play.click(); // pause — should re-show then hide on idle
    expect(root.getAttribute('data-state')).toBe('visible');
    vi.advanceTimersByTime(2501);
    expect(root.getAttribute('data-state')).toBe('hidden');
    ctrl.destroy();
  });
});
