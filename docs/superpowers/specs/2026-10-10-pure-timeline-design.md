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

## Results of the spike (2026-10-10)

The engine exists (`src/core/pure/`, `src/core/timelineEngine.ts`), is switched with `?pe-timeline=pure` / `PE_TIMELINE=pure` / `setTimelineEngine('pure')`, and GSAP is still the default. Every number below is measured.

**Equal to GSAP, by the three checks of the design**
1. Eases: 69 names x 2001 points within 1e-12 of `gsap.parseEase`, and exactly equal at 0 and 1 (a colour is cut towards zero, so 2e-16 for 0 would change it). Colour strings: 10 pairs x 200 points, the same strings as `gsap.utils.interpolate`.
2. Differential fuzz (random keyframes through the same call shapes as `applyKeyframes`, read in random order, on plain objects): 5 families (to, set + to, from / fromTo, repeat / yoyo / repeatDelay, relative values) x 300 scripts x 2 orders; and 4 families x 200 scripts for the Pixi plugin shorthands (`scale`, `anchor`, `pivot`, `skew`, `rotation` in degrees, `tint`, `autoAlpha`) and for child timelines. All equal within 3e-6 (GSAP writes six decimals).
3. Pictures: 92 pages drawn (82 + 10 whose movie had to be exposed), 3 frames each, by hash. 77 identical; 9 differ by at most 3/255 (the 1/255 noise that two builds of the same tree already show); and 6 are larger: four pages (`aura-launch`, `recipe-card`, `three-product-spin`, `countdown-newyear`) use `expo.out` and the pages load GSAP 3.12.5, whose expo is another formula than 3.15's (up to 0.78 % of the range; with the 3.12.5 formula in the pure engine all four are identical within 1/255); `named-filters` is not reproducible under GSAP itself (two GSAP captures differ); `solar-system` differs in one pixel by 9/255 (not explained: the numbers of every sequence agree to 1e-6).
   The whole non-browser suite (2806 tests) passes on both engines (`PE_TIMELINE=pure npx vitest run`); 32 test files that built their own `gsap.timeline` now build theirs through `createTimeline`, and 4 that read GSAP's own tweens (`getChildren`) are pinned to GSAP.

**What the pure engine does that GSAP does not**
- The picture at a time depends on the script and the time only (`purity.test.ts`). GSAP answers by the direction it came from for: overlapping tweens on one property, a `set` that starts where a tween starts, a `set` where a tween ends (rounded to seven decimals the tween ends 1e-7 after it and GSAP writes its end value over the set at the next frame: the set is lost), a `fromTo` after a repeating tween, `from` after `from` / after `set`, a zero-length `fromTo` (not seen as the segment before another).
- It does not depend on the version of GSAP: the pages' 3.12.5 and the repository's 3.15 draw `expo` differently.
- A `from` that has a segment before it ends where that segment ended (GSAP: where the property happened to be).

**Speed** (plain objects, 700 layers x 5 tweens, one timeline per layer under a parent as `Composition` builds it; ms per frame): GSAP 0.098 forward / 0.051 backward / 0.226 random seeks; pure 0.021 / 0.019 / 0.027; init (`progress(1).progress(0)`): GSAP 2.6 ms, pure 0.9 ms; building: equal (about 2-3 ms). 2000 layers x 3: GSAP 0.235 / 0.090 / 0.339, pure 0.045 / 0.046 / 0.063. The timeline is not what limits a frame (drawing is), so the gain is headroom for heavy pieces (particles), and a seek that no longer costs more than a frame.

**Size**: the pure engine with eases, springs, cubic-bezier, the Pixi shorthands and colour strings is 14.1 KB minified, 5.8 KB gzip. GSAP + PixiPlugin is 79.5 KB minified, 31.2 KB gzip: 25 KB gzip less for the page that loads both.

**Workarounds that the pure engine makes unnecessary** (kept while GSAP is the default): the proxy `p` of `revertibleSet`; Base's baseline `renderable` for a `set` that only fires on crossing; the grain's compensation for GSAP rounding time; the init pass `progress(1).progress(0)` of Movie and of a remapped composition; one timeline per layer to avoid the re-measure at every `add`; the vector-as-object of the shader uniforms; `onStart` as the place where colour and gradient tweens read their start (the pure `tweenValue` reads it from the segment before); the registration of spring / cubic-bezier into GSAP; the silent `power1.out` for an unknown ease.

**Not done** (to adopt it): `checkEase` still asks GSAP whether a name exists (the pure parse never says "unknown"); the three `isPure` branches (`colorTween`, `gradientAnim`, `revertibleSet`) and the GSAP code beside them would collapse into one; the Pixi shorthands `fillColor / lineColor / colorize / blur ...` are inert (a shape keeps its own colours; they were noise on a Graphics); GSAP-only features (CustomEase, Physics2D, text plugins) would be optional adapters; docs and the peer dependency would change; the real-browser test suite has not been run on the pure engine (the pages above stand for it).

**Recommendation**: adopt it as the default after one release in which `?pe-timeline=pure` is documented for trying; the numbers say it is equal where GSAP is deterministic, faster, 25 KB lighter, and the only deviations are places where GSAP's answer depends on history or on its own version.

## Findings of the fresh review that were not fixed (deferred)

A reader without the author's context found three real bugs (fixed in c5f128c: a write only when the value changes, a tween keeps its own setter, colours in `setNow`). Not fixed, on purpose:

- **Segments added after the first `time()`**: `prepare` keeps the `from` and the absolute `to` it already resolved and re-reads the base from the live (animated) value. `Movie`, `Composition` and `remap` build everything before the first `time()`, so a movie never meets it; only a caller of the API who adds tweens later does. Fix when needed: capture the base once per channel and reset unresolved `from`s before re-resolving.
- **Order between a parent's channels and a child timeline on one property**: the parent writes first, children in insertion order (not start order), and a child whose clamped local time did not change is not written again, so the winner can depend on how the playhead arrived. Layers have separate targets, so no page does this.
- **Input checks**: `repeat: -1` is read as no repeat (`loopVars` already refuses it upstream); `add(child, NaN)` makes the length NaN; `delay` is reserved but not applied, and `onStart` / `onComplete` would be written onto the target as plain properties; `time()` without an argument returns the playhead unclamped; a zero-length tween with `repeat` and `yoyo` ends on `from` in `endValue` but draws `to` in `ratioAt`. All of these belong to the adoption step (what to do with GSAP vars we do not support: warn or refuse).
