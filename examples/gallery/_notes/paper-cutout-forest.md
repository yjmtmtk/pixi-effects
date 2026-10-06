# paper-cutout-forest — stumble notes
Model: fable   Cycles: 4   Result: works

Piece: `examples/gallery/paper-cutout-forest.html` — 1280×720, 12 s, 30 fps. A cut-paper diorama in 2.5D: stars, a paper moon (+ additive glow),
three clouds, five hill layers with pines (z −430 … +340) under a gentle camera truck, a fox (threeD composition: swinging legs, bobbing torso,
a head that looks up) walking the mid ridge, 16 blinking additive fireflies plus one "hero" firefly the fox stops for, and a hinged paper label
("Quiet Woods", Bradley Hand) that unfolds with `rotationX`, letters popping in one by one. Every paper layer is a canvas-drawn data-URL image
with a baked soft shadow (`ctx.filter = 'blur()'`), a top-light gradient and seeded speckles. `window.__logs` was `[]` on every run; `inspect`
reported no issues at 10 frames. Export: MP4 1,468,680 bytes in 6.96 s (12 s of 720p, faster than real time); logs still `[]` afterwards. Poster = frame 168.

## Went smoothly because the docs said so
- The 2.5D paragraph (`D = (H/2)/tan(fov/2)`, `+z` toward the viewer, farthest-first) plus the synthwave note's `far()` helper → my
  `K(z) = (D − z)/D` + `place(sx, sy, z)`: I designed everything in screen pixels and every layer appeared exactly where planned on the first run.
  A camera `x`/`y` truck with the default `lookAt` (the dsl.md camera example) gave the parallax for free.
- "`pivotX/pivotY` = the point that sits at `x, y` and that rotation turns about" made the hinge of the title card (pivot = the label's top edge,
  `rotationX: 90 → 0`, `back.out`) and the fox's feet pivot (so its `y` follows the ridge) obvious. Nested compositions inside a `threeD`
  composition (torso → head / tail with their own pivots) worked first time.
- Round-two note "`from` holds its start value from the LAYER's start": the letters' `from: { alpha: 0, scale: 0.2 }` needed no `initial`.
- `blendMode: 'add'` (new this round) on 17 `threeD` fireflies and the moon glow: overlapping glows brighten instead of covering, no warnings,
  identical in the export. `blendMode: 'multiply'` on the fox's ground shadow (a radial-gradient ellipse) darkens the hill correctly. Nothing misbehaved.
- `repeat` / `yoyo` / `repeatDelay` for blinking: the "endless repeats are not allowed" rule made me compute the counts up front; no warning ever.
- `canvas.toDataURL()` images as assets (10 of them, up to 2300×1300 px) and `fillGradient` (sky, vignette, glows) — no surprises.
- `inspect({ layers: 'none' })`, `contactSheet({ times, columns, cellWidth })`, `snapshot` + `save-image.py`: the whole look loop was 4 cycles.

## Stumbles
### 1. Built the fox before the hills — `ridges[2] is not a function`   [MY-MISTAKE]
- tried: the fox's `initial.y` and its sampled walk keyframes call the mid hill's ridge function; I defined the fox spec above the hill builder.
- happened: `uncaught: Uncaught TypeError: ridges[2] is not a function`, `window.__ready` never set. The harness made it a 10-second fix.
- would have prevented it: nothing library-side — a plain ordering bug; the `try/catch` + `window.__logs` did their job.

### 2. A `path` / `polygon` cannot be nudged: `y` places its bounds centre   [GAP]
- tried: a walking bob on the fox body (an SVG `path`) with a `y` yoyo keyframe.
- happened (read in the cheatsheet before running): for line/polygon/path, `x,y` "place the shape's centre", so `to: { y: -2.4 }` would have
  teleported the body to y = −2.4. Rotation is also about the bounds centre, so the tail and head could not wag/look-up about their joints.
