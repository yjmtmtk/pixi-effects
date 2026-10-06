# aurora-logo — stumble notes
Model: fable   Cycles: 2 (run → one batch of fixes → run; a third run only for inspect / export / poster)   Result: works

## Went smoothly because the docs said so
- Keyframe `at` is layer-local, layer `at` is composition time: the cheatsheet table made the whole timeline a list of constants (`T = { hair, rise, … }`).
- "Masks live in the parent's coordinates and don't follow the masked layer" is exactly what a sunrise needs: a static rect above the
  horizon as the mask, the disc moving underneath it. Read the rule, used it on purpose. No retry.
- `fillGradient` positions are 0–1 of the shape's own bounds, stops may carry alpha: the glint (transparent → white → transparent rect),
  the soft-ended hairline and the fading reflection are all one gradient each, no extra layers.
- "Any sequence type works as a mask" — a `path` (the upper circular segment, SVG `A` arc) confined the glint to the disc above the line.
- Composition `pivotX/pivotY` + `x,y` ("set x,y to where the pivot should land") made rotating an arc polygon about the disc centre obvious.
- The audio pitfall ("shorter than its layer goes silent") made me check sfx lengths with `afinfo` before writing the layers: zero warnings.
- `window.__logs` was `[]` on the very first run and stayed so; `inspect` reported no issues at 8 frames; `render({ format: 'mp4' })` just worked
  through `agent-browser eval` (the promise is awaited for you) — 197,818 bytes in ~6 s wall time for 8 s of video.
- `contactSheet({ times, columns, cellWidth })` + `snapshot()` + `save-image.py` is a complete look-at-it loop; nothing else was needed.

## Stumbles
### 1. Gradient stops under a mask refer to the whole shape, not the visible part   [GAP]
- tried: a "reflection" = the same disc, masked to the sliver below the horizon, with a gradient fading downward.
- happened: nothing wrong — but I had to work out that the visible sliver is bounds 0.64 → 1 of the full circle and place the stops there.
  My first guess (stops 0 → 1 over the visible part) would have been wrong.
- cause: the gradient is laid over the unmasked shape's bounds; the doc says "0–1 of the shape's own bounds" and never mentions masks.
- would have prevented it: one clause in the `fillGradient` doc: "bounds are the unmasked shape's — a masked sliver sees only its share of the ramp".

### 2. Rotating a polygon about a point that is not its bounds centre   [GAP]
- tried: an arc band (annulus-segment polygon) that should swing into place around the disc centre.
- happened: no warning, but I could not tell from the docs what a polygon's local origin / pivot is when it is given in canvas coordinates
  (the table says "the centre of the shape's bounds"; the common-fields list says `pivotX/pivotY` exist on every layer; neither says
  what `pivotX` is measured from for a polygon). Rather than test it I wrapped the polygon in a `composition` with `pivotX/pivotY` at the
  disc centre — which worked first time, but it is a workaround I had to invent.
- cause: no documented example of rotating a `line` / `polygon` / `path` about an arbitrary point.
- would have prevented it: a cheatsheet line under the shape table — "polygon / path / line rotate and scale about their bounds centre;
  to turn one about another point, wrap it in a composition with `pivotX/pivotY` at that point (recipe below)".

### 3. A translucent shape over a dark background goes grey   [MY-MISTAKE]
- tried: the reflection as the disc gradient at layer `alpha: 0.38`.
- happened: it rendered as a flat grey-brown half — "mud", not a warm reflection. One retry.
- cause: design, not the library: champagne at 38 % over near-black is a dark grey. The fix was a gradient that carries its own alpha
  (`rgba(champagne, 0.5)` at the line → `rgba(champagne, 0)` at the bottom) at layer alpha 1, so the colour stays warm where it is strongest.
- would have prevented it: nothing in the library; a recipes note "for a reflection / glow, put the alpha in the gradient stops, not on the layer" would.

### 4. Audio layer length has to be typed in by hand   [GAP]
- tried: `{ type: 'audio', asset: 'chime', at: 3.0 }` with no `duration`.
- happened: I did not even run it — the pitfalls list promised a "goes silent" warning for a layer longer than its file (it would have been
  8 − 3 = 5 s), so I measured the files with `afinfo` (0.63 s / 0.34 s) outside the browser and wrote `duration: 0.62` / `0.33`.
- cause: an audio layer's `duration` defaults to the parent's, and the DSL has no "the file's own length".
- would have prevented it: an audio layer with no `duration` (and no `loop`) should default to the asset's natural length, or accept
  `duration: 'asset'`; failing that, the warning text could print the file length so you can copy it.

### 5. Contact-sheet tiles hide fine detail   [TOOLING]
- tried: judging a 2-px hairline's soft ends, a 3.5-px arc and a 7 %-alpha sheen from a 480-px tile.
- happened: invisible at tile size; every one of those decisions needed a full-size `snapshot()`.
- cause: expected — the SKILL says tiles are small — but a `cellWidth` above ~640 gives a sheet too large to view comfortably.
- would have prevented it: nothing to fix; maybe `contactSheet({ crop: { x, y, width, height } })` to tile a detail region at full scale.

