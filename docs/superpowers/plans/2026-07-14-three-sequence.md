# three.js Sequence (`type: 'three'`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed arbitrary three.js 3D scenes as layers inside pixi-effects compositions via a new `pixi-effects/three` entry point, with keyframe-driven animation and full playback/export support.

**Architecture:** Each `three` sequence owns an offscreen canvas + `THREE.WebGLRenderer`; every frame it runs the user's `update(t)`, renders the scene, and uploads the canvas into a PIXI texture on an ordinary `Sprite` (so masks/filters/transitions/export compose for free). Per-frame sync rides the existing `awaitFrameAt` duck-typed hook that `Movie.gotoFrame` already awaits for videos. Two small core generalizations: a sequence-type registry (shared cross-bundle via `Symbol.for`) and prefix-based keyframe path routers so `three.<name>.<path>` keyframes reach three.js objects.

**Tech Stack:** TypeScript (strict), PixiJS v8, GSAP, three.js (optional peer dep), tsup, vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-14-three-sequence-design.md`

## Global Constraints

- The core entry (`src/index.ts` and everything it imports) must never import `three` — not even types. Only `src/three/**` may.
- `three` is an optional peer dependency: `peerDependencies.three: ">=0.150.0"`, `peerDependenciesMeta: { "three": { "optional": true } }`.
- tsup uses `splitting: false`, so each entry bundles its own copy of shared modules. **Any state that must be shared between the main bundle and the three bundle must live on `globalThis` keyed by `Symbol.for(...)`** — module-local state will silently fork.
- All existing tests must stay green after every task (`npm test`).
- Run `npm run typecheck && npm test` before every commit.
- Tests run in happy-dom with no WebGL: the `three` module is always mocked via `vi.mock('three', ...)` in tests.
- Determinism contract: three-layer state must be a pure function of local time `t` (documented, not enforced).
- Node >= 18.

---

### Task 1: Sequence-type registry (`registerSequenceType`)

**Files:**
- Modify: `src/core/Composition.ts`
- Modify: `src/index.ts`
- Test: `tests/core/Registry.test.ts` (create)

**Interfaces:**
- Consumes: existing `buildSequenceTree`, `SequenceCtor` (currently a private type in `src/core/Composition.ts`).
- Produces: `export function registerSequenceType(type: string, ctor: SequenceCtor): void` and `export type SequenceCtor` from `src/core/Composition.ts`, re-exported from `src/index.ts`. Registry storage: `globalThis[Symbol.for('pixi-effects.sequenceTypes')]`. Task 7's `registerThree()` calls this.

- [ ] **Step 1: Write the failing test**

Create `tests/core/Registry.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { registerSequenceType, buildSequenceTree } from '../../src/core/Composition';
import { Sequence } from '../../src/sequences/Base';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

class FakeSequence extends Sequence {
  async build(): Promise<void> {
    this.target = new Container();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerSequenceType', () => {
  it('builds registered custom types through buildSequenceTree', async () => {
    registerSequenceType('__test-custom', FakeSequence as never);
    const specs = [{ type: '__test-custom' } as unknown as SequenceSpec];
    const out = await buildSequenceTree(specs, shape, shape);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(FakeSequence);
    expect(out[0]!.duration).toBe(10); // parent duration default still applies
  });

  it('still warns and skips unknown types', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const specs = [{ type: '__test-unregistered' } as unknown as SequenceSpec];
    const out = await buildSequenceTree(specs, shape, shape);
    expect(out).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('__test-unregistered'));
  });

  it('stores the registry on globalThis via Symbol.for so duplicate bundled copies share it', () => {
    registerSequenceType('__test-global', FakeSequence as never);
    const reg = (globalThis as Record<symbol, unknown>)[
      Symbol.for('pixi-effects.sequenceTypes')
    ] as Record<string, unknown>;
    expect(reg['__test-global']).toBe(FakeSequence);
  });

  it('overwrites on re-registration (idempotent double-register is safe)', async () => {
    registerSequenceType('__test-idem', FakeSequence as never);
    registerSequenceType('__test-idem', FakeSequence as never);
    const out = await buildSequenceTree(
      [{ type: '__test-idem' } as unknown as SequenceSpec], shape, shape,
    );
    expect(out).toHaveLength(1);
  });

  it('does not shadow built-in types', async () => {
    // 'shape' is a built-in — registry lookup must not break it.
    const out = await buildSequenceTree(
      [{ type: 'shape', shape: 'rect', width: 10, height: 10 } as SequenceSpec],
      shape, shape,
    );
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/Registry.test.ts`
Expected: FAIL — `registerSequenceType` is not exported.

- [ ] **Step 3: Implement the registry**

In `src/core/Composition.ts`, export the ctor type, add the shared registry, and consult it in `buildSequenceTree`. Replace the private `type SequenceCtor` line and add below `staticTypes`:

```ts
export type SequenceCtor = { new (spec: SequenceSpec, parent: CompositionShape | null, root: CompositionShape): Sequence };
```

```ts
// Externally-registered sequence types (e.g. `pixi-effects/three`).
//
// Stored on globalThis via Symbol.for rather than in a module-local map:
// tsup bundles each entry point with `splitting: false`, so the three entry
// carries its own copy of this module. A module-local map would fork per
// bundle and registrations from `pixi-effects/three` would be invisible to
// the copy the Movie uses. Symbol.for guarantees one shared registry.
const REGISTRY_KEY = Symbol.for('pixi-effects.sequenceTypes');

function getRegistry(): Record<string, SequenceCtor> {
  const g = globalThis as unknown as Record<symbol, Record<string, SequenceCtor> | undefined>;
  return (g[REGISTRY_KEY] ??= {});
}

/** Register an external sequence type. Later registrations overwrite earlier ones. */
export function registerSequenceType(type: string, ctor: SequenceCtor): void {
  getRegistry()[type] = ctor;
}
```

In `buildSequenceTree`, change the lookup line:

```ts
let Cls: SequenceCtor | undefined = staticTypes[spec.type] ?? getRegistry()[spec.type];
```

(Keep the `composition` dynamic-import special case and the warn-and-skip branch exactly as they are.)

In `src/index.ts`, add after the `Movie` exports:

```ts
export { registerSequenceType } from './core/Composition';
export type { SequenceCtor } from './core/Composition';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS (new Registry tests + full existing suite).

- [ ] **Step 5: Commit**

```bash
git add src/core/Composition.ts src/index.ts tests/core/Registry.test.ts
git commit -m "feat(core): add registerSequenceType registry for external sequence types"
```

---

### Task 2: Absolute-start tracking for per-frame sync (`absoluteStart`)

Fixes the local-time computation `Movie._awaitVideoFrames` hands to `awaitFrameAt`: today it uses `t - v.at`, which is wrong for sequences nested inside offset compositions. The three sequence relies on this hook for correct animation time, so make it exact.

**Files:**
- Modify: `src/sequences/Base.ts`
- Modify: `src/core/Movie.ts:202-212` (`_awaitVideoFrames`) and `src/core/Movie.ts:305-309` (`VideoLike`)
- Test: `tests/sequences/AbsoluteStart.test.ts` (create)

