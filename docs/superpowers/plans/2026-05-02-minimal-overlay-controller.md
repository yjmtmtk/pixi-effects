# Minimal Overlay Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/Controller.ts` with a minimal overlay controller that sits on top of the canvas and behaves like HTML5 `<video controls>` (auto-hide on idle, fade on hover, pointer-driven progress bar).

**Architecture:** Single file rewrite. Controller takes a required `canvas` element, wraps it in a positioning context if needed, and absolutely-positions a bottom bar inside that context. SVG icons + injected stylesheet for visuals. Pointer events (with `setPointerCapture`) for progress scrubbing — replaces native `<input type=range>`. State machine for visibility tied to `play`/`pause` events and pointer activity.

**Tech Stack:** TypeScript, vitest + happy-dom for unit tests, no new dependencies. Spec: [`docs/superpowers/specs/2026-05-02-minimal-overlay-controller-design.md`](../specs/2026-05-02-minimal-overlay-controller-design.md).

**Spec reference for reviewers:** Read the spec first. Section names below mirror spec sections so cross-checks are easy.

---

## File Structure

- `src/Controller.ts` — full rewrite, single file. Internally organized as: SVG icon constants → CSS constant → pure helper functions (`formatTime`, `pxToFrame`, `frameToPercent`) → `Controller` class. Estimated ~350 lines.
- `tests/Controller.test.ts` — new file. Covers: mounting/unmounting, pure helpers, mute toggle wiring. Visual behavior (fade, gradients, hover) is verified manually via examples.
- `examples/basic.html` — modify to remove `<div id="ctrl">` and pass `{ canvas }` to Controller.
- `examples/chromakey.html` — same modification.
- `examples/nested.html` — same modification.
- `README.md` — verify Controller usage docs match new API; update if mentioned.

---

## Conventions

- After every code change: run `npm test` (vitest) and `npm run typecheck` before committing.
- Commit after each task. Use conventional commits (`feat:`, `refactor:`, `test:`, `docs:`).
- Tests use vitest's named imports (`import { describe, it, expect, vi, beforeEach } from 'vitest'`). The repo's vitest is already configured for happy-dom.
- All file paths in steps are absolute from repo root.

---

## Mock Movie Helper

Several tasks need a fake `Movie` instance because the real one depends on PixiJS Application + canvas + WebGL. Define this once in `tests/Controller.test.ts` and reuse:

```ts
import type { Movie } from '../src/core/Movie';

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
```

These helpers are introduced in Task 1's test file and referenced by later tasks.

---

## Task 1: Skeleton Controller — constructor, mount, destroy

**Files:**
- Create: `tests/Controller.test.ts`
- Modify (full rewrite): `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`

This task wipes the old controller and replaces it with just enough to mount/unmount. Subsequent tasks fill in DOM, behavior, and styles.

- [ ] **Step 1: Write the failing tests**

Create `tests/Controller.test.ts` with the helpers above plus these tests:

```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — `Controller` constructor errors or DOM expectations fail (old Controller still expects `container`).

- [ ] **Step 3: Replace `src/Controller.ts` with the skeleton**

**Wipe the entire current contents** of `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts` and replace with:

```ts
import type { Movie } from './core/Movie';

export interface ControllerOptions {
  canvas: HTMLCanvasElement;
  showExportButton?: boolean;
  enableKeyboardShortcuts?: boolean;
  className?: string;
}

interface ResolvedOptions {
  canvas: HTMLCanvasElement;
  showExportButton: boolean;
  enableKeyboardShortcuts: boolean;
  className: string;
}

export class Controller {
  movie: Movie;
  options: ResolvedOptions;

  private root: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private wrappedHere = false;

  constructor(movie: Movie, options: ControllerOptions) {
    if (!options || !options.canvas) {
      throw new Error('Controller requires options.canvas (HTMLCanvasElement).');
    }
    this.movie = movie;
    this.options = {
      canvas: options.canvas,
      showExportButton: options.showExportButton ?? true,
      enableKeyboardShortcuts: options.enableKeyboardShortcuts ?? true,
      className: options.className ?? 'movie-controller',
    };

    this.wrapper = this.ensurePositioningContext(this.options.canvas);
    this.root = document.createElement('div');
    this.root.className = this.options.className;
    this.wrapper.appendChild(this.root);
  }

