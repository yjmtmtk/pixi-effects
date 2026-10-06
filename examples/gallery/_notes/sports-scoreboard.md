# sports-scoreboard — stumble notes
Model: opus   Cycles: 7   Result: works

Broadcast football package, 1280×720, 12 s: diagonal team panels + shield crests + count-up score (0–2) → gold diagonal sweep →
score bug + stat bars (counters locked to bars) + a momentum graph that draws itself → GOAL stinger (masked diagonal
composition, white flash, slam + shake, scorer strap) → final scoreboard, 3–2 pop. Export: MP4 2.2 MB in 7.9 s, `__logs` empty.

## Went smoothly because the docs said so
- `{value}` counters with `'{value}%'` suffix and the same `at`/`duration`/`ease` as the bar width → value and bar stay locked (bar-chart recipe).
- `fillGradient` works on `polygon` and `path` shapes too (diagonal panels, crest interiors) — gradients in 0–1 of the shape's bounds as documented.
- "Masks live in the parent's coordinates": a static open `polygon` revealed by a rect mask growing from `anchorX: 0` gives a self-drawing line on the first try.
- Rects centred by default / `anchorX: 1` vs `0` for bars growing out of a centre line, `anchorY: 1`/`0` for momentum bars up/down from a baseline.
- `contactSheet` + `snapshot` + `inspect` were enough to judge everything; no OS screenshots needed.
- Audio: the brief + pitfalls gave the 6 s bgm `loop: true` rule; sfx layers sized to the file lengths → no warnings.