**Interfaces:**
- Consumes: `Sequence.bindTimeline(timeline, offset)` (existing).
- Produces: `Sequence.absoluteStart: number | null` — set to `offset + this.at` inside `Base.bindTimeline`. `Movie._awaitVideoFrames` computes `local = t - (v.absoluteStart ?? v.at)`. Task 5's `awaitFrameAt` receives this corrected local time.
- Known limitation (do NOT fix here): `VideoSequence.bindTimeline` calls `super.bindTimeline(timeline)` without forwarding `offset`, so videos keep today's behavior (`absoluteStart === at`). The `?? v.at` fallback keeps every existing path byte-identical.

- [ ] **Step 1: Write the failing test**

Create `tests/sequences/AbsoluteStart.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from '../../src/sequences/Base';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

class StubSequence extends Sequence {
  async build(): Promise<void> {
    this.target = new Container();
  }
}

function makeSeq(at: number): StubSequence {
  const spec = { type: 'shape', shape: 'rect', width: 1, height: 1, at, duration: 2 } as SequenceSpec;
  return new StubSequence(spec, shape, shape);
}

describe('Sequence.absoluteStart', () => {
  it('is null before bindTimeline', async () => {
    const seq = makeSeq(1);
    await seq.build();
    expect(seq.absoluteStart).toBeNull();
  });

  it('records offset + at when bound', async () => {
    const seq = makeSeq(1);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl, 3); // nested composition starting at t=3
    expect(seq.absoluteStart).toBe(4);
    tl.kill();
  });

  it('equals at when bound with no offset', async () => {
    const seq = makeSeq(1.5);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    expect(seq.absoluteStart).toBe(1.5);
    tl.kill();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sequences/AbsoluteStart.test.ts`
Expected: FAIL — `absoluteStart` is undefined (property does not exist).

- [ ] **Step 3: Implement**

In `src/sequences/Base.ts`, add the field below `maskSequence`:

```ts
  /**
   * Absolute start time on the global timeline (offset + at), recorded by
   * bindTimeline. Movie._awaitVideoFrames uses it to hand awaitFrameAt a
   * correct local time even for sequences nested in offset compositions.
   * Null until the sequence is bound.
   */
  absoluteStart: number | null = null;
```

In `Base.bindTimeline`, the `startTime` const already exists — record it:

```ts
    const startTime = offset + this.at;
    const endTime = startTime + this.duration!;
    this.absoluteStart = startTime;
```

In `src/core/Movie.ts`, update `VideoLike` and the local-time computation:

```ts
interface VideoLike {
  at: number;
  duration: number | undefined;
  absoluteStart?: number | null;
  awaitFrameAt(t: number): Promise<void>;
}
```

In `_awaitVideoFrames`, change the `local` line:

```ts
      const local = t - (v.absoluteStart ?? v.at);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sequences/Base.ts src/core/Movie.ts tests/sequences/AbsoluteStart.test.ts
git commit -m "fix(core): track absolute start time for per-frame sync in nested compositions"
```

---

### Task 3: Keyframe path routers in the timeline pipeline

Generalizes keyframe property routing so a prefix like `three.` can resolve to arbitrary external objects. The existing `filters.` handling stays byte-for-byte on its current path — routers are additive.

**Files:**
- Modify: `src/core/Timeline.ts`
- Modify: `src/sequences/Base.ts`
- Test: `tests/core/PathRouters.test.ts` (create)

**Interfaces:**
- Consumes: existing `applyKeyframes(timeline, target, keyframes, parentDuration, scope, skipKeys, offset)` and `applyInitial(target, initial, scope, skipKeys)`.
- Produces (used by Task 6):
  - `export type PathRouter = (path: string) => { target: object; prop: string } | null` — `path` is everything after `<prefix>.`.
  - `export type PathRouters = Record<string, PathRouter>` — key = prefix (e.g. `'three'`).
  - `applyKeyframes(..., offset = 0, routers?: PathRouters)` — new optional 8th param.
  - `applyInitial(..., skipKeys = [], routers?: PathRouters)` — new optional 5th param.
  - `Sequence` gains `protected pathRouters(): PathRouters { return {}; }`; `Base.bindTimeline` passes it to both functions. Subclasses override to contribute routers.

- [ ] **Step 1: Write the failing test**

Create `tests/core/PathRouters.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
import { applyKeyframes, applyInitial, splitRouted, type PathRouters } from '../../src/core/Timeline';

/** Router resolving against a plain-object registry, walking dotted paths. */
function makeRouter(registry: Record<string, object>): PathRouters {
  return {
    three: (path: string) => {
      const segs = path.split('.');
      let obj: unknown = registry[segs[0]!];
      for (let i = 1; i < segs.length - 1; i++) {
        obj = (obj as Record<string, unknown> | undefined)?.[segs[i]!];
      }
      const prop = segs[segs.length - 1]!;
      if (obj == null || typeof obj !== 'object' || !(prop in obj)) return null;
      return { target: obj, prop };
    },
  };
}

describe('splitRouted', () => {
  it('returns everything as rest when no routers given', () => {
    const { rest, routed } = splitRouted({ x: 1, 'three.cube.rotation.y': 2 }, undefined);
    expect(rest).toEqual({ x: 1, 'three.cube.rotation.y': 2 });
    expect(routed).toEqual([]);
  });

  it('routes prefixed keys and leaves the rest (incl. filters.*) untouched', () => {
    const cube = { rotation: { y: 0 } };
    const routers = makeRouter({ cube });
    const { rest, routed } = splitRouted(
      { x: 1, 'filters.b.strength': 8, 'three.cube.rotation.y': 2 }, routers,
    );
    expect(rest).toEqual({ x: 1, 'filters.b.strength': 8 });
    expect(routed).toHaveLength(1);
    expect(routed[0]).toMatchObject({ target: cube.rotation, prop: 'y', key: 'three.cube.rotation.y', value: 2 });
  });

  it('drops keys the router cannot resolve', () => {
    const routers = makeRouter({});
    const { rest, routed } = splitRouted({ 'three.missing.x': 1 }, routers);
    expect(rest).toEqual({});
    expect(routed).toEqual([]);
  });
});

describe('applyKeyframes with routers', () => {
  it('tweens routed props (to)', () => {
    const cube = { rotation: { x: 0, y: 0 } };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, {}, [{ at: 0, to: { 'three.cube.rotation.y': 2 }, duration: 1 }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(1);
    expect(cube.rotation.y).toBeCloseTo(2);
    tl.kill();
  });

  it('sets routed props (set)', () => {
    const cube = { visible: 0 };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, {}, [{ at: 0.5, set: { 'three.cube.visible': 1 } }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(1);
    expect(cube.visible).toBe(1);
    tl.kill();
  });

  it('pairs from/to per key (fromTo)', () => {
    const cube = { position: { z: 99 } };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, {},
      [{ at: 0, from: { 'three.cube.position.z': 0 }, to: { 'three.cube.position.z': 10 }, duration: 1 }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(0);
    expect(cube.position.z).toBeCloseTo(0);
    tl.progress(1);
    expect(cube.position.z).toBeCloseTo(10);
    tl.kill();
  });

  it('respects the timeline offset for routed props', () => {
    const cube = { rotation: { y: 0 } };
    const tl = gsap.timeline({ paused: true });
    tl.add(gsap.to({}, { duration: 10 })); // give the timeline room
    applyKeyframes(tl, {}, [{ at: 0, to: { 'three.cube.rotation.y': 2 }, duration: 2 }],
      10, {}, [], 4, makeRouter({ cube })); // offset = 4
    tl.time(4);
    expect(cube.rotation.y).toBeCloseTo(0);
    tl.time(6);
    expect(cube.rotation.y).toBeCloseTo(2);
    tl.kill();
  });

  it('still applies non-routed props to the main target alongside routed ones', () => {
    const cube = { rotation: { y: 0 } };
    const sprite = { x: 0 };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, sprite, [{ at: 0, to: { x: 50, 'three.cube.rotation.y': 2 }, duration: 1 }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(1);
    expect(sprite.x).toBeCloseTo(50);
    expect(cube.rotation.y).toBeCloseTo(2);
    tl.kill();
  });
});

describe('applyInitial with routers', () => {
  it('sets routed props immediately', () => {
    const cube = { position: { z: 0 } };
    applyInitial({}, { 'three.cube.position.z': 5 }, {}, [], makeRouter({ cube }));
    expect(cube.position.z).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/PathRouters.test.ts`