## Wished the library had
- `duration: 'asset'` (or that default) for audio layers.
- `pivotX/pivotY` semantics stated for `line` / `polygon` / `path`, or a `rotateAbout: [x, y]` on shapes.
- A group / null parent: the lock-up is 14 layers that must never move together, so I laid everything out in final position from the start.
  A small "settle" of the whole mark when the wordmark lands was not worth 14 synchronised keyframes plus the masks that do not follow.
- A soft (alpha-gradient) mask: a shape mask has a hard edge, so a gradient mask would have made a true light-sweep reveal instead of the
  glint-inside-a-path I used.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)

### Sunrise logo reveal: a disc rises through a horizon line, leaves a reflection, gets a glint inside its upper segment

```js
// @recipe sunrise-mark
const CX = 640, CY = 300, R = 84, HAIR_Y = CY + 28, GAP = 5, ICE = '#9fd6e6', CHAMP = '#e6cfa7';
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const disc = { angle: 90, stops: [[0, ICE], [0.3, ICE], [0.8, CHAMP], [1, CHAMP]] };
const segY = HAIR_Y - GAP, half = Math.sqrt(R * R - (segY - CY) ** 2);            // the upper circular segment, as an SVG path
const upper = `M ${CX - half} ${segY} A ${R} ${R} 0 1 1 ${CX + half} ${segY} Z`;
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0b0e14' } },
  // the disc rises from behind the line: the mask is a static rect above the line, the disc moves under it
  { type: 'shape', shape: 'circle', radius: R, at: 0.5, fillGradient: disc, initial: { x: CX, y: HAIR_Y + R + 8 },
    keyframes: [{ at: 0, to: { y: CY }, duration: 1.7, ease: 'power3.out' }],
    mask: { type: 'shape', shape: 'rect', width: 400, height: HAIR_Y - GAP, anchorY: 0, initial: { x: CX, y: 0, fillColor: '#fff' } } },
  // the reflection: the same disc masked below the line; the alpha lives in the gradient (bounds are the WHOLE disc: the sliver is 0.64 → 1)
  { type: 'shape', shape: 'circle', radius: R, at: 2, fillGradient: { angle: 90, stops: [[0, rgba(CHAMP, 0.5)], [0.64, rgba(CHAMP, 0.5)], [1, rgba(CHAMP, 0)]] },
    initial: { x: CX, y: CY, alpha: 0 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1, ease: 'sine.inOut' }],
    mask: { type: 'shape', shape: 'rect', width: 400, height: 120, anchorY: 0, initial: { x: CX, y: HAIR_Y + GAP, fillColor: '#fff' } } },
  // a glint sweeps the disc, confined to the upper segment by a path mask
  { type: 'shape', shape: 'rect', width: 64, height: 300, at: 2.2, duration: 1.3,
    fillGradient: { angle: 0, stops: [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']] },
    initial: { x: CX - 150, y: CY, rotation: 22 }, keyframes: [{ at: 0, to: { x: CX + 150 }, duration: 1.2, ease: 'power2.inOut' }],
    mask: { type: 'shape', shape: 'path', d: upper, initial: { fillColor: '#fff' } } },
  // the horizon hairline opens from the centre; a gradient with transparent ends keeps the ends soft at every width
  { type: 'shape', shape: 'rect', width: 0, height: 2, fillGradient: { angle: 0, stops: [[0, rgba(CHAMP, 0)], [0.18, CHAMP], [0.82, CHAMP], [1, rgba(CHAMP, 0)]] },
    initial: { x: CX, y: HAIR_Y, alpha: 0.8 }, keyframes: [{ at: 0, to: { width: 420 }, duration: 1.2, ease: 'power3.out' }] },
];
```

### Swing an arc (polygon) about a point that is not its bounds centre: wrap it in a pivoted composition

```js
// @recipe arc-swing
const CX = 640, CY = 300, ARC_R = 120, ARC_T = 3.5, AC = ARC_R + 6, rad = d => d * Math.PI / 180;
const pts = [];
for (let d = 200; d <= 340; d += 2) pts.push([AC + ARC_R * Math.cos(rad(d)), AC + ARC_R * Math.sin(rad(d))]);            // outer edge
for (let d = 340; d >= 200; d -= 2) pts.push([AC + (ARC_R - ARC_T) * Math.cos(rad(d)), AC + (ARC_R - ARC_T) * Math.sin(rad(d))]);   // back along the inner edge
return [{
  type: 'composition', width: 2 * AC, height: 2 * AC, at: 1,
  initial: { x: CX, y: CY, pivotX: AC, pivotY: AC, rotation: -34, alpha: 0 },      // pivot = the circle centre; x,y = where it sits
  keyframes: [{ at: 0, to: { rotation: 0, alpha: 1 }, duration: 1.5, ease: 'power3.out' }],
  sequences: [{ type: 'shape', shape: 'polygon', points: pts,
    fillGradient: { angle: 0, stops: [[0, 'rgba(159,214,230,0)'], [0.28, '#9fd6e6'], [0.72, '#e6cfa7'], [1, 'rgba(230,207,167,0)']] } }],
}];
```
