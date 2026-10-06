# solar-system — stumble notes
Model: opus   Cycles: 11   Result: works

1280×720, 14 s @ 30 fps. 2.5D: one tilted threeD "plate" composition (8 orbit rings + a 420-dot asteroid belt rotating inside it),
a Sun (gradient disc + `blendMode: 'add'` glow), 8 planets as threeD composition cards (disc + bands + a shade that turns away from the Sun),
orbit() for the opening sweep, then a flight camera sampled per frame (tracks each moving planet, pulls out between stops), 2D fact cards with
`{value}` counters, recap tags that ride the planets (projected in JS). `__logs` = `[]` after init, after seeks and after export;
`inspect` clean at 17 frames; MP4 3.70 MB in 8.6 s; poster = frame 300.

## Went smoothly because the docs said so
- `orbit({ radius, center, start, degrees })` + "position = centre + R·(sin θ, 0, cos θ)": my own sampled camera picks up exactly where orbit() ends (a camera cut on an identical pose), no visible seam.
- "Keep every layer at small z / far layers pulled to the centre": the cheatsheet's camera formula `z = (H/2)/tan(fov/2)` let me write a JS `project()` that matches the renderer to the pixel — the recap name tags (2D text) sit on moving threeD planets with no correction.
- `scale` on a threeD layer is applied after its texture is drawn: a disc drawn at radius 128 and scaled to 0.07 stays sharp at 5× close-up (I tested `radius 11, scale 1` vs `radius 70, scale 0.16` first: the second is crisp). Worth one doc line.
- A threeD `composition` as a card (rings + belt drawn flat, then the whole card tilted with `rotationX`): exactly the ecliptic plane I needed, and nested 2D layers inside (a rotating belt group) just work.
- `{value}` + `format: { decimals }` for every fact; `fillGradient` (radial planets, banded Jupiter/Saturn via a 10-stop linear gradient, a linear alpha "shade", scrim, vignette).
- New `blendMode: 'add'` on the threeD Sun glow: worked first time, also over the threeD plate.
- `path` with an SVG `A` arc (front half of Saturn's rings) worked.

## Stumbles
### 1. A large tilted threeD layer disappears completely when the camera gets inside its depth range   [GAP]
- tried: flying the camera close to Earth (camera z ≈ 290) while the tilted orbit plate's near edge is at z ≈ 556.
- happened: the whole plate (all rings + the belt) vanished, no warning. Planets were fine.
- cause (inferred): "A layer at or behind the camera is hidden" is applied to the layer's whole quad when any part of it is behind the camera plane — not per-pixel clipping.
- workaround: the camera never enters the plate's depth: close-ups are telephoto (fov narrows to ~13°) from a camera kept at z ≥ ~700; I compute the min camera-space depth of the plate's 4 corners over all frames in JS (31 px margin at the tightest moment).
- would have prevented it: a dsl.md line "a threeD layer is hidden as soon as ANY corner is behind the camera; a big tilted floor/plane must stay entirely in front", or a one-time warning naming the layer. Better: near-plane clipping.

### 2. Thin strokes on a tilted threeD card stair-step in close-ups   [LIBRARY-BUG / GAP]
- tried: orbit rings as stroked circles inside the plate card, drawn at 1.5× and at 2.4× (`scale: 1/PN`) to stay sharp.
- happened: in the close-ups the rings show a coarse staircase (no anti-aliasing / mip-mapping in the card's texture); drawing at higher resolution barely helps. The asteroid dots look like ragged blobs for the same reason.
- workaround: kept the rings faint (strokeAlpha 0.26, highlight 0.5) so it reads as texture; noted it.
- would have prevented it: anti-aliased (MSAA or supersampled) render textures for threeD layers, or a `resolution` option on threeD compositions (the three.js layer has one).

### 3. Planet discs turn into eggs when the camera looks off-axis   [SPEC-ODD → docs]
- tried: lookAt the planet from a camera displaced sideways and up (prototype).
- happened: discs facing +z are seen obliquely → ellipses. Expected (they are planes, not billboards), but a beginner will be surprised.
- fix: keep the camera level and its lookAt straight ahead-ish (yaw ≤ 8°), and tilt the WORLD (the plate) instead of the camera.
- would have prevented it: a 2.5D doc line "layers are planes, not billboards: for round things keep the camera's view axis close to +z (tilt the floor, not the camera)".

### 4. Sampling the camera by hand when orbit() is not enough   [GAP]
- needed: a camera that tracks a moving target, zooms (fov) and drifts. orbit() covers only the circle, so I wrote `poseAt(t)` and sampled it into 324 per-frame linear keyframes; the starfield (2D, "at infinity") and the recap tags are sampled from the same function.
- would have prevented it: a `sample(fn, { from, to, step })` helper that turns `(t) => props` into keyframes (orbit() already does this internally). Every 2.5D piece I can imagine needs it.

### 5. Layout check for 3D vs 2D text   [TOOLING]
- `inspect` cannot know that a background planet sits behind a 2D fact card (it checks text vs text only), and other planets wander into the card area as they orbit.
- did: my own JS check (`window.__conflicts`) projecting every planet at every stop and listing those inside the card rect or cut by the frame; tuned the visit angles until it was clean (Jupiter −140°, Neptune −74°).
- would have prevented it: `inspect(frame, { against: 'all' })` reporting text overlapping any opaque layer (also asked for by a round-one note).

### 6. bgm.mp3 is very quiet   [SPEC-ODD]
- the clip itself is −35 dB mean / −25 dB peak (ffmpeg volumedetect); at `volume: 1` the mix peaks at 0.10. I did not try `volume > 1` (docs do not say whether it is allowed / clamped).
- would have prevented it: a normalized bgm asset, or a docs line on the volume range.

### 7. Counters on the poster frame   [MY-MISTAKE]
- first poster (frame 288) caught "9.56 AU" mid-count; moved it to frame 300.

## Wished the library had
- Near-plane clipping (or at least a warning) for big threeD planes; AA for threeD textures.
- `sample(fn)` → keyframes helper; a `billboard: true` option for threeD layers (always face the camera).
- `inspect` text-vs-anything overlap; a way to read a layer's projected screen position from the movie (`movie.project(layerName, frame)`), so 2D labels can follow threeD objects without re-implementing the camera.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// Project a world point with the same camera the renderer uses (straight pose: position = T + dist·(sin yaw, 0, cos yaw), lookAt = T).
// Lets 2D labels ride threeD layers: sample project() per frame into x/y keyframes of a 2D text layer.
function project(Q, { T, yaw, dist, f /* = (H/2)/tan(fov/2) */ }) {
  const s = Math.sin(yaw * Math.PI / 180), c = Math.cos(yaw * Math.PI / 180);
  const cam = [T[0] + dist * s, T[1], T[2] + dist * c], d = [Q[0] - cam[0], Q[1] - cam[1], Q[2] - cam[2]];
  const depth = -(d[0] * s + d[2] * c);
  return { x: W / 2 + f * (d[0] * c - d[2] * s) / depth, y: H / 2 + f * d[1] / depth, depth };
}
// A point on a plate tilted by rotationX = TILT about (CX, CY, 0): (u, v) → (CX + u, CY + v·cos TILT, v·sin TILT)
```
