# history-timeline — stumble notes
Model: opus   Cycles: 7   Result: works

Piece: "A short history of computing". 1280×720, 14 s. An editorial infographic on off-white paper with two inks (indigo and vermilion). A title card moves up into a header. A line then draws along the lower third while one wide `composition` (4 570 px) is panned in eased steps. A slower glyph plane gives parallax. Eight milestones (1936 → 2023) pop in as the pen reaches each one. Each has a drawn icon built from shapes (Turing tape, relay, transistor, mouse, chip, globe, phone, neural net), each with its own small motion, plus a year counter that counts up from the previous milestone and a one-line caption. At the end the camera pulls back to an overview: the icons and years scale up while the timeline scales down, and a closing line holds for about 1.5 s. Export: MP4 1,941,474 bytes in 9.9 s. Audio is present (RMS 0.012). `__logs` stayed `[]` from the first run to the last.

## Went smoothly because the docs said so
- The BRIEF's "from/to holds its start value from the layer's start" let me build every pop as `{ at, from: { scale: 0 }, to: { scale: 1 } }` with no `initial.scale` anywhere. Nothing flashed before its `at`.
- `set` being undone on a seek back: the relay's contact spark (`set { alpha: 1, scale: 0.3 }` then a `to`) scrubs correctly in both directions.
- Omitting `duration` on the one-shot sfx (pop / swoosh / chime) gave no warning and no length lookups.
- The camera pan works because the line's `width`, the pen's `x` and the composition's `x` all use the same keyframe shape (same `at`, `duration`, ease). The pen therefore stays on the tip of the line at a fixed screen x (pitfall 6, applied to tweens rather than sampled frames).
- Scaling a composition with no pivot turns it about its top-left (dsl.md). `x = 640 − s·(L+R)/2` frames the overview exactly on the first try.
- `{value}` counters: `initial.value` = the previous milestone's year and `to.value` = this year, so 1947 → 1968 counts the 21-year gap. In `ui-monospace` the counter has no width jitter.
- `'GW/2 - w/2'` to centre a top-left-anchored title that later scales into the header (the same pattern as the data-story note).
- `rect` with `anchorX: 0` and a `rotation` keyframe works as a lever pivoting at its left end (the relay armature).

## Stumbles
### 1. `inspect` flags text inside a panned composition as "entirely outside the canvas"   [SPEC-ODD]
- tried: `inspect(f, { layers: 'none' })` during the pan.
- happened: `text layer "timeline/icon-tape/bit0" is entirely outside the canvas (at -1000,307, 12×24)` (×5 tape bits, plus `icon-chip/part`). This repeated at every frame after the milestone had scrolled off the left edge.
- cause: the inspector exempts text whose own x/y is animated (tickers), but not text moved by an ancestor composition's x/scale. In a camera-pan piece almost all text is off canvas most of the time.
- workaround: fade each milestone (icon, year, caption) out once it is two steps behind, and fade it back in late in the pull-back. That looks cleaner anyway. During the pull-back the old milestones had to stay transparent until they were on screen, or inspect flagged them again.
- would have prevented it: treat a layer as "moving" when any ancestor's x/y/scale is animated. Alternatively, report "off canvas" only when the layer was on canvas in an earlier frame and has not moved since.

