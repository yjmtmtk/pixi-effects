# scene2d: a free box for PixiJS 2D code

Date: 2026-11-14. Owner: "OK進めて" on the name `scene2d` and on building it like `scene3d` (design, tests, docs, recipe).

## Why

pixi-effects has free boxes for pictures the data cannot draw: `canvas` (Canvas 2D), `shader`, `scene3d` (PixiJS 3D), `three`. PixiJS 2D itself, the engine
every layer is drawn by, has none: an author who wants Graphics, Sprites, a ParticleContainer or a Mesh built by code must subclass `Sequence` and
`registerSequenceType`, which is heavy, is not how an AI writes the other boxes, and gets none of their safety nets (the purity warning, the determinism
check, pick). `scene2d` is that box, shaped like `scene3d` so one way of writing covers both.

## Goals

- `{ type: 'scene2d', setup(ctx), update(t, ctx), dispose(ctx), width, height, reuse }` in core `pixi-effects` (no extra entry: PixiJS is already there).
- `ctx = { root, renderer, width, height, objects, texture(name) }`. `root` is a PixiJS `Container` in the layer's own pixels (0, 0 = the top-left of its box).
  `texture(name)` is the movie asset of that name (an unknown name throws with the known names).
- A layer like any other: `at`, `duration`, `initial`, `keyframes`, `filters`, `mask`, `blendMode`, `threeD`, `parent`, mattes, transitions, export.
  `anchorX` / `anchorY` work (the box's own point, as on a canvas layer).
- Keyframes into the scene: `scene2d.<object>.<path>` (`scene2d.ball.x`, `scene2d.ball.scale.x`); raw PixiJS values (rotation in radians; `angle` is degrees).
- A frame is a function of the time:
  - `update` that calls `Math.random`, `Date.now`, `performance.now` or `new Date` warns at build (shared `NOT_PURE`).
  - Things that run on PixiJS's ticker by themselves are turned off after setup, said once: any node with `autoUpdate === true`. An `AnimatedSprite` left
    playing is posed from the layer's time (frame = floor(t × 60 × animationSpeed), its loop kept; per-frame durations honoured), as scene3d poses clips.
  - A sprite showing a `<video>` texture warns (it plays by the wall clock: use a `video` layer).
  - `check` draws the layer at four moments in two orders and reports a layer whose same frame differs (canvasCheck kind `'scene2d'`).
- Pick: `movie.pick(x, y)` on a scene2d layer returns `kind: 'scene2d'` and `scene2d: { object, node, point, grab }` for the top object under the point
  (PixiJS's own `containsPoint` per node, or its `hitArea`; `eventMode: 'none'` and `interactiveChildren: false` honoured; hidden, unrenderable or alpha-0
  nodes skipped). Empty space in the box falls through to the layer below (as scene3d). `object` is the node's label or its nearest labelled ancestor's.
  `grab().move(x, y)` gives `{ point, delta }` in the node's parent's pixels: `node.x += delta[0]`. `check --pick` prints `path (scene2d: name)`.
  PixiJS's own pointer events (`node.eventMode = 'static'; node.on('pointerdown', …)`) also work in a playing page.
- Reuse: a named layer keeps its scene across `setVars` / `resize` / `rebuild` when it did not change (same name, same `setup` function, same size):
  setup runs once. The new layer borrows and takes the root at the swap (a failed or abandoned rebuild leaves the old layer drawing). `reuse: false` opts out.
- Errors said in a sentence with the layer's name: no `setup` (a scene2d layer needs one), `setup` throws (build fails with the message), `update` throws
  (said once, the frame is drawn as it is), an unknown keyframe path (known objects listed), unknown keys (core lint, did-you-mean).

## Non-goals

- No clipping to the box (a PixiJS container is not clipped; add a `mask` to clip). The box is the layer's size for anchor, layout, pick and the check.
- No follow* (the layer is flat; put `threeD` on it to place it in the camera's space). No layerTexture (show another layer: a `composition`).
- No new helpers beyond `ctx.texture` (`random`, `noise`, `ease`, `samplePath` already exist and are pure).

## Anti-goals

- A second vocabulary: scene2d must read like scene3d (setup / update / objects / `scene2d.` paths / reuse) and like the canvas layer for size keys.
- A silent wall clock: anything that would make a frame depend on more than the time is either turned off or said.

## Decisions (mine, flagged for the owner)

- Core, not an entry: PixiJS 2D is already loaded; `scene2d` needs no registration call.
- `ctx.root` is a child of the layer's display object, so the author's changes to `root` never fight the layer's keyframes.
- AnimatedSprite timing: 60 ticks per second (PixiJS's `deltaTime` unit), so a sprite plays at the speed it plays in a plain PixiJS page.
- Pick by PixiJS's own `containsPoint`: a Graphics is hit by its shape, a Sprite or Text by its box. Masks on nodes inside the scene are not looked at.
