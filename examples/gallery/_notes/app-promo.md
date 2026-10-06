# app-promo — stumble notes
Model: fable   Cycles: 3   Result: works

Piece: `examples/gallery/app-promo.html` — 1080×1080, 12 s, 30 fps, 145 layers (42 of them baked ring frames). Export: MP4 2,075,471 bytes in 8.1 s. `window.__logs` stayed `[]` on every run; `inspect` reported no issues at frames 30/75/182/215/290/350.

## Went smoothly because the docs said so
- `composition` + `threeD: true` as a card (depth-cards recipe): pivot = centre, children in local coords and local time, one texture → the whole phone (shadow, body, screen, 40 UI layers) enters, floats and exits in depth as one thing. First try.
- "Keyframe `at` is layer-local, a layer's `at` is composition time" is stated three times; I wrote a `group()` helper that derives entrance/exit keyframes from each layer's own `initial.x/y` and never had to think about it again.
- `{value}` counters with `format`, `repeat`/`yoyo` for the pulse, `anchorY: 1` + `height` tween for the bars, `anchorX: 0` + `width` tween for the caption dash — all straight from the cheatsheet / recipes.
- Audio: the pitfall "a file shorter than its layer goes silent" made me measure the sfx with `afinfo` first and cut each sfx layer to ≤ its file length; bgm `loop: true`. No audio warning ever appeared.
- `fillGradient` radial with alpha stops → soft shadows (the brief asked for low-alpha shapes; a radial blob under a card reads as a blurred shadow with zero filters). `fillGradient` also follows an animated `width` (the caption dash) as the docs say.
- The look tools: `contactSheet({ times, columns, cellWidth })` + `snapshot` + `inspect({ layers: 'none' })` + `save-image.py` — the whole review loop took three cycles.

## Stumbles

### 1. A `set` keyframe at a later `at` is applied at build time   [LIBRARY-BUG]
- tried: `{ type: 'text', text: '{value} of 4 done', initial: { value: 2 }, keyframes: [{ at: 3.55, set: { value: 3 } }] }` (the counter should jump 2 → 3 when the check pops at 4.3 s).
- happened: the text read "3 of 4 done" from frame 0; "2 of 4" never appeared. No warning.
- cause: most likely GSAP's `immediateRender` default for zero-duration / `set` tweens inside a timeline (they render their values when the timeline is built). The docs say "set — instantaneous property assignment at `at`", so the behaviour contradicts the spec. (Verified for `value`; I did not test other props.)
- workaround: `{ at: 3.55, to: { value: 3 }, duration: 1 / FPS }` — a one-frame tween behaves.
- would have prevented it: fix `set` (build it with `immediateRender: false` when `at > 0`), or until then a pitfalls line "a `set` at `at > 0` shows its value from the start — use a one-frame `to`".

### 2. Multi-line text is centre-aligned by default   [SPEC-ODD]
- tried: `text: 'Build habits\nthat stick.'` with the default top-left anchor, expecting a left-aligned block.
- happened: the shorter line was centred under the longer one.
- cause: PixiJS's `TextStyle.align` default is `'left'`, so the library (or its default style) must set `'center'`. Neither the cheatsheet nor `docs/dsl.md` says which it is (`align` is only listed as "accepted").
- fix: `style: { align: 'left' }`.
- would have prevented it: one cheatsheet line: "multi-line text is centred unless `align` is set".

### 3. No arc / progress-ring shape; the sweep had to be baked as images   [GAP → hand-roll]
- tried: a progress ring that sweeps 0 → 50 %, then 50 → 75 % on the tap. Looked at `circle` (full stroke only), `path` (`d` is baked, not animatable), `mask` (a sweep > 180° would need two rotating half-discs; masks inside a `threeD` card are also flagged as unsupported).
- did: `ringImage(frac)` draws one arc on a 2-D canvas (gradient stroke, round caps) → `canvas.toDataURL()` as an asset; 24 + 18 eased states (`easeOutCubic` = `power3.out`, so the `{value}%` count-up matches the arc exactly), one `image` layer each with `at: (frame − 0.5) / FPS`, `duration: 2 / FPS` (half a frame early + overlap: no float gaps on the frame grid; the later layer draws on top). The last state holds. Worked first try, no warnings, 42 extra layers.
- would have prevented it: `shape: 'arc'` (or `circle` with `startAngle` / `sweep`) with animatable angles. Second best: a recipe for "image sequence as per-frame states".

### 4. A `threeD` composition clips at its own `width/height` — leave room for shadows   [GAP → avoided]
- The phone card is 600×1040 for a 400×820 body only so that the radial shadow blob below/right of the body stays inside the texture. I guessed this from "children are drawn into one texture"; it is not written anywhere that content outside the composition's rectangle is cut (for a 2-D composition I still do not know whether it is).
- would have prevented it: a line in the `composition` section: "a `threeD` composition renders into a `width × height` texture: anything outside is clipped (glows, shadows, overshoot)".

