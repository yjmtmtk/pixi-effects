# pixi-effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the working `pixistage` (JS) library to `pixi-effects` (TS) with npm-standard distribution, preserving runtime behavior verbatim while adding strict type-safety on the public API.

**Architecture:** TS source under `src/` migrated bottom-up (expr → core/Timeline → filters → core infra → sequences → core/Movie+Renderer → Controller → index). tsup emits dual ESM+CJS + `.d.ts` to `dist/`; `prepublishOnly` enforces typecheck → test → build before any publish. Public DSL is a discriminated union over `SequenceSpec` / `FilterSpec` so editors narrow types correctly.

**Tech Stack:** TypeScript 5.5+, tsup (esbuild + rollup-plugin-dts), vitest + happy-dom, peer-deps PixiJS v8.10+ and gsap v3.12+, runtime deps mediabunny + expr-eval. Reference impl: `../pixistage/src/` (sibling JS codebase, all 9 production-grade fixes verified via playwright).

---

## File Structure

| Pixistage source (`../pixistage/src/`) | New TS file (`src/`) | Public types added |
|---|---|---|
| (new) | `src/types.ts` | `Expr`, `Props`, `Keyframe`, `AssetSpec`, `FilterSpec`, `SequenceSpec`, `CompositionSpec`, etc. |
| `expr/Parser.js` | `src/expr/Parser.ts` | `isExpr(v): v is string`, `evaluateExpr(src: string, scope: Record<string, number>): number` |
| `expr/Scope.js` | `src/expr/Scope.ts` | `Scope` interface, `buildScope(seq, parent, root): Scope` |
| `expr/normalizeProps.js` | `src/expr/normalizeProps.ts` | `normalizeProps<T>(input: T, scope: Scope, opts?): T`-shaped result |
| `core/Timeline.js` | `src/core/Timeline.ts` | `Kind`, `NormalizedKeyframe`, `resolveAt`, `normalizeKeyframe`, `partitionProps`, `applyKeyframes`, `applyInitial` |
| `core/AudioMixer.js` | `src/core/AudioMixer.ts` | `AudioDescriptor`, `mixdown(audios, dur, sampleRate?): Promise<AudioBuffer | null>` |
| `core/FrameCache.js` | `src/core/FrameCache.ts` | `FrameCache` class with `getFrameAt(t): Promise<VideoFrame | null>`, `dispose()` |
| `filters/ChromaKey.js` | `src/filters/ChromaKey.ts` | `ChromaKeyFilter` extends Pixi `Filter`, options interface |
| `filters/Blur.js` | `src/filters/Blur.ts` | `Blur` extends Pixi `BlurFilter`, options interface |
| `filters/ColorMatrix.js` | `src/filters/ColorMatrix.ts` | `ColorMatrix` extends Pixi `ColorMatrixFilter`, options interface |
| `filters/index.js` | `src/filters/index.ts` | `createFilter(spec: FilterSpec): Filter`, `findFilterByName(filters, name): Filter | null` |
| `core/AssetLoader.js` | `src/core/AssetLoader.ts` | `AudioAssetData`, `VideoAssetData`, `loadAssetBundle(assets, ctx): Promise<Record<string, ...>>` |
| `sequences/Base.js` | `src/sequences/Base.ts` | `Sequence` class (abstract `build`), shared method types |
| `sequences/Image.js` | `src/sequences/Image.ts` | `ImageSequence` extends `Sequence` |
| `sequences/Text.js` | `src/sequences/Text.ts` | `TextSequence` extends `Sequence` |
| `sequences/Audio.js` | `src/sequences/Audio.ts` | `AudioSequence` extends `Sequence` |
| `sequences/Video.js` | `src/sequences/Video.ts` | `VideoSequence` extends `Sequence`, with `awaitFrameAt` |
| `sequences/Composition.js` | `src/sequences/Composition.ts` | `CompositionSequence` extends `Sequence` |
| `core/Composition.js` | `src/core/Composition.ts` | `buildSequenceTree(specs, parent, root, loader): Promise<Sequence[]>` |
| `core/Movie.js` | `src/core/Movie.ts` | `Movie` class, `MovieOptions`, `FrameEvent`, `ProgressEvent` |
| `core/Renderer.js` | `src/core/Renderer.ts` | `RenderOptions`, `exportFrames(movie, options?): Promise<Blob>` |
| `Controller.js` | `src/Controller.ts` | `Controller` class, `ControllerOptions` |
| `index.js` | `src/index.ts` | re-exports `Movie`, `Controller`, public types |

| Pixistage test (`../pixistage/tests/`) | New TS test (`tests/`) |
|---|---|
| `setup.js` | `tests/setup.ts` (MockOfflineAudioContext) |
| `expr/Parser.test.js` | `tests/expr/Parser.test.ts` |
| `expr/Scope.test.js` | `tests/expr/Scope.test.ts` |
| `expr/normalizeProps.test.js` | `tests/expr/normalizeProps.test.ts` |
| `core/Timeline.test.js` | `tests/core/Timeline.test.ts` |
| `core/AudioMixer.test.js` | `tests/core/AudioMixer.test.ts` |
| `core/FrameCache.test.js` | `tests/core/FrameCache.test.ts` |

| Pixistage examples | New copy |
|---|---|
| `../pixistage/examples/basic.html` | `examples/basic.html` |
| `../pixistage/examples/chromakey.html` | `examples/chromakey.html` |
| `../pixistage/examples/nested.html` | `examples/nested.html` |
| `../pixistage/examples/_assets/green.mp4` | `examples/_assets/green.mp4` |
| `../pixistage/examples/_assets/bgm.mp3` | `examples/_assets/bgm.mp3` |

---

## Phase 0: Scaffolding

### Task 1: package.json + .gitignore + LICENSE + README

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Write `package.json`**

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
  "keywords": [
    "pixi", "pixijs", "video", "composition", "compositing", "rendering",
    "after-effects", "motion-graphics", "timeline", "webgl", "gsap", "keyframe", "typescript"
  ],
  "license": "MIT",
  "author": "tefista <tefista.dev@gmail.com>",
  "repository": { "type": "git", "url": "git+https://github.com/tefista/pixi-effects.git" },
  "homepage": "https://github.com/tefista/pixi-effects#readme",
  "bugs": { "url": "https://github.com/tefista/pixi-effects/issues" },
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

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
npm-debug.log*
.npm
.env
.env.local
coverage/
.vscode/
.idea/
*.swp
.cache/
```

- [ ] **Step 3: Copy `LICENSE` from pixistage**

Run: `cp ../pixistage/LICENSE LICENSE`
The MIT license text is identical; copyright year/holder unchanged.

- [ ] **Step 4: Write minimal `README.md`**

```markdown
# pixi-effects

> **Status**: pre-alpha (v0.1.0). TypeScript port of [pixistage](../pixistage/), API stable but unpublished.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/), with strict TypeScript types.

## Install

\`\`\`bash
npm install pixi-effects pixi.js gsap
\`\`\`

## Quickstart

\`\`\`ts
import { Movie } from 'pixi-effects';
import { Controller } from 'pixi-effects/controller';

const movie = new Movie();
new Controller(movie, { container: document.getElementById('ctrl')! });
await movie.init({
  canvas: document.querySelector('canvas')!,
  width: 1280, height: 720, duration: 5, frameRate: 30,
  composition: {
    sequences: [
      {
        type: 'text',
        text: 'hello pixi-effects',
        initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.05', fill: '#ffffff', fontFamily: 'Arial' },
      },
    ],
  },
});

movie.play();
const blob = await movie.render({ format: 'mp4' });
\`\`\`

## Documentation

See [`docs/specs/`](./docs/specs/) for the design spec.

## License

MIT — see [LICENSE](./LICENSE).
```

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore LICENSE README.md
git commit -m "chore: package metadata, license, gitignore, initial README"
```

---

### Task 2: TS / tsup / vitest config

**Files:**
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write `tsconfig.json`**

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

- [ ] **Step 2: Write `tsup.config.ts`**

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

- [ ] **Step 3: Write `vitest.config.ts`**

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

- [ ] **Step 4: Write `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Write empty `tests/setup.ts` for now**

```ts
// MockOfflineAudioContext is installed in Phase 5 along with AudioMixer.
// happy-dom does not implement Web Audio; tests that need OfflineAudioContext
// rely on this setup file to install a mock.
```

- [ ] **Step 6: Install deps and verify**

Run:
```bash
npm install
npm run typecheck   # should pass (no src/ files yet, smoke is a test)
npm test            # should pass with 1 smoke test
```

If `npm install` complains about a peer-dep (gsap or pixi.js), confirm they are in `devDependencies` so vitest can import them.

If `tsup` has not yet been requested by `tsup.config.ts` import (no `npm run build` in this task), no need to verify build here — Phase 1 will exercise it.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsup.config.ts vitest.config.ts tests/smoke.test.ts tests/setup.ts package-lock.json
git commit -m "chore: tsconfig + tsup + vitest infra, smoke test passing"
```

---

## Phase 1: Shared types

### Task 3: `src/types.ts` — DSL discriminated unions

**Files:**
- Create: `src/types.ts`

This file is the single source of truth for the public DSL. Every other module imports from here. No tests — types are validated by the typecheck step at the end.

- [ ] **Step 1: Write `src/types.ts`**

```ts
/**
 * pixi-effects public DSL types.
 *
 * The composition spec users pass to `Movie.init({ composition })` is
 * shaped by `CompositionSpec`. Every `SequenceSpec` is a discriminated
 * union over `type`, so editor autocomplete narrows correctly.
 */

/** A string is treated as an expr-eval expression evaluated against the scope. */
export type Expr = string;

/** Any prop value: a number, an Expr string, or any string passed through verbatim (e.g. color hex, font names). */
export type PropValue = number | string;

/** Generic prop bag (key → value). */
export type Props = Record<string, PropValue>;

/** A single keyframe entry. Either `set`, `to`, `from`, or `from`+`to` is meaningful per kind. */
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

// ─── Filter specs ─────────────────────────────────────────────────────────

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

// ─── Sequence specs ───────────────────────────────────────────────────────

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
  /** Subset of PIXI v8 TextStyleOptions. String values may be exprs (e.g. fontSize: 'GW * 0.05'). */
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

/** Top-level composition (root node) — same as `CompositionSequenceSpec` minus the discriminant. */
export interface CompositionSpec extends SequenceCommon {
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
}

// ─── Internal shape types (used by sequences and core) ────────────────────

/** Resolved parent / root composition shape used for scope and sizing. */
export interface CompositionShape {
  width: number;
  height: number;
  duration: number;
}

/** Audio descriptor pushed to the mixdown queue by AudioSequence/VideoSequence. */
export interface AudioDescriptor {
  buffer: AudioBuffer;
  loop: boolean;
  start: number;
  end: number;
  initialVolume: number;
  volumeKeyframes: { time: number; value: number }[];
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: passes (no src/ files reference these yet, but tsc walks them).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): public DSL discriminated unions and core shape types"
```

---

## Phase 2: expr layer

### Task 4: `src/expr/Parser.ts` + test

**Files:**
- Create: `src/expr/Parser.ts`
- Create: `tests/expr/Parser.test.ts`

- [ ] **Step 1: Write `tests/expr/Parser.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { evaluateExpr, isExpr } from '../../src/expr/Parser';

