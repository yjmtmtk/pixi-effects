# pixi-effects cheatsheet

A video is **data**: a tree of plain objects. Everything below is a JS object you put in `composition.sequences`. Build repeated structure with JS functions and loops; the spec is just objects.

## Conventions (state once, never guess)

| Thing | Rule |
|---|---|
| Canvas | pixels, origin top-left, `+x` right, `+y` down. Typical: 1280×720 @ 30 fps |
| Angles | **degrees**: `rotation`, `skew*`, `rotationX`, `rotationY` |
| Depth (`z`) | `+z` toward the viewer (bigger, nearer) |
| Numbers | any number may be an **expression string**: `'GW/2 - w/2'`, `'min(W,H)*0.4'` (build-time only; no per-frame time variable). Functions: `min max abs floor ceil round sqrt pow sin cos tan lerp clamp smoothstep mod step`, `PI`, and **seeded** `rand(seed)` (0…1) / `noise(x, seed)` (−1…1): give each layer its own seed, never `Math.random()` |
| Colours | `'#rrggbb'` strings or numbers; text colour is `style.fill`, shape colour is `fillColor`/`strokeColor`, image colour is `tint` |
| Z-order | **array order**, later = on top. A layer is hidden (not removed) outside `[at, at+duration)` and keeps its last values |
| Time of a sequence's `at` | seconds from the start of its **parent composition** (default 0) |
| Time of a keyframe's `at` | seconds from the start of **its own layer**; **negative = back from the layer's end** |
| Time of a transition's `at` | seconds from the start of the **parent composition**; negative = back from its end |
| `duration` | defaults to the parent composition's duration |

## Expressions

Operators `+ - * /`, parentheses, unary `-`. Functions `min max abs floor ceil round sqrt pow sin cos tan` (radians; there is **no `pi`**: write `3.14159`).

| Variable | Meaning |
|---|---|
| `W`, `H` | parent composition size |
| `GW`, `GH` | root (movie) size |
| `w`, `h` | this layer's own size (image/video natural size, text size **after** its style is applied, shape bounds) |
| `cover`, `contain` | scale that makes the layer cover / fit the parent (`scale: 'cover'`) |
| `t`, `d`, `T` | layer start time, layer duration, parent duration |

## Common fields (every layer)

```
name, at, duration,
initial: { ...props applied before any keyframe },
keyframes: [ { at, duration, ease, set | to | from | (from + to), repeat?, yoyo?, repeatDelay? } ],
filters: [ { type: 'chromaKey', keyColor, threshold, smoothing, spill } | { type: 'glow', name?, outerStrength: 3, color: '#ffd166' } /* any named filter, see below */ | { type: 'custom', name, filter: <Pixi Filter> } ],
mask: <a layer spec>, maskInverted,   // a mask with no `at` of its own starts and ends with the layer it masks (its keyframes count from that layer's start); an explicit mask `at` is composition time
filterArea: { x, y, width, height }   // in the layer's OWN coordinates; lets blur/glow draw past the layer's bounds
threeD: true                          // opt into 2.5D (see below)
blendMode: 'normal' | 'add' | 'screen' | 'multiply'   // add / screen brighten (glows, light leaks: overlapping halos add up); on a composition its children inherit the mode
```

Animatable props (`initial` / keyframes): `x y alpha rotation scale scaleX scaleY pivotX pivotY anchorX anchorY skewX skewY tint width height visible autoAlpha`, plus for shapes their style/geometry, for text `fill`, for audio `volume`, for 3D `z rotationX rotationY`, filter params as `'filters.<name>.<param>'`, three objects as `'three.<obj>.<path>'`.

Keyframe kinds: `set` (jump at `at`; undone when you seek back), `to` (animate to), `from` (animate from), `from`+`to`. `from` / `from+to` show their start value from the layer's start, so a delayed fade-in needs no `initial.alpha`. `repeat` (finite extra plays), `yoyo`, `repeatDelay` loop any of them (endless repeats are not allowed). `ease` = any GSAP ease (`'none'`, `'power2.out'`, `'expo.out'`, `'back.out(1.7)'`, `'elastic.out(1,0.5)'`, `'sine.inOut'`, `'bounce.out'`…). Default ease is linear.

