# pixi-effects — Design Specification

**Date**: 2026-05-02
**Status**: Draft (awaiting user review)
**Origin**: Rename + TypeScript port of [`pixistage`](../../../pixistage/) (sibling directory). Behavior is preserved verbatim; the goal is type-safety, npm-standard distribution, and AI-friendly tooling.

---

## 1. Goals and constraints

### Why a TS rebuild

The JS pixistage works (verified end-to-end via playwright with 9 production-grade bug fixes). The TS rebuild is purely about **distribution and developer experience**, not about behavior changes:

1. **Type-safe public API** — composition spec, keyframe DSL, filter parameters are all expressed as discriminated unions / interfaces; users get autocomplete and compile-time errors without reading source.
2. **AI-friendly editor experience** — TS source allows reliable jump-to-definition, find-references, and rename-symbol; AI agents (and humans) can read the code's contracts directly from the types.
3. **npm-standard distribution** — `dist/` with `.js` + `.cjs` + `.d.ts` (+ source-maps + d-maps), `exports` field with `import`/`require`/`types` conditions; matches what pixi.js and mediabunny ship.
4. **`prepublishOnly` enforcement** — typecheck → test → build runs before any publish; broken builds cannot reach npm.

### Non-goals (v0.1)

- Behavior change of any kind (the rebuild is mechanical retrofit + types)
- Subpath exports beyond `.` and `./controller`
- WebGPU support
- Public extension API (`registerSequenceType`, `registerFilter`)
- Transition presets, mask sequences, subtitle tracks

---

## 2. Project structure

```
pixi-effects/                          (sibling of pixistage/)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── LICENSE
├── .gitignore                         (+ dist/)
├── docs/
│   ├── specs/                         (this file lives here)
│   └── plans/                         (implementation plan goes here next)
├── src/                               (TS source — repo-only, not published)
│   ├── index.ts                       (re-exports Movie)
│   ├── Controller.ts                  (re-exports as `pixi-effects/controller`)
│   ├── core/
│   │   ├── Movie.ts
│   │   ├── Composition.ts
│   │   ├── Timeline.ts
│   │   ├── AssetLoader.ts
│   │   ├── AudioMixer.ts
│   │   ├── FrameCache.ts
│   │   └── Renderer.ts
│   ├── sequences/
│   │   ├── Base.ts
│   │   ├── Composition.ts
│   │   ├── Video.ts
│   │   ├── Image.ts
│   │   ├── Text.ts
│   │   └── Audio.ts
│   ├── filters/
│   │   ├── index.ts
│   │   ├── ChromaKey.ts
│   │   ├── Blur.ts
│   │   └── ColorMatrix.ts
│   └── expr/
│       ├── Parser.ts
│       ├── Scope.ts
│       └── normalizeProps.ts
├── tests/                             (vitest, TS — not published)
│   ├── setup.ts                       (MockOfflineAudioContext)
│   ├── core/
│   │   ├── Timeline.test.ts
│   │   ├── AudioMixer.test.ts
│   │   └── FrameCache.test.ts
│   └── expr/
│       ├── Parser.test.ts
│       ├── Scope.test.ts
│       └── normalizeProps.test.ts
├── examples/                          (HTML demos — not published)
│   ├── basic.html
│   ├── chromakey.html
│   ├── nested.html
│   └── _assets/
│       ├── green.mp4
│       └── bgm.mp3
└── dist/                              (tsup output — gitignored, npm-published)
    ├── index.js / index.cjs / index.d.ts / index.d.cts
    └── Controller.js / Controller.cjs / Controller.d.ts / Controller.d.cts
```

**npm pack contents**: `dist/`, `README.md`, `LICENSE`, `package.json`. Source TS, tests, examples, docs are excluded via the `files` field.

**Consumer experience**:

```ts
// Bundler / Node
import { Movie } from 'pixi-effects';
import { Controller } from 'pixi-effects/controller';

// Browser CDN (esm.sh transpiles dist/ ESM as-is, types via .d.ts)
import { Movie } from 'https://esm.sh/pixi-effects';
```

---

## 3. Build / config files

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": false,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "examples"]
}
```

Notes:
- `strict: true` enables `noImplicitAny` + `strictNullChecks` + others.
- `moduleResolution: "bundler"` is the modern (TS 5.x) resolver that respects `package.json` `exports`.
- `noUncheckedIndexedAccess: false` — JSDoc-from-pixistage code uses array indexing freely. Re-evaluate later.
- `declarationMap: true` and `sourceMap: true` let consumers step into TS source from their debuggers.

### `tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    Controller: 'src/Controller.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  external: ['pixi.js', 'gsap', 'gsap/PixiPlugin', 'mediabunny', 'expr-eval'],
});
```

Two entries → two output sets in `dist/`. Dual ESM+CJS. `external` keeps peer/runtime deps unbundled so the consumer's bundler resolves them once.

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    globals: false,
    setupFiles: ['tests/setup.ts'],
  },
});
```

