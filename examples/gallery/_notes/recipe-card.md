# recipe-card — stumble notes
Model: sonnet   Cycles: 4 (1 write, 3 look-and-adjust)   Result: works

## Went smoothly because the docs said so
- `{value}` counters with a suffix (`'{value}:00'`, `initial: { value: 8 }`, `to: { value: 0 }`, `ease: 'none'`) gave the "8:00 -> 0:00" timers with no per-frame work; `text.fill` and shape `fillColor` tween to green at the end (oklab on the pill).
- `composition` layers with `pivotX/pivotY` = their centre made reusable "stickers" (icons, lemon slices, SERVES badge, sparkles): pop / rotate / wobble the whole group as one unit. Children clipped nothing as long as the box was a bit larger than the art.
- Layer-local keyframe `at` + `from` keyframes holding from layer start made every pop-in a one-liner (`popK`), no `initial.alpha` needed.
- `fillGradient` radial with alpha stops for background glows; ring (`fillAlpha: 0` + stroke) circles for the pasta nest; width-from-0 rects with `anchorX: 0` for strike-throughs worked after a jump seek.
- contactSheet `times` + `columns` + `cellWidth`, `inspect({layers:'none'})`, `snapshot` -> save-image.py all first try. Export: 1080x1350, 12 s mp4 = 1.34 MB in 8.8 s. `window.__logs` stayed `[]`.

## Stumbles
### 1. Text width is unknown at build time, so title / strike / pill sizes were guesses   [GAP]
- tried: place two title words side by side, size a strike-through and a pill to their text.
- happened: no expression gives the width of a *different* layer, and `w` only works inside the layer itself; my first title (fontSize 124) ran into the lemon sticker.
- cause: widths depend on the system font stack.
- workaround: measured with an offscreen canvas `ctx.measureText` using the same font stack, then `fontSize = min(124, 124*targetWidth/rawWidth)`. Worked well (and the final fit was then verified by eye).
- would have prevented it: a recipe line "measure text with canvas measureText for strike-throughs / pills / fitting a title to a width" in recipes.md, or an expression `textWidth('...')`.

### 2. inspect false positive on stacked badge text   [SPEC-ODD]
- tried: "SERVES" (17 px) above a big "2" (76 px) inside a badge composition.
- happened: `text layers "badge/serves" and "badge/two" overlap by 30% of the smaller one` (64% before I moved them apart; ink never touched). `lineHeight: 60` did not shrink the reported box.
- cause: inspect uses the line box (ascent+descent), a digit's ink is much shorter than its box.
- would have prevented it: ink-based bounds, or docs line "a large glyph's box is taller than its ink; this overlap can be a false positive". Left at 30% (visually clean).

### 3. Check mark has to be hand-built   [GAP]
- tried: an animated tick (draw-on). No stroke draw-on / trim path, and `line`/`polygon` have no pivot for a pop.
- workaround: two small rotated rounded rects (45 and -49 degrees, centres computed by hand) that each pop in 40 ms apart, over a filled circle. Reads as a tick draw. Rotation is about the rect's own centre, so this was predictable.
- would have prevented it: a `trim` / `drawOn` property for line / path strokes.

### 4. Clock hands / gears need hand math; no per-frame rotation   [GAP]
- Static clock icon only (ring + two rects). A ticking hand would need many linear keyframes.

## Wished the library had
- Text-width expression or `measure()` helper exposed from the library.
- Stroke draw-on (trim path) for ticks, underlines and the pasta nest.
- `stagger` helper for keyframes; I wrote `at + i * gap` loops for every row, ring and sprig.
- Text content that changes over time (a timer such as `8:00 -> 0:00` is only possible because the minutes are one integer and the `:00` is constant; real mm:ss would need two counters plus zero-padding in `format`, e.g. `format: { pad: 2 }`).
- Blend modes for the plate glow / sparkles.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// self-checking list row + countdown pill. Everything on one row shares `at`; the check-off is separate layers at `ck`.
const popK = (d = 0.4, ease = 'back.out(2.2)') => ({ at: 0, from: { scale: 0 }, to: { scale: 1 }, duration: d, ease });
// strike grows from the left after the check time; width measured with canvas measureText
sequences.push({ type: 'shape', shape: 'rect', at: ck, initial: { x: 160, y, width: 0, height: 4, anchorX: 0, fillColor: '#E5472B' },
  keyframes: [{ at: 0, to: { width: measure(name, 33) + 6 }, duration: 0.28, ease: 'power3.out' }] });
// timer: '{value}:00' counts 8 -> 0 then the pill goes green and pops
{ type: 'text', text: '{value}:00', format: { decimals: 0 }, initial: { value: 8, anchorX: 0.5, anchorY: 0.5 },
  keyframes: [{ at: 0.5, to: { value: 0 }, duration: 1.5, ease: 'none' }, { at: 1.8, to: { fill: '#ffffff' }, duration: 0.2 }] }
// sticker: composition with pivot at its centre, pops/wobbles as one
{ type: 'composition', width: 80, height: 80, initial: { x, y, pivotX: 40, pivotY: 40 }, keyframes: [popK(0.5, 'back.out(2.6)')], sequences: [/* local coords */] }
```
