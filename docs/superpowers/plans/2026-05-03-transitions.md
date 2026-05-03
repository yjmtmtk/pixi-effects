# Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a declarative `transitions: TransitionSpec[]` field to compositions that supports `crossfade` (Tier 1: keyframe macro), `wipe` / `iris` (Tier 2: shared GLSL+WGSL mask filter), and `slide` (Tier 1: position keyframe macro).

**Architecture:** Pure-function expander `expandTransitions(spec)` runs once at the top of `Movie.init()`, rewriting the user's spec into existing primitives (extra keyframes on `from`/`to`, plus an internal `TransitionMaskFilter` for wipe/iris). The engine is otherwise untouched. Tier 2's filter follows the `ChromaKeyFilter` pattern (single file, GLSL fragment + combined-source WGSL, registered in the filter registry).

**Tech Stack:** TypeScript, vitest + happy-dom, no new runtime deps. Spec: [`docs/superpowers/specs/2026-05-03-transitions-design.md`](../specs/2026-05-03-transitions-design.md).

---

## File Structure

- `src/types.ts` — extend `CompositionSpec` / `CompositionSequenceSpec` with `transitions?`. Add `TransitionSpec` discriminated union (4 kinds).
- `src/index.ts` — re-export new types.
- `src/core/Transitions.ts` — `expandTransitions(spec)` pure function: validate + macro-expand. ~250 lines.
- `src/filters/TransitionMask.ts` — wipe + iris GLSL/WGSL filter. ~180 lines.
- `src/filters/index.ts` — register `_pe-transition-mask` in the registry. +5 lines.
- `src/core/Movie.ts` — call `expandTransitions(options.composition)` at the top of `init()`. +3 lines.
- `tests/core/Transitions.test.ts` — validation + expansion unit tests. ~250 lines, ~25 cases.
- `tests/filters/TransitionMask.test.ts` — filter construction smoke. ~40 lines, 3 cases.
- `examples/transitions.html` — runnable demo of all 4 kinds chained.
- `docs/dsl.md` — new "Transitions" section.

---

## Conventions

- Run `npm test && npm run typecheck` after each task before committing.
- Commit after each task with conventional commits.
- All paths are absolute from the repo root.
- The branch is `feat/transitions` (already created and the spec is committed there as `c7c8cba`).

---

## Task 1: Type definitions

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/types.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/index.ts`

- [ ] **Step 1: Add the TransitionSpec union to `src/types.ts`**

Append the following block to `src/types.ts`, just **after** the existing `FilterSpec` union (around line 86, right before the `// ─── Sequence specs ───` divider):

```ts
// ─── Transition specs ────────────────────────────────────────────────────

export interface TransitionCommon {
  /** Sibling sequence's `name` — the outgoing scene. */
  from: string;
  /** Sibling sequence's `name` — the incoming scene. Must be declared after `from` in the parent's `sequences[]`. */
  to: string;
  /** Start time (parent-relative seconds). Same `at` semantics as Keyframe. */
  at: number;
  /** Length of the transition in seconds. Must be > 0. */
  duration: number;
  /** GSAP easing name. Default `'none'` (linear). */
  ease?: string;
}

export interface CrossfadeTransition extends TransitionCommon {
  kind: 'crossfade';
}

export interface WipeTransition extends TransitionCommon {
  kind: 'wipe';
  direction: 'left' | 'right' | 'up' | 'down';
  /** 0..1 edge softness. Default 0.02. */
  smoothing?: number;
}

export interface IrisTransition extends TransitionCommon {
  kind: 'iris';
  /** `'in'` (default) = B opens up from a point. `'out'` = A closes down to a point. */
  mode?: 'in' | 'out';
  smoothing?: number;
}

export interface SlideTransition extends TransitionCommon {
  kind: 'slide';
  /** Direction of motion: `'left'` = both sequences slide leftward (B enters from the right). */
  direction: 'left' | 'right' | 'up' | 'down';
}

export type TransitionSpec =
  | CrossfadeTransition
  | WipeTransition
  | IrisTransition
  | SlideTransition;
```

- [ ] **Step 2: Add `transitions?` to the two composition shapes**

In `src/types.ts`, locate `CompositionSequenceSpec` (around line 105). Update it to:

```ts
export interface CompositionSequenceSpec extends SequenceCommon {
  type: 'composition';
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];
}
```

And the root `CompositionSpec` (around line 122):

```ts
export interface CompositionSpec extends SequenceCommon {
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];
}
```

- [ ] **Step 3: Re-export the new types from `src/index.ts`**

In the existing types-only export block of `src/index.ts`, add the new names alongside the existing ones:

```ts
export type {
  Expr,
  PropValue,
  Props,
  Keyframe,
  AssetSpec,
  ChromaKeyFilterSpec,
  CustomFilterSpec,
  FilterSpec,
  TransitionCommon,
  CrossfadeTransition,
  WipeTransition,
  IrisTransition,
  SlideTransition,
  TransitionSpec,
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

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS, 136/136 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/index.ts
git commit -m "feat(types): add TransitionSpec union for the transitions DSL"
```

---

## Task 2: Validator (pure, no expansion yet)

