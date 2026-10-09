# 07-filters-particles — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 3 (write, tune confetti life and grain amount, full export)   Result: works

## Went smoothly because the docs said so
- The "Named filters" table in dsl.md plus the cheatsheet line was enough to write glow, crt, glitch, rgbSplit and grain with no trial and error; names and options were right the first time.
- The `rgbSplit` gotcha (points do not tween) told me up front to time-window copies of the word instead of animating the split.
- `particles()` recipe (count, at, area, seed, colors, blendMode) worked as written; `check` warned nothing.
- Grain on a transparent composition (`filters` on a `composition` layer) worked with a `from/to` keyframe on `'filters.film.amount'`.

## Stumbles
### 1. How to switch looks on one subject   [GAP]
- tried: first thought of one text layer with every filter animated in.
- happened: nothing broke, but `rgbSplit.red` and `glitch.seed` cannot be tweened as a whole, so the look could not be built up in one layer.
- cause: filter options that are points do not tween.
- would have prevented it: a recipe "one subject, several looks" (time-windowed `composition` copies, each carrying the filters of its look, the grain on the parent scene). I wrote it that way and it is cheap.

### 2. Glitch seed by keyframes   [SPEC-ODD]
- tried: `set: { 'filters.tear.seed': n }` every 0.1 s so the slices change step by step.
- happened: works (visible tearing, no warning), but nothing in the docs says `set` on a filter option is allowed; I only guessed from "animate scalars by name".
- would have prevented it: one line in the Named filters gotchas: "a `set` keyframe steps a filter option (glitch seed)".

### 3. Film grain costs bitrate   [TOOLING]
- happened: the 7 s chapter exports at 22.99 MB (1920x1080) with `grain amount 0.12` over the last 1.2 s and 0.03 before; the docs do say grain eats bitrate, but `check` gives no size hint per chapter.
- would have prevented it: a `check` note "grain on the root, N MB for S seconds".

## Wished the library had
- A named filter `crt` option list in the docs table with ranges: I used `curvature: 4`, `lineWidth: 3`, `lineContrast`, `vignetting` from the pixi-filters defaults; the visible curvature is small, and I did not know a good range.
- `particles()` `area` documented as a box centred on x, y (I assumed it).
