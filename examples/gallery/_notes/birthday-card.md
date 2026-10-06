# birthday-card — stumble notes
Model: sonnet   Cycles: 4 (1 write, 3 look-and-fix)   Result: works

12 s, 1280x720 @ 30 fps, ~560 layers (balloons / tiers / candles are small compositions). `__logs` = `[]`. MP4 export 3.2 MB in 9.9 s (faster than real time), audio included.

## Went smoothly because the docs said so
- Composition with `pivotX/pivotY` at the END of a balloon's string: rotating it sways the whole tethered balloon (string + body) with one keyframe. Same trick for candles (pivot at base, `scaleY` grow) and cake tiers (bounce.out drop).
- Layer-local keyframe `at`, negative `at` for fades, `repeat`/`yoyo` with the "total = duration x (repeat+1)" rule for sways, bobs, flutter.
- Seeded `rnd()` recipe for ~170 confetti pieces; `fillGradient` radial with alpha for the spotlight, flame glow and bokeh.
- Omitting `duration` on one-shot sfx just worked; `bgm` with `loop: true` + volume keyframes (fade in / out via negative `at`) worked.
- `blendMode: 'add'` (new in dist) on the flame glow: worked first time, warm light accumulates over the dimmed scene exactly as wanted.

## Stumbles
### 1. Any string inside `style` is evaluated as an expression   [LIBRARY-BUG / GAP]
- tried: `style: { stroke: { color, width, join: 'round' } }` for a rounded outline on letters.
- happened: 20 warnings `pixi-effects: expression failed: round undefined variable: round` (one per text layer). `lineJoin: 'round'` at the top level of `style` behaves the same.
- cause: `style` string values that are not colours / font names seem to go through the expression parser; 'round' is read as a function name.
- would have prevented it: skip the expression parser for non-numeric-looking style fields (`join`, `lineJoin`, `cap`, `align`), or document "only numbers in style take expressions; line joins cannot be set". Workaround: I left the default join (result looks fine at stroke width 0.13 x fontSize, no visible spikes).

### 2. `inspect` floods overlap warnings for per-letter text   [SPEC-ODD]
- tried: "Happy Birthday, Mika!" as one text layer per letter (no text animator), with stroke + dropShadow + `padding: 24`.
- happened: 20-30 lines like `text layers "L-B6-98" and "L-i7-98" overlap by 33% of the smaller one` at every frame after 8.2 s, although the snapshot is clean and nothing touches.
- cause: bounds include `padding`, stroke and shadow, and neighbouring letters' boxes overlap by design.
- would have prevented it: measure overlap on the glyph ink (or without `padding`), or let a layer opt out (`inspect: false`), or add a per-line grouping. I judged the title by `snapshot` instead.

### 3. Letter positions need font metrics by hand   [GAP]
- tried: bounce-in letter by letter with proportional (rounded) font.
- happened: no way to ask the library for glyph advances; the recipe only covers monospace (0.6 x size).
- cause: no text splitter / per-letter animator.
- would have prevented it: a `splitText` helper, or a doc line: "measure with `canvas.getContext('2d').measureText(prefix).width` using the same font string, position each letter at centre = x0 + prefixWidth + w/2 with `anchorX: 0.5`" (that is what I did; worked, only needed a small extra letter-spacing for the stroke).

### 4. Rotation / scale pivot for shapes is the anchor, not documented   [GAP]
- tried: flame = ellipse with `anchorY: 1` so `scaleY` grows from the base and `rotation` leans from the base.
- happened: worked (first try), but I only knew by guessing that rotation/scale are about the anchor for shapes.
- would have prevented it: one cheatsheet line "scale and rotation pivot on the anchor for shapes".

### 5. `path` fill when open   [GAP]
- tried: balloon string as a `path` with `fillAlpha: 0` and stroke in `initial`.
- happened: worked; I added `fillAlpha: 0` pre-emptively because it was not stated whether an open `path` is filled.
- would have prevented it: state it in the shape table (path: "filled unless `fillAlpha: 0`").

### 6. `agent-browser eval` times out on `movie.render`   [TOOLING]
- tried: `eval "(async()=>{ const b = await movie.render({format:'mp4'}); ... })()"` in one call.
- happened: "Operation timed out" at ~25 s. Fixed by storing the result on `window.__r`, starting the render un-awaited and polling.
- would have prevented it: a line in pitfalls #8 with that start-then-poll pattern.

## Wished the library had
- Text animators / `splitText` (letter by letter), and stroke `join` that works.
- Particle emitter with gravity (I simulated each piece as 2 tweens: `power2.out` up, `power1.in` down, plus a `scaleY` yoyo for the flutter).
- A `teardrop`/arc shape for flames (used an ellipse).
- Per-layer `inspect: false` opt out.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// Tethered balloon = a composition whose pivot is the END of the string; rotate it to sway the whole thing.
const balloon = ({ x, yEnd, s, L, color, at, rise }) => ({
  type: 'composition', at, width: 220, height: 200 + L,
  initial: { x, y: yEnd + 640, pivotX: 110, pivotY: 190 + L, scale: s, rotation: -5 },
  keyframes: [
    { at: 0, to: { y: yEnd }, duration: rise, ease: 'power2.out' },
    { at: 0, to: { rotation: 5 }, duration: 2.2, ease: 'sine.inOut', repeat: 5, yoyo: true },
  ],
  sequences: [
    { type: 'shape', shape: 'path', d: `M110 192 Q96 ${190 + L * .35} 110 ${190 + L * .6} T110 ${190 + L}`, initial: { strokeColor: '#9a8cc0', strokeWidth: 2.5, fillAlpha: 0 } },
    { type: 'shape', shape: 'ellipse', radiusX: 62, radiusY: 76, initial: { x: 110, y: 110, fillColor: color } },
  ],
});
// Letters with real font metrics:
const m = document.createElement('canvas').getContext('2d'); m.font = `bold ${size}px ${FONT}`;
const cx = x0 + m.measureText(str.slice(0, i)).width + m.measureText(ch).width / 2;   // anchorX: 0.5
```
