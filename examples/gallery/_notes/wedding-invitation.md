# wedding-invitation — stumble notes
Model: fable   Cycles: 2 (first run → one batch of three small design edits → run; a third run only for poster / export)   Result: works

## Went smoothly because the docs said so
- `window.__logs` was `[]` and `__ready` true on the very first run and stayed so; `inspect(f, { layers: 'none' })` returned no issues at 11 frames.
- The cheatsheet's anchor rule made every "draw-on" a one-liner: a rect with `anchorX: 0` / `anchorX: 1` / `anchorY: 0` / `anchorY: 1`
  whose `width`/`height` tweens from 0 is a line being drawn from a chosen end. Four of those per border line = a border that traces itself,
  and the round-two note ("shapes redraw before they are culled") meant `width: 0` needed no workaround.
- "Every primitive draws centred on its local origin (so anchor and pivot semantics line up)" + "ellipse: radiusX radiusY anchorX anchorY":
  an ellipse with `anchorX: 0` rotates and scales about its left tip, so a leaf unfurls from the stem with one `scale: 0 → 1` keyframe.
- `from`/`from+to` holding the start value from the layer's start (round-two note): every rising line is `at: <time>` + one keyframe at 0,
  no `initial.alpha: 0` boilerplate.
- `fillGradient` with alpha stops: the soft-ended gold rule, the card's centre light, the sparkle halos, the sheen band, the linen vignette — no images.
- `custom` filter with pixi's `BlurFilter` + `filterArea` (from `docs/dsl.md`, confirmed by the film-titles note): a soft card shadow, first try.
- Omitting `duration` on the one-shot sfx (round-two note): no "goes silent" warning, nothing to measure; `movie.audioBuffer.duration` = 12.
- `blendMode` (announced mid-task): `'multiply'` on the blurred shadow, `'screen'` on the sparkle halos and on a masked sheen band all rendered
  as expected (the sheen lightens the dark serif where it passes, like light over glossy print), no warning. Mask + blendMode on one layer is fine.
- A `mask` with no `at` of its own sharing the layer's lifetime (round-two note): the sheen's card-shaped mask needed no timing at all.

## Stumbles
### 1. Another author's browser answered my long `agent-browser eval` — twice   [TOOLING]
- tried: `agent-browser --session wedding-invitation eval "movie.contactSheet({ times: [...10], as: 'dataURL' })"` (a call that takes several seconds).
- happened: the saved sheet was a 16:9 product film ("ORRI ONE"); the retry was a "FLOW" gradient study; both files had the identical byte
  size (1,074,362). A `document.title` eval, a single `snapshot` and an `inspect` loop in the same session all came back as mine.
- cause: unknown — only the slow calls were crossed; exactly the case BRIEF.md warns about.
- worked around: compute inside the page and fetch with a fast eval:
  `eval "movie.contactSheet({...}).then(u => { window.__sheet = u; return 'stored' })"` → `eval "window.__sheet" | save-image.py ...`,
  the same for `render()` (store `{ size, seconds }` in `window.__mp4`, `wait`, then read it). Checked `document.title` alongside each fetch.
- would have prevented it: nothing in the library; a line in BRIEF/SKILL — "for slow evals (contactSheet, render) store the result on `window`
  and read it back with a second, fast eval" — would have saved two cycles.

### 2. No stroke draw-on, so the double border is 8 growing rects   [GAP / hand-roll]
- tried: wanted `strokeDraw: 0 → 1` on a rect outline (After Effects "trim paths").
- happened: not in the DSL (known from the brief), so each border line is four rects anchored at the corner they start from, chained end to
  start with durations proportional to their lengths so the "pen" moves at one speed and eases into each corner (`sine.inOut` per side).
  Each side overhangs half a stroke so the corners close. Pattern below.
- would have prevented it: a `draw: { from, to }` (or `trim`) property on stroked shapes.

### 3. No arc draw-on for the rings; a `path` cannot be anchored at its base   [GAP]
- tried: two interlocking gold rings that draw themselves; leaves as a pointed-leaf `path` growing from the stem.
- happened: a circle's stroke cannot be trimmed, so the rings scale-pop with `back.out` instead. A leaf `path` has no `anchorX` (the
  anchor table says "—" for line / polygon / path), so it would scale about its bounds centre; wrapping ~70 leaves in pivoted compositions
  (the aurora-logo workaround) was too heavy, so leaves are ellipses with `anchorX: 0`.
- would have prevented it: `anchorX/anchorY` (or `pivot` in path units) on `path`, and arc trimming.

### 4. `inspect` and text whose `y` animates   [SPEC-ODD]
- tried: every line rises 16–24 px while fading in; `inspect` at frames long after the rise finished.
- happened: `issues: []` everywhere — correct on the screenshots, but pitfalls 30b says inspect "ignores text whose x / y is animated", so I
  cannot tell whether my 10 text layers were checked or skipped. I verified the stacked boxes (Aiko / & / Daniel) by arithmetic and by eye.
- would have prevented it: state whether "animated" means "has an x/y keyframe at this frame" or "has any x/y keyframe", or list skipped
  layers in the result (`skipped: ['name-aiko', …]`).