### 2. Another session's page answered my `agent-browser --session history-timeline` call   [TOOLING]
- tried: `eval "movie.contactSheet(...)"` right after a `reload`.
- happened: the PNG was another author's piece ("FLOW" liquid gradient). The inspect results from the same batch were mine.
- fix: I made my helper print `location.pathname` with every eval/inspect and re-ran. Look at every saved image before trusting it (the BRIEF's warning was right).

### 3. No parent/null layer, so the parallax plane duplicates the pan keyframes   [GAP]
- tried: one camera move driving two planes at different speeds.
- happened: the DSL has no group or parent. I mapped the timeline's pan keyframes to a second composition (`x · 0.38`) in JS. That is fine while the data stays in one array, but the pull-back zoom could not easily be mirrored on the parallax plane, so it only fades.
- would have prevented it: `parent: 'timeline'` plus a `parallax: 0.38` factor, or a documented "camera rig" recipe (a 2D camera that offsets non-threeD layers by a per-layer depth factor).

### 4. Line draw-on still has to be hand-rolled   [GAP]
- tried: a stroke that draws along the track.
- happened: as the BRIEF says, there is no trim-path. A straight horizontal line is easy (`rect` with `anchorX: 0` and a `width` tween). The dashed "future" guide is a single `path` with 190 `M…L` sub-paths, which worked and costs one layer.
- would have prevented it: `strokeProgress` on line/path. A `dash: [11, 11]` stroke option would remove the generated path.

### 5. A `line` with an `x` keyframe: where is its origin?   [GAP — docs]
- tried: moving a `line` (the tape head's stem) with `to: { x: 106 }`. The line had no `x,y`, so it was drawn in canvas coordinates.
- happened: I did not dare. The docs say that with `x,y` the line's midpoint is placed, but not what the tween starts from when none is given. I swapped it for a `rect`.
- would have prevented it: one line in the docs: "a line without x,y has x = y = 0 (offsets add to its canvas coordinates)", or whatever is true.

### 6. Short holds: easy to time a fade on the wrong pan   [MY-MISTAKE]
- tried: fade a milestone out at `S(i+2)` (the start of the pan that carries it off screen).
- happened: it dimmed while still at x≈400 (still the "previous" milestone). Fixed with a 0.4 s lag. Several scheduled helpers (`T(i)`, `S(i)`, `Z`) plus `at - layerAt` conversions for layer-local keyframes were the main source of bugs I had to reason about.
- would have prevented it: named markers (`markers: { arrive3: 5.7 }`, `at: 'arrive3+0.4'`) would make layer-local vs. composition time painless.

## Wished the library had
- A parent/null layer with a parallax factor (a 2D camera rig).
- `inspect` that understands a moving ancestor (see stumble 1).
- Stroke `progress` / `dash` on line and path.
- Timeline markers usable in `at` expressions (`at: 'm3 + 0.4'`), so layer-local keyframes can refer to composition events without `Z - at` subtraction.
- A `tabular` / `fontVariantNumeric` text option, so counters in proportional fonts (Georgia, system-ui) do not jitter.

## Reusable pattern worth adding to ai/reference/recipes.md
Camera pan over a wide composition, with a line and pen that stay locked to a fixed screen x, and a parallax plane:

```js
// @recipe pan-timeline
const SP = 440, X0 = 840, N = 5, T0 = 1.5, STEP = 1.2, PAN = 0.8, EASE = 'power2.inOut', LINE_Y = 480;
const mx = i => X0 + i * SP, T = i => T0 + i * STEP, S = i => T(i) - PAN;
const pan = [], lineKf = [{ at: 0.5, to: { width: mx(0) }, duration: T0 - 0.5, ease: EASE }], penKf = [{ at: 0.5, to: { x: mx(0) }, duration: T0 - 0.5, ease: EASE }];
for (let i = 1; i < N; i++) {
  pan.push({ at: S(i), to: { x: -i * SP }, duration: PAN, ease: EASE });          // the camera
  lineKf.push({ at: S(i), to: { width: mx(i) }, duration: PAN, ease: EASE });     // same shape => the tip stays at screen X0
  penKf.push({ at: S(i), to: { x: mx(i) }, duration: PAN, ease: EASE });
}
const track = [
  { type: 'shape', shape: 'rect', width: 0, height: 3, anchorX: 0, initial: { x: 0, y: LINE_Y, fillColor: '#1f2a44' }, keyframes: lineKf },
  ...Array.from({ length: N }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 9, at: T(i),
    initial: { x: mx(i), y: LINE_Y, fillColor: '#f2ede3', strokeColor: '#1f2a44', strokeWidth: 3 },
    keyframes: [{ at: 0, from: { scale: 0 }, to: { scale: 1 }, duration: 0.4, ease: 'back.out(3)' }] })),
  { type: 'shape', shape: 'circle', radius: 5.5, initial: { x: 0, y: LINE_Y, fillColor: '#d9472b' }, keyframes: penKf },
];
return [
  { type: 'composition', name: 'parallax', width: 2400, height: 720, keyframes: pan.map(k => ({ ...k, to: { x: k.to.x * 0.38 } })),
    sequences: [{ type: 'text', text: '{ }', style: { fontSize: 160, fill: '#1f2a44' }, initial: { x: 900, y: 200, alpha: 0.06 } }] },
  { type: 'composition', name: 'timeline', width: mx(N - 1) + 640, height: 720, keyframes: pan, sequences: track },
];
```
