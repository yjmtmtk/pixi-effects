# Design Philosophy

> Status: draft, reverse-engineered from the source and confirmed with the author. Specs and plans should be checked against this document.

## North star

**An AI writes a video as data; the same data renders to a file and plays on the web.**

Everything below follows from that sentence. A composition is a JSON-shaped spec. An AI (or a human) produces it, the library renders it to MP4 / WebM / MOV, and the same spec plays in a browser with a tiny runtime. No step needs bespoke code.

## Principles

### 1. A composition is data, not code
- The spec is a tree of plain objects, discriminated by `type`. It must stay serializable: no functions, no live instances in the normal path.
- Features are built by *compiling down* to the existing vocabulary (`kenBurns`, `withFade`, `transitions` are spec → spec). A new feature should rarely need a new runtime concept.
- Escape hatches (a `custom` filter holding a live instance, user callbacks) exist for rare cases. They are explicit, documented as secondary, and never the main way to use a feature.

### 2. One vocabulary for every layer (the After Effects model)
- Every layer has `name / at / duration / initial / keyframes / filters / mask`. Keyframes are `{ at, from | to | set, duration, ease }`.
- Layers nest (compositions in compositions), stack, mask, filter and transition the same way regardless of what they contain.
- Dot paths (`filters.glow.outerStrength`) extend the vocabulary; they do not bypass it.
- A new layer type must plug into this vocabulary. If it can only be driven by its own mini-language or by callbacks, the design is wrong.

### 3. Expressions instead of code
- Anywhere a number goes, a string expression may go (`'GW * 0.5'`, `'min(W,H)/2'`), evaluated against a scope (`W/H/GW/GH/cover/t/d/T`).
- This keeps specs resolution-independent, serializable, and easy for an AI to generate and check.

### 4. Time is deterministic and seekable
- One frame path (`gotoFrame`) serves both playback and export. Preview must equal export.
- Anything time-varying is a pure function of time. No wall clock, no unseeded randomness.
- Two renderers, one library: WebGPU first, WebGL as the fallback. A filter the library adds must ship **both** a GLSL and a WGSL program and be tested on both (`?backend=webgl` in a check page hides `navigator.gpu`); a bug that shows on only one is a bug (the wipe / iris / dissolve shaders did not link on WebGL until 0.23). Determinism holds within one renderer; across the two, edge pixels can differ.

### 5. AI-first authoring
- The DSL is designed to be *written by AI*: small closed vocabulary, discriminated unions, strict types, predictable defaults, errors that say what to fix.
- Types are the documentation. Prefer one obvious way to say a thing.
- Goal: describe a video in natural language, get a valid spec on the first or second try.

### 6. Light by default
- Core depends on `mediabunny` only, with PixiJS as a peer. People who never use 3D pay nothing: no install, no bundle weight, no import.
- Optional capabilities live behind optional entries and optional peer dependencies. Splitting is by *cost*, not by concept: the *spec language* stays one language.
- Thin over fat: wrap PixiJS and mediabunny; do not reimplement them. The timeline is the one thing that is ours: a value at a time is computed from the script and the time alone, never from the way the playhead came.

### 7. Every layer is, in the end, one display object
- Whatever a layer renders internally, it surfaces as a single textured object so masks, filters, transitions and export work on it for free.

## 3D direction

The author wants **After Effects-style 3D**, not "an engine escape hatch":
- Layers can be 3D: `z`, `rotationX/Y`, a composition camera, lights, perspective (2.5D, any 2D layer: `threeD`).
- A real 3D scene (meshes, glTF models, PBR, shadows) is one more layer, `scene3d`, drawn by [PixiJS 3D](https://pixijs.com/3d) (`@pixi/3d`, entry `pixi-effects/3d`) **inside PixiJS's own renderer**: no second renderer, no canvas per layer, no copy. It lives in the same space as the cards (`followCamera`, `followLights`, `followFog`) and takes the same keyframes, masks, filters and blend modes.
- **PixiJS 3D is the main line, and the only 3D engine.** three.js was supported as a second engine until 0.51; it was removed in 0.52.0: two engines meant every feature built and tested twice, and the second engine kept bending the design of the first. A helper or a recipe for another engine never bends the core: three.js can still be drawn by a `canvas` layer (recipe `three-in-canvas`), with nothing in the library for it.

`scene3d` is a free box: `setup` builds the scene with PixiJS 3D's own objects, `update(t)` sets it from the time. The library does not wrap PixiJS 3D in a closed spec of its own; it adds what makes the box safe and easy to write: rules (a frame is a function of `t`), helpers (`loadModel`, `fitCamera`, `layerTexture`), and a checker (`check` draws each moment twice and names a layer that differs).

### Engine names

1. **The spec language owns the neutral names.** Layer types, keys and functions such as `model`, `light`, `camera`, `scene3d`, `threeD` and `register3D()` belong to pixi-effects, not to an engine; none of them carries an engine's name.
2. **An engine's name appears only in the engine's own objects**, the ones the author imports from it (`Mesh3D`, `Material3D` from `@pixi/3d`).
3. **Differences are reported, not named.** Something the engine cannot do in a neutral spec says so with a warning, as a renderer that cannot do a blend mode does.
4. **It is guarded**: `tests/docs/EngineNames.test.ts` fails when the main entry, the spec types, the `./3d` entry or any package entry carries an engine's name, when three.js comes back into the package, and when the main entry loads `@pixi/3d`.

## Delivery

- **Render**: `movie.render()` → MP4 / WebM / MOV via WebCodecs.
- **Publish**: the same spec JSON plays on the web via the core runtime and `Controller`. A published video is a JSON file plus a small script.
- **Play-only**: a page that only plays is light without a second entry. The encoder and video decoder (mediabunny, about 180 KB gzipped, a third of what a page loads) is fetched the first time an export or a video layer needs it, never at import; `useMediabunny()` says where it comes from. Same spec and same frames as an authoring page. A separate `pixi-effects/player` entry was weighed (2026-11-05) and not built: the checking tools left in the main entry are about 13 KB gzipped, not worth a second entry an AI would have to choose between. Same principle as 3D: split by cost, not by concept.
- **AI support** (to build): a JSON Schema generated from the types, a spec validator with actionable errors, and an AI-oriented reference (`llms.txt`-style) so models can author specs reliably.
