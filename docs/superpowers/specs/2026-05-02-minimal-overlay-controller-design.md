# Minimal Overlay Controller — Design

## Goal

Replace the current chunky `Controller` panel (sits below the canvas, ~9 controls in a dark bar) with a minimal overlay that sits **on top of the video**, behaving like the native HTML5 `<video controls>` (auto-hide on idle, fade in on hover, persistent while paused).

Aesthetic target: YouTube/Vimeo-style — bottom gradient, white SVG icons, thin progress bar that thickens on hover.

## API Changes

```ts
new Controller(movie, {
  canvas: HTMLCanvasElement,         // required (was: container?: HTMLElement)
  showExportButton?: boolean,        // default: true
  enableKeyboardShortcuts?: boolean, // default: true
  className?: string,                // default: 'movie-controller'
})
```

**Removed options** (all subsumed by the minimal layout):

- `container` — replaced by `canvas`
- `showVolumeControl` — mute button is always present, no slider
- `showTimeDisplay` — time is always shown
- `showFrameDisplay` — frame display mode removed entirely

**Breaking change**: yes. Acceptable because the project is at v0.1 and `examples/` is the only known consumer (updated in this work).

## Mounting Strategy

Controller takes a `canvas` element and overlays controls on top of it:

1. Inspect `getComputedStyle(canvas.parentElement).position`. If it is `relative`, `absolute`, `fixed`, or `sticky`, use the parent as the positioning context directly. Otherwise, wrap the canvas in a `<div class="movie-controller-wrap">` with `position: relative; display: inline-block; line-height: 0;` and use that as the context.
2. Insert `<div class="movie-controller">` as a sibling of the canvas inside the positioning context, with `position: absolute; left: 0; right: 0; bottom: 0;`.
3. The controller never sets width/height/CSS on the canvas itself.
4. On `destroy()`, the controller removes its own DOM. If it created the wrapper, it unwraps the canvas back to the original parent.

## DOM Structure

```html
<div class="movie-controller-wrap">              <!-- created if needed -->
  <canvas>...</canvas>
  <div class="movie-controller" data-state="visible">
    <div class="mc-progress">
      <div class="mc-progress-buffer"></div>      <!-- reserved, not used yet -->
      <div class="mc-progress-fill"></div>
      <div class="mc-progress-thumb"></div>
    </div>
    <div class="mc-bar">
      <button class="mc-btn mc-play" aria-label="Play">{svg}</button>
      <button class="mc-btn mc-mute" aria-label="Mute">{svg}</button>
      <span class="mc-time">0:00 / 0:00</span>
      <div class="mc-spacer"></div>
      <button class="mc-btn mc-export" aria-label="Export">{svg}</button>
    </div>
  </div>
</div>
```

The `data-state` attribute toggles between `visible` and `hidden` and drives the `opacity` transition.

## Visual Style

- **Bar background**: linear gradient `rgba(0,0,0,0.75)` at bottom → `rgba(0,0,0,0)` at the top of a 64px-tall area. Sits below the progress bar.
- **Progress bar**: 3px tall, full-width, `rgba(255,255,255,0.25)` track, `#007AFF` fill (existing brand color), 5px tall on hover with smooth height transition. A 12px circular thumb (`#007AFF`) appears on hover.
- **Buttons**: 28×28px hit area, white SVG icons inline, `opacity: 0.85` default, `1.0` on hover. No background/border.
- **Time text**: 12px, white, monospace (`Menlo, Monaco, monospace`), `opacity: 0.85`.
- **Bar height**: ~36px content + 3–5px progress bar at top.

### Inline SVG Icons

All icons are stroke/fill white, 16×16 viewBox, defined as constant strings in the controller module:

- `play`: filled triangle
- `pause`: two vertical bars
- `volumeOn`: speaker + waves
- `volumeOff`: speaker + slash
- `download`: arrow down + tray (export)

## Show / Hide Behavior

State machine:

- **paused** → bar always visible, no auto-hide
- **playing + idle** → bar hidden after 2500ms of no pointer movement inside the wrapper
- **playing + active** → bar visible (pointer is moving inside wrapper, or hovering bar/progress)

Triggers:

- `mousemove` / `pointermove` on wrapper → reset idle timer, show bar
- `mouseleave` on wrapper → if playing, hide immediately
- `mouseenter` on `.movie-controller` → cancel idle timer (keep visible)
- `play` event → start idle timer
- `pause` event → cancel idle timer, force visible
- During scrubbing → force visible until pointer up

