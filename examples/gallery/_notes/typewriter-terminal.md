# typewriter-terminal — stumble notes
Model: fable   Cycles: 4 (run → schedule trim → layout trim → audio levels; export/poster on the third page)   Result: works

Piece: `examples/gallery/typewriter-terminal.html` — 1280×720, 12 s, 30 fps. A `threeD` composition holds the terminal window
(≈ 90 layers: 27 single-glyph layers for the two typed commands, whole-line layers for the output, two bars locked to `{value}%`
counters, a `set`-driven block cursor, generated scanline image, radial vignette); the title card is plain 2D on top, its tagline
typed by a stepped rect mask. 60 audio layers (bgm loop + per-keystroke clicks, pops, chime, swoosh). `window.__logs` was `[]`
from the second run on; `inspect` returned `[]` at 8 frames (60, 135, 255, 283, 285, 345, 359 and more).
Export: `movie.render({ format: 'mp4' })` → 995,657 bytes, 7.3 s wall for 12 s of 720p (started as a background promise from
`agent-browser eval`, polled with `wait --fn "window.__r !== null"`); `__logs` still `[]` afterwards.

## How I revealed typed text (the brief asked for this)
Two techniques, both in the piece, both worked first time:

1. **One text layer per character** (the terminal commands). Column `k` sits at `x0 + k × ADV`, `ADV = measureText('M')` with the
   same font string Pixi builds; each glyph layer has `at: <its keystroke time>` and no `duration`. The block cursor is ONE rect with
   `set: { x }` at every keystroke and `set: { alpha }` toggles while idle. Pros: exact; each glyph carries its own token colour
   (`$` green, `create-nova` cyan) for free; the cursor position is known; **works inside a `threeD` composition** (masks do not).
   Cons: 27 layers for 27 glyphs (fine), only for monospace unless you also measure prefix widths; glow `padding` per glyph.
2. **One text layer + a stepped mask** (the tagline "ship in seconds." in a proportional font). Mask rect `anchorX: 0`, `width: 0`,
   and one `set: { width: prefix[k] + 2 }` per character, `prefix[k] = measureText(text.slice(0, k))` — kerning stays intact because
   the whole string is drawn once. Pros: 1 layer + 1 mask, perfect proportional typesetting. Cons: not available on `threeD` layers
   (so not inside my window); one colour per layer; without the `+ 2` slack a glyph's right overhang is shaved for one step.

**Verdict:** per-character layers are the better default for terminal / monospace typing (colours, cursor, 2.5D all fall out of it);
the stepped mask is the better tool for proportional display type. Per-line reveals (`from: { alpha: 0 }` over 2 frames) are right
for program *output* — a terminal prints lines, it does not type them. Both could be one feature (see "Wished").

## Went smoothly because the docs said so
- The round-two note "`set` keyframes are undone when you seek back" is true: every contact-sheet tile (a jump seek) shows the
  cursor at the right column and the right blink phase; the tagline mask (`set: { width }` × 16) is correct at every sampled frame.
- "Mask keyframes are measured from the layer's start" — the tagline text has `at: T.tag`, its mask has `at: k × 0.05`; no arithmetic.
- `from` / `from + to` at `at: 0` for every appearance (2-frame fade for output lines, slide-in for the checks) — no `initial.alpha`.
- Bar-chart recipe: `anchorX: 0` + `width` tween and a `{value}%` counter with the same `at`/`duration`/`ease` stay locked; a
  `to: { fillColor: GREEN }` / `to: { fill: GREEN }` with `colorSpace: 'oklab'` turns both green at 100 % without a muddy midpoint.
- `composition` + `threeD: true`, `pivotX/pivotY` = centre, then `to: { z: -800, x: 188, rotationY: 18 }` — the window steps back
  and turns toward the title exactly as the depth-cards recipe implies. One keyframe. The screen position after perspective is
  `640 + (x − 640) × 989 / (989 − z)`, which I used to land the window's left edge at 5 % margin.
