# The `canvas` layer (0.37) Implementation Plan

> **For agentic workers:** execute inline, task by task, test first (watch it fail), commit per task. Spec: `docs/superpowers/specs/2026-10-14-canvas-layer-design.md`.

**Goal:** `type: 'canvas'`: a layer whose picture is drawn by `draw(ctx, t, info)` into its own canvas, placed in the stack like an image.
**Architecture:** modelled on `ShaderSequence` (a `Sprite` over the layer's own canvas, redrawn in `awaitFrameAt(local)`, uploaded with `texture.source.update()`), registered in `src/core/Composition.ts`, keys in `layerKeys.ts`, `params` animated through a path router like `uniforms`.
**Tech stack:** TypeScript, vitest with the pixi mock (units) and Chrome (real-browser checks), the `check` tool.

## Global constraints
- Same frame = same pixels: the canvas is cleared before every call; `draw` gets the layer's own time; no state survives a call; `random()` is seeded and restarts at every call.
- `params` is a flat object of numbers; keyframes address `params.<name>`; an unknown name warns with did-you-mean (like `uniforms`).
- A mistake is a build-time sentence naming the layer; the layer draws a loud checkerboard rather than nothing.
- Width / height at most 8192; `resolution` 0.25 to 4.
- Documented as an escape hatch (functions in the spec), like `three` and `custom`.

## Tasks
1. **Types and keys.** `CanvasSequenceSpec` in `src/types.ts` and the union; `CANVAS` keys in `layerKeys.ts` (with the `Covers` assert); export the type from `index.ts`; `matte.ts` treats `canvas` as a sprite-backed mask like `shader`. Test: `lintKeys` knows the keys and says did-you-mean for a typo.
2. **The layer (`src/sequences/Canvas.ts`).** `build`: validate (draw, sizes, resolution, params, seed, smoothing) with warnings; own canvas + sprite; `setup` (sync or async) once, its value in `info.state`; `awaitFrameAt` draws once per distinct `(local, params)`; the `params` router; errors in `draw` and `setup` caught and said once, checkerboard drawn; `destroy` frees the canvas and texture. Register `canvas` in `Composition.ts`. Tests on the mock: `draw` gets `t`, `frame`, `params`, a cleared canvas, `state`, `duration`, `progress`; `params` keyframes move the value; seeded `random` repeats per call; one draw per distinct `(t, params)`; missing `draw`; throwing `draw`/`setup`; size clamps; `resolution`.
3. **Determinism guard.** At build a static scan of `draw.toString()` for `Math.random(`, `Date.now(`, `performance.now(`, `new Date(` (a warning, said once). In `reviewMovie` (so `check` and the Playground): for each canvas layer, call `draw` twice at the same `t` for up to 4 moments and compare pixels; a difference is a review problem naming the layer and moments. Tests: a layer using `Math.random` is flagged by both; a pure one is not.
4. **Real browser.** A page `examples/_checks/canvas-layer.html`: a rectangle at `t`, a mask, a filter, a blend mode, `params` keyframes, a `setup` state, a seeded `random`; tests that `snapshot` shows what `draw` drew where it should, two renders of one frame are byte-identical, and the export runs. Mutation checks on the guards.
5. **Docs.** `docs/dsl.md` (a section next to `shader`: the contract, the keys, `info`, what it cannot do), `docs/api.md`, cheatsheet, SKILL.md line, `help canvas` works (heading), pitfalls (stateful simulation in `setup`, no `Math.random`, the canvas is cleared each frame, the layer cannot see what is below), recipes (a trail, tree rings, a waveform, a pixel sprite), `llms-full.txt`, `docs/api-surface.txt`, CHANGELOG (Unreleased).
6. **Release gate.** `npm test`, `tsc`, a fresh-context review of the diff, fixes, then the release steps (the owner's go).
