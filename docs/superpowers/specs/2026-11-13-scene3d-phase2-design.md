# `scene3d` phase 2: the basic features complete — design

Date: 2026-11-13. Status: owner's "オススメでGO" on the order below. Phase 1 (`docs/superpowers/specs/2026-11-13-scene3d-design.md`) is merged on local `main`. **Nothing is pushed or released until this phase is done** (owner, 2026-11-13): scene3d ships as one version.

## Why

Phase 1 made `scene3d` a working layer, but five things an author reaches for still need the sub engine (`type: 'three'`). Until they exist on scene3d, the docs have to send an AI to three for half the 3D recipes, and "PixiJS 3D is the main engine" is only a name. Phase 2 closes that list, in the order the three layer grew them:

1. **Live in the composition's space**: `followCamera`, `followLights`, `followFog`.
2. **Pick, hover, drag** objects of the scene (`movie.pick`, `movie.hover`, `hit.<engine>.grab`).
3. **A 2D layer on a mesh** (a phone screen, a television): `layerTexture`.
4. **glTF helpers**: `loadModel` (load, fit, pose a clip from `t`), `frameCamera`.
5. **Reuse across rebuilds** (`setVars`, `resize`, `rebuild`): `setup` and model loading run once.

## Goals

- Each feature works on scene3d with the same spec words as on three where the words are neutral (`followCamera`, `followLights`, `followFog`, `reuse`, `ctx.space`), so an author or an AI moves between the two engines without relearning.
- Same contract as phase 1: a frame is a function of the time; seek = playback = export on WebGL and WebGPU; masks, filters, alpha and blend keep working.
- Each feature is measured, not assumed: the follow* mirror against the composition's own `threeD` cards (as `tests/films/three-space` does for three), the picture of `layerTexture` against the 2D layer drawn flat, picks against known geometry.
- The phase-1 warnings "X is not on scene3d yet" go away for what now exists.

## Non-goals

- Changing anything about the `three` layer or its names.
- A closed declarative model type. glTF stays inside `setup`, with helpers.
- Matching three where PixiJS 3D cannot (see Differences): those differences are measured, documented and warned, not hidden.
- 3D particles helpers, post-effect helpers.

## Anti-goals

