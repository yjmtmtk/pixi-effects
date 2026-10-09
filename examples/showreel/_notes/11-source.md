# 11-source — stumble notes
Model: fable (Claude Fable 5.1, self-reported)   Cycles: 2   Result: works

## Went smoothly because the docs said so
- `P.measureText` gave the exact mono glyph width, so the red `"type"` values are separate text layers laid over the bone line at `col × charW` and line up to the pixel (pitfall 52's "only anti-aliasing differs" held).
- Pitfall 14 ("masks live in the parent's space and do not follow the masked layer") is exactly what a scrolling wall under a fixed window needs: an inline rect mask on a composition whose `y` scrolls.
- Pitfall 37 (a composition whose whole rectangle is off the canvas is culled) made me size the wall composition to its content height before it bit; without that line the wall would have vanished mid-scroll.
- `set: { text }` on the shared caption layer (pushed onto `P.tag`'s keyframes) changes the caption at each cut without a second layer.
- `warnings none` on the first run: nothing in the cheatsheet was ambiguous for text, shapes, gradients, sfx knobs.

## Stumbles
### 1. `P.facts.lines` is a number in the check page   [SPEC-ODD]
- tried: `P.facts.lines.length > 0` as the brief suggests.   - happened: nothing yet, but `chapter.html` sets `facts = { kb: 0, layers: 0, lines: 0, excerpt: [] }` (`lines` is `0`, and `lineCount` is missing), while the built reel sets `{ kb, layers, lineCount, lines: [] }`: `0.length` is `undefined`, so the test is only safe as `Array.isArray(lines) && lines.length > 0`.
- cause: the two harnesses disagree on the sample shape.   - would have prevented it: `chapter.html` using the same empty shape as `reel.src.html` (`lineCount: 0, lines: []`).
### 2. A highlight bar drawn over the lines   [MY-MISTAKE]
- tried: the read-head rect after the wall in the array.   - happened: caught before running (an opaque bar would have hidden the line it highlights).   - cause: z-order is array order; the bar must come before the composition.   - would have prevented it: nothing; the cheatsheet says it.
### 3. `inspect` reports overlaps that a mask hides   [TOOLING]
- tried: a wall of 96 lines masked to y 140–940 under the tag (y 84) and caption (y 996).   - happened: `review: "wall/src-18" and "caption" overlap by 67%`, `"wall/src-0" and "tag" overlap 33%` (10 items), though the pictures show no overlap.   - cause: the layout check does not apply masks to text bounds.   - would have prevented it: `inspect` clipping text bounds to the layer's (or the ancestor composition's) mask.
### 4. The dimmed data behind the numbers read as clutter   [MY-MISTAKE]
- tried: wall alpha 0.25 under a 0.75 veil as "context" for the three numbers.   - happened: ghost lines competing with "1 file" in the contact sheet.   - cause: taste; the brief says flat and graphic.   - fix: veil 0.85 (a trace stays, the numbers own the frame).

## Wished the library had
- A per-token colour inside one text layer (`spans` / a tiny markup) so a syntax-coloured block is one layer, not a line plus overlays.
- The layout check aware of masks (see 3), so a masked ticker or wall does not produce a page of review items.
- `P.facts` to also carry the reel's total duration and chapter count, so the last chapter could state them without counting.
