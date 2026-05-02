# Volume Slider + Fullscreen — Design

## Goal

Add two YouTube-style controls to the bar:

1. **Volume slider** that expands on hover/focus, supports drag and scroll-wheel adjustment.
2. **Fullscreen button** that toggles native fullscreen on the wrapper (so canvas + bar + popover + progress overlay scale together).

## Non-goals

- localStorage persistence of volume.
- Picture-in-picture, buffered indicator, or any other player chrome.
- Custom slider UI when the platform already has acceptable native behavior — but the volume slider is custom (matches the seek bar) for visual consistency.
- iframe-allowfullscreen handling: surfacing the failure is enough; the consumer must add `allowfullscreen` themselves if mounted in an iframe.

## Volume slider

### DOM

The mute button and the new slider live inside one container so they share hover state:

```html
<div class="mc-volume">
  <button class="mc-btn mc-mute">{ICONS.volumeOn}</button>
  <div class="mc-vol-slider" role="slider" tabindex="0"
       aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
    <div class="mc-vol-fill"></div>
    <div class="mc-vol-thumb"></div>
  </div>
</div>
```

The container is inserted in place of the existing bare `.mc-mute` button. `.mc-vol-slider` follows the same fill/thumb pattern as `.mc-progress` but inset by 4px on each side and uses a separate CSS variable `--mc-volume`.

### CSS

```css
.mc-volume { display: flex; align-items: center; }
.mc-vol-slider {
  position: relative;
  width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-left: 0;
  outline: none;
  transition: width 200ms ease, margin-left 200ms ease;
  overflow: hidden;
}
.mc-volume:hover .mc-vol-slider,
.mc-volume:focus-within .mc-vol-slider,
.mc-vol-slider.mc-scrubbing {
  width: 70px;
  margin-left: 6px;
}
.mc-vol-slider:focus-visible { outline: 2px solid #007AFF; outline-offset: 2px; }
.mc-vol-slider::before {
  content: ""; position: absolute; left: 4px; right: 4px;
  height: 3px; background: rgba(255,255,255,0.25); border-radius: 2px;
}
.mc-vol-fill {
  position: absolute; left: 4px; top: 50%;
  height: 3px;
  width: calc((100% - 8px) * var(--mc-volume, 1));
  background: #fff;
  transform: translateY(-50%);
  border-radius: 2px;
  pointer-events: none;
}
.mc-vol-thumb {
  position: absolute; top: 50%;
  left: calc(4px + (100% - 8px) * var(--mc-volume, 1));
  width: 10px; height: 10px; border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
```

### Interaction

- **Drag (pointer events)**: same pattern as the seek bar but `pxToFraction` returns 0..1 instead of a frame number. On `pointerdown`, set `setPointerCapture`, store new volume, mark `.mc-scrubbing`. On `pointermove` while scrubbing, update volume. On `pointerup`/`pointercancel`, release capture, clear `.mc-scrubbing`.
- **Wheel**: container-level `wheel` listener calls `e.preventDefault()` and `adjustVolume(deltaY < 0 ? +0.05 : -0.05)`. `passive: false` listener (required for preventDefault).
- **Mute click**: unchanged from current implementation.
- **`adjustVolume(delta)`**: existing helper, reused. Already updates `--mc-volume` would be added so visual sync happens (currently the helper only sets `movie.volume` and refreshes the icon).

### Sync helper

Add `refreshVolumeUI()` which sets:
- `.mc-vol-slider`'s `--mc-volume` CSS var to `movie.muted ? 0 : movie.volume`
- `aria-valuenow` to `Math.round((muted ? 0 : volume) * 100)`
- Calls existing `refreshMuteIcon()`

Called from:
- `bindMovieEvents` `ready` handler (replaces the bare `refreshMuteIcon()` call)
- mute button click handler
- volume drag handler
- wheel handler
- `adjustVolume()`

Existing `refreshMuteIcon()` stays as-is, called inside `refreshVolumeUI()`.

### Pure helper

```ts
export function pxToFraction(clientX: number, rect: { left: number; width: number }, inset = 0): number {
  const innerLeft = rect.left + inset;
  const innerWidth = Math.max(0, rect.width - 2 * inset);
  if (innerWidth <= 0) return 0;
  const ratio = (clientX - innerLeft) / innerWidth;
  return Math.min(Math.max(ratio, 0), 1);
}
```

`pxToFrame` could be rewritten in terms of `pxToFraction`, but keep both for clarity (small DRY violation, acceptable).

## Fullscreen

### Icons

Two new entries in `ICONS`:

```ts
fullscreenEnter: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6 V2 H6 M14 6 V2 H10 M2 10 V14 H6 M14 10 V14 H10"/></svg>',
fullscreenExit: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 V6 H2 M10 2 V6 H14 M6 14 V10 H2 M10 14 V10 H14"/></svg>',
```

### DOM

A new button after the export button (rightmost):

```html
<button class="mc-btn mc-fullscreen" aria-label="Enter fullscreen">{ICONS.fullscreenEnter}</button>
```

### CSS

```css
.movie-controller-wrap:fullscreen {
  width: 100vw; height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #000;
}
.movie-controller-wrap:fullscreen > canvas {
  width: auto; height: auto;
  max-width: 100%; max-height: 100%;
}
```

The browser's `:fullscreen` pseudo-class only matches the element that's currently in fullscreen. The two rules above only apply when the wrapper itself is fullscreen, so they don't affect the normal layout.

### Interaction

- **Click**: if not currently fullscreen, call `wrapper.requestFullscreen()`. If we are fullscreen and the wrapper is the fullscreen element, call `document.exitFullscreen()`. Wrap in `.catch(err => console.warn('pixi-effects: fullscreen denied:', err))`.
- **`fullscreenchange` event** at document level: read `document.fullscreenElement === this.wrapper`, swap icon and `aria-label`.
- **F key**: add a case to the existing keyboard handler, calls `this.toggleFullscreen()` after `e.preventDefault()`.
- **ESC**: handled by the browser (always exits fullscreen). The `fullscreenchange` event fires and the icon resets.
- **Wrapper sync**: the existing `ResizeObserver` on the canvas already updates `this.root` size when canvas resizes due to fullscreen, so nothing extra is needed.

### Method outline

```ts
private async toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement === this.wrapper) {
      await document.exitFullscreen();
    } else {
      await this.wrapper.requestFullscreen();
    }
  } catch (err) {
    console.warn('pixi-effects: fullscreen denied:', err);
  }
}

private refreshFullscreenIcon(): void {
  if (!this.fullscreenBtn) return;
  const inFs = document.fullscreenElement === this.wrapper;
  this.fullscreenBtn.innerHTML = inFs ? ICONS.fullscreenExit : ICONS.fullscreenEnter;
  this.fullscreenBtn.setAttribute('aria-label', inFs ? 'Exit fullscreen' : 'Enter fullscreen');
}

private bindFullscreen(): void {
  if (!this.fullscreenBtn) return;
  this.fullscreenBtn.addEventListener('click', () => { void this.toggleFullscreen(); });
  this.fullscreenChangeHandler = () => this.refreshFullscreenIcon();
  document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
}
```

`destroy()` removes the `fullscreenchange` listener and exits fullscreen if we still own it.

## File touch list

- `src/Controller.ts`: add 2 fullscreen icons; add volume slider DOM/CSS/wiring; add fullscreen button DOM/CSS/wiring; add `pxToFraction` helper; update `adjustVolume` to call `refreshVolumeUI`; add F keyboard shortcut; tear-down in `destroy()`. Estimated +180 lines, mostly CSS + DOM strings.
- `tests/Controller.test.ts`: ~7 new cases — `pxToFraction` unit, slider drag, wheel, mute clears slider visually, fullscreen click toggles, fullscreenchange swaps icon, F key toggles.

## Risks

- **`requestFullscreen` returns a rejected promise** on iframes without `allowfullscreen` or when the user has denied permission. Caught and logged; the user's only feedback is the icon staying in "enter" mode. Acceptable for v0.x.
- **`:focus-within` on the volume container** — Safari has historically had bugs with `:focus-within` propagating from `<button>` children, but it's stable in modern Safari. Hover always works as a fallback.
- **`hideTimer` interaction with volume slider drag**: dragging the slider while playback is going needs to keep the bar visible. The existing `isScrubbing` flag is only set by the seek bar. Add a parallel guard: `kickIdleTimer`'s `setTimeout` callback already checks `!this.isScrubbing` — extend to `!this.isScrubbing && !this.isVolumeScrubbing`. Or simpler, reuse `isScrubbing` — but that conflates two concerns. Add `isVolumeScrubbing` for clarity.
- **Wheel preventDefault** requires `{ passive: false }`. On iOS this is the only way to stop the page from scrolling when the user wheels over the volume slider.
- **Fullscreen API in older Safari** uses `webkitRequestFullscreen` / `webkitExitFullscreen` and `webkitfullscreenchange`. Out of scope for v0.x; modern Safari supports the standard names.