describe('isExpr', () => {
  it('returns false for numbers', () => {
    expect(isExpr(42)).toBe(false);
    expect(isExpr(0)).toBe(false);
  });
  it('returns false for booleans', () => {
    expect(isExpr(true)).toBe(false);
  });
  it('returns true for strings that look like expressions', () => {
    expect(isExpr('W/2')).toBe(true);
    expect(isExpr('cover')).toBe(true);
    expect(isExpr('GW * 0.05')).toBe(true);
  });
  it('returns false for null/undefined', () => {
    expect(isExpr(null)).toBe(false);
    expect(isExpr(undefined)).toBe(false);
  });
});

describe('evaluateExpr', () => {
  it('evaluates simple arithmetic', () => {
    expect(evaluateExpr('1 + 2', {})).toBe(3);
  });
  it('uses scope variables', () => {
    expect(evaluateExpr('W / 2', { W: 800 })).toBe(400);
  });
  it('handles min/max via parser builtins', () => {
    expect(evaluateExpr('min(W, H)', { W: 100, H: 200 })).toBe(100);
  });
  it('returns 0 and warns on parse error', () => {
    expect(evaluateExpr('@@@', {})).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

Run: `npm test -- tests/expr/Parser.test.ts`

- [ ] **Step 3: Write `src/expr/Parser.ts`**

```ts
import { Parser } from 'expr-eval';

const parser = new Parser();

export function isExpr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function evaluateExpr(source: string, scope: Record<string, number>): number {
  try {
    return parser.evaluate(source, scope) as number;
  } catch (e) {
    console.warn(`pixi-effects: expression failed: ${source}`, e);
    return 0;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/expr/Parser.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/expr/Parser.ts tests/expr/Parser.test.ts
git commit -m "feat(expr): Parser singleton with isExpr/evaluateExpr (TS)"
```

---

### Task 5: `src/expr/Scope.ts` + test

**Files:**
- Create: `src/expr/Scope.ts`
- Create: `tests/expr/Scope.test.ts`

- [ ] **Step 1: Write `tests/expr/Scope.test.ts`**

Copy verbatim from `../pixistage/tests/expr/Scope.test.js`, change extension to `.ts`, change import path to `'../../src/expr/Scope'`. Test bodies are pure JS expressions — no type changes needed in tests.

The test file:

```ts
import { describe, it, expect } from 'vitest';
import { buildScope } from '../../src/expr/Scope';

const fakeSeq = (overrides: Record<string, unknown> = {}) => ({
  intrinsicWidth: 200,
  intrinsicHeight: 100,
  at: 0,
  duration: 5,
  parent: null,
  ...overrides,
}) as Parameters<typeof buildScope>[0];

const fakeRoot = { width: 1920, height: 1080, duration: 10 };

describe('buildScope', () => {
  it('exposes w/h from sequence intrinsic size', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.w).toBe(200);
    expect(s.h).toBe(100);
  });
  it('exposes W/H from immediate parent', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.W).toBe(800);
    expect(s.H).toBe(600);
  });
  it('exposes GW/GH from root', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.GW).toBe(1920);
    expect(s.GH).toBe(1080);
  });
  it('contain = min(W/w, H/h)', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.contain).toBe(4);
  });
  it('cover = max(W/w, H/h)', () => {
    const s = buildScope(fakeSeq(), { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.cover).toBe(6);
  });
  it('contain handles tall image in wide parent', () => {
    const seq = fakeSeq({ intrinsicWidth: 100, intrinsicHeight: 800 });
    const s = buildScope(seq, { width: 1920, height: 1080, duration: 10 }, fakeRoot);
    expect(s.contain).toBeCloseTo(1.35);
  });
  it('exposes t/d/T', () => {
    const seq = fakeSeq({ at: 2, duration: 3 });
    const s = buildScope(seq, { width: 800, height: 600, duration: 10 }, fakeRoot);
    expect(s.t).toBe(2);
    expect(s.d).toBe(3);
    expect(s.T).toBe(10);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `src/expr/Scope.ts`**

```ts
import type { CompositionShape } from '../types';

/** Sequence-shaped input expected by buildScope. */
export interface ScopeSequence {
  intrinsicWidth: number;
  intrinsicHeight: number;
  at?: number;
  duration?: number;
}

/** Variables available to expr-eval evaluation. */
export interface Scope {
  w: number; h: number;
  W: number; H: number;
  GW: number; GH: number;
  contain: number; cover: number;
  t: number; d: number; T: number;
}

export function buildScope(
  sequence: ScopeSequence,
  parent: CompositionShape | null,
  root: CompositionShape,
): Scope {
  const w = sequence.intrinsicWidth || 0;
  const h = sequence.intrinsicHeight || 0;
  const W = parent?.width ?? root.width;
  const H = parent?.height ?? root.height;
  const GW = root.width;
  const GH = root.height;
  const contain = (w === 0 || h === 0) ? 1 : Math.min(W / w, H / h);
  const cover   = (w === 0 || h === 0) ? 1 : Math.max(W / w, H / h);
  return {
    w, h, W, H, GW, GH,
    contain, cover,
    t: sequence.at ?? 0,
    d: sequence.duration ?? parent?.duration ?? root.duration,
    T: parent?.duration ?? root.duration,
  };
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/expr/Scope.ts tests/expr/Scope.test.ts
git commit -m "feat(expr): buildScope with corrected contain/cover (TS)"
```

---

### Task 6: `src/expr/normalizeProps.ts` + test

**Files:**
- Create: `src/expr/normalizeProps.ts`
- Create: `tests/expr/normalizeProps.test.ts`

- [ ] **Step 1: Write `tests/expr/normalizeProps.test.ts`**

Same as `../pixistage/tests/expr/normalizeProps.test.js` with `.ts` extension and import path adjusted:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeProps } from '../../src/expr/normalizeProps';

describe('normalizeProps', () => {
  it('returns numbers unchanged', () => {
    expect(normalizeProps({ x: 100 }, { W: 800 })).toEqual({ x: 100 });
  });
  it('evaluates string values as expressions', () => {
    expect(normalizeProps({ x: 'W / 2' }, { W: 800 })).toEqual({ x: 400 });
  });
  it('recurses into nested objects', () => {
    const out = normalizeProps({ scale: { x: 'cover', y: 'cover' } }, { cover: 2 });
    expect(out).toEqual({ scale: { x: 2, y: 2 } });
  });
  it('evaluates strings inside arrays', () => {
    expect(normalizeProps({ pos: ['W/2', 'H/2'] }, { W: 800, H: 600 })).toEqual({ pos: [400, 300] });
  });
  it('preserves non-expression strings via skipKeys', () => {
    expect(normalizeProps(
      { fill: '#ff0000', x: 'W' },
      { W: 800 },
      { skipKeys: ['fill'] }
    )).toEqual({ fill: '#ff0000', x: 800 });
  });
  it('does not mutate the input', () => {
    const input = { x: 'W' };
    const out = normalizeProps(input, { W: 100 });
    expect(input).toEqual({ x: 'W' });
    expect(out).toEqual({ x: 100 });
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `src/expr/normalizeProps.ts`**

```ts
import { evaluateExpr, isExpr } from './Parser';

export interface NormalizeOptions {
  /** Keys whose string values should NOT be evaluated as expressions (e.g. 'fill', 'fontFamily'). */
  skipKeys?: string[];
}

export function normalizeProps<T>(
  input: T,
  scope: Record<string, number>,
  options: NormalizeOptions = {},
): T {
  const skip = new Set(options.skipKeys ?? []);
  return walk(input, scope, skip, null) as T;
}

function walk(
  value: unknown,
  scope: Record<string, number>,
  skip: Set<string>,
  currentKey: string | null,
): unknown {
  if (Array.isArray(value)) {
    return value.map(v => walk(v, scope, skip, currentKey));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = walk((value as Record<string, unknown>)[k], scope, skip, k);
    }
    return out;
  }
  if (isExpr(value) && !(currentKey !== null && skip.has(currentKey))) {
    return evaluateExpr(value, scope);
  }
  return value;
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/expr/normalizeProps.ts tests/expr/normalizeProps.test.ts
git commit -m "feat(expr): recursive normalizeProps with typed generic (TS)"
```

---

## Phase 3: Filters

### Task 7: `src/filters/ChromaKey.ts`

**Files:**
- Create: `src/filters/ChromaKey.ts`

Browser-only (Pixi v8 Filter); no unit test.

- [ ] **Step 1: Write `src/filters/ChromaKey.ts`**

The shader source must be byte-identical to `../pixistage/src/filters/ChromaKey.js` (un-premul + re-premul output, GLSL 3.0 syntax). Add types around the constructor and accessors.

```ts
import { Filter, GlProgram, defaultFilterVert, Color } from 'pixi.js';

const FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec3 uKeyColor;
uniform float uThreshold;
uniform float uSmoothing;
uniform float uSpill;

out vec4 finalColor;

void main(void) {
    vec4 raw = texture(uTexture, vTextureCoord);

    // Pixi passes pre-multiplied alpha into filters. Un-premultiply so the
    // chromakey distance is computed against the source color, not a darkened
    // version that drifts away from the key as sprite.alpha drops.
    vec3 rgb = raw.a > 0.0 ? raw.rgb / raw.a : vec3(0.0);

    vec3 ycbcr = vec3(
        0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
        -0.169 * rgb.r - 0.331 * rgb.g + 0.5 * rgb.b + 0.5,
        0.5 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5
    );
    vec3 keyYcbcr = vec3(
        0.299 * uKeyColor.r + 0.587 * uKeyColor.g + 0.114 * uKeyColor.b,
        -0.169 * uKeyColor.r - 0.331 * uKeyColor.g + 0.5 * uKeyColor.b + 0.5,
        0.5 * uKeyColor.r - 0.419 * uKeyColor.g - 0.081 * uKeyColor.b + 0.5
    );

    float dist = length(ycbcr - keyYcbcr);
    float alpha = smoothstep(uThreshold - uSmoothing, uThreshold + uSmoothing, dist);

    vec3 despilled = rgb;
    if (uSpill > 0.0) {
        float spillAmount = max(0.0, rgb.g - max(rgb.r, rgb.b));
        despilled.g -= spillAmount * uSpill;
    }

    float outA = raw.a * alpha;
    finalColor = vec4(despilled * outA, outA);
}
`;

export interface ChromaKeyOptions {
  keyColor?: string | [number, number, number];
  threshold?: number;
  smoothing?: number;
  spill?: number;
}

function toRgb01(input: string | [number, number, number]): [number, number, number] {
  if (Array.isArray(input)) return [input[0], input[1], input[2]];
  const c = new Color(input);
  return [c.red, c.green, c.blue];
}

export class ChromaKeyFilter extends Filter {
  constructor(options: ChromaKeyOptions = {}) {
    const {
      keyColor = '#00ff00',
      threshold = 0.4,
      smoothing = 0.1,
      spill = 0.2,
    } = options;
    super({
      glProgram: new GlProgram({ vertex: defaultFilterVert, fragment: FRAGMENT }),
      resources: {
        chromaUniforms: {
          uKeyColor:   { value: toRgb01(keyColor), type: 'vec3<f32>' },
          uThreshold:  { value: threshold,         type: 'f32' },
          uSmoothing:  { value: smoothing,         type: 'f32' },
          uSpill:      { value: spill,             type: 'f32' },
        },
      },
    });
  }

  get threshold(): number { return this.resources.chromaUniforms.uniforms.uThreshold; }
  set threshold(v: number) { this.resources.chromaUniforms.uniforms.uThreshold = v; }
  get smoothing(): number { return this.resources.chromaUniforms.uniforms.uSmoothing; }
  set smoothing(v: number) { this.resources.chromaUniforms.uniforms.uSmoothing = v; }
  get spill(): number { return this.resources.chromaUniforms.uniforms.uSpill; }
  set spill(v: number) { this.resources.chromaUniforms.uniforms.uSpill = v; }

  setKeyColor(input: string | [number, number, number]): void {
    const rgb = toRgb01(input);
    const u = this.resources.chromaUniforms.uniforms.uKeyColor as [number, number, number];
    u[0] = rgb[0]; u[1] = rgb[1]; u[2] = rgb[2];
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/filters/ChromaKey.ts
git commit -m "feat(filters): ChromaKey with un-premul/re-premul shader (TS)"
```

---

### Task 8: `src/filters/Blur.ts`, `src/filters/ColorMatrix.ts`, `src/filters/index.ts`

**Files:**
- Create: `src/filters/Blur.ts`
- Create: `src/filters/ColorMatrix.ts`
- Create: `src/filters/index.ts`

Three small files, three commits.

- [ ] **Step 1: Write `src/filters/Blur.ts`**

```ts
import { BlurFilter } from 'pixi.js';

export interface BlurOptions {
  strength?: number;
  quality?: number;
  repeatEdgePixels?: boolean;
}

export class Blur extends BlurFilter {
  constructor(options: BlurOptions = {}) {
    const { strength = 8, quality = 4, repeatEdgePixels = false } = options;
    super({ strength, quality, repeatEdgePixels });
  }
}
```

- [ ] **Step 2: Commit Blur**

```bash
git add src/filters/Blur.ts
git commit -m "feat(filters): Blur wrapper (TS)"
```

- [ ] **Step 3: Write `src/filters/ColorMatrix.ts`**

```ts
import { ColorMatrixFilter } from 'pixi.js';

export interface ColorMatrixOptions {
  brightness?: number;
  saturate?: number;
  contrast?: number;
  hue?: number;
  alpha?: number;
}

export class ColorMatrix extends ColorMatrixFilter {
  private _values: Required<ColorMatrixOptions>;

  constructor(options: ColorMatrixOptions = {}) {
    super();
    this._values = {
      brightness: options.brightness ?? 1,
      saturate: options.saturate ?? 1,
      contrast: options.contrast ?? 1,
      hue: options.hue ?? 0,
      alpha: options.alpha ?? 1,
    };
    this._apply();
  }

  private _apply(): void {
    this.reset();
    this.brightness(this._values.brightness, true);
    this.saturate(this._values.saturate, true);
    this.contrast(this._values.contrast, true);
    this.hue(this._values.hue, true);
    this.alpha = this._values.alpha;
  }

  get brightness_(): number { return this._values.brightness; }
  set brightness_(v: number) { this._values.brightness = v; this._apply(); }
  get saturate_(): number { return this._values.saturate; }
  set saturate_(v: number) { this._values.saturate = v; this._apply(); }
  get contrast_(): number { return this._values.contrast; }
  set contrast_(v: number) { this._values.contrast = v; this._apply(); }
  get hue_(): number { return this._values.hue; }
  set hue_(v: number) { this._values.hue = v; this._apply(); }
}
```

- [ ] **Step 4: Commit ColorMatrix**

```bash
git add src/filters/ColorMatrix.ts
git commit -m "feat(filters): ColorMatrix with animatable scalar accessors (TS)"
```

- [ ] **Step 5: Write `src/filters/index.ts`**

```ts
import type { Filter } from 'pixi.js';
import type { FilterSpec } from '../types';
import { ChromaKeyFilter } from './ChromaKey';
import { Blur } from './Blur';
import { ColorMatrix } from './ColorMatrix';

interface FilterCtor {
  new (params: Record<string, unknown>): Filter;
}

const registry: Record<FilterSpec['type'], FilterCtor> = {
  chromaKey: ChromaKeyFilter as unknown as FilterCtor,
  blur: Blur as unknown as FilterCtor,
  colorMatrix: ColorMatrix as unknown as FilterCtor,
};

/** Internal marker we set on filter instances so partition path resolution finds them. */
export interface NamedFilter extends Filter {
  _name?: string;
}

export function createFilter(spec: FilterSpec): NamedFilter {
  const Cls = registry[spec.type];
  if (!Cls) throw new Error(`pixi-effects: unknown filter type "${(spec as { type: string }).type}"`);
  const { type: _t, name, ...params } = spec as Record<string, unknown> & { type: string; name?: string };
  const inst = new Cls(params) as NamedFilter;
  inst._name = name;
  return inst;
}

export function findFilterByName(filters: NamedFilter[], name: string): NamedFilter | null {
  return filters.find(f => f._name === name) ?? null;
}
```

- [ ] **Step 6: Verify typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/filters/index.ts
git commit -m "feat(filters): typed registry createFilter + findFilterByName"
```

---

## Phase 4: Audio mixer + Frame cache

### Task 9: `src/core/AudioMixer.ts` + test + setup

**Files:**
- Create: `src/core/AudioMixer.ts`
- Create: `tests/core/AudioMixer.test.ts`
- Modify: `tests/setup.ts` (install MockOfflineAudioContext)

- [ ] **Step 1: Replace `tests/setup.ts` with the MockOfflineAudioContext**

Copy `../pixistage/tests/setup.js` body verbatim into `tests/setup.ts`. happy-dom doesn't implement OfflineAudioContext; the mock is a sample-by-sample renderer that handles `setValueAtTime` + `linearRampToValueAtTime`.

Add minimal types to make tsc happy:

```ts
/**
 * Minimal OfflineAudioContext mock for vitest/happy-dom.
 *
 * happy-dom does not implement the Web Audio API beyond stubs.
 * This mock faithfully implements the subset used by AudioMixer.ts.
 */

interface ParamEvent {
  type: 'set' | 'ramp';
  value: number;
  time: number;
}

class MockAudioParam {
  _events: ParamEvent[] = [];
  _default: number;
  value: number;

  constructor(defaultValue = 1) {
    this._default = defaultValue;
    this.value = defaultValue;
  }

  setValueAtTime(value: number, time: number): this {
    this._events.push({ type: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this._events.push({ type: 'ramp', value, time });
    return this;
  }

  _valueAt(t: number): number {
    const evs = [...this._events].sort((a, b) => a.time - b.time);
    if (evs.length === 0) return this._default;
    let cur = this._default;
    let curTime = 0;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]!;
      if (t < ev.time) {
        if (ev.type === 'ramp') {
          const span = ev.time - curTime;
          if (span <= 0) return ev.value;
          const frac = (t - curTime) / span;
          return cur + (ev.value - cur) * frac;
        }
        return cur;
      }
      if (ev.type === 'set' || ev.type === 'ramp') cur = ev.value;
      curTime = ev.time;
    }
    return cur;
  }
}

class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  _channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array { return this._channels[ch]!; }
}

class MockBufferSourceNode {
  _ctx: MockOfflineAudioContext;
  buffer: MockAudioBuffer | null = null;
  loop = false;
  _gainNode: MockGainNode | null = null;
  _startTime = 0;
  _stopTime = Infinity;
  constructor(ctx: MockOfflineAudioContext) { this._ctx = ctx; }
  connect(node: MockGainNode) { this._gainNode = node; return node; }
  start(when = 0) { this._startTime = when; }
  stop(when = Infinity) { this._stopTime = when; }
}

class MockGainNode {
  _ctx: MockOfflineAudioContext;
  gain = new MockAudioParam(1);
  _destination: unknown = null;
  constructor(ctx: MockOfflineAudioContext) { this._ctx = ctx; }
  connect(dest: unknown) { this._destination = dest; return dest; }
}

class MockOfflineAudioContext {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  destination = {};
  _sources: MockBufferSourceNode[] = [];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }
  createBufferSource() {
    const src = new MockBufferSourceNode(this);
    this._sources.push(src);
    return src;
  }
  createGain() { return new MockGainNode(this); }

  async startRendering(): Promise<MockAudioBuffer> {
    const out = new MockAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
    for (const src of this._sources) {
      const buf = src.buffer;
      if (!buf) continue;
      const gain = src._gainNode;
      if (!gain) continue;
      const startSample = Math.round(src._startTime * this.sampleRate);
      const stopSample = isFinite(src._stopTime)
        ? Math.round(src._stopTime * this.sampleRate)
        : this.length;
      for (let outCh = 0; outCh < this.numberOfChannels; outCh++) {
        const outData = out.getChannelData(outCh);
        const inCh = outCh < buf.numberOfChannels ? outCh : buf.numberOfChannels - 1;
        const inData = buf.getChannelData(inCh);
        for (let s = startSample; s < Math.min(stopSample, this.length); s++) {
          const t = s / this.sampleRate;
          const g = gain.gain._valueAt(t);
          const srcIdx = src.loop ? (s - startSample) % buf.length : s - startSample;
          const sample = srcIdx < buf.length ? inData[srcIdx]! : 0;
          outData[s] += sample * g;
        }
      }
    }
    return out;
  }
}

(globalThis as unknown as { OfflineAudioContext: typeof MockOfflineAudioContext }).OfflineAudioContext = MockOfflineAudioContext;
```

- [ ] **Step 2: Write `tests/core/AudioMixer.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mixdown, type AudioDescriptor } from '../../src/core/AudioMixer';

function makeBuffer(ctx: OfflineAudioContext, durationSec: number, value = 1): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sampleRate * durationSec, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = value;
  return buf;
}

describe('mixdown', () => {
  it('produces an AudioBuffer of the requested duration', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const buf = makeBuffer(probeCtx, 1, 0.5);
    const out = await mixdown([{
      buffer: buf, loop: false, start: 0, end: 1, initialVolume: 1, volumeKeyframes: [],
    } satisfies AudioDescriptor], 1);
    expect(out!.duration).toBeCloseTo(1, 1);
    expect(out!.numberOfChannels).toBe(2);
  });

  it('applies initialVolume', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const buf = makeBuffer(probeCtx, 1, 1);
    const out = await mixdown([{
      buffer: buf, loop: false, start: 0, end: 1, initialVolume: 0.25, volumeKeyframes: [],
    }], 1);
    const samples = out!.getChannelData(0);
    const mid = samples[Math.floor(samples.length / 2)];
    expect(mid).toBeCloseTo(0.25, 2);
  });

  it('linearly ramps volume keyframes', async () => {
    const probeCtx = new OfflineAudioContext(1, 44100, 44100);
    const buf = makeBuffer(probeCtx, 2, 1);
    const out = await mixdown([{
      buffer: buf, loop: false, start: 0, end: 2, initialVolume: 0,
      volumeKeyframes: [{ time: 1, value: 1 }],
    }], 2);
    const samples = out!.getChannelData(0);
    const sampleRate = out!.sampleRate;
    const mid = samples[Math.floor(0.5 * sampleRate)];
    expect(mid).toBeCloseTo(0.5, 1);
  });
});
```

- [ ] **Step 3: Run — FAIL**

- [ ] **Step 4: Write `src/core/AudioMixer.ts`**

```ts
import type { AudioDescriptor } from '../types';
export type { AudioDescriptor };