Expected: FAIL — `splitRouted` is not exported.

- [ ] **Step 3: Implement in `src/core/Timeline.ts`**

Add types and `splitRouted` after `partitionProps`:

```ts
/**
 * Resolves a routed keyframe path to a concrete GSAP tween target.
 * `path` is everything after the registered prefix + dot (for
 * `three.cube.rotation.y` under prefix `three`, path = `cube.rotation.y`).
 * Return null to skip the key (the router is expected to have warned).
 */
export type PathRouter = (path: string) => { target: object; prop: string } | null;
export type PathRouters = Record<string, PathRouter>;

export interface RoutedProp {
  target: object;
  prop: string;
  /** Original full key, used to pair from/to sides of a fromTo keyframe. */
  key: string;
  value: unknown;
}

export function splitRouted(
  props: Record<string, unknown>,
  routers: PathRouters | undefined,
): { rest: Record<string, unknown>; routed: RoutedProp[] } {
  if (!routers) return { rest: props, routed: [] };
  const rest: Record<string, unknown> = {};
  const routed: RoutedProp[] = [];
  for (const k of Object.keys(props)) {
    const dot = k.indexOf('.');
    const router = dot > 0 ? routers[k.slice(0, dot)] : undefined;
    if (router) {
      const hit = router(k.slice(dot + 1));
      if (hit) routed.push({ target: hit.target, prop: hit.prop, key: k, value: props[k] });
      // Unresolved keys are dropped — the router already warned.
    } else {
      rest[k] = props[k];
    }
  }
  return { rest, routed };
}
```

Extend `applyKeyframes` — new signature and per-kind handling. The existing filter/own-prop flow is unchanged except it now consumes `split.rest` instead of the full resolved object:

```ts
export function applyKeyframes(
  timeline: Timeline,
  target: object,
  keyframes: Keyframe[] | undefined,
  parentDuration: number,
  scope: Record<string, number>,
  skipKeys: string[] = [],
  offset = 0,
  routers?: PathRouters,
): void {
  for (const raw of keyframes ?? []) {
    const kf = normalizeKeyframe(raw, parentDuration);
    const at = offset + kf.at;
    if (kf.kind === 'set') {
      const resolved = normalizeProps(kf.set!, scope, { skipKeys });
      const { rest, routed } = splitRouted(resolved, routers);
      for (const r of routed) timeline.set(r.target, { [r.prop]: r.value }, at);
      const { ownProps, filterProps } = partitionProps(rest);
      // ... existing set-kind body, unchanged ...
    } else if (kf.kind === 'to') {
      const resolved = normalizeProps(kf.to!, scope, { skipKeys });
      const { rest, routed } = splitRouted(resolved, routers);
      for (const r of routed)
        timeline.to(r.target, { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
      const { ownProps, filterProps } = partitionProps(rest);
      // ... existing to-kind body, unchanged ...
    } else if (kf.kind === 'from') {
      const resolved = normalizeProps(kf.from!, scope, { skipKeys });
      const { rest, routed } = splitRouted(resolved, routers);
      for (const r of routed)
        timeline.from(r.target, { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
      const { ownProps, filterProps } = partitionProps(rest);
      // ... existing from-kind body, unchanged ...
    } else {
      const fromResolved = normalizeProps(kf.from!, scope, { skipKeys });
      const toResolved = normalizeProps(kf.to!, scope, { skipKeys });
      const fromRouted = splitRouted(fromResolved, routers);
      const toRouted = splitRouted(toResolved, routers);
      // Pair routed from/to entries by their original key.
      const fromByKey = new Map(fromRouted.routed.map(r => [r.key, r]));
      for (const r of toRouted.routed) {
        const f = fromByKey.get(r.key);
        fromByKey.delete(r.key);
        if (f) {
          timeline.fromTo(r.target, { [r.prop]: f.value },
            { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
        } else {
          timeline.to(r.target, { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
        }
      }
      for (const f of fromByKey.values())
        timeline.from(f.target, { [f.prop]: f.value, duration: kf.duration, ease: kf.ease }, at);
      const fromSplit = partitionProps(fromRouted.rest);
      const toSplit = partitionProps(toRouted.rest);
      // ... existing fromTo-kind body, unchanged ...
    }
  }
}
```

Extend `applyInitial` the same way:

```ts
export function applyInitial(
  target: object,
  initial: Record<string, unknown> | undefined,
  scope: Record<string, number>,
  skipKeys: string[] = [],
  routers?: PathRouters,
): void {
  if (!initial) return;
  const resolved = normalizeProps(initial, scope, { skipKeys });
  const { rest, routed } = splitRouted(resolved, routers);
  for (const r of routed) gsap.set(r.target, { [r.prop]: r.value });
  const { ownProps, filterProps } = partitionProps(rest);
  // ... existing body, unchanged ...
}
```

In `src/sequences/Base.ts`, add the hook and pass routers through (also import `type PathRouters` from `../core/Timeline`):

```ts
  /**
   * Prefix routers contributed to the keyframe pipeline (e.g. `three.` in
   * pixi-effects/three). Base sequences route nothing extra.
   */
  protected pathRouters(): PathRouters {
    return {};
  }
```

In `Base.bindTimeline`, thread them:

```ts
    const routers = this.pathRouters();
    applyInitial(this.target, this.spec.initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>, [], routers);
    applyKeyframes(timeline, this.target, this.spec.keyframes, this.duration!, scope as unknown as Record<string, number>, [], offset, routers);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS — including the untouched `tests/core/Timeline.test.ts` (`partitionProps` behavior is unchanged) and all sequence/filter tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/Timeline.ts src/sequences/Base.ts tests/core/PathRouters.test.ts
git commit -m "feat(core): generalize keyframe routing with prefix path routers"
```