**Files:**
- Create: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Transitions.ts`
- Create: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/core/Transitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/Transitions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { expandTransitions } from '../../src/core/Transitions';
import type { CompositionSpec } from '../../src/types';

function spec(overrides: Partial<CompositionSpec> = {}): CompositionSpec {
  return {
    width: 100, height: 100, duration: 10,
    sequences: [
      { type: 'text', name: 'A', text: 'a', at: 0, duration: 5 },
      { type: 'text', name: 'B', text: 'b', at: 4, duration: 5 },
    ],
    ...overrides,
  };
}

describe('expandTransitions — validation', () => {
  it('passes through a composition with no transitions field', () => {
    const s = spec({ transitions: undefined });
    expect(expandTransitions(s)).toEqual(s);
  });

  it('passes through an empty transitions array and strips the field', () => {
    const out = expandTransitions(spec({ transitions: [] }));
    expect(out.transitions).toBeUndefined();
  });

  it('throws when `from` references an unknown sibling', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'X', to: 'B', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*from.*"X".*not found/i);
  });

  it('throws when `to` references an unknown sibling', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'Y', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*to.*"Y".*not found/i);
  });

  it('throws when `to` is declared before `from`', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'B', to: 'A', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*"A".*declared after.*"B"/i);
  });

  it('throws when from === to', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'A', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*cannot transition.*itself/i);
  });

  it('throws when duration is zero or negative', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 0 }],
    }))).toThrow(/duration must be > 0/);
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: -1 }],
    }))).toThrow(/duration must be > 0/);
  });

  it('throws when window extends past `from`\'s lifespan', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4.5, duration: 1 }],
    }))).toThrow(/transitions\[0\].*"A".*ends at 5/i);
  });

  it('throws when window starts before `to`\'s lifespan', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 3, duration: 1 }],
    }))).toThrow(/transitions\[0\].*"B".*starts at 4/i);
  });

  it('throws when one sequence is the `from` of two transitions', () => {
    const s = spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 10 },
        { type: 'text', name: 'B', text: 'b', at: 2, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 5, duration: 5 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'B', at: 2, duration: 1 },
        { kind: 'crossfade', from: 'A', to: 'C', at: 5, duration: 1 },
      ],
    });
    expect(() => expandTransitions(s)).toThrow(/"A".*used as `from`/i);
  });

  it('allows the same sequence to be `to` of one and `from` of another (chained A→B→C)', () => {
    const s = spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 4 },
        { type: 'text', name: 'B', text: 'b', at: 3, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 6, duration: 4 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'B', at: 3, duration: 1 },
        { kind: 'crossfade', from: 'B', to: 'C', at: 6, duration: 1 },
      ],
    });
    expect(() => expandTransitions(s)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: FAIL — no `expandTransitions` exported.

- [ ] **Step 3: Create `src/core/Transitions.ts` with the validator skeleton**

```ts
import type { CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec } from '../types';
import { resolveAt } from './Timeline';

/**
 * Pure function: validate the composition's `transitions[]` and rewrite the
 * spec by macro-expanding each transition into existing primitives (extra
 * keyframes / filters on the participating sequences). Returns a new spec
 * tree; does NOT mutate the input.
 *
 * Recurses into nested compositions.
 */
export function expandTransitions<T extends CompositionSpec | CompositionSequenceSpec>(spec: T): T {
  const out = { ...spec, sequences: spec.sequences ? [...spec.sequences] : undefined };
  // Recurse into nested compositions first.
  if (out.sequences) {
    out.sequences = out.sequences.map((s) => {
      if (s.type === 'composition') return expandTransitions(s);
      return s;
    });
  }
  if (!out.transitions || out.transitions.length === 0) {
    delete (out as { transitions?: unknown }).transitions;
    return out;
  }

  const transitions = out.transitions;
  const sequences = out.sequences ?? [];
  const parentDuration = out.duration ?? Infinity;

  // Build a name → { index, sequence } map for O(1) lookup, and detect duplicate names.
  const byName = new Map<string, { index: number; seq: SequenceSpec }>();
  for (let i = 0; i < sequences.length; i++) {
    const s = sequences[i]!;
    if (!s.name) continue;
    if (byName.has(s.name)) {
      throw new Error(`pixi-effects: composition has two sequences named "${s.name}" (transitions need unique names)`);
    }
    byName.set(s.name, { index: i, seq: s });
  }

  // Track usage so we can detect a sequence being the `from` of two transitions.
  const fromCount = new Map<string, number>();

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i]!;
    const tag = `transitions[${i}] (${t.kind})`;

    if (t.from === t.to) {
      throw new Error(`pixi-effects: ${tag} cannot transition a sequence to itself ("${t.from}")`);
    }
    if (!(t.duration > 0)) {
      throw new Error(`pixi-effects: ${tag} duration must be > 0 (got ${t.duration})`);
    }

    const fromEntry = byName.get(t.from);
    if (!fromEntry) {
      throw new Error(`pixi-effects: ${tag} \`from\` "${t.from}" is not found among sibling sequences`);
    }
    const toEntry = byName.get(t.to);
    if (!toEntry) {
      throw new Error(`pixi-effects: ${tag} \`to\` "${t.to}" is not found among sibling sequences`);
    }

    if (toEntry.index <= fromEntry.index) {
      throw new Error(`pixi-effects: ${tag} \`to\` "${t.to}" must be declared after \`from\` "${t.from}" in sibling order`);
    }

    fromCount.set(t.from, (fromCount.get(t.from) ?? 0) + 1);
    if ((fromCount.get(t.from) ?? 0) > 1) {
      throw new Error(`pixi-effects: ${tag} sequence "${t.from}" is used as \`from\` in more than one transition`);
    }

    // Time-coverage validation. Negative `at` on a sequence is parent-relative
    // ("from the end"); resolveAt() implements those semantics.
    const tStart = resolveAt(t.at, parentDuration);
    const tEnd = tStart + t.duration;
    const fromSeq = fromEntry.seq;
    const fromStart = resolveAt(fromSeq.at, parentDuration);
    const fromEnd = fromStart + (fromSeq.duration ?? parentDuration);
    if (tStart < fromStart || tEnd > fromEnd) {
      throw new Error(`pixi-effects: ${tag} window [${tStart}, ${tEnd}] is not covered by \`from\` "${t.from}" (lives [${fromStart}, ${fromEnd}], so it ends at ${fromEnd})`);
    }
    const toSeq = toEntry.seq;
    const toStart = resolveAt(toSeq.at, parentDuration);
    const toEnd = toStart + (toSeq.duration ?? parentDuration);
    if (tStart < toStart || tEnd > toEnd) {
      throw new Error(`pixi-effects: ${tag} window [${tStart}, ${tEnd}] is not covered by \`to\` "${t.to}" (lives [${toStart}, ${toEnd}], so it starts at ${toStart})`);
    }
  }

  // Macro expansion happens in later tasks; for now just strip the field
  // (every transition validated successfully).
  delete (out as { transitions?: unknown }).transitions;
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: PASS — all 11 validation tests pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/Transitions.ts tests/core/Transitions.test.ts
git commit -m "feat(transitions): pure expander skeleton with full validation"
```

---

## Task 3: Crossfade expansion (Tier 1)

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Transitions.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/core/Transitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/Transitions.test.ts`:

```ts
import type { Keyframe } from '../../src/types';

function findSeqKfs(s: CompositionSpec, name: string): Keyframe[] {
  const seq = s.sequences!.find((x) => x.name === name)!;
  return ('keyframes' in seq && seq.keyframes) ? seq.keyframes : [];
}

function findSeqInitial(s: CompositionSpec, name: string): Record<string, unknown> {
  const seq = s.sequences!.find((x) => x.name === name)!;
  return ('initial' in seq && seq.initial) ? (seq.initial as Record<string, unknown>) : {};
}

describe('expandTransitions — crossfade', () => {
  it('appends an alpha=0 fade-out keyframe to `from`', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    const kfs = findSeqKfs(out, 'A');
    expect(kfs).toContainEqual({ at: 4, to: { alpha: 0 }, duration: 1, ease: 'none' });
  });

  it('sets initial.alpha=0 on `to` and appends an alpha=1 fade-in keyframe', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    expect(findSeqInitial(out, 'B').alpha).toBe(0);
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { alpha: 1 }, duration: 1, ease: 'none' });
  });

  it('honors the `ease` field on both keyframes', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }],
    }));
    expect(findSeqKfs(out, 'A').slice(-1)[0]!.ease).toBe('sine.inOut');
    expect(findSeqKfs(out, 'B').slice(-1)[0]!.ease).toBe('sine.inOut');
  });

  it('throws if `to` already has a manual `initial.alpha`', () => {
    const s = spec();
    s.sequences![1] = { ...s.sequences![1]!, initial: { alpha: 0.5 } } as typeof s.sequences[1];
    expect(() => expandTransitions({
      ...s,
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    })).toThrow(/"B".*already has.*initial\.alpha/i);
  });

  it('strips `transitions` from the returned spec', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    expect(out.transitions).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: FAIL — no expansion implemented yet.

- [ ] **Step 3: Implement `expandCrossfade` and dispatch**

In `src/core/Transitions.ts`, **replace** the comment + lone `delete` line at the end of the `for` loop:

```ts
  // Macro expansion happens in later tasks; for now just strip the field
  // (every transition validated successfully).
  delete (out as { transitions?: unknown }).transitions;
  return out;
}
```

with the dispatch + helper:

```ts
    // Validation passed; expand this transition into existing primitives.
    switch (t.kind) {
      case 'crossfade':
        expandCrossfade(out, t, fromEntry.seq, toEntry.seq);
        break;
      // Other kinds are added in later tasks.
    }
  }

  delete (out as { transitions?: unknown }).transitions;
  return out;
}

function ensureKeyframes(seq: SequenceSpec): Keyframe[] {
  // Sequences are loosely typed; treat keyframes as optional.
  const s = seq as { keyframes?: Keyframe[] };
  if (!s.keyframes) s.keyframes = [];
  return s.keyframes;
}

function ensureInitial(seq: SequenceSpec): Record<string, unknown> {
  const s = seq as { initial?: Record<string, unknown> };
  if (!s.initial) s.initial = {};
  return s.initial;
}

function expandCrossfade(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: CrossfadeTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
): void {
  const ease = t.ease ?? 'none';

  // Outgoing sequence fades to alpha 0 over the window.
  const fromKfs = ensureKeyframes(fromSeq);
  fromKfs.push({ at: t.at, to: { alpha: 0 }, duration: t.duration, ease });

  // Incoming sequence starts invisible (initial.alpha = 0). Reject if user
  // already set initial.alpha — that would be a silent override.
  const toInitial = ensureInitial(toSeq);
  if (toInitial.alpha !== undefined && toInitial.alpha !== 0) {
    throw new Error(
      `pixi-effects: crossfade "${t.from}"→"${t.to}" requires "${t.to}" to start invisible, ` +
      `but it already has initial.alpha=${String(toInitial.alpha)}. Remove the manual setting.`,
    );
  }
  toInitial.alpha = 0;

  // Fade in.
  const toKfs = ensureKeyframes(toSeq);
  toKfs.push({ at: t.at, to: { alpha: 1 }, duration: t.duration, ease });
}
```

Add the import for `CrossfadeTransition` and `Keyframe` to the import block at the top:

```ts
import type {
  CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec,
  CrossfadeTransition, Keyframe,
} from '../types';
```

- [ ] **Step 4: Mutate-vs-return: shallow-clone sequences before expansion**

The expander now mutates the sequence objects via `ensureKeyframes` / `ensureInitial`. We need to clone them so the input spec is never modified.

In `expandTransitions`, **replace** the existing recursion block:

```ts
  const out = { ...spec, sequences: spec.sequences ? [...spec.sequences] : undefined };
  // Recurse into nested compositions first.
  if (out.sequences) {
    out.sequences = out.sequences.map((s) => {
      if (s.type === 'composition') return expandTransitions(s);
      return s;
    });
  }