### 5. Pixi filter classes come from the page's own `pixi.js` import   [GAP, small]
- tried: a blurred card shadow with `{ type: 'custom', filter: <Pixi Filter> }`.
- happened: `docs/dsl.md` says "any PIXI Filter instance" but neither it nor the template shows `import { BlurFilter } from 'pixi.js'`; I only
  trusted it because a round-one note had done it. Worked (the importmap gives one pixi instance).
- would have prevented it: one commented import line in `template.html` or the dsl example.

## Wished the library had
- Stroke / arc draw-on (`trim`), the single most-wanted motion-design primitive here (border, rule, rings all wanted it).
- Anchors on `path`, or `rotateAbout: [x, y]`, so a drawn leaf / petal can grow from its base without a composition wrapper.
- A group / null parent: a sprig (stem + 6 leaves + berries = ~10 layers) cannot sway or settle as one without repeating keyframes on all of them.
- Animatable `letterSpacing` (a tracking-in title is a staple of invitations).
- A soft (gradient) mask — the sheen is masked hard to the card; fine here, but a feathered reveal of the names was impossible.
- A `safeArea` option on `inspect` for portrait feed posts (checking the outer 5 % by arithmetic each time is tedious).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)

### A rectangle border that traces itself clockwise (no stroke draw-on: four growing rects, constant pen speed, eases into corners)
```js
// @recipe border-trace
function borderTrace(name, L, T, R, B, sw, color, at, speed = 1700) {
  const lenH = R - L + sw, lenV = B - T + sw, dH = lenH / speed, dV = lenV / speed;   // half-stroke overhang closes the corners
  const side = (sfx, geom, init, kf) => ({ type: 'shape', shape: 'rect', name: `${name}-${sfx}`, at, ...geom,
    initial: { fillColor: color, ...init }, keyframes: [{ ...kf, ease: 'sine.inOut' }] });
  return [
    side('top',    { width: 0, height: sw, anchorX: 0 }, { x: L - sw / 2, y: T }, { at: 0,           to: { width: lenH },  duration: dH }),
    side('right',  { width: sw, height: 0, anchorY: 0 }, { x: R, y: T - sw / 2 }, { at: dH,          to: { height: lenV }, duration: dV }),
    side('bottom', { width: 0, height: sw, anchorX: 1 }, { x: R + sw / 2, y: B }, { at: dH + dV,     to: { width: lenH },  duration: dH }),
    side('left',   { width: sw, height: 0, anchorY: 1 }, { x: L, y: B + sw / 2 }, { at: 2 * dH + dV, to: { height: lenV }, duration: dV }),
  ];
}
return [...borderTrace('outer', 98, 98, 982, 1252, 2.4, '#bf9d60', 0.7), ...borderTrace('inner', 110, 110, 970, 1240, 1.2, '#bf9d60', 1.05)];
```

### A botanical sprig: a stem that grows, ellipse leaves anchored at their base that unfurl when the tip passes them
```js
// @recipe sprig
let seed = 2027; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const deg = r => r * 180 / Math.PI, rotUp = (dx, dy) => deg(Math.atan2(dx, -dy)), rotRight = (dx, dy) => deg(Math.atan2(dy, dx));
function stem([bx, by], [dx, dy], len, at, dur = 0.9, leaves = 6, leafLen = 42) {
  const out = [{ type: 'shape', shape: 'rect', width: 1.8, height: 0, anchorY: 1, at, initial: { x: bx, y: by, rotation: rotUp(dx, dy), fillColor: '#6d8268' },
    keyframes: [{ at: 0, to: { height: len }, duration: dur, ease: 'power2.out' }] }];
  const px = -dy, py = dx;                                                   // perpendicular
  for (let i = 0; i < leaves; i++) {
    const s = len * (0.2 + 0.8 * i / Math.max(1, leaves - 1)), side = i % 2 ? -1 : 1, ang = (50 + (rnd() - 0.5) * 15) * Math.PI / 180;
    const lx = dx * Math.cos(ang) + px * side * Math.sin(ang), ly = dy * Math.cos(ang) + py * side * Math.sin(ang);
    const L = leafLen * (1 - 0.4 * i / leaves), reach = dur * (1 - Math.sqrt(1 - s / len));   // when a power2.out tip passes s
    out.push({ type: 'shape', shape: 'ellipse', radiusX: L / 2, radiusY: L * 0.18, anchorX: 0, at: at + reach + 0.04,
      initial: { x: bx + dx * s, y: by + dy * s, rotation: rotRight(lx, ly), fillColor: ['#8da189', '#6d8268', '#a9b8a2'][i % 3], scale: 0 },
      keyframes: [{ at: 0, to: { scale: 1 }, duration: 0.75, ease: 'back.out(1.3)' }] });
  }
  return out;
}
const a = 17 * Math.PI / 180;      // a corner bouquet: one stem hugging each edge
return [...stem([156, 156], [Math.cos(a), Math.sin(a)], 185, 2), ...stem([156, 156], [Math.sin(a), Math.cos(a)], 170, 2.18, 0.85, 5, 40)];
```
