# data-story — stumble notes
Model: fable   Cycles: 2   Result: works

Piece: "Cities at night" — editorial data story, 1280×720, 14 s. Three beats (horizontal bar chart → self-drawing two-line chart → ring breakdown) plus a takeaway, inside one persistent header system. Everything is generated from three JS arrays (`CITIES`, `LAGOS`/`LONDON`, `SEGS`). First run had `__logs: []` and zero `inspect` issues; cycle 2 was only layout polish (bigger ring, wider bar rows). Export: MP4 979,493 bytes in 8 s.

## Went smoothly because the docs said so
- Keyframe `at` is layer-local → each beat is a nested `composition` with `at`/`duration`, and all its internal timing starts at 0. Enter/exit keyframes on the composition move the whole beat as a unit (`from {alpha:0,y:14}` / `at:-0.35 to {alpha:0,y:-10}`) — one consistent transition language for free.
- Bar + counter locked by giving both the *same* `to` tween (`at`, `duration`, `ease`) — straight from the bar-chart recipe; `anchorX: 0` for bars growing rightwards.
- Mask reveal: the mask lives in the parent's coordinates, `anchorX: 0` + `width` keyframe. Worked first time for the line chart.
- `line`/`polygon` in plain canvas coordinates, `strokeColor`/`strokeWidth` in `initial`; `rotation` in degrees; `fillGradient` radial with alpha stops for the amber "horizon glow"; `'GW/2 - w/2'` to centre a left-anchored title that later slides into the header.
- `snap()` (frame-grid rounding) for every schedule that must line up (ring slivers, bar stagger).
- `contactSheet({ times, columns, cellWidth })` + `inspect(frame, { layers: 'none' })` + `save-image.py` — the whole review loop needed no OS screenshots. Named layers made inspect output readable.
- Local-build importmap swap (`../../dist/…`) exactly as the brief says.

## Stumbles
### 1. No way to draw a leader line that "draws itself"   [GAP]
- tried: looked for an animatable `to` on `line` / animatable `points` on `polygon` for annotation leaders.
- happened: nothing (dsl.md says array geometry is baked at build time). No warning, just no feature.
- cause: line endpoints are not animatable.
- would have prevented it: a recipe "leader line / callout that draws on" — the workaround is tiny but non-obvious: a 1.5-px-high `rect`, `anchorX: 0, anchorY: 0.5`, `rotation: angle`, `width: 0 → length`. Pasted below.

### 2. No arc / ring shape, so the donut is 120 polygons   [GAP]
- tried: an arc primitive with `startAngle`/`endAngle` (would have been one layer per segment, animatable sweep).
- happened: not in the DSL; `polygon.points` cannot be tweened either.
- cause: missing primitive.
- would have prevented it: `shape: 'arc'` with animatable `startAngle/endAngle/innerRadius/radius` (a progress ring, a donut, a pie — all common in data pieces). Workaround: sample each segment into 3° sliver polygons (overlap 0.5° so there are no seams), each sliver `at: snap(t0 + sweep * angle/360)` with a 2-frame alpha fade. Looks smooth, but it is 120 layers for one chart.

### 3. "Line that draws itself" needs a mask + a per-frame head dot kept in sync by hand   [GAP]
- tried: the obvious mask-wipe; then wanted a dot riding the line's head.
- happened: the mask edge is linear in x, so the head dot's x is linear in time too, but its y must be sampled from the data: 46 `set` keyframes per dot (one per frame). Worked, but the mask had to start 5 px left of the plot so the stroke cap is not clipped, which means the mask edge and the dot differ by up to ±5 px (hidden by the dot radius). Had to reason about that rather than read it.
- cause: no draw-on progress for polyline/path.
- would have prevented it: an animatable `progress` (0–1) on `polygon`/`path` strokes (like SVG `stroke-dashoffset`), ideally exposing the head point.

### 4. `from` keyframes do not hold their start value before `at`   [GAP — docs]
- tried: `keyframes: [{ at: 2, from: { alpha: 0 }, to: { alpha: 1 } }]` on a layer alive from 0.
- happened: (anticipated from "a layer keeps its last values", so I set `initial.alpha = 0` everywhere via a `reveal()` helper, and nothing flashed) — but nothing in the cheatsheet says it outright, and it is the first thing a newcomer will hit when an annotation should appear mid-scene.
- would have prevented it: one cheatsheet line: "a `from` value applies only from the keyframe's `at`; a layer that must be invisible before that needs `initial: { alpha: 0 }` (or its own layer `at`)."

### 5. Positioning next to another layer's text means guessing its width   [GAP]
- tried: a legend (dot + word) and a label row sized from the text.
- happened: no sibling `w` in expressions, so dot positions are `x - n.length * 7.7 - 12` — hand-measured, checked on a snapshot.
- would have prevented it: a layout helper (a `row` composition that stacks children with a gap), or at least a documented glyph-width table per system font stack. The pitfalls' "~0.58 × fontSize" is monospace-ish; for `system-ui` at 14 px, 0.55 was right.