```

with:

```ts
  // Shallow-clone every sequence (and recurse into nested compositions) so we
  // can append keyframes / set initial without touching the user's input spec.
  const out = {
    ...spec,
    sequences: spec.sequences
      ? spec.sequences.map((s) => {
          const cloned: SequenceSpec = {
            ...s,
            // Deep-clone the mutation surface only.
            initial: 'initial' in s && s.initial ? { ...s.initial } : undefined,
            keyframes: 'keyframes' in s && s.keyframes ? s.keyframes.slice() : undefined,
          } as SequenceSpec;
          if (cloned.type === 'composition') return expandTransitions(cloned);
          return cloned;
        })
      : undefined,
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: PASS — all 16 tests pass.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/Transitions.ts tests/core/Transitions.test.ts
git commit -m "feat(transitions): crossfade macro expansion (Tier 1)"
```

---

## Task 4: Wire `expandTransitions` into `Movie.init()`

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Movie.ts`

- [ ] **Step 1: Add the import**

In `src/core/Movie.ts`, add the import alongside the other `./` imports near the top:

```ts
import { expandTransitions } from './Transitions';
```

- [ ] **Step 2: Call it before composition build**

In `Movie.init()`, locate where `options.composition` is consumed (search for `_buildCompositionTree` or `composition?:`). Right after the option-merging block but before the composition is passed to the builder, transform it:

```ts
const composition = options.composition ? expandTransitions(options.composition) : undefined;
// ...then pass `composition` (instead of `options.composition`) wherever build was called.
```

If the composition is referenced by `options.composition` directly later, replace those usages with the local `composition` variable so the expanded version is used.

- [ ] **Step 3: Verify integration**

Run: `npm test && npm run typecheck`
Expected: PASS, all 152 tests pass (136 prior + 16 new).

- [ ] **Step 4: Commit**

```bash
git add src/core/Movie.ts
git commit -m "feat(movie): run expandTransitions in init() so crossfade applies at runtime"
```

---

## Task 5: TransitionMaskFilter (GLSL + WGSL)

**Files:**
- Create: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/filters/TransitionMask.ts`
- Create: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/filters/TransitionMask.test.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/filters/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/filters/TransitionMask.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Filter {
    resources: Record<string, unknown> = {};
    apply() { /* duck-type marker */ }
    constructor(_opts?: unknown) { /* no-op */ }
  }
  class GlProgram {
    constructor(_opts: unknown) { /* no-op */ }
    static from(_opts: unknown): GlProgram { return new GlProgram(_opts); }
  }
  class GpuProgram {
    constructor(_opts: unknown) { /* no-op */ }
    static from(_opts: unknown): GpuProgram { return new GpuProgram(_opts); }
  }
  class UniformGroup {
    uniforms: Record<string, unknown>;
    constructor(uniforms: Record<string, { value: unknown }>) {
      this.uniforms = Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, v.value]));
    }
  }
  return { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '' };
});

import { TransitionMaskFilter } from '../../src/filters/TransitionMask';

describe('TransitionMaskFilter', () => {
  it('constructs with default uniforms', () => {
    const f = new TransitionMaskFilter();
    const u = (f as unknown as { resources: { transitionUniforms: { uniforms: Record<string, unknown> } } }).resources.transitionUniforms.uniforms;
    expect(u.uProgress).toBe(0);
    expect(u.uMode).toBe(0);
    expect(u.uSmoothing).toBe(0.02);
  });

  it('honors mode constants for wipe-up / wipe-down / iris-in / iris-out', () => {
    const cases: Array<[Parameters<typeof TransitionMaskFilter>[0], number]> = [
      [{ mode: 'wipe-left'  }, 0],
      [{ mode: 'wipe-right' }, 1],
      [{ mode: 'wipe-up'    }, 2],
      [{ mode: 'wipe-down'  }, 3],
      [{ mode: 'iris-in'    }, 4],
      [{ mode: 'iris-out'   }, 5],
    ];
    for (const [opts, expected] of cases) {
      const f = new TransitionMaskFilter(opts);
      const u = (f as unknown as { resources: { transitionUniforms: { uniforms: Record<string, unknown> } } }).resources.transitionUniforms.uniforms;
      expect(u.uMode).toBe(expected);
    }
  });

  it('exposes both glProgram and gpuProgram', () => {
    const f = new TransitionMaskFilter();
    expect((f as unknown as { glProgram: unknown }).glProgram).toBeDefined();
    expect((f as unknown as { gpuProgram: unknown }).gpuProgram).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/filters/TransitionMask.test.ts`
Expected: FAIL — no TransitionMaskFilter exists.

- [ ] **Step 3: Create the filter**

Create `src/filters/TransitionMask.ts`:

```ts
import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const MODE_CODES = {
  'wipe-left':  0,
  'wipe-right': 1,
  'wipe-up':    2,
  'wipe-down':  3,
  'iris-in':    4,
  'iris-out':   5,
} as const;

export type TransitionMode = keyof typeof MODE_CODES;

export interface TransitionMaskOptions {
  mode?: TransitionMode;
  smoothing?: number;
  progress?: number;
}

// ── GLSL fragment (WebGL renderer) ───────────────────────────────────────
const GL_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uProgress;
uniform float uSmoothing;
uniform float uMode;

out vec4 finalColor;

float wipeReveal(vec2 uv, float p, float s, float mode) {
  // mode 0..3 = wipe directions; mode 4..5 = iris.
  if (mode < 0.5) {
    // wipe-left: B reveals from the right edge moving left
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.x);
  } else if (mode < 1.5) {
    // wipe-right
    return smoothstep(p - s, p + s, 1.0 - uv.x);
  } else if (mode < 2.5) {
    // wipe-up
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.y);
  } else if (mode < 3.5) {
    // wipe-down
    return smoothstep(p - s, p + s, 1.0 - uv.y);
  } else if (mode < 4.5) {
    // iris-in: circle grows from center
    float d = distance(uv, vec2(0.5)) * 2.0;  // 0..~1.41 across the canvas
    return smoothstep(p + s, p - s, d);
  } else {
    // iris-out: circle shrinks toward center (so during transition A is hidden inside the shrinking ring)
    float d = distance(uv, vec2(0.5)) * 2.0;
    return smoothstep(p - s, p + s, d);
  }
}

void main(void) {
    vec4 raw = texture(uTexture, vTextureCoord);
    float reveal = wipeReveal(vTextureCoord, uProgress, max(uSmoothing, 0.0001), uMode);
    finalColor = raw * reveal;
}
`;

// ── WGSL combined source (WebGPU renderer) ───────────────────────────────
// IMPORTANT: PIXI v8's WGSL attribute extractor is regex-based and only finds
// vertex `@location(N)` annotations when the param list is multi-line and uses
// space before the colon. Don't tidy the whitespace.
const WGSL_SOURCE = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct TransitionUniforms {
  uProgress: f32,
  uMode: f32,
  uSmoothing: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> transitionUniforms : TransitionUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv : vec2<f32>,
};

fn filterVertexPosition(aPosition : vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4<f32>(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition : vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

fn wipeReveal(uv: vec2<f32>, p: f32, s: f32, mode: f32) -> f32 {
  if (mode < 0.5) {
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.x);
  } else if (mode < 1.5) {
    return smoothstep(p - s, p + s, 1.0 - uv.x);
  } else if (mode < 2.5) {
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.y);
  } else if (mode < 3.5) {
    return smoothstep(p - s, p + s, 1.0 - uv.y);
  } else if (mode < 4.5) {
    let d = distance(uv, vec2<f32>(0.5)) * 2.0;
    return smoothstep(p + s, p - s, d);
  } else {
    let d = distance(uv, vec2<f32>(0.5)) * 2.0;
    return smoothstep(p - s, p + s, d);
  }
}

@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);
  let reveal = wipeReveal(uv, transitionUniforms.uProgress, max(transitionUniforms.uSmoothing, 0.0001), transitionUniforms.uMode);
  return raw * reveal;
}
`;

export class TransitionMaskFilter extends Filter {
  constructor(options: TransitionMaskOptions = {}) {
    const mode = options.mode ?? 'wipe-left';
    const smoothing = options.smoothing ?? 0.02;
    const progress = options.progress ?? 0;

    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment: GL_FRAGMENT,
        name: 'transition-mask-filter',
      }),
      gpuProgram: GpuProgram.from({
        vertex: { source: WGSL_SOURCE, entryPoint: 'mainVertex' },
        fragment: { source: WGSL_SOURCE, entryPoint: 'mainFragment' },
      }),
      resources: {
        transitionUniforms: new UniformGroup({
          uProgress:  { value: progress,        type: 'f32' },
          uMode:      { value: MODE_CODES[mode], type: 'f32' },
          uSmoothing: { value: smoothing,        type: 'f32' },
        }),
      },
    });
  }

  get uProgress(): number { return this.resources.transitionUniforms.uniforms.uProgress as number; }
  set uProgress(v: number) { this.resources.transitionUniforms.uniforms.uProgress = v; }
  get uMode(): number { return this.resources.transitionUniforms.uniforms.uMode as number; }
  set uMode(v: number) { this.resources.transitionUniforms.uniforms.uMode = v; }
  get uSmoothing(): number { return this.resources.transitionUniforms.uniforms.uSmoothing as number; }
  set uSmoothing(v: number) { this.resources.transitionUniforms.uniforms.uSmoothing = v; }
}
```