## Layer types

**text** — `text`, `style` (any PixiJS TextStyle field: `fontSize fontFamily fontWeight fill letterSpacing lineHeight align wordWrap wordWrapWidth stroke dropShadow padding`; expressions OK for numbers), `colorSpace`. Default anchor is **top-left**; use `anchorX/anchorY: 0.5` to centre on `x,y`. A text layer has one animatable number, `value`, printed where the text contains `{value}` (`text: '{value} users'`, `initial: { value: 0 }`, keyframe `to: { value: 2480 }`; `format: { decimals, grouping, pad /* zero-pad the whole part: pad 2 → 05 */ }`) — that is how counters work. **Changing text:** a keyframe `set: { text: 'Two' }` swaps the string at that time (undone on seek back; `to` / `from` cannot tween a string); `visibleChars` (number, first N characters; starts at 0 once animated) is a typewriter: `to: { visibleChars: 30 }, duration: 2.4, ease: 'none'` — use `anchorX: 0` + `style.align: 'left'` so it grows rightward. Multi-line text is centre-aligned by default (`style.align: 'left'` to change).

**image** — `asset`, `tint`, `colorSpace: 'rgb'|'oklab'|'oklch'`. Default anchor top-left; natural size = `w`,`h`.

**video** — `asset`, `loop`, `audio`, `volume`; `initial: { scale: 'cover' }`.

