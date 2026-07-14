# three.js Sequence (`type: 'three'`) — Design

## Goal

Add a generic escape hatch for embedding a self-contained three.js 3D scene as a layer inside a 2D composition — the 3D analogue of `CustomFilterSpec`. The user builds an arbitrary three.js scene (models, lights, camera) in a callback; the library renders it offscreen every frame and composites the result into the PIXI scene graph as a normal textured sprite. Everything that works on a sprite — 2D keyframes, masks, filters, transitions, video export — works on the 3D layer for free.

This is the "AE 2024 3D-model-in-a-comp" style of 3D: the scene lives inside a rectangular layer. It is NOT the "every layer gets a z position and the comp has a camera" (AE 3D-layer / 2.5D) style — that is a possible future feature and this design deliberately lays infrastructure it can reuse (sequence-type registry, per-frame sync hook, three↔PIXI texture bridge).

## Non-goals

- Comp-wide 2.5D (camera + z-positioned 2D layers). Out of scope; future work.
- Declarative/JSON-serializable 3D scene description. The spec contains functions (`setup`, `update`), same trade-off as `CustomFilterSpec` taking a live `Filter` instance.
- Shared-WebGL-context rendering. `Movie.init` prefers a WebGPU PIXI backend, so three.js can never share PIXI's context in the general case. Rejected, not deferred.
- A DOM-overlay three canvas. Video export captures the PIXI canvas only; an overlay would not appear in exports. Rejected.
- Renderer sharing across multiple `three` layers. v1 spends one WebGL context per three layer (browser limit ≈ 8–16). A shared-renderer optimization can come later without API changes.

## Chosen rendering approach

**Offscreen three.js canvas → PIXI texture upload (approach A).**

Each `three` sequence owns an offscreen `<canvas>` with its own `THREE.WebGLRenderer({ alpha: true, antialias: true })`. Per frame: run the user's `update(t)`, `renderer.render(scene, camera)`, then `texture.source.update()` to upload the canvas into the PIXI texture. The upload is synchronous within the frame task, so `preserveDrawingBuffer` is not needed.

Why A over alternatives:

- Works regardless of PIXI backend (WebGPU or WebGL) — decisive, since `Movie` initializes WebGPU-first.
- No cross-library GL state leakage; failure modes are local to the sequence.
- The output is an ordinary sprite, so masks / filters / transitions / export compose with zero special cases.
- Cost is one canvas→GPU texture upload per three layer per frame; acceptable for the handful of 3D layers a composition realistically holds.

## Packaging

- New entry point `src/three/index.ts`, published as `pixi-effects/three` (tsup entry + `exports["./three"]`), mirroring the existing `./controller` subpath pattern.
- `three` becomes an **optional** peer dependency: `peerDependencies.three` + `peerDependenciesMeta: { three: { optional: true } }`. Added to devDependencies for tests and types.
- The core `pixi-effects` entry imports nothing from three — not even types. Users who never touch 3D see zero bundle or install impact.
- Activation is an explicit `registerThree()` call (a side-effectful bare import would risk being dropped by bundlers because the package declares `sideEffects: false`).

## Public API (`pixi-effects/three`)

```ts
import { registerThree, three } from 'pixi-effects/three';
import type { ThreeContext, ThreeSequenceSpec } from 'pixi-effects/three';
```

### `registerThree(): void`

Registers the `'three'` sequence type into the core sequence factory. Idempotent. Must be called before `Movie.init` builds a composition containing `type: 'three'`.

### `three(spec): SequenceSpec`

Identity helper that exists purely for typing: it accepts a strongly-typed `ThreeSequenceSpec` and returns it as a core `SequenceSpec`, so the core discriminated union never has to know three.js types. Users may also write the object literal directly with a cast; `three()` is the ergonomic path.

### `ThreeSequenceSpec`