---

### Task 4: ThreeSequence — build lifecycle

Adds the `three` devDependency and the sequence class: offscreen renderer, scene/camera, user `setup`, sprite target. Frame sync and keyframes come in Tasks 5–6.

**Files:**
- Modify: `package.json` (devDependencies only in this task)
- Create: `src/three/types.ts`
- Create: `src/three/ThreeSequence.ts`
- Test: `tests/three/ThreeSequence.build.test.ts` (create, plus shared mock helper `tests/three/mockThree.ts`)

**Interfaces:**
- Consumes: `Sequence` base class, `buildScope` (`src/expr/Scope.ts`), `evaluateExpr` (`src/expr/Parser.ts`).
- Produces (used by Tasks 5–7):
  - `src/three/types.ts`: `ThreeContext { scene; camera; renderer; width: number; height: number }`, `ThreeSetupResult { objects?: Record<string, object>; camera?: Camera }`, `ThreeSequenceSpec extends SequenceCommon { type: 'three'; width?: PropValue; height?: PropValue; resolution?: number; setup; update?; dispose? }` (signatures exactly as in the spec).
  - `ThreeSequence extends Sequence` with `async build(): Promise<void>`; internal fields `_renderer`, `_scene`, `_camera`, `_ctx`, `_objects: Record<string, object>` (private — tests reach them via `as any`).

- [ ] **Step 1: Install three**

```bash
npm i -D three @types/three
```

Expected: both appear in `package.json` devDependencies. Commit happens at the end of the task.

- [ ] **Step 2: Write the shared three mock**

Create `tests/three/mockThree.ts`:

```ts
import { vi } from 'vitest';

export class MockScene {
  isMockScene = true;
  children: unknown[] = [];
  add(...objs: unknown[]) { this.children.push(...objs); }
}

export class MockPerspectiveCamera {
  isMockCamera = true;
  fov: number; aspect: number; near: number; far: number;
  position = { x: 0, y: 0, z: 0 };
  rotation = { x: 0, y: 0, z: 0 };
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
  }
}

export class MockWebGLRenderer {
  domElement: HTMLCanvasElement;
  renderCalls: Array<{ scene: unknown; camera: unknown }> = [];
  setSizeCalls: Array<[number, number, boolean | undefined]> = [];
  clearColor: [unknown, number] | null = null;
  disposed = false;
  contextLost = false;
  constructor(opts: { canvas: HTMLCanvasElement }) { this.domElement = opts.canvas; }
  setSize(w: number, h: number, updateStyle?: boolean) {
    this.setSizeCalls.push([w, h, updateStyle]);
    this.domElement.width = w;
    this.domElement.height = h;
  }
  setClearColor(color: unknown, alpha: number) { this.clearColor = [color, alpha]; }
  render(scene: unknown, camera: unknown) { this.renderCalls.push({ scene, camera }); }
  dispose() { this.disposed = true; }
  forceContextLoss() { this.contextLost = true; }
}

/** Call at the top of every three test file, BEFORE importing ThreeSequence. */
export function mockThreeModule() {
  vi.mock('three', () => ({
    Scene: MockScene,
    PerspectiveCamera: MockPerspectiveCamera,
    WebGLRenderer: MockWebGLRenderer,
  }));
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/three/ThreeSequence.build.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockScene, MockPerspectiveCamera, MockWebGLRenderer } from './mockThree';
mockThreeModule();

import { Sprite } from 'pixi.js';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec, ThreeContext } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };

function makeSeq(over: Partial<ThreeSequenceSpec> = {}): ThreeSequence {
  const spec = { type: 'three', setup: vi.fn(), ...over } as unknown as SequenceSpec;
  return new ThreeSequence(spec, shape, shape);
}

describe('ThreeSequence.build', () => {
  it('calls setup once with scene/camera/renderer/size context', async () => {
    const setup = vi.fn();
    const seq = makeSeq({ setup });
    await seq.build();
    expect(setup).toHaveBeenCalledTimes(1);
    const ctx = setup.mock.calls[0]![0] as ThreeContext;
    expect((ctx.scene as unknown as MockScene).isMockScene).toBe(true);
    expect(ctx.renderer).toBeInstanceOf(MockWebGLRenderer);
    expect(ctx.width).toBe(1280);
    expect(ctx.height).toBe(720);
    expect((ctx.camera as unknown as MockPerspectiveCamera).aspect).toBeCloseTo(1280 / 720);
  });

  it('defaults the layer to the parent composition size and produces a Sprite target', async () => {
    const seq = makeSeq();
    await seq.build();
    expect(seq.target).toBeInstanceOf(Sprite);
    expect(seq.intrinsicWidth).toBe(1280);
    expect(seq.intrinsicHeight).toBe(720);
  });

  it('resolves width/height expressions against the scope', async () => {
    const seq = makeSeq({ width: 'W * 0.5', height: 'H / 2' });
    await seq.build();
    expect(seq.intrinsicWidth).toBe(640);
    expect(seq.intrinsicHeight).toBe(360);
  });

  it('applies the resolution factor to the canvas, not the layer size', async () => {
    const seq = makeSeq({ width: 640, height: 360, resolution: 2 });
    await seq.build();
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(renderer.setSizeCalls[0]).toEqual([1280, 720, false]);
    expect(seq.intrinsicWidth).toBe(640);
    // Sprite is scaled back down to layer size in comp px.
    expect((seq.target as Sprite).width).toBeCloseTo(640);
  });

  it('renders once at build so the texture has frame-0 content', async () => {
    const seq = makeSeq();
    await seq.build();
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(renderer.renderCalls).toHaveLength(1);
  });

  it('sets a transparent clear color', async () => {
    const seq = makeSeq();
    await seq.build();
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(renderer.clearColor?.[1]).toBe(0);
  });

  it('adopts a camera returned from setup', async () => {
    const custom = new MockPerspectiveCamera(30, 1);
    const seq = makeSeq({ setup: () => ({ camera: custom as never }) });
    await seq.build();
    expect((seq as any)._camera).toBe(custom);
    expect(((seq as any)._ctx as ThreeContext).camera).toBe(custom);
  });

  it('merges returned objects and always includes camera implicitly', async () => {
    const cube = { rotation: { y: 0 } };
    const seq = makeSeq({ setup: () => ({ objects: { cube } }) });
    await seq.build();
    const objects = (seq as any)._objects as Record<string, object>;
    expect(objects.cube).toBe(cube);
    expect(objects.camera).toBe((seq as any)._camera);
  });

  it('disposes the renderer and rethrows when setup fails', async () => {
    const seq = makeSeq({ setup: () => { throw new Error('boom'); } });
    await expect(seq.build()).rejects.toThrow('boom');
    // The renderer created before the failure must not leak its context.
    // ThreeSequence keeps no renderer reference after cleanup.
    expect((seq as any)._renderer).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/three/ThreeSequence.build.test.ts`
Expected: FAIL — cannot resolve `../../src/three/ThreeSequence`.