Transition: `opacity 200ms ease`. Default cursor on canvas during hidden state stays `default` (no auto-hide of cursor — out of scope).

## Progress Bar (custom, not `<input type=range>`)

The native range input is hard to style with hover-grow + custom thumb behavior. Replace with a div-based implementation using pointer events:

- `pointerdown` on `.mc-progress` → capture pointer, set `isDragging = true`, pause if was playing (remember `wasPlayingBeforeDrag`), seek to position
- `pointermove` while dragging → seek to position
- `pointerup` → release capture, resume playback if `wasPlayingBeforeDrag`
- Position calc: `frame = round((clientX - rect.left) / rect.width * totalFrames)`, clamped `[0, totalFrames]`
- Fill width: `(currentFrame / totalFrames) * 100%`, updated on `frame` event (skip during drag, same guard as today)

## Buttons

- **Play/Pause** (`.mc-play`): toggles `movie.play()` / `movie.pause()`. Icon swaps via re-setting `innerHTML`.
- **Mute** (`.mc-mute`): toggles `movie.toggleMute()`. Icon: `volumeOn` when `!muted && volume > 0`, else `volumeOff`. (No partial states — the slider is gone, so volume-low/high distinction would be invisible anyway.)
- **Export** (`.mc-export`): same `handleExport()` flow as today. The full-screen progress overlay during export is unchanged.

## Time Display

- Format: `M:SS / M:SS` (e.g., `0:23 / 1:08`). Drop the leading `0` from minutes for a cleaner look. No "Time:" label.
- Updates on `frame` event.

## Keyboard Shortcuts

| Key       | Action                                  |
| --------- | --------------------------------------- |
| Space     | play / pause                            |
| ←         | previous frame                          |
| →         | next frame                              |
| ↑         | volume +5% (unmutes if muted)           |
| ↓         | volume −5%                              |
| M         | toggle mute                             |
| Shift+E   | export (only if `showExportButton`)     |

Same guard as today: ignored when target is `<input>`, when `!isReady`, or when `isExporting`.

## Export Behavior

Unchanged from current implementation:

- Click `.mc-export` → `handleExport()`
- Full-screen overlay (`#exportProgress`) shown during render, with progress bar + text
- Resulting video appended to `document.body` as a `<video controls>` element
- Restores prior playing state on completion or failure

This part is intentionally **not minimized** — the export progress is a modal task and the existing UX is fine.

## Accessibility

- All buttons have `aria-label`
- Progress bar gets `role="slider"`, `aria-valuemin/max/now`, `tabindex="0"`, and ←/→ key support when focused (reuses the global ←/→ handlers — focus state doesn't matter since they always seek)
- Sufficient contrast: white on dark gradient meets WCAG AA

## File Structure

Single file rewrite: `src/Controller.ts`. Estimated size ~350 lines (current is ~700 — minimization plus removal of 3 option branches offsets the new pointer-event progress bar logic). Styles remain in an injected `<style>` block; not large enough to warrant a separate CSS file.

The exported class name and module path are unchanged: `import { Controller } from 'pixi-effects/Controller'`.

## Examples Update

`examples/basic.html`, `examples/chromakey.html`, `examples/nested.html` — all currently pass `{ container: ... }`. Update them to pass `{ canvas: document.getElementById('stage') }` and remove the `<div id="ctrl">` wrappers from HTML.

## Out of Scope

- Fullscreen button (canvas fullscreen is a separate concern; users can wrap the canvas themselves)
- Playback rate control
- Settings menu / quality selector
- Picture-in-picture
- Touch-specific gestures (basic pointer events should work on touch via PointerEvent, but no double-tap-to-seek etc.)
- Auto-hiding the mouse cursor on idle
- Theming API (single hard-coded palette for now; `className` option remains for users who want to override via CSS)

## Risks

- **Wrapping the canvas mutates the DOM around it.** If the user has CSS selectors targeting `canvas`'s parent, they could break. Mitigated by checking the parent's `position` first and skipping the wrap when possible.
- **Pointer events on touch**: `setPointerCapture` works on iOS Safari 13+ and Android. Older mobile browsers may not capture properly during scrub; acceptable risk for a v0.x library.
- **Z-index**: the `.movie-controller` is `position: absolute` inside the wrapper. If the user has higher-stacked elements absolutely positioned over the canvas, those will cover the bar. Document this; do not add inline `z-index`.