- "Omit `duration` on a one-shot sound effect": 60 audio layers, zero warnings, nothing to measure. `loop: true` + no duration for bgm.
- `measureText` with the renderer's font string (round-one notes) matches Pixi to the pixel: the per-glyph columns and the cursor
  line up; the proportional prefix widths cut the mask exactly between letters.
- `inspect` did not flag adjacent single-glyph layers even with `padding: 10` glow on each — bounds are the glyph box, not the texture.
- The only two warnings I ever got were exact and actionable: `layer "cta" starts at 12.07s, after its composition ends (12s)`.

## Stumbles
### 1. A derived schedule overran the composition by 0.75 s   [MY-MISTAKE]
- tried: every time is derived (`T.enter1 = snap(t + 0.28)` …) from a per-keystroke delay of `0.055 + rnd() × 0.06`.
- happened: the first run warned that the last two layers start after 12 s. The typing was slower than my head estimate.
- cause: me. The warning did its job; I printed `window.__T` and trimmed delays.
- would have prevented it: nothing in the library; a habit worth one SKILL.md line — "expose your derived schedule on `window` and
  read it with the logs on the first run".

### 2. No typewriter / per-character reveal in the DSL   [GAP → hand-roll, see top]
- tried: looked for a `chars` / `reveal` prop on text; only `{value}` can change over time.
- happened: wrote the two hand-rolled forms above (≈ 40 lines incl. the cursor and the clicks). No retry, but it is the first thing a
  terminal, a chat bubble or a subtitle piece needs, and inside a `threeD` composition only the per-glyph form is possible.
- would have prevented it: an animatable `chars` on text (`initial: { chars: 0 }`, `set: { chars: k }` or `to: { chars: N }` with
  `ease: 'steps(N)'`), or a `typewriter()` preset returning glyph layers + cursor keyframes; failing that, the recipe below.

### 3. Rotated `threeD` plane shows stair-stepped edges   [LIBRARY-BUG, cosmetic]
- tried: the window composition at `z: -800`, `rotationY: 18`.
- happened: the straight top edge of the title bar reads as a jagged staircase in `snapshot(345)` (see the poster, top-left window
  edge); the text inside is fine. Edges inside the texture are anti-aliased, so this looks like the plane's texture being minified
  (≈ 0.55×) without mipmaps / linear filtering, or the plane itself drawn without edge AA.
- cause (guess): render-texture sampling on the 3D plane. Nothing to change in the spec.
- would have prevented it: mipmaps or `scaleMode: 'linear'` on the composition texture, or a `resolution` option on `threeD` compositions
  (like the `three` layer has) so the texture can be rendered at 2× and minified cleanly.

### 4. `wait --fn "__ready || __logs.length"` returns before init finishes   [TOOLING | MY-MISTAKE]
- tried: the obvious wait condition. On the first run two *build* warnings landed in `__logs` while audio was still decoding, so
  `ready` was `undefined` when I read it and I briefly thought init had failed.
- would have prevented it: a template comment — wait for `window.__ready === true || window.__logs.some(l => l.startsWith('init failed'))`.

### 5. A title bar with rounded top corners only   [GAP, minor]
- tried: a window body (rounded 12) with a darker title bar whose top corners follow the window and whose bottom corners are square.
- happened: `cornerRadius` is one number and masks are not allowed inside a `threeD` composition, so the bar is three rects:
  rounded bar 12 px taller than needed + a square "patch" over its bottom 12 px + a 1 px rule. Works, invisible, but it is a trick.
- would have prevented it: per-corner `cornerRadius: [tl, tr, br, bl]`.

### 6. Symbols outside the monospace font break column alignment   [GAP, minor]
- `◆ ▸ → ✓` fall back to another font inside the `Menlo` stack and have their own advance; the arrows render small and light.
  I avoided the issue by placing every column explicitly (`colX(col)`) instead of relying on the string's own spacing; the
  progress bars and labels are separate layers at fixed columns.
