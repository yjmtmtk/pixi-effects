# news-package — stumble notes
Model: opus   Cycles: 8   Result: works

## Went smoothly because the docs said so
- The lower-third recipe (mask in the parent's space, grow `width` from `anchorX: 0`) worked first time; I turned it into a `wipeMask()` helper and used it on 4 layers.
- The `{value}` counter made the running clock easy: `'18:42:{value}'` plus one `set` keyframe per second. No zero-padding was needed because the seconds stay between 32 and 41 (see Wished).
- `fillGradient` (linear and radial, with alpha stops) gave me the sky, the water, soft clouds, the vignette and the gradient red band without any hand-rolled images.
- Shape geometry is animatable, so the full-width BREAKING band morphs into the lower-third tag in one keyframe (`width`, `height`, `x`, `y` together). That is the best moment in the piece and it took one line.
- The `wipe` transition between two full-screen compositions, with skewed slabs riding the edge, worked first time. It validated the overlapping lifespans for me.
- `contactSheet({ times })` and `snapshot` found every visual problem (see below) before I had to guess. `__logs` stayed `[]` from the first run.
- `measure()` with a 2D canvas context (same font string) matched Pixi's text widths exactly. I used it to lay out the colour-coded ticker items and to size the sub bar to its text.

## Stumbles
### 1. Audio fade-out with a negative-`at` `to` keyframe starts at the previous keyframe   [LIBRARY-BUG]
- tried: `volume: 0, keyframes: [{ at: 0, to: { volume: 0.5 }, duration: 0.4 }, { at: -1.2, to: { volume: 0 }, duration: 1.2 }]` on a 12 s looping bgm (the same pattern as pitfalls #5 and the slideshow recipe).
- happened: no warning. The music faded out over the whole piece. Per-second RMS of `movie.audioBuffer` was `0.008 0.013 0.011 0.011 0.005 0.004 0.003 0.008 0.002 0.001 0.000`, which is a linear ramp from 0.4 s to 12 s, not from 10.8 s.
- cause: in the audio mix, a `to` volume keyframe seems to interpolate from the end of the previous keyframe, not from its own `at`. GSAP-driven visual props do not do this.
- workaround: `{ at: -1.2, from: { volume: 0.9 }, to: { volume: 0 }, duration: 1.2 }` gives flat 0.016 RMS and then a fade in the last second.
- would have prevented it: fix the audio interpolation to hold the value until the keyframe's `at`, as visual keyframes do. Until then, change pitfalls #5 and the slideshow recipe to use `from`+`to` for the fade-out. Every piece that copies the recipe now gets a slow fade from the start.

### 2. `inspect` reports false overlaps for masked / off-canvas ticker text   [LIBRARY-BUG]
- tried: `movie.inspect(f, { layers: 'none' })` with a ticker made of several moving text layers inside a `ticker` composition, masked to the area right of the clock box.
- happened: 7–16 issues per frame, such as `text layers "ticker/tick-cat2" and "ticker/tick-body3" overlap by 100% of the smaller one`, for items that sit side by side and are entirely off the right edge of the canvas. Also `"ticker/tick-cat0" and "ticker/clock" overlap by 84%` for text the mask hides behind the clock box.
- cause (guess): bounds are clamped to the canvas before the overlap test (off-canvas items collapse onto the same edge), and masks are ignored. The "moving text is ignored" rule seems to cover only *cut off*, not *overlap*.
- workaround: `r.issues.filter(i => !i.includes('ticker/'))`.
- would have prevented it: skip overlap tests for text whose x/y is animated, the same rule as for cut-off text. Also skip text that is fully outside the canvas or fully outside its mask.

### 3. docs/dsl.md `text` section contradicts the counter section   [WRONG]
- The `text` paragraph says "Text content cannot change over time (for a count-up, show one text layer per value)". Twenty lines later the same file documents `{value}` counters. I trusted the cheatsheet, but a reader of dsl.md alone would build one layer per number.
- would have prevented it: change that sentence to "Content is fixed except `{value}`; see Counters".

### 4. Leftover slab visible during the whole stinger   [MY-MISTAKE]
- I moved the opening slab by +1900 px. Its width (1700) plus the skew offset (`tan 14° × 500 ≈ 125 px`) left a blue wedge on the right edge until the scene ended. I only saw it on a contact sheet.
- would have prevented it: a pitfalls line: "a skewed rect is wider than `width`: add `height/2 × tan(skew)` on each side when you move it off the canvas". `inspect` only checks text, so it cannot catch this.

### 5. Text that slides out from behind a growing box peeks before the box covers it   [MY-MISTAKE]
- The logo's "NORTH" starts behind the red "24" box and slides left through a static mask. The box scales up from 0, so for a few frames the text's right edge showed as a sliver. A glint masked to the box's full-size rect showed the same way. Fixed by starting both further away. This is a general rule: a mask that stands in for an occluder must also follow the occluder's animation.

### 6. Number padding / time format for the clock   [GAP]
- `format` has only `decimals` and `grouping`, so `18:42:{value}` cannot show `:05`. I avoided it by choosing a range of seconds with two digits. A real clock or a timecode (HH:MM:SS:FF) needs `format: { pad: 2 }` or several counters.

### 7. Ordering the BREAKING band above the lower third   [SPEC-ODD]
- The band must be under the "BREAKING NEWS" text but above the headline bar it hands off to, and the dim must be under the ticker. Z-order is the array order, so I first wrote a fragile splice-based reorder, then rewrote it as one explicit array. A per-layer `zIndex` would be simpler for a package where elements change role over time.

## Wished the library had
- `format: { pad }` (or a `time` format) for `{value}` counters, for clocks, countdowns and timecode.
- `inspect` that knows about masks and moving text for overlap, not only for cut-off.
- A "text run" helper: several styled spans on one line, laid out by measured width. I built a colour-coded ticker (red category, navy body, blue separator) by measuring with a 2D canvas myself.
- Optional `zIndex` on layers.
- A shared mask: one mask for both the bar and its text. Now every masked layer needs its own copy of the mask spec, which is easy with a helper function but not obvious.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
A seamless crawl made of coloured runs, laid out by the same measurer Pixi uses, masked to the area right of a clock box (inside a `ticker` composition):

```js
const measure = (() => { const g = document.createElement('canvas').getContext('2d');
  return (s, weight, size) => { g.font = `${weight} ${size}px ${SANS}`; return g.measureText(s).width; }; })();
const travel = SPEED * DUR_T;   // every run moves by the same distance, linear → they stay locked
const mover = (spec, x) => ({ ...spec, keyframes: [{ at: 0, to: { x: x - travel }, duration: DUR_T, ease: 'none' }] });
const mask = () => ({ type: 'shape', shape: 'rect', width: W - BOX, height: 40, anchorX: 0, initial: { x: BOX, y: 20, fillColor: '#fff' } });
let x = BOX + 30;
for (const [cat, body] of ITEMS) {
  crawl.push(mover({ type: 'text', text: cat,  style: { fontFamily: SANS, fontSize: 20, fontWeight: '800', fill: RED },  initial: { x, y: 21, anchorY: 0.5 }, mask: mask() }, x));
  x += measure(cat, 800, 20) + 12;
  crawl.push(mover({ type: 'text', text: body, style: { fontFamily: SANS, fontSize: 20, fontWeight: '600', fill: NAVY }, initial: { x, y: 21, anchorY: 0.5 }, mask: mask() }, x));
  x += measure(body, 600, 20) + 64;
}
```

Band → tag morph (one keyframe animates a rect's geometry):

```js
{ type: 'shape', shape: 'rect', width: 1280, height: 0, initial: { x: 640, y: 360, fillColor: RED },
  keyframes: [{ at: 0, to: { height: 170 }, duration: 0.35, ease: 'expo.out' },
              { at: 1.2, to: { width: 200, height: 54, x: 180, y: 548 }, duration: 0.5, ease: 'power3.inOut' }] }
```