- [ ] **Step 4: Run the filter tests**

Run: `npm test -- tests/filters/TransitionMask.test.ts`
Expected: PASS — 3 cases.

- [ ] **Step 5: Run full suite to confirm nothing else broke**

Run: `npm test`
Expected: 155 / 155 (152 prior + 3 new).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/filters/TransitionMask.ts tests/filters/TransitionMask.test.ts
git commit -m "feat(filters): TransitionMaskFilter — wipe (4 dirs) + iris-in/out, GLSL + WGSL"
```

---

## Task 6: Wipe + Iris expansion (Tier 2)

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Transitions.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/core/Transitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/Transitions.test.ts`:

```ts
import type { CustomFilterSpec } from '../../src/types';

function findCustomFilter(s: CompositionSpec, seqName: string, filterName: string): CustomFilterSpec | undefined {
  const seq = s.sequences!.find((x) => x.name === seqName)!;
  const filters = ('filters' in seq && seq.filters) ? seq.filters : [];
  return filters.find((f) => f.type === 'custom' && f.name === filterName) as CustomFilterSpec | undefined;
}

describe('expandTransitions — wipe', () => {
  it('attaches a TransitionMaskFilter to `to` with deterministic name', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }],
    }));
    const f = findCustomFilter(out, 'B', '_pe-transition-0');
    expect(f).toBeDefined();
    expect(f!.type).toBe('custom');
    // The filter instance should be a TransitionMaskFilter with mode set to wipe-left (uMode=0).
    const inst = f!.filter as { uMode: number };
    expect(inst.uMode).toBe(0);
  });

  it('appends a uProgress 0→1 keyframe path on `to`', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'right', ease: 'sine.in' }],
    }));
    const kfs = findSeqKfs(out, 'B');
    expect(kfs).toContainEqual({
      at: 4,
      to: { 'filters._pe-transition-0.uProgress': 1 },
      duration: 1,
      ease: 'sine.in',
    });
  });

  it('encodes direction in uMode (left=0, right=1, up=2, down=3)', () => {
    for (const [dir, code] of [['left', 0], ['right', 1], ['up', 2], ['down', 3]] as const) {
      const out = expandTransitions(spec({
        transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: dir }],
      }));
      const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uMode: number };
      expect(inst.uMode).toBe(code);
    }
  });

  it('honors smoothing override', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left', smoothing: 0.1 }],
    }));
    const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uSmoothing: number };
    expect(inst.uSmoothing).toBeCloseTo(0.1, 5);
  });

  it('throws if `to` already has a filter named with the reserved transition prefix', () => {
    const s = spec();
    s.sequences![1] = {
      ...s.sequences![1]!,
      filters: [{ type: 'custom', name: '_pe-transition-0', filter: { apply() {} } as unknown }],
    } as typeof s.sequences[1];
    expect(() => expandTransitions({
      ...s,
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }],
    })).toThrow(/reserved.*name.*_pe-transition-/i);
  });
});

describe('expandTransitions — iris', () => {
  it('uses uMode=4 by default (iris-in)', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uMode: number };
    expect(inst.uMode).toBe(4);
  });

  it('uses uMode=5 when mode=out', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1, mode: 'out' }],
    }));
    const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uMode: number };
    expect(inst.uMode).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: FAIL — wipe / iris not implemented.

- [ ] **Step 3: Implement `expandWipe` and `expandIris`**

In `src/core/Transitions.ts`:

(a) **Add the import** for `TransitionMaskFilter` and the wipe/iris transition types:

```ts
import type {
  CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec,
  CrossfadeTransition, WipeTransition, IrisTransition,
  Keyframe, FilterSpec,
} from '../types';
import { resolveAt } from './Timeline';
import { TransitionMaskFilter, type TransitionMode } from '../filters/TransitionMask';
```

(b) **Add a helper** to ensure a filters array exists:

```ts
function ensureFilters(seq: SequenceSpec): FilterSpec[] {
  const s = seq as { filters?: FilterSpec[] };
  if (!s.filters) s.filters = [];
  return s.filters;
}
```

(c) **Add the dispatch entries** in the switch (keep crossfade, add the others):

```ts
    switch (t.kind) {
      case 'crossfade':
        expandCrossfade(out, t, fromEntry.seq, toEntry.seq);
        break;
      case 'wipe':
        expandMask(out, t, toEntry.seq, i, wipeMode(t.direction), t.smoothing);
        break;
      case 'iris':
        expandMask(out, t, toEntry.seq, i, t.mode === 'out' ? 'iris-out' : 'iris-in', t.smoothing);
        break;
    }