- [ ] **Step 5: Create `src/three/types.ts`**

```ts
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { SequenceCommon, PropValue } from '../types';

/** Handed to setup / update / dispose. One per three sequence. */
export interface ThreeContext {
  scene: Scene;
  /** Default: PerspectiveCamera(50, width/height, 0.1, 2000). Replaced when setup returns { camera }. */
  camera: Camera;
  renderer: WebGLRenderer;
  /** Resolved layer size in composition px. */
  width: number;
  height: number;
}

export interface ThreeSetupResult {
  /** Objects addressable from keyframes as `three.<name>.<path>`. `camera` is added implicitly unless present. */
  objects?: Record<string, object>;
  /** Replaces the default camera. */
  camera?: Camera;
}

export interface ThreeSequenceSpec extends SequenceCommon {
  type: 'three';
  /** Layer size in composition px. Expressions allowed (e.g. 'W * 0.5'). Default: parent composition size. */
  width?: PropValue;
  height?: PropValue;
  /** Supersampling factor for the offscreen canvas. Default 1. */
  resolution?: number;
  /**
   * Build the scene. Add objects to `ctx.scene`, position `ctx.camera`
   * (or replace it entirely by returning `{ camera }`). Async so GLTF /
   * texture loading can be awaited — Movie.init waits for it.
   */
  setup: (ctx: ThreeContext) => Promise<ThreeSetupResult | void> | ThreeSetupResult | void;
  /**
   * Optional per-frame hook; `t` is sequence-local time in seconds.
   * MUST derive state purely from `t` (no wall clock, no unseeded
   * randomness) — playback and export both seek arbitrarily and must
   * produce identical frames.
   */
  update?: (t: number, ctx: ThreeContext) => void;
  /** Cleanup for user-created GPU resources (geometries, materials, textures). Called from destroy(). */
  dispose?: (ctx: ThreeContext) => void;
}
```

- [ ] **Step 6: Create `src/three/ThreeSequence.ts`**

```ts
import { Sprite, Texture } from 'pixi.js';
import { PerspectiveCamera, Scene, WebGLRenderer, type Camera } from 'three';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PropValue } from '../types';
import type { ThreeContext, ThreeSequenceSpec } from './types';

export class ThreeSequence extends Sequence {
  private _renderer: WebGLRenderer | null = null;
  private _scene: Scene | null = null;
  private _camera: Camera | null = null;
  private _ctx: ThreeContext | null = null;
  private _objects: Record<string, object> = {};

  private get _threeSpec(): ThreeSequenceSpec {
    return this.spec as unknown as ThreeSequenceSpec;
  }

  async build(): Promise<void> {
    const spec = this._threeSpec;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }

    // Resolve layer size. Expressions see the usual scope; intrinsic w/h are
    // still 0 here (same chicken-and-egg as shapes), so W/H/GW/GH carry it.
    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    const width = resolveDim(spec.width, scope) ?? this.parent?.width ?? this.root.width;
    const height = resolveDim(spec.height, scope) ?? this.parent?.height ?? this.root.height;
    const resolution = spec.resolution ?? 1;

    // Offscreen canvas — never attached to the DOM. document.createElement
    // (not OffscreenCanvas) so PIXI's Texture.from and three both accept it.
    const canvas = document.createElement('canvas');
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this._renderer = renderer;
    try {
      renderer.setSize(Math.round(width * resolution), Math.round(height * resolution), false);
      renderer.setClearColor(0x000000, 0);

      const scene = new Scene();
      const camera: Camera = new PerspectiveCamera(50, width / height, 0.1, 2000);
      const ctx: ThreeContext = { scene, camera, renderer, width, height };

      const result = await spec.setup(ctx);
      if (result?.camera) ctx.camera = result.camera;
      this._scene = scene;
      this._camera = ctx.camera;
      this._ctx = ctx;
      this._objects = { ...(result?.objects ?? {}) };
      if (!('camera' in this._objects)) this._objects.camera = this._camera;

      // Frame 0 so the texture is never blank before the first tick.
      renderer.render(scene, this._camera);

      const texture = Texture.from(canvas);
      const sprite = new Sprite({ texture, label: spec.name });
      sprite.cullable = true;
      // Texture is canvas-sized (layer px × resolution); scale back to comp px.
      sprite.width = width;
      sprite.height = height;
      this.target = sprite;
      this.intrinsicWidth = width;
      this.intrinsicHeight = height;
      this.buildFilters();
    } catch (err) {
      this._disposeRenderer();
      throw err;
    }
  }

  private _disposeRenderer(): void {
    if (!this._renderer) return;
    try {
      this._renderer.dispose();
      this._renderer.forceContextLoss();
    } catch { /* context may already be gone */ }
    this._renderer = null;
  }

  override destroy(): void {
    const spec = this._threeSpec;
    if (this._ctx && spec.dispose) {
      try { spec.dispose(this._ctx); } catch (err) {
        console.warn('pixi-effects: three dispose() threw —', err);
      }
    }
    const texture = (this.target as Sprite | null)?.texture;
    this._disposeRenderer();
    this._scene = null;
    this._camera = null;
    this._ctx = null;
    this._objects = {};
    super.destroy();
    texture?.destroy(true); // canvas-backed source is per-sequence; safe to kill
  }
}

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS. If `Texture.from(canvas)` throws under happy-dom (it should not — PIXI v8's `CanvasSource` only reads the element's dimensions at construction), stub it per-test with `vi.spyOn(Texture, 'from')` returning `Texture.WHITE` and adjust the sprite-size assertion; note the deviation in the commit message.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/three/ tests/three/
git commit -m "feat(three): add ThreeSequence build lifecycle with offscreen renderer"
```

---

### Task 5: ThreeSequence — per-frame sync (`awaitFrameAt`) and destroy behavior

**Files:**
- Modify: `src/three/ThreeSequence.ts`
- Test: `tests/three/ThreeSequence.frame.test.ts` (create)

**Interfaces:**
- Consumes: `Movie._awaitVideoFrames`' duck-typed contract — any sequence with `awaitFrameAt(local: number): Promise<void>` is collected and awaited once per `gotoFrame`, only when `0 <= local <= duration` (local computed via Task 2's `absoluteStart`).
- Produces: `ThreeSequence.awaitFrameAt(local: number): Promise<void>` — clamps `local` to `[0, duration]`, calls `update`, renders, uploads the texture. Contained `update` errors (warn once, keep rendering).

- [ ] **Step 1: Write the failing test**

