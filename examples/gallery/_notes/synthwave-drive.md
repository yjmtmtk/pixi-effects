# synthwave-drive — stumble notes
Model: fable   Cycles: 5   Result: works

Final checks: `window.__logs` = `[]` after init, after seeks and after export; `inspect` clean at frames 0/15/62/64/66/70/100/168/200/268/318/355/359
(the only issue ever reported was the intentional chromatic-ghost overlap during the 0.6 s title strike, frame 40); export MP4 4,836,783 bytes in 7.5 s
(12 s @ 30 fps, 1280×720 — faster than real time); poster = frame 168.

## Went smoothly because the docs said so
- Keyframe `at` is layer-local; negative counts back from the end — used all over (title flicker, rules) without a single retry.
- The 2.5D paragraph in the cheatsheet (`D = (H/2)/tan(fov/2)`, `+z` toward the viewer, far layers pulled toward the centre, "consecutive threeD layers
  are drawn farthest-first, a 2D layer splits the group") was enough to derive a `far(sx, sy, z)` helper that places a layer in depth so it
  APPEARS at a chosen screen point / size. Sun, stars and two ridges landed where planned on the first run.
- `fillGradient` (linear sky / ground / horizon haze, radial sun glow / title halo / vignette) covered every gradient; no canvas hacks for those.
- `dropShadow` + `padding ≥ 2·blur` for the neon glow: from pitfalls #12, no clipped glow.
- `canvas.toDataURL()` as an image asset (sun with transparent stripes, star field, scanlines) just worked.
- `repeat` / `yoyo` on a single keyframe for the camera drift and twinkles; the "endless repeats are not allowed" note made me compute the counts.
- The harness (`window.__logs`) and the warning text for the fence-post keyframe were precise enough to fix it blind.

## Stumbles
### 1. Last per-frame `set` landed exactly on the layer's end   [MY-MISTAKE]
- tried: sampling the grid rows per frame with `for (f = 0; f <= frames; f++)` → a `set` at `at: 12` on a 12 s layer.
- happened: `pixi-effects: layer "grid-row-1": keyframes[360] starts at 12s, after the layer ends (duration 12s), so it never plays…` (×9).
- cause: fence-post; the end of `[at, at+duration)` is exclusive.
- would have prevented it: nothing more needed — the warning named the layer, the index and the rule. Good warning.

### 2. Pixi `[BindGroup] … destroyed while still bound` warnings when a `threeD` layer's `height` is animated   [LIBRARY-BUG]
- tried: 9 `threeD` rects (grid rows) whose `height` is set per frame (thickness grows as a line approaches).
- happened: 18 warnings after init (`warn: PixiJS Warning:  [BindGroup] a 'textureSource' was destroyed while still bound to a shader…` and
  the `'textureSampler'` twin), 6 more on the first seek, then none. Exactly one pair per grid row.
- cause (inferred, src is off-limits): a `threeD` layer renders through its own texture; changing the geometry re-creates that texture and the old
  one is destroyed while still bound. Pitfalls #30b says these warnings are harmless *at destroy()*; here they come from playback.
- workaround: keep `height: 1` and animate `scaleY` instead — identical look, zero warnings.
- would have prevented it: a line in the 2.5D section: "animate `scale*` not `width`/`height` on a threeD shape (geometry changes rebuild its
  texture and warn)", or the library swapping to a neutral texture before destroying the render texture (the recent commit message suggests it
  already does this for some path, but not this one).

### 3. A contact sheet from ANOTHER author's movie came back from my session's eval   [TOOLING]
- tried: `agent-browser --session synthwave-drive eval "movie.contactSheet({...})" | python3 ai/tools/save-image.py …`
- happened: the saved PNG was a 22-frame sheet of a kinetic-type piece ("MAKE THINGS — A MANIFESTO"), not my 10-frame 2-column request.
  `location.href` / `document.title` / `movie.duration` in the same session were mine; a `movie.snapshot` a minute later was mine.
- cause: several authors share this machine and (apparently) one agent-browser daemon; a concurrent eval result was delivered to the wrong CLI
  call. Could not reproduce on purpose.
- would have prevented it: a note in the BRIEF/SKILL: "verify the saved image is yours (title / frame count) before judging it"; or have
  `contactSheet` burn the movie's canvas size + layer count (or a caller-supplied `label`) into the header so a mix-up is obvious.

## Wished the library had
- A `repeat` over a *group* of keyframes (a sampled 1-cycle curve played N times). The 1/u grid-row curve had to be sampled for the full 12 s
  (9 rows × 360 `set` keyframes); a `cycle: [...]` or per-keyframe `ease: (p) => …` would make it 9 keyframes.
- `inspect` option to mark a text overlap as intentional (`ignoreOverlap: true` on a layer), so a deliberate chromatic-ghost copy does not
  show up as an issue on every run.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// Place a threeD layer so that it APPEARS at screen point (sx, sy) with screen size s, with the default camera.
const FOV = 40, D = (H / 2) / Math.tan((FOV / 2) * Math.PI / 180);
const K = z => (D - z) / D;                                              // multiply sizes by K(z)
const far = (sx, sy, z) => ({ x: W / 2 + (sx - W / 2) * K(z), y: H / 2 + (sy - H / 2) * K(z), z });
// A camera truck of Δ px then moves z = 0 by Δ and a layer at z by Δ·D/(D − z): free parallax.
```
```js
// Perspective grid floor racing toward the viewer (synthwave): screen y of ground distance u is HORIZON + F/u; sample per frame as `set`s.
function gridRow(k) {                                                    // k = 1..N identical rows, one grid unit per CYCLE seconds
  const keyframes = [];
  for (let f = 0; f < DURATION * FPS; f++) {
    const t = f / FPS, u = k - (t / CYCLE) % 1;
    keyframes.push({ at: f / FPS, set: { y: HORIZON + F / Math.max(u, 0.3), scaleY: clamp(1.6 + 4.5 / u, 1.5, 11), alpha: clamp(1.15 - u / N, 0, 1) } });
  }
  return { type: 'shape', shape: 'rect', width: 'GW', height: 1, initial: { x: 'GW/2', y: HORIZON + F / k, fillColor: '#ff6cc6' }, keyframes };
}
```