  private ensurePositioningContext(canvas: HTMLCanvasElement): HTMLDivElement {
    const parent = canvas.parentElement;
    if (!parent) {
      throw new Error('Controller: canvas must be attached to the DOM before constructing.');
    }
    const pos = getComputedStyle(parent).position;
    if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
      return parent as HTMLDivElement;
    }
    const wrap = document.createElement('div');
    wrap.className = 'movie-controller-wrap';
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    wrap.style.lineHeight = '0';
    parent.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
    this.wrappedHere = true;
    return wrap;
  }

  destroy(): void {
    this.root.remove();
    if (this.wrappedHere) {
      const parent = this.wrapper.parentElement;
      const canvas = this.options.canvas;
      if (parent) {
        parent.insertBefore(canvas, this.wrapper);
        this.wrapper.remove();
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "refactor(controller): rewrite skeleton — canvas-based mounting, wrap+unwrap"
```

---

## Task 2: SVG icons + style injection

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/Controller.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL on the two style tests.

- [ ] **Step 3: Add icon constants and stylesheet to `src/Controller.ts`**

Insert these constants near the top of the file, **after** the `import` line and **before** `export interface ControllerOptions`:

```ts
const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>',
  volumeOn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 Q13 8 11 11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12.5 3.5 Q15.5 8 12.5 12.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  volumeOff: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 L15 11 M15 5 L11 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 V11 M4 7 L8 11 L12 7 M3 13 H13"/></svg>',
} as const;

const STYLE_ATTR = 'data-movie-controller';

const STYLE_CSS = `
.movie-controller-wrap { position: relative; display: inline-block; line-height: 0; }
.movie-controller {
  position: absolute; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  opacity: 1;
  transition: opacity 200ms ease;
}
.movie-controller[data-state="hidden"] { opacity: 0; }
.movie-controller > * { pointer-events: auto; }

.mc-progress {
  position: relative;
  width: 100%;
  height: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.mc-progress::before {
  content: ""; position: absolute; left: 0; right: 0;
  height: 3px; background: rgba(255,255,255,0.25);
  transition: height 120ms ease;
}
.mc-progress:hover::before, .mc-progress.mc-scrubbing::before { height: 5px; }
.mc-progress-fill {
  position: absolute; left: 0; top: 50%;
  height: 3px; width: 0%;
  background: #007AFF;
  transform: translateY(-50%);
  transition: height 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-fill,
.mc-progress.mc-scrubbing .mc-progress-fill { height: 5px; }
.mc-progress-thumb {
  position: absolute; top: 50%;
  width: 12px; height: 12px; border-radius: 50%;
  background: #007AFF;
  transform: translate(-50%, -50%) scale(0);
  transition: transform 120ms ease;
  pointer-events: none;
  left: 0%;
}
.mc-progress:hover .mc-progress-thumb,
.mc-progress.mc-scrubbing .mc-progress-thumb { transform: translate(-50%, -50%) scale(1); }

.mc-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px 8px 12px;
  background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%);
  color: #fff;
  line-height: 1;
}
.mc-btn {
  background: none; border: 0; padding: 0; margin: 0;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; opacity: 0.85; cursor: pointer;
  transition: opacity 120ms ease;
}
.mc-btn:hover { opacity: 1; }
.mc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mc-time {
  font-size: 12px; font-family: Menlo, Monaco, monospace;
  color: #fff; opacity: 0.85;
  min-width: 90px;
}
.mc-spacer { flex: 1; }

.mc-export-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
}
.mc-export-panel {
  background: #1a1a1a; color: #fff;
  border-radius: 12px; padding: 30px;
  text-align: center; min-width: 300px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.mc-export-title { font-size: 18px; margin-bottom: 20px; }
.mc-export-track {
  width: 100%; height: 8px;
  background: #333; border-radius: 4px;
  margin-bottom: 15px; overflow: hidden;
}
.mc-export-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #007AFF, #0056CC);
  transition: width 0.3s ease; border-radius: 4px;
}
.mc-export-text {
  color: #888; font-size: 14px;
  font-family: Menlo, Monaco, monospace;
}
`;

let styleRefCount = 0;

function installStyles(): void {
  if (styleRefCount === 0) {
    const el = document.createElement('style');
    el.setAttribute(STYLE_ATTR, '');
    el.textContent = STYLE_CSS;
    document.head.appendChild(el);
  }
  styleRefCount++;
}

function uninstallStyles(): void {
  styleRefCount = Math.max(0, styleRefCount - 1);
  if (styleRefCount === 0) {
    document.head.querySelectorAll(`style[${STYLE_ATTR}]`).forEach((n) => n.remove());
  }
}
```

Then in the `Controller` constructor, **before** `this.wrapper = this.ensurePositioningContext(...)`, add:

```ts
    installStyles();
```

And in `destroy()`, **at the very end**, add:

```ts
    uninstallStyles();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): add SVG icons and ref-counted stylesheet injection"
```

---

## Task 3: Bar DOM + pure helpers (formatTime, frameToPercent, pxToFrame)

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
import { formatTime, frameToPercent, pxToFrame } from '../src/Controller';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — helpers not exported, bar DOM not built.

- [ ] **Step 3: Add the pure helpers and bar DOM**

In `src/Controller.ts`, add these exported helpers immediately **after** the `installStyles` / `uninstallStyles` block:

```ts
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function frameToPercent(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  const f = Math.min(Math.max(frame, 0), totalFrames);
  return (f / totalFrames) * 100;
}

export function pxToFrame(clientX: number, rect: { left: number; width: number }, totalFrames: number): number {
  if (rect.width <= 0 || totalFrames <= 0) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clamped * totalFrames);
}
```

Then add the bar DOM. Inside the `Controller` class, add these private fields:

```ts
  private progressEl!: HTMLDivElement;
  private progressFillEl!: HTMLDivElement;
  private progressThumbEl!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private timeEl!: HTMLSpanElement;
  private exportBtn: HTMLButtonElement | null = null;
