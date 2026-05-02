# Export Settings Popover + mediabunny Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gear icon and popover to the Controller bar that lets users pick output container (MP4 / WebM / MOV) and quality preset (Low / Medium / High / Very High) before export, and tighten `Renderer.ts` against mediabunny best practices (`fastStart` for ISOBMFF, format-aware codec defaults, periodic keyframes, awaited source teardown).

**Architecture:** Two parallel changes that integrate at one point. (1) `src/Controller.ts` gains a gear button immediately left of the download button, a popover with two native `<select>`s, two state fields (`exportFormat`, `exportQuality`), and an updated `handleExport()` that passes these into `movie.render()`. (2) `src/core/Renderer.ts` gets format-aware codec defaults (so `format: 'webm'` automatically uses `vp9`/`opus`), `Mp4OutputFormat`/`MovOutputFormat` constructed with `fastStart: 'in-memory'`, periodic `keyFrame: true` calls every ~2 seconds, and `await audioSource.close()`. The Controller-Renderer interface (the existing `RenderOptions` shape on `Movie.render()`) does not change.

**Tech Stack:** TypeScript, vitest + happy-dom for tests, mediabunny ^1.43.0 for encoding. Spec: [`docs/superpowers/specs/2026-05-02-export-settings-popover-design.md`](../specs/2026-05-02-export-settings-popover-design.md).

---

## File Structure

- `src/Controller.ts` — add gear icon constant, settings popover DOM + CSS, two state fields, toggle/close logic, ESC + outside-click handlers, popover teardown in `destroy()`, updated `handleExport()`. Adds ~120 lines net.
- `src/core/Renderer.ts` — format-aware codec mapping, `fastStart` for MP4/MOV, periodic keyframes, `await audioSource.close()`. ~25 lines changed.
- `tests/Controller.test.ts` — new `Controller — settings popover` describe block (~6 cases), and updates to `Controller — export` tests that assert `movie.render` was called with the right options.

`src/types.ts` and `src/core/Movie.ts` are unchanged. The existing `RenderOptions` interface already covers what Controller passes (`format`, `video.bitrate`, `audio.bitrate`).

---

## Conventions

- After every code change: run `npm test` and `npm run typecheck` before committing.
- Commit per task with conventional commits.
- All file paths are absolute from the repo root.
- Tests use named imports from `vitest` (the test file already does).

---

## Task 1: Format-aware codec defaults in Renderer

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Renderer.ts`

This is the smallest change and unblocks Controller-side work later (so passing `{ format: 'webm' }` from the Controller without an explicit codec produces a working output).

- [ ] **Step 1: Replace the codec defaults**

In `src/core/Renderer.ts`, **above** the existing `qualityMap` constant, add:

```ts
const VIDEO_CODEC_BY_FORMAT = {
  mp4: 'avc',
  mov: 'avc',
  webm: 'vp9',
  mkv: 'vp9',
} as const;

