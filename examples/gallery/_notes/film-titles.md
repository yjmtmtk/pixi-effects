# film-titles — stumble notes
Model: opus   Cycles: 5   Result: works

## Went smoothly because the docs said so
- `registerThree()` + `three({ setup → { objects } })` + `'three.<obj>.<path>'` keyframes worked first try (including `'three.camera.position.z'` for the push-in and `'three.sweep.intensity'` / `.position.x` for a passing light); the d.ts and `docs/dsl.md#three` were enough.
- The `update(t)` "pure function of t" rule was stated clearly, so the dust drift was deterministic and the export matched the preview.
- `custom` filter with pixi's `BlurFilter` and `'filters.<name>.strength'` keyframes (de-blur reveal on credits and title letters): copied from `docs/dsl.md`, worked.
- `fillGradient` radial with `center` / `radius` / alpha stops for both the haze and the vignette — no hand-rolled images.
- Seeded RNG from the particles recipe; `contactSheet({ times })`, `snapshot`, `inspect(f, { layers: 'none' })` and `save-image.py` all worked as documented. `__logs` stayed `[]` the whole time.
- Export: `render({ format: 'mp4' })` → 2.97 MB in 8.6 s for 14 s at 720p.

## Stumbles
### 1. Is a three layer transparent?   [GAP]
- tried: first set `scene.background` to the fog colour because I assumed the offscreen renderer is opaque; then the 2D haze I wanted behind the object was impossible.
- happened: removing `scene.background` showed the 2D layers behind the three layer — it *is* transparent. Found by trial.
- cause: neither `docs/dsl.md#three` nor the d.ts says whether the renderer clears with alpha.
- would have prevented it: one line in the three section: "The renderer is transparent: without `scene.background` the layers below show through, so you can composite 2D gradients behind a 3D object."

### 2. `update(t, ctx)` cannot reach the objects returned by `setup`   [GAP]
- tried: animate the dust `Points` in `update`.
- happened: `ctx` is `{ scene, camera, renderer, width, height }` only; I had to do `ctx.scene.children.find(o => o.isPoints)` (or keep a closure variable).
- would have prevented it: pass `ctx.objects` (the map returned by `setup`) to `update`, or document the closure pattern.

### 3. Per-letter title in a proportional serif   [GAP]
- tried: Georgia caps, one text layer per letter (centre-out stagger + slow outward creep).
- happened: the docs only give a width rule of thumb (0.6 / 0.8 × size) and a monospace recipe; Georgia caps are not uniform.
- cause: no text-measuring helper.
- worked around: `canvas.getContext('2d').measureText(ch)` with the same font string, letter centres computed from cumulative advances. Worked on the first try.
- would have prevented it: a short recipe "per-letter layout with a proportional font (measureText)", or a `splitText()` helper that returns letter specs with x positions.

### 4. Film grain needs per-frame randomness   [SPEC-ODD / hand-roll]
- tried: grain of tiny dots that changes every frame.
- happened: no per-frame random / noise in the DSL; 1 layer per dot per frame would be thousands of layers.
- worked around: one canvas-generated, seeded dot texture 200 px larger than the canvas, jumped to a seeded random offset with a `set` keyframe every 2 frames (210 `set` keys per layer, two layers), plus a black "flicker" veil with 210 `set` alpha keys and 26 one-frame dust specks. Cheap and deterministic.
- would have prevented it: a `jitter` / `steps` keyframe helper (`{ every: 2/30, seed, set: (rnd) => ({ x: …, y: … }) }`) or a recipe for "film grain" exactly like this.

### 5. Camera `lookAt` from `setup` is not re-applied when the camera moves   [GAP, did not bite me]
- tried: push-in by animating only `'three.camera.position.z'`, with `camera.lookAt(0, 0.2, 0)` in setup.
- happened: fine, because only z moved; had I moved y the aim would have drifted (a three camera keeps its rotation). Worth one line in the docs ("animate position and the camera keeps its orientation; re-aim in `update` if you move it off-axis").

### 6. `inspect` does not know the letterbox bars cover text   [SPEC-ODD, documented]
- inspect checks text against the canvas and against other text, not against opaque shapes, so it would not warn if a credit slid under a letterbox bar. I kept every credit's y range (incl. drift) inside 92…628 by arithmetic. A `safeArea` option (`inspect(f, { safeArea: { top: 92, bottom: 92 } })`) would make it checkable.

## Wished the library had
- `ctx.objects` in three `update`.
- A text-measure / split-text helper for proportional fonts.
- Stepped / jittered keyframes from a seed (grain, flicker, camera shake) without hand-writing 200 `set` keys.
- `inspect` safe-area option.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// Film grain: one seeded dot texture, jumped to a random offset every 2 frames
const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function grainAsset(name, seed, count, W, H) {
  const c = Object.assign(document.createElement('canvas'), { width: W + 200, height: H + 200 });
  const g = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = 0.04 + r() * 0.16;
    g.fillStyle = r() < 0.4 ? `rgba(230,222,205,${a})` : `rgba(0,0,0,${a * 1.6})`;
    g.fillRect(Math.floor(r() * c.width), Math.floor(r() * c.height), 1, 1);
  }
  return { name, src: c.toDataURL() };            // goes in movie.init({ assets })
}
function grainLayer(name, asset, seed, duration, fps = 30) {
  const r = rng(seed), keyframes = [];
  for (let f = 0; f < duration * fps; f += 2)
    keyframes.push({ at: f / fps, set: { x: -Math.round(r() * 200), y: -Math.round(r() * 200) } });
  return { type: 'image', name, asset, initial: { x: 0, y: 0, alpha: 0.55 }, keyframes };
}
```
