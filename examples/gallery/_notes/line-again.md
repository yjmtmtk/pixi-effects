# line-again - canvas trial notes
Model: opus (Opus 5.5)   Slot: C7 (kinetic typography the text layers cannot do)   Cycles: 9 check runs I looked at (+4 blind bisect runs)   Result: works
Timeline: started 05:51 JST; first page rendered and first sheet looked at 05:56 (+5 min; all five canvas beats drew on the first try); determinism bisect ~05:57–05:59; melt tuned in 4 cycles; final check + export 06:02 (+11 min). Wall clock is from `date`, so it is right; it felt longer.

Piece: 13.5 s, 1280x720, 30 fps, 5 full-frame `canvas` layers (one per beat), backgrounds and the beat labels / colophon are normal shape and text layers, music is `music` (pad, bell, bass at 96 bpm, a bar = 2.5 s = one beat of the poem). Export: line-again.mp4, 3.93 MB, rendered in 14.8 s. `check`: no warnings, canvas determinism OK, -14.8 LUFS, -3.7 dBTP.

## Log
- Cycle 1 (05:56): everything drew, no warnings. Defects I saw: (a) beat 4 "光 / LIGHT" showed no texture at all; (b) the melt read as "taller type", not melting, and the knee where the stretch began was a visible kink; (c) the English ripple line of beat 3 grew upward into the Japanese line above it.
- (a) was my bug: two `fillText` calls under `destination-in` intersect (the second erases everything outside itself, the first word included). Fixed by drawing both words once into a mask canvas in `setup`.
- Then `check` said the light layer is NOT deterministic ("checked at 0.375 s: drawn twice, in two orders ... its draw uses Math.random, Date.now or state that outlives the call"). My draw had neither. Bisected with a `?dbg=` flag and `check --query` (4 runs): the 96 stroked wave paths alone pass, the mask alone passes, the waves THEN `destination-in` + `drawImage(setupCanvas)` fail. Rewrote it as mask first, then `source-atop` for the texture: passes. I cannot tell whether the two pictures really differed (a Chrome raster-path difference?) or the comparison is over-strict; the message's diagnosis was certainly wrong for this case.
- (b) melt, 3 cycles: 2 px columns with a hard knee -> 7 slices per column on a pow-3 sag curve (the top holds, the bottom pulls); drip profile "sum of gaussian bumps" (an even stretch) -> "max of bumps" (separate drops, looked like icicles) -> 0.28 base + 0.72 x max (everything sags a little, the drops a lot); 1 px columns (1280 x 7 drawImage per frame) removed the comb on the drip edges, judged with `--crop`. No measurable slowdown (export 14.8 s for 13.5 s).
- (c) moved the lines and capped the ripple.
- Round-2 look (export frames pulled with ffmpeg at every cut ±0.05 s, and `--crop` on beat 5): the contour layering of 立つ reads as layers, the cuts are clean; made the vermilion outer contour proportional to the weight (it was a sticker outline on the English), raised the music to -14.8 LUFS.

## Wishes for `draw` / `info` / the canvas layer

