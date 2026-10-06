# pixi-effects cheatsheet

A video is **data**: a tree of plain objects. Everything below is a JS object you put in `composition.sequences`. Build repeated structure with JS functions and loops; the spec is just objects.

## Conventions (state once, never guess)

| Thing | Rule |
|---|---|
| Canvas | pixels, origin top-left, `+x` right, `+y` down. Typical: 1280×720 @ 30 fps |
| Angles | **degrees**: `rotation`, `skew*`, `rotationX`, `rotationY` |
| Depth (`z`) | `+z` toward the viewer (bigger, nearer) |
| Numbers | any number may be an **expression string**: `'GW/2 - w/2'`, `'min(W,H)*0.4'` (build-time only; no per-frame time variable) |
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
filters: [ { type: 'chromaKey', keyColor, threshold, smoothing, spill } | { type: 'custom', name, filter: <Pixi Filter> } ],
mask: <a layer spec>, maskInverted,
filterArea: { x, y, width, height }   // in the layer's OWN coordinates; lets blur/glow draw past the layer's bounds
threeD: true                          // opt into 2.5D (see below)
```

Animatable props (`initial` / keyframes): `x y alpha rotation scale scaleX scaleY pivotX pivotY anchorX anchorY skewX skewY tint width height visible autoAlpha`, plus for shapes their style/geometry, for text `fill`, for audio `volume`, for 3D `z rotationX rotationY`, filter params as `'filters.<name>.<param>'`, three objects as `'three.<obj>.<path>'`.

Keyframe kinds: `set` (jump), `to` (animate to), `from` (animate from), `from`+`to`. `repeat` (finite extra plays), `yoyo`, `repeatDelay` loop any of them (endless repeats are not allowed). `ease` = any GSAP ease (`'none'`, `'power2.out'`, `'expo.out'`, `'back.out(1.7)'`, `'elastic.out(1,0.5)'`, `'sine.inOut'`, `'bounce.out'`…). Default ease is linear.

## Layer types

**text** — `text`, `style` (any PixiJS TextStyle field: `fontSize fontFamily fontWeight fill letterSpacing lineHeight align wordWrap wordWrapWidth stroke dropShadow padding`; expressions OK for numbers), `colorSpace`. Default anchor is **top-left**; use `anchorX/anchorY: 0.5` to centre on `x,y`. A text layer has one animatable number, `value`, printed where the text contains `{value}` (`text: '{value} users'`, `initial: { value: 0 }`, keyframe `to: { value: 2480 }`; `format: { decimals, grouping }`) — that is how counters work. Other content cannot change over time.

**image** — `asset`, `tint`, `colorSpace: 'rgb'|'oklab'|'oklch'`. Default anchor top-left; natural size = `w`,`h`.

**video** — `asset`, `loop`, `audio`, `volume`; `initial: { scale: 'cover' }`.

**audio** — `asset`, `loop`, `volume`; fade with volume keyframes. **A file shorter than the layer goes silent unless `loop: true`.**

**shape** — `shape: 'rect' | 'circle' | 'ellipse' | 'line' | 'polygon' | 'path'`:

| shape | geometry (top level **or** in `initial`) |
|---|---|
| rect | `width height cornerRadius anchorX anchorY` |
| circle | `radius anchorX anchorY` |
| ellipse | `radiusX radiusY anchorX anchorY` |
| line | `from: [x,y]  to: [x,y]` — plain canvas coordinates (omit `x,y`; if you give them they place the line's midpoint). Stroke in `initial`: `strokeColor`, `strokeWidth` |
| polygon | `points: [[x,y],…]  open` — canvas coordinates like `line` |
| path | `d` (SVG path data) — canvas coordinates like `line` |

Style (`initial` / keyframes): `fillColor fillAlpha strokeColor strokeAlpha strokeWidth`; `colorSpace: 'oklab'|'oklch'` for clean colour tweens. rect/circle/ellipse are **centred on `x,y` by default** (`anchorX/anchorY` default 0.5): for a bar growing from its base use `anchorY: 1` (or `anchorX: 0` for left-to-right). **`fillGradient`** (top level or `initial`; instead of `fillColor`): `{ type?: 'linear'|'radial', stops: [[0, '#000'], [1, 'rgba(0,0,0,.6)']], angle? /* linear, deg, 90 = top→bottom */, center?, innerRadius?, radius? /* radial, 0–1 of bounds */ }` — stops may have alpha, so a radial transparent→dark is a vignette.

**composition** — `width height duration sequences transitions`. With `threeD: true` it is a **card**: its children are drawn into one texture and move / rotate in depth together. Children use the composition's local coordinates and times. Position/rotate/scale it as a unit; to rotate/scale about its centre set `pivotX/pivotY` to the centre and `x/y` to where that point should sit.

**camera** (2.5D) — props in `initial`/keyframes: `x y z lookAtX lookAtY lookAtZ fov` (defaults: centred, looking at the z = 0 plane, `fov` 40, `z` auto = `(H/2)/tan(fov/2)` ≈ 989 at 720p). Never on the camera object itself. An orbit is `orbit()`; by hand: `x = cx + R·sin θ`, `z = R·cos θ`, `R = (H/2)/tan(fov/2)`, `lookAt` = the centre at `z = 0`.

**three** (optional entry `pixi-effects/three`) — `three({ type:'three', width, height, setup(ctx) { …; return { objects: { knot } } }, update?, dispose? })`; drive with `'three.knot.rotation.y'` keyframes. Call `registerThree()` before `init`.

## 2.5D in one paragraph

Add `threeD: true` to any visual layer, then use `z`, `rotationX`, `rotationY` (centre rotation with `anchorX/Y: 0.5` or `pivotX/Y`). Add a `{ type: 'camera' }` layer for a view. A `threeD` layer at `z: 0` with the default camera looks identical to a 2D one. Consecutive `threeD` layers are drawn farthest-first (equal `z` keeps array order); non-`threeD` layers ignore the camera and keep array order. Layers at/behind the camera plane are hidden. Not supported on `threeD` layers: masks, transitions, `filterArea`.

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
import { kenBurns, withFade } from 'pixi-effects';
kenBurns({ asset, name, at, duration, motion: 'still'|'scale'|'rotation'|'position',
           fit: 'cover'|'contain', ease, /* scale */ origin, zoom, direction, /* rotation */ angle, /* position */ from, to })
withFade(spec, { in: 0.5, out: 0.5 })   // alpha fade; `out` needs spec.duration
orbit({ duration: 6, degrees: 40 /* , radius, center, start, fov, ease, at */ })   // a camera layer that circles a point
```
`kenBurns` covers the canvas, so source images should be at least canvas-sized (1920×1080 for 1280×720).

## Assets

`assets: [{ name, src }]` in `movie.init` (images, audio, video). `src` may be a URL or a `data:`/`blob:` URL (e.g. `canvas.toDataURL()`).

## Movie API

```js
const movie = new Movie();
await movie.init({ canvas, width, height, duration, frameRate, background, assets, composition });
movie.play(); movie.pause();
await movie.gotoFrame(n, true);                 // seek (frames; 30 fps => t = n/30)
const blob = await movie.render({ format: 'mp4' });   // 'mp4' | 'webm' | 'mov' | 'mkv'; ~real-time
movie.on('progress', e => e.progress /* 0–100 */);
movie.audioBuffer                                // mixed audio (after init), if any audio layers
await movie.contactSheet({ count: 6, as: 'dataURL' })   // ONE image of several labelled frames — look at it. Options: frames | times | count, columns, cellWidth, as
await movie.snapshot(60, { as: 'dataURL' })             // one frame, canvas only (no player bar) — use it for detail; sheet tiles are small
await movie.inspect(60, { layers: 'none' })             // issues only (default lists the visible layers); text off-canvas / cut off / empty / overlapping text. Name your layers so paths are readable
new Controller(movie, { canvas })                // optional player bar (overlays the canvas bottom ~60px; not in the export)
```