### 5. Visibility rule at frame boundaries is not stated   [GAP → avoided]
- For the per-frame ring states I needed to know whether a layer with `at = 1.5 + k/30` is visible at frame `45 + k` (`t = frame / 30`, float equality?). The docs say the lifespan is `[at, at + duration)` but not how `t` is computed. I side-stepped it by starting each state half a frame early. Pitfall 6 ("snap to the frame grid") hints at the problem without saying what the rule is.
- would have prevented it: "a layer is visible when `at ≤ frame / frameRate < at + duration`; times are compared as floats — start exact-frame lifespans half a frame early".

### 6. Exporting from `agent-browser eval` — unknown eval timeout   [TOOLING]
- `movie.render()` takes about real time; I did not know whether a 12 s+ `eval` would be killed, so I started the render as a background promise (`window.__r = null; movie.render(...).then(b => window.__r = { size: b.size })`) and polled `window.__r` with `wait 10000`. Worked (8.1 s for 12 s of 1080²).
- would have prevented it: a line in `ai/SKILL.md` step 5 with that polling snippet.

### 7. `from` keyframes at `at > 0`: trust lost after #1   [MY-MISTAKE / GAP]
- After #1 I did not dare use `{ at: 0.2, from: {...}, to: {...} }` on the phone card (the recipes only show `from` at `at: 0`) and switched everything to `initial` + `to`. Harmless, but the docs could say whether a `from`/`fromTo` at a later `at` renders its `from` values before `at` (GSAP's `immediateRender` again).

## Wished the library had
- `shape: 'arc'` (animatable start / sweep angle) — progress rings are the first thing any app promo or dashboard needs.
- `set` that honours `at` (see #1).
- A group / null parent so siblings share one entrance (I wrote `group()`; a built-in `parent` or `group` layer would also give shared alpha, which my helper cannot do — overlapping low-alpha shadows + cards fade separately).
- A blur / drop-shadow shorthand on shapes (`shadow: { blur, offset, alpha }`), so soft shadows do not need the radial-gradient trick or a custom filter.
- Text `align` default documented (or defaulting to `'left'` like PixiJS).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)

```js
// @docs-only — a group of sibling layers that share a lifespan, slide in from their own x,y and (optionally) slide out
function group(layers, { at, until, slide = [0, 36], dur = 0.6, stagger = 0, exit }) {
  return layers.map((l, i) => {
    const { x, y } = l.initial, alpha = l.initial.alpha ?? 1;
    const kf = [{ at: i * stagger, to: { alpha, x, y }, duration: dur, ease: 'power3.out' }];
    if (exit) kf.push({ at: -exit.dur, to: { alpha: 0, x: x + exit.slide[0], y: y + exit.slide[1] }, duration: exit.dur, ease: 'power2.in' });
    return { ...l, at, duration: until - at, initial: { ...l.initial, alpha: 0, x: x + slide[0], y: y + slide[1] }, keyframes: [...kf, ...(l.keyframes ?? [])] };
  });
}

// @docs-only — soft shadow with no filter: a radial ink→transparent blob slightly larger than the card, offset downward
const shadow = (name, cx, cy, w, h, alpha) => ({
  type: 'shape', shape: 'rect', name, width: w, height: h, initial: { x: cx, y: cy },
  fillGradient: { type: 'radial', radius: 0.5, stops: [[0, `rgba(31,27,58,${alpha})`], [0.55, `rgba(31,27,58,${alpha * 0.45})`], [1, 'rgba(31,27,58,0)']] },
});

// @docs-only — a growing arc as per-frame image states (until there is an arc shape). easeOutCubic == power3.out,
// so a {value} counter with the same timing stays locked to the arc.
function ringSteps(name, startFrame, frames, from, to, holdUntil, pos) {
  const assets = [], layers = [], easeOutCubic = t => 1 - (1 - t) ** 3;
  for (let k = 1; k <= frames; k++) {
    const id = `${name}-${k}`, at = (startFrame + k - 1 - 0.5) / FPS;          // half a frame early: no float gap
    assets.push({ name: id, src: ringImage(from + (to - from) * easeOutCubic(k / frames)) });   // canvas 2D arc → toDataURL()
    layers.push({ type: 'image', asset: id, name: id, at, duration: k === frames ? holdUntil - at : 2 / FPS,
                  initial: { ...pos, anchorX: 0.5, anchorY: 0.5, scale: 0.5 } });
  }
  return { assets, layers };
}
```