- would have prevented it: a cheatsheet line — "symbols the font lacks fall back and do not keep the monospace advance: place
  columns from `colX`, not from the string".

### 7. Mix levels are guesswork without ears   [GAP, minor]
- tried: bgm at `volume: 0.28`, clicks 0.3–0.55, like other pieces.
- happened: nothing warned, but an RMS trace of `movie.audioBuffer` (per 0.5 s, pitfall 31's trick without the render) showed the bed
  at ≈ 0.005 RMS (≈ −46 dBFS) and the loudest moment (swoosh) at 0.026 — a very quiet film. I raised every level ~1.5× and re-measured.
- would have prevented it: a loudness note per asset in the brief / cheatsheet (bgm.mp3 is quiet), or `movie.audioStats()` returning
  peak / RMS so a session can balance a mix it cannot hear.

## Wished the library had
- Animatable `chars` on text (or a `typewriter()` preset) — see stumble 2. Also text **runs** in one layer
  (`text: [['$ ', '#3fb950'], ['npx ', '#e6edf3']]`) so syntax colouring does not need one layer per token.
- `movie.measureText(text, style)` (every author so far has hand-rolled the canvas version).
- Per-corner `cornerRadius`; masks inside `threeD` compositions (the texture is flat, so it should be possible).
- A `resolution` / filtering option for `threeD` compositions (stumble 3).
- GSAP's `steps(n)` ease documented as valid (I did not dare rely on it for the blink and used `set` toggles — which worked well).

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// @docs-only — typewriter, two ways. measure() uses the renderer's own font string, so columns and cursor are exact.
const mctx = document.createElement('canvas').getContext('2d');
const measure = (s, font) => { mctx.font = font; return mctx.measureText(s).width; };
const snap = t => Math.round(t * 30) / 30;

// (a) monospace / terminal: one layer per glyph, a single cursor rect driven by `set`
function typeMono({ tokens, x0, y, at, font = "400 23px Menlo, monospace", family = 'Menlo, monospace', size = 23, cps = 14 }) {
  const ADV = measure('M', font), layers = [], cursor = [{ at, set: { alpha: 1, x: x0 } }];
  let t = at, col = 0;
  for (const [str, fill] of tokens) for (const ch of str) {
    t = snap(t + 1 / cps);
    if (ch !== ' ') layers.push({ type: 'text', text: ch, at: t, style: { fontFamily: family, fontSize: size, fill },
                                  initial: { x: x0 + col * ADV, y, anchorX: 0, anchorY: 0.5 } });
    col++; cursor.push({ at: t, set: { x: x0 + col * ADV } });
  }
  for (let b = snap(t + 0.5), on = false; b < t + 3; b = snap(b + 0.5), on = !on) cursor.push({ at: b, set: { alpha: on ? 1 : 0 } });
  layers.push({ type: 'shape', shape: 'rect', width: ADV, height: size * 1.15, anchorX: 0, anchorY: 0.5,
                initial: { x: x0, y, fillColor: '#e6edf3', alpha: 0 }, keyframes: cursor });
  return { layers, end: t };
}

// (b) proportional display type: one text layer, a mask whose width steps to each prefix width (kerning intact)
function typeMasked({ text, x, y, at, style, font, step = 0.05 }) {
  const keys = Array.from({ length: text.length }, (_, i) => ({ at: snap((i + 1) * step), set: { width: measure(text.slice(0, i + 1), font) + 2 } }));
  return { type: 'text', text, at, style, initial: { x, y, anchorX: 0, anchorY: 0.5 },
           mask: { type: 'shape', shape: 'rect', width: 0, height: style.fontSize * 1.5, anchorX: 0, anchorY: 0.5,
                   initial: { x: x - 2, y, fillColor: '#fff' }, keyframes: keys } };
}
```