### 6. Composition alpha: group or per-child?   [GAP — docs]
- tried: fading a whole beat composition in/out.
- happened: fine here because nothing inside overlaps; I could not find whether a nested composition's `alpha` is a group alpha (rendered to a texture) or multiplied into each child (overlapping children double-blend during the fade). `threeD: true` compositions are documented as one texture; plain ones are not.
- would have prevented it: a sentence in `composition` docs.

### 7. Static server drops `.html` from the URL   [TOOLING — trivial]
- `agent-browser open …/data-story.html` printed `…/data-story`; the page loaded fine. Already in pitfalls 30c; worth leaving there.

## Wished the library had
- `shape: 'arc'` (animatable angles) — rings, pies, progress arcs.
- Stroke draw-on `progress` for `polygon` / `path`, with the head point available (`headX`/`headY`).
- A leader / callout primitive (`{ type: 'callout', from: [x,y], elbow, to, text }`) that draws itself.
- Sibling-size expressions or a simple `row`/`stack` layout composition.
- A documented group-alpha for nested compositions (or `cacheAsTexture: true`).
- A `stagger` helper for arrays of specs (`stagger(specs, 0.09)`), to replace `at: snap(t0 + i * step)` boilerplate.

## Reusable pattern worth adding to ai/reference/recipes.md
Leader line that draws itself (a rotated rect growing in width), an elbow is two of them:

```js
// @recipe leader-line
const leader = (x, y, angle, length, at, dur = 0.3, color = '#f5b545') => ({
  type: 'shape', shape: 'rect', width: 0, height: 1.5, anchorX: 0, anchorY: 0.5,
  initial: { x, y, rotation: angle, fillColor: color },
  keyframes: [{ at, to: { width: length }, duration: dur, ease: 'power2.out' }],
});
return [
  { type: 'text', text: '2.6× the glow of London', style: { fontSize: 28, fill: '#f5b545' }, initial: { x: 900, y: 200, anchorY: 0.5 } },
  leader(886, 220, 90, 300, 0.2),      // down from the note
  leader(886, 520, 180, 360, 0.5),     // then left to the thing it points at
  { type: 'shape', shape: 'circle', radius: 4, initial: { x: 526, y: 520, fillColor: '#f5b545', scale: 0 },
    keyframes: [{ at: 0.8, to: { scale: 1 }, duration: 0.3, ease: 'back.out(2)' }] },
];
```

Ring / donut from sampled arc slivers that sweep in on a frame-snapped schedule:

```js
// @recipe ring-sweep
const SEGS = [['Streets', 41, '#f5b545'], ['Commercial', 26, '#ece6d8'], ['Homes', 18, '#a4acc0'], ['Industry', 10, '#5e687f'], ['Transport', 5, '#39415a']];
const CX = 640, CY = 400, RO = 160, RI = 110, GAP = 1.5, STEP = 3, T0 = 0.3, SWEEP = 1.4, FPS = 30;
const snap = t => Math.round(t * FPS) / FPS, rad = a => (a - 90) * Math.PI / 180;   // 0° = 12 o'clock, clockwise
const arc = (a0, a1) => {
  const pts = [];
  for (let k = 0; k <= 3; k++) { const a = rad(a0 + (a1 - a0) * k / 3); pts.push([CX + RO * Math.cos(a), CY + RO * Math.sin(a)]); }
  for (let k = 3; k >= 0; k--) { const a = rad(a0 + (a1 - a0) * k / 3); pts.push([CX + RI * Math.cos(a), CY + RI * Math.sin(a)]); }
  return pts;
};
const sequences = [];
let cum = 0;
for (const [label, pct, color] of SEGS) {
  const start = cum * 3.6 + GAP, end = (cum + pct) * 3.6 - GAP, n = Math.ceil((end - start) / STEP), sw = (end - start) / n;
  for (let j = 0; j < n; j++) {
    const a0 = start + j * sw;
    sequences.push({ type: 'shape', shape: 'polygon', points: arc(a0, Math.min(end, a0 + sw + 0.5)), at: snap(T0 + SWEEP * a0 / 360),
      initial: { fillColor: color, alpha: 0 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 2 / FPS }] });
  }
  cum += pct;
}
sequences.push({ type: 'text', text: '{value}%', style: { fontSize: 60, fontFamily: 'Georgia, serif', fill: '#f5b545' },
  initial: { x: CX, y: CY, anchorX: 0.5, anchorY: 0.5, value: 0 },
  keyframes: [{ at: T0, to: { value: SEGS[0][1] }, duration: snap(SWEEP * SEGS[0][1] / 100), ease: 'none' }] });   // linear like the sweep => lands as the first segment closes
return sequences;
```
