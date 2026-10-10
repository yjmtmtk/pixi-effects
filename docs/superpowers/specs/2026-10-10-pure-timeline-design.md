# A timeline of our own (spike) — design

Date: 2026-10-10 · Status: owner said GO ("最優先で開始") after the analysis of GSAP's footprint. This is a SPIKE: GSAP stays the default until the parity numbers say otherwise.

## Why

pixi-effects uses about ten GSAP functions (timeline, set / to / from / fromTo, add, time, progress, parseEase, registerEase, `PixiPlugin`, `utils.interpolate`). A movie is a pure function of time, but GSAP tweens are stateful (start values captured at the first render, `set` only when the playhead crosses, zero-duration tweens skipped, time rounded to 1e-8, a re-measure of the whole timeline at every `add`): the source carries at least eight workarounds. A timeline of our own would evaluate "the value of this property at time t" with no state, remove a peer dependency (about 31 KB gzip), and give per-frame inputs (`bind`, `iMouse`, recorded sessions) a natural place to enter.

## What it must do (the surface we use)

`createTimeline({ paused, defaults })`, `add(child timeline | spacer)`, `set / to / from / fromTo(target, vars, [fromVars], at)`, `time()` / `time(v)`, `progress(p)` (chainable), `duration()`, `kill()`; vars: `duration`, `ease`, `repeat`, `yoyo`, `repeatDelay`, `onUpdate`, and `pixi: { ... }` (PixiPlugin shorthands). Targets are display objects, filters, plain state objects and objects with getters and setters (the clock of a remapped composition). Eases: the GSAP families, `back(s)`, `elastic(a, p)`, `steps(n)`, and our own `spring(...)` / `cubic-bezier(...)`.

## The model

For each (target, property) the timeline keeps the segments that write it, ordered by start time (creation order breaks a tie). The value at time `t`:
1. start from the property's value when the timeline was built (after `initial`);
2. walk the segments in order; a segment whose start is after `t` stops the walk, except that a `from` / `fromTo` segment shows its start value from the beginning (GSAP's `immediateRender`);
3. a segment with progress `p` (repeats and yoyo folded in, the ease applied) writes `from + (to - from) * ease(p)`; a finished one writes its end value;
4. the start value of a `to` / `from` segment is the end value of the segment before it on that property, or the base value (what GSAP captures when the timeline is initialised end-then-start, which Movie already does).

Nested timelines (a layer's own, a remapped composition's local one) are segments of their parent that call the child's `time()` with the local time. Callbacks (`onUpdate`) run after the write of their segment, on a change of that segment's value.

## How we know it is the same

GSAP is the oracle. Three checks, all automatic:
1. **Eases**: every family, parameter set and registered ease, 2001 points each, equal to `gsap.parseEase` within 1e-12.
2. **Differential fuzz**: random keyframe lists (`set`, `to`, `from`, `fromTo`, overlapping, repeat, yoyo, eases, relative values, nested timelines) built through the real `applyKeyframes` on plain objects with each engine, read at random times in random order (forwards, backwards, jumps, the same time twice), equal within 1e-9.
3. **The pictures**: the 64 pages the repository shows as correct, frames drawn with each engine and compared by hash (`scripts/compare-frames.mjs`), then the whole test suite with the engine switched.

Then, and only then, measure: time per frame with 1000 tweens, bundle size, and the number of GSAP workarounds that can be deleted.

## Switching

`src/core/timelineEngine.ts` is the one place that creates timelines (`createTimeline`, `setNow`, `parseEase`). The engine is `'gsap'` unless `setTimelineEngine('pure')` is called, or the page's URL carries `?pe-timeline=pure` (a development switch for the comparison; removed or documented when the spike ends).

## Not in the spike

GSAP plugins as optional adapters, a public API change, deleting GSAP, `bind` / inputs. Those wait for the numbers.
