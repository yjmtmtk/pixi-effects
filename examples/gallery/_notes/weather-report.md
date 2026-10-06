# weather-report — stumble notes
Model: sonnet   Cycles: 3 (write, fix one warning + add blendMode, export/poster)   Result: works

Piece: "Harbor City Forecast", 1280x720, 12 s. Five glass cards slide in 1.2 s apart over a sky that crossfades per day (5 stacked gradient rects), animated icons from shapes (rotating rays, drifting clouds, rain/snow loops, lightning flashes), `{value}` temperature counters, a chart whose line draws itself via a mask wipe, a summary pill. Export: MP4 1,980,264 bytes in 7.9 s. `__logs` is `[]`, `inspect` reported no issues at 8 frames.

## Went smoothly because the docs said so
- Nested `composition` per card: all internal timing starts at 0, the slide-in is one keyframe on the composition. Cloud and sun-ray groups rotate/scale about `pivotX/pivotY`.
- `{value}°` counters, `fillGradient` (linear sky, radial glows with alpha stops), mask-wipe draw-on for `path` + `polygon` area, both from the docs/notes.
- `from`+`to` with `repeat` / `yoyo` gave endless-feeling rain, snow, cloud drift and sun pulse with no per-frame code.
- Late-keyframe warning named the layer and said what to do.
- New `blendMode: 'add'` worked on glows and the lightning flash, also on a shape inside a normal composition.

## Stumbles
### 1. Keyframe past the end of a short-lived card   [MY-MISTAKE]
- tried: lightning flash list `[..., 7.4]` in card-local time for a card that lives 7.4 s.
- happened: `layer "bolt-glow": keyframes[12] starts at 7.4s, after the layer ends (duration 7.4s), so it never plays...` plus a "1 more layers" summary.
- cause: I forgot the card's duration is DURATION - at. Fixed by moving the flash to 6.9.
- would have prevented it: nothing missing; the warning was exactly right.

### 2. Dot pops locked to a linear mask wipe   [GAP]
- Chart dots must pop as the draw-on reaches them, so the wipe has to be `ease: 'none'` and the dot time computed from x. An eased draw-on would need per-frame sampled keyframes. A `strokeProgress` on path would remove both the mask and the sync maths.

### 3. Rain/snow streak that must not show before its stagger   [SPEC-ODD, small]
- `from`+`to` hold the start value from the layer start, so staggering a streak with a keyframe `at` would show it early. I staggered with the layer's own `at` instead. The new rule in the brief covers it; worth a cheatsheet line.

### 4. Sizing the summary pill from the text   [GAP]
- No sibling size in expressions; used a canvas `measureText` helper with the same font string (matched Pixi).

## Wished the library had
- `strokeProgress` (trim path) for path/polygon, with a head-point accessor.
- Text content that changes (a "Mon, Tue ..." label under one sky caption), or a `{value}` with string/enum steps.
- Group alpha semantics for nested compositions stated in dsl.md (cards fade as a group? overlapping glass children may double-blend; I could not tell).
- A looping helper without a finite `repeat` count (I compute `ceil(DURATION / period)`).
- `inspect` does not check text against glass shapes; layout was verified by eye only.

## Reusable pattern worth adding to ai/reference/recipes.md
Rain streak loop (layer start staggers, `from`+`to` repeat):
```js
const drop = (x, y0, i) => ({ type: 'shape', shape: 'rect', width: 3.5, height: 15, cornerRadius: 2, at: i * 0.13,
  initial: { x, y: y0, rotation: 14, fillColor: '#a8d6ff' },
  keyframes: [{ at: 0, from: { y: y0, x, alpha: 1 }, to: { y: y0 + 34, x: x - 8, alpha: 0 }, duration: 0.75, ease: 'power1.in', repeat: 14 }] });
```
