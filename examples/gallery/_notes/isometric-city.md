# isometric-city — stumble notes
Model: fable   Cycles: 3   Result: works

1280×720, 12 s @ 30 fps, ~640 layers (60 buildings × [1 composition + 3 polygon faces + 2 window images + 2 additive glow images], 3 crowns, 22 trees, roads/river/bridges with masks, 12 cars, 40 stars, 4 text, 12 audio). 64 generated window textures (data URLs). Everything derived from seed 2040.
`__logs` = `[]` after init, after seeks, inspect and export; `inspect` clean at frames 0/10/45/60/100/135/200/240/285/300/315/335/340/359; export MP4 2,801,899 bytes in 6.9 s (faster than real time); poster = frame 335.

## Went smoothly because the docs said so
- The whole piece worked on the FIRST run (`__logs: []`, no layout issue), which I attribute to four doc lines: keyframe `at` is layer-local; a composition rotates/scales about `pivotX/pivotY` with `x,y` where the pivot sits (each building is a full-canvas composition pivoted at its footprint, `scaleY: 0 → 1` with `back.out`); line/polygon/path use plain canvas coordinates when there is no `x,y`; masks live in the parent's coordinates and reveal by growing `width` from a fixed edge (`anchorX: 0` / `anchorX: 1` for the right-to-left column roads).
- "Array geometry is baked at build time" (dsl.md) sent me straight to compositions + `scaleY` for the rise instead of trying to animate polygon points.
- The round-two note "`from` holds its start value from the LAYER's start" made the sun's `{ at: 0.3, from: { x: 320 }, to: { x: 980 } }` and the title's delayed `from: { alpha: 0 }` work without `initial` values.
- `colorSpace: 'oklab'` on polygons AND on image `tint` (window glass dawn → day → dark → lit) tweened cleanly; `tint` as a `'#rrggbb'` string in `initial` is accepted.
- "A mask now starts and ends with the layer it masks" (round-two list): every road/river/bridge mask uses `at: 0` keyframes and they line up with the layer's `at` exactly.
- Audio: omitting `duration` on one-shot sfx and on the looping bgm (lasts to the end) produced zero warnings, as the brief promised. Listing the clip lengths in the brief saved a cycle.
- The new `blendMode` (coordinator note mid-task): `'add'` on a circle with a radial `fillGradient` (sun halo) and on `image` layers INSIDE a nested, non-threeD composition (blurred window textures with a tint) both rendered correctly, in playback, snapshot and the MP4 export. No warning, no visible artefact.
- `contactSheet({ times, columns, cellWidth })`, `snapshot(frame, { type: 'image/jpeg', scale: 0.5 })` and `save-image.py` worked as written. The sheet header ("frame 9 · 0.30s") plus my own label text made it easy to confirm the sheet was mine (see the brief's warning).

## Stumbles
### 1. Is `anchorY` honoured on a `polygon`?   [GAP]
- tried: nothing — I wanted a polygon face to grow from its base (`anchorY: 1` + `scaleY`), but the dsl.md anchor table says polygon/line/path anchor at "the centre of the shape's bounds | —", while the paragraph below says "`anchorX`/`anchorY` (default 0.5) control which point on the bbox sits at the local origin … They're animatable too" without restricting it to rect/circle/ellipse.
- happened: I did not risk a cycle on it and wrapped every building in a full-canvas `composition` with `pivotX/pivotY` at its footprint (60 extra container layers). Fine, but a doc answer would have removed them.
- would have prevented it: one word in the anchor table: polygon/line/path → "`anchorX`/`anchorY` work on the bbox" or "not supported".

### 2. Does a nested composition clip to its `width`/`height`?   [GAP] (same as generative-orbits #1)
- tried: nothing — I made all 60 building compositions, 2 bridge compositions, the slab and the city 1280×720 to be safe.
- would have prevented it: one sentence under `composition` in the cheatsheet / dsl.md.

### 3. No draw-on for strokes / bands   [GAP, known]
- tried: "a river and bridge draw in".
- happened: used a rect mask growing from one end (`anchorX: 0` or `1`), which works because iso roads are monotonic in x. A winding river would not have been possible.
- would have prevented it: `trimEnd` / `drawProgress` on line / polygon / path (already in the round-one wish lists).

### 4. The window-glow design needed a blurred texture, not a filter   [SPEC-ODD → pattern]
- tried: a bloom around lit windows with the new `blendMode: 'add'`.
- happened: `add` alone makes the sharp window quads brighter but gives no halo; a blur filter per window layer (120 layers) felt expensive and `filterArea` would be needed on each. So I drew each window texture twice on the 2D canvas — sharp, and `ctx.filter = 'blur(3px)'` with a 10 px margin — and the glow layer is the blurred image with `blendMode: 'add'`, `tint: '#ff9a40'`, `alpha 0 → 0.45`. Cheap and export-safe (Chromium's canvas filter is deterministic).
- would have prevented it: a `glow` / `blur` option on image/shape layers that expands its own filter area, or a recipe line "a soft glow is a blurred copy of the texture with blendMode add".

### 5. Occlusion of moving cars needed a layering trick, not depth sorting   [docs → pattern]
- tried: cars drawn on top of the city showed over buildings they should pass behind.
- happened: realised that in an isometric scene a box only ever covers screen area of tiles BEHIND it, so drawing all cars right after the ground and BEFORE every building is correct for every car on every road (buildings in front cover them, buildings behind never reach down to them). No sorting at all.
- would have prevented it: nothing in the library; worth a line in a recipe for anyone doing a 2D iso scene.

### 6. Dawn colours looked different against the slab than on the palette swatch   [MY-MISTAKE]
- tried: river `#cf9db2`, lots `#a59e94` at dawn.
- happened: the sheet showed a pink carpet and mauve patches next to the olive ground. Fixed to `#ad94b8` / `#a6a894` after one look. The contact sheet caught it; nothing the library could do.

## Wished the library had
- `trimEnd` / `drawProgress` on line / polygon / path (roads, rivers, outlines).
- A documented answer on polygon `anchorX/Y` and on composition clipping.
- A `sampled(duration, fn)` helper next to `orbit()` (I did not need it here — every car path is a straight line — but the three notes I skimmed all re-wrote it).
- A `label` option for `contactSheet` (burned into the header) so a mixed-up sheet from another author's session is obvious.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
A global colour schedule → layer-local oklab keyframes, for any layer whatever its `at`. One schedule drives 400+ layers (faces, ground, roads, river, trees, windows) and a layer that appears mid-tween starts from the interpolated colour.
```js
// stops: [[globalTime, '#hex', ease?], ...] piecewise-linear; equal neighbours hold. A layer lives [t0, t0 + d).
function colorKeys(prop, stops, t0, d) {
  const initial = { [prop]: colorAt(stops, t0) };                 // colorAt = linear RGB mix between the two surrounding stops
  const keyframes = [];
  for (let k = 0; k < stops.length - 1; k++) {
    const [ta, ca] = stops[k], [tb, cb, ease = 'sine.inOut'] = stops[k + 1];
    if (ca === cb || tb <= t0) continue;
    const start = Math.max(ta, t0);
    if (start - t0 >= d) continue;                                 // fence-post: never start a keyframe at the layer's end
    keyframes.push({ at: start - t0, to: { [prop]: cb }, duration: Math.min(tb, t0 + d) - start, ease });
  }
  return { initial, keyframes };
}
// { type: 'shape', shape: 'polygon', points, colorSpace: 'oklab', at: t0, duration: d, ...colorKeys('fillColor', phases(dawn, day, dusk), t0, d) }
```
Isometric box as three polygons (canvas coordinates), rising inside a pivoted composition:
```js
const iso = (i, j) => [CX + (i - j) * TW / 2, CY + (i + j) * TH / 2], up = ([x, y], h) => [x, y - h];
const B = iso(i0, j0), R = iso(i1, j0), F = iso(i1, j1), L = iso(i0, j1);          // ground corners
const faces = [[L, F, up(F, h), up(L, h)], [F, R, up(R, h), up(F, h)], [up(B, h), up(R, h), up(F, h), up(L, h)]];   // left, right, top
const C = iso(i0 + 0.5, j0 + 0.5);
({ type: 'composition', width: 'GW', height: 'GH', at: t0, initial: { x: C[0], y: C[1], pivotX: C[0], pivotY: C[1], scaleY: 0 },
   keyframes: [{ at: 0, to: { scaleY: 1 }, duration: 0.8, ease: 'back.out(1.5)' }],
   sequences: faces.map(points => ({ type: 'shape', shape: 'polygon', points, initial: { fillColor } })) })
```
