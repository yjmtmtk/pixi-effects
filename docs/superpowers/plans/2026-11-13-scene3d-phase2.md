# scene3d phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** followCamera / followLights / followFog, pick + drag, layerTexture, loadModel / frameCamera and reuse on `scene3d` layers.

**Architecture:** Each feature mirrors its `three` counterpart (`src/three/*`) on `Scene3DSequence`, through the same duck-typed hooks the core already calls (`parent.spaceAt`, `pickAt` / `dragPlane` / `screenOf`, `reuseKey` / `commitReuse`).

**Tech Stack:** TypeScript, PixiJS 8.23, `@pixi/3d` 0.1.0, vitest, real-Chrome films.

**Spec:** `docs/superpowers/specs/2026-11-13-scene3d-phase2-design.md` (and phase 1's spec for the layer itself).

## Global Constraints

- Work on local `main` (owner: no push / release until all basic features are done). Commit per task.
- Neutral names only in `src/3d/` exports (`EngineNames.test.ts`): `layerTexture`, `loadModel`, `frameCamera`, `LayerTexture`, `LoadedModel`, …
- Composition → scene coordinates: (x, y, z) → (x, −y, z). Camera near 1, far 20000.
- Every film: warnings in `window.__logs`, tests assert the expected list; both backends (`beforeLoad` removes `navigator.gpu` for WebGL); `npm run build` before films.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. followCamera at 1280 × 720 and at 480 × 270 (three's shadow bias passed small and failed large).
2. A pick right after a seek answers for the frame on screen (the view's transforms of the last render).
3. A 2D layer on a mesh animates with the movie in an export, not with the ticker.
4. A rebuild that fails or is thrown away leaves the old scene3d layer drawing (reuse is a loan until commit).
5. A scene3d layer with `followLights` and no light layer alive: the scene's own lights stay as they are (no black scene).

---

### Task 1: followCamera

**Files:** Create `src/3d/spaceBridge.ts` (`applyCameraState(camera: Camera3D, s: CameraState): void`), `tests/3d/spaceBridge.test.ts`; modify `src/3d/Scene3DSequence.ts` (spec keys, `_followSpace(t)` in `awaitFrameAt` before `update`, `ctx.space`, aspect warning), `src/3d/types.ts` (`followCamera?`, `followLights?`, `followFog?`, `ctx.space?: SpaceNow`).

- [ ] Unit test (happy-dom, real `@pixi/3d` math classes if importable, else the camera's matrices computed by the test): for three camera states (home, dolly + orbit, lookAt = position), a set of composition points projects through the Camera3D's view-projection to the same pixel as `src/space/math.ts`'s projection, within 1e-6 px. RED → implement → GREEN.
- [ ] Film `scene3d-space.html?part=camera` (1280 × 720 and `?small=1` 480 × 270): flat `threeD` cards and scene3d boxes at the same composition points under a `camera` with keyframes (dolly, orbit); measure the mean difference of a box against its card (edges only) at 3 frames; both backends. Warnings: aspect mismatch says so once.
- [ ] Commit `feat(3d): followCamera on scene3d layers`.

### Task 2: followLights, followFog, shadows

**Files:** `src/3d/spaceBridge.ts` (`LightMirror`, `FogMirror` for `@pixi/3d`), `Scene3DSequence.ts`, film `scene3d-space` parts `lights`, `fog`, `shadow`, tests.

- [ ] Per falloff (`none`, `inverseSquare`, `smooth`) and kind (ambient, parallel, point, spot): a scene3d unlit-vs-lit plane under the light against a lit `threeD` card at the same place; record mean errors in the test comment; bounds 10× the measured.
- [ ] Fog: a far box vs a far card under camera fog (mean error recorded); `fogAmount: 0.5` warns once; an author's own `view.fog` is left alone.
- [ ] Shadows: parallel and spot `castsShadows` throw a visible shadow at 1280 × 720 and 480 × 270 for casters 50, 250 and 600 px from the receiver; a point light with `castsShadows` warns once.
- [ ] No light layer alive with `followLights`: the scene's own lights untouched, picture not black (Review Focus 5).
- [ ] Remove `followCamera`, `followLights`, `followFog` from THREE_ONLY; update the phase-1 `badkey` test (use `shareGpu` for the "three layer has it" line).
- [ ] Commit `feat(3d): followLights and followFog on scene3d layers`.

### Task 3: pick, hover, drag

**Files:** `Scene3DSequence.ts` (`pickAt(u, v)`, `dragPlane(point, plane)`, make meshes pickable), `src/core/pick.ts` (`kind: 'scene3d'`, `hit.scene3d`), `ai/tools/check.mjs` (`--pick` line), film `scene3d-pick`.

- [ ] Film tests: named meshes picked by their projected centres (both backends); empty space → no scene3d object; after `snapshot(f)` the pick answers for f; `hit.scene3d.grab('floor').move(x, y)` gives the exact delta; `check --at T --pick X,Y` prints `(scene3d: <name>)`.
- [ ] Commit `feat(3d): pick, hover and drag into scene3d layers`.

### Task 4: layerTexture

**Files:** Create `src/3d/layerTexture.ts` (`layerTexture(ctx, name, { resolution?, transparent? }): Promise<LayerTexture>`), host hooks on `Scene3DSequence` (find layer, draw-before hook run in `awaitFrameAt` after `update`, keep the 2D layer hidden in `syncFrame`, `screenOf`), film `scene3d-layer-texture`.

- [ ] Tests: colours on a face-on plane vs the flat 2D layer (mean < 3/255); the 2D layer's keyframed text differs between two frames of an EXPORT (decode the MP4 in the page); a pick on the screen names the 2D layer; an unknown name says the known names.
- [ ] Commit `feat(3d): layerTexture: a 2D layer on a mesh of a scene3d layer`.

### Task 5: loadModel, frameCamera, recipes

**Files:** Create `src/3d/gltf.ts`; recipes `scene3d-basics` (uses `loadModel`) and new `scene3d-in-space`; films `scene3d-recipe` (both recipes, run as written).

- [ ] Unit/film tests: `loadModel(spin-box.gltf, { animation: 'Spin' })` → `clips` = ['Spin']; `pose(t)` is a function of t (hash equality across orders); `fit(200)` makes the longest side 200; `frameCamera` puts the whole model inside the view (its projected bounds within the picture, margin respected).
- [ ] Commit `feat(3d): loadModel and frameCamera; recipe scene3d-in-space`.

### Task 6: reuse

**Files:** `Scene3DSequence.ts` (`reuseKey`, `_borrow`, `commitReuse`, donated/borrowed guards in `destroy`), film `scene3d-reuse`.

- [ ] Tests (port of `three-reuse.test.ts`): setVars runs setup once and keeps the same view; picture equals a fresh page with that value; `reuse: false` runs setup again; a rebuild that throws leaves the old layer drawing (Review Focus 4); layer textures rebind to the new tree's 2D layer.
- [ ] Commit `feat(3d): scene3d layers keep their scene across rebuilds`.

### Task 7: docs, warnings, whole suite

- [ ] dsl.md / api.md / SKILL / cheatsheet / pitfalls / README / CHANGELOG as the spec's "Warnings and docs" says; `npm run build:ai`; `npm run test:fast`.
- [ ] `npm run build && npm run release:check` green; final whole-branch review (fresh reviewer); fix pass.
- [ ] Update memory.
