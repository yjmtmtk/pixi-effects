# The `canvas` layer (0.37)

Status: DRAFT 2026-10-14, for the owner's review. Agreed in conversation: the layer is named `canvas`; it draws into its OWN canvas and is placed in the layer stack like an image (it does not draw on what is below it). **Nothing else is built.** A plugin framework, a registry, `name` / `purpose` fields and collecting tools were considered and dropped on 2026-10-14: a layer that can draw anything makes plugins unnecessary, and the traces the AI leaves (the page, its `draw` code, its notes) already say what was missing, so promoting a recurring need into the core is done by reading the trial outputs, with no extra fields and no tools.

Evidence (the 18 Opus authors of 2026-10-13, and the two re-make experiments U1 / U2): the missing thing is not a filter or an ease but "let me draw this myself". What the authors did instead: five delayed copies of a dot for an afterimage (U2); 100 hand-keyframed rings for tree rings (T31); 15 layers and their keyframes for a pendulum wave (T34); a canvas drawn into a `data:` image that could not move (T25, T35); `Rough.js` / `d3` output pasted as path data (S15, `d3-story`); a pixel-art bake at 4x (T25); a 140-keyframe `set` list for a clock (T22). Each of these is a few lines of drawing code that is a function of the time.

## 1. The common case (one line for the AI)

```js
{ type: 'canvas', width: 800, height: 450, duration: 4,
  draw: (ctx, t, info) => { ctx.fillStyle = '#ff4f1a'; ctx.beginPath(); ctx.arc(400 + 300 * Math.sin(t * 2), 225, 40, 0, Math.PI * 2); ctx.fill(); },
  initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 } }
```

It is a layer like any other: `name`, `at`, `duration`, `initial`, `keyframes`, `filters`, `mask`, `blendMode`, `parent`, `threeD`, a transition, a matte, an export. Only its picture comes from your function.

## 2. What it is (principles 1, 2, 4, 7 of `docs/philosophy.md`)

