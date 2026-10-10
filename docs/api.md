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
  poster?:     number;              // seconds: the frame shown before play (negative: from the end), see movie.poster
  motionBlur?: boolean | number | { samples?: number; shutter?: number };   // blur for render() / snapshot() / contactSheet(), not live playback; see Motion blur
  loader?:     HTMLElement | string | false;   // the page's loader (see pixi-effects/loader.css): shows how far init is (a bar, "BUILDING LAYERS 62%"), faded out when ready, stopped if init fails; default: a .pe-loader next to the canvas
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
snapshot(frame?: number, options?: { scale?: number; type?: 'image/png' | 'image/jpeg'; as?: 'blob' | 'dataURL'; motionBlur?: MotionBlurSpec }): Promise<Blob | string>
```

A picture of one frame: **the canvas only** (the player bar is not in it). Seeks to `frame` (default: the current frame) and stays there. `as: 'dataURL'` returns a `data:` URL string, handy when a script can only return text. Use it to look at what you built.

### `movie.contactSheet(options?): Promise<Blob | string>`

```ts
contactSheet(options?: {
  frames?: number[]; times?: number[]; count?: number;   // which frames: explicit, in seconds, or `count` evenly spread (default 6)
  columns?: number;                                       // default 3
  cellWidth?: number;                                     // picture width in px, default 480
  as?: 'blob' | 'dataURL';
  motionBlur?: MotionBlurSpec;                            // see Motion blur
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
  format?: 'mp4' | 'mov' | 'webm' | 'mkv' | 'wav' | 'ogg';   // default 'mp4'; wav / ogg: ONLY the movie's sound (an error when it has none)
  video?: {
    codec?:   string;   // 'avc' (H.264) | 'hevc' | 'vp9' | 'av1' | 'vp8'; default per format (mp4/mov→avc, webm→vp9, mkv→vp9)
    bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | number | string;   // default 'high'; or bits a second: 8_000_000, '8M', '800k'
    hardware?: 'no-preference' | 'prefer-hardware' | 'prefer-software';   // where to encode (default 'no-preference')
    keyFrameInterval?: number;   // seconds between keyframes (default 2): shorter seeks faster, a bigger file
  };
  audio?: {
    codec?:   string;   // default per format (mp4/mov→aac, webm/mkv/ogg→opus, wav→pcm-s16)
    bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | number | string;   // default 'high' (not for wav: it is not compressed)
  };
  motionBlur?: boolean | number | { samples?: number; shutter?: number };   // overrides movie.init's; false turns it off
}
```

#### Motion blur

`movie.init({ motionBlur })` (or the same option on a single `render()`, `snapshot()` or `contactSheet()` call) exposes each frame the way a film camera does: the frame is drawn `samples` times at moments spread over the shutter interval around its time, and the pictures are averaged. Fast motion smears along its path; a still picture is unchanged. `true` is 8 samples at a 180° shutter, a number is the sample count (2–64), `{ samples, shutter }` sets both (`shutter` is the fraction of a frame the shutter stays open, above 0 and up to 1; `0.5` is the film look, `1` blurs more). `false` turns it off for one call.

- It applies to what is **made**: the exported file, snapshots, contact sheets (so `pixi-effects-check` and `inspect`-style reviews show what the file will have). Live playback is not blurred.
- Cost: a render takes about `samples` times as long (video layers are decoded once per sample). Eight samples is enough for most motion; raise it for very fast or large movement, where fewer samples show as separate ghost images instead of a smear.
- After a blurred snapshot, contact sheet or render the playhead and the stage are on an exact frame again, not a sample.
- `pixi-effects-render --motion-blur 8 [--shutter 0.5]` sets it for one file.

**Video codec:** unless you name `video.codec`, the usual one for the format is used (mp4 / mov: `avc`; webm: `vp9`); if this browser cannot encode it, the next that works is used and a warning says so. A codec you name is never swapped: it is used, or the error names the one that would work (`"av1" ... "avc" would work: render({ format: 'mp4', video: { codec: 'avc' } })`). `hevc` and `av1` make smaller files at the same quality but play in fewer places than `avc`; `hardware: 'prefer-hardware'` asks the GPU's encoder.

**Sound only:** `render({ format: 'wav' })` (16-bit PCM, no loss) or `render({ format: 'ogg' })` (Opus) writes the movie's mixed sound without drawing a frame: a tune written as `music` becomes an audio file. `range` cuts it like a video. `pixi-effects render page.html -o mix.wav` does the same from a script. `mp3` and `flac` are not offered: browsers cannot encode them.

**Audio codec fallback:** unless you name `audio.codec`, the first codec this browser can actually encode is used (mp4: `aac`, then `opus`, `mp3`, `flac`; webm: `opus`, `vorbis`). Chrome on Linux has no AAC encoder, so there an mp4 with sound carries Opus and a warning says so (before, the export failed with a message about encoder configurations). A codec you name is never swapped: if it cannot be encoded the error says which one would work.

Returns a `Blob` whose `type` is the container's MIME (e.g. `video/mp4`). Emits `'progress'` repeatedly during the render.

The renderer also forces a keyframe every ~2 seconds so the resulting file scrubs efficiently in standard players.

### Poster time: `movie.init({ poster })`, `movie.poster`, `movie.posterImage()`

A movie can say which moment stands for it before it plays, the way `<video poster>` names a picture, except that here it is a **time**, so the picture comes from the same data and needs no separate image file:

```js
await movie.init({ /* … */ poster: 9.5 });          // seconds; a negative value counts back from the end (-2 = two seconds before the end)
movie.poster;                                       // 9.5, or null
movie.posterFrame;                                  // 285 at 30 fps, or null
const blob = await movie.posterImage();             // the picture at that time (frame 0 if there is no poster); { as: 'dataURL', type: 'image/jpeg', scale: 0.5 } like snapshot()
```

- Once the movie is ready the **canvas shows the poster frame**, while the playhead stays at frame 0 (`currentFrame` is 0, the player shows 0:00). The first `play()` or `gotoFrame()` replaces it, and **play starts from 0**.
- `posterImage()` leaves the movie as it was: still showing the poster, or back at the frame it was at. `contactSheet()` does the same.
- A time past the end is clamped to the last frame, and something that is not a number is ignored; both warn.
- `pixi-effects-check` writes the poster as `poster.jpg`.

### `movie.timelineData(): TimelineData` and `movie.timelineChart(options?): string`

The whole movie as rows on a time axis, for a person to read at a glance. `timelineData()` is the data: `{ duration, rows, transitions }`, a row per layer with `name`, `type`, `depth` (1 inside a composition), absolute `start` / `end` in seconds, `keys` (when each keyframe starts) and, for a family of generated layers, `parts` (one span per layer). Layers of one type whose names differ only by numbers (`ring10-0`, `ring9-1`, `pop-3` …), four or more, become ONE row (`ring#-# ×19`), so a movie with 700 generated layers is a screenful. `timelineChart({ title })` returns one self-contained HTML page (an inline SVG, no scripts): bars coloured by type, ◆ at each keyframe start, a shaded band per transition, a tooltip per bar. `pixi-effects-check` writes it next to the contact sheet as `timeline.html`.

`movie.timelineSvg()` is the chart alone (one `<svg>`, geometry in `data-*` attributes, each row `<g class="row" data-start>`): `pixi-effects-view` puts a playhead on it and turns a click into a seek.

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
| `'play'`    | none                                              | when `play()` actually transitions from paused        |
| `'pause'`   | none                                              | when `pause()` actually transitions from playing      |
| `'progress'`| `{ progress: number; frame: number; totalFrames: number }` | during `render()`, once per encoded frame    |
| `'loadprogress'` | `{ stage: 'assets' \| 'build' \| 'sound' \| 'frames'; loaded: number; total: number; progress: number }` | during `init()`, after each asset and each layer built, once the sound is mixed; `progress` is 0 to 1 for the whole init. The page's `.pe-loader` already shows it; `movie.loadStages` gives the milliseconds per stage afterwards |
| `'seeking'` / `'seeked'` | `{ frame, totalFrames }` (the frame it lands on) | a `gotoFrame()` to another frame starts / has finished. NOT emitted for playback ticks, `render()`, `snapshot()` or `contactSheet()` |
| `'stop'`    | `{ index: number; stop: Stop; pageIndex: number }` | a presentation is on a stop: `next()` played to it, or `prev()` / `goToStop()` / `goToPage()` jumped to it |
| `'ended'`   | none                                              | playback ran off the end (after `'pause'`); pausing by hand does not emit it |
| `'volumechange'` | `{ volume: number; muted: boolean }`         | `volume` or `muted` really changed (clamping counts) |
| `'error'`   | `{ where: 'init' \| 'render' \| 'playback'; message: string; error: unknown }` | `init()` / `render()` failed (the call still rejects), or a frame failed during playback |

The names are the ones an HTML5 `<video>` uses, so a player written for `<video>` ports over.

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
| `stops`          | `Stop[]`  | the composition's stops (see Presentations); empty for an ordinary movie |
| `stopIndex`, `pageIndex`, `pageCount`, `currentStop` | number, number, number, `Stop \| null` | where the playhead is among the stops and pages (`-1` / `null` before the first stop) |

### Presentations: `stops`, `next()`, `prev()`, `Presenter`

A composition can say where a presentation pauses: `composition: { stops: [...] }`. A stop is a time in seconds or `{ at, page?, notes?, advance?, pdf? }`; a stop with `page` (a name, or `true`) begins a page, the others are steps of it; with no `page` anywhere each stop is a page; the first stop always begins one. A negative `at` counts back from the end; two stops on one frame are one; a stop outside the movie is ignored with a warning. `movie.play()` ignores the stops and plays to the end; the `Controller`'s play button, Space and a click on the picture play to the next stop and pause there (see `pauseAtStops`). `pdf: true` marks the stop whose picture stands for its page in a PDF (and in the page overview); `pdf: false` keeps a stop's picture out of the PDF (a last stop that is mid-exit, a step you do not want on paper). Without flags a page is pictured by its last stop.

```ts
movie.stops                    // Stop[]: { index, at, frame, page: string | null, pageIndex, pageStart, notes?, advance?, pdf? }
await movie.next();            // play to the next stop and pause exactly on its frame; pressed again while playing, skip to that stop at once;
                               // after the last stop play to the end. Resolves when it has landed (or stopped for another reason).
await movie.prev();            // jump back to the previous stop at once (no reverse playback); from the first stop, to the start
await movie.goToStop(i);       // 0-based
await movie.goToPage(n);       // 0-based: the first stop of page n
movie.stopIndex / movie.pageIndex / movie.pageCount / movie.currentStop
movie.on('stop', ({ index, stop, pageIndex }) => …)
```

`deck({ pages, transition? })` builds such a movie from pages (see the DSL reference). **`Presenter`** (`pixi-effects/presenter`) is the player for it:

```ts
import { Presenter } from 'pixi-effects/presenter';
const presenter = new Presenter(movie, { canvas });     // instead of Controller; await presenter.start() to go fullscreen and play to the first stop
```

| Option | Default | Notes |
| ------ | ------- | ----- |
| `canvas` | required | |
| `keyboard` | `true` | **next**: → ↓ Space Enter PageDown · **back**: ← ↑ Backspace PageUp · Home (first page) · End (last stop) · a page number then Enter · **G** the page overview · **P** the presenter view · B or `.` black screen · W or `,` white screen · F fullscreen · `?` / H the list of keys · Esc closes / leaves |
| `clickToAdvance` | `true` | a click or tap on the picture is next |
| `swipe` | `true` | a swipe to the left is next, to the right is back |
| `indicator` | `true` | a page counter (`3 / 8`), the page name and a progress line along the bottom; they fade out when nothing happens, and the pointer hides with them |
| `autoAdvance` | `true` | a stop with `advance: seconds` moves on by itself |
| `loop` | `false` | run off the end: go back to the start and play again |
| `accent` | white | the progress line's colour |
| `onExit` | none | Escape with nothing left to close, or fullscreen left |

**The page overview (`G`)** is a grid of every page with its picture, the current page marked: arrows choose, Enter or a click goes there, `G` or Esc closes. **The presenter view (`P`)** opens a second window for the speaker: the picture that is on screen (live), the picture of the next stop, the notes of the page, a timer (with reset), the page counter and Back / Next buttons; the keys work there too. Both use a picture of every stop that `start()` makes **before** the audience sees anything (behind a "Preparing…" cover; taking them moves the playhead through the stops and back, so it must not happen on screen); `presenter.ensureThumbs()` makes them on demand (an overview opened before that does it on the spot, with a flicker). A browser needs a click or key press to open a popup: `P` is one; if it is blocked a warning says so.

`presenter.start()`, `presenter.openPresenterView()`, `presenter.closePresenterView()`, `presenter.next()`, `presenter.prev()`, `presenter.setCover('black' \| 'white' \| 'off')`, `presenter.exit()`, `presenter.destroy()`. It uses the canvas's positioned parent, or wraps the canvas like `Controller` does. A movie with stops shown through a **`Controller`** gets a mark per stop on the seek bar and a Present button (`present: false` leaves the marks only) that hands the page to a `Presenter` (fullscreen, keys, click and swipe move through the stops; Esc gives the bar back).

### `movie.inspectStops(options?)`

Is the picture at each stop still changing? Each stop is compared with the picture `lookback` frames before it (default 3); when more than `tolerance` (default 0.004, a share of the pixels) differs, the audience, the page overview and a PDF would see a half-finished animation. Returns `{ stops: [{ index, page, at, frame, moving, settled }], issues: string[] }`; each issue names the stop and the page and says what to do (move the stop to after the animation has ended, or flag a settled stop of the page `pdf: true`). Leaves the playhead where it was. `pixi-effects-check` runs it for any page with `stops`.

### Pictures of the stops and the deck as a PDF: `movie.stopImages()`, `movie.exportPDF()`

```ts
const pages = await movie.stopImages({ as: 'dataURL', type: 'image/jpeg', scale: 0.25 });   // one picture per PAGE: its last stop, fully built
// [{ stop, page, image }, …]; { which: 'stops' } is one per stop, { pick: 'first' } the first stop of each page; onImage(img) is called as each one is ready
const pdf = await movie.exportPDF({ title: 'My talk' });                                    // a Blob: one PDF page per page of the deck (JPEG at the canvas size)
```

Both pause the movie and leave the playhead where it was; a movie with no stops returns an empty list / throws (a PDF needs pages). The picture of a page is, in order: its last stop flagged `pdf: true`, else its last (with `pick: 'first'`, first) stop that is not `pdf: false`; a page whose stops are all `pdf: false` is left out of a PDF (a page list still shows it by its last stop); `which: 'stops'` makes a page of every stop that is not `pdf: false`. `exportPDF` options: `which`, `pick`, `scale`, `quality` (JPEG, default 0.92), `title`, `motionBlur`, `onImage`. A transparent background comes out black in a JPEG: give the movie a `background`. From a script, `npx pixi-effects render my-talk.html -o my-talk.pdf` (add `--all-stops` for a page per stop).

### Audio-reactive: `audioEnvelope()`, `react()`, `bpmEnvelope()`

Make things follow the sound, deterministically (playback, seeking and export agree): analyse the sound **before** `movie.init`, then bake what it does into keyframes.

```ts
import { audioEnvelope, bpmEnvelope, react } from 'pixi-effects';

const env = await audioEnvelope('music.mp3', { frameRate: 30 });      // a URL, Blob / File, ArrayBuffer or AudioBuffer
// env.series.level / bass / mid / treble: one value per frame, 0–1 on a log (perceptual) scale, measured against the loudest of them
// env.beats: times of the beats (seconds); env.bpm: the tempo (null with too few beats); env.at(time, 'bass')
await movie.init({ /* … */ composition: { sequences: [
  { type: 'shape', shape: 'circle', radius: 120, initial: { x: 640, y: 360 },
    keyframes: react(env, { duration: 12, props: { scale: { base: 1, amount: 0.4, band: 'bass', attack: 0.02, release: 0.2 } } }) },
  { type: 'audio', asset: 'music', loop: true },
] } });
```

| `audioEnvelope(source, options)` | |
| --- | --- |
| `frameRate` | one value per video frame: use the movie's (default 30) |
| `bands` | `{ name: [fromHz, toHz] }`. Default `{ bass: [20, 150], mid: [150, 2000], treble: [2000, 10000] }`; give your own for a spectrum (24 log-spaced bands) and the beat detector looks in `bass` (set `beatBand` if you have no such band) |
| `beatSensitivity` | above 1 finds more beats, below 1 fewer |

`react(env, options)` returns keyframes (one linear step per frame): `{ at?, duration, props, audioOffset?, loop?, frameRate? }`. Each prop is `{ base, amount, band?, beats?, decay?, attack?, release?, invert?, curve? }`: the value is `base + amount × level`. `band` picks a series (default `level`); `beats: true` follows the beats instead (a jump to full on each, falling off with `decay` seconds); `attack` / `release` smooth the rise and fall in seconds like a level meter (a quick rise and a slow fall bounces); `curve` above 1 lets only the loud parts move it. `audioOffset` is where in the sound the layer's start is (a layer that begins 2 s after the music: `audioOffset: 2`); `loop: true` for a looping music layer. It refuses to bake more than 4000 steps (lower `frameRate`).

`bpmEnvelope(120, { duration, frameRate })` is a stand-in with no audio file: a kick on every beat (`bass`), a snare on 2 and 4 (`mid`), hats on the eighths (`treble`), exactly on the tempo. Use it to try an idea, or to make visuals that match sound effects you place on the same tempo. The analysis is the same code the check tool trusts: pure and deterministic.

### `musicEnvelope()`

```ts
import { musicEnvelope } from 'pixi-effects';
const music = { bpm: 96, tracks: [{ inst: 'bass', notes: 'c2:2 g1:2' }], drums: { kick: 'x...x...' } };       // the same object the audio layer plays
const env = await musicEnvelope(music, { frameRate: 30 });                                                     // BEFORE movie.init; async: the synthesiser is its own chunk
```

The [audio-reactive](#audio-reactive-audioenvelope-react-bpmenvelope) envelope of an audio layer's [`music`](dsl.md#music-written-as-text-music): it renders the score and analyses that very sound, so `env.series` (`level`, `bass`, `mid`, `treble`, or your `bands`) follows the notes. `env.beats` are exact (the kick hits, or every beat when the score has no kick) and `env.bpm` is the starting tempo. Options are `audioEnvelope`'s (`frameRate`, `bands`, `beatBand`, `beatSensitivity`). Throws, saying why, when the score cannot play (for example no `bpm`). The envelope covers the music and its tail; when the layer starts at `at`, pass `at` to `react()`.

### `musicBuffer()`

```ts
import { musicBuffer } from 'pixi-effects';
const buffer = await musicBuffer(music, { sampleRate: 44100, duration?, loop? });                    // an AudioBuffer (stereo)
const src = audioContext.createBufferSource(); src.buffer = buffer; src.connect(audioContext.destination); src.start();
```

The sound of [`music`](dsl.md#music-written-as-text-music) as a Web Audio buffer, for a page that plays tunes without a movie (a jingle on a button, your own player; [`examples/music-lab.html`](../examples/music-lab.html) is one). `duration` (seconds) cuts it or, with `loop: true`, repeats it up to that length; the default is the music's length plus its tail. Warnings are printed like for an audio layer; it throws, saying why, when the score cannot play. Async: the synthesiser is its own chunk.

### `movie.toggleMute(): boolean`

Flips `muted` and returns the new value.

---

## Building your own player

`Controller` is one optional player; everything it does is public on the movie, so a player of your own is plain HTML + CSS + a few handlers (`examples/15-custom-player.html` is a complete one):

```js
const el = id => document.getElementById(id);
movie.on('ready', () => { el('seek').max = movie.totalFrames; });
movie.on('frame', ({ frame }) => { el('seek').value = frame; el('time').textContent = (frame / movie.frameRate).toFixed(1) + ' s'; });
movie.on('play',  () => { el('play').textContent = '❚❚'; });
movie.on('pause', () => { el('play').textContent = '▶'; });
movie.on('ended', () => { el('play').textContent = '↻'; });                 // play() at the end starts again from 0
movie.on('volumechange', ({ volume, muted }) => { el('vol').value = muted ? 0 : volume; });
el('play').onclick = () => (movie.isPlaying ? movie.pause() : movie.play());
el('seek').oninput = e => movie.gotoFrame(+e.target.value);
```

What you have: `play()`, `pause()`, `gotoFrame(frame)`, `volume`, `muted` / `toggleMute()`; the state `currentFrame`, `totalFrames`, `frameRate`, `duration`, `isPlaying`, `isReady`, `loadStages` (milliseconds `init()` spent in `assets` / `build` / `sound` / `frames`), `audioBlocked` (true while the browser keeps the movie's sound silent until a tap: show "tap for sound"; a tap or key press that arrives while `play()` is pending, or the next `play()` made from a tap, starts it); the events above; `render()` for a download button; `snapshot()` for a thumbnail; `timelineData()` / `timelineSvg()` for a timeline like `pixi-effects-view`'s. Keep the movie's `canvas` wherever your layout wants it (the page's CSS sizes it). To only change how `Controller` looks, see **Theme** below.

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
  present?: boolean;                  // default true: a movie with stops gets a Present button (marks on the seek bar are always shown)
  pauseAtStops?: boolean;             // default true: with stops, play / Space / click on the picture play to the next stop and pause; false plays straight through
  clickToPlay?: boolean;              // default true: a click / tap on the picture plays / pauses (like <video>); false leaves the canvas alone
  className?: string;                 // default 'movie-controller'
  theme?: ControllerTheme;            // colours / thickness / font of the bar, see Theme
}
```

Mounting strategy:

- If `canvas.parentElement` already has a non-static `position`, the controller is appended directly into it.
- Otherwise the canvas is wrapped in a `<div class="movie-controller-wrap">` (with `position: relative`). The wrapper is removed on `destroy()`.

### Theme: change the colours of the bar

The bar is blue by default. Every colour and the track thickness are CSS custom properties with the old values as defaults, so there are two ways to change them:

```js
new Controller(movie, { canvas, theme: { accent: '#ff4d6d', foreground: '#ffe9a8', trackHeight: 5 } });   // in code
controller.setTheme({ accent: '#7bd88f' });          // later, live; only the keys you give change
controller.setTheme({ accent: null });               // null = back to the default
```
```css
:root { --mc-accent: #ff4d6d; }                      /* or in your page CSS: the canvas's parent, or :root */
```

| `theme` key | CSS property | What | Default |
|---|---|---|---|
| `accent` | `--mc-accent` | progress bar, its thumb, focus rings, the export button | `#007AFF` |
| `foreground` | `--mc-fg` | icons, the time, the volume slider | `#fff` |
| `track` | `--mc-track` | the unfilled part of the progress / volume bars | `rgba(255,255,255,0.25)` |
| `barBackground` | `--mc-bar-bg` | the background behind the buttons (any CSS background, e.g. a gradient) | black fading to transparent upward |
| `trackHeight` | `--mc-track-height` | thickness of the progress bar (a number is px) | `3px` |
| `font` | `--mc-font` | `font-family` of the bar | system UI font |

A misspelt key warns with the valid ones. The default stylesheet is exported as `CONTROLLER_CSS` (from `pixi-effects/controller`) if you want to copy and restyle more.

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