Create `tests/three/ThreeSequence.frame.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockWebGLRenderer } from './mockThree';
mockThreeModule();

import { Sprite } from 'pixi.js';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

async function build(over: Partial<ThreeSequenceSpec> = {}): Promise<ThreeSequence> {
  const spec = { type: 'three', setup: vi.fn(), duration: 4, ...over } as unknown as SequenceSpec;
  const seq = new ThreeSequence(spec, shape, shape);
  await seq.build();
  return seq;
}

describe('ThreeSequence.awaitFrameAt', () => {
  it('calls update with the local time, then renders, then uploads the texture', async () => {
    const calls: string[] = [];
    const update = vi.fn(() => calls.push('update'));
    const seq = await build({ update });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    const origRender = renderer.render.bind(renderer);
    renderer.render = (s, c) => { calls.push('render'); origRender(s, c); };
    const upload = vi.spyOn((seq.target as Sprite).texture.source, 'update')
      .mockImplementation(function (this: unknown) { calls.push('upload'); return this as never; });

    await seq.awaitFrameAt(1.5);

    expect(update).toHaveBeenCalledWith(1.5, (seq as any)._ctx);
    expect(calls).toEqual(['update', 'render', 'upload']);
    upload.mockRestore();
  });

  it('clamps local time into [0, duration]', async () => {
    const update = vi.fn();
    const seq = await build({ update });
    await seq.awaitFrameAt(-0.25);
    await seq.awaitFrameAt(99);
    expect(update).toHaveBeenNthCalledWith(1, 0, expect.anything());
    expect(update).toHaveBeenNthCalledWith(2, 4, expect.anything());
  });

  it('renders with the adopted camera', async () => {
    const custom = { isMockCamera: true, projection: 1 };
    const seq = await build({ setup: () => ({ camera: custom as never }) });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    await seq.awaitFrameAt(0);
    expect(renderer.renderCalls.at(-1)!.camera).toBe(custom);
  });

  it('contains update() throws: warns once, keeps rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update = vi.fn(() => { throw new Error('user bug'); });
    const seq = await build({ update });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    const before = renderer.renderCalls.length;

    await seq.awaitFrameAt(1);
    await seq.awaitFrameAt(2);

    expect(renderer.renderCalls.length).toBe(before + 2); // still renders
    expect(warn).toHaveBeenCalledTimes(1);                // warned once, not per frame
    warn.mockRestore();
  });

  it('is a no-op after destroy', async () => {
    const update = vi.fn();
    const seq = await build({ update });
    seq.destroy();
    await seq.awaitFrameAt(1);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ThreeSequence.destroy', () => {
  it('runs user dispose with the ctx, then disposes the renderer and loses the context', async () => {
    const order: string[] = [];
    const dispose = vi.fn(() => order.push('user'));
    const seq = await build({ dispose });
    const ctx = (seq as any)._ctx;
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    const origDispose = renderer.dispose.bind(renderer);
    renderer.dispose = () => { order.push('renderer'); origDispose(); };

    seq.destroy();

    expect(dispose).toHaveBeenCalledWith(ctx);
    expect(order).toEqual(['user', 'renderer']);
    expect(renderer.contextLost).toBe(true);
    expect(seq.target).toBeNull();
  });

  it('survives a throwing user dispose', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seq = await build({ dispose: () => { throw new Error('bad cleanup'); } });
    const renderer = (seq as any)._renderer as MockWebGLRenderer;
    expect(() => seq.destroy()).not.toThrow();
    expect(renderer.disposed).toBe(true);
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/three/ThreeSequence.frame.test.ts`
Expected: FAIL — `awaitFrameAt` is not a function.

- [ ] **Step 3: Implement `awaitFrameAt`**

Add to `ThreeSequence` (plus the `_warnedUpdate` field):

```ts
  private _warnedUpdate = false;

  /**
   * Per-frame sync hook. Movie._awaitVideoFrames duck-types on this method
   * (same contract as VideoSequence) and awaits it inside gotoFrame — the
   * single frame path shared by playback and export, which is what makes
   * three layers deterministic in both.
   */
  async awaitFrameAt(local: number): Promise<void> {
    if (!this._renderer || !this._scene || !this._camera || !this._ctx) return;
    const spec = this._threeSpec;
    const t = Math.max(0, Math.min(local, this.duration ?? local));
    if (spec.update) {
      try {
        spec.update(t, this._ctx);
      } catch (err) {
        if (!this._warnedUpdate) {
          this._warnedUpdate = true;
          console.warn('pixi-effects: three update() threw (reported once) —', err);
        }
      }
    }
    this._renderer.render(this._scene, this._camera);
    (this.target as Sprite | null)?.texture.source.update();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS (destroy tests pass against Task 4's existing `destroy()`; only `awaitFrameAt` is new).

- [ ] **Step 5: Commit**

```bash
git add src/three/ThreeSequence.ts tests/three/ThreeSequence.frame.test.ts
git commit -m "feat(three): per-frame sync via awaitFrameAt with contained update errors"
```

---

### Task 6: ThreeSequence — `three.*` keyframe routing

**Files:**
- Modify: `src/three/ThreeSequence.ts`
- Test: `tests/three/ThreeSequence.keyframes.test.ts` (create)

**Interfaces:**
- Consumes: Task 3's `PathRouters` / `protected pathRouters()` hook; Task 4's `_objects` registry.
- Produces: `three.<name>.<dotted.path>` keyframe/initial support on three sequences. Unresolvable paths warn once per path and are skipped.

- [ ] **Step 1: Write the failing test**

Create `tests/three/ThreeSequence.keyframes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockPerspectiveCamera } from './mockThree';
mockThreeModule();

import { gsap } from 'gsap';
import { Sprite } from 'pixi.js';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };

async function bind(over: Partial<ThreeSequenceSpec>): Promise<{ seq: ThreeSequence; tl: gsap.core.Timeline }> {
  const spec = { type: 'three', setup: vi.fn(), duration: 10, ...over } as unknown as SequenceSpec;
  const seq = new ThreeSequence(spec, shape, shape);
  await seq.build();
  const tl = gsap.timeline({ paused: true });
  tl.add(gsap.to({}, { duration: 10 }));
  seq.bindTimeline(tl);
  return { seq, tl };
}