```ts
interface ThreeSequenceSpec extends SequenceCommon {
  type: 'three';
  /** Layer size in composition px. Expressions allowed (e.g. 'W * 0.5'). Default: parent composition size. */
  width?: PropValue;
  height?: PropValue;
  /** Supersampling factor for the offscreen canvas. Default 1. */
  resolution?: number;
  /**
   * Build the scene. Add objects to `ctx.scene`, position `ctx.camera`
   * (or replace it entirely by returning `{ camera }`). Async so
   * GLTF/texture loading can be awaited — `Movie.init` waits for it.
   * Objects returned under `objects` become addressable from keyframes
   * as `three.<name>.<path>`.
   */
  setup: (ctx: ThreeContext) => Promise<ThreeSetupResult | void> | ThreeSetupResult | void;
  /**
   * Optional per-frame hook. `t` is the sequence-local time in seconds.
   * MUST derive state purely from `t` (no wall clock, no unseeded
   * randomness) — playback and export both seek arbitrarily, and export
   * must reproduce exactly what playback showed.
   */
  update?: (t: number, ctx: ThreeContext) => void;
  /** Optional cleanup for user-created GPU resources (geometries, materials, textures). Called from destroy(). */
  dispose?: (ctx: ThreeContext) => void;
}

interface ThreeSetupResult {
  objects?: Record<string, object>;   // keyframe-addressable registry
  camera?: THREE.Camera;              // replaces the default camera
}

interface ThreeContext {
  scene: THREE.Scene;
  camera: THREE.Camera;               // default: PerspectiveCamera(50, width/height, 0.1, 2000)
  renderer: THREE.WebGLRenderer;
  width: number;                      // resolved layer size in comp px
  height: number;
}
```

### Keyframes

Property paths prefixed `three.` are routed to the objects registry returned by `setup`:

```ts
keyframes: [
  { at: 0, to: { 'three.cube.rotation.y': Math.PI * 2 }, duration: 2 },
  { at: 1, to: { 'three.cube.material.opacity': 0, 'three.camera.fov': 30 }, duration: 1 },
  { at: 0, from: { alpha: 0, x: -100 }, duration: 0.5 },   // non-prefixed props hit the sprite as usual
]
```

`three.<name>.<dotted.path>` resolves `<name>` in the registry, walks the dotted path to the leaf's parent object, and hands that object to GSAP (`three.cube.rotation.y` → `gsap.to(cube.rotation, { y })`). `camera` is always implicitly present in the registry (whatever camera is current after setup). Numeric leaves only — same constraint GSAP itself imposes. Values go through the standard expression pipeline (`normalizeProps`), so `'W * 0.001'`-style expressions work.

Unresolvable paths (unknown name, missing property along the path) warn once via `console.warn` and are skipped — same failure mode as unknown filter names today.

## Core changes (two, both small and generic)

### 1. Sequence-type registry (`src/core/Composition.ts`)

Convert the fixed `staticTypes` map into a mutable registry:

```ts
export function registerSequenceType(
  type: string,
  ctor: SequenceCtor,
): void
```

`buildSequenceTree` consults the registry exactly as it consults `staticTypes` today; existing built-ins pre-populate it. `registerThree()` is one call into this. Unknown types keep the current warn-and-skip behavior. Because the core `SequenceSpec` union cannot name external types, `buildSequenceTree`'s spec parameter stays as-is and externally-registered specs pass through the `three()` helper's cast.

### 2. Generalized keyframe path routing (`src/core/Timeline.ts`)

`partitionProps` currently special-cases the `filters.` prefix. Generalize: `applyKeyframes` / `applyInitial` accept an optional map of prefix routers,

```ts
type PathRouter = (path: string) => { target: object; prop: string } | null;
// applyKeyframes(..., routers?: Record<string, PathRouter>)
```

The existing filter routing becomes the built-in `filters` router (behavior unchanged, `findFilter` reused). `ThreeSequence.bindTimeline` passes a `three` router that resolves against its objects registry. Base `Sequence.bindTimeline` grows an overridable way to contribute routers (protected method returning `{}` by default) so the base class stays ignorant of three.

## ThreeSequence (`src/three/ThreeSequence.ts`)

Extends `Sequence`. Lives entirely under `src/three/` so core never imports it.