Same as pixistage's vitest.config but `.ts` and updated include glob.

### `package.json` (essentials)

```json
{
  "name": "pixi-effects",
  "version": "0.1.0",
  "description": "Declarative composition and video rendering for the web. Built on PixiJS v8.",
  "type": "module",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./controller": {
      "import": { "types": "./dist/Controller.d.ts", "default": "./dist/Controller.js" },
      "require": { "types": "./dist/Controller.d.cts", "default": "./dist/Controller.cjs" }
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md", "LICENSE"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "expr-eval": "^2.0.2",
    "mediabunny": "^1.43.0"
  },
  "peerDependencies": {
    "gsap": "^3.12.0",
    "pixi.js": "^8.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0",
    "happy-dom": "^15.0.0",
    "gsap": "^3.12.0",
    "pixi.js": "^8.16.0"
  },
  "engines": { "node": ">=18" }
}
```

`prepublishOnly` runs the full pipeline before any `npm publish`. Combined with `files`, this means publishing a broken package is structurally hard.

---

## 4. Migration order and typing strategy

### Bottom-up file order

Migrate one file at a time, keeping `npm run typecheck` clean after each step:

1. `expr/Parser.ts`, `expr/Scope.ts`, `expr/normalizeProps.ts` — pure functions, zero deps
2. `core/Timeline.ts` — depends on expr
3. `core/AudioMixer.ts` — Web Audio types, self-contained
4. `core/FrameCache.ts` — mediabunny `VideoSampleSink` types
5. `filters/` (ChromaKey, Blur, ColorMatrix, index) — Pixi v8 `Filter` types
6. `core/AssetLoader.ts` — Pixi `Assets` + mediabunny `Input`
7. `sequences/Base.ts` → `Image.ts` → `Text.ts` → `Audio.ts` → `Video.ts` → `Composition.ts`
8. `core/Composition.ts` — `buildSequenceTree` dispatch
9. `core/Movie.ts` — full lifecycle
10. `core/Renderer.ts` — `exportFrames`
11. `Controller.ts` — UI port
12. `src/index.ts` — public re-exports

For each `.js` source, the migration step is:
- Rename `.js` → `.ts`
- Add explicit type annotations on every export
- Let internal code use type inference
- Run `npm run typecheck` and resolve any `noImplicitAny` errors
- Update the corresponding test file to `.ts`
- Run `npm test` and confirm green

### Public type surface

All exported classes / functions / interfaces get explicit type annotations. Internal locals use inference.

```ts
// src/core/Movie.ts (excerpt)
export interface MovieOptions {
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: number;
  background?: string;
  canvas?: HTMLCanvasElement;
  assets?: AssetSpec[];
  composition?: CompositionSpec;
}

export interface FrameEvent { frame: number; totalFrames: number }
export interface ProgressEvent { progress: number; frame: number; totalFrames: number }

export class Movie {
  on(event: 'ready', fn: () => void): this;
  on(event: 'frame', fn: (e: FrameEvent) => void): this;
  on(event: 'progress', fn: (e: ProgressEvent) => void): this;
  on(event: string, fn: (...args: unknown[]) => void): this { /* ... */ }

  async init(options?: MovieOptions): Promise<void> { /* ... */ }
  async gotoFrame(frame: number, force?: boolean): Promise<void> { /* ... */ }
  async render(options?: RenderOptions): Promise<Blob> { /* ... */ }
  // ...
}
```

### DSL types

The composition / keyframe / filter DSL is the user-facing contract. Its types are the most important deliverable of this rebuild:

```ts
// src/types.ts (or co-located within each module)

/** A string is treated as an expr-eval expression evaluated against the scope. */
export type Expr = string;
export type PropValue = number | string | Expr;
export type Props = Record<string, PropValue>;

export interface Keyframe {
  at?: number;
  duration?: number;
  ease?: string;
  set?: Props;
  to?: Props;
  from?: Props;
}

export interface AssetSpec {
  name: string;
  src: string;
}

export interface ChromaKeyFilterSpec {
  type: 'chromaKey';
  name?: string;
  keyColor?: string | [number, number, number];
  threshold?: number;
  smoothing?: number;
  spill?: number;
}
export interface BlurFilterSpec {
  type: 'blur';
  name?: string;
  strength?: number;
  quality?: number;
  repeatEdgePixels?: boolean;
}
export interface ColorMatrixFilterSpec {
  type: 'colorMatrix';
  name?: string;
  brightness?: number;
  saturate?: number;
  contrast?: number;
  hue?: number;
  alpha?: number;
}
export type FilterSpec = ChromaKeyFilterSpec | BlurFilterSpec | ColorMatrixFilterSpec;

export interface SequenceCommon {
  name?: string;
  at?: number;
  duration?: number;
  initial?: Props;
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
}

export interface VideoSequenceSpec extends SequenceCommon {
  type: 'video';
  asset: string;
  loop?: boolean;
  audio?: boolean;
  volume?: number;
}
export interface ImageSequenceSpec extends SequenceCommon {
  type: 'image';
  asset: string;
}
export interface TextSequenceSpec extends SequenceCommon {
  type: 'text';
  text?: string;
  /** Subset of PIXI v8 TextStyleOptions. String values may be expressions. */
  style?: Record<string, PropValue | { color?: PropValue; width?: PropValue }>;
}
export interface AudioSequenceSpec extends SequenceCommon {
  type: 'audio';
  asset: string;
  loop?: boolean;
  volume?: number;
}
export interface CompositionSequenceSpec extends SequenceCommon {
  type: 'composition';
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
}
export type SequenceSpec =
  | VideoSequenceSpec
  | ImageSequenceSpec
  | TextSequenceSpec
  | AudioSequenceSpec
  | CompositionSequenceSpec;

export interface CompositionSpec extends SequenceCommon {
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
}
```

The discriminated union on `type` lets editor autocomplete narrow the rest of the object correctly, and `tsc` rejects mistyped fields at compile time.

---

## 5. Behavior preservation

The TS rebuild must replicate pixistage's runtime behavior **exactly**. The 9 production-grade fixes from pixistage's playwright sessions are all carried over:

| pixistage commit | What it fixes | Carried into pixi-effects via |
|---|---|---|
| `db4e265` | esm.sh double-load → `?bundle-deps` + version pin | `examples/*.html` importmap (verbatim) |
| `83c5cda` (superseded by composition mask drop) | Mask graphics rendered as white rect | `sequences/Composition.ts` builds wrapper without mask |
| `d031a36` | destroy resilient to partial init | `core/Movie.ts` `safeRun` helper |
| `b4b0e4b` | `'ready'` event sticky for late subscribers | `core/Movie.ts` `on` checks `isReady` |
| `0aa9db4` | filter-path keyframes (`'filters.b.strength'`) | `core/Timeline.ts` `partitionProps` |
| `7c44f6d` | FrameCache LRU + coalesce + close | `core/FrameCache.ts` |
| `f47cfae` | ChromaKey shader: GLSL 3.0, un-premul, re-premul output | `filters/ChromaKey.ts` |
| `462e995` | VideoSequence `_drawSeq` staleness | `sequences/Video.ts` |
| `a4d5d58` | Renderer `gotoFrame(frame, force=true)` for export correctness | `core/Renderer.ts` + `gotoFrame` signature |

PixiPlugin re-introduction (`f087c3d`) and `pixiwrap` shorthand auto-routing (`f087c3d`, in `Timeline.ts`) are also preserved.

---

## 6. Verification

The rebuild is "done" when all of the following pass:

1. **`npm run typecheck`** clean (zero errors)
2. **`npm test`** — 42+ vitest tests green (port everything from pixistage's `tests/`)
3. **`npm run build`** — `dist/` produced; size within ±15% of pixistage source size
4. **`npm pack --dry-run`** — only `dist/`, `README.md`, `LICENSE`, `package.json` listed
5. **playwright on the three examples**:
   - `basic.html`: title pop-in, subtitle slide-in, three feature pills, nested rotation, end fade-out
   - `chromakey.html`: green keyed out, blur ramp 2→3s, threshold ramp 4→5s, fade-out at end with no green leak
   - `nested.html`: nested composition rotation + audio fade in / out
6. **Export determinism**: two consecutive `movie.render()` calls produce decoded frames that are pixel-identical (mp4 header bytes naturally vary; first 31 frames sufficient)
7. **Live vs export pixel parity** at frames 0, 30, 90, 174 of `chromakey.html`: `avg channel diff < 1.0/255`, `heavy mismatches (>10) < 1%`

Items 5–7 mirror the playwright-driven verifications run on pixistage at HEAD.

---

## 7. Out of scope (post-v0.1)

- Subpath exports (`pixi-effects/filters`, `pixi-effects/sequences`) — wait until users ask
- WebGPU renderer
- Public extension API (`registerSequenceType`, `registerFilter`)
- Built-in transition presets / motion library
- Subtitle / caption track
- Mask sequences (composition clip-mask was deliberately dropped in pixistage)
- CI (GitHub Actions) — local-only initially

These are deliberate omissions; YAGNI for the rebuild.