const AUDIO_CODEC_BY_FORMAT = {
  mp4: 'aac',
  mov: 'aac',
  webm: 'opus',
  mkv: 'opus',
} as const;
```

Then **replace** the existing `opts` object construction:

```ts
  const opts = {
    format: options.format ?? 'mp4',
    video: {
      codec: options.video?.codec ?? 'avc',
      bitrate: qualityMap[options.video?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
    audio: {
      codec: options.audio?.codec ?? 'aac',
      bitrate: qualityMap[options.audio?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
  };
```

with:

```ts
  const fmt = options.format ?? 'mp4';
  const opts = {
    format: fmt,
    video: {
      codec: options.video?.codec ?? VIDEO_CODEC_BY_FORMAT[fmt],
      bitrate: qualityMap[options.video?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
    audio: {
      codec: options.audio?.codec ?? AUDIO_CODEC_BY_FORMAT[fmt],
      bitrate: qualityMap[options.audio?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
  };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run existing tests**

Run: `npm test`
Expected: 83/83 pass (no behavioral change for default `format: 'mp4'`).

- [ ] **Step 4: Commit**

```bash
git add src/core/Renderer.ts
git commit -m "feat(renderer): format-aware codec defaults (webm→vp9/opus, mkv→vp9/opus)"
```

---

## Task 2: `fastStart: 'in-memory'` for MP4/MOV

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Renderer.ts`

- [ ] **Step 1: Replace formatMap with a constructor helper**

In `src/core/Renderer.ts`, **delete** the existing `formatMap`:

```ts
const formatMap = {
  mp4:  Mp4OutputFormat,
  mov:  MovOutputFormat,
  webm: WebMOutputFormat,
  mkv:  MkvOutputFormat,
} as const;
```

Replace it with a helper that constructs the format with the right options:

```ts
function makeOutputFormat(name: 'mp4' | 'mov' | 'webm' | 'mkv') {
  switch (name) {
    case 'mp4': return new Mp4OutputFormat({ fastStart: 'in-memory' });
    case 'mov': return new MovOutputFormat({ fastStart: 'in-memory' });
    case 'webm': return new WebMOutputFormat();
    case 'mkv': return new MkvOutputFormat();
  }
}
```

Then **replace** the `Output` construction line:

```ts
  const output = new Output({
    format: new (formatMap[opts.format])(),
    target: new BufferTarget(),
  });
```

with:

```ts
  const output = new Output({
    format: makeOutputFormat(opts.format),
    target: new BufferTarget(),
  });
```

- [ ] **Step 2: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: PASS, 83/83.

- [ ] **Step 3: Commit**

```bash
git add src/core/Renderer.ts
git commit -m "perf(renderer): fastStart=in-memory for MP4/MOV (moov box at file start)"
```

---

## Task 3: Periodic keyframes + awaited audio close

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Renderer.ts`

- [ ] **Step 1: Add keyframe interval to the encode loop**

In `src/core/Renderer.ts`, **replace** the encode loop:

```ts
  movie.app!.ticker.stop();
  try {
    for (let frame = 0; frame <= movie.totalFrames; frame++) {
      await movie.gotoFrame(frame, true);
      await canvasSource.add(frame / movie.frameRate, 1 / movie.frameRate);
      const progress = Math.floor((frame / movie.totalFrames) * 100);
      movie.emit('progress', { progress, frame, totalFrames: movie.totalFrames });
    }
    await canvasSource.close();
    await output.finalize();
    return new Blob([output.target.buffer as ArrayBuffer], { type: output.format.mimeType });
  } finally {
    movie.app!.ticker.start();
  }
```

with:

```ts
  movie.app!.ticker.stop();
  // Force a keyframe every ~2 seconds (and at frame 0). Improves seek
  // responsiveness in players without inflating bitrate appreciably.
  const keyframeIntervalFrames = Math.max(1, Math.round(2 * movie.frameRate));
  try {
    for (let frame = 0; frame <= movie.totalFrames; frame++) {
      await movie.gotoFrame(frame, true);
      const isKey = frame === 0 || frame % keyframeIntervalFrames === 0;
      const addOpts = isKey ? { keyFrame: true } : undefined;
      await canvasSource.add(frame / movie.frameRate, 1 / movie.frameRate, addOpts);
      const progress = Math.floor((frame / movie.totalFrames) * 100);
      movie.emit('progress', { progress, frame, totalFrames: movie.totalFrames });
    }
    await canvasSource.close();
    await output.finalize();
    return new Blob([output.target.buffer as ArrayBuffer], { type: output.format.mimeType });
  } finally {
    movie.app!.ticker.start();
  }
```

- [ ] **Step 2: Await audio source close**

In the same file, find:

```ts
    await audioSource.add(movie.audioBuffer);
    audioSource.close();
```

Change the second line to:

```ts
    await audioSource.add(movie.audioBuffer);
    await audioSource.close();
```

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: PASS, 83/83.

- [ ] **Step 4: Commit**

```bash
git add src/core/Renderer.ts
git commit -m "perf(renderer): periodic keyframes (~2s); await audio source close"
```

---

## Task 4: Gear icon + popover DOM + CSS in Controller

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

This task adds the visible elements only — no toggling or state wiring yet (Task 5).

- [ ] **Step 1: Write the failing test**

Append to `tests/Controller.test.ts`:

```ts
describe('Controller — settings popover (DOM)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('renders a settings gear button left of the export button', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const bar = canvas.parentElement!.querySelector('.mc-bar')!;
    const settings = bar.querySelector('.mc-settings');
    const exportBtn = bar.querySelector('.mc-export');
    expect(settings).not.toBeNull();
    expect(exportBtn).not.toBeNull();
    // Settings button comes immediately before the export button.
    expect(settings!.nextElementSibling).toBe(exportBtn);
    ctrl.destroy();
  });

  it('renders the settings popover with format and quality selects (closed by default)', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    const popover = root.querySelector('.mc-settings-popover') as HTMLDivElement;
    expect(popover).not.toBeNull();
    expect(popover.getAttribute('data-open')).toBe('false');
    const fmt = popover.querySelector('.mc-settings-format') as HTMLSelectElement;
    const q = popover.querySelector('.mc-settings-quality') as HTMLSelectElement;
    expect(Array.from(fmt.options).map((o) => o.value)).toEqual(['mp4', 'webm', 'mov']);
    expect(Array.from(q.options).map((o) => o.value)).toEqual(['low', 'medium', 'high', 'very-high']);
    expect(fmt.value).toBe('mp4');
    expect(q.value).toBe('high');
    ctrl.destroy();
  });

  it('omits gear and popover when showExportButton is false', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas, showExportButton: false });
    const root = canvas.parentElement!.querySelector('.movie-controller')!;
    expect(root.querySelector('.mc-settings')).toBeNull();
    expect(root.querySelector('.mc-settings-popover')).toBeNull();
    ctrl.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — gear/popover not rendered.

- [ ] **Step 3: Add the gear SVG icon constant**

In `src/Controller.ts`, find the `ICONS` object (near the top of the file). Add a `gear` entry:

```ts
const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>',
  volumeOn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 Q13 8 11 11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12.5 3.5 Q15.5 8 12.5 12.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  volumeOff: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 L15 11 M15 5 L11 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 V11 M4 7 L8 11 L12 7 M3 13 H13"/></svg>',
  gear: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M3.4 12.6 L4.5 11.5 M11.5 4.5 L12.6 3.4"/></svg>',
} as const;
```

- [ ] **Step 4: Append popover CSS**

Find the `STYLE_CSS` template string. Append (anywhere after the existing `.mc-bar`/`.mc-btn` rules, before the export-overlay rules):

```css
.mc-settings-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 12px;
  background: rgba(20, 20, 20, 0.96);
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 180px;
  color: #fff;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mc-settings-popover[data-open="false"] { display: none; }
.mc-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mc-settings-row > span { color: rgba(255,255,255,0.85); }
.mc-settings-row > select {
  font: inherit;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
}
```

- [ ] **Step 5: Add the popover to the bar HTML**

Find the `buildBar` method. **Replace** the `this.root.innerHTML = ...` template:

```ts
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
```

with:

```ts
    const settingsHtml = this.options.showExportButton ? `
      <button class="mc-btn mc-settings" aria-label="Export settings" aria-expanded="false">${ICONS.gear}</button>
    ` : '';
    const popoverHtml = this.options.showExportButton ? `
      <div class="mc-settings-popover" role="dialog" aria-label="Export settings" data-open="false">
        <label class="mc-settings-row">
          <span>Format</span>
          <select class="mc-settings-format">
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV</option>
          </select>
        </label>
        <label class="mc-settings-row">
          <span>Quality</span>
          <select class="mc-settings-quality">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high" selected>High</option>
            <option value="very-high">Very High</option>
          </select>
        </label>
      </div>
    ` : '';
    this.root.innerHTML = `
      <div class="mc-progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${this.movie.totalFrames}" aria-valuenow="0">
        <div class="mc-progress-fill"></div>
        <div class="mc-progress-thumb"></div>
      </div>
      ${popoverHtml}
      <div class="mc-bar">
        <button class="mc-btn mc-play" aria-label="Play">${ICONS.play}</button>
        <button class="mc-btn mc-mute" aria-label="Mute">${ICONS.volumeOn}</button>
        <span class="mc-time">0:00 / 0:00</span>
        <div class="mc-spacer"></div>
        ${settingsHtml}
        ${this.options.showExportButton ? `<button class="mc-btn mc-export" aria-label="Export">${ICONS.download}</button>` : ''}
      </div>
    `;
```

Then add field references in the same method (right after the existing `this.exportBtn = ...` line):

```ts
    this.settingsBtn = this.root.querySelector('.mc-settings') as HTMLButtonElement | null;
    this.settingsPopoverEl = this.root.querySelector('.mc-settings-popover') as HTMLDivElement | null;
    this.settingsFormatSelect = this.root.querySelector('.mc-settings-format') as HTMLSelectElement | null;
    this.settingsQualitySelect = this.root.querySelector('.mc-settings-quality') as HTMLSelectElement | null;
```

- [ ] **Step 6: Add the field declarations**

In the `Controller` class field block (next to `exportBtn`), add:

```ts
  private settingsBtn: HTMLButtonElement | null = null;
  private settingsPopoverEl: HTMLDivElement | null = null;
  private settingsFormatSelect: HTMLSelectElement | null = null;
  private settingsQualitySelect: HTMLSelectElement | null = null;
  private exportFormat: 'mp4' | 'webm' | 'mov' = 'mp4';
  private exportQuality: 'low' | 'medium' | 'high' | 'very-high' = 'high';
  private settingsOpen = false;
```

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS — 3 new DOM tests pass; 83 prior tests still pass = 86 total.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): add gear button + closed settings popover (DOM only)"
```

---

## Task 5: Popover open/close + state binding

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts` (inside a new describe — keep it adjacent to the DOM block):

```ts
describe('Controller — settings popover (interaction)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-movie-controller]').forEach((n) => n.remove());
  });

  it('clicking the gear toggles open/closed and aria-expanded', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const gear = canvas.parentElement!.querySelector('.mc-settings') as HTMLButtonElement;
    const popover = canvas.parentElement!.querySelector('.mc-settings-popover') as HTMLDivElement;
    expect(popover.getAttribute('data-open')).toBe('false');
    expect(gear.getAttribute('aria-expanded')).toBe('false');
    gear.click();
    expect(popover.getAttribute('data-open')).toBe('true');
    expect(gear.getAttribute('aria-expanded')).toBe('true');
    gear.click();
    expect(popover.getAttribute('data-open')).toBe('false');
    expect(gear.getAttribute('aria-expanded')).toBe('false');
    ctrl.destroy();
  });

  it('Escape closes the popover', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const gear = canvas.parentElement!.querySelector('.mc-settings') as HTMLButtonElement;
    const popover = canvas.parentElement!.querySelector('.mc-settings-popover') as HTMLDivElement;
    gear.click();
    expect(popover.getAttribute('data-open')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(popover.getAttribute('data-open')).toBe('false');
    ctrl.destroy();
  });

  it('outside pointerdown closes the popover; inside does not', () => {
    const canvas = makeCanvas();
    const movie = makeFakeMovie();
    const ctrl = new Controller(movie, { canvas });
    const gear = canvas.parentElement!.querySelector('.mc-settings') as HTMLButtonElement;
    const popover = canvas.parentElement!.querySelector('.mc-settings-popover') as HTMLDivElement;
    gear.click();
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL on the first three (toggle, ESC, outside click).

- [ ] **Step 3: Add the binding method and document listeners**

In `src/Controller.ts`, add new field declarations next to the existing `keyHandler`:

```ts
  private settingsKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private settingsOutsideHandler: ((e: PointerEvent) => void) | null = null;
```

In the constructor, **after** `this.bindExportButton();` and **before** `this.bindVisibility();`, add:

```ts
    this.bindSettingsPopover();
```

Add the method to the class:

```ts
  private bindSettingsPopover(): void {
    if (!this.settingsBtn || !this.settingsPopoverEl) return;

    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettings(!this.settingsOpen);
    });

    if (this.settingsFormatSelect) {
      this.settingsFormatSelect.addEventListener('change', (e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'mp4' || v === 'webm' || v === 'mov') this.exportFormat = v;
      });
    }
    if (this.settingsQualitySelect) {
      this.settingsQualitySelect.addEventListener('change', (e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'low' || v === 'medium' || v === 'high' || v === 'very-high') this.exportQuality = v;
      });
    }

    this.settingsKeyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && this.settingsOpen) {
        e.preventDefault();
        this.toggleSettings(false);
      }
    };
    document.addEventListener('keydown', this.settingsKeyHandler);

    this.settingsOutsideHandler = (e: PointerEvent) => {
      if (!this.settingsOpen) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (this.settingsPopoverEl?.contains(target)) return;
      if (this.settingsBtn?.contains(target)) return;
      this.toggleSettings(false);
    };
    document.addEventListener('pointerdown', this.settingsOutsideHandler);
  }

  private toggleSettings(open: boolean): void {
    if (!this.settingsBtn || !this.settingsPopoverEl) return;
    this.settingsOpen = open;
    this.settingsPopoverEl.setAttribute('data-open', open ? 'true' : 'false');
    this.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // Keep the bar visible while the popover is open.
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setVisible(true);
    } else if (this.movie.isPlaying) {
      // Resume normal auto-hide cadence after closing during playback.
      this.kickIdleTimer();
    }
  }
```

- [ ] **Step 4: Update destroy()**

In `destroy()`, **after** the existing `if (this.keyHandler) { ... }` block, add:

```ts
    if (this.settingsKeyHandler) {
      document.removeEventListener('keydown', this.settingsKeyHandler);
      this.settingsKeyHandler = null;
    }
    if (this.settingsOutsideHandler) {
      document.removeEventListener('pointerdown', this.settingsOutsideHandler);
      this.settingsOutsideHandler = null;
    }
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS — 4 new interaction tests pass; total 90.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): popover open/close (gear, ESC, outside click) + select binding"
```

---

## Task 6: Wire selections into handleExport

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/Controller.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/Controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Controller.test.ts`, inside the existing `describe('Controller — export', ...)` block (or a new adjacent describe block — choose placement that keeps related tests together):

```ts
  it('handleExport passes the current format + quality to movie.render()', async () => {
    const canvas = makeCanvas();
    let renderArgs: unknown = null;
    const movie = makeFakeMovie();
    movie.render = async (opts?: unknown) => { renderArgs = opts; return new Blob(); };
    const ctrl = new Controller(movie, { canvas });
    movie.emit('ready');

    // Pick non-default values via the popover selects.
    const fmt = canvas.parentElement!.querySelector('.mc-settings-format') as HTMLSelectElement;
    const q = canvas.parentElement!.querySelector('.mc-settings-quality') as HTMLSelectElement;
    fmt.value = 'webm';
    fmt.dispatchEvent(new Event('change', { bubbles: true }));
    q.value = 'medium';
    q.dispatchEvent(new Event('change', { bubbles: true }));

    (canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement).click();
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
    (canvas.parentElement!.querySelector('.mc-export') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 600));
    expect(renderArgs).toEqual({
      format: 'mp4',
      video: { bitrate: 'high' },
      audio: { bitrate: 'high' },
    });
    ctrl.destroy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/Controller.test.ts`
Expected: FAIL — `handleExport` still calls `movie.render()` with no arguments.

- [ ] **Step 3: Update handleExport**

In `src/Controller.ts`, find the existing line:

```ts
      const blob = await this.movie.render();
```

Replace with:

```ts
      const blob = await this.movie.render({
        format: this.exportFormat,
        video: { bitrate: this.exportQuality },
        audio: { bitrate: this.exportQuality },
      });
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/Controller.test.ts`
Expected: PASS — 2 new tests pass; total 92.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Controller.ts tests/Controller.test.ts
git commit -m "feat(controller): pass selected format + quality to Movie.render()"
```

---

## Task 7: Manual verification + final build

**Files:** none modified.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: PASS, `dist/Controller.js` and `dist/index.js` rebuilt.

- [ ] **Step 2: Serve and open basic.html**

Start a static server from the repo root (e.g. `npx serve . -l 5174` in a separate terminal) and open `http://localhost:5174/examples/basic.html`.

- [ ] **Step 3: Verify popover behavior**

In the browser:

- The gear icon appears immediately to the left of the download icon.
- Clicking the gear opens a small dark panel above the bar with two rows: Format and Quality.
- Pressing Escape closes the panel.
- Clicking outside the panel (e.g. on the page background or the canvas) closes it.
- Clicking the gear again toggles it.

- [ ] **Step 4: Verify export flow**

- Default export (gear → defaults: MP4 + High → click Export): downloaded file ends in `.mp4`, plays in the browser.
- Change Format to WebM, click Export: downloaded file ends in `.webm`, plays in the browser.
- Change Quality to Low, MP4: file size noticeably smaller than the High export of the same content.

- [ ] **Step 5: Verify mediabunny optimizations took effect (visual sanity)**

- The downloaded MP4 starts playing in the browser quickly when seeked (fastStart at the front).
- Seeking in the downloaded MP4 jumps near the requested time without long buffering pauses (periodic keyframes).

These are visual / qualitative checks; no test.

- [ ] **Step 6: Final test + typecheck**

Run: `npm test && npm run typecheck`
Expected: 92/92 pass, typecheck clean.

- [ ] **Step 7: Optional commit (only if any small fix was needed during manual verification)**

If a tweak was needed, commit it with a focused message. Otherwise no commit.

---

## Self-Review

**1. Spec coverage:**

- UI: gear button → Task 4. Popover DOM → Task 4. Open/close interaction (gear, ESC, outside) → Task 5. Native `<select>` left as-is → Task 4 (CSS).
- Codec auto-mapping (Controller side: format only, codec auto in Renderer) → Task 1.
- `fastStart` for MP4/MOV → Task 2.
- Periodic keyframes → Task 3.
- Awaited `audioSource.close()` → Task 3.
- Controller state fields (`exportFormat`, `exportQuality`, `settingsOpen`) → Task 4 (declared) + Task 5 (mutated).
- `handleExport` passes options → Task 6.
- Filename auto-extension via existing `extensionForMimeType` → no task needed (already works since `Movie.render()` returns a Blob with the right MIME).
- Tests: popover DOM (Task 4, 3 cases), interaction (Task 5, 4 cases), export wiring (Task 6, 2 cases) → 9 new test cases, in line with the spec's "~6 cases" estimate.
- Out of scope items (custom bitrate, codec UI, persistence) → correctly absent.

**2. Placeholder scan:** All steps contain concrete code or commands. No "TBD" / "fill in details" / "similar to Task N".

**3. Type consistency:**

- `exportFormat: 'mp4' | 'webm' | 'mov'` — consistently typed in field declaration (Task 4) and the change handler (Task 5) and the render call (Task 6).
- `exportQuality: 'low' | 'medium' | 'high' | 'very-high'` — same.
- `VIDEO_CODEC_BY_FORMAT` / `AUDIO_CODEC_BY_FORMAT` cover all four `RenderOptions['format']` values — consistent.
- `makeOutputFormat` parameter type matches `RenderOptions['format']` shape.
- New private fields on Controller (`settingsBtn`, `settingsPopoverEl`, `settingsFormatSelect`, `settingsQualitySelect`, `settingsOpen`, `settingsKeyHandler`, `settingsOutsideHandler`) are declared once (Task 4 / Task 5) and referenced consistently.
