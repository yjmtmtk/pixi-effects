# 2.5D Layers (`threeD` + `camera`) — Design

Status: draft for review. Direction follows [`docs/philosophy.md`](../../philosophy.md). Breaking changes elsewhere are acceptable (single experimental user).

## Goal

Let any 2D layer be placed in depth and viewed through a camera, After Effects "3D layer" style, using only the existing DSL vocabulary and **no three.js**. An AI should be able to write a parallax shot, a card flip or a camera move in a few lines of JSON.

This is sub-project 1 of 4 (see "Roadmap"). It is the "2.5D" half of the 3D direction in the philosophy doc.

## Non-goals (v1)

- Lights, shadows, material options, depth of field, motion blur.
- Plane intersection (AE draws interpenetrating planes). v1 sorts whole layers by depth.
- AE `orientation`, auto-orient, parenting, 3-axis `scale`, "collapse transformations".
- Masks, transitions and `filterArea` on `threeD` layers (see Limitations).
- three.js. The `type: 'three'` rework is sub-project 2.

## DSL

### 3D switch and properties

`SequenceCommon` gains one field:

```ts
threeD?: boolean;   // default false. Only 'threeD' layers use z / rotationX / rotationY and the camera.
```

New animatable props (usable in `initial`, `keyframes.set/to/from`, expressions allowed):

| Prop | Meaning | Default |
|---|---|---|
| `z` | Depth in comp pixels. **+z is toward the viewer** (same as CSS `translateZ`, three.js). | 0 |
| `rotationX`, `rotationY` | Degrees. Same sign convention as CSS `rotateX()` / `rotateY()`. | 0 |

Existing props keep their meaning: `x`, `y`, `scale/scaleX/scaleY`, `rotation` (degrees, rotation about Z), `alpha`, `anchorX/anchorY`, `pivotX/pivotY`. 3D rotations act about the same origin as 2D `rotation` (the `anchor`/`pivot` point). To spin about the centre use `anchorX: 0.5, anchorY: 0.5`.

Invariant: **a `threeD` layer with `z = 0`, no `rotationX/Y` and the default camera renders identically to the same layer with `threeD: false`.**

```ts
{ type: 'image', asset: 'photo', threeD: true,
  initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, rotationY: -35 },
  keyframes: [{ at: 0, to: { rotationY: 0 }, duration: 1, ease: 'power2.out' }] }
```

### Camera is a layer

```ts
interface CameraSequenceSpec extends SequenceCommon {   // type: 'camera'
  type: 'camera';
  // no extra static fields; everything animatable lives in initial / keyframes
}
```

Camera props (`initial` / keyframes, flat numbers, expressions allowed):

| Prop | Meaning | Default |
|---|---|---|
| `x`, `y` | Camera position in comp pixels | `W/2`, `H/2` |
| `z` | Camera depth (+z toward viewer). **Auto**: if unset, follows `fov` so the `z = 0` plane always renders at 1:1 | `(H/2) / tan(fov/2)` |
| `lookAtX`, `lookAtY`, `lookAtZ` | Point the camera looks at | `W/2`, `H/2`, `0` |
| `fov` | Vertical field of view, degrees | 40 |

Notes:
- With every prop unset the camera is the "home" camera: centred, looking straight at the `z = 0` plane, which maps 1:1 to comp pixels. This is also what applies when a comp has **no** camera layer.
- Animating only `fov` keeps the `z = 0` plane fixed and changes perspective strength: a dolly zoom, for free.
- Camera layers use the normal `at` / `duration` / `keyframes`. The active camera at time *t* is the top-most camera layer whose lifespan covers *t*; overlapping cameras are a warning, not an error. Non-overlapping cameras give camera cuts.
- A camera affects only `threeD` layers among its **siblings** (its own composition). A nested composition has its own camera for its children; the nested composition, if `threeD: true`, is itself a layer in the parent's space.
- `threeD: false` layers ignore the camera (AE behaviour) and keep stack order.

```ts
sequences: [
  { type: 'camera', keyframes: [{ at: 0, from: { x: 'GW/2 - 300' }, to: { x: 'GW/2 + 300' }, duration: 6, ease: 'sine.inOut' }] },
  { type: 'image', asset: 'far',  threeD: true, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, z: -400, scale: 1.4 } },
  { type: 'image', asset: 'near', threeD: true, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, z: 200 } },
]
```

### Depth ordering

Consecutive `threeD` layers in a composition's `sequences` form a *depth group*, drawn back to front by camera-space distance of each layer's origin plane (ties keep stack order). A non-`threeD` layer between them splits the group (AE behaviour). Layers at or behind the camera plane are hidden.

### Presets (later, not v1)

`dolly()`, `orbit()` etc. will be spec → spec helpers like `kenBurns`, compiling to camera keyframes. They need no runtime support and wait until the primitives settle.

## Architecture

