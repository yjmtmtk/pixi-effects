# The `canvas` layer, and plugins on top of it (0.37 / 0.38)

Status: DRAFT 2026-10-14, for the owner's review. Agreed in conversation: the layer is named `canvas`; it draws into its OWN canvas and is placed in the layer stack like an image (it does not draw on what is below it); plugins are built on it, not the other way round; the weekend AI trials write plugins for what is missing, similar ones that recur are promoted into the core. Everything marked **DECISION** is a recommendation waiting for a yes or a change.

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
| `params` | an object of numbers (and number arrays) that **keyframes can animate**: `keyframes: [{ at: 0, to: { 'params.amount': 1 }, duration: 2 }]`. Passed as `info.params`. The same mechanism as `uniforms` of the `shader` layer, so the data side can still drive the picture. |
| `seed` | integer, default 0: seeds `info.random()`. |
| `smoothing` | `true` (default) or `false` (`imageSmoothingEnabled`, hard pixels for pixel art). |

`info` = `{ t, frame, duration, progress (0..1), width, height, resolution, frameRate, params, state, random }`. `random()` is a seeded generator whose sequence restarts at every call of `draw` (the same frame draws the same numbers); for a value that must differ from frame to frame, derive it from `t`. `Math.random`, `Date.now`, `performance.now` and `new Date()` are not available to a deterministic layer: see §4.

How it is made (built on what `shader` already does): a `Sprite` whose texture is the layer's own canvas, redrawn in `awaitFrameAt(local)` (the one frame path playback and export share) and uploaded with `texture.source.update()`. A frame is drawn once per distinct `(t, params)`; a seek back and forth does not redraw the same frame twice.

## 4. Mistakes are said at build time (the gate)

- `draw` missing or not a function: a warning naming the layer; the layer draws a loud checkerboard, like the shader layer.
- `draw` throws: warned once per layer with the message and the frame; that frame shows the checkerboard; the movie goes on.
- **Not deterministic.** `check` calls `draw` twice at the same `t` for a few moments of every canvas layer and compares the pixels: a difference is a warning that names the layer and the moments ("the picture changes between two calls at the same time: draw uses Math.random, Date.now or state that outlives the call"). A static scan of `draw.toString()` warns early for `Math.random(`, `Date.now(`, `performance.now(`, `new Date(`. The scan can be wrong: the pixel comparison is the authority.
- `width` / `height` of 0, negative or NaN, `resolution` out of range, an unknown key (did-you-mean), `params` that is not an object or has a non-number: each said once.
- **Stateful simulations.** The docs and `help canvas` give the one pattern: compute the whole simulation in `setup` into an array indexed by frame, and read `state[info.frame]` in `draw` (a Game of Life, a physics sim, a growth process). The cost is memory; a long or heavy one says so.
- Fonts: `ctx.font` uses system fonts, or a web font that has been loaded before `movie.init` (`await document.fonts.load(...)`), as for every text in the library.
- Cost: `draw` runs for every frame that changes; a slow `draw` slows the export in proportion. `check` prints the time of the slowest canvas layer next to the load stages.

## 5. Plugins (phase 2, on top of the layer)

A plugin gives a name to something that the core does not have, so that a spec can use it **by name and stay plain data**.

```js
export default {
  name: 'trail', version: '0.1.0',
  description: 'a fading afterimage of anything that moves',
  wantedFor: 'a dot that flies and leaves a soft tail (U2, the orange dot)',   // the expression that was missing, one sentence
  tags: ['motion', 'echo'],
  install(api) {
    api.canvasLayer('trail', {                      // `{ type: 'trail', ... }` now works
      params: { copies: 8, fade: 0.7 },
      draw: (ctx, t, info) => { /* … */ },
    });
  },
};
// the page: import trail from './plugins/trail.js'; movie.use(trail);  then  { type: 'trail', initial: { x: 640, y: 360 }, params: { copies: 12 } }
```

