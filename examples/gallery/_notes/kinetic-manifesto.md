# kinetic-manifesto — stumble notes
Model: fable   Cycles: 4   Result: works

## Went smoothly because the docs said so
- Layer-local keyframe `at`, scenes stacked over opaque rects with array order as z-order, `anchorX/anchorY: 0.5` for centred text, `{value}` counter with `format`, `contactSheet` / `inspect({ layers: 'none' })` / `snapshot` piped through `save-image.py` — all exactly as written; the first run had `__logs: []`.
- Pitfall 5 (audio shorter than its layer) made me size every one-shot sfx layer to its clip length (`afinfo`), so 25 audio layers produced zero warnings and the RMS of `movie.audioBuffer` shows hits exactly on the 0.6 s beat grid.
- The scene-flood recipe (radius ≥ half the diagonal, `power2.in`) worked first time, with a stroked circle on top as an accent rim (`fillAlpha: 0`, `strokeColor`, `strokeWidth`).
- Pitfall 6 (snap times to the frame grid): a 100 BPM grid is 18 frames per beat, so every event is on an integer frame via `Math.round(t * 30) / 30`.

## Stumbles
### 1. A later `set` keyframe is applied from frame 0   [LIBRARY-BUG]
- tried: index counter `text: '0{value}'`, `initial: { value: 1 }`, keyframes `[{ at: 2.55, set: { value: 2 } }, { at: 4.95, set: { value: 3 } }, …]`.
- happened: frames 0–2.5 s already read "02"; after seeking backwards (8.5 s → 2.6 s) it read "03". No warning. Isolated repro: a `{value}` text with `initial.value = 1` and one keyframe `{ at: 1, set: { value: 1000000 } }` measures 156 px wide at frame 0 (should be 22 px). The same keyframe as `{ at: 1, to: { value: 1000000 }, duration: 1/30 }` measures 22 px at frame 0 and 156 px at frame 45, and 22 px again after seeking back to 0.
- cause (guess): `set` becomes a zero-duration GSAP tween with GSAP's default `immediateRender: true`, so its value is rendered when the timeline is built, regardless of position.
- would have prevented it: the fix (`immediateRender: false` for `set`), or until then a cheatsheet line: "`set` renders immediately — for a jump at time t use `to` with `duration: 1/frameRate`".

