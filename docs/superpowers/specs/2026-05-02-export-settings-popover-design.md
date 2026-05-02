# Export Settings Popover + mediabunny Optimization — Design

## Goal

1. Let the user pick an output **container** (MP4 / WebM / MOV) and **quality** preset (Low / Medium / High / Very High) before exporting, via a small popover invoked by a gear icon next to the existing export button.
2. Apply mediabunny best-practices to `src/core/Renderer.ts` (`fastStart` for ISOBMFF containers, periodic keyframes, awaited source teardown, codec auto-mapping).

## Non-goals

- Custom numeric bitrate input.
- Manual codec selection (vp8/hevc/av1 etc.). Codec is derived from the chosen container.
- localStorage persistence of the selection.
- WebCodecs codec-availability detection. Failures continue to surface via the existing `Export failed.` alert.
- A general "settings" surface; this popover is export-only.

## API Surface (mediabunny background)

From the mediabunny docs:

- Containers: `Mp4OutputFormat`, `MovOutputFormat`, `WebMOutputFormat`, `MkvOutputFormat`. MP4 and MOV accept `IsobmffOutputFormatOptions` (notably `fastStart: false | 'in-memory' | 'reserve' | 'fragmented'`). WebM and MKV accept `MkvOutputFormatOptions`.
- Codec compatibility:
  - MP4 / MOV: `avc | hevc | vp8 | vp9 | av1` video; `aac | opus | mp3 | vorbis | flac | ac3 | eac3 | pcm-*` audio.
  - WebM: `vp8 | vp9 | av1` video; `opus | vorbis` audio. **AAC is rejected.**
- `CanvasSource.add(timestamp, duration, opts?)` accepts `{ keyFrame: true }` to force a keyframe at that frame.
- Quality presets: `QUALITY_VERY_LOW`, `QUALITY_LOW`, `QUALITY_MEDIUM`, `QUALITY_HIGH`, `QUALITY_VERY_HIGH`.
- Backpressure is propagated by **awaiting** `add()`. Sources should be `await`-closed early to free resources.

## Codec mapping (controller-side default)

Hard-coded in the Controller:

```ts
const VIDEO_CODEC_BY_FORMAT = { mp4: 'avc', mov: 'avc', webm: 'vp9' } as const;
const AUDIO_CODEC_BY_FORMAT = { mp4: 'aac', mov: 'aac', webm: 'opus' } as const;
```

These are passed to `Movie.render()` via `video.codec` / `audio.codec`. The Renderer's existing default (`'avc'` / `'aac'`) is replaced with a format-aware default so this remains correct even if a user calls `Movie.render({ format: 'webm' })` directly without a codec.

## UI: Gear popover

### Layout

The bar already has: `[▶] [🔇] 0:00 / 0:08 ··· spacer ··· [⬇]`. We insert a gear button **immediately to the left** of the download button (so the right-hand cluster reads `[⚙][⬇]`).

```html
<button class="mc-btn mc-settings" aria-label="Export settings">
  {ICONS.gear}
</button>
```

Gear icon: simple 8-tooth gear at 16x16, stroke white.

### Popover

When the gear is clicked, a popover appears anchored to the gear button:

```html
<div class="mc-settings-popover" role="dialog" aria-label="Export settings">
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
      <option value="high">High</option>
      <option value="very-high">Very High</option>
    </select>
  </label>
</div>
```

Popover styling:

- `position: absolute; bottom: calc(100% + 8px); right: 12px;` — sits above the gear, aligned to the right edge of the bar (so it stays inside the canvas overlay even on narrow canvases).
- `background: rgba(20, 20, 20, 0.96); border-radius: 8px; padding: 10px 12px; min-width: 180px;`
- White text, 12px font, `<select>` left as native (each platform's native chrome) — avoids a custom dropdown implementation.
- Hidden by default; toggled via a `data-open` attribute on the popover (`[data-open="false"]` → `display: none`).

### Interaction

- Gear click toggles the popover.
- ESC key closes the popover.
- Click outside the popover and outside the gear closes it. (Use a single `pointerdown` listener on `document`.)
- The popover keeps the auto-hide bar visible while open: when opening, the existing `setVisible(true)` + cancel idle timer logic runs; when closing, the normal `kickIdleTimer` resumes if the movie is playing.
- Selection changes update Controller state immediately (no "Apply" button). The next export click uses the current state.
- Keyboard shortcuts (Space, ←, →, etc.) are NOT suppressed while the popover is open — but the existing guard already ignores keys when the focus target is `INPUT | TEXTAREA | SELECT | contenteditable`, so keys typed into the `<select>` won't trigger playback toggles.

## Controller state

```ts
private exportFormat: 'mp4' | 'webm' | 'mov' = 'mp4';
private exportQuality: 'low' | 'medium' | 'high' | 'very-high' = 'high';
private settingsOpen = false;
private settingsPopoverEl: HTMLDivElement | null = null;
private settingsBtn: HTMLButtonElement | null = null;
```

`handleExport()` updates:

```ts
const blob = await this.movie.render({
  format: this.exportFormat,
  video: { bitrate: this.exportQuality },
  audio: { bitrate: this.exportQuality },
});
```

Filename / extension already derives from `blob.type` via `extensionForMimeType`, so changing `format` automatically changes the downloaded file extension.

## Renderer optimizations

`src/core/Renderer.ts` changes:

### a) Format-aware codec defaults

```ts
const VIDEO_CODEC_BY_FORMAT: Record<RenderOptions['format'] & string, string> = {
  mp4: 'avc', mov: 'avc', webm: 'vp9', mkv: 'vp9',
};
const AUDIO_CODEC_BY_FORMAT: Record<RenderOptions['format'] & string, string> = {
  mp4: 'aac', mov: 'aac', webm: 'opus', mkv: 'opus',
};

const fmt = options.format ?? 'mp4';
const videoCodec = options.video?.codec ?? VIDEO_CODEC_BY_FORMAT[fmt];
const audioCodec = options.audio?.codec ?? AUDIO_CODEC_BY_FORMAT[fmt];
```

### b) `fastStart` for ISOBMFF

```ts
function makeFormat(name: 'mp4' | 'mov' | 'webm' | 'mkv') {
  switch (name) {
    case 'mp4': return new Mp4OutputFormat({ fastStart: 'in-memory' });
    case 'mov': return new MovOutputFormat({ fastStart: 'in-memory' });
    case 'webm': return new WebMOutputFormat();
    case 'mkv': return new MkvOutputFormat();
  }
}
```

`'in-memory'` makes the moov box land at the start of the file. Trade-off: full output is held in memory until finalize. Acceptable for the typical multi-second exports this library targets.

### c) Periodic keyframes

Force a keyframe every ~2 seconds and at frame 0:

```ts
const keyframeIntervalFrames = Math.max(1, Math.round(2 * movie.frameRate));
for (let frame = 0; frame <= movie.totalFrames; frame++) {
  await movie.gotoFrame(frame, true);
  const isKey = frame === 0 || frame % keyframeIntervalFrames === 0;
  await canvasSource.add(
    frame / movie.frameRate,
    1 / movie.frameRate,
    isKey ? { keyFrame: true } : undefined
  );
  // ... emit progress
}
```

### d) Await source teardown

```ts
- audioSource.close();
+ await audioSource.close();
```

(`canvasSource.close()` is already awaited.)

## Accessibility

- Gear button has `aria-label="Export settings"` and `aria-expanded` reflecting `settingsOpen`.
- Popover has `role="dialog"` + `aria-label`.
- `<select>` elements are natively keyboard accessible; the existing keyboard guard prevents player shortcuts from firing when these are focused.

## Tests

- New unit tests in `tests/Controller.test.ts`:
  - Gear button is present in the bar.
  - Clicking gear toggles the popover (`data-open` attribute or visibility).
  - ESC closes the popover.
  - Outside click closes the popover.
  - Changing the Format `<select>` updates Controller state and is reflected in the next `movie.render()` call.
  - Same for Quality.
  - `aria-expanded` flips correctly.
- The mediabunny optimizations in `Renderer.ts` are not unit tested (no current Renderer tests; happy-dom can't drive WebCodecs). Verified manually via examples and by ensuring the existing Movie/Controller test suite still passes.

## File touch list

- `src/Controller.ts`: gear icon constant; settings DOM construction; state fields; toggle/close logic; `handleExport` passes options.
- `src/core/Renderer.ts`: codec auto-mapping; `fastStart`; keyframe interval; awaited `audioSource.close()`.
- `tests/Controller.test.ts`: new "Controller — settings popover" describe block (~6 cases).

`src/types.ts` and `src/core/Movie.ts` are unchanged (the existing `RenderOptions` already covers the option shape we pass).

## Risks

- **Codec availability per browser**: WebCodecs may not have an `avc` encoder on a particular browser/OS; mediabunny will reject. We surface this via the existing `Export failed.` alert. Documenting this in the popover is out of scope for v0.x.
- **`fastStart: 'in-memory'`**: peak memory grows roughly with the output file size. For very long exports (hundreds of MB) this could be a problem. Acceptable trade-off for typical usage; if it becomes a real issue, switch to `'reserve'` or `false`.
- **Native `<select>` look**: differs across OS. Acceptable — keeps the popover small and we avoid building a custom dropdown.
- **Popover overflow**: anchored bottom-right. On extremely narrow canvases, the 180px-min popover could exceed the canvas width; in that case it overflows the canvas to the left, which is fine (it stays visible).
- **MKV mapping note**: even though MKV isn't in the popover, the Renderer's codec mapping covers `mkv` so that direct API users (`movie.render({ format: 'mkv' })`) still get a sensible default.