```

(d) **Add the helpers** at the bottom of the file:

```ts
function wipeMode(direction: WipeTransition['direction']): TransitionMode {
  switch (direction) {
    case 'left':  return 'wipe-left';
    case 'right': return 'wipe-right';
    case 'up':    return 'wipe-up';
    case 'down':  return 'wipe-down';
  }
}

function transitionFilterName(index: number): string {
  return `_pe-transition-${index}`;
}

function expandMask(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: WipeTransition | IrisTransition,
  toSeq: SequenceSpec,
  transitionIndex: number,
  mode: TransitionMode,
  smoothing: number | undefined,
): void {
  const ease = t.ease ?? 'none';
  const filterName = transitionFilterName(transitionIndex);

  const filters = ensureFilters(toSeq);
  // Reject collision with user-managed filter names that share the reserved prefix.
  for (const f of filters) {
    if (f.name === filterName || (typeof f.name === 'string' && f.name.startsWith('_pe-transition-'))) {
      throw new Error(
        `pixi-effects: sequence "${toSeq.name}" already has a filter named "${f.name}" — ` +
        `the reserved name prefix "_pe-transition-" is for internally generated transition filters`,
      );
    }
  }

  const filterInstance = new TransitionMaskFilter({
    mode,
    smoothing: smoothing ?? 0.02,
    progress: 0,
  });
  filters.push({ type: 'custom', name: filterName, filter: filterInstance });

  // Animate the filter's progress 0 → 1 over the transition window.
  const kfs = ensureKeyframes(toSeq);
  kfs.push({
    at: t.at,
    to: { [`filters.${filterName}.uProgress`]: 1 },
    duration: t.duration,
    ease,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: PASS — 23 tests total.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/Transitions.ts tests/core/Transitions.test.ts
git commit -m "feat(transitions): wipe (4 dirs) + iris (in/out) expansion (Tier 2)"
```

---

## Task 7: Slide expansion

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/src/core/Transitions.ts`
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/tests/core/Transitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/Transitions.test.ts`:

```ts
describe('expandTransitions — slide', () => {
  it('left: A.x → -W and B.x: W → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { x: '-W' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').x).toBe('W');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { x: 0 }, duration: 1, ease: 'none' });
  });

  it('right: A.x → W and B.x: -W → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'right' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { x: 'W' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').x).toBe('-W');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { x: 0 }, duration: 1, ease: 'none' });
  });

  it('up: A.y → -H and B.y: H → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'up' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { y: '-H' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').y).toBe('H');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { y: 0 }, duration: 1, ease: 'none' });
  });

  it('down: A.y → H and B.y: -H → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'down' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { y: 'H' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').y).toBe('-H');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { y: 0 }, duration: 1, ease: 'none' });
  });

  it('honors ease', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left', ease: 'power2.inOut' }],
    }));
    const aLast = findSeqKfs(out, 'A').slice(-1)[0]!;
    expect(aLast.ease).toBe('power2.inOut');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: FAIL — slide not implemented.

