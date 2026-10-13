# cycle-lane-race - canvas trial notes
Model: opus (claude-opus-5-5)   Slot: C3   Cycles: 9 edit/look cycles   Result: works
Timeline (JST wall clock): started 05:51; design.md 05:53; first page rendered and first frames looked at 05:55 (+4 min); full check + export 06:01; final export and contact sheet 06:02 (+11 min); notes written after that.

Piece: an FT-style bar-chart race, "Paris pedals past Copenhagen": km of protected cycle lanes in 12 European cities 1995–2025 (invented data, said so in the source line), Paris climbs from 4 km to 410 km and passes Copenhagen in 2024. 15 s, 1280x720, poster 14.2 s. Two `canvas` layers: `race` (axis that rescales, the year numeral, 12 bars with smoothed ranks, labels, annotations with elbow leaders that draw on) and `lines` (a small "Paris v Copenhagen" line chart with the other ten as faint lines). Header, standfirst, closing figure and source are ordinary text layers; a quiet `music` bed whose last chord lands on the overtake, plus a soft click under each annotation.

## Log
- +0: read BRIEF-canvas, BRIEF-round3, `help canvas`, dsl `canvas` section, SKILL.md, quickstart, template, the four canvas recipes (they are printed inside SKILL.md).
- +2: tuned the invented dataset (base + sum of logistic steps per city) in a 20-line Node script so that Paris passes Copenhagen in 2024.
- +4: first page: the year as `params.year` animated by three keyframes (power2.in / none / power2.out with matching speeds), `setup` builds a table of km and rank every 0.05 year, ranks smoothed over ±0.5 year. Check OK, no warnings; the picture worked at the first try.
- cycle 2: two cities with the same value (Vienna/Seville at 137 km) flickered between rows, and the mean of the flips left them half-overlapped: added a hysteresis (the order is carried from step to step; a swap needs a lead of more than 1.5 km, later 0.6 km).
- cycle 3: moved annotations to the top right and the line chart to the bottom right so that leaders never run past the chart.
- cycle 4: the 2020 and the 2024 notes overlapped in time; retimed the clock (linear to 2018, then a 4.7 s power2.out to 2025) so the overtake lands at movie 12.47 s, on the music's last bar (12.5 s).
- cycle 5: **the switch away from `params.year`.** At the end the clock slows down, and a rank swap smoothed over ±0.5 *year* crawled for more than a second (Berlin/London sat half on top of each other). The swap must be smoothed in *seconds*, so `setup` needs the year at every frame, and `setup` cannot read keyframes. I replaced the keyframed param with a hand-written `yearAt(t)` (the three easing formulas by hand) shared by both canvases; `setup` now builds ranks per frame and `draw` reads `info.state[info.frame]`. `timeOfYear` (when do the notes appear) became a bisection over `yearAt`.
- cycle 6: the overtake label said "2023" because the crossing was at 2023.98: computed the crossing from the data (bisection) and moved Paris's last step 0.15 year later.
- cycle 7: an early annotation (2000, Copenhagen) to fill the quiet first four seconds; Seville's hold shortened so it never meets London's.
- cycle 8: closing figure as a text layer ("Paris: 4 km in 1995, 410 km in 2025"); sfx volume raised after the check's "buried" note.
- cycle 9: labels printed on top of each other while two bars slide past: the label of the smaller value now fades while the two are less than 0.8 row apart. Full check OK (0 warnings, layout OK, audio OK, export OK), render 1.26 MB in 10.2 s; I looked at the contact sheet and at frames decoded from the mp4 (10.6 s, 14.5 s): they match the page.

## Wishes for `draw` / `info` / the canvas layer

### Read a param's curve at another time (in `setup` and in `draw`)   [MISSING-INFO]
- wanted: the value of `params.year` at every frame, inside `setup`, to compute rank swaps smoothed in seconds and with a hysteresis (both need the past frames), and the inverse (at what second does `year` reach 2020.3?) to time the annotations and the sfx.
- tried / did instead: gave up the keyframed param entirely; wrote `yearAt(t)` by hand (power2.in / linear / power2.out, matching speeds at the joins: 8 lines) plus a 1-line bisection `timeOfYear`. The keyframes and the hand-written curve existed side by side for two cycles and drifted apart once (the 2020 and 2024 notes collided because my inverse used the old keyframe times). About 15 minutes all told, and it made the nice feature (params animated by keyframes) useless for the main clock of the piece.
- would have prevented it: `info.paramAt(name, t)` (or `info.sample('year', t)`) available in `setup` AND `draw`, evaluating the layer's own keyframes at any layer second; optionally `info.timeWhen(name, value)` for a monotonic param. Any data story with a time axis (bar race, map over years, counter with annotations) needs this.

