# spring-marquee — stumble notes
Model: opus   Cycles: 6   Result: works

## Went smoothly because the docs said so
- Spring easing: `ease: 'spring.snappy' | 'spring.bouncy' | 'spring.wobbly' | 'spring.gentle'` with `duration: 'auto'` on plain keyframes worked first try, no warnings. Four presets, four materials: bulbs (snappy, glass), letters (bouncy, y + tilt), the ticket on its string (wobbly, rotation about `pivotX/pivotY`), the small print and the final halo swell (gentle). The `spring-pop` recipe and pitfall 65 were enough.
- `grain` on the root `composition: { filters: [{ type: 'grain', amount, size, color, fps, seed }] }` worked first try; the cheatsheet line ("NOT noise") stopped me from reaching for `noise` or a hand-rolled dot texture (which `film-titles` had to do).
- `window.__logs` was `[]` from the first run: no unknown-key or ease warnings at all.
- `splitText` + `measureText` for the per-letter title (shrink-to-fit loop on `measureText(...).width`), `trimEnd` draw-on rules, radial `fillGradient` halos with `blendMode: 'add'`, a `music` score whose last chord is placed on the final flash (beat 12 at 96 bpm), `check --at` / `--onion` for the letter wave and the ticket swing.
- Export: `movie.render({ format: 'mp4' })` 14.0 MB in 7.7 s in the page; `check` export 13.39 MB, 11.03 s, audio −19.9 LUFS, peak −4.9 dBFS.

## Stumbles
### 1. A letter fully hidden by its mask on its first frame is reported "has no size"   [SPEC-ODD]
- tried: letters drop from `cy - 160` into a panel-sized mask, so on their first frame they are entirely above the mask.
- happened: `check` failed: `text layer "letter-7" has no size (empty text, or not drawn yet)  [frame 90]` (only the letter whose first frame fell on a sampled frame).
- cause: inspect treats "clipped to nothing by its mask" like "empty text".
- worked around: drop from `cy - 150`, so a few pixels of the line box (below the glyphs) stay inside the mask; looks identical.
- would have prevented it: inspect should say "fully masked" (or skip it) instead of "no size", the way it already skips text scaled to 0.

### 2. Text in a rotating composition is reported as overlapping   [SPEC-ODD]
- happened: review: `text layers "ticket/admit-one" and "ticket/stub-no" overlap by 80% of the smaller one  [3 frames, 135–150]` while the ticket swings (rotation ≈ −60°). The two lines never touch on screen.
- cause: overlaps seem to be judged on axis-aligned bounds, which grow a lot when the parent is rotated.
- would have prevented it: judge rotated text by its rotated rectangle, or skip text whose parent is rotating (like moving tickers).

### 3. How long is `duration: 'auto'`?   [GAP]
- tried: to schedule the next beat after the ticket settles I needed the settle time of `spring.wobbly` (and of snappy / bouncy / gentle).
- happened: no table anywhere; I guessed and checked with `--onion`.
- would have prevented it: a line in the cheatsheet with each preset's settle time and overshoot ("snappy ≈ 0.5 s, 5 %; bouncy ≈ 1 s, 25 % …"), or a helper `springDuration('spring.wobbly')` to compute the next `at`.

### 4. Grain costs a lot of bitrate, and there is no number   [GAP]
- happened: 11 s of 720p → 13.4–14.0 MB (≈ 10 Mbps) with `amount: 0.045, fps: 24`. The docs only say "it costs video bitrate".
- would have prevented it: one measured example in the doc (with / without grain) and the lever (lower `fps`, larger `size`, or a `bitrate` option on render).

### 5. `splitText` pieces have no height   [GAP, small]
- to rotate each letter about its centre I needed `anchorX/Y: 0.5`, so `x + width / 2` and `y + height / 2`; the pieces give `width` but not `height`, so I called `measureText(...).height` separately.
- would have prevented it: a `height` (line height) on each piece.

### 6. Brief vs library on music   [SPEC-ODD]
- BRIEF says "music only from bgm.mp3"; the library now has file-free `music` scores (AGENTS.md advertises them). I used a `music` score (self-contained, no file). The brief could say so.

## Wished the library had
- A warm-tinted grain (`tint` / colour of the grain), and a "spring to here" helper that returns the settle time.
- `inspect` that understands masks and rotation (see 1 and 2).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// a spring offset without touching the layout: the null springs y from +22 to 0, the child keeps plain absolute numbers
const detail = (name, at, layer) => [
  { type: 'null', name, at, initial: { x: 174, y: 0 }, keyframes: [
    { at: 0, from: { y: 22 }, to: { y: 0 }, duration: 'auto', ease: 'spring.gentle' },
    { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.45, ease: 'power2.out' } ] },
  { ...layer, parent: name, at },
];
// marquee chase: one bulb in three dimmed, the pattern walking clockwise every `step` s
const chaseKeys = (i, from, to, step, lit, dim) => { const keys = []; let prev = lit;
  for (let k = 0; k < Math.round((to - from) / step); k++) { const v = ((i - k) % 3 + 3) % 3 === 0 ? dim : lit;
    if (v !== prev) keys.push({ at: from + k * step, to: { alpha: v }, duration: 0.06 }); prev = v; }
  if (prev !== lit) keys.push({ at: to, to: { alpha: lit }, duration: 0.05 }); return keys; };
```