- A follow* scene that agrees with the composition only at some sizes (three's first shadow bias hid casters within 250 px at 1280 × 720 and passed at 480 × 270: films run at 1280 × 720 too).
- A 2D layer on a mesh that is drawn by the ticker (`ContainerTexture.autoUpdate`) instead of the movie's frame.
- A pick that answers for the frame drawn before the one on screen.

## Facts that shape the design (PixiJS 3D 0.1.0, read from the source)

- Camera: `view.camera` (`Camera3D`), vertical `fov` in degrees, `near` / `far`, `position`, `lookAt(point)`; aspect follows the view's size. Lights and cameras look down local −z; y is up.
- Lights: `AmbientLight`, `DirectionalLight` (aimed by rotation / `lookAt`; position does not matter), `PointLight`, `SpotLight` (`coneAngle` = degrees from the axis to the edge, `penumbra`). Direct and ambient light are divided by π (as in three). Point/spot attenuation is `window(range) · 1/√(d⁴ + R⁴)`, R = the bulb `radius` (default 0.1), window = `(1 − (d²/range²)²)²` when `range` > 0. **Only directional and spot lights cast shadows**; shadow map size is per view (`shadowQuality`), filter per view (`shadowFilter`); the sun's shadow box fits the casters each frame.
- Fog: `view.fog = { type: 'linear', color, near, far }` fades with `smoothstep` (like three's), plus `exponential` / `exp2`; no amount below 1.
- Picking: `view.raycast(globalPoint)` → `{ target, point, localPoint, normal, uv, distance, triangleIndex }` from the transforms of the last render; only nodes with `eventMode` `'static'` (or `interactive`) are hit; skinned/morphed meshes are hit in their rest pose. `view.screenToRay(point)`, `screenToWorld(point, plane)` exist.
- 2D on a mesh: `ContainerTexture({ container, width, height, resolution, clearColor })` + `texture.render(renderer)`; stored the other way up from an image texture (upright on a default `PlaneGeometry`, upside down on a loaded model / `flipV` plane).
- Models: `Assets.load(url)` → `Scene3DSource`, `new Model3D({ source })`, `model.player` (clips by label), `getLocalBounds()`.

## The design

### 1. `followCamera`, `followLights`, `followFog` (biggest; the others build on its conventions)

Same keys and meaning as on three, on the spec of a scene3d layer. The scene is in **composition pixels with y flipped**: a composition point (x, y, z) is (x, −y, z) in the scene; +z is toward the viewer in both. Pulled per frame in `awaitFrameAt` from `parent.spaceAt(absoluteStart + t)` (the same pull model as `ThreeSequence._followSpace`), before `update`, so `update` can read `ctx.space` and override. `src/3d/spaceBridge.ts`:

- **Camera**: `camera.fov = s.fov`, near 1, far 20000 (composition px), `position (x, −y, z)`, `lookAt (lookAtX, −lookAtY, lookAtZ)` (when position = look-at, look along −z). A layer whose size is not the composition's aspect warns once (as three). Accuracy target: projection of a point equal to the composition's own to 1e-6 px (unit test, as `tests/three/spaceBridge.test.ts`).
- **Lights**: one `@pixi/3d` light per light layer alive, in layer order, made once and moved every frame; an ended light gets `visible = false` (not removed). Colour: the layer's sRGB colour. Intensity × π (the divide by π). Kinds: ambient → `AmbientLight`; parallel → `DirectionalLight` at the light's position, `lookAt` its look-at point; point → `PointLight`; spot → `SpotLight` with `coneAngle = coneAngle / 2`, `penumbra = coneFeather`.
  Falloff (composition → PixiJS 3D):
  - `none` (constant): bulb radius R = 100 × the scene extent, intensity × R² (then 1/√(d⁴+R⁴)·R² ≈ 1 within 1e-8 over the scene).
  - `inverseSquare` (1 inside `radius`, (radius/d)² outside): R = `radius`, intensity × radius² (at d ≫ R exact; at d = R 0.71 instead of 1: measured and documented; better than three, which keeps rising inside).
  - `smooth` (1 inside radius, smoothstep to 0 at radius + falloffDistance): flat bulb (as `none`) times the range window, with range and gain fitted like three's (start: range = reach·(0.8 + 0.45p), gain 0.87 + 0.45p, p = radius / reach); the builder refits against the composition curve and records the error.
  Shadows: `castsShadows` on a parallel or spot light → `castShadow`; the scene's meshes cast/receive by default in PixiJS 3D. A point light with `castsShadows` warns once ("PixiJS 3D: a point light casts no shadow; use a spot light"). `shadowDarkness` / `shadowDiffusion`: mapped where PixiJS 3D has a knob (shadow strength if present; `shadowFilter` for diffusion), else warned once as not mirrored. Bias tuned for pixel-scale scenes and checked at 1280 × 720 and 480 × 270 (anti-goal above).
- **Fog**: the camera's linear fog → `view.fog = { type: 'linear', color, near, far }` (a fog the author set themselves is left alone); `fogAmount` < 1 warns once (no amount in PixiJS 3D), as on three.
- `ctx.space` carries the raw numbers, as on three.
- Measured in a film `scene3d-space` (port of `three-space`): cards and a scene3d box at the same composition positions under the same camera move / lights / fog; camera mean error at edges only; lights per falloff; shadows from a parallel and a spot light; 1280 × 720 and 480 × 270; both backends.

### 2. Pick, hover, drag

`Scene3DSequence` answers the hooks `movie.pick` already duck-types:
- `pickAt(u, v)`: the view's ray through (u, v) of its picture (`view.screenToRay` with the point in the view's pixels), tested against the scene. The layer makes the scene pickable without the author's help: after `setup` (and in `pickAt` for nodes added later), every `Mesh3D` / `Model3D` whose `eventMode` is still the default `'passive'` gets `'static'`. Hit: `{ object: <name: the node's label or its nearest labelled ancestor, '' if none>, point: [x, y, z] in scene units, distance, node }`; null when nothing is met. Uses the last render's transforms, which is the frame on screen (movie.pick's contract).
- `dragPlane(point, plane)`: `'screen'` (facing the camera), `'floor'` (y up), `'wall'` (z constant), or a normal; returns `(u, v) => { point, delta } | null` (ray ∩ plane), as on three.
- `PickHit.kind` gains `'scene3d'`, and the hit carries **`scene3d: { object, point, distance, node, grab(plane) }`** (parallel to `three`; neutral name). `check --pick X,Y` prints `name (scene3d: object)`.
- Hover and drag recipes work unchanged (they are built on pick).
- Film `scene3d-pick`: named meshes at known places; pick at their projected centres returns their names on both backends; a pick on empty space returns the layer-less answer; `grab('floor').move` moves a mesh by exactly the pointer's delta; a pick after a seek answers for the frame on screen.

### 3. `layerTexture(ctx, name, options?)`

Neutral name, exported from `pixi-effects/3d`: a 2D layer (a `composition` listed before the scene3d layer) shown on a mesh. Same contract as `threeLayerTexture`: the 2D layer stays a layer of the movie (timeline, keyframes, filters), is not drawn on the stage, and is drawn into a `ContainerTexture` **by the scene3d layer just before each frame is drawn** (never `autoUpdate`). Returns `{ material, texture, width, height, dispose() }`: an unlit `FlatMaterial` that shows it (screens shine by themselves), `transparent` option → `alphaMode: 'blend'`; `resolution` option. The orientation is handled for the common meshes (a default `PlaneGeometry` shows it upright; the builder settles the flip for loaded models and documents it). Rebinds on reuse (feature 5). `movie.pick` on the mesh forwards to the 2D layer (`screenOf` + uv → the 2D layer's pixel), as three does. Film `scene3d-layer-texture`: the 2D layer's colours on a face-on plane equal the flat 2D layer's within a small mean error; the layer animates with the movie (not the ticker); a pick on the screen names the 2D layer under it.

### 4. glTF helpers: `loadModel`, `frameCamera`

Neutral names in `pixi-effects/3d`:
- `loadModel(url, { animation?: string | number | false, speed?, offset?, loop? })` → `{ object: Model3D, clips: string[], size(): {x, y, z}, fit(longest: number): void, pose(t: number): void }`. `pose(t)` = `gotoAndStop` of the chosen clip at `offset + t·speed` (looped or clamped): a function of t. `fit(n)` scales so the longest side is n scene units (n px under `followCamera`).
- `frameCamera(camera, object, { direction?, margin? })`: puts the camera where the whole object fits (three-quarter view by default), as `threeFrameCamera`.
- `probe model.glb` already reports clips and size (engine-agnostic); no change.
- Recipe `scene3d-basics` uses `loadModel`; a new recipe `scene3d-in-space` (a model running past a title under the composition's camera and lights: the port of `gltf-in-space`).

### 5. Reuse across rebuilds

`reuse` (default true for a named layer), keyed like three's (name, setup identity, size, resolution, view options identity, follow flags). The new tree's layer borrows the old one's view, scene, objects, players, look/blend filters, mirrors and layer textures until `commitReuse`; the old layer keeps drawing meanwhile; a thrown-away new tree leaves the old one intact. `update` and keyframes are the new tree's. Film `scene3d-reuse` (port of `three-reuse`): `setVars` of a text variable runs `setup` once, keeps the view (same object), and the picture equals a page built with that value from the start.

### Warnings and docs

- Remove `followCamera`, `followLights`, `followFog`, `reuse` from the "not on scene3d yet" list; keep `renderer`, `shareGpu`, `antialias` (three-only: they are about three's own renderer) with a sentence that says they do not apply to scene3d (it is drawn by PixiJS itself).
- `docs/dsl.md` scene3d section: the five features; the "not yet" paragraph goes; the three section's "choose three when…" shrinks to "three.js's own ecosystem (its loaders, materials, post-processing), or a scene you already have in three".
- SKILL / cheatsheet / pitfalls / recipes updated; CHANGELOG Unreleased gets one entry for scene3d phase 2.
- The landing page and gallery: out of this design (a release-time task).

## Differences from three (documented, warned where an author can hit them)

- Point lights cast no shadow (warn).
- `inverseSquare` inside the radius: 0.71 at the radius instead of 1 (three: rises far above 1).
- Fog: smoothstep like three; no amount < 1.
- Picking skinned / morphed meshes uses their rest pose.

## Left to the builder

- File layout (`src/3d/spaceBridge.ts`, `src/3d/layerTexture.ts`, `src/3d/gltf.ts`, `src/3d/pick.ts` or methods on the sequence).
- The shadow bias / normalBias values and the `smooth` fit numbers (measured).
- How `shadowDarkness` / `shadowDiffusion` map (or warn), after reading PixiJS 3D's shadow options.
- Thresholds in films.
- Order inside a task; the five features are tasks in the order above, each green before the next.