**Extension points of the first version** (each is registered through the same registry that the core's own features use, so a plugin that proves itself moves into the core as a file):
1. `api.canvasLayer(type, def)`: a named canvas layer (`def` = the keys of §3). The spec says `{ type: 'trail', … }`: data.
2. `api.preset(name, fn)`: a spec-to-spec function like `animateText` / `particles`, exposed as `{ type: 'preset', name, … }` expanded at build time into ordinary layers.
3. `api.ease(name, fn)`: a pure `fn(p) → p` usable as `ease: 'name'` or `'name(args)'`.
4. `api.fn(name, fn)`: a pure number function usable in expressions (`'wobble(t)'`).
5. `api.review(fn)`: a function called by `check` with the inspect report; it returns sentences (an extra rule such as "a hairline over text").

**Later (not in the first version), each because it needs its own registry design:** named filters and blend modes, transitions, animatable properties, audio voices / instruments, frame hooks, export formats, player parts. The `three` entry and `registerSequenceType` stay as they are.

**Rules.** A plugin is a module with `name`, `version` (semver), `description`, `wantedFor`, `tags`, `install`. A name collision with a core feature or another plugin is an error that says which. `movie.plugins` lists what is installed (name, version, a hash of the source); a spec may say `plugins: ['trail@0.1']` and `check` warns when it is missing. Everything a plugin registers is subject to §4. The plugin API is **unstable in 0.x** and the docs say so in the first line.

**`pixi-effects plugin check <file>`** (the gate before a plugin counts): the manifest is complete; `install` runs on a fresh movie without a warning; a built-in example (the plugin ships an `example` spec) builds and draws; it draws the same frames twice with identical pixels; the layers it registers take `mask`, `filters`, `keyframes` and `blendMode` like any layer (a smoke test with each).

## 6. Collecting, comparing, promoting

For the weekend trials of many AI sessions at once.

- **Where.** Trial plugins go to an **inbox outside git** (`pixi-effects-opus/plugins-inbox/<run>/<name>/`, like the existing trial workspaces); **DECISION 1:** curated plugins live in the repository's `plugins/` only after promotion or an explicit yes. The repository never receives a trial's raw output.
- **A plugin folder:** `plugin.js`, `plugin.json` (the manifest: `name`, `version`, `description`, `wantedFor`, `tags`, `provides` (the extension points and names), `author` (the agent / slot), `run` (the trial's label), `date`), `example.html`, `notes.md` (how it went, in the usability-record format).
- **Commands:** `plugin new <name>` (a scaffold that already passes `plugin check`), `plugin check <path>`, `plugin list <dir>` (one line per plugin: name, provides, wantedFor, run), `plugin similar <dir>` (groups plugins by the overlap of the words in `name` + `tags` + `wantedFor` + `provides` (Jaccard, threshold 0.4, explained in the output) and counts the **distinct runs** in each group), `plugin promote-report <dir>` (the groups with at least N distinct runs, each with the plugins side by side, the common parts of their `draw` and a proposed core API).
- **Promotion is the owner's decision.** **DECISION 2:** a group enters the report at **3 distinct runs**. Then the best member is reviewed against `docs/philosophy.md`, folded into the core (a named layer, a preset or a core ease), tested, documented, and the others are retired with a note. Promotion is a file move because core features use the same registry.
- **Provenance is kept** so the count is honest: two plugins written by the same session are one run; a plugin that is copied is not a second vote (a source hash is compared).

**The line added to every trial brief:**
> When the library lacks what the piece needs, do not write inline glue. Write a plugin (`pixi-effects plugin new <name>`), name it for what it does, and fill `wantedFor` with the missing expression in one sentence. Use it from the piece by name. Run `plugin check` before you finish and mention it in notes.md.

Docs for the AI: `help canvas`, `help plugin`, a recipe "a plugin from scratch", and the stateful-simulation pattern of §4.

## 7. Safety and limits

A plugin is code running in the page with the page's rights: for sessions and people you trust, not for anything pasted from an unknown source. The Playground and the published gallery do not load plugins from outside the repository. `plugin check` is a test of the plugin's behaviour, not a sandbox.

## 8. Out of scope

Frame hooks, plugins that replace the renderer, a plugin registry on npm and its versioning policy, sandboxing, hot reload. A `canvas` layer in a Web Worker. Audio plugins. All can follow once the first version has been used.

## 9. Decisions waiting for the owner

1. **Inbox outside git, curated `plugins/` after promotion** (§6).
2. **Promotion at 3 distinct runs** (§6).
3. **First version of §5 has five extension points** (canvasLayer, preset, ease, fn, review); named filters, transitions, properties, audio voices wait for a second round.
4. Release split: **0.37.0 = the `canvas` layer** (usable by itself, with docs, recipes, `check` determinism test); **0.38.0 = the plugin framework and the collecting tools**. (The `canvas` layer is useful even if the plugin part is changed or dropped.)

## 10. Testing

`canvas` layer: unit tests on the mock (keys and did-you-mean; `draw` gets `t`, `frame`, `params`, a cleared canvas; `params` keyframes; `setup` state; an error in `draw`; a missing `draw`; sizes and clamps; the seeded `random`; one draw per distinct `(t, params)`); real-browser tests (a rectangle at `t` is where it should be in `snapshot`; two renders of one frame are byte-identical; it takes a mask, a filter and a blend mode; it exports); a `check` test with a layer that uses `Math.random` (the warning) and one that does not. Plugins: unit tests of the registry (collisions, order, errors), `plugin check` on a good and on three bad plugins (no manifest, a warning, non-deterministic), the similarity grouping on a hand-made inbox (the groups, the distinct-run count, the copy that is not a vote). Mutation checks on the guards (the determinism comparison, the collision error, the distinct-run count).