- **`build()`**
  1. Resolve `width` / `height` expressions against the scope (default: parent comp size); compute pixel size `× resolution`.
  2. Create offscreen canvas, `WebGLRenderer({ canvas, alpha: true, antialias: true })`, `renderer.setSize`, transparent clear color (alpha 0).
  3. Create `Scene` and default `PerspectiveCamera(50, aspect, 0.1, 2000)`.
  4. `await spec.setup(ctx)`; merge returned `objects` into the registry (plus implicit `camera`); adopt returned `camera` if provided.
  5. Render frame 0 once, create `Texture.from(canvas)`, wrap in a `Sprite` sized to the layer's comp-px dimensions; that sprite is `this.target`.
- **`awaitFrameAt(local: number)`** — the per-frame sync hook. `Movie._awaitVideoFrames` already collects any sequence exposing this method (duck-typed, used by `VideoSequence`) and awaits it inside `gotoFrame`, which is the single frame path for both playback and export. Implementation: clamp `local` to `[0, duration]`, call `update(local, ctx)` if present, `renderer.render(scene, camera)`, `texture.source.update()`. Synchronous in practice; returns a resolved promise to satisfy the hook shape.
- **`bindTimeline()`** — contributes the `three` path router (see core change 2), then delegates to the base implementation for everything else (sprite props, renderable windowing).
- **`destroy()`** — call `spec.dispose(ctx)` if present, then `renderer.dispose()` + `renderer.forceContextLoss()`, drop scene/camera/registry references, then base `destroy()` (sprite/texture teardown).

Determinism contract (documented on `update`): state must be a pure function of `t`. The library guarantees `awaitFrameAt` is called exactly once per rendered frame with the frame's local time, in both playback and export.

## Error handling

- `registerThree()` not called but spec contains `type: 'three'` → existing unknown-type warn-and-skip path (composition still builds).
- `setup` throws/rejects → `build()` rejects → `Movie.init` rejects and runs its existing cleanup path. Renderer created before the failure is disposed in a `try/finally` inside `build()`.
- `update` throws → caught per frame, `console.warn` once per sequence, frame continues with last rendered texture (a bad user callback must not kill export mid-render).
- WebGL context creation fails (context limit reached) → `build()` rejects with a descriptive error naming the context limit.
- Unresolvable `three.*` keyframe path → warn once, skip that tween.

## Testing (vitest, happy-dom — no real WebGL)

Mock the `three` module (`vi.mock('three')`) with lightweight stand-ins (`WebGLRenderer` records `render`/`dispose` calls; `Scene`/`PerspectiveCamera` are plain objects). Cover:

- `registerSequenceType` / `registerThree` registration and idempotency; unknown-type warning when unregistered.
- `three.*` path routing: resolution to leaf-parent + prop, implicit `camera`, unknown-name warn-and-skip, expression values.
- Lifecycle order: setup → (frame ticks: update → render → texture update) → dispose; `update` receives correctly clamped local time for `at`/`duration` windows.
- Error paths: setup rejection propagates; update throw is contained.
- Core regression: existing `filters.*` routing behavior unchanged after the Timeline generalization (existing tests must stay green).

The texture-upload bridge (`Texture.from(canvas)` + `source.update()`) can't be unit-tested without WebGL; it is covered by the example page (manual verification, same as existing visual features).

## Example

`examples/10-three.html`: importmap pulling `three` from a CDN, `registerThree()`, a spinning lit 3D logo (`three` layer) composited between an image background and a text title, with a `three.*` keyframe driving rotation and a 2D alpha fade — demonstrating both animation paths and standard compositing. Export button included, proving the layer appears in rendered video.

## File inventory

- `src/three/index.ts` — `registerThree`, `three()` helper, public types (new)
- `src/three/ThreeSequence.ts` — the sequence implementation (new)
- `src/core/Composition.ts` — `registerSequenceType` registry (modify)
- `src/core/Timeline.ts` — prefix-router generalization of `partitionProps`/`applyKeyframes`/`applyInitial` (modify)
- `src/sequences/Base.ts` — overridable router-contribution hook in `bindTimeline` (modify, minimal)
- `package.json` / `tsup.config.ts` — `./three` entry, optional peer dep (modify)
- `tests/three/*.test.ts` — unit tests per the Testing section (new)
- `examples/10-three.html` — demo (new)
- `docs/dsl.md` / `docs/api.md` — document the spec, determinism contract, context-count limitation (modify)