**audio** — a file: `asset`, `loop`, `volume`; `volume` (top level, or in `initial` like every other layer's starting values); fade with volume keyframes (`{ at: -2, to: { volume: 0 }, duration: 2 }` fades the last 2 s). Omit `duration` for a one-shot clip: it lasts exactly as long as the clip. With `loop: true` and no `duration` it lasts until the composition ends. An explicit `duration` longer than the clip goes silent after the clip unless `loop: true`.
**Or a sound effect with no file — `sfx`:** `{ type: 'audio', sfx: 'swoosh', at: 2 }` is the whole thing. Presets, default length in s: `click` 0.04 · `pop` 0.12 · `swoosh` 0.5 (loudest 0.16 s in, moves left → right) · `swipe` 0.22 · `hit` 0.7 · `riser` 1 (loudest at its END: `at = hit − duration`) · `chime` 1.4 · `beep` 0.16 · `coin` 0.4 · `glitch` 0.35 · `typewriter` 0.06. Knobs: `sfx: { preset, pitch /* semitones ±24 */, brightness /* −1 dark … 1 bright */, seed /* another take */ }`. **The layer's `duration` IS the sound's length** (omit it; set it to stretch, e.g. a riser); `volume` is its level (1 = the preset's standard level, peaking at −12 … −18 dBFS by preset). No `loop`: one layer per hit (a JS loop). Custom sound: `sfx: { voices: [{ wave: 'noise' | 'sine' | 'square' | 'saw' | 'triangle', freq: 440 | [from, to], filter: { type: 'lowpass' | 'highpass' | 'bandpass', freq: [from, to] }, envelope: 'fall' | 'bell' | 'swell' | 'hold', pan: [-1, 1] }] }`. The export (mp4 / webm / mov) encodes this same mix (lossy AAC / Opus), on time within a few ms.

**shape** — `shape: 'rect' | 'circle' | 'ellipse' | 'arc' | 'line' | 'polygon' | 'path'`:

| shape | geometry (top level **or** in `initial`) |
|---|---|
| rect | `width height cornerRadius anchorX anchorY` |
| circle | `radius anchorX anchorY` |
| ellipse | `radiusX radiusY anchorX anchorY` |
| arc | `radius innerRadius startAngle endAngle` — degrees, **0° = 3 o'clock, clockwise**; centred on `x, y`; stroke only = an open arc line (`strokeCap: 'round'`), with a fill = a sector, with `innerRadius` = a donut slice; a sweep ≥ 360° = a full circle. A progress ring: `startAngle: -90` and animate `endAngle` from −90 to 270 |
| line | `from: [x,y]  to: [x,y]` — plain canvas coordinates (omit `x,y`; if you give them they place the line's midpoint). Stroke in `initial`: `strokeColor`, `strokeWidth` |
| polygon | `points: [[x,y],…]  open` — canvas coordinates like `line` |
| path | `d` (SVG path data) — canvas coordinates like `line`. **Morph:** `morphTo: 'M…Z'` + animate `morph` 0 → 1 (points half way between, closed outlines lined up so they do not twist; `morphPoints` 8–2048) |

**Draw-on:** every shape but `arc` has `trimStart` / `trimEnd` (0–1 of the outline, default 0 / 1, animatable): `trimEnd: 0` + keyframe `to: { trimEnd: 1 }` draws a line / border / path on; `trimStart` 0 → 1 after it wipes it off; both = a travelling dash. The fill is NOT trimmed. Rect outline starts top-left, circle / ellipse at 12 o'clock, both clockwise. Use `strokeCap: 'round'`.

Style (`initial` / keyframes): `fillColor fillAlpha strokeColor strokeAlpha strokeWidth`; `colorSpace: 'oklab'|'oklch'` for clean colour tweens. rect/circle/ellipse are **centred on `x,y` by default** (`anchorX/anchorY` default 0.5): for a bar growing from its base use `anchorY: 1` (or `anchorX: 0` for left-to-right). **`fillGradient`** (top level or `initial`; instead of `fillColor`): `{ type?: 'linear'|'radial', stops: [[0, '#000'], [1, 'rgba(0,0,0,.6)']], angle? /* linear, deg, 90 = top→bottom */, center?, innerRadius?, radius? /* radial, 0–1 of bounds */ }` — stops may have alpha, so a radial transparent→dark is a vignette. Stroke ends and corners: `strokeCap: 'butt'|'round'|'square'`, `strokeJoin: 'miter'|'round'|'bevel'` (top level or in `initial`; not animated — `round` keeps sharp corners like an M from poking out).

**composition** — `width height duration sequences transitions`. With `threeD: true` it is a **card**: its children are drawn into one texture (content outside its `width × height` is clipped: size it for a soft shadow too; a plain 2D composition does not clip, but is skipped when its whole rectangle is off screen) and move / rotate in depth together. Children use the composition's local coordinates and times. Position/rotate/scale it as a unit; to rotate/scale about its centre set `pivotX/pivotY` to the centre and `x/y` to where that point should sit.

**null + `parent`** — `{ type: 'null', name: 'rig', initial: { x, y }, keyframes: [...] }` draws nothing; layers with `parent: 'rig'` are drawn inside it and follow its `x y rotation scale skew alpha pivotX pivotY`. Their `x / y` are measured **from the null's origin** (null at (640,360), child `x: 200` → drawn at 840), so rotating the null makes the child circle it. Nulls chain (`parent` on a null). Children are drawn at the null's place in the stack, together. Only `null` layers can be parents; not for `threeD` layers; a mask follows its layer.

**camera** (2.5D) — props in `initial`/keyframes: `x y z lookAtX lookAtY lookAtZ fov` (defaults: centred, looking at the z = 0 plane, `fov` 40, `z` auto = `(H/2)/tan(fov/2)` ≈ 989 at 720p). Never on the camera object itself. An orbit is `orbit()`; by hand: `x = cx + R·sin θ`, `z = R·cos θ`, `R = (H/2)/tan(fov/2)`, `lookAt` = the centre at `z = 0`.

**three** (optional entry `pixi-effects/three`) — `three({ type:'three', width, height, setup(ctx) { …; return { objects: { knot } } }, update?, dispose? })`; drive with `'three.knot.rotation.y'` keyframes. Call `registerThree()` before `init`.

## 2.5D in one paragraph

Add `threeD: true` to any visual layer, then use `z`, `rotationX`, `rotationY` (centre rotation with `anchorX/Y: 0.5` or `pivotX/Y`). Add a `{ type: 'camera' }` layer for a view. A `threeD` layer at `z: 0` with the default camera looks identical to a 2D one. Consecutive `threeD` layers are drawn farthest-first (equal `z` keeps array order); non-`threeD` layers ignore the camera and keep array order. Layers at/behind the camera plane are hidden. Not supported on `threeD` layers: masks, transitions, `filterArea`.

## Poster

`movie.init({ …, poster: 9.5 })` names the moment (seconds; negative = from the end) that stands for the movie: the canvas shows it before play (the playhead stays at 0, play starts from 0), `movie.poster` / `movie.posterFrame` read it, `await movie.posterImage({ as: 'dataURL', type: 'image/jpeg', scale: 0.5 })` is the picture. Pick the most striking moment, not frame 0 (which is often black).

## Player

`new Controller(movie, { canvas, theme: { accent: '#ff4d6d' } })` (import from `pixi-effects/controller`; theme keys `accent foreground track barBackground trackHeight font`, or CSS `--mc-accent` …; `controller.setTheme(…)`). Your own player: `movie.play() pause() gotoFrame(f) volume muted toggleMute()`, state `currentFrame totalFrames frameRate duration isPlaying`, events `ready frame play pause ended seeking seeked volumechange error progress` (`<video>` names). `examples/15-custom-player.html` is a complete one.

## Filters by name (no import)

`filters: [{ type: 'glow', name: 'halo', outerStrength: 3, color: '#ffd166' }]` — `type` = the pixi / pixi-filters class name without `Filter`, camelCase (`glow dropShadow outline blur noise alpha adjustment hslAdjustment grayscale pixelate crt rgbSplit oldFilm glitch bulgePinch twist zoomBlur kawaseBlur radialBlur motionBlur emboss ascii colorOverlay advancedBloom bevel dot crossHatch tiltShift …`), the other keys are its options. `colorMatrix` takes `preset: 'sepia'|'grayscale'|'negative'|'polaroid'|'technicolor'|'vintage'|'kodachrome'|'browni'`. Name it to animate: `'filters.halo.outerStrength'` (scalars only; `pixelate` via `sizeX`/`sizeY`). Options: `glow` distance outerStrength innerStrength color alpha · `dropShadow` offset{x,y} blur alpha color · `outline` thickness color · `blur` strength · `adjustment` gamma contrast saturation brightness · `hslAdjustment` hue lightness saturation · `pixelate` size · `crt` curvature lineWidth noise vignetting · `rgbSplit` red/green/blue {x,y} · `oldFilm` sepia noise scratch vignetting · `glitch` slices offset · `twist` radius angle offset · `bulgePinch` center radius strength · `zoomBlur` strength center innerRadius · `colorOverlay` color alpha · `colorGradient` gradientType('linear'|'radial'|'conic') stops[{offset,color,alpha}] angle · `colorReplace` originalColor targetColor tolerance · `convolution` matrix(9) · `shockwave` / `godray` are driven by `time` (animate it) · `colorMap` / `simpleLightmap` need a texture (use `custom`). **Centres/offsets are CANVAS pixels** (default top-left corner): put them on the layer. Glow / shadow / blur draw outside the layer: widen `filterArea` (not for `grayscale` / `oldFilm`, which fill the margin black). Full table: `docs/dsl.md` → Named filters.

## Transitions (on the parent composition)

```js
transitions: [{ kind: 'crossfade' | 'wipe' | 'iris' | 'slide' | 'dip' | 'zoom' | 'dissolve',
                from: 'nameA', to: 'nameB', at: 3, duration: 1, ease: 'none',
                direction: 'left|right|up|down' /* wipe, slide */, mode: 'in|out' /* iris, zoom */,
                smoothing, fromScale /* zoom */, scale, seed /* dissolve */ }]
```
`from`/`to` are sibling layer `name`s, `to` declared after `from`, and both layers must be alive for the whole window (overlap them by `duration`). Only those two layers are affected; every other layer stays put. Wipe/iris/dissolve/zoom wrap the layers for you.

## Presets

```js
import { kenBurns, withFade, wiggle, stagger, followPath, particles, deck, audioEnvelope, bpmEnvelope, react, random } from 'pixi-effects';
kenBurns({ asset, name, at, duration, motion: 'still'|'scale'|'rotation'|'position',
           fit: 'cover'|'contain', ease, /* scale */ origin, zoom, direction, /* rotation */ angle, /* position */ from, to })
withFade(spec, { in: 0.5, out: 0.5 })   // alpha fade; `out` needs spec.duration
orbit({ duration: 6, degrees: 40 /* , radius, center, start, fov, ease, at */ })   // a camera layer that circles a point
// a seeded shake as keyframes (spread into a layer's keyframes); each prop moves on its own; ends back at `around`
keyframes: [...wiggle({ duration: 6, freq: 4, seed: 3, props: { x: { around: 'GW/2', amp: 6 }, rotation: { around: 0, amp: 1.5 } } })]
stagger(8, { each: 0.08 /* or amount: total s */, from: 'start'|'end'|'center'|'edges'|'random'|index, grid: [cols, rows], ease, seed })   // → delays [0, 0.08, …]: `at: 1 + d[i]`
stagger(layers, { each: 0.05, from: 'center' })   // → the same layers with `at` pushed back (originals untouched)
keyframes: followPath({ d: 'M 120 560 C 360 120 920 120 1160 560', duration: 4, ease, orient: true /* faces the way it goes; rotate: -90 for an up-pointing image */, from: 0, to: 1, frameRate: 30 /* = the movie's */ })   // x / y (and rotation) along an SVG path; give the layer its own `at`
...particles({ count: 90, at: 2, emit: 0 /* 0 = burst; or seconds to spread births */, life: [1, 1.8], area: { x: 640, y: 330 /*, width, height */ }, angle: [0, 360] /* 0 right, 90 down, −90 up */,
               speed: [120, 420], gravity: 240, wind: 0, drag: 1.2, sway: { amp: 30, freq: 0.6 }, size: [2, 4.5], scale: [1, 0], fade: { in: 0.2, out: 0.6 },
               colors: ['#ffd166', '#ff6b9d'], shape: 'circle'|'rect'|'star', spin: [-200, 200], blendMode: 'add', seed: 1, name: 'burst', template: { type: 'image', asset } })   // seeded layers, paths baked into keyframes
// a presentation: stops pause playback (`composition.stops: [2, { at: 5, page: 'Name', notes, advance, pdf }]`; `pdf: true` = the stop that pictures its page in a PDF, `pdf: false` = keep it out; default the page's last stop; a `page` stop begins a page, the others are steps); deck() lays pages out
await movie.init({ canvas, width, height, frameRate, ...deck({ transition: { kind: 'slide', direction: 'left', duration: 0.6 },
  pages: [{ name: 'Hello', duration: 3.2 /* last stop + transition */, stops: [2.6] /* page-local */, notes, sequences: [ /* page-local time; a step = a layer starting at the previous stop */ ] }] }) });
new Presenter(movie, { canvas });         // import { Presenter } from 'pixi-effects/presenter': → ↓ Space Enter click = next, ← = back, Home / End, number+Enter, B / W, F, ?
movie.next() / prev() / goToStop(i) / goToPage(n) / movie.stops / movie.on('stop', …)   // Controller: marks on the seek bar, play / Space / click = play to the next stop (pauseAtStops: false = straight through), a Present button, PDF in the download panel
// Presenter extras: G = page overview (pictures), P = presenter view (a second window: live picture, next picture, notes, timer); start() makes the pictures before the audience sees anything
await movie.stopImages({ as: 'dataURL', scale: 0.25 }) // [{ stop, page, image }] one per page (its last stop); { which: 'stops' } one per stop (a page's picture honours `pdf` flags)
await movie.inspectStops()                             // { stops, issues }: stops whose picture is still changing (a stop landing before its animation ends); the check lists them
await movie.exportPDF({ title })                       // Blob: a PDF page per page of the deck; CLI: pixi-effects-render talk.html -o talk.pdf (--all-stops)
const env = await audioEnvelope('music.mp3', { frameRate: 30 })   // BEFORE movie.init: .series.level|bass|mid|treble (0–1 per frame), .beats [s], .bpm, .at(t, band); bands: { name: [Hz, Hz] }
const env = bpmEnvelope(120, { duration: 12 })                     // no audio file: kick / snare / hats exactly on a tempo
keyframes: react(env, { duration: 12, props: { scale: { base: 1, amount: 0.4, band: 'bass', attack: 0.02, release: 0.2 }, alpha: { base: 0.4, amount: 0.6, beats: true, decay: 0.15 } }, audioOffset: 0, loop: false })
const r = random(7); r(); r();      // a repeatable stream in 0…1 for JS loops (never Math.random())
```
`kenBurns` covers the canvas, so source images should be at least canvas-sized (1920×1080 for 1280×720).

```js
import { measureText, splitText, animateText } from 'pixi-effects';   // text layout helpers (measured with the renderer's own fonts)
measureText('Hello', style)                              // → { width, height, lines }
splitText('Hello world', style, { by: 'chars' | 'words' | 'lines', x, y, align: 'left' | 'center' | 'right' })
                                                         // → [{ text, x, y, width, index, line }] — one text layer per piece, same style, anchor top-left
```
Per-letter / per-word / per-line animation in one call: `...animateText(text, style, { x, y, align, by: 'chars'|'words'|'lines', at, duration /* required: until the last piece is gone */, in: 'rise'|'drop'|'fade'|'pop'|'zoom'|'slide'|'spin'|{ from, to, duration, ease }|false, out: <same, runs in the same wave>, stagger: { each, from, … }, idle: { y: 4, rotation: 1 }, styleFor: p => ({ fill }) })` → text layers `<name>-0…` (anchor centre; `x`/`y` in `from` are offsets) to spread into `sequences` (recipe `animate-text`). By hand: `splitText(...)` + one layer per piece (recipe `split-text`). A web font must be loaded before measuring.

## Assets

`assets: [{ name, src }]` in `movie.init` (images, audio, video). `src` may be a URL or a `data:`/`blob:` URL (e.g. `canvas.toDataURL()`).

## Movie API

```js
const movie = new Movie();
await movie.init({ canvas, width, height, duration, frameRate, background, assets, composition });
movie.play(); movie.pause();
await movie.gotoFrame(n, true);                 // seek (frames; 30 fps => t = n/30)
const blob = await movie.render({ format: 'mp4' });   // 'mp4' | 'webm' | 'mov' | 'mkv'; ~real-time. Fast motion: `movie.init({ motionBlur: true })` (8 samples, 180° shutter; or a number / { samples: 2–64, shutter: 0–1 }) blurs render / snapshot / contactSheet, not live playback; a render takes `samples`× as long
movie.on('progress', e => e.progress /* 0–100 */);
movie.audioBuffer                                // mixed audio (after init), if any audio layers
await movie.contactSheet({ count: 6, as: 'dataURL' })   // ONE image of several labelled frames — look at it. Options: frames | times | count, columns, cellWidth, as
await movie.snapshot(60, { as: 'dataURL' })             // one frame, canvas only (no player bar) — use it for detail; sheet tiles are small
await movie.inspect(60, { layers: 'none' })             // issues only (default lists the visible layers); text off-canvas / cut off / empty / overlapping text. Name your layers so paths are readable
movie.inspectAudio()                             // the soundtrack as numbers — you cannot listen: sources[i] = { layer, start, end, peakDb, sound: { length, peakDb, loudestAt, brightnessHz } }, windows (rms / peak / brightness per 0.1 s), issues (limited mix, inaudible / cut-off sounds)
new Controller(movie, { canvas })                // optional player bar (overlays the canvas bottom ~60px; not in the export)
```
