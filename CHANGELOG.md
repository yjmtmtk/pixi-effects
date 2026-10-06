# Changelog

## 0.3.0

**Breaking**

- Keyframe `at` is now measured from the start of the layer it belongs to (After Effects style); negative `at` counts back from that layer's end. Before, it was measured from the parent composition, so a keyframe with `at: 0` on a layer that starts at `at: 2` ran two seconds before the layer appeared, silently. Layers' own `at` and transitions' `at` are unchanged (composition time). `kenBurns`, `withFade` and transitions emit layer-local times. **Migration:** on a layer with `at: N`, subtract `N` from its keyframes' `at`.

**Fixed**

- **A layer could be missing right after a seek, or from an exported video.** PixiJS only culls inside `app.render()` (the ticker), and `Movie` draws by hand (and `render()` stops the ticker), so `culled` flags were stale: a layer that had just come on screen could be skipped. The movie now culls immediately before every draw.
- `line`, `polygon` and `path` without `x` / `y` were drawn around (0,0): their points are now plain canvas coordinates.
- Videos inside nested compositions started at the wrong time.
- Text `w` / `h` in expressions were measured before the style was applied.
- Shape geometry written in `initial` (`width`, `anchorX`, …) was silently ignored.
- 2.5D: hidden layers could keep a stale texture (`autoAlpha`), filter output was clipped at the layer edge, and render textures could use excessive memory.

**Added**

- Unknown option names now warn with a suggestion (`contactSheet({ cols })` → `columns`, `init({ fps })` → `frameRate`) instead of being ignored. `inspect(frame, { layers })` can list only the visible layers or none; it ignores faint layers and moving text.
- Warnings for the silent failures AI authors hit: keyframe or layer starting after its layer / composition ends, audio shorter than its layer without `loop`, a `threeD` layer hidden behind the camera, transitions on `threeD` layers, `lookAt` equal to the camera position, and more.
- Keyframes: `repeat` / `yoyo` / `repeatDelay` on every kind of animation (finite repeats only).
- Text counters: `text: '{value} users'` + animate `value`; `format: { decimals, grouping }`.
- Shapes: `fillGradient` — linear and radial gradients with alpha stops (vignettes).
- `orbit()` preset: a camera that circles a point (`dollyZoom: { from, to }` animates `fov` while the radius follows it).
- `movie.snapshot()`, `movie.contactSheet()`, `movie.inspect()`: look at the result — one frame, many labelled frames on one image, or per-layer bounds plus layout issues (text off the canvas, cut off, overlapping).
- `ai/` (skill, cheatsheet, tested recipes, pitfalls, starter template), `llms.txt`, `llms-full.txt`.

## 0.2.0

- 2.5D layers and camera (`threeD`, `z`, `rotationX/Y`, `{ type: 'camera' }`), the optional `pixi-effects/three` entry, `withFade`, shared-chunk builds.
