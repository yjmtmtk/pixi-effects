# blueprint-house — stumble notes
Model: sonnet   Cycles: 4 (1 write, 3 look-and-adjust)   Result: works
Note: this piece was written by the library's own author right after adding draw-on strokes and changing text, to put them through a real piece. It is NOT a fresh-session trial: the docs were not what taught me the API.

## Went smoothly
- `trimEnd: 0` plus one keyframe `to: { trimEnd: 1 }` drew every outline on; a rect starts top-left and goes clockwise, so the walls draw like a pen would.
- `visibleChars` plus a left anchor gave a typewriter with no per-letter layers. A status line is ONE text layer whose string changes with `set: { text }`.
- A travelling dash is `from: { trimStart: 0, trimEnd: 0.1 }` to `{ trimStart: 0.9, trimEnd: 1 }`.
- A door is a `line` leaf plus an `arc` whose `endAngle` animates (0 → −90 sweeps counter-clockwise).

## Stumbles
### 1. inspect called an empty typewriter "no size"   [LIB-BUG, fixed]
- tried: `inspect` on text layers that start with `visibleChars: 0`.
- happened: `text layer "type-STATUS" has no size (empty text, or not drawn yet)` on the first frame of every typed label.
- cause: the new `visibleChars` made a layer empty on purpose and inspect did not know.
- fixed: a text layer that has typed nothing yet is skipped (`showsNothingYet`), like one scaled to 0.

### 2. Rotation is in degrees   [MY-MISTAKE]
- tried: `rotation: -Math.PI / 2` for the vertical dimension label.
- happened: the label stayed horizontal (−1.57° is nothing).
- cause: the DSL's angles are degrees (the cheatsheet says so); I wrote radians.
- would have prevented it: nothing missing; a habit from Pixi itself.

### 3. A chime cut off by the end of the movie   [MY-MISTAKE]
- `inspectAudio` said `sfx "chime" is cut off by the end of the movie` (it lasts 1.4 s). Moved the APPROVED moment and the chime earlier.

### 4. A stale `dist/` hid the new keys   [PROCESS]
- the page imports `../../dist/index.js`; before `npm run build` the check printed `Invalid property trimEnd` and `expression failed: Go!` (a `set: { text }` going through the expression parser). Rebuild first.
