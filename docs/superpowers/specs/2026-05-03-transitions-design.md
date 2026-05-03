# Transitions DSL — Design

## Goal

Add declarative scene-to-scene transitions (crossfade, wipe, iris, slide) as a first-class concept in the composition spec. Currently users have to hand-author paired keyframes on two sequences to fake a crossfade; transitions should compress that into a single line and add visual effects (mask wipes) that aren't otherwise expressible at all.

## Non-goals

- True multi-input mixing transitions (morph, displacement, advanced glitch). These need an off-screen render-texture pipeline (Tier 3 in the earlier discussion) — out of scope here.
- Transitions that cross composition boundaries. Limited to siblings within the same composition.
- Transitions whose `from`/`to` are auto-generated (e.g., "fade to black"). For now the user names two existing sequences explicitly.
- Animatable transition parameters (e.g., changing wipe direction mid-transition). The transition itself is a fixed effect over a fixed time window.

## DSL

A new optional field on `CompositionSpec` and `CompositionSequenceSpec`:

```ts
interface CompositionSpec extends SequenceCommon {
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];   // new
}
```

`TransitionSpec` is a discriminated union:

```ts
interface TransitionCommon {
  from: string;          // sequence name (sibling within this composition)
  to: string;            // sequence name (sibling within this composition)
  at: number;            // start of the transition, seconds, parent-relative
  duration: number;      // length of the transition, seconds (must be > 0)
  ease?: string;         // GSAP easing name (default 'none')
}

interface CrossfadeTransition extends TransitionCommon { kind: 'crossfade' }

interface WipeTransition extends TransitionCommon {
  kind: 'wipe';
  direction: 'left' | 'right' | 'up' | 'down';   // direction the wipe travels
  smoothing?: number;    // 0..1 edge softness (default 0.02)
}

interface IrisTransition extends TransitionCommon {
  kind: 'iris';
  mode?: 'in' | 'out';   // default 'in' (B opens up from a point)
  smoothing?: number;    // 0..1 edge softness (default 0.02)
}

interface SlideTransition extends TransitionCommon {
  kind: 'slide';
  direction: 'left' | 'right' | 'up' | 'down';   // direction of motion (both A and B travel this way; e.g. 'left' = A slides off to the left, B comes in from the right)
}

type TransitionSpec =
  | CrossfadeTransition
  | WipeTransition
  | IrisTransition
  | SlideTransition;
```

Example:

```ts
sequences: [
  { type: 'video', asset: 'a', name: 'A', at: 0, duration: 5 },
  { type: 'video', asset: 'b', name: 'B', at: 4, duration: 5 },
],
transitions: [
  { kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' },
  // or:
  // { kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' },
  // { kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1, mode: 'in' },
  // { kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' },
],
```

## Validation (strict)

At composition build time, before any sequence is materialized, validate every entry of `transitions[]`:

1. **Names exist**: `from` and `to` must each match a sibling sequence's `name`. Throw with both names quoted on miss.
2. **`to` declared after `from`**: in the parent's `sequences[]` array, `to`'s index must be greater than `from`'s. Wipe / iris depend on layer order (B must render above A); enforce the rule for all kinds for consistency. Throw on violation.
3. **Duration > 0**: throw on `<= 0`.
4. **Time coverage**: the interval `[at, at + duration]` must be fully contained within both `from`'s and `to`'s lifespans (after `at` / `duration` resolution including negative-`at` semantics). Throw with concrete numbers when it isn't.
5. **Each name appears at most twice across `transitions[]`**: a sequence can be the `from` of one transition and the `to` of another (as is normal — A→B then B→C), but if a sequence is the `from` of two transitions in the same composition the result is undefined. Throw.
6. **No same-name `from === to`**: a sequence can't transition to itself. Throw.

All errors include the transition's index in `transitions[]` and the kind for traceability.

## Tier 1 — crossfade (DSL macro only)

Implementation: at composition build time, expand each `crossfade` transition into keyframes injected onto the participating sequences:

For `{ kind: 'crossfade', from: 'A', to: 'B', at: T, duration: D, ease: E }`:

- Append to A's `keyframes`: `{ at: T, to: { alpha: 0 }, duration: D, ease: E }`
- Set on B (preferred via `initial`): `alpha: 0` if not already set
- Append to B's `keyframes`: `{ at: T, to: { alpha: 1 }, duration: D, ease: E }`

Engine and runtime are unchanged. The macro runs in a new `expandTransitions(spec)` helper that returns the rewritten composition spec. Called from `Movie.init()` after option merging, before sequence construction.

## Tier 2 — wipe / iris / slide

### Wipe and Iris

Implement a single new filter `TransitionMaskFilter` that takes:

- `uProgress: f32` (0..1, animated by transition expansion via a keyframe)
- `uMode: u32` (0 = wipe-left, 1 = wipe-right, 2 = wipe-up, 3 = wipe-down, 4 = iris-in, 5 = iris-out)
- `uSmoothing: f32` (default 0.02)

Fragment logic (pseudocode):

```glsl
vec4 raw = texture(uTexture, vTextureCoord);
float reveal = computeReveal(vTextureCoord, uMode, uProgress, uSmoothing);
finalColor = raw * reveal;
```

`computeReveal`:
- wipe-left: `smoothstep(uProgress - uSmoothing, uProgress + uSmoothing, 1.0 - vTextureCoord.x)`
- wipe-right: same with `vTextureCoord.x`
- wipe-up / wipe-down: same with `y`
- iris-in: `smoothstep(uProgress - uSmoothing, uProgress + uSmoothing, 1.0 - distance(uv, vec2(0.5)) * 2.0)`
- iris-out: inverse