```

In the constructor, **after** `this.wrapper.appendChild(this.root);`, add:

```ts
    this.buildBar();
```

Add the method:

```ts
  private buildBar(): void {
    this.root.innerHTML = `
      <div class="mc-progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${this.movie.totalFrames}" aria-valuenow="0">
        <div class="mc-progress-fill"></div>
        <div class="mc-progress-thumb"></div>
      </div>
      <div class="mc-bar">
        <button class="mc-btn mc-play" aria-label="Play">${ICONS.play}</button>
        <button class="mc-btn mc-mute" aria-label="Mute">${ICONS.volumeOn}</button>
        <span class="mc-time">0:00 / 0:00</span>
        <div class="mc-spacer"></div>
        ${this.options.showExportButton ? `<button class="mc-btn mc-export" aria-label="Export">${ICONS.download}</button>` : ''}
      </div>
    `;
    this.progressEl = this.root.querySelector('.mc-progress') as HTMLDivElement;
    this.progressFillEl = this.root.querySelector('.mc-progress-fill') as HTMLDivElement;
    this.progressThumbEl = this.root.querySelector('.mc-progress-thumb') as HTMLDivElement;
    this.playBtn = this.root.querySelector('.mc-play') as HTMLButtonElement;
    this.muteBtn = this.root.querySelector('.mc-mute') as HTMLButtonElement;
    this.timeEl = this.root.querySelector('.mc-time') as HTMLSpanElement;
    this.exportBtn = this.root.querySelector('.mc-export') as HTMLButtonElement | null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): add pure helpers and bar DOM (progress + buttons)"
```

---

## Task 4: Movie events → time + progress updates; play button toggles

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — no event wiring yet.

- [ ] **Step 3: Wire events**

In `src/Controller.ts`, in the constructor **after** `this.buildBar()`, add:

```ts
    this.bindMovieEvents();
    this.bindPlayButton();