- **One display object (principle 7).** The layer owns a private canvas of `width × height` (default: the parent composition's size) and shows it as a sprite. It sits in the stack at its place: later layers cover it, earlier ones are under it. It **cannot see or paint on what is below** (the stage is drawn by the GPU, not by a 2D context); that is the job of `filters`, a matte, or an adjustment composition. Said in the docs in one sentence.
- **One vocabulary (principle 2).** Position, scale, rotation, alpha, `mask`, `filters`, `blendMode`, `keyframes` are the layer's own and work as on an image. No second animation system.
- **A function of time (principle 4).** The canvas is **cleared before every call** and `draw` is called with the layer's own time `t` (seconds since the layer started). The same `t` and the same `params` must give the same pixels, in playback, in a seek and in an export. No state survives from one frame to the next (a trail is drawn from the positions of the past, not from the last picture).
- **Code in the spec, said openly.** A `canvas` layer holds functions, so a spec that has one is no longer pure JSON. This is the same standing as `type: 'three'` and `{ type: 'custom' }` filters: an escape hatch, documented as such. The data-only way to use one is by name, through a plugin (§5).

## 3. The layer

| Key | Meaning |
|---|---|
| `type: 'canvas'` | |
| `draw(ctx, t, info)` | **required.** Draws the picture at `t`. `ctx` is the 2D context of the layer's canvas, already cleared; the coordinate system is the layer's own pixels (`0..width`, `0..height`), `resolution` is already applied (a `ctx.scale`). |
| `setup(info) → state` | optional, may be async, called once at build: heavy preparation (a precomputed simulation, a parsed table, a loaded font). Its result is `info.state`. |
| `width`, `height` | pixels or expressions (`'GW * 0.5'`); default the parent's size. At most 8192 each; a bigger one warns and is clamped. |
| `resolution` | 0.25 to 4, default 1: how many canvas pixels per layer pixel. Text and fine lines under a camera push-in need 2 or more. |
| `params` | an object of numbers that **keyframes can animate**: `keyframes: [{ at: 0, to: { 'params.amount': 1 }, duration: 2 }]`. Passed as `info.params`. The same mechanism as `uniforms` of the `shader` layer, so the data side can still drive the picture. |
| `seed` | integer, default 0: seeds `info.random()`. |
| `smoothing` | `true` (default) or `false` (`imageSmoothingEnabled`, hard pixels for pixel art). |

`info` = `{ frame, duration, progress (0..1), width, height, resolution, frameRate, params, state, random }`. `random()` is a seeded generator whose sequence restarts at every call of `draw` (the same frame draws the same numbers); for a value that must differ from frame to frame, derive it from `t`. `Math.random`, `Date.now`, `performance.now` and `new Date()` are not available to a deterministic layer: see §4.

How it is made (built on what `shader` already does): a `Sprite` whose texture is the layer's own canvas, redrawn in `awaitFrameAt(local)` (the one frame path playback and export share) and uploaded with `texture.source.update()`. A frame is drawn once per distinct `(t, params)`; a frame is drawn once per distinct `(t, params)` in a row: the same frame asked again immediately is not redrawn.

## 4. Mistakes are said at build time (the gate)

- `draw` missing or not a function: a warning naming the layer; the layer draws a loud checkerboard, like the shader layer.
- `draw` throws: warned once per layer with the message and the frame; that frame shows the checkerboard; the movie goes on.
- **Not deterministic.** `check` calls `draw` twice at the same `t` for a few moments of every canvas layer and compares the pixels: a difference is a warning that names the layer and the moments ("the picture changes between two calls at the same time: draw uses Math.random, Date.now or state that outlives the call"). A static scan of `draw.toString()` warns early for `Math.random(`, `Date.now(`, `performance.now(`, `new Date(`. The scan can be wrong: the pixel comparison is the authority.
- `width` / `height` of 0, negative or NaN, `resolution` out of range, an unknown key (did-you-mean), `params` that is not an object or has a non-number: each said once.
- **Stateful simulations.** The docs and `help canvas` give the one pattern: compute the whole simulation in `setup` into an array indexed by frame, and read `state[info.frame]` in `draw` (a Game of Life, a physics sim, a growth process). The cost is memory.
- Fonts: `ctx.font` uses system fonts, or a web font that has been loaded before `movie.init` (`await document.fonts.load(...)`), as for every text in the library.
- Cost: `draw` runs for every frame that changes; a slow `draw` slows the export in proportion.

## 5. What is deliberately not in this version

- **Plugins, registries, `plugin check`, manifests, collecting and similarity tools.** A `canvas` layer is the escape hatch; reuse inside a work is a JavaScript function, and between works it is copy and paste. If trials show a need for named, shareable layers, that is a later, small addition (`registerSequenceType` already exists inside).
- **Fields that only the maintainers read** (`purpose`, a layer `wantedFor`). The AI's own page and `notes.md` carry the intent.
- **Promotion of recurring uses into the core** is a reading task after a trial round: look at what the pages draw with `canvas`, and fold the common ones into the core (a named layer or a preset). No tooling is needed for that.
- Frame hooks, drawing on what is below (use `filters`, a matte or an adjustment composition), a worker-based canvas, audio.

The weekend trial brief gets one line: *when the library lacks what the piece needs, draw it with a `canvas` layer (a function of time, no `Math.random`), and say in notes.md what was missing.*

## 6. Safety

`draw` is code that runs in the page with the page's rights: for sessions and people you trust. The Playground and the published gallery run only code that is in the repository.

## 7. Testing

Unit tests on the mock (keys and did-you-mean; `draw` gets `t`, `frame`, `params`, a cleared canvas; `params` keyframes; `setup` state; an error in `draw`; a missing `draw`; sizes and clamps; the seeded `random`; one draw per distinct `(t, params)`); real-browser tests (a rectangle at `t` is where it should be in `snapshot`; two renders of one frame are byte-identical; it takes a mask, a filter and a blend mode; it exports); a `check` test with a layer that uses `Math.random` (the warning) and one that does not. Mutation checks on the guards (the determinism comparison, the one-draw-per-`(t, params)` cache). Docs: `dsl.md` section, cheatsheet, `help canvas`, recipes (a trail, tree rings, a waveform, a pixel sprite), pitfalls (stateful simulation: precompute in `setup`; no `Math.random`; the canvas is cleared each frame).

## 8. Release

0.37.0: the `canvas` layer, with its docs, recipes and `check` determinism test.
