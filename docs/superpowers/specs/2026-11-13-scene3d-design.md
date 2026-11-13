# `scene3d`: PixiJS 3D as the main 3D engine — design

Date: 2026-11-13. Status: approved direction ("オススメでGO"), this document awaits the owner's read.

## Why

PixiJS 3D (`@pixi/3d`, MIT, https://github.com/pixijs/3d) left its closed beta on 2026-11-13 (npm `0.1.0`). pixi-effects draws 3D today only through three.js (`type: 'three'`, entry `pixi-effects/three`), which runs a second renderer on a canvas of its own (or, on WebGPU, a shared device) and hands PixiJS a texture. `@pixi/3d` is different in kind: its `View3D` is an ordinary PixiJS display object that draws a 3D scene **inside PixiJS's own renderer**, in stack order. For a compositing library that is the natural engine:

- no second renderer, no canvas per layer, no texture copy, no context budget (the 16-WebGL / ~32-WebGPU limit that `budget.ts` and `shareGpu` exist for);
- masks, filters and nested compositions (including `threeD` cards) apply to the 3D picture like to any layer;
- one library family, one version of the GPU state.

The owner decided long ago (memory `feedback_engine-neutral-names`, `docs/philosophy.md` "Engine names") that PixiJS 3D becomes the **main** 3D engine and takes the neutral names, and three.js stays as the **sub** engine under its own name. This release makes that real.

## Goals

1. A `scene3d` layer type: a free box (like the `three` layer, the owner's preference: `feedback_free-box-over-closed-types`) where the author builds a `@pixi/3d` scene in `setup`, moves it from the time in `update`, and keyframes its objects with `scene3d.<name>.<path>`.
2. Same playback/export contract as every layer: a frame is a function of the time. Seek, playback and export give the same picture on WebGL and WebGPU.
3. Everything a layer can have keeps working on a `scene3d` layer: `at` / `duration`, transform keyframes, `opacity`, `blendMode`, `filters`, `mask`, nesting in compositions and `threeD` cards.
4. An AI can write one from the docs on the first try: one recipe, help entries, unknown-key and unknown-path warnings that say what to do, `check` that catches a scene that is not a function of the time.
5. three.js keeps working unchanged.

## Non-goals (this release)

- Removing or deprecating three.js, or changing any `three` name.
- A closed declarative 3D type (`model`, `mesh` as spec data). Rejected before (2026-10-16); the free box plus helpers and checks is the shape.
- Re-exporting `@pixi/3d` from pixi-effects. Authors import `@pixi/3d` and `@pixi/3d/extras` themselves (the import map has them).

## Anti-goals (would make this a failure even if it runs)

- A `scene3d` frame that depends on the wall clock or on the order frames were drawn (a ticker-driven animation player, an unseeded particle system, `uTime`): the export and the preview disagree.
- A neutral name taken by three.js, or a suffixed/prefixed name for the main engine (`Scene3DPixi`).
- A layer that silently ignores `opacity` / `blendMode` (View3D does: see Findings).
- Breaking a page that does not use 3D: the main entry must not import `@pixi/3d`.

## Findings from the spike (2026-11-13, `../pixi-effects-3d-lab`, spike01/02, real Chrome, both backends)

A ~30-line `Sequence` subclass wrapping a `View3D` (`setup` builds the scene, `awaitFrameAt(t)` calls `update(t)`) already:

- draws on WebGPU and WebGL with shadows, PBR, a glTF clip seeked by `AnimationState.gotoAndStop(t)` (`Model3D({ autoUpdate: false, autoPlay: false })`);
- gives byte-identical snapshots when frames are drawn forward and then backward (both backends);
- works with the layer's own `filters` (blur), an inline shape `mask` (stencil; a mask shape needs a fill), a mask on a parent composition, and inside a nested composition shown as a `threeD` card; several views in one target each clear their own depth.

What does not work by itself:

- **`alpha` and `blendMode` on a `View3D` are ignored** (also with `composite: true`). Through an `AlphaFilter` on the view, both alpha and a blend mode work on both backends.
- **WebGL only**: a View3D with a stencil mask inside a *parent container that has a filter* draws nothing (pure Pixi + @pixi/3d repro in spike02, case F). Mask and filter on the same View3D are fine. Candidate upstream issue (the owner decides whether to post it).
- `@pixi/3d` loads its backend during `app.init`; it must be imported **before** `Movie.init` or a View3D draws nothing, silently.
- Determinism hazards in 0.1.0 (from the source): `globalUniforms.uTime = performance.now() / 1000` in both pipes (only custom shader bits read it); `AnimationPlayer`, `ParticleSystem3D`, `OrbitCamera` / `FPSCamera` and `ContainerTexture` update themselves on `Ticker.shared` by default (`autoUpdate`); particle births accumulate (a backward seek does not reproduce them); WebGPU GPU culling of large batches is order-nondeterministic (`cull: 'off' | 'cpu'`).
- Peer dependency: `pixi.js ^8.23.0` (pixi-effects is on 8.22.0).

## The design

### Names (philosophy "Engine names", rules 1–3)

| thing | name |
|---|---|
| entry | `pixi-effects/3d` |
| registration | `register3D()` |
| layer type | `type: 'scene3d'` |
| keyframe paths | `scene3d.<object>.<path>` (e.g. `scene3d.cube.rotation.y`) |
| typing helper | `scene3d(spec)` (like `three(spec)`) |
| sequence class | `Scene3DSequence` |
| spec type | `Scene3DSequenceSpec`, context `Scene3DContext` |

Nothing in the 3d entry carries an engine name. `docs/philosophy.md` "Engine names" is updated to say what is now true: the main engine is PixiJS 3D (named in docs now that it is public), the sub engine is three.js; `tests/docs/EngineNames.test.ts` gains: the `./3d` entry exists and exports no engine name.

### The layer

```js
import { register3D, scene3d } from 'pixi-effects/3d';
import { Mesh3D, CubeGeometry, Material3D, DirectionalLight } from '@pixi/3d';
register3D();                                   // before movie.init

{ type: 'scene3d', name: 'hero',
  view: { toneMapping: 'aces', shadowQuality: 'medium', environment: { skyColor: 0xbcd4f0, groundColor: 0x6b6250 } },
  setup: ({ root, camera }) => {
    const cube = new Mesh3D({ geometry: new CubeGeometry(), material: new Material3D({ baseColor: 0xdd4444 }) });
    const sun = new DirectionalLight({ intensity: 3 }); sun.rotation.set(-0.8, 0.5, 0);
    root.addChild(cube, sun);
    camera.position.set(0, 1.5, 5); camera.lookAt({ x: 0, y: 0, z: 0 });
    return { objects: { cube } };
  },
  update: (t, { objects }) => { objects.cube.rotation.y = t * 1.2; },
  keyframes: [{ at: 1, to: { 'scene3d.cube.position.x': 1.5 }, duration: 1 }] }
```

Spec keys (besides the common layer keys):

- `setup(ctx)` (required, may be async: Movie.init waits). Returns `{ objects? }`. `objects` are addressable from keyframes; `camera` and `view` are added implicitly unless present.
- `update(t, ctx)` optional, `t` = layer-local seconds (clamped to `[0, duration]`), must derive state from `t` only.
- `dispose(ctx)` optional, for resources the author made.
- `width`, `height` (expressions allowed; default: parent composition size). The layer's picture is `width × height` composition px, placed like other layers (anchor, x, y...).
- `view`: options passed to `new View3D({...})` (environment, toneMapping, exposure, shadowQuality, passes, composite, ...); `width` / `height` / `autoResize` are owned by the layer (a warning if given here).
- `resolution`: forwarded to the View3D (≠ 1 turns on @pixi/3d's composite mode).

`ctx` (`Scene3DContext`): `{ view, root, camera, renderer, width, height, objects }` — `view` the `View3D`, `root` = `view.root`, `camera` = `view.camera`, `renderer` = PixiJS's renderer, `objects` the record from setup (so `update` reaches them without closures).

`setup` does not take a camera replacement (the View3D owns its camera; mode/fov are properties of it).

### Time and determinism

The frame path is the one the three layer uses: `awaitFrameAt(local)` (duck-typed by `Movie._awaitVideoFrames`, run inside `gotoFrame` for playback and export alike) calls `update(t, ctx)`; PixiJS then draws the View3D with the rest of the stage. There is no separate draw.

To keep a frame a function of the time:

1. `register3D()` sets the `@pixi/3d` defaults that stop self-updating where the library exposes them (`AnimationPlayer.defaultOptions.autoUpdate = false`; the same for any other class with a static `defaultOptions.autoUpdate`, found by the builder in 0.1.0). After `setup` returns, the layer walks `root` and turns `autoUpdate` off on every `Model3D` player, particle system and camera controller it finds, and says once which it turned off (so the author learns to drive them from `update`).
2. `update`'s source is checked for `Math.random` / `Date.now` / `performance.now` / `new Date` like the three and canvas layers (same regex).
3. `uTime`: the builder tries to pin `globalUniforms.uTime` to the movie time (an accessor on the uniform group that ignores the pipe's write, set before each draw). If 0.1.0 makes that impossible without patching private code, it is documented ("custom shader bits must not read uTime; use a uniform you set from t") and the determinism check catches it.
4. The determinism check (`check`, `movie.review()`): `Scene3DSequence.checkDeterminism(times)` returns the same `CanvasCheck` shape as `ThreeSequence`'s: draw the view at the given times in two orders (one warm-up draw first) into a RenderTexture with PixiJS's renderer, read the pixels with `renderer.extract`, compare. Wired wherever `ThreeSequence.checkDeterminism` is called today.
5. Particles: documented in the recipe and pitfalls: give a `seed` and (for a seek) replay from 0 in fixed steps, or drive a `ParticleContainer3D` by hand from `t`. No helper in this release.
6. Culling: View3D defaults to `cull: 'gpu'`, whose compaction is order-nondeterministic on WebGPU for large batches. The layer passes `cull: 'cpu'` unless the author's `view` names a `cull`. *(builder's call, from the review)*
7. `MotionBlurEffect` (extras) reads the previous draw's camera matrix, so its picture depends on draw order: a pitfall, and `checkDeterminism` catches it. *(builder's call)*

Backends: the requirement is **within** each backend (seek = playback = export). The two backends are not required to match each other (@pixi/3d has separate GL and GPU pipes); a film measures the difference and the docs state it, as `three-renderers` does for three, and it does not block the release. *(my call)*

### Opacity, blend mode, tint

`View3D` ignores `alpha` and `blendMode`. The layer keeps the author's vocabulary working:

- Each frame (`syncFrame`), when the layer's **world** alpha (its own alpha times its ancestors') is below 1, or its `blendMode` is not normal, the layer appends one `AlphaFilter` (its own, last in the layer's filter list, after the author's filters and matte filters) with `alpha` = that world alpha and `blendMode` = the layer's blend; it removes it again when neither is needed (so a full-opacity normal layer pays nothing). The builder verifies with a test film that the result matches a 2D picture faded the same way (the parent's alpha must not be applied twice or not at all) and that the advanced (filter-based) blend modes still work.
- `tint` is ignored by View3D: a warning when a `scene3d` layer keyframes `tint` (or sets it in `initial`).