- [ ] **Step 3: Implement `expandSlide`**

In `src/core/Transitions.ts`:

(a) **Add the import** for `SlideTransition`:

```ts
import type {
  CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec,
  CrossfadeTransition, WipeTransition, IrisTransition, SlideTransition,
  Keyframe, FilterSpec,
} from '../types';
```

(b) **Add the dispatch entry** in the switch:

```ts
      case 'slide':
        expandSlide(out, t, fromEntry.seq, toEntry.seq);
        break;
```

(c) **Add the helper** at the bottom of the file:

```ts
function expandSlide(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: SlideTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
): void {
  const ease = t.ease ?? 'none';
  const isHorizontal = t.direction === 'left' || t.direction === 'right';
  const axis = isHorizontal ? 'x' : 'y';
  const dim = isHorizontal ? 'W' : 'H';

  // Outgoing direction for A: matches the user's direction. B starts on the opposite side and slides to 0.
  const fromTarget = (t.direction === 'left' || t.direction === 'up') ? `-${dim}` : dim;
  const toStart    = (t.direction === 'left' || t.direction === 'up') ? dim : `-${dim}`;

  const fromKfs = ensureKeyframes(fromSeq);
  fromKfs.push({ at: t.at, to: { [axis]: fromTarget }, duration: t.duration, ease });

  const toInitial = ensureInitial(toSeq);
  toInitial[axis] = toStart;

  const toKfs = ensureKeyframes(toSeq);
  toKfs.push({ at: t.at, to: { [axis]: 0 }, duration: t.duration, ease });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/core/Transitions.test.ts`
Expected: PASS — 28 tests total.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/Transitions.ts tests/core/Transitions.test.ts
git commit -m "feat(transitions): slide expansion (4 directions, Tier 1)"
```

---

## Task 8: Manual verification with a runnable example

**Files:**
- Create: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/examples/transitions.html`

- [ ] **Step 1: Build the library so the example can resolve `dist/`**

Run: `npm run build`
Expected: PASS, `dist/index.js` rebuilt.

- [ ] **Step 2: Create the example**

Create `examples/transitions.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>pixi-effects — transitions showcase</title>
  <style>
    body { background: #0a0a0f; margin: 0; font-family: sans-serif; color: #ccc; padding: 16px; }
    h1 { font-weight: 500; margin: 0 0 4px 0; }
    p { font-size: 13px; color: #888; margin: 0 0 16px 0; }
    p code { background: #1a1a22; padding: 1px 6px; border-radius: 3px; color: #b5d3ff; }
    canvas { width: min(960px, 100%); border-radius: 8px; }
  </style>
</head>
<body>
  <h1>transitions showcase</h1>
  <p>Chains <code>crossfade → wipe → iris → slide</code> across four labeled scenes.</p>
  <canvas id="stage" width="1280" height="720"></canvas>
  <script type="importmap">
  {
    "imports": {
      "pixi.js":         "https://esm.sh/pixi.js@8.10.0?bundle-deps",
      "gsap":            "https://esm.sh/gsap@3.12.5",
      "gsap/PixiPlugin": "https://esm.sh/gsap@3.12.5/PixiPlugin",
      "mediabunny":      "https://esm.sh/mediabunny"
    }
  }
  </script>
  <script type="module">
    import { Movie } from '../dist/index.js';
    import { Controller } from '../dist/Controller.js';

    const movie = new Movie();
    window.__movie = movie;
    new Controller(movie, { canvas: document.getElementById('stage') });

    // Each scene is a colored full-canvas rectangle (drawn as a Text whose body is a single block character at huge size for an easy fill).
    // For simplicity, use a Text with the scene name as the visual.
    const scene = (text, fill, name, at, duration) => ({
      type: 'text', name, text, at, duration,
      initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
      style: { fontSize: 'GW * 0.12', fill, fontWeight: 'bold' },
    });

    await movie.init({
      canvas: document.getElementById('stage'),
      width: 1280, height: 720, duration: 16, frameRate: 30,
      background: '#0a0a0f',
      composition: {
        sequences: [
          scene('SCENE A',       '#ff7755', 'A', 0, 5),
          scene('SCENE B (wipe)','#55aaff', 'B', 4, 5),
          scene('SCENE C (iris)','#55ddaa', 'C', 8, 5),
          scene('SCENE D (slide)','#ff77cc','D', 12, 4),
        ],
        transitions: [
          { kind: 'crossfade', from: 'A', to: 'B', at: 4,  duration: 1, ease: 'sine.inOut' },
          { kind: 'wipe',      from: 'B', to: 'C', at: 8,  duration: 1, direction: 'left', smoothing: 0.04 },
          { kind: 'iris',      from: 'C', to: 'D', at: 12, duration: 1, mode: 'in', smoothing: 0.03 },
        ],
      },
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Serve and visually verify in a browser**

Start a static server from the repo root (e.g. `npx serve . -l 5174`) and open `http://localhost:5174/examples/transitions.html`.

Verify by scrubbing or playing through:
- ~0..4s: SCENE A (orange) is alone.
- ~4..5s: A fades to B (blue) via crossfade.
- ~5..8s: SCENE B (blue) is alone.
- ~8..9s: B is wiped from the right by C (green) — the wipe edge moves leftward.
- ~9..12s: SCENE C (green) is alone.
- ~12..13s: C is replaced by D (pink) via iris-in — D appears as a circle that grows from the center.
- ~13..16s: SCENE D (pink) is alone.