### 2. A rect `width` / `height` tween is not redrawn on a jump seek   [LIBRARY-BUG]
- tried: wipe covers as rects growing from 0 (`width: 0 → 1280` over 0.3 s, layer `at: 2.4`; another with `height: 0 → 720`), each with an accent band animated on `x`.
- happened: in every `contactSheet` / `snapshot` frame inside a wipe the band was in the right place but the cover was not drawn at all (old scene fully visible); from the next sampled frame after the tween it was drawn. `inspect` bounds reported the width correctly growing (0 → 25 → 400 → 1154 → 1280 over frames 72–82). Jumping from 1.4 s straight to 8.47 s left a cover whose tween had *finished* at 7.5 s undrawn (so bar 4's black text sat on black). Seeking frame by frame through the wipe (what playback and export do) rendered it correctly. A circle `radius` tween rendered mid-tween; an isolated probe with the rect at `at: 0` also rendered mid-tween.
- cause (guess): shape geometry is rebuilt from the tween's update callback; when a seek jumps into or across the tween of a layer that only just became visible the geometry is not rebuilt for that frame, while transform props (`x`, `y`, `scaleX`) are applied.
- consequence: the Controller's scrub bar is a jump seek too, so a viewer scrubbing sees wrong frames.
- would have prevented it: the fix, or a pitfalls line: "geometry tweens (`width`, `height`, `radius`, `cornerRadius`…) can render stale on a jump seek (contactSheet, scrub) — for wipes and reveals prefer transform tweens". Workaround used: full-size cover rect sliding on `x`/`y` (identical look for a solid colour); strike-through via `scaleX: 0 → 1` with `anchorX: 0` instead of `width`.

### 3. A second `Movie` in the same page for an isolated repro broke the real one   [MY-MISTAKE | TOOLING]
- tried: `new Movie()` on an offscreen canvas inside `agent-browser eval`, then `m.destroy()`.
- happened: the next `movie.snapshot()` of the piece threw `TypeError: Cannot read properties of null (reading 'clear')` from Pixi's batcher via `Movie._renderNow → gotoFrame → snapshot`. A page reload fixed it.
- cause: destroying one Movie tears down Pixi state the other one shares (same module instance).
- would have prevented it: a SKILL.md note "one Movie per page — open a second tab for an isolated repro" (or make `destroy()` not touch shared state).

### 4. `inspect` reports deliberate typographic collisions and vertical punctuation as issues   [SPEC-ODD]
- tried: tategaki column = one text layer per glyph, `、` / `。` placed top-right of a half-height cell (box shifted +0.5 em, −0.05 em); and the bar-1 collision where つくる。 lands on MAKE / THINGS. for 4 frames before knocking them out.
- happened: `text layers "col-2-6" and "col-2-7" overlap by 34% of the smaller one` (em boxes; the ink never touches) and `"make" and "tsukuru" overlap by 57%` at the poster frame (by design).
- would have prevented it: an ink/trimmed-bounds overlap test, or a per-layer `inspect: false` / `collide: true` flag so `issues` stays meaningful; a `movie.inspectRange(from, to, step)` that returns only the frames with issues would cut the manual loop.

### 5. Measuring text to justify words to a width is on me   [GAP]
- tried: same-width "BREAK. / FIX. / SHIP." (so FIX. becomes huge) and words that must stop 80 px from the edge.
- happened: no `measureText` in the API; `w` only exists inside expressions on the same layer (fine for `'-w'`, useless for choosing a font size). I measured with a 2D canvas (`ctx.font = weight size family`) and solved `size = target / w100 × 100`; it matched Pixi's layout to the pixel.
- would have prevented it: `movie.measureText(text, style)` or a `fitText(text, style, width)` helper; or a cheatsheet line recommending canvas `measureText`.

### 6. Vertical Japanese is hand-rolled   [GAP | hand-roll]
- no writing mode on text; one layer per glyph, advance 1.1 em, punctuation in a 0.55 em cell. A loop makes it easy, but it should be a recipe (below).

### 7. Mixed-script small labels pick the CJK fallback for you   [GAP, minor]
- "MAKING THINGS … / ものづくり宣言" in a `ui-monospace, …, monospace` stack renders the kanji in whatever CJK font the browser chooses. It was acceptable, but the cheatsheet could say: "mixing scripts in one layer: put the CJK family before the generic keyword".

## Wished the library had
- `set` that is a true jump at its `at` (stumble 1).
- Geometry tweens that survive jump seeks (stumble 2) — scrubbing depends on it.
- `inspect`: ink-based overlap or a per-layer opt-out, and a range form that returns only the frames with issues.
- `measureText` / `fitText`; a vertical writing mode (or a `tategaki` recipe); a `destroy()` that is safe with another Movie on the page.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// @docs-only  — justified slam words: fit the font size to a target width with the same font the renderer uses
const mctx = document.createElement('canvas').getContext('2d');
const measure = (str, family, weight, size, lsEm = 0) => { mctx.font = `${weight} ${size}px ${family}`; return mctx.measureText(str).width + lsEm * size * (str.length - 1); };
const fit = (str, family, weight, targetW, lsEm = 0) => Math.floor(targetW / measure(str, family, weight, 100, lsEm) * 100);
['BREAK.', 'FIX.', 'SHIP.'].forEach((wd, i) => sequences.push({
  type: 'text', text: wd, at: 0.3 * i, duration: 0.3,
  style: { fontFamily: 'Arial Black', fontWeight: '900', fontSize: fit(wd, 'Arial Black', '900', 880, -0.025), letterSpacing: -0.025 * 100, fill: '#fff' },
  initial: { x: 640, y: 345, anchorX: 0.5, anchorY: 0.5 },
  keyframes: [{ at: 0, from: { scale: 1.9, rotation: i % 2 ? 3 : -3, alpha: 0 }, to: { scale: 1, rotation: 0, alpha: 1 }, duration: 0.14, ease: 'expo.out' }],
}));

// @docs-only — tategaki (vertical Japanese): one layer per glyph; punctuation top-right of a half-height cell
function column(str, { x, yTop, size, fill, at, stagger = 0.05, duration }) {
  let y = yTop;
  return [...str].map((ch, i) => {
    const punct = '、。'.includes(ch), adv = size * (punct ? 0.55 : 1.1);
    const cx = x + (punct ? size * 0.5 : 0), cy = punct ? y - size * 0.05 : y + adv / 2;
    y += adv;
    return { type: 'text', text: ch, at: at + i * stagger, duration: duration - i * stagger,
      style: { fontFamily: "'Hiragino Kaku Gothic StdN', 'Hiragino Sans', sans-serif", fontWeight: '800', fontSize: size, fill },
      initial: { x: cx, y: cy, anchorX: 0.5, anchorY: 0.5 },
      keyframes: [{ at: 0, from: { alpha: 0, y: cy - 18 }, to: { alpha: 1, y: cy }, duration: 0.22, ease: 'power3.out' }] };
  });
}

// @docs-only — a hard wipe that survives scrubbing: a full-size cover SLIDES in (transform tween), an accent band rides its edge
const wipeRight = (color, at, W = 1280, H = 720, dur = 0.3) => [
  { type: 'shape', shape: 'rect', width: W, height: H, at, initial: { x: -W / 2, y: H / 2, fillColor: color }, keyframes: [{ at: 0, to: { x: W / 2 }, duration: dur, ease: 'power3.inOut' }] },
  { type: 'shape', shape: 'rect', width: 26, height: H, anchorX: 1, at, duration: dur + 1 / 30, initial: { x: 0, y: H / 2, fillColor: '#ff3b1f' }, keyframes: [{ at: 0, to: { x: W }, duration: dur, ease: 'power3.inOut' }] },
];
```
