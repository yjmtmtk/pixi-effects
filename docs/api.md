# API Reference

- [`Movie`](#movie) — composition runtime: init, playback, render
- [`Controller`](#controller) — drop-in player UI overlay
- [Helpers](#helpers) — pure utilities exported from `pixi-effects/controller`
- [`pixi-effects/three`](#pixi-effectsthree) — optional three.js integration

For DSL types (composition spec, sequences, filters, keyframes, expressions), see [DSL reference](./dsl.md).

---

## `Movie`

Imported from `pixi-effects`.

```ts
import { Movie } from 'pixi-effects';

const movie = new Movie();
await movie.init({ /* ... */ });
movie.play();
```

### Constructor

```ts
new Movie()
```

No arguments. State is fully populated by `init()`.

### `movie.init(options): Promise<void>`

Loads assets, builds the composition tree, mixes audio, and renders frame 0.

```ts
interface MovieOptions {
  width?:      number;              // canvas pixels  (default 1920)
  height?:     number;              // canvas pixels  (default 1080)
  duration?:   number;              // seconds         (default 10)
  frameRate?:  number;              // fps             (default 30)
  background?: string;              // CSS color hex   (default '#000000')
  canvas?:     HTMLCanvasElement;   // existing canvas to render into; otherwise PixiJS creates one
  assets?:     AssetSpec[];         // [{ name, src }]
  composition?: CompositionSpec;    // root composition (see DSL reference)
}
```

Resolves once the composition is ready and the first frame has been rendered. Emits the `ready` event.

### `movie.play(): void`

Starts the requestAnimationFrame loop that drives `gotoFrame()` per tick. If `currentFrame >= totalFrames`, restarts from 0.

If audio sources exist, schedules them on the AudioContext at the appropriate offsets.

### `movie.pause(): void`

Stops the rAF loop and any playing audio. Emits `'pause'` only when the previous state was playing (so calling `pause()` on an already-paused movie is a no-op for listeners).

### `movie.gotoFrame(frame, force?): Promise<void>`

```ts
gotoFrame(frame: number, force?: boolean): Promise<void>
```

Seeks to a specific frame. Pauses if currently playing? **No** — does not change `isPlaying`. Updates `timeline.time()`, awaits any video frame readiness, renders, and emits `'frame'`.

`force=true` skips the early-return when the requested frame equals `currentFrame`. Use it after a composition rebuild.

### `movie.snapshot(frame?, options?): Promise<Blob | string>`

```ts
snapshot(frame?: number, options?: { scale?: number; type?: 'image/png' | 'image/jpeg'; as?: 'blob' | 'dataURL' }): Promise<Blob | string>
```

A picture of one frame: **the canvas only** (the player bar is not in it). Seeks to `frame` (default: the current frame) and stays there. `as: 'dataURL'` returns a `data:` URL string, handy when a script can only return text. Use it to look at what you built.

### `movie.contactSheet(options?): Promise<Blob | string>`

```ts
contactSheet(options?: {
  frames?: number[]; times?: number[]; count?: number;   // which frames: explicit, in seconds, or `count` evenly spread (default 6)
  columns?: number;                                       // default 3
  cellWidth?: number;                                     // picture width in px, default 480
  as?: 'blob' | 'dataURL';
}): Promise<Blob | string>
```

Many frames on **one** PNG, each labelled `frame N · T s`. The cheapest way to check a whole animation by eye (include the middle of every transition and the last second). Restores the current frame afterwards.

### `measureText(text, style?): { width, height, lines }` and `splitText(text, style?, options?): TextPiece[]`

Text layout helpers, exported from `pixi-effects`. They measure with the renderer's own font metrics (the same numbers a text layer with that `style` has), so a layout built from them matches what is drawn. `style` is a text layer's `style` with numbers (no expressions). A web font must be loaded first.

```ts
measureText('Hello', { fontSize: 72 });                       // { width: 187.4, height: 81.3, lines: 1 }

interface SplitOptions { by?: 'chars' | 'words' | 'lines'; x?: number; y?: number; align?: 'left' | 'center' | 'right' }
interface TextPiece { text: string; x: number; y: number; width: number; index: number; line: number }
splitText('Hello world', style, { by: 'words', x: 640, y: 300, align: 'center' });
// → [{ text: 'Hello', x, y, width, index: 0, line: 0 }, { text: 'world', ... }]
```

`x` is the line's left edge, or its centre / right edge with `align` (each line of a `\n` text is aligned on its own width); `y` is the top of the first line, and further lines go down by the line height. Whitespace takes its room but is not returned as a piece. Use one text layer per piece with the same `style` and the default top-left anchor: `{ type: 'text', text: p.text, style, initial: { x: p.x, y: p.y } }`. Kerning is kept (a piece's x is the measured width of everything before it).

### `movie.inspect(frame?, options?): Promise<InspectReport>`

Where every layer is drawn at `frame`, as JSON — for checking layout without eyes. Seeks there and stays there. `options.layers`: `'visible'` (default, only layers drawn at this frame), `'all'`, or `'none'` (just `summary` and `issues`). Faint layers (alpha < 0.3) and text whose x / y is animated (tickers) are not reported.

```ts
interface InspectReport {
  frame: number; time: number; canvas: { width: number; height: number };
  summary: { layers: number; visible: number };
  issues: string[];              // text off the canvas / cut by an edge / empty / overlapping other text — read this first
  layers: Array<{
    path: string;                // names (or type#index) from the root, joined by '/'
    name?: string; type: string; threeD: boolean;
    visible: boolean;            // alive at this frame, not hidden by an ancestor, alpha > 0
    alpha: number;
    bounds: { x: number; y: number; width: number; height: number } | null;   // canvas pixels; null inside a threeD layer
    onCanvas: 'full' | 'partial' | 'none' | null;
  }>;
}
```

### `movie.inspectAudio(options?): AudioReport`

The soundtrack as numbers — for checking sound without listening. Every sound is also measured on its own, so overlaps do not blur it. `options.window`: seconds per row of `windows` (default 0.1).

```ts
interface AudioReport {
  duration: number; sampleRate: number;
  peakDb: number; peakAt: number;          // the mix before limiting; > 0 dBFS means it was limited
  sources: Array<{
    layer: string; source: string;         // 'layer "hit"', 'sfx "hit"' | 'asset "bgm"' | 'video "clip"'
    start: number; end: number;            // movie time
    peakDb: number;                        // the MIX while it plays
    sound: { length: number; peakDb: number; loudestAt: number; brightnessHz: number };   // the sound alone
  }>;
  windows: Array<{ t: number; rmsDb: number; peakDb: number; brightnessHz: number }>;
  issues: string[];                        // limited mix, inaudible layer, sfx cut off by the end, no audio — read first
}
```

`render()` encodes this same mix: AAC in mp4 / mov (the encoder delay is trimmed with an edit list), Opus in webm / mkv.

### `movie.render(options?): Promise<Blob>`

Renders the entire timeline to a single video file. Pauses playback first.

```ts
interface RenderOptions {
  format?: 'mp4' | 'mov' | 'webm' | 'mkv';   // default 'mp4'
  video?: {
    codec?:   string;   // default per format (mp4/mov→avc, webm/mkv→vp9)
    bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';   // default 'high'
  };
  audio?: {
    codec?:   string;   // default per format (mp4/mov→aac, webm/mkv→opus)
    bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';   // default 'high'
  };
}
```

Returns a `Blob` whose `type` is the container's MIME (e.g. `video/mp4`). Emits `'progress'` repeatedly during the render.

The renderer also forces a keyframe every ~2 seconds so the resulting file scrubs efficiently in standard players.

### `movie.destroy(): Promise<void>`

Pauses playback, destroys the underlying PIXI Application, releases audio buffers and AudioContext, and marks the instance unusable.

### Events

```ts
movie.on(event, fn): this
movie.off(event, fn): this
```

| Event       | Payload                                           | Fired                                                 |
| ----------- | ------------------------------------------------- | ----------------------------------------------------- |
| `'ready'`   | none                                              | once, after `init()` resolves                         |
| `'frame'`   | `{ frame: number; totalFrames: number }`          | every `gotoFrame` (so once per playback frame too)    |
| `'pause'`   | none                                              | when `pause()` actually transitions from playing      |
| `'progress'`| `{ progress: number; frame: number; totalFrames: number }` | during `render()`, once per encoded frame    |

`progress` is `0..100` (rounded integer percent).

### Public properties

| Property         | Type      | Notes                                                   |
| ---------------- | --------- | ------------------------------------------------------- |
| `isPlaying`      | boolean   | true while the rAF loop is active                       |
| `currentFrame`   | number    | 0-based current frame                                   |
| `totalFrames`    | number    | `Math.round(duration * frameRate)`                      |
| `frameRate`      | number    | from `init`                                             |
| `duration`       | number    | seconds                                                 |
| `width`, `height`| number    | canvas pixels                                           |
| `background`     | string    | CSS color                                               |
| `volume`         | number    | 0..1 getter/setter; immediate. Setter clamps and applies to active audio |
| `muted`          | boolean   | getter/setter; immediate                                |
| `app`            | `pixi.js Application \| null` | PIXI Application instance (advanced/escape hatch) |
| `timeline`       | GSAP Timeline `\| null`         | underlying GSAP timeline (advanced)              |

### `movie.toggleMute(): boolean`

Flips `muted` and returns the new value.

---

## `Controller`

Imported from `pixi-effects/controller`.

```ts
import { Controller } from 'pixi-effects/controller';

const ctrl = new Controller(movie, { canvas });
// later:
ctrl.destroy();
```

A YouTube-style overlay anchored to the canvas:

```
[▶] [🔉━━━] 0:00 / 0:08 ··· [⬇] [⛶]
└── play   └── volume   └── time     └── export   └── fullscreen
```

The bar auto-hides 2.5s after pointer activity stops (in both playing and paused state) and reappears on pointer move. Clicking the download icon opens a popover with format/quality selectors and a `Download` confirm button. Fullscreen scales the canvas + bar to the viewport.

### Constructor

```ts
new Controller(movie: Movie, options: ControllerOptions)

interface ControllerOptions {
  canvas: HTMLCanvasElement;          // required
  showExportButton?: boolean;         // default true; hides ⬇ + popover
  enableKeyboardShortcuts?: boolean;  // default true
  className?: string;                 // default 'movie-controller'
}
```

Mounting strategy:

- If `canvas.parentElement` already has a non-static `position`, the controller is appended directly into it.
- Otherwise the canvas is wrapped in a `<div class="movie-controller-wrap">` (with `position: relative`). The wrapper is removed on `destroy()`.

### `controller.destroy(): void`

Idempotent. Removes:

- the controller bar DOM
- all listeners (Movie events, document keydown/pointerdown/fullscreenchange, wrapper pointermove/mouseleave)
- the auto-hide timer
- the wrapper, if it was created here
- the injected stylesheet (ref-counted across multiple controllers)

If the controller still owns `document.fullscreenElement`, it calls `exitFullscreen()`.

### Export popover

Format options: **MP4**, **WebM**, **MOV** (mp4 ↔ avc/aac, webm ↔ vp9/opus, mov ↔ avc/aac).

Quality options: **Low**, **Medium**, **High** (default), **Very High**.

These map directly to `Movie.render()`'s `format` and `video.bitrate` / `audio.bitrate` parameters. Selection persists for the lifetime of the controller instance (no localStorage).

The download is triggered by an in-page `<a download>` click, so the file lands in the browser's default download location with a name like `movie-{YYYYMMDD-HHMMSS}.{ext}`.

### Keyboard shortcuts

Active when `enableKeyboardShortcuts: true` and the key target is not `<input>`/`<textarea>`/`<select>`/contenteditable.

| Key         | Action                                              |
| ----------- | --------------------------------------------------- |
| `Space`     | play / pause                                        |
| `←` / `→`   | step ±1 frame                                       |
| `↑` / `↓`   | volume ±5% (clears mute when increasing past zero)  |
| `M`         | toggle mute                                         |
| `Shift+E`   | export with current settings (skips the popover)    |
| `F`         | toggle fullscreen                                   |
| `Esc`       | close the export popover or exit fullscreen (browser) |

### Theming

The bar uses fixed colors (`#007AFF` for the active track / fill / confirm button, white for icons, `rgba(0,0,0,0.75)` gradient background). Override by adding stricter CSS rules under `.movie-controller`. A theming API (CSS custom properties) is on the roadmap.

---

## Helpers

These pure functions are exported from `pixi-effects/controller` for consumers who want to build custom controls or reuse the parsing utilities. All are side-effect-free.

```ts
import { formatTime, frameToPercent, pxToFrame, pxToFraction, extensionForMimeType }
  from 'pixi-effects/controller';
```

### `formatTime(seconds: number): string`

Returns `M:SS` (no leading zero on minutes). `formatTime(125)` → `"2:05"`. Negatives clamp to zero.

### `frameToPercent(frame: number, totalFrames: number): number`

Returns 0..100 (clamped). `totalFrames <= 0` returns 0.

### `pxToFrame(clientX, rect, totalFrames): number`

Maps a pointer X coordinate (relative to viewport) inside a `DOMRect`-shaped object to a frame index 0..totalFrames. Rounded.

```ts
pxToFrame(150, { left: 100, width: 200 } as DOMRect, 100)  // 25
```

### `pxToFraction(clientX, rect, inset?): number`

Same as `pxToFrame` but returns a normalized 0..1 fraction. The optional `inset` shrinks the active range by that many pixels on each side (used internally for the volume slider).

### `extensionForMimeType(mime: string): string`

Maps common video MIME types to file extensions. Falls back to `'mp4'`.

| MIME contains       | Extension |
| ------------------- | --------- |
| `webm`              | `webm`    |
| `quicktime` / `mov` | `mov`     |
| `matroska` / `mkv`  | `mkv`     |
| anything else       | `mp4`     |

---

## `pixi-effects/three`

Optional three.js integration, imported from its own entry so the core `pixi-effects` entry never touches three.js:

```ts
import { registerThree, three, ThreeSequence } from 'pixi-effects/three';
```

**Install:** `npm i three`. `three` is a peer dependency marked optional (`peerDependenciesMeta.three.optional = true`) — consumers who never import `pixi-effects/three` are unaffected either way.

For the `type: 'three'` spec shape (fields, keyframe paths, rules), see [DSL reference § three](./dsl.md#three).

### `registerThree(): void`

Registers the `'three'` sequence type with the composition builder. Call once, before `Movie.init()` builds a composition containing a `type: 'three'` sequence. Idempotent.

### `three(spec: ThreeSequenceSpec): SequenceSpec`

Typing helper — accepts a strongly-typed three spec and returns it as a plain `SequenceSpec`, so it drops straight into `composition.sequences` alongside `text` / `image` / etc. A cast only; not required for the sequence to work, but gives editor autocomplete on `setup` / `update` / `dispose`.

### `ThreeSequence`

The `Sequence` subclass that backs `type: 'three'`. Exported for advanced use (e.g. `instanceof` checks); most consumers only need `registerThree()` and `three()`.

### Exported types

```ts
import type { ThreeContext, ThreeSetupResult, ThreeSequenceSpec } from 'pixi-effects/three';
```

| Type                | Notes                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| `ThreeContext`      | `{ scene, camera, renderer, width, height }` handed to `setup` / `update` / `dispose`. |
| `ThreeSetupResult`  | `{ objects?, camera? }` returned from `setup`.                                 |
| `ThreeSequenceSpec` | the `type: 'three'` sequence spec.                                             |