### An offscreen canvas / sprite in `setup`, said to be allowed   [DOC | MISSING-CTX]
- wanted: to render a word once (for the melt sprite and the light mask) and draw it back every frame.
- tried / did instead: `document.createElement('canvas')` inside `setup`, kept in `info.state`; works and is deterministic, but nothing in `help canvas` says that is fine or that it survives export (I assumed it from "setup = heavy preparation"). 6 lines of helper.
- would have prevented it: a doc line + recipe "make sprites / masks in setup: `const c = info.canvas(w, h)`" (a helper that returns a canvas with the layer's resolution would also get HiDPI right).

### A 2D context in `setup` (to measure text)   [MISSING-CTX]
- wanted: `measureText` once at build (glyph advances for the spiral, glyph x positions for per-glyph transforms).
- tried / did instead: a throwaway 8x8 canvas in `setup` for the spiral; for the other beats I re-measure every frame (`glyphXs` = prefix widths, so kerning is kept). Cheap, but every type piece needs it.
- would have prevented it: `setup(info)` getting `info.ctx` (a scratch context of the layer's size), or an `info.measureText(str, font)` that caches.

### Easing and "local progress" inside draw   [MISSING-INFO]
- wanted: the library's own ease names (`power3.out`, `back.out`, `cubic-bezier(...)`) and a `progress between a and b` for per-glyph staggering, which `params` cannot give (params are scalars; a 30-glyph stagger needs 30 curves).
- tried / did instead: wrote `clamp01`, `seg(t, a, b)`, `out3`, `in2`, `inOut`, `outBack` (8 lines) and used `t` directly: I never used `params` or keyframes at all in this piece, because per-glyph timing does not fit them.
- would have prevented it: `info.ease(name, x)` (or `import { ease } from 'pixi-effects'`) and `info.seg(a, b, ease?)` returning the eased 0..1 of `t` between a and b; or a `stagger` helper that returns per-index progress.

### Text on a path   [MISSING-LAYER-FEATURE | helper]
- wanted: a string set along a curve (the spiral), each glyph placed at its arc length and rotated to the tangent.
- tried / did instead: ~30 lines: a log spiral where size ∝ radius makes the advance per glyph a constant angle (my trick, not general); a general path needs arc-length sampling of a polyline, which I avoided.
- would have prevented it: `textOnPath(ctx, text, path, { offset, sizeAt })` as a canvas helper (or as the text layer feature the earlier probe already ranked cheapest). Every kinetic-type piece would use it.

### The determinism report should say what differed   [CONTRACT | OTHER]
- wanted: to know whether my light layer was really non-deterministic, and where.
- tried / did instead: 4 bisect runs (~3 min) with a `?dbg=` query; changed the composite order until it passed. The message blamed Math.random / kept state, which I did not have.
- would have prevented it: the report giving the number of differing pixels, the max channel difference and a small diff image (`canvas-<name>-diff.png`); and the message adding "or a rasterisation difference: composite operations after many paths can draw differently in two orders; try a different composite order" if that is what it was. A tolerance of 1/255 if it was tiny.

### Layout check is blind to text drawn in a canvas   [MISSING-LAYER-FEATURE]
- wanted: the usual "text collides / is cut" review for my canvas-drawn type: the melt drips reached the Japanese line, the spiral runs under the beat label. `check` said "no cut-off / off-canvas text" — true for the text layers only.
- tried / did instead: judged by eye on frames and crops.
- would have prevented it: an optional `info.boxes.push({ x, y, w, h, label })` (or a `textBoxes(t)` key) whose rectangles `inspect` treats like text layers; at least a doc line "check does not see text drawn in a canvas".

### Composite-op masks: a doc line   [DOC]
- wanted: "type as a window onto a moving texture" in one canvas.
- tried / did instead: my first version used two `fillText` under `destination-in` (they intersect). Mask-first + `source-atop` is the robust pattern.
- would have prevented it: a 6-line recipe `canvas-text-mask` (mask once in setup, `source-atop` the texture), which also sidesteps the determinism report above.

### Not hit, but would matter next time
- Web fonts: a `setup` that measures or rasterises text needs the font loaded first; with system fonts it did not matter. A doc line ("await document.fonts.load(font) in setup") would cover it.
- I did not need the layer's stage position, the movie time, audio data or other layers' values: one full-frame canvas per beat placed at its `at` made `t` enough. A piece with the type moving to the music would have wanted the beat times inside draw (I would compute them from `musicEvents`).

### Went well
- The contract is clear and short; all five beats drew correctly on the first run. Writing per-glyph `setTransform` code is exactly as easy as in a plain page.
- `info.random()` inside `setup` is seeded (the drip profile is the same in every run and in the export).
- `check` really runs the canvas determinism check, and `--query` made bisecting easy; `--crop` was decisive for the drip edges.
- Speed: 1280 x 7 drawImage calls + ~250 transformed glyphs per frame rendered 13.5 s in 14.8 s.

### Docs wrong or missing
- `help canvas` / recipes: no text example at all (measureText, per-glyph transform, text on a path) although kinetic type is the obvious use; no offscreen-canvas-in-setup example; no composite-op mask example.
- SKILL.md's first line says "You never write per-frame code", which the canvas section then contradicts; a word ("except in a `canvas` layer") would help.
- The non-determinism message gives one cause (Math.random / kept state) as if certain.

## The usual usability notes (3 most important stumbles with the library at large)
1. The canvas non-determinism report with a wrong cause and no diff (above): the only real time sink.
2. `check`'s layout line ("no cut-off / off-canvas text") reads as a clean bill of health while it cannot see canvas text; in a type piece all the type is canvas.
3. Small: `--at 7.45` writes `frames/7.45s.png` while the sheet labels it `frame 224 · 7.47s`; `at.png` and `frames/` are overwritten every run, so comparing two iterations needs a copy (or an `--out` per run).

## Self-critique
Round 1 (after the first sheet): the light beat was empty (fixed); the melt looked like stretched type (fixed with separate drops and a held top); the ripple collided with the Japanese line (fixed).
Round 2 (final): (1) the beat labels sit on top of the spiral's huge outer glyphs at 2.5–5 s (legible, but a collision I let stand); (2) frame 0 is an empty sheet of paper for ~0.2 s before the first stroke shows: a breath, but the poster carries the thumbnail; (3) beat 4's LIGHT in Arial Black is a second typeface for one word and its texture is busier than 光's; with more cycles I would set it in the same Mincho or drop it and let 光 carry the beat; (4) only hard cuts: a canvas-drawn transition (the last stroke of one beat becoming the first of the next) would make it read as one poem rather than five cards.
