Model (as you know yourself): claude-haiku-5-5 (Claude Haiku 5.5)
# replay-highlight — stumble notes
Model: haiku   Cycles: 6   Result: works

## Went smoothly because the docs said so
- The rewind / replay recipe (`rewind-and-replay`) and pitfalls 69–73 were enough to build the replay: a composition whose `time` keyframes give slow motion, a freeze and normal speed; sfx inside it slowed down with the clock, as described. The freeze was right first time.
- `trimEnd` 0 → 1 on a path draws the trajectory on; `arc` with `startAngle` / `endAngle` gave the angle wedge without any tricks.
- `set: { text }` on the score worked on the first try; `movie.inspect` / `inspectAudio` / `render` ran clean.

## Stumbles
### 1. Shape colours, alpha and position must go in `initial`, not at the top level   [WRONG]
- tried: `{ shape: 'rect', rotation: 18, ... }`, `{ shape: 'path', x: 0, y: 0, ... }`, `{ shape: 'arc', x, y, fillAlpha, strokeColor, strokeWidth }` at the top level.
- happened: 9 warnings, e.g. `layer "wipe-edge": "rotation" is not a rect shape key — did you mean "at"?`, `layer "angle-arc": "strokeColor" is not a arc shape key`.
- cause: the cheatsheet's animatable list (`x y alpha rotation scale … fillColor …`, "Animatable props (`initial` / keyframes)") does not say that these are NOT top-level keys on a shape; the warning's valid-key list is the only place that shows it.
- would have prevented it: the shape line in the cheatsheet should say "position, rotation, colours, alpha and stroke go in `initial` (or keyframes); top-level on a shape are only the geometry (`width height radius d startAngle endAngle cornerRadius anchorX anchorY`), `trimStart/trimEnd`, `strokeCap/strokeJoin`".

### 2. No dashed stroke   [GAP]
- tried: a `path` with `dash`, `strokeDash`, `dashArray` (guessed).
- happened: nothing to try: the valid-key lists have no dash key.
- cause: the cheatsheet has draw-on (`trimEnd`) but no dash style, and the Draw-on paragraph does not mention dashes.
- what I did: built the path from alternating sub-paths (`M p0 L p1 M p2 L p3 …`, 30 dashes) and let `trimEnd` 0 → 1 walk them in order. It works and reads as a dashed arc.
- would have prevented it: one line under Draw-on: "Dashes: there is no dash option; write the outline as alternating sub-paths (`M a L b M c L d …`) and `trimEnd` walks them in order as dashes." Or a `dash: [on, off]` option.

### 3. What `duration` means on a composition layer   [GAP]
- tried: `{ type: 'composition', duration: 3, … }` for the live shot, then `{ …shot('replay'), at: 3.8, duration: 5.2 }` with `time` keyframes running past 3 s.
- happened: no warning; but the children without their own `duration` got 5.2 s of local life, so I had to give every child an explicit `duration`.
- cause: cheatsheet line "composition — `width height duration sequences transitions` … `duration` is always the layer's life in the outer time … the content is as long as the larger of `duration` and the farthest `time` … and children default to that length". Reading it twice, I could not tell whether a composition's `duration` is its outer life or its local content length. I took it as the outer life.
- would have prevented it: state it once: "On a composition layer `duration` is the outer life (the layer's span on the movie); children default to the local content length, which is the larger of that `duration` and the farthest `time`. Give children an explicit `duration` when the clock can run past their default."

### 4. Ball keyframes for a parabola   [GAP, minor]
- tried: an arc from one `to` keyframe.
- cause: no way to tween along a parabola except a path (`followPath`, which is constant-arc-length, not ballistic).
- what I did: sampled the ballistic formula every 0.05 s into `to` keyframes with `ease: 'none'` (30 keyframes); the composition clock then slows it correctly.
- would have prevented it: a `ballistic({ from, to, apex, duration })` helper, or a line in the recipes: "a projectile: sample x(t) = linear, y(t) = quadratic into 0.05 s linear keyframes". Works fine; it just needs writing.

## Wished the library had
- A dash option on shapes (see 2).
- Keyframes that can tween a parabola / projectile without sampling (see 4).
- `movie.inspect` could say which top-level key of a shape is wrong in the `issues` list (it only warns at build time).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// dashed path: alternating sub-paths; trimEnd walks them in order
let d = ''; for (let i = 0; i < pts.length - 1; i += 2) d += `M ${pts[i][0]} ${pts[i][1]} L ${pts[i+1][0]} ${pts[i+1][1]} `;
// { type: 'shape', shape: 'path', d, trimEnd: 0, strokeCap: 'round', initial: { strokeColor, strokeWidth: 5, fillAlpha: 0 }, keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 0.6 }] }
```