## Stumbles
### 1. A mask's keyframes are NOT timed from the masked layer's start   [GAP]
- tried: `goal` composition at `at: 8.1` with `mask: slab(..., { keyframes: [{ at: 0, set: {x: off} }, { at: 0, to: { x: 640 }, ... }, { at: 1.9, to: { x: offRight } }] })`.
- happened: the whole GOAL stinger was invisible (just the gold blades). No warning. `inspect(270)` showed the composition's bounds at x = 1320 → the mask was already at its END state.
- cause: the mask is a sibling sequence with its own `at` (default 0 = the parent's start), so its keyframes ran from t = 0, not from 8.1. Fixed by giving the mask `at` and `duration` equal to the masked layer's.
- would have prevented it: dsl.md "Masks" says the mask "shares its lifetime" — add "but its keyframe `at` is measured from the mask's own `at` (default 0 of the parent); give a mask on a late layer the same `at`". Better: default a mask's `at`/`duration` to the masked layer's, or warn when a mask's keyframes all finish before the masked layer starts.

### 2. `from` values apply before the keyframe starts   [GAP]
- tried: an impact ring `initial: { alpha: 0 }` + `{ at: 0.46, from: { radius: 80, alpha: 0.8 }, to: { radius: 620, alpha: 0 } }`.
- happened: the ring was visible at full alpha from the layer's first frame, frozen, until 0.46 s.
- cause: the first keyframe's start value is held before it (After Effects-like / GSAP immediateRender). Correct behaviour, but not written anywhere I read.
- would have prevented it: one line in cheatsheet "Keyframe kinds": "`from` values are applied from the layer's start, not from the keyframe's `at` — for a delayed pop that must be invisible before, use `set` at `at` then `to`".

### 3. `inspect` reports layers of a composition that is not alive yet   [LIBRARY-BUG]
- tried: `movie.inspect(90, { layers: 'none' })` (t = 3 s).
- happened: `text layers "final/home-city" and "final/home-name" overlap by 27% …` — `final` is a composition with `at: 10`, invisible at frame 90 (the same issue was reported at every frame I inspected).
- cause: looks like `inspect` checks children's own visibility but not whether the parent composition is inside its lifespan.
- would have prevented it: skip children of a composition outside `[at, at+duration)`. (The overlap itself was only the text padding/line box; nudging 6 px fixed it.)

### 4. dsl.md contradicts itself on text counters   [WRONG]
- docs/dsl.md `text` section: "Text content cannot change over time (for a count-up, show one text layer per value)" — two paragraphs later "Counters (`{value}`)". The cheatsheet is right; the first sentence should say "except `{value}`".

### 5. Text clipped by its background chip; inspect cannot see it   [GAP]
- tried: a 470-px parallelogram chip behind "CONTINENTAL LEAGUE · MATCHDAY 24" (20 px, letterSpacing 3).
- happened: both ends of the text hung off the chip; `inspect` silent (pitfall 15 says it does not check text vs shapes).
- would have prevented it: an `inspect` option to flag text whose bounds are not inside a named/underlying shape, or exposing a text layer's measured width so the chip can be `width: 'textWidth + 40'`.

### 6. Blade train z-order   [MY-MISTAKE]
- tried: five diagonal slabs listed leading → trailing.
- happened: the last (trailing, red) slab sat on top and covered the gold one: a full red frame instead of a gold sweep with coloured edges.
- cause: array order = z-order; the cover slab must be last, edge blades first. Obvious in hindsight.

### 7. Layer `at` inside a composition is composition time   [MY-MISTAKE]
- wrote `at: at + DRAW_AT` for a layer inside the `stats` composition (adding the composition's own start twice). Docs are clear; caught before running.

### 8. zsh does not word-split `$S`   [TOOLING]
- `S="agent-browser --session x"; $S open ...` → "command not found" in zsh. Wrote a 2-line bash wrapper script. Worth one line in the BRIEF.

## Wished the library had
- A stroke `progress` / trim (`strokeEnd: 0→1`) for `line` / `polygon` / `path`, so a line draws along its length (a mask works only for left-to-right curves).
- Motion along a path for a layer (`followPath: points`, progress keyframe) — I sampled 44 linear keyframes for the lead dot.
- A group / null layer: moving a whole score bug meant giving 10 layers the same `from: { y }` keyframe (a composition works but then needs its own size and coordinate system).
- A mask default of "same lifetime and time base as the masked layer" (stumble 1).
- `inspect` checking text against the shape directly under it.

## Reusable pattern worth adding to ai/reference/recipes.md
Diagonal sweep (a cover slab with coloured blades on both edges) and a self-drawing line graph with a lead dot.

```js
// parallelogram centred on its own origin (so x can be animated)
const slantPts = (w, h, slant) => [[-w/2 + slant/2, -h/2], [w/2 + slant/2, -h/2], [w/2 - slant/2, h/2], [-w/2 - slant/2, h/2]];
const SW = 1640, SS = 220, OFF_L = -SW/2 - SS/2 - 40, OFF_R = 1280 + SW/2 + SS/2 + 40;
const sweepKeys = (inDur, outAt, outDur, dx) => [
  { at: 0, set: { x: OFF_L + dx } },
  { at: 0, to: { x: 640 + dx }, duration: inDur, ease: 'power3.out' },
  { at: outAt, to: { x: OFF_R + dx }, duration: outDur, ease: 'power3.in' },
];
// edge blades FIRST (below), the cover slab LAST (on top); +dx leads on the way in, -dx trails on the way out
const sweep = (at, dur, outAt) => [[150, '#e5232f'], [-150, '#e5232f'], [75, '#1f6fe0'], [-75, '#1f6fe0'], [0, '#ffd21f']]
  .map(([dx, c]) => ({ type: 'shape', shape: 'polygon', points: slantPts(SW, 780, SS), at, duration: dur,
                       initial: { x: OFF_L + dx, y: 360, fillColor: c }, keyframes: sweepKeys(0.3, outAt, 0.4, dx) }));
// cut scenes while the slab covers: sweep(3.68, 0.75, 0.3) covers ≈ 3.9–4.05 → switch scenes at 4.0
// A stinger revealed by the same moving slab: a full-frame composition with
//   mask: { ...slab, at: STINGER_AT, duration: STINGER_DUR, keyframes: sweepKeys(...) }   // mask needs its own `at`!

// line that draws itself + a dot riding its head (linear, so mask and dot stay locked)
const pts = data.map((v, i) => [X0 + i * STEP, BASE - v * AMP]), DRAW_AT = 1.3, DRAW = 2.0;
const tAt = i => Math.round((DRAW_AT + DRAW * i / (pts.length - 1)) * 30) / 30;
[{ type: 'shape', shape: 'polygon', open: true, points: pts, initial: { strokeColor: '#fff', strokeWidth: 3 },
   mask: { type: 'shape', shape: 'rect', width: 0, height: 2 * AMP + 40, anchorX: 0, initial: { x: X0 - 6, y: BASE, fillColor: '#fff' },
           keyframes: [{ at: DRAW_AT, to: { width: X1 - X0 + 12 }, duration: DRAW, ease: 'none' }] } },
 { type: 'shape', shape: 'circle', radius: 7, at: DRAW_AT, initial: { x: pts[0][0], y: pts[0][1], fillColor: '#ffd21f' },
   keyframes: pts.slice(1).map((p, k) => ({ at: tAt(k) - DRAW_AT, to: { x: p[0], y: p[1] }, duration: DRAW / (pts.length - 1), ease: 'none' })) }];
```
