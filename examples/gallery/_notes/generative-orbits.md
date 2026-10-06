# generative-orbits — stumble notes
Model: opus   Cycles: 5   Result: works

1080×1080, 14 s @ 30 fps, one seamless loop (frame 419 → frame 0 differs exactly as much as any other 1-frame step: mean pixel diff 0.475 vs 0.475).
About 750 layers (10 rings × 36 dots, 5 rose comets × 20 dots in nested rotors, 2 Lissajous comets × 30 dots, plus curves and halos). Build 0.4–0.7 s, `__logs` = `[]`, MP4 export 3.0 MB in 10.9 s.

## Went smoothly because the docs said so
- "compositions use `pivotX/pivotY`; set x/y to where the pivot should sit": the full-canvas "rotor" (pivot = centre, x/y = centre, linear `rotation` tween) worked first try, nested two deep as well.
- The repeat math ("total = duration × (repeat + 1)") made the core pulse exactly loop-safe: `duration: T/8, repeat: 7, yoyo: true` = 14 s and it ends where it started.
- `image` + `tint` on one canvas-drawn soft-dot sprite (`canvas.toDataURL()` as an asset, as in the recipes) gave glow for ~750 dots cheaply, with no filters and no `filterArea`.
- Keyframe `at` being layer-local, negative `at` for the title fade-out, and `contactSheet({ times })` + `save-image.py` all worked exactly as written.
- `movie.snapshot(f, { type: 'image/jpeg', scale: 0.5 })` for the poster: fine.

## Stumbles
### 1. Does a nested composition clip to its width/height?   [GAP]
- tried: an inner rotor sized to its content (small composition holding one dot at an offset).
- happened: nothing went wrong, because I didn't risk it: the docs never say whether children outside `[0,width]×[0,height]` are drawn, so I made every rotor full-canvas (1080×1080, pivot at the centre).
- cause: undocumented.
- would have prevented it: one line under `composition` in cheatsheet / dsl.md: "A non-threeD composition is a plain container: it does not clip children to its width/height (width/height only set W/H and the pivot frame)", or "it clips", whichever is true.

### 2. Lines can't be drawn on   [GAP]
- tried: to "draw" the rose curve and the Lissajous figure progressively, like a pen.
- happened: polygon `points` are baked at build time and there is no trim/dash-offset/progress property, so a curve can only fade in as a whole.
- would have prevented it: a `drawProgress` / `trimEnd` (0–1) animatable prop for `line` / `polygon` / `path`. Workaround: comets with trails trace the curve while the static curve fades in under them, which reads well enough.

### 3. No additive blending: glows don't accumulate   [GAP, known]
- tried: halos on the comet heads that brighten where they overlap.
- happened: normal alpha compositing, so overlapping halos just cover each other and the peak looks flatter than in a real glow piece.
- would have prevented it: `blendMode: 'add' | 'screen'` on any layer. That alone would lift every particle/generative piece.

### 4. Repeating the comet's fade envelope on every trail dot   [GAP]
- tried: to fade a whole comet (head + 30 trail dots) in and out together.
- happened: there is no group alpha unless you wrap the dots in a composition, and these dots' parents were already their own rotors, so each dot carries its own `alpha` envelope (scaled by its trail falloff).
- would have prevented it: a recipe line: "to fade a set of layers together, wrap them in a full-size composition and key its alpha". I only realised afterwards that this works for the sampled Lissajous dots.

### 5. Curves need sampling, but rotation-built curves don't   [SPEC-ODD → pattern]
- tried: Lissajous: sampled into 0.1 s linear `{ x, y }` keyframes (140 per dot × 60 dots ≈ 8.6k tweens). Build time stayed < 0.7 s and the 3-frame linear segments are invisible on a moving trail.
- also: a rose curve is the sum of two counter-rotating equal arms, so each rose dot is two nested rotors with ONE linear rotation tween each: exact and loop-safe, no sampling. Worth a recipe (below).

### 6. 3:2 Lissajous with δ = π/4 is degenerate   [MY-MISTAKE]
- tried: a seeded δ in [0.15π, 0.35π].
- happened: the first sheet showed a bowl / open curve instead of a woven figure (x = sin(3φ+π/4), y = sin 2φ collapses onto a parabola-like path).
- fix: plotted candidates with PIL first, then kept δ ≈ 0.1π. Lesson: plot generative curves offline before wiring them into layers.

### 7. The title overlapped the outer ring   [MY-MISTAKE / inspect gap]
- tried: a centred caption at y = 948.
- happened: on the sheet it sat on top of the outer ring's dots. `inspect` reports no issue (it only checks text against text and the frame edge, as documented).
- fix: moved it to a bottom-left plate caption (the corners of a square canvas around a circular piece are empty).
- would have prevented it: an opt-in `inspect(frame, { against: 'all' })` that flags text overlapping any opaque-ish layer.

### 8. "Hold the last composition ~1 s" vs. "loopable"   [SPEC-ODD]
- The brief's end hold conflicts with a seamless loop (the last frame must lead back into the first). I made the last ~1.8 s and the first ~1.5 s the same calm state (dim rings, no comets), so the end holds and also loops. The title appears 10.2–13.2 s and is gone by the seam.

### 9. No built-in way to verify a loop   [TOOLING]
- did: snapshotted frames 0, 1, 418, 419 and compared mean pixel differences in Python.
- would have prevented it: `movie.loopCheck()` returning the diff between the last frame and frame 0 next to a typical one-frame diff, or `contactSheet({ frames: [last, 0] })` with a diff tile.

## Wished the library had
- `blendMode` (add / screen) on layers. The most important one for glow, particle and generative work.
- `trimEnd` / `drawProgress` on line / polygon / path.
- A per-frame time variable or `curve(fn)` helper that samples `fn(t) → {x, y}` into keyframes for me (`orbit()` already does this internally for the camera).
- A documented answer on composition clipping.

## Reusable pattern worth adding to ai/reference/recipes.md
Epicycles: a dot that traces a rose / spirograph exactly, with two linear rotation tweens. It loops seamlessly when both arms make whole turns.

```js
// rotor = a full-size group that turns about (cx, cy)
const S = 1080, C = S / 2, T = 14;
const rotor = (cx, cy, from, to, sequences) => ({
  type: 'composition', width: S, height: S,
  initial: { x: cx, y: cy, pivotX: C, pivotY: C, rotation: from },
  keyframes: [{ at: 0, to: { rotation: to }, duration: T, ease: 'none' }],
  sequences,
});
// p(t) = C + RA·e^{i·TA·2πt/T} + RB·e^{i·TB·2πt/T}; RA = RB with TA = -1, TB = 4 → a five-petal rose
// phase s0 (seconds) shifts a dot along the curve: use -j·lag for trail dots, c·T/n for n comets
function epicycleDot(dotSpec, { RA = 196, RB = 196, TA = -1, TB = 4, s0 = 0 }) {
  const a0 = TA * 360 * s0 / T, b0 = TB * 360 * s0 / T;
  const armB = {   // arm B turns about the tip of arm A (which sits at C + RA in arm A's frame)
    type: 'composition', width: S, height: S,
    initial: { x: C + RA, y: C, pivotX: C, pivotY: C, rotation: b0 - a0 },
    keyframes: [{ at: 0, to: { rotation: b0 - a0 + (TB - TA) * 360 }, duration: T, ease: 'none' }],
    sequences: [{ ...dotSpec, initial: { ...dotSpec.initial, x: C + RB, y: C } }],
  };
  return rotor(C, C, a0, a0 + TA * 360, [armB]);
}
```