export async function mixdown(
  audios: AudioDescriptor[],
  totalDuration: number,
  sampleRate = 44100,
): Promise<AudioBuffer | null> {
  if (audios.length === 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);
  for (const a of audios) {
    const src = ctx.createBufferSource();
    src.buffer = a.buffer;
    src.loop = !!a.loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(a.initialVolume ?? 1, a.start);
    for (const kf of a.volumeKeyframes ?? []) {
      gain.gain.linearRampToValueAtTime(kf.value, kf.time);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(a.start);
    src.stop(a.end);
  }
  return await ctx.startRendering();
}
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/core/AudioMixer.ts tests/core/AudioMixer.test.ts tests/setup.ts
git commit -m "feat(audio): mixdown via OfflineAudioContext + setup mock (TS)"
```

---

### Task 10: `src/core/FrameCache.ts` + test

**Files:**
- Create: `src/core/FrameCache.ts`
- Create: `tests/core/FrameCache.test.ts`

- [ ] **Step 1: Write `tests/core/FrameCache.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { FrameCache, type FrameSink } from '../../src/core/FrameCache';

interface FakeFrame { id: number; close: ReturnType<typeof vi.fn> }

function makeFakeFrame(id: number): FakeFrame {
  return { id, close: vi.fn() };
}

function makeFakeSink(frames: { timestamp: number; frame: FakeFrame }[]): FrameSink {
  return {
    async getSample(time: number) {
      let best = frames[0]!;
      for (const f of frames) {
        if (f.timestamp <= time && f.timestamp >= best.timestamp) best = f;
      }
      return {
        timestamp: best.timestamp,
        toVideoFrame: () => best.frame as unknown as VideoFrame,
        close: vi.fn(),
      };
    },
  };
}

describe('FrameCache', () => {
  it('returns a frame for a given time', async () => {
    const f0 = makeFakeFrame(0);
    const f1 = makeFakeFrame(1);
    const sink = makeFakeSink([
      { timestamp: 0,    frame: f0 },
      { timestamp: 0.5,  frame: f1 },
    ]);
    const cache = new FrameCache(sink, { capacity: 2 });
    expect(await cache.getFrameAt(0.0)).toBe(f0 as unknown);
    expect(await cache.getFrameAt(0.5)).toBe(f1 as unknown);
  });

  it('evicts oldest when over capacity, calling close()', async () => {
    const fs = [makeFakeFrame(0), makeFakeFrame(1), makeFakeFrame(2)];
    const sink = makeFakeSink([
      { timestamp: 0,   frame: fs[0]! },
      { timestamp: 0.5, frame: fs[1]! },
      { timestamp: 1.0, frame: fs[2]! },
    ]);
    const cache = new FrameCache(sink, { capacity: 2 });
    await cache.getFrameAt(0);
    await cache.getFrameAt(0.5);
    await cache.getFrameAt(1.0);
    expect(fs[0]!.close).toHaveBeenCalled();
    expect(fs[1]!.close).not.toHaveBeenCalled();
    expect(fs[2]!.close).not.toHaveBeenCalled();
  });

  it('dispose closes all cached frames', async () => {
    const fs = [makeFakeFrame(0), makeFakeFrame(1)];
    const sink = makeFakeSink([
      { timestamp: 0,   frame: fs[0]! },
      { timestamp: 0.5, frame: fs[1]! },
    ]);
    const cache = new FrameCache(sink, { capacity: 5 });
    await cache.getFrameAt(0);
    await cache.getFrameAt(0.5);
    cache.dispose();
    expect(fs[0]!.close).toHaveBeenCalled();
    expect(fs[1]!.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `src/core/FrameCache.ts`**

```ts
/**
 * Subset of the mediabunny VideoSampleSink API we depend on. Exposed as an
 * interface so tests can provide a mock sink.
 */
export interface FrameSink {
  getSample(time: number): Promise<{
    timestamp: number;
    toVideoFrame: () => VideoFrame;
    close?: () => void;
  } | null>;
}

export interface FrameCacheOptions {
  capacity?: number;
}

export class FrameCache {
  sink: FrameSink;
  capacity: number;
  cache: Map<number, VideoFrame> = new Map();
  private _pending: Map<number, Promise<VideoFrame | null>> = new Map();

  constructor(sink: FrameSink, options: FrameCacheOptions = {}) {
    this.sink = sink;
    this.capacity = options.capacity ?? 30;
  }

  private _key(time: number): number {
    return Math.round(time * 1000);
  }

  async getFrameAt(time: number): Promise<VideoFrame | null> {
    const key = this._key(time);

    if (this.cache.has(key)) {
      const v = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, v);
      return v;
    }

    const pending = this._pending.get(key);
    if (pending) return pending;

    const promise = this._fetch(time);
    this._pending.set(key, promise);
    try {
      const frame = await promise;
      if (frame) {
        if (this.cache.has(key)) {
          frame.close?.();
          const existing = this.cache.get(key)!;
          this.cache.delete(key);
          this.cache.set(key, existing);
          return existing;
        }
        this.cache.set(key, frame);
        this._evictIfNeeded();
      }
      return frame;
    } finally {
      this._pending.delete(key);
    }
  }

  private async _fetch(time: number): Promise<VideoFrame | null> {
    const sample = await this.sink.getSample(time);
    if (!sample) return null;
    const frame = sample.toVideoFrame();
    sample.close?.();
    return frame;
  }

  private _evictIfNeeded(): void {
    while (this.cache.size > this.capacity) {
      const oldestKey = this.cache.keys().next().value as number | undefined;
      if (oldestKey === undefined) break;
      const oldestFrame = this.cache.get(oldestKey);
      oldestFrame?.close?.();
      this.cache.delete(oldestKey);
    }
  }

  dispose(): void {
    for (const f of this.cache.values()) f?.close?.();
    this.cache.clear();
    this._pending.clear();
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/FrameCache.ts tests/core/FrameCache.test.ts
git commit -m "feat(video): FrameCache LRU with coalescing (TS)"
```

---

## Phase 5: Timeline (keyframe DSL → gsap)

### Task 11: `src/core/Timeline.ts` + test

**Files:**
- Create: `src/core/Timeline.ts`
- Create: `tests/core/Timeline.test.ts`

- [ ] **Step 1: Write `tests/core/Timeline.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveAt, normalizeKeyframe, partitionProps } from '../../src/core/Timeline';

describe('resolveAt', () => {
  it('passes through positive numbers', () => { expect(resolveAt(2.5, 10)).toBe(2.5); });
  it('passes through 0', () => { expect(resolveAt(0, 10)).toBe(0); });
  it('resolves negative as duration-relative', () => { expect(resolveAt(-0.5, 10)).toBe(9.5); });
  it('treats undefined as 0', () => { expect(resolveAt(undefined, 10)).toBe(0); });
});

describe('normalizeKeyframe', () => {
  it('defaults: at=0, duration=0, ease=none', () => {
    const out = normalizeKeyframe({ to: { x: 100 } }, 10);
    expect(out.at).toBe(0);
    expect(out.duration).toBe(0);
    expect(out.ease).toBe('none');
    expect(out.kind).toBe('to');
  });
  it('detects set kind', () => { expect(normalizeKeyframe({ at: 1, set: { x: 0 } }, 10).kind).toBe('set'); });
  it('detects from kind', () => { expect(normalizeKeyframe({ at: 1, from: { x: 0 } }, 10).kind).toBe('from'); });
  it('detects fromTo kind', () => { expect(normalizeKeyframe({ at: 1, from: { x: 0 }, to: { x: 100 } }, 10).kind).toBe('fromTo'); });
  it('resolves negative at', () => { expect(normalizeKeyframe({ at: -0.5, to: { alpha: 0 }, duration: 0.5 }, 10).at).toBe(9.5); });
});

describe('partitionProps', () => {
  it('routes plain keys to ownProps', () => {
    const out = partitionProps({ x: 100, alpha: 0.5 });
    expect(out.ownProps).toEqual({ x: 100, alpha: 0.5 });
    expect(out.filterProps).toEqual({});
  });
  it('routes filters.NAME.PROP to filterProps grouped by name', () => {
    const out = partitionProps({ 'filters.b.strength': 8, 'filters.k.threshold': 0.5 });
    expect(out.ownProps).toEqual({});
    expect(out.filterProps).toEqual({ b: { strength: 8 }, k: { threshold: 0.5 } });
  });
  it('groups multiple props of the same filter together', () => {
    const out = partitionProps({ 'filters.b.strength': 8, 'filters.b.quality': 4 });
    expect(out.filterProps).toEqual({ b: { strength: 8, quality: 4 } });
  });
  it('handles mixed own and filter props', () => {
    const out = partitionProps({ x: 100, 'filters.b.strength': 8 });
    expect(out.ownProps).toEqual({ x: 100 });
    expect(out.filterProps).toEqual({ b: { strength: 8 } });
  });
  it('preserves unrelated dot paths in ownProps', () => {
    const out = partitionProps({ 'style.fill': '#ff0000' });
    expect(out.ownProps).toEqual({ 'style.fill': '#ff0000' });
    expect(out.filterProps).toEqual({});
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `src/core/Timeline.ts`**

```ts
import { gsap } from 'gsap';
import { normalizeProps } from '../expr/normalizeProps';
import type { Keyframe } from '../types';
import type { NamedFilter } from '../filters';

export type Kind = 'set' | 'to' | 'from' | 'fromTo';

export interface NormalizedKeyframe {
  at: number;
  duration: number;
  ease: string;
  kind: Kind;
  set?: Record<string, unknown>;
  to?: Record<string, unknown>;
  from?: Record<string, unknown>;
}

export function resolveAt(at: number | undefined | null, duration: number): number {
  if (at === undefined || at === null) return 0;
  return at < 0 ? duration + at : at;
}

export function normalizeKeyframe(kf: Keyframe, parentDuration: number): NormalizedKeyframe {
  const at = resolveAt(kf.at, parentDuration);
  const duration = kf.duration ?? 0;
  const ease = kf.ease ?? 'none';
  const hasSet = !!kf.set;
  const hasFrom = !!kf.from;
  const hasTo = !!kf.to;
  let kind: Kind;
  if (hasSet) kind = 'set';
  else if (hasFrom && hasTo) kind = 'fromTo';
  else if (hasFrom) kind = 'from';
  else if (hasTo) kind = 'to';
  else kind = 'to';
  return { at, duration, ease, kind, set: kf.set, from: kf.from, to: kf.to };
}

export interface Partitioned {
  ownProps: Record<string, unknown>;
  filterProps: Record<string, Record<string, unknown>>;
}

export function partitionProps(props: Record<string, unknown>): Partitioned {
  const ownProps: Record<string, unknown> = {};
  const filterProps: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(props)) {
    const m = k.match(/^filters\.([^.]+)\.(.+)$/);
    if (m) {
      const [, name, sub] = m as unknown as [string, string, string];
      (filterProps[name] ??= {})[sub] = props[k];
    } else {
      ownProps[k] = props[k];
    }
  }
  return { ownProps, filterProps };
}

interface FilterTarget { filters?: NamedFilter[] | null }

function findFilter(target: FilterTarget, name: string): NamedFilter | null {
  if (!target?.filters) return null;
  for (const f of target.filters) {
    if (f?._name === name) return f;
  }
  return null;
}

const PIXI_SHORTHANDS = new Set([
  'scale', 'scaleX', 'scaleY',
  'anchor', 'anchorX', 'anchorY',
  'pivot', 'pivotX', 'pivotY',
  'skew', 'skewX', 'skewY',
  'position', 'positionX', 'positionY',
  'tilePosition', 'tilePositionX', 'tilePositionY',
  'tileScale', 'tileScaleX', 'tileScaleY',
  'tint',
  'colorize', 'colorizeAmount',
  'colorMatrixFilter',
  'blur', 'blurX', 'blurY', 'blurPadding',
  'autoAlpha',
  'lineColor', 'lineAlpha', 'fillColor', 'fillAlpha',
]);

function pixiwrap(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pixi: Record<string, unknown> = {};
  let usedPixi = false;
  for (const [k, v] of Object.entries(props)) {
    if (PIXI_SHORTHANDS.has(k)) { pixi[k] = v; usedPixi = true; }
    else { out[k] = v; }
  }
  if (usedPixi) out.pixi = pixi;
  return out;
}

import type { gsap as GsapType } from 'gsap';
type Timeline = ReturnType<typeof GsapType.timeline>;

export function applyKeyframes(
  timeline: Timeline,
  target: object,
  keyframes: Keyframe[] | undefined,
  parentDuration: number,
  scope: Record<string, number>,
  skipKeys: string[] = [],
): void {
  for (const raw of keyframes ?? []) {
    const kf = normalizeKeyframe(raw, parentDuration);
    if (kf.kind === 'set') {
      const resolved = normalizeProps(kf.set!, scope, { skipKeys });
      const { ownProps, filterProps } = partitionProps(resolved);
      if (Object.keys(ownProps).length > 0) timeline.set(target, pixiwrap(ownProps), kf.at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.set(f, props, kf.at);
      }
    } else if (kf.kind === 'to') {
      const resolved = normalizeProps(kf.to!, scope, { skipKeys });
      const { ownProps, filterProps } = partitionProps(resolved);
      if (Object.keys(ownProps).length > 0)
        timeline.to(target, { ...pixiwrap(ownProps), duration: kf.duration, ease: kf.ease }, kf.at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.to(f, { ...props, duration: kf.duration, ease: kf.ease }, kf.at);
      }
    } else if (kf.kind === 'from') {
      const resolved = normalizeProps(kf.from!, scope, { skipKeys });
      const { ownProps, filterProps } = partitionProps(resolved);
      if (Object.keys(ownProps).length > 0)
        timeline.from(target, { ...pixiwrap(ownProps), duration: kf.duration, ease: kf.ease }, kf.at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.from(f, { ...props, duration: kf.duration, ease: kf.ease }, kf.at);
      }
    } else {
      const fromResolved = normalizeProps(kf.from!, scope, { skipKeys });
      const toResolved = normalizeProps(kf.to!, scope, { skipKeys });
      const fromSplit = partitionProps(fromResolved);
      const toSplit = partitionProps(toResolved);
      const ownKeys = new Set([...Object.keys(fromSplit.ownProps), ...Object.keys(toSplit.ownProps)]);
      if (ownKeys.size > 0) {
        timeline.fromTo(
          target,
          { ...pixiwrap(fromSplit.ownProps) },
          { ...pixiwrap(toSplit.ownProps), duration: kf.duration, ease: kf.ease },
          kf.at,
        );
      }
      const filterNames = new Set([
        ...Object.keys(fromSplit.filterProps),
        ...Object.keys(toSplit.filterProps),
      ]);
      for (const name of filterNames) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.fromTo(
          f,
          { ...(fromSplit.filterProps[name] ?? {}) },
          { ...(toSplit.filterProps[name] ?? {}), duration: kf.duration, ease: kf.ease },
          kf.at,
        );
      }
    }
  }
}

export function applyInitial(
  target: object,
  initial: Record<string, unknown> | undefined,
  scope: Record<string, number>,
  skipKeys: string[] = [],
): void {
  if (!initial) return;
  const resolved = normalizeProps(initial, scope, { skipKeys });
  const { ownProps, filterProps } = partitionProps(resolved);
  if (Object.keys(ownProps).length > 0) gsap.set(target, pixiwrap(ownProps));
  for (const [name, props] of Object.entries(filterProps)) {
    const f = findFilter(target as FilterTarget, name);
    if (!f) continue;
    gsap.set(f, props);
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/Timeline.ts tests/core/Timeline.test.ts
git commit -m "feat(timeline): keyframe normalization + gsap dispatch + pixiwrap (TS)"
```

---

## Phase 6: Asset loader

### Task 12: `src/core/AssetLoader.ts`

**Files:**
- Create: `src/core/AssetLoader.ts`

Browser-only; no unit test (mediabunny + Pixi Assets are runtime-only).

- [ ] **Step 1: Write `src/core/AssetLoader.ts`**

Reference: copy logic from `../pixistage/src/core/AssetLoader.js` verbatim, add types:

```ts
import { Assets, ExtensionType, extensions } from 'pixi.js';
import {
  Input, BlobSource, ALL_FORMATS, Output, WavOutputFormat,
  BufferTarget, Conversion, VideoSampleSink,
} from 'mediabunny';
import type { AssetSpec } from '../types';

export interface AudioAssetData {
  audioBuffer: AudioBuffer;
  duration: number;
}

export interface VideoAssetData {
  videoTrack: unknown;
  audioBuffer: AudioBuffer | null;
  videoDuration: number;
  audioDuration: number;
  duration: number;
  sink: InstanceType<typeof VideoSampleSink>;
}

let registered = false;

export function ensureLoadersRegistered(audioContext: AudioContext): void {
  if (registered) return;
  registered = true;

  extensions.add({
    extension: { type: ExtensionType.LoadParser, name: 'pixi-effects-audio' },
    test: (url: string) => /\.(mp3|wav|ogg)$/i.test(url),
    async load(url: string): Promise<AudioAssetData> {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`pixi-effects: failed to load ${url}: ${res.statusText}`);
      const buffer = await res.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      return { audioBuffer, duration: audioBuffer.duration };
    },
  });

  extensions.add({
    extension: { type: ExtensionType.LoadParser, name: 'pixi-effects-video', priority: 1 },
    test: (url: string) => /\.(mp4|webm|mov|mkv)$/i.test(url),
    async load(url: string): Promise<VideoAssetData> {
      const blob = await fetch(url).then(r => r.blob());
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!await videoTrack.canDecode()) {
        throw new Error('pixi-effects: video track cannot be decoded');
      }
      const audioTrack = await input.getPrimaryAudioTrack();
      const videoDuration = await videoTrack.computeDuration();
      const audioDuration = audioTrack ? await audioTrack.computeDuration() : 0;

      let audioBuffer: AudioBuffer | null = null;
      if (audioTrack) {
        try {
          const out = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
          const conv = await Conversion.init({ input, output: out, video: { discard: true } });
          await conv.execute();
          audioBuffer = await audioContext.decodeAudioData(out.target.buffer as ArrayBuffer);
        } catch (e) {
          console.warn('pixi-effects: audio extraction failed:', e);
        }
      }
      return {
        videoTrack,
        audioBuffer,
        videoDuration,
        audioDuration,
        duration: Math.max(videoDuration, audioDuration),
        sink: new VideoSampleSink(videoTrack),
      };
    },
  });
}

export async function loadAssetBundle(
  assets: AssetSpec[],
  audioContext: AudioContext,
): Promise<Record<string, AudioAssetData | VideoAssetData>> {
  ensureLoadersRegistered(audioContext);
  const bundle = assets.map(a => ({ alias: a.name, src: a.src }));
  Assets.addBundle('pixi-effects', bundle);
  return await Assets.loadBundle('pixi-effects');
}
```

- [ ] **Step 2: Verify typecheck (some `any` may be needed for mediabunny types — keep `unknown` and narrow when used)**

Run: `npm run typecheck`

If `mediabunny` types don't expose `getPrimaryVideoTrack` cleanly, cast:
```ts
const videoTrack = await (input as any).getPrimaryVideoTrack();
```

This is acceptable since mediabunny is the runtime contract; AssetLoader is a thin pass-through.

- [ ] **Step 3: Commit**

```bash
git add src/core/AssetLoader.ts
git commit -m "feat(loader): typed AssetLoader (audio + video LoadParser) (TS)"
```

---

## Phase 7: Sequences

### Task 13: `src/sequences/Base.ts`

**Files:**
- Create: `src/sequences/Base.ts`

- [ ] **Step 1: Write `src/sequences/Base.ts`**

```ts
import type { Container } from 'pixi.js';
import { applyKeyframes, applyInitial } from '../core/Timeline';
import { buildScope, type Scope } from '../expr/Scope';
import { createFilter, type NamedFilter } from '../filters';
import type { CompositionShape, SequenceSpec, AudioDescriptor } from '../types';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

export abstract class Sequence {
  spec: SequenceSpec;
  parent: CompositionShape | null;
  root: CompositionShape;
  target: Container | null = null;
  intrinsicWidth = 0;
  intrinsicHeight = 0;
  at: number;
  duration: number | undefined;
  filters: NamedFilter[] = [];

  constructor(spec: SequenceSpec, parent: CompositionShape | null, root: CompositionShape) {
    this.spec = spec;
    this.parent = parent;
    this.root = root;
    this.at = spec.at ?? 0;
    this.duration = spec.duration;
  }

  abstract build(): Promise<void>;

  buildFilters(): void {
    const specs = this.spec.filters ?? [];
    this.filters = specs.map(createFilter);
    if (this.target && 'filters' in this.target) {
      (this.target as { filters: NamedFilter[] }).filters = this.filters;
    }
  }

  scope(): Scope {
    return buildScope(this, this.parent, this.root);
  }

  bindTimeline(timeline: Timeline): void {
    if (!this.target) return;
    const scope = this.scope();
    applyInitial(this.target, this.spec.initial as Record<string, unknown> | undefined, scope);
    applyKeyframes(timeline, this.target, this.spec.keyframes, this.duration!, scope);
    timeline.set(this.target, { renderable: true }, this.at);
    timeline.set(this.target, { renderable: false }, this.at + this.duration!);
  }

  collectAudio(_out: AudioDescriptor[], _baseTime: number): void {
    // default: no audio
  }

  destroy(): void {
    this.target?.destroy?.();
    this.target = null;
  }
}
```

- [ ] **Step 2: Verify typecheck (types may need adjusting if `Container` doesn't expose `filters` directly — use `unknown`/cast as above)**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/sequences/Base.ts
git commit -m "feat(seq): Sequence abstract base class (TS)"
```

---

### Task 14: Image, Text, Audio sequences

**Files:**
- Create: `src/sequences/Image.ts`
- Create: `src/sequences/Text.ts`
- Create: `src/sequences/Audio.ts`

Three small files, one task, three commits.

- [ ] **Step 1: Write `src/sequences/Image.ts`**

```ts
import { Sprite, Assets, type Texture } from 'pixi.js';
import { Sequence } from './Base';
import type { ImageSequenceSpec } from '../types';

export class ImageSequence extends Sequence {
  declare spec: ImageSequenceSpec;

  async build(): Promise<void> {
    const texture = await Assets.get<Texture>(this.spec.asset);
    const sprite = new Sprite({ texture, label: this.spec.name });
    sprite.cullable = true;
    this.target = sprite;
    this.intrinsicWidth = texture.width;
    this.intrinsicHeight = texture.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    this.buildFilters();
  }
}
```

Commit:
```bash
git add src/sequences/Image.ts
git commit -m "feat(seq): Image sequence (TS)"
```

- [ ] **Step 2: Write `src/sequences/Text.ts`**

```ts
import { Text } from 'pixi.js';
import { Sequence } from './Base';
import { normalizeProps } from '../expr/normalizeProps';
import type { TextSequenceSpec } from '../types';

const STYLE_OPAQUE_KEYS = ['fontFamily', 'fill', 'align', 'fontStyle', 'fontWeight'];

export class TextSequence extends Sequence {
  declare spec: TextSequenceSpec;

  async build(): Promise<void> {
    const baseStyle = {
      fontFamily: 'Arial',
      fontSize: 36,
      fill: '#ffffff',
      align: 'center' as const,
    };
    const text = new Text({
      text: this.spec.text ?? '',
      style: baseStyle,
      label: this.spec.name,
    });
    text.cullable = true;
    this.target = text;
    this.intrinsicWidth = text.width;
    this.intrinsicHeight = text.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    if (this.spec.style) {
      const scope = this.scope();
      const resolved = normalizeProps(
        this.spec.style as Record<string, unknown>,
        scope,
        { skipKeys: STYLE_OPAQUE_KEYS },
      );
      for (const k of Object.keys(resolved)) {
        (text.style as unknown as Record<string, unknown>)[k] = (resolved as Record<string, unknown>)[k];
      }
    }
    this.buildFilters();
  }
}
```

Commit:
```bash
git add src/sequences/Text.ts
git commit -m "feat(seq): Text sequence (TS)"
```

- [ ] **Step 3: Write `src/sequences/Audio.ts`**

```ts
import { Assets } from 'pixi.js';
import { Sequence } from './Base';
import { normalizeKeyframe } from '../core/Timeline';
import type { AudioSequenceSpec, AudioDescriptor } from '../types';
import type { AudioAssetData } from '../core/AssetLoader';

export class AudioSequence extends Sequence {
  declare spec: AudioSequenceSpec;
  private _audioBuffer: AudioBuffer | null = null;

  async build(): Promise<void> {
    const data = await Assets.get<AudioAssetData>(this.spec.asset);
    this._audioBuffer = data.audioBuffer;
    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? data.duration ?? this.root.duration;
    }
    this.target = null;
  }

  override bindTimeline(_timeline: unknown): void {
    // Audio has no visual; everything happens at mixdown time via collectAudio.
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    if (!this._audioBuffer) return;
    const initialVolume = this.spec.volume ?? 1;
    const volumeKeyframes: { time: number; value: number }[] = [];
    const dur = this.duration!;
    for (const raw of this.spec.keyframes ?? []) {
      const kf = normalizeKeyframe(raw, dur);
      const set = kf.set as Record<string, number> | undefined;
      const to = kf.to as Record<string, number> | undefined;
      const from = kf.from as Record<string, number> | undefined;
      if (kf.kind === 'set' && set && 'volume' in set) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at, value: set.volume! });
      } else if (kf.kind === 'to' && to && 'volume' in to) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at + kf.duration, value: to.volume! });
      } else if (kf.kind === 'fromTo' && to && 'volume' in to) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at, value: from?.volume ?? initialVolume });
        volumeKeyframes.push({ time: baseTime + this.at + kf.at + kf.duration, value: to.volume! });
      } else if (kf.kind === 'from' && from && 'volume' in from) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at, value: from.volume! });
        volumeKeyframes.push({ time: baseTime + this.at + kf.at + kf.duration, value: initialVolume });
      }
    }
    out.push({
      buffer: this._audioBuffer,
      loop: !!this.spec.loop,
      start: baseTime + this.at,
      end: baseTime + this.at + dur,
      initialVolume,
      volumeKeyframes,
    });
  }

  override destroy(): void {
    this._audioBuffer = null;
  }
}
```

Commit:
```bash
git add src/sequences/Audio.ts
git commit -m "feat(seq): Audio sequence with volume-keyframe extraction (TS)"
```

---

### Task 15: `src/sequences/Video.ts`

**Files:**
- Create: `src/sequences/Video.ts`

- [ ] **Step 1: Write `src/sequences/Video.ts`**

```ts
import { Sprite, Texture, Assets } from 'pixi.js';
import { Sequence } from './Base';
import { FrameCache } from '../core/FrameCache';
import type { VideoSequenceSpec, AudioDescriptor } from '../types';
import type { VideoAssetData } from '../core/AssetLoader';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

export class VideoSequence extends Sequence {
  declare spec: VideoSequenceSpec;
  private _sourceDuration = 0;
  private _audioBuffer: AudioBuffer | null = null;
  private _cache: FrameCache | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _drawSeq = 0;

  async build(): Promise<void> {
    const data = await Assets.get<VideoAssetData>(this.spec.asset);
    this._sourceDuration = data.duration;
    this._audioBuffer = (this.spec.audio !== false) ? data.audioBuffer : null;
    this._cache = new FrameCache(data.sink as unknown as import('../core/FrameCache').FrameSink, { capacity: 30 });

    const probeFrame = await this._cache.getFrameAt(0);
    const w = probeFrame?.displayWidth ?? 1920;
    const h = probeFrame?.displayHeight ?? 1080;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d', { alpha: true });
    if (probeFrame && this._ctx) this._ctx.drawImage(probeFrame, 0, 0);

    const texture = Texture.from(canvas);
    const sprite = new Sprite({ texture, label: this.spec.name });
    sprite.cullable = true;
    this.target = sprite;
    this.intrinsicWidth = w;
    this.intrinsicHeight = h;

    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? data.duration ?? this.root.duration;
    }

    let currentTime = 0;
    const seq = this;
    Object.defineProperty(sprite, 'currentTime', {
      get(): number { return currentTime; },
      set(v: number) {
        currentTime = v;
        const mySeq = ++seq._drawSeq;
        const lookup = seq.spec.loop && seq._sourceDuration > 0 ? v % seq._sourceDuration : v;
        seq._cache!.getFrameAt(lookup).then(frame => {
          if (mySeq !== seq._drawSeq) return;
          if (!frame || !seq._ctx) return;
          seq._ctx.drawImage(frame, 0, 0);
          texture.source.update();
        });
      },
    });

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline): void {
    super.bindTimeline(timeline);
    const playDuration = this.spec.loop
      ? this.duration!
      : Math.min(this.duration!, this._sourceDuration);
    timeline.fromTo(
      this.target!,
      { currentTime: 0 },
      { currentTime: playDuration, duration: playDuration, ease: 'none' },
      this.at,
    );
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    if (!this._audioBuffer) return;
    const initialVolume = this.spec.volume ?? 1;
    out.push({
      buffer: this._audioBuffer,
      loop: !!this.spec.loop,
      start: baseTime + this.at,
      end: baseTime + this.at + this.duration!,
      initialVolume,
      volumeKeyframes: [],
    });
  }

  async awaitFrameAt(time: number): Promise<void> {
    const mySeq = ++this._drawSeq;
    const lookup = this.spec.loop && this._sourceDuration > 0 ? time % this._sourceDuration : time;
    const frame = await this._cache!.getFrameAt(lookup);
    if (mySeq !== this._drawSeq) return;
    if (frame && this._ctx) {
      this._ctx.drawImage(frame, 0, 0);
      (this.target as Sprite).texture.source.update();
    }
  }

  override destroy(): void {
    this._cache?.dispose();
    this._cache = null;
    super.destroy();
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Some `unknown` casts to `FrameSink` are fine; mediabunny's VideoSampleSink shape matches our minimal interface.

- [ ] **Step 3: Commit**

```bash
git add src/sequences/Video.ts
git commit -m "feat(seq): Video sequence with FrameCache + drawSeq staleness (TS)"
```

---

### Task 16: `src/sequences/Composition.ts`

**Files:**
- Create: `src/sequences/Composition.ts`

- [ ] **Step 1: Write `src/sequences/Composition.ts`**

```ts
import { Container, Rectangle } from 'pixi.js';
import { Sequence } from './Base';
import { buildSequenceTree } from '../core/Composition';
import type { CompositionSequenceSpec, AudioDescriptor, CompositionShape } from '../types';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

export class CompositionSequence extends Sequence {
  declare spec: CompositionSequenceSpec;
  private _innerContainer: Container | null = null;
  private _compositionShape: CompositionShape | null = null;
  private _children: Sequence[] = [];

  async build(): Promise<void> {
    const width = this.spec.width ?? this.parent?.width ?? this.root.width;
    const height = this.spec.height ?? this.parent?.height ?? this.root.height;
    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? this.parent?.duration ?? this.root.duration;
    }
    const wrapper = new Container();
    wrapper.cullable = true;
    wrapper.cullableChildren = true;
    wrapper.cullArea = new Rectangle(0, 0, width, height);

    const inner = new Container();
    inner.cullable = true;
    inner.cullableChildren = true;
    wrapper.addChild(inner);

    this.target = wrapper;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;
    this._innerContainer = inner;
    this._compositionShape = { width, height, duration: this.duration };

    this._children = await buildSequenceTree(
      this.spec.sequences ?? [],
      this._compositionShape,
      this.root,
    );
    for (const child of this._children) {
      if (child.target) inner.addChild(child.target);
    }

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline): void {
    super.bindTimeline(timeline);
    for (const child of this._children) child.bindTimeline(timeline);
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    super.collectAudio(out, baseTime);
    const childBase = baseTime + this.at;
    for (const child of this._children) child.collectAudio(out, childBase);
  }

  override destroy(): void {
    for (const c of this._children) c.destroy();
    super.destroy();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sequences/Composition.ts
git commit -m "feat(seq): Composition sequence with nested children (TS)"
```

---

## Phase 8: Composition orchestration

### Task 17: `src/core/Composition.ts` — buildSequenceTree

**Files:**
- Create: `src/core/Composition.ts`

- [ ] **Step 1: Write `src/core/Composition.ts`**

Same circular-import workaround as pixistage: `composition` type uses dynamic import.

```ts
import { ImageSequence } from '../sequences/Image';
import { TextSequence } from '../sequences/Text';
import { AudioSequence } from '../sequences/Audio';
import { VideoSequence } from '../sequences/Video';
import type { Sequence } from '../sequences/Base';
import type { SequenceSpec, CompositionShape } from '../types';

let _CompositionSequence: typeof import('../sequences/Composition').CompositionSequence | null = null;
async function getCompositionSequence() {
  if (!_CompositionSequence) {
    _CompositionSequence = (await import('../sequences/Composition')).CompositionSequence;
  }
  return _CompositionSequence;
}

const staticTypes: Partial<Record<SequenceSpec['type'], { new (spec: SequenceSpec, parent: CompositionShape | null, root: CompositionShape): Sequence }>> = {
  image: ImageSequence as any,
  text: TextSequence as any,
  audio: AudioSequence as any,
  video: VideoSequence as any,
};

export async function buildSequenceTree(
  specs: SequenceSpec[],
  parent: CompositionShape | null,
  root: CompositionShape,
): Promise<Sequence[]> {
  const out: Sequence[] = [];
  for (const spec of specs) {
    let Cls = staticTypes[spec.type];
    if (!Cls && spec.type === 'composition') {
      Cls = (await getCompositionSequence()) as any;
    }
    if (!Cls) {
      console.warn(`pixi-effects: unknown sequence type "${(spec as { type: string }).type}"`);
      continue;
    }
    const seq = new Cls(spec, parent, root);
    await seq.build();
    if (seq.duration === undefined) {
      seq.duration = parent?.duration ?? root.duration;
    }
    out.push(seq);
  }
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/Composition.ts
git commit -m "feat(core): buildSequenceTree dispatch with lazy composition import (TS)"
```

---

## Phase 9: Movie + Renderer

### Task 18: `src/core/Movie.ts`

**Files:**
- Create: `src/core/Movie.ts`

- [ ] **Step 1: Write `src/core/Movie.ts`**

This is the largest single file. Reference pixistage `core/Movie.js` (post all the fixes) and add types throughout. Public API — strict types. Internal — inferred where safe.

```ts
import * as PIXI from 'pixi.js';
import { Application, Container, Rectangle, extensions, CullerPlugin } from 'pixi.js';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { loadAssetBundle } from './AssetLoader';
import { CompositionSequence } from '../sequences/Composition';
import { mixdown } from './AudioMixer';
import { exportFrames } from './Renderer';
import type { Sequence } from '../sequences/Base';
import type {
  AssetSpec, CompositionSpec, CompositionShape, AudioDescriptor,
} from '../types';

extensions.add(CullerPlugin);

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

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

export interface RenderOptions {
  format?: 'mp4' | 'mov' | 'webm' | 'mkv';
  video?: { codec?: string; bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' };
  audio?: { codec?: string; bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' };
}

export interface FrameEvent { frame: number; totalFrames: number }
export interface ProgressEvent { progress: number; frame: number; totalFrames: number }

type Listener = (...args: any[]) => void;

export class Movie {
  private _events: Record<string, Listener[]> = {};
  private _initState: 'idle' | 'pending' | 'ready' | 'destroyed' = 'idle';
  app: Application | null = null;
  timeline: ReturnType<typeof gsap.timeline> | null = null;
  audioBuffer: AudioBuffer | null = null;
  audioSource: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
  private _volume = 1;
  private _muted = false;
  isPlaying = false;
  currentFrame = 0;
  totalFrames = 0;
  width = 0;
  height = 0;
  duration = 0;
  frameRate = 30;
  background = '#000000';
  private _audioContext: AudioContext | null = null;
  private _rootSequence: Sequence | null = null;
  private _rootContainer: Container | null = null;
  private _raf: number | null = null;

  on(event: 'ready', fn: () => void): this;
  on(event: 'frame', fn: (e: FrameEvent) => void): this;
  on(event: 'progress', fn: (e: ProgressEvent) => void): this;
  on(event: string, fn: Listener): this {
    (this._events[event] ??= []).push(fn);
    if (event === 'ready' && this._initState === 'ready') {
      try { fn(); } catch (e) { console.warn('pixi-effects: ready listener threw:', e); }
    }
    return this;
  }
  off(event: string, fn: Listener): this {
    const list = this._events[event];
    if (!list) return this;
    const i = list.indexOf(fn);
    if (i > -1) list.splice(i, 1);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this._events[event] ?? []) fn(...args);
  }

  get isReady(): boolean { return this._initState === 'ready'; }

  private _ensureAudioContext(): AudioContext {
    if (!this._audioContext) {
      const Ctx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this._audioContext = new Ctx();
    }
    return this._audioContext;
  }

  async init(options: MovieOptions = {}): Promise<void> {
    this._initState = 'pending';
    try {
      this.width = options.width ?? 1920;
      this.height = options.height ?? 1080;
      this.duration = options.duration ?? 10;
      this.frameRate = options.frameRate ?? 30;
      this.totalFrames = Math.round(this.duration * this.frameRate);
      this.background = options.background ?? '#000000';

      this.timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
      this.timeline.add(gsap.to({}, { duration: this.duration }));

      this.app = new Application();
      await this.app.init({
        width: this.width,
        height: this.height,
        background: this.background,
        antialias: true,
        resolution: 1,
        autoDensity: false,
        preference: 'webgl',
        preserveDrawingBuffer: true,
        canvas: options.canvas,
      });

      const root = new Container();
      root.cullable = true;
      root.cullableChildren = true;
      root.cullArea = new Rectangle(0, 0, this.width, this.height);
      this.app.stage.addChild(root);
      this._rootContainer = root;

      const audioContext = this._ensureAudioContext();
      await loadAssetBundle(options.assets ?? [], audioContext);

      const rootShape: CompositionShape = { width: this.width, height: this.height, duration: this.duration };
      const rootSeqSpec = {
        type: 'composition' as const,
        width: this.width,
        height: this.height,
        duration: this.duration,
        ...options.composition,
      };
      const composition = new CompositionSequence(rootSeqSpec, null, rootShape);
      await composition.build();
      this._rootSequence = composition;
      if (composition.target) root.addChild(composition.target);
      composition.bindTimeline(this.timeline);

      const audios: AudioDescriptor[] = [];
      composition.collectAudio(audios, 0);
      if (audios.length > 0) {
        this.audioBuffer = await mixdown(audios, this.duration, audioContext.sampleRate);
      }

      this.timeline.progress(1).progress(0);
      this.app.renderer.render({ container: this.app.stage });

      this._initState = 'ready';
      this.emit('ready');
    } catch (err) {
      try { await this.destroy(); } catch (cleanupErr) {
        console.warn('pixi-effects: cleanup after init failure also threw:', cleanupErr);
      }
      throw err;
    }
  }

  async gotoFrame(frame: number, force = false): Promise<void> {
    if (this._initState !== 'ready') return;
    if (!force && this.currentFrame === frame) return;
    this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames));
    this.timeline!.time(this.currentFrame / this.frameRate);
    await this._awaitVideoFrames();
    this.app?.renderer?.render({ container: this.app.stage });
    this.emit('frame', { frame: this.currentFrame, totalFrames: this.totalFrames } satisfies FrameEvent);
  }

  private async _awaitVideoFrames(): Promise<void> {
    if (!this._rootSequence) return;
    const collected: VideoLike[] = [];
    collectVideoSequences(this._rootSequence, collected);
    const t = this.currentFrame / this.frameRate;
    await Promise.all(collected.map(v => {
      const local = t - v.at;
      if (local < 0 || local > (v.duration ?? 0)) return Promise.resolve();
      return v.awaitFrameAt(local);
    }));
  }

  play(): void {
    if (this._initState !== 'ready') return;
    if (this.currentFrame >= this.totalFrames) this.currentFrame = 0;
    this.isPlaying = true;
    const startTime = performance.now() - (this.currentFrame / this.frameRate * 1000);
    let inFlight = false;
    const tick = (time: number) => {
      if (!this.isPlaying) return;
      if (inFlight) {
        this._raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = (time - startTime) / 1000;
      const frame = Math.floor(elapsed * this.frameRate);
      if (frame <= this.totalFrames) {
        inFlight = true;
        this.gotoFrame(frame).finally(() => { inFlight = false; });
        this._raf = requestAnimationFrame(tick);
      } else {
        this.pause();
        this.gotoFrame(this.totalFrames);
      }
    };
    this._raf = requestAnimationFrame(tick);

    if (this.audioBuffer) {
      const ctx = this._ensureAudioContext();
      this.audioSource = ctx.createBufferSource();
      this.audioSource.buffer = this.audioBuffer;
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = this._muted ? 0 : this._volume;
      this.audioSource.connect(this.gainNode).connect(ctx.destination);
      this.audioSource.start(0, this.currentFrame / this.frameRate);
    }
  }

  pause(): void {
    this.isPlaying = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this.audioSource) {
      try { this.audioSource.stop(); } catch { /* ignore */ }
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }
  get volume(): number { return this._volume; }
  set muted(v: boolean) {
    this._muted = !!v;
    if (this.gainNode) this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }
  get muted(): boolean { return this._muted; }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }

  async render(options?: RenderOptions): Promise<Blob> {
    return await exportFrames(this, options);
  }

  async destroy(): Promise<void> {
    safeRun(() => this.pause());
    safeRun(() => this._rootSequence?.destroy());
    this._rootSequence = null;
    safeRun(() => this.timeline?.kill());
    this.timeline = null;
    safeRun(() => this.app?.destroy(true, { children: true, texture: true, context: true }));
    this.app = null;
    this.audioBuffer = null;
    safeRun(() => this._audioContext?.close().catch(() => {}));
    this._audioContext = null;
    this._initState = 'destroyed';
  }
}

interface VideoLike {
  at: number;
  duration: number | undefined;
  awaitFrameAt(t: number): Promise<void>;
}

function safeRun(fn: () => unknown): void {
  try { fn(); } catch (e) { console.warn('pixi-effects: cleanup step threw, continuing:', e); }
}

function collectVideoSequences(seq: Sequence, out: VideoLike[]): void {
  if (typeof (seq as Sequence & Partial<VideoLike>).awaitFrameAt === 'function') {
    out.push(seq as unknown as VideoLike);
  }
  for (const child of (seq as Sequence & { _children?: Sequence[] })._children ?? []) {
    collectVideoSequences(child, out);
  }
}
```

- [ ] **Step 2: Verify typecheck (some `any`/`as` casts to PIXI internals are fine)**

- [ ] **Step 3: Commit**

```bash
git add src/core/Movie.ts
git commit -m "feat(core): Movie class with full lifecycle + PixiPlugin (TS)"
```

---

### Task 19: `src/core/Renderer.ts`

**Files:**
- Create: `src/core/Renderer.ts`

- [ ] **Step 1: Write `src/core/Renderer.ts`**

```ts
import {
  Output, Mp4OutputFormat, MovOutputFormat, WebMOutputFormat, MkvOutputFormat,
  BufferTarget, CanvasSource, AudioBufferSource,
  QUALITY_VERY_LOW, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH, QUALITY_VERY_HIGH,
} from 'mediabunny';
import type { Movie, RenderOptions } from './Movie';

const qualityMap: Record<string, number> = {
  'very-low': QUALITY_VERY_LOW,
  'low': QUALITY_LOW,
  'medium': QUALITY_MEDIUM,
  'high': QUALITY_HIGH,
  'very-high': QUALITY_VERY_HIGH,
};

const formatMap = {
  mp4:  Mp4OutputFormat,
  mov:  MovOutputFormat,
  webm: WebMOutputFormat,
  mkv:  MkvOutputFormat,
} as const;

export async function exportFrames(movie: Movie, options: RenderOptions = {}): Promise<Blob> {
  const opts = {
    format: options.format ?? 'mp4',
    video: {
      codec: options.video?.codec ?? 'avc',
      bitrate: qualityMap[options.video?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
    audio: {
      codec: options.audio?.codec ?? 'aac',
      bitrate: qualityMap[options.audio?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
  };

  const output = new Output({
    format: new (formatMap[opts.format])(),
    target: new BufferTarget(),
  });
  const canvasSource = new CanvasSource(movie.app!.canvas as HTMLCanvasElement, {
    codec: opts.video.codec as any,
    bitrate: opts.video.bitrate,
  });
  output.addVideoTrack(canvasSource, { frameRate: movie.frameRate });

  if (movie.audioBuffer) {
    const audioSource = new AudioBufferSource({
      codec: opts.audio.codec as any,
      bitrate: opts.audio.bitrate,
    });
    output.addAudioTrack(audioSource);
    await output.start();
    await audioSource.add(movie.audioBuffer);
    audioSource.close();
  } else {
    await output.start();
  }

  movie.app!.ticker.stop();
  try {
    for (let frame = 0; frame <= movie.totalFrames; frame++) {
      await movie.gotoFrame(frame, true);
      await canvasSource.add(frame / movie.frameRate, 1 / movie.frameRate);
      const progress = Math.floor((frame / movie.totalFrames) * 100);
      movie.emit('progress', { progress, frame, totalFrames: movie.totalFrames });
    }
    await canvasSource.close();
    await output.finalize();
    return new Blob([output.target.buffer as ArrayBuffer], { type: output.format.mimeType });
  } finally {
    movie.app!.ticker.start();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/Renderer.ts
git commit -m "feat(core): exportFrames with force-render per-frame (TS)"
```

---

## Phase 10: Controller + public entry

### Task 20: `src/Controller.ts`

**Files:**
- Create: `src/Controller.ts`

The Controller is largely DOM scaffolding (~600 lines). Copy the full body from `../pixistage/src/Controller.js`, change extension to `.ts`, and add types around the public surface.

- [ ] **Step 1: Copy + retype**

Read `../pixistage/src/Controller.js` and copy verbatim. Then:

1. Add at top:
   ```ts
   import type { Movie } from './core/Movie';

   export interface ControllerOptions {
     container?: HTMLElement;
     showVolumeControl?: boolean;
     showTimeDisplay?: boolean;
     showFrameDisplay?: boolean;
     showExportButton?: boolean;
     enableKeyboardShortcuts?: boolean;
     className?: string;
   }
   ```

2. Type the class header:
   ```ts
   export class Controller {
     movie: Movie;
     options: Required<ControllerOptions>;
     private isReady = false;
     private isDragging = false;
     private wasPlayingBeforeDrag = false;
     private showFrameInfo = false;
     private isExporting = false;
     private elements: Record<string, HTMLElement | null> = {};
     private _mouseUpHandler: ((e: MouseEvent) => void) | null = null;
     private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

     constructor(movie: Movie, options: ControllerOptions = {}) {
       this.movie = movie;
       this.options = {
         container: document.body,
         showVolumeControl: true,
         showTimeDisplay: true,
         showFrameDisplay: true,
         showExportButton: true,
         enableKeyboardShortcuts: true,
         className: 'movie-controller',
         ...options,
       };
       // ... rest from pixistage Controller.js
     }
     // ... methods
   }
   ```

3. Type all DOM lookups (many `getElementById` calls). Use `as HTMLButtonElement`, `as HTMLInputElement`, etc.

4. The `bindUIEvents` and `bindKeyboardEvents` methods both end up adding `this._mouseUpHandler` / `this._keyHandler` (the listener-detach-in-destroy fix from pixistage).

5. End with `export { Controller };` removed (already exported via `export class`).

This is mechanical work. The implementer should run `npm run typecheck` repeatedly and add casts/types until it passes.

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm test    # No new tests; existing 42 should still pass.
```

- [ ] **Step 3: Commit**

```bash
git add src/Controller.ts
git commit -m "feat: Controller ported with explicit listener teardown (TS)"
```

---

### Task 21: `src/index.ts` — public re-exports

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

```ts
export { Movie } from './core/Movie';
export type {
  MovieOptions,
  RenderOptions,
  FrameEvent,
  ProgressEvent,
} from './core/Movie';

export type {
  Expr,
  PropValue,
  Props,
  Keyframe,
  AssetSpec,
  ChromaKeyFilterSpec,
  BlurFilterSpec,
  ColorMatrixFilterSpec,
  FilterSpec,
  SequenceCommon,
  VideoSequenceSpec,
  ImageSequenceSpec,
  TextSequenceSpec,
  AudioSequenceSpec,
  CompositionSequenceSpec,
  SequenceSpec,
  CompositionSpec,
} from './types';
```

`Controller` is **not** re-exported here — it lives at the `pixi-effects/controller` subpath.

- [ ] **Step 2: Verify typecheck + build**

```bash
npm run typecheck
npm run build
```

`npm run build` should produce `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`, `dist/Controller.js`, etc.

- [ ] **Step 3: Inspect dist contents**

Run: `ls -la dist/`
Expected: 8 files (4 for index, 4 for Controller) plus their `.map` files.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: public entry — re-exports Movie + DSL types"
```

---

## Phase 11: Examples + assets

### Task 22: Copy `examples/`

**Files:**
- Create: `examples/basic.html`
- Create: `examples/chromakey.html`
- Create: `examples/nested.html`
- Create: `examples/_assets/green.mp4`
- Create: `examples/_assets/bgm.mp3`

- [ ] **Step 1: Copy all examples + assets**

Run:
```bash
cp -r ../pixistage/examples ./examples
```

Expected: `examples/` now contains `basic.html`, `chromakey.html`, `nested.html`, and `_assets/{green.mp4,bgm.mp3}`.

- [ ] **Step 2: Update import paths in HTML files**

In each of the three HTML files, the `<script type="module">` block imports from `../src/index.js` and `../src/Controller.js`. These will now point to TS source. Two options:

**Option A: keep importing from src/**

esm.sh / unpkg won't apply here (we're loading via local `npx serve`). The browser cannot import `.ts` directly — but our source IS `.ts` now.

**Solution**: add a step to import from `../dist/...` after running `npm run build`. Update the importmap to point at `dist/`:

```html
<script type="module">
  import { Movie } from '../dist/index.js';
  import { Controller } from '../dist/Controller.js';
</script>
```

This means examples require a fresh `npm run build` to work. Add a note in README.

- [ ] **Step 3: Test each example**

Run:
```bash
npm run build
npx serve -l 3457 .
```

Navigate to `http://localhost:3457/examples/basic.html` (and the other two) in a browser. Verify the animations work as in pixistage.

If any error appears in the console, fix the path or the corresponding `dist/` file.

- [ ] **Step 4: Commit**

```bash
git add examples/
git commit -m "docs(examples): copy examples from pixistage with dist/ import paths"
```

---

## Phase 12: Verification

### Task 23: Final verification

**Files:** none (verification only)

This task is a checklist run, not a code change. If any step fails, fix the responsible source file and re-run.

- [ ] **Step 1: typecheck clean**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 2: tests green**

```bash
npm test
```
Expected: same set of vitest tests pixistage runs (~42 tests across 7 files).

- [ ] **Step 3: build succeeds**

```bash
npm run build
```
Expected: `dist/` populated with 8+ files.

- [ ] **Step 4: package contents**

```bash
npm pack --dry-run
```

Expected output lists only:
- `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts` (+ `.map` files)
- `dist/Controller.js`, `dist/Controller.cjs`, `dist/Controller.d.ts`, `dist/Controller.d.cts` (+ `.map` files)
- `README.md`, `LICENSE`, `package.json`

NO `src/`, `tests/`, `examples/`, `docs/`.

- [ ] **Step 5: prepublishOnly hook works**

```bash
npm run prepublishOnly
```
Expected: typecheck → test → build all pass; if any fails, the publish would be blocked.

- [ ] **Step 6: playwright-driven example smoke**

Following the same procedure used on pixistage at HEAD:
- Start `npx serve -l 3457 .` in a terminal.
- In another terminal (or via mcp playwright), navigate to each example, verify by capturing screenshots and pixel sampling that the animations behave identically to pixistage. Specifically:
  - `basic.html`: title pop-in scale 0→1 with back.out, subtitle slide-up, three feature pills stagger pop-in, nested rotation, end fade-out
  - `chromakey.html`: green keyed out from t=0, blur ramp 2→3s, threshold ramp 4→5s, end fade-out leaves dark blue background (no green leak; corner pixel = (10, 58, 92) at all sprite.alpha values 1.0 → 0.2)
  - `nested.html`: nested 800×450 composition rotates and houses an inner text; audio fades in then out
- Run two consecutive `movie.render()` on chromakey example and verify the first 31 decoded frames have identical SHA-256 hashes (export determinism)
- Sample live canvas vs export decoded at frames 0, 30, 90, 174 — confirm avg channel diff < 1.0/255 and heavy mismatches < 1%

- [ ] **Step 7: tag and final commit (no code change)**

```bash
git status   # should be clean
git log --oneline | head -30   # review the chain of commits, ~25 atomic commits
git tag v0.1.0-rc1
```

(Do **not** `npm publish` from this plan — only the user knows when to publish.)

---

## Self-Review Notes

**Spec coverage:**
- §1 Goals → Tasks 1–22 produce a TS port with strict types and prepublishOnly enforcement.
- §2 Project structure → Tasks 1–22 create exactly the structure described (24 source files, 7 tests, 3 examples, dist/).
- §3 Build/config → Tasks 1–2 produce the exact tsconfig, tsup.config, vitest.config, and package.json shown in the spec.
- §4 Migration order → Tasks 4–21 follow the exact 12-step bottom-up order, one or a few files per task.
- §5 Behavior preservation → All 9 fixes are preserved verbatim; the relevant code blocks above show the typed equivalents (un-premul shader in Task 7, drawSeq in Task 15, force-render in Tasks 18+19, sticky 'ready' in Task 18, partitionProps in Task 11, FrameCache LRU in Task 10, mask drop in Task 16, listener teardown in Task 20, esm.sh pin → done at example level in Task 22).
- §6 Verification → Task 23 covers all 7 listed verification steps.
- §7 Out-of-scope → no tasks created for those items; reaffirmed at the end of Task 23.

**Type consistency:**
- `Sequence` base in Task 13 declares `target: Container | null`, `intrinsicWidth/Height: number`, `at: number`, `duration: number | undefined`, `filters: NamedFilter[]`. All sequence subclasses use these consistently.
- `AudioDescriptor` shape (`buffer`, `loop`, `start`, `end`, `initialVolume`, `volumeKeyframes`) is identical between Task 3 (types.ts), Task 9 (AudioMixer), Task 14 (AudioSequence), Task 15 (VideoSequence), and Task 16 (CompositionSequence).
- `FrameSink` interface in Task 10 is the contract used by Task 15 (VideoSequence).
- `MovieOptions`, `RenderOptions`, `FrameEvent`, `ProgressEvent` are defined in Task 18 (Movie) and re-exported in Task 21 (index.ts).
- `gotoFrame(frame: number, force?: boolean)` signature is consistent between Task 18 (Movie) and Task 19 (Renderer).

No placeholders remain. All step bodies contain actual code or actual commands.