If anything renders wrong, fix and rerun before committing.

- [ ] **Step 4: Test fully**

Run: `npm test && npm run typecheck && npm run build`
Expected: 158/158 pass, typecheck clean, build clean.

- [ ] **Step 5: Commit**

```bash
git add examples/transitions.html
git commit -m "docs(examples): transitions.html — chained crossfade/wipe/iris demo"
```

---

## Task 9: DSL docs

**Files:**
- Modify: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects/docs/dsl.md`

- [ ] **Step 1: Add the Transitions section**

In `docs/dsl.md`, locate the existing "Filters" section. **Insert** a new "Transitions" section immediately **before** the "Filters" section (transitions logically slot between sequences and filters in the DSL flow).

```md
## Transitions

A composition can declare scene-to-scene `transitions` that compress paired keyframes into a single line and add visual effects (mask wipes, iris reveals) that aren't expressible at the keyframe level.

```ts
{
  sequences: [
    { type: 'video', name: 'A', asset: 'a', at: 0, duration: 5 },
    { type: 'video', name: 'B', asset: 'b', at: 4, duration: 5 },
  ],
  transitions: [
    { kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' },
  ],
}
```

Common fields (`TransitionCommon`):

| Field      | Type    | Notes                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------- |
| `from`     | string  | sibling sequence's `name`. Must exist in the same composition.                         |
| `to`       | string  | sibling sequence's `name`. Must be declared **after** `from` in `sequences[]`.         |
| `at`       | number  | start of the transition (parent-relative seconds). Same `at` semantics as `Keyframe`.  |
| `duration` | number  | seconds, must be > 0.                                                                  |
| `ease`     | string? | GSAP easing name. Default `'none'` (linear).                                           |

Validation runs at composition build time. Errors throw with the offending `transitions[<index>]` quoted in the message: missing names, `to` before `from`, transition window outside either sequence's lifespan, duplicate use of one sequence as `from`, `from === to`, `duration <= 0`.

### `crossfade`

Alpha cross-dissolve. `from` fades to `alpha: 0`, `to` starts at `alpha: 0` and fades to `1`, both over `[at, at + duration]`.

```ts
{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }
```

If `to` already has an explicit `initial.alpha` (other than 0), the expander throws — remove the manual setting.

### `wipe`

A directional reveal. `to` is masked by a soft edge that travels across the screen.

```ts
{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1,
  direction: 'left' | 'right' | 'up' | 'down',
  smoothing?: number   // 0..1 edge softness (default 0.02)
}
```

`direction` is the direction of motion of the wipe edge.

### `iris`

A circular reveal centered on the canvas.

```ts
{ kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1,
  mode?: 'in' | 'out',     // default 'in' — B opens up from a point
  smoothing?: number       // 0..1 edge softness (default 0.02)
}
```

`mode: 'in'` (default): B emerges from the center and grows outward.
`mode: 'out'`: A disappears from the outside in, exposing B.

### `slide`

Both sequences slide together; new scene comes in from the opposite side.

```ts
{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1,
  direction: 'left' | 'right' | 'up' | 'down'
}
```

`direction` is the direction of motion. `'left'` means A slides off to the left and B enters from the right.

If you've manually keyframed `x` / `y` on `A` or `B`, the slide expansion appends new keyframes alongside — your existing motion is not overwritten. Behavior with conflicting motion is the user's responsibility.
```

- [ ] **Step 2: Verify the doc renders correctly**

(No automated check — visually skim the rendered Markdown if possible.)

- [ ] **Step 3: Commit**

```bash
git add docs/dsl.md
git commit -m "docs(dsl): document transitions (crossfade / wipe / iris / slide)"
```

---

## Self-Review

**1. Spec coverage**

| Spec section / requirement                                  | Task |
| ----------------------------------------------------------- | ---- |
| `transitions?` field on Composition specs                   | 1    |
| `TransitionSpec` discriminated union (4 kinds)              | 1    |
| `expandTransitions(spec)` pure function                     | 2    |
| Validation: name lookups + `to` after `from` + duration > 0 | 2    |
| Validation: time coverage + duplicate-from + from===to      | 2    |
| Crossfade (Tier 1) macro                                    | 3    |
| Hook into `Movie.init()`                                    | 4    |
| `TransitionMaskFilter` GLSL + WGSL (wipe + iris)            | 5    |
| Wipe / iris expansion (Tier 2)                              | 6    |
| Filter-name collision rejection                             | 6    |
| Slide expansion (Tier 1)                                    | 7    |
| Runnable example chaining all 4 kinds                       | 8    |
| DSL docs                                                    | 9    |

All spec requirements have a task.

**2. Placeholder scan**: every step contains either complete code, an exact command, or a concrete acceptance criterion. No "TBD" / "fill in details".

**3. Type consistency**:
- `expandTransitions` signature is the same in tasks 2, 3, 4.
- `TransitionMaskFilter` constructor accepts `{ mode?, smoothing?, progress? }` consistently in tasks 5 and 6.
- `TransitionMode` string union (`'wipe-left' | ... | 'iris-out'`) used consistently between Task 5's filter and Task 6's `wipeMode` mapping.
- Filter naming `_pe-transition-<index>` consistent in tasks 6 and the spec's risks section.
- `ensureKeyframes` / `ensureInitial` / `ensureFilters` helpers introduced in tasks 3 and 6 — both used by later tasks.
- Keyframe path format `filters._pe-transition-N.uProgress` matches existing path-resolver in `src/core/Timeline.ts:partitionProps` (regex `^filters\.([^.]+)\.(.+)$`).