describe('three.* keyframes', () => {
  it('tweens exposed objects through dotted paths', async () => {
    const cube = { rotation: { x: 0, y: 0 } };
    const { tl } = await bind({
      setup: () => ({ objects: { cube } }),
      keyframes: [{ at: 0, to: { 'three.cube.rotation.y': Math.PI }, duration: 2 }],
    });
    tl.time(2);
    expect(cube.rotation.y).toBeCloseTo(Math.PI);
    tl.kill();
  });

  it('addresses the implicit camera', async () => {
    const { seq, tl } = await bind({
      keyframes: [{ at: 0, to: { 'three.camera.fov': 30 }, duration: 1 }],
    });
    tl.time(1);
    expect(((seq as any)._camera as MockPerspectiveCamera).fov).toBeCloseTo(30);
    tl.kill();
  });

  it('resolves expression values against the scope', async () => {
    const cube = { position: { x: 0 } };
    const { tl } = await bind({
      setup: () => ({ objects: { cube } }),
      keyframes: [{ at: 0, to: { 'three.cube.position.x': 'W / 4' }, duration: 1 }],
    });
    tl.time(1);
    expect(cube.position.x).toBeCloseTo(320); // 1280 / 4
    tl.kill();
  });

  it('supports three.* in initial', async () => {
    const cube = { position: { z: 0 } };
    const { tl } = await bind({
      setup: () => ({ objects: { cube } }),
      initial: { 'three.cube.position.z': 5 },
    });
    expect(cube.position.z).toBe(5);
    tl.kill();
  });

  it('warns once and skips unresolvable paths without breaking sibling props', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { seq, tl } = await bind({
      keyframes: [
        { at: 0, to: { 'three.nope.x': 1, x: 50 }, duration: 1 },
        { at: 2, to: { 'three.nope.x': 2 }, duration: 1 },
      ],
    });
    tl.time(1);
    expect((seq.target as Sprite).x).toBeCloseTo(50); // sprite prop unaffected
    const pathWarnings = warn.mock.calls.filter(c => String(c[0]).includes('three.nope.x'));
    expect(pathWarnings).toHaveLength(1); // once per path, not per keyframe
    warn.mockRestore();
    tl.kill();
  });

  it('rejects paths without at least <object>.<prop>', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { tl } = await bind({
      keyframes: [{ at: 0, to: { 'three.camera': 1 }, duration: 1 }],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('three.camera'));
    warn.mockRestore();
    tl.kill();
  });

  it('still runs plain 2D props through the normal pipeline', async () => {
    const { seq, tl } = await bind({
      initial: { x: 10 },
      keyframes: [{ at: 0, to: { alpha: 0.5 }, duration: 1 }],
    });
    const sprite = seq.target as Sprite;
    expect(sprite.x).toBe(10);
    tl.time(1);
    expect(sprite.alpha).toBeCloseTo(0.5);
    tl.kill();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/three/ThreeSequence.keyframes.test.ts`
Expected: FAIL — `three.*` keys land on the sprite as garbage props (cube.rotation.y stays 0).

- [ ] **Step 3: Implement the router**

Add to `ThreeSequence` (import `type PathRouters` from `../core/Timeline`):

```ts
  private _warnedPaths = new Set<string>();

  protected override pathRouters(): PathRouters {
    return { three: (path) => this._resolveThreePath(path) };
  }

  private _resolveThreePath(path: string): { target: object; prop: string } | null {
    const segs = path.split('.');
    if (segs.length < 2) {
      this._warnPath(path, 'needs at least <object>.<prop>');
      return null;
    }
    let obj: unknown = this._objects[segs[0]!];
    if (obj == null) {
      this._warnPath(path, `unknown object "${segs[0]}" — expose it via setup's { objects }`);
      return null;
    }
    for (let i = 1; i < segs.length - 1; i++) {
      obj = (obj as Record<string, unknown>)[segs[i]!];
      if (obj == null) {
        this._warnPath(path, `"${segs[i]}" is undefined along the path`);
        return null;
      }
    }
    const prop = segs[segs.length - 1]!;
    if (typeof obj !== 'object' || !(prop in (obj as object))) {
      this._warnPath(path, `no property "${prop}"`);
      return null;
    }
    return { target: obj as object, prop };
  }

  private _warnPath(path: string, why: string): void {
    if (this._warnedPaths.has(path)) return;
    this._warnedPaths.add(path);
    console.warn(`pixi-effects: keyframe path three.${path} ${why}; skipped`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/three/ThreeSequence.ts tests/three/ThreeSequence.keyframes.test.ts
git commit -m "feat(three): route three.* keyframe paths to exposed scene objects"
```

---

### Task 7: Public entry `pixi-effects/three` + packaging

**Files:**
- Create: `src/three/index.ts`
- Modify: `package.json` (exports, peerDependencies, peerDependenciesMeta, keywords)
- Modify: `tsup.config.ts`
- Test: `tests/three/register.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's `registerSequenceType`, Tasks 4–6's `ThreeSequence`, `src/three/types.ts`.
- Produces: the published `pixi-effects/three` module — `registerThree()`, `three(spec)`, `ThreeSequence`, and the three type exports. Build artifacts `dist/three.js` / `dist/three.cjs` / `dist/three.d.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/three/register.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule } from './mockThree';
mockThreeModule();

import { registerThree, three } from '../../src/three/index';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import { buildSequenceTree } from '../../src/core/Composition';
import type { CompositionShape } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 5 };

describe('registerThree', () => {
  it('makes buildSequenceTree construct ThreeSequence for type "three"', async () => {
    registerThree();
    const spec = three({ type: 'three', setup: () => {} });
    const out = await buildSequenceTree([spec], shape, shape);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(ThreeSequence);
  });

  it('is idempotent', async () => {
    registerThree();
    registerThree();
    const out = await buildSequenceTree([three({ type: 'three', setup: () => {} })], shape, shape);
    expect(out).toHaveLength(1);
  });

  it('three() is an identity helper preserving the spec object', () => {
    const spec = { type: 'three' as const, setup: () => {}, at: 1 };
    expect(three(spec)).toBe(spec);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/three/register.test.ts`
Expected: FAIL — cannot resolve `../../src/three/index`.

- [ ] **Step 3: Create `src/three/index.ts`**

```ts
/**
 * pixi-effects/three — optional three.js integration.
 *
 * Import this entry only when you use `type: 'three'` sequences; the core
 * `pixi-effects` entry never touches three.js. Call `registerThree()` once
 * before Movie.init builds a composition containing a three sequence.
 */
import { registerSequenceType, type SequenceCtor } from '../core/Composition';
import { ThreeSequence } from './ThreeSequence';
import type { SequenceSpec } from '../types';
import type { ThreeSequenceSpec } from './types';

export { ThreeSequence } from './ThreeSequence';
export type { ThreeContext, ThreeSetupResult, ThreeSequenceSpec } from './types';

/** Register the 'three' sequence type. Idempotent; explicit call so `sideEffects: false` bundlers can't drop it. */
export function registerThree(): void {
  registerSequenceType('three', ThreeSequence as unknown as SequenceCtor);
}

/**
 * Typing helper: accepts a strongly-typed three spec and returns it as a
 * core SequenceSpec, keeping three.js types out of the core union.
 */
export function three(spec: ThreeSequenceSpec): SequenceSpec {
  return spec as unknown as SequenceSpec;
}
```

- [ ] **Step 4: Wire packaging**

`tsup.config.ts` — add the entry and external:

```ts
  entry: {
    index: 'src/index.ts',
    Controller: 'src/Controller.ts',
    three: 'src/three/index.ts',
  },
  ...
  external: ['pixi.js', 'gsap', 'gsap/PixiPlugin', 'mediabunny', 'three'],
```

`package.json` — add to `exports` (after `./controller`):

```json
    "./three": {
      "import": { "types": "./dist/three.d.ts", "default": "./dist/three.js" },
      "require": { "types": "./dist/three.d.cts", "default": "./dist/three.cjs" }
    }
```

Add peer dep + meta:

```json
  "peerDependencies": {
    "gsap": "^3.12.0",
    "pixi.js": "^8.0.0",
    "three": ">=0.150.0"
  },
  "peerDependenciesMeta": {
    "three": { "optional": true }
  },
```

Add `"three"` and `"threejs"` to `keywords`.

- [ ] **Step 5: Run tests and build to verify**

Run: `npm run typecheck && npm test && npm run build && ls dist/three.js dist/three.cjs dist/three.d.ts`
Expected: all tests PASS; build succeeds; the three `dist/three.*` files exist. Also verify the core bundle stayed three-free: `grep -c "three" dist/index.js` should find no `from"three"` / `require("three")` import (`grep '"three"' dist/index.js` → no matches).

- [ ] **Step 6: Commit**

```bash
git add src/three/index.ts package.json tsup.config.ts tests/three/register.test.ts
git commit -m "feat(three): publish pixi-effects/three entry with optional three peer dep"
```

---

### Task 8: Example page + docs

**Files:**
- Create: `examples/10-three.html`
- Modify: `docs/dsl.md` (new "three sequences" section, after the shape section)
- Modify: `docs/api.md` (new `pixi-effects/three` entry section)

**Interfaces:**
- Consumes: everything from Tasks 1–7 via `dist/` builds.
- Produces: runnable demo + user documentation. This task is the end-to-end verification of the texture bridge (not unit-testable without WebGL).

- [ ] **Step 1: Create `examples/10-three.html`**

Follow the structure of `examples/01-hello.html` (same styles, header, canvas, importmap + module script). Importmap adds `three`; module script:

```html
  <script type="importmap">
  {
    "imports": {
      "pixi.js":         "https://esm.sh/pixi.js@8.10.0?bundle-deps",
      "gsap":            "https://esm.sh/gsap@3.12.5",
      "gsap/PixiPlugin": "https://esm.sh/gsap@3.12.5/PixiPlugin",
      "mediabunny":      "https://esm.sh/mediabunny",
      "three":           "https://esm.sh/three@0.178.0"
    }
  }
  </script>
  <script type="module">
    import { Movie } from '../dist/index.js';
    import { Controller } from '../dist/Controller.js';
    import { registerThree, three } from '../dist/three.js';
    import * as THREE from 'three';

    registerThree();

    const movie = new Movie();
    new Controller(movie, { canvas: document.getElementById('stage') });

    await movie.init({
      canvas: document.getElementById('stage'),
      width: 1280, height: 720, duration: 6, frameRate: 30,
      background: '#0a0a0f',
      composition: {
        sequences: [
          {
            type: 'shape', shape: 'rect', name: 'bg',
            width: 'GW', height: 'GH',
            initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101830' },
          },
          three({
            type: 'three', name: 'knot',
            width: 'GW * 0.6', height: 'GH * 0.6',
            initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
            setup: (ctx) => {
              const knot = new THREE.Mesh(
                new THREE.TorusKnotGeometry(1, 0.35, 128, 32),
                new THREE.MeshStandardMaterial({ color: 0x7fb4ff, metalness: 0.6, roughness: 0.25 }),
              );
              ctx.scene.add(knot);
              ctx.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
              const key = new THREE.DirectionalLight(0xffffff, 2.2);
              key.position.set(3, 4, 5);
              ctx.scene.add(key);
              ctx.camera.position.z = 4;
              return { objects: { knot } };
            },
            keyframes: [
              // Declarative path: keyframes drive exposed objects.
              { at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 },
              { at: 0, to: { 'three.knot.rotation.x': Math.PI * 0.5 }, duration: 6 },
              // 2D props still work — it's a normal sprite.
              { at: 0, from: { alpha: 0 }, duration: 0.6 },
              { at: -0.6, to: { alpha: 0 }, duration: 0.6 },
            ],
          }),
          {
            type: 'text', text: 'three.js layer',
            style: { fontSize: 'GH * 0.05', fill: '#e8ecf8' },
            initial: { x: 'GW/2', y: 'GH * 0.88', anchorX: 0.5, anchorY: 0.5 },
            keyframes: [{ at: 0.4, from: { alpha: 0 }, duration: 0.6 }],
          },
        ],
      },
    });

    document.getElementById('export').onclick = async () => {
      const blob = await movie.render({ format: 'mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '10-three.mp4';
      a.click();
    };
  </script>
```

Add an `<button id="export">Export mp4</button>` under the canvas, and header prose (matching the other examples' tone) explaining: `registerThree()`, `setup`/`objects`, `three.*` keyframes, the determinism rule for `update(t)`, and that the layer is a normal sprite.

- [ ] **Step 2: Manual verification (human checkpoint)**

```bash
npm run build && npx serve .
```

Open `http://localhost:3000/examples/10-three.html` and verify:
1. The torus knot renders with transparency over the background and rotates smoothly.
2. Scrubbing the controller back and forth replays identically (determinism through seek).
3. Export produces an mp4 in which the 3D layer is visible and matches playback.

This is the only coverage for the canvas→texture upload path — do not skip it. Report results to the user.

- [ ] **Step 3: Document in `docs/dsl.md` and `docs/api.md`**

`docs/dsl.md` — add a `## three` section after shapes covering: the spec fields table (`width`, `height`, `resolution`, `setup`, `update`, `dispose`), the `three.<name>.<path>` keyframe form with an example, and a "Rules" list: (1) call `registerThree()` before `Movie.init`; (2) `update(t)` must derive state purely from `t` — no wall clock / unseeded randomness, or export will not match playback; (3) each three layer costs one WebGL context (browser limit ≈ 8–16); (4) the spec is not JSON-serializable (functions), same as `custom` filters.

`docs/api.md` — add a `pixi-effects/three` section listing `registerThree()`, `three(spec)`, `ThreeSequence`, and the exported types, with the install note: `npm i three` (optional peer dependency; core users are unaffected).

Match each doc's existing heading style and tone; keep the section proportionate to the shape/filters sections.

- [ ] **Step 4: Full verification and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS.

```bash
git add examples/10-three.html docs/dsl.md docs/api.md
git commit -m "docs(three): add three.js layer example and DSL/API documentation"
```

---

## Plan Self-Review Notes

- **Spec coverage:** registry → Task 1; router generalization → Task 3; ThreeSequence build/sync/routing → Tasks 4–6; packaging/entry → Task 7; error handling → Tasks 4 (setup failure), 5 (update containment), 6 (path warnings), 1 (unknown type); example + docs → Task 8. The spec's "Base.ts router hook" lands in Task 3; the spec's `Movie._awaitVideoFrames` contract is hardened by Task 2 (an addition beyond the spec, justified: nested-comp local time would otherwise be wrong for three layers).
- **Deviation from spec (intentional):** the spec suggested folding the existing `filters.` handling into the router mechanism; the plan keeps `filters.` on its untouched legacy path and adds routers alongside. Same observable behavior, strictly lower regression risk, existing `partitionProps` tests stay valid.
- **Deviation from spec (intentional):** registry is stored via `Symbol.for` on `globalThis` rather than module state, because tsup's `splitting: false` duplicates core modules into the three bundle — a module-local registry would fork and `registerThree()` would be invisible to `Movie`.
- **Type consistency check:** `PathRouters`/`splitRouted` signatures match between Tasks 3 and 6; `absoluteStart` name matches between Tasks 2 and 5's contract note; `ThreeContext`/`ThreeSequenceSpec` definitions in Task 4 are the ones consumed in Tasks 5–7.
