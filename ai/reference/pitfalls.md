# pixi-effects pitfalls — what actually went wrong

Collected by having fresh AI sessions build six different pieces (kinetic type, news lower-third, slideshow, 2.5D showcase, three.js title, data-driven bar chart) from the docs alone. Each entry is a real stumble. **Status**: `fixed` = the library now handles or warns; `docs` = nothing can catch it, so remember it; `hand-roll` = the DSL has no feature, see the workaround.

A good habit that catches most of these: after `init`, read `window.__logs` (see `ai/template.html`) — every pixi-effects warning says what to change.

## Time

1. **Keyframe `at` starts at 0 when THIS layer appears** *(fixed in 0.3.0; earlier versions measured from the composition and failed silently)*. A layer at `at: 2` with a keyframe `at: 0` animates at global 2 s. Negative `at` counts back from the layer's end. A keyframe that starts after its layer ends now warns ("never plays").
2. **A layer's own `at` and a transition's `at` are composition time** (seconds from the parent composition's start). Only keyframes are layer-local.
3. **Layers are hidden, not removed, after `[at, at+duration)`** and keep their last values. Z-order is array order (later = on top). To switch scenes, stack scenes with `at`/`duration`, each starting with an opaque full-screen rect. *(docs)*
4. **Transitions need overlapping lifespans.** Both layers must be alive for the whole window: scene `i` starts at `i·(L−T)`, the transition's `at` is the next scene's start, total = `n·(L−T)+T`. A scene that ends while the transition is still running leaves a gap. *(docs)*
5. **Audio shorter than its layer goes silent** — `bgm.mp3` is 6 s. Add `loop: true` or shorten the layer. *(fixed: warns)* Volume fades: `volume: 0` + `{ at: 0, to: { volume: v }, duration: 2 }` + `{ at: -2, to: { volume: 0 }, duration: 2 }`.
6. **Snap times to the frame grid (`Math.round(t*30)/30`) when two things must stay locked** (a bar and its label). Drive both from one JS easing function with per-frame `set` keyframes rather than mixing a tween with computed positions. *(docs)*
7. **Pick eases on purpose.** `expo.in` stays tiny until the very end (a "flood" circle never reaches the corners — use a bigger radius and `power2.in`). A zoom transition with `power2.out` looks like a cut because the incoming scene is nearly opaque after 40 %. Default is linear. *(docs)*
8. **`render()` runs in roughly real time** (6 s of 720p ≈ 6 s). Listen to `movie.on('progress', e => e.progress)` (0–100). *(docs)*

## Layout and anchors

9. **Defaults differ by type.** rect/circle/ellipse are centred on `x,y`; text and image are top-left; a composition has no anchor — use `pivotX/pivotY` and set `x,y` to where the pivot should land. For a bar growing from its base use `anchorY: 1` (or `anchorX: 0`). *(docs)*
10. **Shape geometry may be at the top level or in `initial`** (`width height radius anchorX …`). *(fixed: `initial` used to be silently ignored)*
11. **Angles are degrees** — `rotation`, `skew*`, `rotationX/Y` — and `rotation: -0.2` is almost no rotation. *(docs)*
12. **Text**: anchor 0.5 centres the line *box*, not the cap height (nudge underlines by ~`0.46·size`). Arial Black is ~0.8·size wide per glyph, monospace ~0.6·size; leave ~7 % for hold-scale. `style` accepts any PixiJS TextStyle field: `letterSpacing`, `wordWrap` + `wordWrapWidth`, `lineHeight`, `stroke`, `dropShadow`, `padding`. A glow (`dropShadow` with `blur`) is clipped unless `padding ≥ 2·blur`. *(docs)*
13. **`w` / `h` in expressions** are the layer's own size. For text they now describe the styled text (`x: '-w'` scrolls a marquee fully out). *(fixed)*
14. **Masks live in the parent's coordinate space and do not follow the masked layer.** Reveal by growing the mask's `width` from a fixed edge (`anchorX: 0`); exit by tweening `x` and `width` together; slide the content separately. *(docs)*
15. **`filterArea` is in the layer's own coordinates** (origin = its local origin, e.g. a circle's centre), not the parent's. A blurred shape is clipped to its bounding box without it: `filterArea: { x: -(r+260), y: -(r+260), width: 2*(r+260), height: 2*(r+260) }`. `threeD` layers pad automatically. *(docs)*
16. **The player bar overlays the bottom ~60 px of the canvas** in browser screenshots (not in the exported video). `movie.snapshot()` / `movie.contactSheet()` never include it; keep captions above it anyway. *(fixed: use the built-in snapshot tools)*