New module `src/space/`, part of core (uses only `pixi.js`'s `PerspectiveMesh` and `RenderTexture`; no new dependency).

- `space/math.ts` — pure functions, no Pixi/DOM: build the layer model matrix from `{x,y,z,rotationX,rotationY,rotation,scaleX,scaleY,anchor/pivot}`, build the view/projection from the active camera `{x,y,z,lookAt,fov}` and comp size, project a layer's four corners to comp pixels, and return camera-space depth. Fully unit-tested.
- `space/CameraSequence.ts` — `type: 'camera'` sequence. Built-in (not via the external registry). Has no display object; holds the resolved animatable camera state that GSAP tweens.
- `space/Layer3D.ts` — wraps a `threeD` sequence: renders the sequence's display object into a `RenderTexture` and shows it with a `PerspectiveMesh` whose corners come from `math.ts`. Texture size follows the layer's intrinsic size × a resolution factor.
- `space/DepthGroup.ts` — groups consecutive `threeD` siblings and sorts them each frame.
- `sequences/Base.ts` / `Composition.ts` — create a `Layer3D` for `threeD` specs; otherwise unchanged.
- `core/Movie.ts` — `gotoFrame` already runs: timeline seek → per-frame sync (`awaitFrameAt`) → render. One step is added after the sync and before the render: `updateSpace()` re-projects every `Layer3D` in the tree using the active camera at the current time.

Why a separate projection step instead of tweening display props: GSAP tweens plain numeric props on any object, so `z` / `rotationX/Y` are tweened on a small per-layer transform state; the projection pass is the only code that turns that state into pixels. This keeps seek, playback and export on one path (philosophy, principle 4).

Seam for later: `Layer3D` is the only place that draws a projected layer. If quality or perf requires, replacing `PerspectiveMesh` with a custom 4×4 shader, or compositing via three.js for lights/shadows/intersection, changes `Layer3D` only. The DSL does not change.

## Errors and edge cases

- `fov` outside (1, 179) is clamped with one warning.
- `lookAt` equal to the camera position: warn once and fall back to looking along −z.
- Multiple overlapping cameras: top-most wins, warn once.
- `threeD` on `audio`: ignored with a warning (no visual).
- Layer at/behind the camera plane: `renderable = false` for that frame.

## Limitations (documented, v1)

- No plane intersection; large, steeply tilted overlapping layers can sort wrongly.
- Masks, transitions (which use filters/masks) and `filterArea` on `threeD` layers are not supported yet; filters on the layer itself are (they render inside the layer's texture). Mask/transition support is a follow-up that needs a decision on mask coordinate space.
- One extra render-texture pass per `threeD` layer per frame.

## Testing

- `math.ts` (pure): identity invariant (`z=0`, default camera ⇒ 2D corners); nearer ⇒ larger; `rotationX/Y` sign conventions via fixed corner coordinates; `fov` change with auto `z` leaves the `z=0` plane fixed; behind-camera detection; degenerate `lookAt`.
- Depth grouping and ordering; camera selection by time; cuts; overlap warning.
- Sequence build with a mocked Pixi layer (same style as existing sequence tests).
- Browser check: a new example `examples/11-depth.html` (parallax + card flip + dolly zoom), verified visually and by exporting a clip, since happy-dom cannot render.

## AI usability (a design requirement, not polish)

The end user of this DSL is an AI writing specs from natural language, often without seeing the result. Every choice above is checked against that; the following make it concrete.

- **No silent no-ops.** The most likely AI mistakes get a loud, one-time, actionable warning naming the layer, never silent acceptance:
  - `z` / `rotationX` / `rotationY` on a layer without `threeD: true` → "layer 'photo': z needs `threeD: true`".
  - A camera layer in a composition with no `threeD` layers → "camera has no effect".
  - Unknown prop with a near match (`rotateY`, `translateZ`, `depth`, `perspective`, `lookAt`) → "did you mean `rotationY` / `z` / `fov` / `lookAtX/Y/Z`?".
- **One obvious way.** No aliases (`perspective`, `depth`, `translateZ`, `zoom` are *not* accepted). Fewer synonyms means fewer wrong guesses and an unambiguous schema.
- **Safe defaults.** Omitting everything gives the home camera and a 1:1 `z = 0` plane, so a minimal spec is already correct and every addition is a small, local change.
- **Conventions stated once, in one table.** The DSL docs get a compact cheat-sheet at the top of the 3D section: axes (+x right, +y down, +z toward viewer), units (px, degrees), rotation signs (= CSS), default camera. An AI should not have to infer any of these.
- **Docs that cannot rot.** Every JSON/TS snippet in the 3D docs is a test fixture: it is built through the real spec path in tests, so documented examples are guaranteed valid.
- **Self-check without eyes** (hook now, surface in sub-project 4): `space/math.ts` is pure, so it can back a `movie.inspect(t)` that returns each layer's resolved on-screen corners, depth and visibility at time *t* as JSON, plus `movie.snapshot(t)` returning a PNG. An AI can then verify "is the card actually on screen at 2 s?" numerically or visually and iterate.
- **Types as documentation.** `CameraSequenceSpec` and the new `SequenceCommon` fields are exported from `pixi-effects`; sub-project 4's JSON Schema is generated from them, so the schema cannot drift from the code.

## Docs and examples

Add a "3D layers & camera" section to `docs/dsl.md` (cheat-sheet first, per above) and the playground presets, add `examples/11-depth.html`, and update the README feature list.

## Roadmap

1. **This spec**: 2.5D core, no three.
2. Rework `type: 'three'` into a JSON-described 3D model layer (optional entry), drawn through the same `Layer3D` seam and driven by the same camera.
3. Play-only build (`pixi-effects/player`).
4. AI support: JSON Schema from the types, spec validator with "did you mean" errors, `movie.inspect(t)` / `movie.snapshot(t)` for self-checking, AI-oriented reference.

## Open questions

- Mask / transition coordinate space for `threeD` layers (needed before lifting the limitation above).
- Default render-texture resolution policy (fixed ×1 vs. scaled by projected size).
