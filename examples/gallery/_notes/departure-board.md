Model (as you know yourself): claude-haiku-5-5 (Haiku 5.5)
# departure-board — stumble notes
Model: haiku   Cycles: 9   Result: works

Piece: `examples/gallery/departure-board.html` — 720×1280 (vertical), 12 s, 30 fps, poster 10 s. Export: MP4 1,022,368 bytes in 6.8 s. `window.__logs` `[]` on every load; `movie.inspect` no issues at frames 30/120/186/255/330/350; `inspectFonts()` clean; `inspectAudio()` issues `[]`, true peak −6.5 dBFS, no clipping, integrated −24 LUFS. About 490 layers (448 for the 224 flap cells, tile + character each; 10 for the clock; 12 for housing / labels / title; 23 sound effects).

## Went smoothly because the docs said so
- `set: { text }` in a keyframe with the flip done as `to: { scaleY: 0 }` → `set` at the midpoint → `to: { scaleY: 1 }`: the split-flap reads on the first try. `scaleY` on a text layer with `anchorX/anchorY: 0.5` flips in place.
- `random(seed)` returns a repeatable function: `const rnd = random(42)`; no Math.random anywhere.
- `shape: 'rect'` with `fillGradient` `{ angle: 90, stops }` gives the flap tile with a darker centre line in one layer (no second rect).
- `sfx: 'click' | 'chime' | 'riser' | 'hit'` with no files; `riser` with `duration` and `pitch`.
- `shape: 'line'` + `trimEnd` for the amber rule; `{ type: 'null', keyframes: scale }` + `parent` for the platform digit that grows to 1.7 while its own flaps still flip.

## Stumbles
### 1. `movie.inspect()` result: read `.issues` (I misread it at first)   [MY-MISTAKE]
- tried: `movie.inspect(120, { layers: 'none' }).issues`, then `JSON.stringify(...)` of the result.
- happened: my first reading was `undefined`; I then wrote the result as an array. The correct shape is an object: `{ frame, time, canvas, summary, issues, layers }`; `issues` is an array of strings (`await movie.inspect(f).issues`).
- cause: I printed `Object.keys` of a result with `layers: 'none'` and an empty issue list, and misread it.
- would have prevented it: nothing new: the docs already say "plus `issues`"; a sample line `const { issues } = await movie.inspect(frame)` in the cheatsheet would have settled it.

### 2. `sfx` volume: a sparse sound track measures very quiet   [SPEC-ODD]
- tried: row clicks at `volume: 0.5`, chime 0.45, riser 0.5 (the defaults the cheatsheet suggests for a "soft" mix).
- happened: `inspectAudio().loudness.integratedLufs` −32.4 (advice: "the mix is quiet for web video: −32.4 LUFS (typical −14 to −16)"); after raising to 1–2 it is −24 LUFS with true peak −6.5 dBFS.
- cause: the cheatsheet says "`volume` is its level (1 = the preset's standard level, peaking at −12 … −18 dBFS by preset)" — so 0.5 is a −6 dB sound; a 12 s piece with 23 short sounds averages very low.
- would have prevented it: say whether `volume` above 1 is allowed (it is: 2 works), and that a sparse click track needs ≈ 2 to reach −24 LUFS; or a note in `inspectAudio` that the integrated figure is over the whole duration including silences.

### 3. Japanese column headers collided with the English ones   [MY-MISTAKE]
- tried: `DESTINATION 行先` at x 262 and `STATUS 状況` at x 424, 16 px monospace with `letterSpacing: 1`.
- happened: the two labels ran into each other on the contact sheet. `inspect` did not flag it (text vs text overlap is in `review`, not `issues`; `review()` returned `null` for my `at` list).
- cause: I estimated 0.6 × fontSize per glyph, which is too narrow for the mixed Latin + CJK string.
- would have prevented it: `review()` is described in the cheatsheet as the list of text overlaps, but in my run `movie.review({ at: ... }).problems` was `null`; my fix was to shorten the label to `DEST 行先`. (Text-on-text overlap was visible only in the contact sheet.)

### 4. A contact-sheet dataURL cut short by my own slice   [MY-MISTAKE]
- tried: `.slice(0, 40000)` on the dataURL in the `eval` before piping to `save-image.py`.
- happened: `binascii.Error: Incorrect padding`; a stale PNG from another session stayed on disk and looked like a result (its timestamp gave it away).
- would have prevented it: nothing in the docs; just do not slice.

### 5. The lock-up has no camera move   [GAP, deliberate]
- tried: a `camera` layer or a `null` pivot scale around the hero row to "move the camera to the last row".
- happened: I did not implement it: the emphasis (other rows dim to 0.35, the platform null grows, the amber rule draws on) carries the beat. The null-with-pivot scale needs the children measured from the null origin; not verified for a full-board zoom.
- would have prevented it: one sentence in the recipes: "to zoom a group about a point: a `null` at that point, children at offsets from it, `scale` keyframes on the null (pivot = null origin)."

## Wished the library had
- `set` on a `text` layer's `scaleY` at the midpoint is the whole flap; a `flip` helper (`flip(steps, { close, open, ease })` → keyframes) would make a flip board three lines.
- A way to draw text on a single layer with per-character tiles without one layer per character (the board needs 224 cells).
- `review()` results to name the overlapping pair in the same way `inspect` names the cut-off text.

## Reusable pattern worth adding to ai/reference/recipes.md (optional)
```js
// one flap: close, swap at the midpoint, open
function flip(c, start, steps) {
  steps.forEach((ch, i) => {
    const t = start + i * 0.11;
    c.keys.push({ at: t, to: { scaleY: 0 }, duration: 0.05, ease: 'power1.in' });
    c.keys.push({ at: t + 0.05, set: { text: ch } });
    c.keys.push({ at: t + 0.05, to: { scaleY: 1 }, duration: 0.06, ease: 'power1.out' });
  });
}
// tile (shape rect, fillGradient with a dark centre line) and text layer share the same keys; the tile ignores `set`.
```

## Fix after the coordinator's check (empty-text problem)
### 6. "text layer has no size (empty text, or not drawn yet)" at single frames   [LIBRARY-BUG or SPEC-ODD]
- tried: a zero-width space as the blank flap (`'\u200b'`): many more warnings (every blank cell at every frame); reverted.
- happened: `char-r4-ja2` at frame 53 (and ~10 other cells at a few frames), only mid-flip.
- cause: the flip closes `scaleY` to 0; the text then has zero height at that frame, which inspect reads as "no size". A plain space is fine on its own.
- fix: the flip closes to `scaleY: 0.2` (a sliver) instead of 0. Looks the same; a full sweep of frames 0-359 gives no issues.
- would have prevented it: the docs could say that inspect treats a zero-size text (scale 0) as empty, so keyframes should not scale a text to exactly 0.