- worked around: wrapped tail, head and the whole torso in nested `composition`s with `pivotX/pivotY` at the joint (the aurora-logo note's trick).
  Three nested compositions for one character; fine, but a lot of ceremony.
- would have prevented it: an `offsetX/offsetY` (translation relative to the drawn coordinates) and a `pivotX/pivotY` on line/polygon/path, or a
  cheatsheet line: "to move or rotate a path about a joint, wrap it in a composition with the pivot at the joint".

### 3. Leg cycles with `yoyo` end on the start value only after an even number of plays   [SPEC-ODD]
- tried: legs swinging `+A ↔ −A` with `repeat`/`yoyo` for a walk, then a pause with a neutral stance, then a second walk.
- happened: no warning, but a plain yoyo ends at ±A, so the fox would stand splayed. I had to compute the play count per walk window and add
  explicit "settle to 0" keyframes after each block (`legSwing()` in the file), keeping everything in time order.
- would have prevented it: a `cycle`-style keyframe (a list of keyframes played N times) or a recipe "walk cycle: swing block + settle".

### 4. No soft shadow / blur on shapes → every paper layer is a baked image   [GAP → hand-roll]
- tried: the brief's "soft drop shadow (low-alpha shapes)". A low-alpha offset copy of a wavy hill with 40 pines would be a second full layer per
  hill and still hard-edged; `filterArea` + a blur filter is not supported on `threeD` layers.
- worked around: `paperCut()` draws the silhouette on a canvas, blurs it (`ctx.filter = 'blur(10px)'`) as the shadow, tints a copy, adds a
  top-light gradient and seeded speckles, and the result is one `image` layer. Far layers are drawn at `res = K(z)` so they stay crisp after scaling.
- would have prevented it: `shadow: { dx, dy, blur, alpha }` on shapes/images/compositions (also `threeD`), and a `grain`/`noise` option.

### 5. Depth sorting is per layer, so a near cut-out can sit "in front of" a layer it should not cover   [GAP, designed around]
- The foreground hill (z 340) and hill 4 (z 180) are full-canvas images; they sort in front of the title card (z 0) and of every firefly with a
  smaller z. Harmless for the card (its opaque region never meets theirs), but fireflies low in the frame vanished behind hill 4 — I constrained
  each firefly's y range by its z. Not stated anywhere that a `threeD` image's transparent pixels are a cut-out (obvious once seen).
- would have prevented it: one line in "Depth order and limits": "sorting is per layer; a transparent image is a cut-out, so plan which layer may
  cover which by z, not by array order".

### 6. Do 2-D nested compositions clip at `width/height`?   [GAP, avoided]
- Same open question as app-promo / generative-orbits: I gave every nested fox part the full 240×170 box so nothing could be cut.

### 7. Render from `agent-browser eval`: started it as a background promise and polled `window.__r`   [TOOLING]
- As in the app-promo note; it worked (12 s of 720p in 6.96 s), but the pattern still is not in `ai/SKILL.md`.

### 8. The static server drops `?poster`   [TOOLING]
- tried: `open …/paper-cutout-forest.html?poster` to verify the brief's poster branch.
- happened: redirected to `…/paper-cutout-forest` with `location.search === ""`, so the branch never ran (pitfall #30c says so; I had forgotten).
  The extension-less URL `…/paper-cutout-forest?poster` keeps the query: `frame: 168`, logs `[]`.
- would have prevented it: the BRIEF giving the extension-less form for the `?poster` check.

## Wished the library had
- `shadow` (soft drop shadow) and `noise`/`grain` on shapes, images and compositions, so a paper diorama needs no canvas code.
- `offsetX/offsetY` + `pivotX/pivotY` on line/polygon/path (see #2).
- A keyframe `cycle` (a block of keyframes repeated N times, ending on a chosen value) for walk cycles / blinks (see #3).
- `inspect` reporting `threeD` layers / compositions cut by the frame, and a `safeArea` option.
- A way to check the sound design without listening: `movie.audioLevels({ times })` (RMS per timestamp) — 14 sfx layers went in blind.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)

```js
// @docs-only — design in SCREEN pixels, place in depth. A layer at z must be K(z)× bigger to appear at design size.
const FOV = 40, D = (H / 2) / Math.tan((FOV / 2) * Math.PI / 180), K = z => (D - z) / D;
const place = (sx, sy, z) => ({ x: W / 2 + (sx - W / 2) * K(z), y: H / 2 + (sy - H / 2) * K(z), z });
// A canvas-drawn image that APPEARS at design (cx, cy) with design size w × h; drawn at K(z)× resolution so far layers stay crisp.
function paperLayer({ name, z, cx, cy, w, h, draw }) {
  const k = K(z), res = Math.min(1.8, Math.max(1, k));
  const c = Object.assign(document.createElement('canvas'), { width: Math.ceil(w * res), height: Math.ceil(h * res) }), g = c.getContext('2d');
  g.setTransform(res, 0, 0, res, (w / 2 - cx) * res, (h / 2 - cy) * res);      // draw(g) in design coordinates
  draw(g); assets.push({ name, src: c.toDataURL('image/png') });
  return { type: 'image', asset: name, name, threeD: true, initial: { ...place(cx, cy, z), anchorX: 0.5, anchorY: 0.5, scale: k / res } };
}
// Paper cut-out: silhouette → blurred shadow + tinted copy + seeded speckles (see paperCut() in the piece).
// Camera truck for parallax: { type: 'camera', keyframes: [{ at: 0, from: { x: W/2 - 90, y: H/2 + 26 }, to: { x: W/2 + 90, y: H/2 - 26 }, duration: 12, ease: 'sine.inOut' }] }

// @docs-only — a leg swing that settles to neutral between walk windows ([t0, t1] in layer-local seconds)
function legSwing(phase, walks, HALF = 0.25, A = 23) {
  const kf = [];
  for (const [t0, t1] of walks) {
    const n = Math.round((t1 - t0 - HALF / 2 - 0.15) / HALF);
    kf.push({ at: t0, to: { rotation: A * phase }, duration: HALF / 2, ease: 'sine.out' });
    kf.push({ at: t0 + HALF / 2, to: { rotation: -A * phase }, duration: HALF, ease: 'sine.inOut', repeat: n - 1, yoyo: true });
    kf.push({ at: t0 + HALF / 2 + n * HALF, to: { rotation: 0 }, duration: 0.15, ease: 'sine.inOut' });
  }
  return kf;   // rect legs: anchorY: 0 (hip at the top); diagonal pairs share a phase (+1 / −1)
}
```
