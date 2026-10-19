# API Reference

- [`Movie`](#movie) — composition runtime: init, playback, render
- [`Controller`](#controller) — drop-in player UI overlay
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
  vars?:       Record<string, number | string>;   // named values the composition reads: a number as a name in an expression, any as {name} in a string (see Variables)
  loop?:       boolean;             // start with movie.loop on: playing goes back to the start at the end (default false, like a <video>)
  loudness?:   number | false;      // the whole mix at this many LUFS (-16 is usual for web video): one gain, up or down, and a look-ahead limiter keeping the true peak at -1 dBTP or under (a click over a quiet bed is pulled down; more than 10 dB of limiting is out of reach and `check` names it); false / left out: the mix as the layers make it (check says when it is quiet)
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

### `movie.playUntil(seconds?): Promise<boolean>`

Play, and pause exactly at `seconds` (the frame `round(seconds × frameRate)`). It resolves `true` when the playhead has landed there; `false` when something else ended it first (a `pause()`, a seek, a newer `playUntil()`) or when there is nothing to play toward (a time at or before the playhead: it also pauses the movie where it is; a movie that is not ready). A time at or past the end lands on the last frame; with no time at all it plays to the end, says `ended`, and resolves `true`. An ordinary `play()` is not affected. It is the one move a presentation (`pixi-effects/present`) is built on; it is also the way to "play the intro, then wait": `await movie.playUntil(4.5)`.

### `movie.peek(fn): Promise<T>`

Look around and put the movie back: pauses, runs `fn` (seek, take pictures with `snapshot()`; the seeks made inside are not reported as `seeking` / `seeked`), then puts the playhead (or the poster) back where it was, whatever `fn` did, and returns what `fn` returned. `stopImages()` and `inspectStops()` (`pixi-effects/present`) are made with it.

### Movie variables and rebuilding: `vars`, `setVars()`, `resize()`, `rebuild()`

Variables are declared in `init({ vars: { title: 'NORD', shift: 0 } })` and read by the composition (see [Variables](dsl.md#variables)). Changing one builds the composition again: the new one is built off the stage first and swapped in when it is whole, at the same frame; a failure leaves the old one in place.

```ts
movie.vars                                         // the current values (a copy)
await movie.setVars({ shift: 40 });                // the declared names only (others: ignored with a did-you-mean); the same values: nothing happens
await movie.resize(1080, 1920);                    // the movie's size; W / H / GW / GH follow. Beats a width / height the composition names
await movie.rebuild({ composition, vars, width, height });   // the general form: any of the four; `composition` replaces the whole spec (your layout function, called again)
// all three resolve to a report, and fire 'rebuilt' with it:
interface RebuildReport { reason: 'vars' | 'resize' | 'rebuild'; ms: number; audio: 'reused' | 'mixed' | 'none'; frame: number; playing: boolean; unchanged?: true }
```

- The new composition is built while the old one goes on; at the swap the movie keeps doing what it is doing at that moment: the same frame, playing or paused (a `pause()`, a seek or a `play()` you made during the build is kept), the poster if it was shown. A playing movie whose sound is unchanged (`audio: 'reused'`) is not stopped at all: the frame clock and the sound go on and only the picture is swapped, so rebuilds in a row (a pointer) do not hold the playhead back. When the sound changed, the movie stops and plays on from the same frame with the new sound. A `playUntil()` in flight ends. The canvas changes size at the swap, not before. A `render()` or `peek()` in flight is not interrupted: the swap waits for it.
- The sound is mixed only when it changed: `audio: 'reused'` means the same mix as before (the mix is the slow part, 0.6 to 0.8 s for a film; the rest takes about 20 ms). A time remap (`warp` / `sourceMap`) turns the cache off.
- Calls that arrive during a rebuild are joined: at most one rebuild runs and one waits, with the latest values. Safe to call from `pointermove` or `scroll`: a rebuild that leaves the sound alone takes tens of milliseconds (11 to 42 ms on four gallery pieces), one that mixes the sound again 0.6 to 0.8 s, so a slider that changes the sound will lag behind the hand.
- A rebuild builds every layer again, **except a `three` layer that did not change**: one with a `name`, the same `setup` function, the same size and options keeps its scene, its renderer (and its graphics context) and its texture, so `setup` does not run again and a model is not loaded again (measured on a box scene: 15 ms for a rebuild of a WebGL layer built again, 1 ms kept; WebGPU 7 ms against 1 ms). `update` is the new composition's own and runs on the kept scene. A layer with no `name`, another size or another `setup`, or `reuse: false` is built again (the old one is disposed once, when the swap is done; a rebuild that fails leaves the old one untouched). Put what must follow a variable in `update` or in keyframes, not in `setup`; a `setup` that reads `movie.vars` needs `reuse: false`. A model still loads again when the composition changes (`rebuild({ composition })` with a new `setup` function).
- A rebuild that fails (a bad expression, a missing asset, a size that is not pixels) rejects, emits `error` with `where: 'rebuild'`, and the movie goes on with what it had. A `destroy()` during a rebuild ends it the same way.
- To follow a window: observe a CSS-sized box around the canvas, not the canvas itself (the movie sets the canvas's pixel size): `new ResizeObserver(() => movie.resize(Math.round(box.clientWidth * devicePixelRatio), Math.round(box.clientHeight * devicePixelRatio))).observe(box)` (the `liquid-layout` recipe).

### `movie.snapshot(frame?, options?): Promise<Blob | string>`

```ts
snapshot(frame?: number, options?: { scale?: number; type?: 'image/png' | 'image/jpeg'; quality?: number; as?: 'blob' | 'dataURL' | 'imageData'; motionBlur?: MotionBlurSpec }): Promise<Blob | string | ImageData>
```

A picture of one frame: **the canvas only** (the player bar is not in it). Seeks to `frame` (default: the current frame) and stays there. `as: 'dataURL'` returns a `data:` URL string, `as: 'imageData'` the pixels as an `ImageData` (to measure or compare; `quality` is the JPEG quality, 0 to 1), handy when a script can only return text. Use it to look at what you built.

### `movie.thumbnail(frame, options?): Promise<HTMLCanvasElement | null>`

```ts
thumbnail(frame: number, options?: { width?: number; scale?: number }): Promise<HTMLCanvasElement | null>   // width default 160 px
movie.thumbnailsOff   // null, 'video' or 'variables'
```

A small picture of any frame, made **without moving the playhead or changing what is on the canvas**, also while the movie plays (a seek-bar preview): the scene is put on that moment, drawn, copied and put back inside one task, so the browser never shows the in-between. It is the picture `snapshot()` gives at that size, without motion blur. It gives `null` when it cannot be made right now (a seek, a render or another thumbnail is running; ask again) and always when `movie.thumbnailsOff` is set: `'video'` for a movie with a video layer (the footage would have to seek twice), `'variables'` for a movie that declares variables. The player bar uses it for `thumbnails: true`.

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

interface SplitOptions { by?: 'chars' | 'words' | 'lines'; x?: number; y?: number; align?: 'left' | 'center' | 'right'; vertical?: boolean }
interface TextPiece { text: string; x: number; y: number; width: number; index: number; line: number; cx?: number; cy?: number; rotation?: number }   // cx / cy / rotation: vertical text only
splitText('Hello world', style, { by: 'words', x: 640, y: 300, align: 'center' });
// → [{ text: 'Hello', x, y, width, index: 0, line: 0 }, { text: 'world', ... }]
```

`x` is the line's left edge, or its centre / right edge with `align` (each line of a `\n` text is aligned on its own width); `y` is the top of the first line, and further lines go down by the line height. **Vertical writing (`vertical: true`, tategaki):** characters go down a column and a new line is a new column to the LEFT; `x` is the RIGHT edge of the first column, `y` the top of a column (`align: 'center'` / `'right'` put `y` at its middle / bottom). Each piece also has `cx` / `cy` (the centre of its cell, with 、。 moved to the upper right and small kana a little up and right) and `rotation` (90 for the long vowel mark, dashes, waves, leaders and brackets, which lie turned in vertical text): put a text layer with `anchorX: 0.5, anchorY: 0.5` at `cx` / `cy` with `rotation: p.rotation`, or call `animateText(..., { vertical: true })`, which does it. Latin letters and digits stay upright, one per cell (no tate-chu-yoko), and a line is only cut at `\n` (no kinsoku). Only `by: 'chars'` has a vertical form. Whitespace takes its room but is not returned as a piece. Use one text layer per piece with the same `style` and the default top-left anchor: `{ type: 'text', text: p.text, style, initial: { x: p.x, y: p.y } }`. Kerning is kept (a piece's x is the measured width of everything before it).

### `movie.inspect(frame?, options?): Promise<InspectReport>`

Where every layer is drawn at `frame`, as JSON — for checking layout without eyes. Seeks there and stays there. `options.layers`: `'visible'` (default, only layers drawn at this frame), `'all'`, or `'none'` (just `summary` and `issues`). Faint layers (alpha < 0.3) and text whose x / y is animated (tickers) are not reported.

```ts
interface InspectReport {
  frame: number; time: number; canvas: { width: number; height: number };
  summary: { layers: number; visible: number };
  issues: string[];              // text off the canvas / cut by an edge / empty / overlapping other text / partly hidden by an opaque shape or image drawn over it / struck through by a thin line drawn over it — read this first
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

### `movie.pick(x, y, options?): PickHit | null`, `movie.pickAll(x, y, options?): PickHit[]`, `movie.canvasPoint(event): [x, y]`

What is under a point of the canvas, at the frame that is on screen: the layer on top (`pick`), or every layer under the point, the top first (`pickAll`). `x`, `y` are canvas pixels (the movie's own `width` × `height`); `canvasPoint(event)` makes them from a pointer event (`clientX` / `clientY`) when the canvas is shown larger or smaller than its own size: `movie.pick(...movie.canvasPoint(event))`. It reads the frame as the last draw left it, so after `await movie.snapshot(frame)` or any seek it answers for that frame; it takes no time and has no clock.

```ts
interface PickHit {
  name?: string; path: string; type: string;     // path: as in inspect(), names or type#index joined by '/'
  kind: 'flat' | 'card' | 'three';               // a 2D layer, a threeD layer (its projected card), a three layer
  point: { x: number; y: number };               // the point asked about
  local?: { x: number; y: number };              // a flat layer: the point in the layer's own pixels
  via?: { path: string; object: string };        // the layer is shown on a mesh of a `three` layer (threeLayerTexture) and the point is on that mesh: the three layer and the object it came through
  three?: { object: string; point: [number, number, number]; distance: number; object3d: unknown;     // a three layer: what the ray met first
            grab?: (plane?) => { move: (x, y) => { point, delta } | null } };                          // drag it: see below
}
// options: { only?: string[], ignore?: string[], alpha?: number }   layer names or paths; alpha: see below
```

The hit is the layer that was drawn at the point, not the group it is in: a card made of a `composition` with a face and a label gives the face (`name: 'face0'`, `path: 'card0/face0'`), and a layer with no name of its own gives no `name` at all. To know which group was hit, read the first segment of the path (`hit.path.split('/')[0]`); `only: ['card0']` asks only about the group (a group's name stands for everything in it).

A `three` layer covers its whole picture, but only what its ray meets is a hit: elsewhere the layers below are hit (a title, the background). `only` / `ignore` entries are layer names or paths, and a group's name (a nested composition) stands for everything in it: a card and its label are one target as `only: ['card']`.

How a layer is asked: a flat layer by its own shape (a rotated one by its rotated rectangle, a shape by its outline: a circle is hit inside the circle, not at the corners of its box), text, images and video by their box (or by their picture with `alpha`); a `threeD` layer by its projected quad (the card seen from behind is hit too; a `threeD` composition is one card: what is inside it is not asked); a `three` layer by a ray through its camera (with `followCamera` the composition's camera), skipping invisible objects: `hit.three.object` is the name of the object it met (its own, or its nearest ancestor's that has one) and `object3d` the live three object. A layer not alive at the frame, at alpha 0, hidden by a parent, or outside its mask is not hit; a group (a nested composition without `threeD`) is not a target, the layers in it are. **`{ alpha }` looks at the picture, not the box**: `movie.pick(x, y, { alpha: 0.1 })` leaves out a pixel of an image, a video, a `canvas` layer or the letters of a `text` layer (the gap between letters, the hole of an O: a text layer is its glyphs, drawn again once per text and style with PixiJS's own generator; measured 2026-10-17: it agrees with the picture on over 95 % of the points of three texts, the rest are antialiased edges) whose alpha is at or below 0.1 (a transparent corner of a logo, the clear part of a circle drawn on a canvas); without it the box is the picture and nothing is read. Shapes are always hit by their outline, text and `shader` layers by their box (a shader's WebGL picture cannot be read back safely). A picture that cannot be read (an image from another origin: load it with `crossorigin="anonymous"` or from the same site) stays a hit, with one warning. What is not here: touch with several fingers.

**Dragging an object of a `three` layer**: `hit.three.grab(plane)` fixes a plane through the point that was taken (`'screen'` facing the camera, the default; `'floor'` horizontal; `'wall'` with z constant; or a normal `[x, y, z]`), and `grab.move(x, y)` takes the pointer in canvas pixels and gives where its ray meets that plane (`point`) and how far that is from the point taken (`delta`; `null` where the ray never meets the plane: a floor seen edge-on). Move the object by `delta`, from where it was when it was taken, and it follows the pointer exactly. The ray is the layer's own camera's (with `followCamera`, the composition's). The layer's `update` should read where the object is from the page's own state, and the page calls `await movie.redraw()` to draw the frame again while the movie is paused (recipe `drag-3d`).

### `movie.redraw(): Promise<void>`

Draws the frame on screen again, quietly (no `seeking` / `seeked`). For a paused movie when something outside it that a layer reads has changed, such as a `three` layer whose `update` reads the page's own state. A playing movie needs no call: the next frame draws it.

Hover is `movie.hover` (below); drag and drop of a flat layer is the recipe `drag-drop`.

### `movie.hover(options?): () => void`

Which layer the pointer is over, as two callbacks, built on `pick`: `onEnter(hit)` when the layer under the pointer (or, in a `three` layer, the object: `hit.three.object`) changes to another, `onLeave(hit)` for the one it left, also when the pointer leaves the picture or the returned function is called. While the pointer rests inside the picture it is asked again on every frame, so a picture that moves under a still pointer is followed (the runner leaves, the cursor changes) with no pointer event in between. Options: `only` / `ignore` as for `pick`, `cursor` (`true` is `'pointer'`, or any CSS cursor: shown while something is hovered, put back otherwise). Returns the function that stops it. Pointer events cover a mouse, a pen and a finger (a touch is "entered" when it lands and "left" when it lifts). It is a page-side tool: an exported video has no pointer. A handler that throws is said once and does not stop the next hover.

```ts
const stop = movie.hover({ ignore: ['background'], cursor: true, onEnter: (hit) => glow(hit.name), onLeave: (hit) => unglow(hit.name) });
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
    belowMixDb?: number;                   // how far below the loudest sample of the mix (itself included) around its own loudest moment it is; short sfx more than 12 dB under get ONE note, "buried", naming the worst
  }>;
  windows: Array<{ t: number; rmsDb: number; peakDb: number; brightnessHz: number }>;
  issues: string[];                        // limited mix, inaudible layer, sfx cut off by the end, no audio — read first
}
```

### `inspectSound(pcm, options?): SoundReport`

The same measurement for the sound of ANY file (not only a movie's mix): decode it to PCM (an `AudioBuffer` works) and ask. The numbers are the ones `movie.inspectAudio()` gives for the same samples, so `check` and `pixi-effects sound` agree. `options.window`: seconds per row of `windows` (default 0.1).

```ts
import { inspectSound } from 'pixi-effects';
// pcm: { numberOfChannels, sampleRate, length, getChannelData(ch): Float32Array }
interface SoundReport {
  duration: number; sampleRate: number; channels: number;
  peakDb: number;                                  // the loudest sample, dBFS
  loudness: { integratedLufs: number | null;       // ITU-R BS.1770; null for a sound under 0.4 s or with nothing above −70 LUFS
              truePeakDb: number; clippedSamples: number; silences: Array<{ from: number; to: number }> };
  windows: Array<{ t: number; rmsDb: number }>;    // the level over time
  notes: string[];                                 // quiet or loud for web video, little headroom, silent stretches
}
```

The command line wraps it: `pixi-effects sound <file>` (see `docs/media.md`). The page of that command loads it from `dist/sound.js`, a build of this function with no PixiJS in it.

`render()` encodes this same mix: AAC in mp4 / mov (the encoder delay is trimmed with an edit list), Opus in webm / mkv.

### `movie.render(options?): Promise<Blob>`

Renders the entire timeline to a single video file. Pauses playback first. **The file has exactly `duration × frameRate` frames** (a 10 s movie at 30 fps is 300 frames and 10.000 s: frames 0 to 299; the moment `duration` itself is not a frame, it belongs to the next one), and a `range: [a, b]` is the frames from `a` up to, not including, `b` (`[1, 2]` is 30 frames at 30 fps). So a clip made to loop has no repeated frame at its seam. `movie.totalFrames` is that number, and `movie.seek` / `gotoFrame` may still go to the end moment (frame `totalFrames`) to look at it.

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

- It applies to what is **made**: the exported file, snapshots, contact sheets (so `pixi-effects check` and `inspect`-style reviews show what the file will have). Live playback is not blurred.
- Cost: a render takes about `samples` times as long (video layers are decoded once per sample). Eight samples is enough for most motion; raise it for very fast or large movement, where fewer samples show as separate ghost images instead of a smear.
- After a blurred snapshot, contact sheet or render the playhead and the stage are on an exact frame again, not a sample.
- `pixi-effects render --motion-blur 8 [--shutter 0.5]` sets it for one file.

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
- `pixi-effects check` writes the poster as `poster.jpg`.

### `movie.timelineData(): TimelineData` and `movie.timelineChart(options?): string`

The whole movie as rows on a time axis, for a person to read at a glance. `timelineData()` is the data: `{ duration, rows, transitions }`, a row per layer with `name`, `type`, `depth` (1 inside a composition), absolute `start` / `end` in seconds, `keys` (when each keyframe starts) and, for a family of generated layers, `parts` (one span per layer). Layers of one type whose names differ only by numbers (`ring10-0`, `ring9-1`, `pop-3` …), four or more, become ONE row (`ring#-# ×19`), so a movie with 700 generated layers is a screenful. `timelineChart({ title })` returns one self-contained HTML page (an inline SVG, no scripts): bars coloured by type, ◆ at each keyframe start, a shaded band per transition, a tooltip per bar. `pixi-effects check` writes it next to the contact sheet as `timeline.html`.

`movie.timelineSvg()` is the chart alone (one `<svg>`, geometry in `data-*` attributes, each row `<g class="row" data-start>`): `pixi-effects view` puts a playhead on it and turns a click into a seek.

### Your own layer type: `Sequence` and `registerSequenceType(type, ctor)`

A layer type that the library does not have (a different renderer, a data view) is a subclass of `Sequence`, registered under a `type` name; then `{ type: 'mine', at, duration, initial, keyframes, filters, mask }` works like any layer, in any composition.

```js
import { Sequence, registerSequenceType } from 'pixi-effects';
import { Container } from 'pixi.js';

class Mine extends Sequence {
  async build() { this.target = new Container(); this.intrinsicWidth = 200; this.intrinsicHeight = 100; }   // the display object the keyframes move
  async awaitFrameAt(local) { /* optional: draw the frame at `local` seconds (playback and export both call it, so draw from the time only) */ }
}
registerSequenceType('mine', Mine);
```

`target` is the Pixi display object; `spec`, `parent`, `root`, `at`, `duration` are set for you; `scope()` gives the expression scope. Keyframes, filters, masks and the lifespan work on `target` as for the built-in layers. `awaitFrameAt(local)` is called once per frame by `gotoFrame` (the one path playback and export share), after the timeline has been set to that frame.

### `ease(name): (p: number) => number`

The function behind an ease name (`ease('power2.out')(0.5)`, `ease('spring.bouncy')`, `ease('cubic-bezier(.4, 0, .2, 1)')`), for a preset or a check of your own. A name nobody knows warns once and runs as `power1.out`.

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
| `'ended'`   | none                                              | playback ran off the end (after `'pause'`); pausing by hand does not emit it |
| `'volumechange'` | `{ volume: number; muted: boolean }`         | `volume` or `muted` really changed (clamping counts) |
| `'loopchange'` | `{ loop: boolean }`                            | `movie.loop` really changed (the first value from `init({ loop })` is not a change) |
| `'error'`   | `{ where: 'init' \| 'render' \| 'playback' \| 'rebuild'; message: string; error: unknown }` | `init()` / `render()` / a rebuild failed (the call still rejects), or a frame failed during playback |
| `'rebuilt'` | `RebuildReport` (see above) | a `setVars()` / `resize()` / `rebuild()` built the composition again (not for a call that changed nothing) |

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
| `loop`           | boolean   | getter/setter, default `false`. When true, an ordinary `play()` that reaches the end goes back to the start and plays on: no `ended`, no `pause` / `play` events at the wrap, the sound starts again (a short gap). `playUntil()` and `render()` ignore it. Say `loopchange` when it changes |
| `app`            | `pixi.js Application \| null` | PIXI Application instance (advanced/escape hatch) |
| `timeline`       | `Timeline \| null`              | the movie's timeline (advanced): `time(t)`, `duration()`, `segments()` |
| `vars`           | `Record<string, number \| string>` | the current variable values (a copy) |
| `stops`          | `Stop[]`  | the composition's stops: named times (see Presentations); empty for an ordinary movie |

### Presentations: `stops` and `pixi-effects/present`

A composition can say where a presentation pauses: `composition: { stops: [...] }`. A stop is a time in seconds or `{ at, page?, notes?, advance?, pdf? }`; a stop with `page` (a name, or `true`) begins a page, the others are steps of it; with no `page` anywhere each stop is a page; the first stop always begins one. A negative `at` counts back from the end; two stops on one frame are one; a stop outside the movie is ignored with a warning. `movie.play()` ignores the stops and plays to the end; the `Controller`'s play button, Space and a click on the picture play to the next stop and pause there (see `pauseAtStops`). `pdf: true` marks the stop whose picture stands for its page in a PDF (and in the page overview); `pdf: false` keeps a stop's picture out of the PDF (a last stop that is mid-exit, a step you do not want on paper). Without flags a page is pictured by its last stop.

```ts
import { next, prev, goToStop, goToPage, onStop, stopIndex, pageIndex, pageCount, currentStop } from 'pixi-effects/present';

movie.stops                    // (the core) Stop[]: { index, at, frame, page: string | null, pageIndex, pageStart, notes?, advance?, pdf? }
await next(movie);             // play to the next stop and pause exactly on its frame; pressed again while playing, skip to that stop at once;
                               // after the last stop play to the end. Resolves when it has landed (or stopped for another reason).
await prev(movie);             // jump back to the previous stop at once (no reverse playback); from the first stop, to the start
await goToStop(movie, i);      // 0-based
await goToPage(movie, n);      // 0-based: the first stop of page n
stopIndex(movie) / pageIndex(movie) / pageCount(movie) / currentStop(movie)      // where the playhead is (-1 / null before the first stop)
const off = onStop(movie, ({ index, stop, pageIndex }) => …);                    // a stop was landed on; off() stops listening
```

The presentation side is a separate entry, `pixi-effects/present`, built on the core's public API only (an import map line: `"pixi-effects/present": ".../dist/present.js"`). The core knows `stops` (named times) and two general moves it is made of: `movie.playUntil(seconds)` and `movie.peek(fn)` (below). An ordinary `movie.play()` ignores the stops. `onStop` listeners belong to the `pixi-effects/present` module the page imported: the `Controller` loads `present.js` from beside itself, so map `"pixi-effects/present"` to the same folder as `Controller.js`, or a Controller landing will not reach your `onStop`.


`deck({ pages, transition? })` (from `pixi-effects/present`) builds such a movie from pages (see the DSL reference). **`Presenter`** (also `pixi-effects/present`) is the player for it:

```ts
import { Presenter } from 'pixi-effects/present';
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

`presenter.start()`, `presenter.openPresenterView()`, `presenter.closePresenterView()`, `presenter.next()`, `presenter.prev()`, `presenter.setCover('black' \| 'white' \| 'off')`, `presenter.exit()`, `presenter.destroy()`. It uses the canvas's positioned parent, or wraps the canvas like `Controller` does. A movie with stops shown through a **`Controller`** gets a mark per stop on the seek bar and a Present button (`presentButton: false` leaves the marks only) that hands the page to a `Presenter` (fullscreen, keys, click and swipe move through the stops; Esc gives the bar back).

### `inspectStops(movie, options?)`

Is the picture at each stop still changing? Each stop is compared with the picture `lookback` frames before it (default 3); when more than `tolerance` (default 0.004, a share of the pixels) differs, the audience, the page overview and a PDF would see a half-finished animation. Returns `{ stops: [{ index, page, at, frame, moving, settled }], issues: string[] }`; each issue names the stop and the page and says what to do (move the stop to after the animation has ended, or flag a settled stop of the page `pdf: true`). Leaves the playhead where it was. `pixi-effects check` runs it for any page with `stops` (it loads the page's own `pixi-effects/present`; add that line to the import map).

### Pictures of the stops and the deck as a PDF: `stopImages(movie)`, `exportPDF(movie)`

```ts
import { stopImages, exportPDF } from 'pixi-effects/present';
const pages = await stopImages(movie, { as: 'dataURL', type: 'image/jpeg', scale: 0.25 });   // one picture per PAGE: its last stop, fully built
// [{ stop, page, image }, …]; { which: 'stops' } is one per stop, { pick: 'first' } the first stop of each page; onImage(img) is called as each one is ready
const pdf = await exportPDF(movie, { title: 'My talk' });                                    // a Blob: one PDF page per page of the deck (JPEG at the canvas size)
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

### `musicEvents()`

```ts
import { musicEvents } from 'pixi-effects';
const ev = await musicEvents(music);                    // the same object the audio layer plays; BEFORE movie.init, async like musicEnvelope()
ev.tracks[0].notes[0];                                  // { beat: 0, time: 0, duration: 4, seconds: 2, bar: 1, beatInBar: 1, name: 'Am7', chord: true, midi: [57, 60, 64, 67], velocity: 0.8 }
ev.drums[0];                                            // { kind: 'kick', hits: [{ beat, time, bar, beatInBar, velocity }, ...] }
```

What a [`music`](dsl.md#music-written-as-text-music) score plays, as data: every note and chord with its `beat` and `time` (seconds from the start of the music, the tempo map applied: add the audio layer's `at` for movie time; swing and humanize are not applied), `duration`, `bar` and `beatInBar` (from `meter`, default 4), the audible `midi` pitches (`transpose` is in), the `name` **as the score wrote it** (a transposed score still says `Am7` while `midi` sounds a tone higher: caption from `midi` if you transpose), and every drum hit with the pattern repeated out. Also `bpm`, `meter`, `beats`, `bars`, `seconds` and per track `beats` / `bars`. Use it to make the picture follow the score: light the keys of the chord that sounds, caption its name, flash on the snare. A score that cannot play throws with the reason; warnings are logged as for the layer.

### `musicBuffer()`

```ts
import { musicBuffer } from 'pixi-effects';
const buffer = await musicBuffer(music, { sampleRate: 44100, duration?, loop? });                    // an AudioBuffer (stereo)
const src = audioContext.createBufferSource(); src.buffer = buffer; src.connect(audioContext.destination); src.start();
```

The sound of [`music`](dsl.md#music-written-as-text-music) as a Web Audio buffer, for a page that plays tunes without a movie (a jingle on a button, your own player). `duration` (seconds) cuts it or, with `loop: true`, repeats it up to that length; the default is the music's length plus its tail. Warnings are printed like for an audio layer; it throws, saying why, when the score cannot play. Async: the synthesiser is its own chunk.

### `movie.toggleMute(): boolean`

Flips `muted` and returns the new value.

---

## Building your own player

`Controller` is one optional player; everything it does is public on the movie, so a player of your own is plain HTML + CSS + a few handlers:

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

What you have: `play()`, `pause()`, `gotoFrame(frame)`, `volume`, `muted` / `toggleMute()`; the state `currentFrame`, `totalFrames`, `frameRate`, `duration`, `isPlaying`, `isReady`, `loadStages` (milliseconds `init()` spent in `assets` / `build` / `sound` / `frames`), `audioBlocked` (true while the browser keeps the movie's sound silent until a tap: show "tap for sound"; a tap or key press that arrives while `play()` is pending, or the next `play()` made from a tap, starts it); the events above; `render()` for a download button; `snapshot()` for a thumbnail; `timelineData()` / `timelineSvg()` for a timeline like `pixi-effects view`'s. Keep the movie's `canvas` wherever your layout wants it (the page's CSS sizes it). To only change how `Controller` looks, see **Theme** below.

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
  exportButton?: boolean;             // default true; false hides ⬇ + popover
  keyboard?: boolean;                 // default true
  presentButton?: boolean;            // default true: a movie with stops gets a Present button (marks on the seek bar are always shown)
  loopButton?: boolean;               // default true: a loop button next to the volume (and the L key) that flips movie.loop
  thumbnails?: boolean;               // default false: a small picture of the frame under the pointer above the seek bar (movie.thumbnail()); off by itself with video footage or variables
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

A misspelt key warns with the valid ones. To restyle more than the theme covers, set the `--mc-*` custom properties (or override the `.movie-controller` classes) in your own CSS.

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

Active when `keyboard: true` and the key target is not `<input>`/`<textarea>`/`<select>`/contenteditable.

| Key         | Action                                              |
| ----------- | --------------------------------------------------- |
| `Space`     | play / pause                                        |
| `←` / `→`   | step ±1 frame                                       |
| `↑` / `↓`   | volume ±5% (clears mute when increasing past zero)  |
| `M`         | toggle mute                                         |
| `L`         | toggle loop (`movie.loop`)                          |
| `Shift+E`   | export with current settings (skips the popover)    |
| `F`         | toggle fullscreen                                   |
| `Esc`       | close the export popover or exit fullscreen (browser) |

### Theming

The bar uses fixed colors (`#007AFF` for the active track / fill / confirm button, white for icons, `rgba(0,0,0,0.75)` gradient background). Override by adding stricter CSS rules under `.movie-controller`. A theming API (CSS custom properties) is on the roadmap.

## `pixi-effects/three`

Optional three.js integration, imported from its own entry so the core `pixi-effects` entry never touches three.js:

```ts
import { registerThree, three, threeGltf, threeFrameCamera, ThreeSequence } from 'pixi-effects/three';
```

**Install:** `npm i three`. `three` is a peer dependency marked optional (`peerDependenciesMeta.three.optional = true`) — consumers who never import `pixi-effects/three` are unaffected either way. A page that loads a glTF with `threeGltf` also needs `"three/addons/"` in its import map (three's `examples/jsm/`); `renderer: 'webgpu'` needs three 0.17x or later and `"three/webgpu"`.

For the `type: 'three'` spec shape (fields, keyframe paths, `followCamera` / `followLights` / `followFog`, rules), see [DSL reference § three](./dsl.md#three).

### `registerThree(options?: { renderer?: 'webgl' | 'webgpu' }): void`

Registers the `'three'` sequence type with the composition builder. Call once, before `Movie.init()` builds a composition containing a `type: 'three'` sequence. Idempotent. `renderer` is the page-level default of every three layer that names no `renderer` of its own (default `'webgl'`; the last call wins).

### `three(spec: ThreeSequenceSpec): SequenceSpec`

Typing helper — accepts a strongly-typed three spec and returns it as a plain `SequenceSpec`, so it drops straight into `composition.sequences` alongside `text` / `image` / etc. A cast only; not required for the sequence to work, but gives editor autocomplete on `setup` / `update` / `dispose`.

### `threeGltf(url: string, options?: ThreeGltfOptions): Promise<ThreeGltfModel>`

Loads a `.glb` / `.gltf` with three's `GLTFLoader` (a page that never calls it never loads the addon) for use in a three layer's `setup` / `update`. Options: `animation` (a clip name, an index, or `false` for the bind pose; default the first clip), `speed`, `offset`, `loop`. Returns `{ object, clips, size, pose(t), fit(px), dispose() }`: `object` is a `Group` whose origin is the centre of the model's bounding box; `pose(t)` poses the clip at `t × speed + offset` seconds with `AnimationMixer.setTime` (a function of the time: a seek, an export and a repeat give the same frame); `fit(px)` scales `object` so the model's longest side is `px`. Skinned meshes are drawn always (`frustumCulled = false`). A failed load names the URL; an unknown clip name lists the clips the file has. Draco / KTX2 / Meshopt files need a decoder you set up yourself (`npx pixi-effects probe model.glb` says whether a file needs one).

### `threeFrameCamera(camera, object, options?: { direction?, margin? }): void`

Puts a `PerspectiveCamera` where the whole of `object` (its bounding box now, with its scale and place) fits the frame, looking at its centre, from a three-quarter view (`direction` default `[0.45, 0.3, 1]`) with 10 % room (`margin` 1.1). Uses the camera's own `fov` and `aspect`; sets `near` and `far`.

### `ThreeSequence`

The `Sequence` subclass that backs `type: 'three'`. Exported for advanced use (e.g. `instanceof` checks). `renderer` (`'webgl'` / `'webgpu'`) and `backend` (`'webgl'` / `'webgpu'` / `'webgl2'`: three's WebGPURenderer found no WebGPU and used its WebGL2 backend) say what drew it once it is built; `checkDeterminism(times)` is what `check` and `movie.review()` call to hold the layer to "a function of the time".

### Exported types

```ts
import type { ThreeContext, ThreeSetupResult, ThreeSequenceSpec, ThreeGltfModel, ThreeGltfOptions, ThreeFrameCameraOptions, ThreeRendererKind } from 'pixi-effects/three';
```

| Type                | Notes                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| `ThreeContext`      | `{ scene, camera, renderer, width, height, space? }` handed to `setup` / `update` / `dispose`; `renderer` is a `WebGLRenderer` or a `WebGPURenderer`; `space` is the composition's camera, lights and fog when the layer follows them. |
| `ThreeSetupResult`  | `{ objects?, camera? }` returned from `setup`.                                 |
| `ThreeSequenceSpec` | the `type: 'three'` sequence spec.                                             |
| `ThreeGltfModel`, `ThreeGltfOptions`, `ThreeFrameCameraOptions` | what `threeGltf` and `threeFrameCamera` take and return. |
| `ThreeRendererKind` | `'webgl' \| 'webgpu'`.                                                         |