```

Add the methods to the class:

```ts
  private bindMovieEvents(): void {
    this.movie.on('ready', () => {
      this.progressEl.setAttribute('aria-valuemax', String(this.movie.totalFrames));
      this.refreshTime(0);
      this.refreshProgress(0);
    });
    this.movie.on('frame', ({ frame, totalFrames }) => {
      if (!this.isScrubbing) {
        this.refreshProgress(frame, totalFrames);
      }
      this.refreshTime(frame);
    });
  }

  private bindPlayButton(): void {
    this.playBtn.addEventListener('click', () => {
      if (this.movie.isPlaying) this.movie.pause();
      else this.movie.play();
      this.refreshPlayIcon();
    });
  }

  private refreshPlayIcon(): void {
    this.playBtn.innerHTML = this.movie.isPlaying ? ICONS.pause : ICONS.play;
    this.playBtn.setAttribute('aria-label', this.movie.isPlaying ? 'Pause' : 'Play');
  }

  private refreshProgress(frame: number, totalFrames?: number): void {
    const total = totalFrames ?? this.movie.totalFrames;
    const pct = frameToPercent(frame, total);
    this.progressFillEl.style.width = `${pct}%`;
    this.progressThumbEl.style.left = `${pct}%`;
    this.progressEl.setAttribute('aria-valuenow', String(frame));
  }

  private refreshTime(frame: number): void {
    const fr = this.movie.frameRate || 1;
    const cur = frame / fr;
    const total = this.movie.totalFrames / fr;
    this.timeEl.textContent = `${formatTime(cur)} / ${formatTime(total)}`;
  }
```

Also add the `isScrubbing` field (used by Task 5 too):

```ts
  private isScrubbing = false;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (15 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): wire movie events to progress + time, play toggle"
```

---

## Task 5: Custom progress scrubbing (pointer events + capture)

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — no scrub wiring.

- [ ] **Step 3: Implement scrubbing**

Add these fields to the `Controller` class:

```ts
  private wasPlayingBeforeScrub = false;
  private activePointerId: number | null = null;
```

Add to the constructor **after** `this.bindPlayButton();`:

```ts
    this.bindScrubbing();