### Easing functions by name   [MISSING-CTX]
- wanted: `ease('power2.out', x)` with exactly the names the keyframes use, for the leader draw-on, the year clock, the label fades.
- tried / did instead: wrote `easeInOut` (cubic) and the power2 formulas by hand (4 lines); I am not sure my "power2" matches the library's.
- would have prevented it: `info.ease(name, x)` or an exported `ease(name, x)` from `pixi-effects` (the same table keyframes use), named in `help canvas`.

### One clock for two canvas layers   [MISSING-LAYER-FEATURE]
- wanted: both canvases (`race`, `lines`) to follow the same `year` param, animated once.
- tried / did instead: first duplicated the three keyframes on both layers (a shared JS constant); later both call the same module-level `yearAt(t)`, which only works because both layers start at the same `at`.
- would have prevented it: a composition-level animated value that `draw` can read (`info.vars.year` / `info.movie.params`), or `info.paramOf('race', 'year')`.

### Absolute movie time and the layer's own `at`   [MISSING-INFO]
- wanted: to place sfx and text layers on the movie timeline at the moment a canvas annotation appears (computed in layer seconds).
- tried / did instead: a constant `RACE_AT = 1.0` used for the layer's `at` and added to every annotation time for the sfx (`at: RACE_AT + n.t0`). Works, but nothing ties them if someone edits the layer's `at`.
- would have prevented it: `info.at` (the layer's start in movie seconds) / `info.movieTime`; and for the other direction, a way to put a layer `at: 'race + 2.4'` (a time relative to another layer's start).

### Text drawn in a canvas is invisible to `inspect`   [DOC]
- wanted: the check to tell me that two city labels were printed on top of each other during a swap, or that the annotation text left its column.
- tried / did instead: found it by looking at frames; wrote a label-collision fade (10 lines). `check` said "layout OK" the whole time, which is true only for the text layers.
- would have prevented it: one sentence in `help canvas` ("text you draw yourself is not inspected: overlaps and clipping inside a canvas are yours to look at"), or an optional `info.reportBox(name, x, y, w, h)` so a canvas can declare text boxes that `inspect` then checks.

### Wrapping text with `measureText`   [MISSING-CTX]
- wanted: a paragraph of annotation text wrapped to a column width, in the same fonts as the text layers.
- tried / did instead: a 7-line greedy word wrap on `ctx.measureText`. Easy, but every annotated chart needs it, and line height / font strings are repeated by hand.
- would have prevented it: `info.wrapText(ctx, text, maxWidth)` returning lines, or a doc line showing the library's `measureText()` / `splitText()` can be used in `draw` with the same style objects as text layers.

### A trimmed polyline (draw-on of a leader line)   [MISSING-CTX]
- wanted: an elbow leader that draws on from the bar to the annotation.
- tried / did instead: 9 lines of segment-length bookkeeping. (`setLineDash([len * p, len])` would have done it in 2 lines; I did not think of it until later.)
- would have prevented it: a recipe line in `help canvas` showing the `setLineDash` draw-on trick, the canvas equivalent of `trimEnd`.

### `check` is silent about canvas layers that pass   [OTHER]
- wanted: to know the determinism check actually ran on my two layers.
- tried / did instead: looked for a `canvas` key in report.json: there is none when nothing is wrong. I trusted it.
- would have prevented it: one line in the summary, `canvas    2 layers deterministic at 4 moments (race, lines)`, and a `canvas` entry in report.json even when it passes (with the time a draw took: see next).

### How long does my draw take?   [PERF]
- wanted: a number for the cost of `draw` per frame (the race draws 12 bars, ~40 text calls, a wrap with measureText per annotation).
- tried / did instead: inferred it from the export time (15 s rendered in 10.2 s, so it is fine here).
- would have prevented it: `check` printing the slowest canvas draw in ms per layer.

