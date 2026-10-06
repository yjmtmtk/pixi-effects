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

### 5. AI-first authoring
- The DSL is designed to be *written by AI*: small closed vocabulary, discriminated unions, strict types, predictable defaults, errors that say what to fix.
- Types are the documentation. Prefer one obvious way to say a thing.
- Goal: describe a video in natural language, get a valid spec on the first or second try.

### 6. Light by default
- Core depends on `mediabunny` only, with PixiJS and GSAP as peers. People who never use 3D pay nothing: no install, no bundle weight, no import.
- Optional capabilities live behind optional entries and optional peer dependencies. Splitting is by *cost*, not by concept: the *spec language* stays one language.
- Thin over fat: wrap PixiJS, GSAP and mediabunny; do not reimplement them.

### 7. Every layer is, in the end, one display object
- Whatever a layer renders internally, it surfaces as a single textured object so masks, filters, transitions and export work on it for free.

## 3D direction

The author wants **After Effects-style 3D**, not "a three.js escape hatch":
- Layers can be 3D: `z`, `rotationX/Y`, a composition camera, lights, perspective.
- 3D models (glTF) and 3D primitives appear as ordinary layers.
- All of it is described with the same vocabulary (principle 2) and expressions (principle 3), animated by the same keyframes.
- three.js is an implementation detail behind an optional entry (principle 6). Users never need to know three's API to use 3D.

Order of work: (1) **2.5D without three.js** — any 2D layer gets `threeD` / `z` / `rotationX/Y`, the camera is a layer, drawn with Pixi's `PerspectiveMesh` (see `docs/superpowers/specs/2026-10-06-2-5d-layers-design.md`); (2) JSON-described 3D model layers on three.js, optional entry, same camera and vocabulary; (3) lights/shadows/plane intersection via a three.js compositor if ever needed. The spec language stays renderer-independent, so step 3 never changes what users write.

### Known drift (to be corrected)
The first three.js integration (`type: 'three'`) kept the good foundations (one-sprite output, deterministic `awaitFrameAt`, prefix-routed keyframe paths, optional entry) but:
- put functions (`setup` / `update` / `dispose`) in the spec, so 3D content is code, not data (breaks 1);
- exposes three's own object model to keyframes and scene authoring instead of the shared vocabulary (breaks 2);
- allows expressions only on layer size, not on scene values (breaks 3);
- needs `registerThree()`, a `three()` cast and the user's own `import * as THREE` (works against 5 and 6);
- explicitly listed "declarative / JSON-serializable 3D scene" as a non-goal, which is the root of the drift.

## Delivery

- **Render**: `movie.render()` → MP4 / WebM / MOV via WebCodecs.
- **Publish**: the same spec JSON plays on the web via the core runtime and `Controller`. A published video is a JSON file plus a small script.
- **Play-only build** (to build): a lightweight entry (e.g. `pixi-effects/player`) that loads a spec and plays it, with no export/encoding code. It is the "publish" half of the north star: small enough to embed in any page, same spec and same frames as the full library. Export (`Renderer`, encoders) and the export UI become opt-in (e.g. loaded on demand via dynamic import), so authoring tools get the full package and published pages stay light. Same principle as 3D: split by cost, not by concept.
- **AI support** (to build): a JSON Schema generated from the types, a spec validator with actionable errors, and an AI-oriented reference (`llms.txt`-style) so models can author specs reliably.