## Missing features (hand-roll)

17. **Gradients / vignettes**: use shape `fillGradient` (linear or radial, stops may have alpha). Earlier sessions hand-rolled canvas images or dozens of stacked bands. *(fixed)*
18. **Counters**: `text: '{value}'` + animate `value` (with `format`). Other text content cannot change over time. Earlier sessions generated one text layer per number (40+ per bar). *(fixed)*
19. **Loops**: `repeat` (finite) / `yoyo` / `repeatDelay` on any keyframe; infinite repeats are rejected with a warning. *(fixed)*
20. **No per-frame expression time.** Expressions are evaluated once at build. A camera orbit is `orbit()`; any other curve (waves, spirals) must be sampled into short linear keyframes (~0.1 s) in a JS loop. *(partly fixed)*
21. **No text split / per-letter animator, no group/null parent, no particle emitter, no blend modes, no caption-linked-to-slide.** One layer per letter; many layers; seeded random loops; plain alpha. *(hand-roll)*
22. **Colour tweens look muddy in RGB** (red→green passes through brown). Use `colorSpace: 'oklab'` or `'oklch'` on the layer. *(docs)*
23. **Generated images**: `canvas.toDataURL()` as an asset `src` works. Make them ≥ canvas size or `kenBurns` zooms look soft. *(docs)*

## 2.5D / three.js

24. **`threeD` is required** for `z`, `rotationX`, `rotationY` (they warn otherwise). Camera props go in `initial`/keyframes, never on the camera object. `+z` is toward the viewer. *(fixed: warns)*
25. **A layer at/behind the camera plane is hidden** — the default camera sits at `z = (H/2)/tan(fov/2)` ≈ 989 at 720p, fov 40 (≈ 808 at fov 48, lower at higher fov). Keep every layer's `z` below it. *(fixed: warns once)*
26. **Under a dolly zoom only the `z = 0` plane stays put**; everything nearer balloons and clips. Headline at `z: 0`, near cards `z ≤ ~70`. *(docs)*
27. **Combining orbit and dolly zoom**: `orbit()` specifies `z`, so it stops following `fov` — write your own `fov` and `z = (H/2)/tan(fov/2)` keyframes for the zoom. *(docs)*
28. **Nearer `threeD` layers sort on top of text** — lay out around them. A final call-to-action or overlay should be a plain 2D layer (last in the array): it ignores the camera. *(docs)*
29. **three.js**: the layer clips at its own rectangle — size it to the area you want and pull the camera back (`z ≈ 5.4` for a radius-1 torus knot at fov 50). Metal needs an environment map (`PMREMGenerator(ctx.renderer)`); `three/addons` is not in the importmap. Route `three` through the importmap so there is one copy. Masks/transitions/`filterArea` are not supported on `threeD` layers. *(docs)*

## Tooling (agent harness)

30. **Look with the built-in tools, not OS screenshots**: `await movie.contactSheet({ count: 6, as: 'dataURL' })` returns one labelled image of the whole animation; `await movie.inspect(frame)` returns every layer's canvas bounds and `issues`. If you do use a browser tool, `screenshot` needs an **absolute path**, macOS `sed -i` needs `''`, and a static server may redirect `/x.html` → `/x` and drop `?query`. Keep the template's `try/catch` around `init` so failures land in `window.__logs`. Check ≥ 5 timestamps including mid-transition. *(fixed: tools built in)*
31. **Check audio without rendering by decoding the render**: `const b = await movie.render({format:'mp4'})` then `new OfflineAudioContext(...).decodeAudioData(await b.arrayBuffer())` and measure RMS over time. `movie.audioBuffer` holds the mix. *(docs)*