Applied to **B** (the `to` sequence) by injecting it into B's `filters` list during transition expansion. Filter is named with a deterministic `_pe-transition-<index>` so the generated keyframe can address it via `filters._pe-transition-<index>.uProgress`.

After the transition window ends, the filter no longer affects rendering (`uProgress = 1.0` stays constant), but it stays in B's filter chain for the rest of B's life. Negligible cost (a single multiply pass per frame).

Both GLSL and WGSL programs ship in the same file (mirroring `ChromaKeyFilter`). Same WGSL whitespace gotcha applies.

### Slide

No filter needed — slide is a position translation. Macro expansion injects:

For `{ kind: 'slide', from, to, at: T, duration: D, ease: E, direction: 'left' }`:

- Append to A's `keyframes`: `{ at: T, to: { x: '-W' }, duration: D, ease: E }` (slide A to the left by parent width)
- Set on B: `initial.x = 'W'` (B starts off-screen to the right)
- Append to B's `keyframes`: `{ at: T, to: { x: 0 }, duration: D, ease: E }`

Mapping per direction:
- left: A.x → -W, B.x: W → 0
- right: A.x → W, B.x: -W → 0
- up: A.y → -H, B.y: H → 0
- down: A.y → H, B.y: -H → 0

`W`, `H` are scope variables already exposed (parent width/height). The macro inserts string expressions; the expression evaluator handles them at runtime.

If the user has manually keyframed `x` or `y` on A or B, those remain — the slide macro just appends. There's no conflict-detection; it's the user's responsibility.

## Architecture

New module: `src/core/Transitions.ts` (~250 lines)

```ts
export function expandTransitions(spec: CompositionSpec): CompositionSpec
```

- Pure function: takes the user's spec, returns a rewritten spec with transitions expanded into keyframes/filters and `transitions` field stripped.
- Called recursively for nested compositions.
- Each transition is expanded by a kind-specific helper:
  - `expandCrossfade`, `expandWipe`, `expandIris`, `expandSlide`
- Validation lives here too (single pass per composition).

`Movie.init()` calls `expandTransitions(options.composition)` once, before passing to the composition builder. Existing engine code is untouched.

For Tier 2, `src/filters/TransitionMask.ts` mirrors `ChromaKey.ts`'s structure (single file, GLSL + WGSL together, exposes a `name`-marker class). Registered in `src/filters/index.ts` registry under `_pe-transition-mask` (underscore prefix to mark internal — users shouldn't construct it directly via `{ type: '_pe-transition-mask' }`, though no enforcement).

## File touch list

- **New**: `src/core/Transitions.ts` — expander + validator
- **New**: `src/filters/TransitionMask.ts` — wipe/iris filter (GLSL + WGSL)
- **Modify**: `src/types.ts` — add `TransitionSpec` union + `transitions?: TransitionSpec[]` on `CompositionSpec` / `CompositionSequenceSpec`
- **Modify**: `src/index.ts` — re-export new types
- **Modify**: `src/core/Movie.ts` — call `expandTransitions` in `init()`
- **Modify**: `src/filters/index.ts` — register `_pe-transition-mask`
- **New**: `tests/core/Transitions.test.ts` — validation + expansion unit tests
- **New**: `tests/filters/TransitionMask.test.ts` — filter construction smoke
- **New**: `examples/transitions.html` — runnable demo of all 4 kinds (crossfade, wipe, iris, slide) chained
- **Modify**: `docs/dsl.md` — new "Transitions" section

Estimated +500 lines of source (excluding examples + docs), +200 lines of tests.

## Tests

Validator (Tier 1, no rendering needed):

- crossfade with valid setup → expands to expected keyframes
- crossfade with `from === to` → throws
- crossfade with unknown `from` name → throws
- crossfade with `to` declared before `from` → throws
- crossfade with transition window outside `from`'s lifespan → throws
- crossfade with `duration <= 0` → throws
- duplicate use of one sequence as `from` of two transitions → throws
- nested composition: transitions in inner composition are expanded with inner-relative names

Tier 2 expansion:

- wipe: adds a `TransitionMask` filter to B with name `_pe-transition-0`
- wipe: appends keyframe `filters._pe-transition-0.uProgress: 0 → 1` over `[at, at+D]`
- iris-in vs iris-out: filter constructed with correct `uMode` value
- slide: appends position keyframes with correct W/H expressions per direction

Filter (smoke):

- TransitionMask filter constructs with default args
- Has both `glProgram` and `gpuProgram`
- Animatable scalar `uProgress`

Manual visual verification (browser, both renderers): the new `examples/transitions.html` chains all 4 kinds back-to-back so we can scrub through them.

## Risks

- **PIXI v8 WGSL whitespace gotcha**: same issue as ChromaKey. Apply the same multi-line param-list style and add the same comment.
- **Layer order rule** is annoying when authors reorder sequences. Mitigation: error message names both sequences and shows their indices, and explains the fix.
- **`initial.alpha = 0` injection conflicts**: if the user already set `initial.alpha = 0.5`, our expansion overwrites to 0. Mitigation: only set if `alpha` is absent in `initial`. If present, throw with a message asking the user to remove the manual setting.
- **Time-coverage math** must respect negative-`at` (`-0.5` = `parent.duration - 0.5`). Use the same `resolveAt` helper that `Timeline.ts` uses.
- **Filter name collisions**: if the user names one of their own filters `_pe-transition-0`, our injection will collide. Mitigation: throw if a sequence already has a filter with that name.
- **Discard-friendly**: per the user's request, this entire feature lives behind one branch. Reverting is a single `git revert` of the squash commit (or just deleting the branch before merge).