```

Add the method:

```ts
  private bindScrubbing(): void {
    const onDown = (e: PointerEvent) => {
      this.isScrubbing = true;
      this.activePointerId = e.pointerId;
      this.wasPlayingBeforeScrub = this.movie.isPlaying;
      if (this.movie.isPlaying) {
        this.movie.pause();
        this.refreshPlayIcon();
      }
      this.progressEl.classList.add('mc-scrubbing');
      try { this.progressEl.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
      this.seekFromPointer(e.clientX);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.isScrubbing) return;
      this.seekFromPointer(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (!this.isScrubbing) return;
      this.isScrubbing = false;
      this.activePointerId = null;
      this.progressEl.classList.remove('mc-scrubbing');
      try { this.progressEl.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
      if (this.wasPlayingBeforeScrub) {
        this.movie.play();
        this.refreshPlayIcon();
      }
    };
    this.progressEl.addEventListener('pointerdown', onDown);
    this.progressEl.addEventListener('pointermove', onMove);
    this.progressEl.addEventListener('pointerup', onUp);
    this.progressEl.addEventListener('pointercancel', onUp);
  }

  private seekFromPointer(clientX: number): void {
    const rect = this.progressEl.getBoundingClientRect();
    const frame = pxToFrame(clientX, { left: rect.left, width: rect.width }, this.movie.totalFrames);
    this.refreshProgress(frame);
    void this.movie.gotoFrame(frame);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (18 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): pointer-based scrubbing with capture, replaces input range"
```

---

## Task 6: Mute button + volume keyboard

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — mute click does nothing yet, ready event doesn't refresh icon.

- [ ] **Step 3: Wire mute button**

In `src/Controller.ts`, in the constructor **after** `this.bindScrubbing();`, add:

```ts
    this.bindMuteButton();
```

In `bindMovieEvents`, **at the end of the `ready` handler** (still inside the same arrow function), add:

```ts
      this.refreshMuteIcon();
```

Add the methods:

```ts
  private bindMuteButton(): void {
    this.muteBtn.addEventListener('click', () => {
      this.movie.toggleMute();
      this.refreshMuteIcon();
    });
  }

  private refreshMuteIcon(): void {
    const silent = this.movie.muted || this.movie.volume <= 0;
    this.muteBtn.innerHTML = silent ? ICONS.volumeOff : ICONS.volumeOn;
    this.muteBtn.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (20 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): mute button toggles and reflects icon state"
```

---

## Task 7: Export button + full-screen progress overlay

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — export logic not wired.

- [ ] **Step 3: Wire export**

Add fields to the `Controller` class:

```ts
  private isExporting = false;
  private exportOverlay: HTMLDivElement | null = null;
  private exportFillEl: HTMLDivElement | null = null;
  private exportTextEl: HTMLDivElement | null = null;
```

Modify `bindMovieEvents` — replace the existing `progress` handler (or add it if not present). The full updated method should look like:

```ts
  private bindMovieEvents(): void {
    this.movie.on('ready', () => {
      this.progressEl.setAttribute('aria-valuemax', String(this.movie.totalFrames));
      this.refreshTime(0);
      this.refreshProgress(0);
      this.refreshMuteIcon();
    });
    this.movie.on('frame', ({ frame, totalFrames }) => {
      if (!this.isScrubbing) {
        this.refreshProgress(frame, totalFrames);
      }
      this.refreshTime(frame);
    });
    this.movie.on('progress', ({ progress, frame, totalFrames }) => {
      if (!this.isExporting || !this.exportFillEl || !this.exportTextEl) return;
      this.exportFillEl.style.width = `${progress}%`;
      this.exportTextEl.textContent = `${progress}% (${frame} / ${totalFrames} フレーム)`;
    });
  }
```

In the constructor **after** `this.bindMuteButton();`, add:

```ts
    this.bindExportButton();
```

Add the methods:

```ts
  private bindExportButton(): void {
    if (!this.exportBtn) return;
    this.exportBtn.addEventListener('click', () => {
      void this.handleExport();
    });
  }

  private async handleExport(): Promise<void> {
    if (this.isExporting) return;
    this.isExporting = true;
    const wasPlaying = this.movie.isPlaying;
    if (wasPlaying) {
      this.movie.pause();
      this.refreshPlayIcon();
    }
    this.showExportOverlay();
    try {
      await this.movie.render();
      if (this.exportFillEl) this.exportFillEl.style.width = '100%';
      if (this.exportTextEl) this.exportTextEl.textContent = '完了！動画を生成中...';
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error('Export failed:', err);
      alert('エクスポートに失敗しました。');
    } finally {
      this.hideExportOverlay();
      this.isExporting = false;
      if (wasPlaying) {
        this.movie.play();
        this.refreshPlayIcon();
      }
    }
  }

  private showExportOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'mc-export-overlay';
    overlay.innerHTML = `
      <div class="mc-export-panel">
        <div class="mc-export-title">動画をエクスポート中...</div>
        <div class="mc-export-track"><div class="mc-export-fill"></div></div>
        <div class="mc-export-text">0% (0 / 0 フレーム)</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.exportOverlay = overlay;
    this.exportFillEl = overlay.querySelector('.mc-export-fill') as HTMLDivElement;
    this.exportTextEl = overlay.querySelector('.mc-export-text') as HTMLDivElement;
  }

  private hideExportOverlay(): void {
    if (this.exportOverlay) {
      this.exportOverlay.remove();
      this.exportOverlay = null;
      this.exportFillEl = null;
      this.exportTextEl = null;
    }
  }
```

Update `destroy()` to also clean up the overlay if active. Add **before** `uninstallStyles();`:

```ts
    this.hideExportOverlay();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (22 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): port export flow with full-screen progress overlay"
```

---

## Task 8: Auto-hide state machine

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
import { vi } from 'vitest';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — visibility logic not wired.

- [ ] **Step 3: Implement state machine**

Add fields to the `Controller` class:

```ts
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly HIDE_DELAY_MS = 2500;
```

In the constructor **immediately after** `this.buildBar();`, set initial state:

```ts
    this.root.setAttribute('data-state', 'visible');
```

In the constructor **after** `this.bindExportButton();`, add:

```ts
    this.bindVisibility();
```

Add the methods:

```ts
  private bindVisibility(): void {
    const wrap = this.wrapper;
    wrap.addEventListener('pointermove', () => this.kickIdleTimer());
    wrap.addEventListener('mouseleave', () => {
      if (this.movie.isPlaying) this.setVisible(false);
    });
    this.root.addEventListener('pointerenter', () => {
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setVisible(true);
    });
  }

  private kickIdleTimer(): void {
    this.setVisible(true);
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (!this.movie.isPlaying) return;
    this.hideTimer = setTimeout(() => {
      if (this.movie.isPlaying && !this.isScrubbing) this.setVisible(false);
    }, Controller.HIDE_DELAY_MS);
  }

  private setVisible(v: boolean): void {
    this.root.setAttribute('data-state', v ? 'visible' : 'hidden');
  }
```

Update the play-button handler to drive the timer. **Replace** `bindPlayButton` with:

```ts
  private bindPlayButton(): void {
    this.playBtn.addEventListener('click', () => {
      if (this.movie.isPlaying) {
        this.movie.pause();
        this.refreshPlayIcon();
        if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
        this.setVisible(true);
      } else {
        this.movie.play();
        this.refreshPlayIcon();
        this.kickIdleTimer();
      }
    });
  }
```

Update `destroy()` to clear the timer. Add **before** `this.hideExportOverlay();`:

```ts
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (27 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): auto-hide state machine — idle timer, hover, pause"
```

---

## Task 9: Keyboard shortcuts

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`:

```ts
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

  it('Shift+E triggers export', () => {
    const canvas = makeCanvas();
    let called = false;
    const movie = makeFakeMovie();
    movie.render = async () => { called = true; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', shiftKey: true }));
    expect(called).toBe(true);
    ctrl.destroy();
  });

  it('keyboard ignored when target is INPUT', () => {
    const canvas = makeCanvas();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');
    const ev = new KeyboardEvent('keydown', { code: 'Space' });
    Object.defineProperty(ev, 'target', { value: input });
    document.dispatchEvent(ev);
    expect(movie.isPlaying).toBe(false);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement keyboard handler**

Add field to the `Controller` class:

```ts
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
```

In the constructor **after** `this.bindVisibility();`, add:

```ts
    if (this.options.enableKeyboardShortcuts) this.bindKeyboard();
```

Add the methods:

```ts
  private bindKeyboard(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT') return;
      if (this.isExporting) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.playBtn.click();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.stepFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.stepFrame(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.adjustVolume(0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.adjustVolume(-0.05);
          break;
        case 'KeyM':
          e.preventDefault();
          this.muteBtn.click();
          break;
        case 'KeyE':
          if (e.shiftKey && this.exportBtn) {
            e.preventDefault();
            this.exportBtn.click();
          }
          break;
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private stepFrame(delta: number): void {
    const next = Math.max(0, Math.min(this.movie.totalFrames, this.movie.currentFrame + delta));
    void this.movie.gotoFrame(next);
  }

  private adjustVolume(delta: number): void {
    const next = Math.max(0, Math.min(1, this.movie.volume + delta));
    this.movie.volume = next;
    if (this.movie.muted && next > 0) this.movie.muted = false;
    this.refreshMuteIcon();
  }
```

Update `destroy()` — add **before** `if (this.hideTimer) ...`:

```ts
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS (34 tests total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): keyboard shortcuts (space/arrows/M/Shift+E)"
```

---

## Task 10: Update examples to new API

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/examples/basic.html`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/examples/chromakey.html`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/examples/nested.html`

- [ ] **Step 1: Build the library so examples can resolve `dist/`**

Run: `npm run build`
Expected: PASS (writes `dist/Controller.js`).

- [ ] **Step 2: Update `examples/basic.html`**

Make these three edits:

(a) Remove the `<div id="ctrl"></div>` line (between `<canvas>` and `<script type="importmap">`).

(b) Replace the Controller construction line:

```diff
-    new Controller(movie, { container: document.getElementById('ctrl') });
+    new Controller(movie, { canvas: document.getElementById('stage') });
```

(c) No other changes needed.

- [ ] **Step 3: Update `examples/chromakey.html`**

Same three edits as basic.html:

(a) Remove `<div id="ctrl"></div>`.

(b) Replace:

```diff
-    new Controller(movie, { container: document.getElementById('ctrl') });
+    new Controller(movie, { canvas: document.getElementById('stage') });
```

- [ ] **Step 4: Update `examples/nested.html`**

Same three edits:

(a) Remove `<div id="ctrl"></div>`.

(b) Replace:

```diff
-    new Controller(movie, { container: document.getElementById('ctrl') });
+    new Controller(movie, { canvas: document.getElementById('stage') });
```

- [ ] **Step 5: Manually verify each example in a browser**

The user should serve `examples/` from a static server (e.g. `npx serve examples` from the repo root, or any preferred method) and open each HTML file. Verify visually:

- Bar overlays the canvas at the bottom
- Bar is visible at start (paused)
- Pressing play starts playback; bar fades out after ~2.5s of no mouse movement
- Mouse movement inside canvas brings bar back
- Hovering progress bar grows it (3px → 5px) and shows the thumb
- Click+drag on progress scrubs; release resumes if was playing
- Mute button toggles between speaker and X-speaker icons
- Time display reads `M:SS / M:SS`
- Export button shows full-screen progress overlay during render and appends a `<video>` after
- Keyboard: Space, ←, →, ↑, ↓, M, Shift+E all work

If any of the above fails, debug before committing.

- [ ] **Step 6: Commit**

```bash
git add examples/basic.html examples/chromakey.html examples/nested.html
git commit -m "docs(examples): switch to canvas-based Controller API"
```

---

## Task 11: README sweep + final verification

**Files:**
- Read: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/README.md`
- Modify (if needed): same

- [ ] **Step 1: Read the README**

Read `README.md` end-to-end. Look for:

- Any code snippet using `Controller` with `{ container: ... }` or any of the removed options (`showVolumeControl`, `showTimeDisplay`, `showFrameDisplay`)
- Any documentation listing the Controller's props/options

- [ ] **Step 2: Update README snippets to the new API**

For each occurrence found in Step 1, replace the snippet to use `{ canvas: <canvas-element> }`. Drop documentation for removed options. If the README documents keyboard shortcuts, update the table to:

| Key | Action |
| --- | --- |
| Space | Play/pause |
| ← / → | Step one frame |
| ↑ / ↓ | Volume ±5% |
| M | Mute |
| Shift+E | Export |

If the README has no Controller section, skip this step (no doc work needed).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass — pre-existing tests + 34 new Controller tests.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS, `dist/Controller.js` regenerated.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): update Controller API references to canvas-based mounting"
```

If README required no changes, skip the commit.

---

## Self-Review Checklist (run before handing off)

- [ ] Spec coverage:
  - API changes (canvas required, options removed) → Task 1 + Task 10
  - Mounting strategy (wrap/unwrap) → Task 1
  - DOM structure → Task 3
  - Visual style (gradient bar, icons, thin progress) → Task 2 (CSS) + Task 3 (DOM)
  - Show/hide state machine → Task 8
  - Custom progress bar (pointer events) → Task 5
  - Buttons → Task 4 (play), Task 6 (mute), Task 7 (export)
  - Time display → Task 4
  - Keyboard shortcuts → Task 9
  - Export behavior unchanged → Task 7
  - Accessibility (aria-label, role=slider) → Task 3 (DOM) + Task 4 (aria-valuemax/now)
  - File structure (single file rewrite) → Task 1 (skeleton) onwards
  - Examples update → Task 10
- [ ] Placeholder scan: none.
- [ ] Type consistency: `formatTime`, `frameToPercent`, `pxToFrame`, `Controller`, `ControllerOptions`, `ICONS`, `installStyles`/`uninstallStyles` are referenced consistently across tasks.