### A bar-race recipe   [DOC]
- wanted: the parts every bar race needs: a hysteresis order (ties must not flicker), ranks smoothed in seconds, label fade during swaps, an axis whose minor ticks fade with their spacing.
- tried / did instead: wrote all four myself (~45 lines). The hysteresis was found the hard way (a plain sort per frame flips equal values, and the smoothing then leaves two bars half on top of each other forever when the values stay equal at the end).
- would have prevented it: a `canvas-bar-race` recipe; the canvas section already says "a chart", but none of the four recipes is a chart.

### What went well
- The contract is clear and short; I never got a determinism warning because the recipes showed the pattern (compute from `t`, simulation in `setup`, read `info.frame`).
- `info.frame`, `info.duration`, `info.frameRate` in `setup` were exactly what the per-frame rank table needed.
- `params.dim` animated by an ordinary keyframe worked the first time (the end-dim of the other cities).
- The layer is placed like an image (top-left), so `initial: { x, y }` put the chart exactly on my grid. `alpha` keyframes on a canvas layer just worked for the fade-in.
- Export matches playback (checked frames decoded from the mp4). Fast: 15 s rendered in about 10 s.
- System fonts (Georgia, system-ui) in `ctx.font` rendered at once, no loading step needed.

### Docs: wrong or missing
- Nothing I read was wrong.
- `help canvas` does not say that canvas text is not inspected (see above), and has no chart recipe although it names "a chart" as a use.
- `recipe canvas-trail` (and `recipe canvas-life`) print the whole "Draw it yourself" section with all four canvas recipes, not the one asked for, so asking for two of them prints the section twice. Harmless, but `recipe <id>` promises one recipe. (I first thought SKILL.md itself held the section twice; it does not: I checked.)
- It would help if `help canvas` said in one line what to do when you need a param's value at other times (today: "write the curve as a JS function and do not use params").

## The usual usability notes (the library at large)
1. **Keyframed `params` and `setup` do not meet.** The single biggest friction: the nicest design (the year as a keyframed param) had to be abandoned in cycle 5 for a hand-written curve, because the computation that needs history lives in `setup` and cannot see the keyframes.
2. **The check's sound advice was good and specific:** "2 sound effects are buried ... raise its volume (an accent over music needs 2 to 3)" told me exactly what to change. The music read-back (bars, chords) confirmed the score in one glance. Minor noise: the "no meter set: 4 assumed" note is printed on every run for a plain 4/4 score.
3. **`--crop` with several `--at` moments puts the crops side by side in `at.png`**, which was handy, but `--out` reuses the folder: an earlier crop run's `at.png` would be overwritten by the next run, so I used a second `--out` folder. (Small; the lesson "--out writes straight into the folder" from round 3 held.)

## Self-critique
Round 1 (after cycle 4, looking at the contact sheet): (a) three cities sat half on top of each other at 2016 (9.0 s) and Berlin/London at 12.4 s: a tie that the smoothing could never resolve; (b) the 2020 note overlapped the overtake note at 11.2 s; (c) the first four seconds had no annotation and read as a screensaver; (d) the overtake note said "2023". All four fixed (hysteresis + smoothing in seconds, retimed clock, the 2000 Copenhagen note, crossing computed from the data).

Round 2 (after cycle 8): (a) labels still collide for a third of a second during every swap (5.47 s Paris/Seville, 9.53 s Seville/Barcelona, 10.9 s London/Berlin): fixed with the label fade; the bars themselves still overlap during a swap, which is the convention of the genre; (b) an annotation's year header ("2012 · LONDON") stays up while the counter runs on to 2017: at 3 years a second there is no way to hold a 10-word note and keep the year in sync; a slower clock would make the piece longer than 15 s. Left as is; (c) the music is pleasant but generic and the clicks are barely there; for an FT piece silence or a single tone would arguably be more honest. Kept, quiet.
What I would do with 3 more cycles: slow the clock briefly around each annotation (a time-remap curve, which would make the "param at another time" wish even more pressing), make the line chart's x-axis tick at the current year, and give the overtake a one-frame emphasis (Paris's row flashes once in a darker claret).