### Masks

Masks work as for any layer (stencil for a plain shape, matte filter otherwise). For the WebGL case above (stencil-masked View3D inside a filtered ancestor draws nothing) the builder first reproduces it in a pixi-effects test film; if it reproduces, a `scene3d` layer's inline shape mask takes the matte (filter) route instead of the stencil on every backend (one code path, same picture), and the upstream issue text is drafted for the owner.

### Loading order and missing backend

`pixi-effects/3d` imports `@pixi/3d` at module load, so `import … from 'pixi-effects/3d'` before `movie.init` registers the backend in time. If a `scene3d` layer is built on a renderer that has no 3D backend (detected by the builder: e.g. the renderer's pipes have no View3D pipe), the build fails with: "pixi-effects: scene3d layer "x": PixiJS 3D was loaded after the renderer started; import 'pixi-effects/3d' (and call register3D()) before movie.init". `register3D()` called after a movie already exists warns the same.

### Checks and warnings (AI-friendly)

- `layerKeys`: `scene3d` gets its key list (did-you-mean for typos like `setUp`, `views`).
- Unknown `scene3d.<object>.<path>`: warns once with the known object names (same as `three.`).
- `followCamera` / `followLights` / `followFog` / `renderer` / `shareGpu` / `antialias` on a `scene3d` layer in this release: a warning "not yet on scene3d (this release); use type 'three' for it, or …" — names reserved for phase 2.
- `check` reports the scene3d determinism result like three's.

### Packaging

- `package.json`: entry `./3d` (`dist/3d.js` / `.cjs` / types); `@pixi/3d` as an optional peer (`^0.1.0`); devDependency `@pixi/3d` 0.1.0; `pixi.js` devDependency → `^8.23.0`; peer `pixi.js` stays `^8.0.0` for the main entry (the 3d entry's need for 8.23 is `@pixi/3d`'s own peer; the 3d entry warns at `register3D()` when PixiJS is older than 8.23).
- `tsup`: entry `3d: 'src/3d/index.ts'`, `@pixi/3d` (and `@pixi/3d/extras`) external.
- Template (`skills/pixi-effects/template.html`, `ai/chat-template.html`, `pixi-effects new`): import map gains `pixi-effects/3d`, `@pixi/3d`, `@pixi/3d/extras` (jsDelivr CDN files `dist/pixijs-3d.min.mjs`, `dist/pixijs-3d-extras.min.mjs`) and `pixi.js` moves to 8.23.0; the commented import lines show `register3D` first and three second. The builder verifies one PixiJS instance is shared (esm.sh `pixi.js` + jsDelivr `@pixi/3d` importing `pixi.js` by name through the map) and that the backend chunk loads from the CDN.
- The owner's npm has `min-release-age = 7`: installs of the fresh packages need `--min-release-age=0` for that one command.
- **The PixiJS 8.22 → 8.23 bump is its own first step**, before any 3D code: bump, build, `release:check` and `compare-frames` over the gallery and examples. Differences of anti-aliasing size (≤ a few /255 on edges) are accepted and recorded; a real regression (a broken picture, `quietUnbind` / `warnings-none-at-destroy` no longer holding) stops the work and is reported to the owner. *(my call)*
- **Where this ends**: local commits on a branch, all tests green. No push, publish, tag or release without the owner's explicit go (standing rule). Before release, the CDN path is checked with a local copy of the template whose `pixi-effects*` entries point at the local `dist/` and whose `@pixi/3d` entries are the real jsDelivr files (already published), so the one-PixiJS-instance question is answered before publishing; `post-publish:check` gains the 3d entry for after. *(standing rule + my call)*
- **AI trials** (fresh Sonnet / Opus writing a scene3d video from the docs) are not a completion condition of this phase; they are proposed to the owner once phase 1 is in, as for earlier features. *(my call)*

### Docs

- `docs/philosophy.md` "Engine names": main = PixiJS 3D, sub = three.js, named.
- `docs/dsl.md`: a `scene3d` section before the `three` section; the three section says when to choose three (followCamera/Lights/Fog, pick, layer textures, three's ecosystem) until phase 2 lands.
- `skills/pixi-effects/SKILL.md`, `reference/cheatsheet.md`, `pitfalls.md`: 3D starts with `scene3d`; pitfalls for: import before init, `update` from `t` only, players/particles autoUpdate, the shape-mask fill, tint ignored.
- One recipe `scene3d-basics` (a lit scene, a glTF model whose clip is seeked from `t`, a 2D title over it, a mask or wipe), tested by a film that runs the recipe text (as `drag-recipe` does).
- `npm run build:ai` regenerates llms files; CHANGELOG Unreleased.

### Tests (films, `tests/films/`)

`scene3d.html` + `scene3d.test.ts`, run on WebGL and WebGPU (`beforeLoad` removes `navigator.gpu` for WebGL, as `backends-agree` does):

1. draws (non-background pixels in the layer's area), and the glTF clip pose differs between two times;
2. forward vs backward snapshots identical; `checkDeterminism` passes for a pure scene and fails for a scene whose `update` integrates state (velocity accumulator, as `threeDeterminism` does);
3. opacity 0.5 fade matches a reference 2D layer faded the same way (mean diff threshold), inside a composition with alpha too; a `blendMode: 'add'` layer brightens;
4. inline shape mask, layer filter, mask + parent filter on WebGL (the bug case), nested `threeD` card;
5. a View3D built after init without the 3d entry errors with the message above (a page that imports `@pixi/3d` late);
6. an unknown key and an unknown `scene3d.` path warn; `tint` warns;
7. `setVars` rebuild destroys the old layer cleanly (no PixiJS warnings at destroy: the `warnings-none-at-destroy` rule).

Plus the unit layer (`test:fast`): layerKeys, EngineNames, spec typing.

## Phase 2 (designed later, separately; names reserved)

In the order the three layer grew them: `followCamera` / `followLights` / `followFog` (port `spaceBridge.ts` to @pixi/3d's camera, lights and fog; measure against the composition's own cards as `three-space` does), `movie.pick` / hover / `grab` through `View3D.raycast`, 2D layers on meshes through `ContainerTexture` (driven by the movie, not the ticker), glTF helpers (`frameCamera`-style), `reuse` across `setVars` rebuilds, a `probe` note. Then the landing page and gallery pieces.

## Left to the builder

- The exact detection of "renderer has no 3D backend".
- Which `@pixi/3d` 0.1.0 classes expose `defaultOptions.autoUpdate` and how to find self-updating objects after setup.
- Whether `uTime` can be pinned (see above) — either outcome is acceptable as specified.
- File layout under `src/3d/` (mirror `src/three/`: `index.ts`, `Scene3DSequence.ts`, `types.ts`).
- Thresholds in the films.
