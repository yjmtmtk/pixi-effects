# aura-launch — stumble notes
Model: fable   Cycles: 4   Result: works
Export: `movie.render({ format: 'mp4' })` → 1,671,694 bytes (video/mp4) in 8 s for 12 s at 1280×720 · `__logs` = `[]` on every run · `inspect` issues = `[]` at frames 40 / 75 / 100 / 190 / 225 / 230 / 258 / 330 / 345.

## Went smoothly because the docs said so
- `orbit({ at, duration, degrees, start: 0, dollyZoom })` + a plain `{ type: 'camera' }` before it with a non-overlapping lifespan: no warning, no jump at the cut (both default to the same radius for the same `fov`). The cheatsheet's "several cameras may exist if their lifespans do not overlap" was exactly what I needed.
- Per-letter `threeD` text from depth (recipe `depth-title`) worked first time, including the `fill` colour flash and `padding ≥ 2·blur` for the glow.
- A card as a `composition` with `threeD: true` + `pivotX/Y` at the centre (recipe `depth-cards`), `from`+`to` entrance, `repeat/yoyo` bob, negative `at` for the exit.
- `fillGradient` radial with alpha stops made the glowing halo ring (stops at 0.62/0.8/0.865/0.92/1) and the vignette — no filters, no canvas images.
- `shape: 'path'` with SVG `d` for the headband arc; `fillAlpha: 0` + `strokeColor` for the thin accent ring on each ear cup.
- `withFade`, `BlurFilter` + `filterArea` in the layer's own coordinates (pitfall 15b) for the light streak and the pill glow.
- `__logs` stayed `[]` on every run; `inspect` never had to flag anything because the layout was computed, not guessed.

## Stumbles
### 1. Right-side content runs off the frame under an orbit that sweeps to the right   [GAP]
- tried: far-right card at x 1080 / z −200 and near-right card at x 1010 / z 50, sized by the "far cards at the outer x, near cards inward" rule.
- happened: at 7.5–8.6 s (orbit at ~22–30°) the far-right card ran past the right edge and the near-right card touched the bottom edge. `inspect` is silent (it only checks text layers, and the card text was still on canvas).
- cause: when the camera orbits toward +x and looks at the centre, everything on the +x side gets *nearer* than the camera distance — a "far" card at z −200 is drawn at 1.08×, not 0.8×. The docs only describe the straight-on case (far = smaller, pulled to the centre) and "~10 % margin for the orbit sweep", which is not enough for the near side of the sweep.
- would have prevented it: a line in the camera-orbit recipe / pitfall 26: "the side the camera swings toward becomes the near side: keep cards on that side further inward (and at lower z) than on the other side; a point's depth is `R − x·sinθ + z·cosθ`, its lateral offset `x·cosθ − z·sinθ`". Better still: `inspect` reporting `threeD` layers (or compositions) cut off by an edge, not only text.

### 2. A near particle became a fake full stop in the CTA   [GAP]
- tried: a 44-particle depth field with z from −700 to +280 (as in `12-title-motion.html`).
- happened: after the dolly zoom (fov 54–58) the nearest particles balloon to ~2× and one sat right after "10.24" like punctuation.
- cause: `scale = D / (D − z)`, and D shrinks from 1108 to ~650–700 under the dolly zoom; particles with z > +150 become big blobs.
- would have prevented it: a sentence in the particles recipe: "under a dolly zoom cap particle z at ~+150 (or draw near ones smaller) — nearer ones become blobs"; and a note that a 2D overlay (the CTA) does not hide the depth field, so dim near particles when the overlay appears.

### 3. Holding the orbit's final pose needs a third camera built by hand   [GAP]
- tried: orbit 3.8 → 9.4 s, then nothing (the CTA is 2D).
- happened: after the orbit layer ends the default camera returns, so the particle field would have jumped at 9.4 s.
- cause: a camera layer, like any layer, is hidden after its lifespan; the camera then falls back to the default. There is no "hold last pose" and no documented way to read the orbit's final pose.
- would have prevented it: a doc line "after `orbit()` ends the default camera comes back — to hold the end pose add `{ type: 'camera', at: end, initial: { ...orb.initial, ...orb.keyframes.at(-1).to } }`" (this works: the sampled keyframes carry x/y/z/fov/lookAt in `to`; I verified no jump by comparing `inspect` bounds at frames 281–283). Nicer: `orbit({ hold: true })` or a `camera` option `holdAfter: true`.

### 4. I misread the contact-sheet tile boundaries   [TOOLING]
- tried: judging whether the headline was centred mid-transition on a 4-column sheet with `cellWidth: 640`.
- happened: I thought the headline sat off-centre at 3.5 s; a second sheet of only that transition showed it was centred — the dark tiles have no visible border, so I attributed part of the next tile to the current one.
- would have prevented it: a 1-px gutter / border between tiles in `contactSheet`, or a faint centre-line option (`guides: true`) so centring can be read at a glance.

### 5. Sizing card text for depth is guesswork   [GAP]
- tried: 13 px labels inside 250×148 cards at z −320.
- happened: unreadable (≈ 10 px after projection), far cards at the orbit's far side shrink further.
- would have prevented it: the cheatsheet 2.5D paragraph stating the projected scale `(H/2)/tan(fov/2) / (D − z)` (≈ 0.75 at z −320 for fov 36) so text can be sized up front.

## Wished the library had
- `inspect` issues for `threeD` layers / compositions cut by the frame (today only text is checked, and only in 2D terms).
- A hold-last-pose option for cameras / `orbit()` (see 3), or a documented way to read the pose an orbit ends on.
- A stroke gradient for shapes (`strokeGradient`): the headband had to be a flat stroke plus a second thin "seam" path.
- Text sized in the parent's units for `threeD` layers, or at least a doc formula for projected scale.
- Per-glyph layout: I measured glyph advances with `CanvasRenderingContext2D.measureText` using the same font string Pixi builds, which worked for a proportional heavy sans (recipes only cover monospace). Worth a recipe (below).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// Per-letter layout in a PROPORTIONAL font: measure glyphs with the same font string Pixi uses.
const mctx = document.createElement('canvas').getContext('2d');
const textWidth = (text, font) => { mctx.font = font; return mctx.measureText(text).width; };
const TITLE = 'AURA ONE', SIZE = 150, TRACK = 10, FAMILY = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const widths = [...TITLE].map(ch => textWidth(ch, `800 ${SIZE}px ${FAMILY}`));
const total = widths.reduce((a, b) => a + b, 0) + TRACK * (TITLE.length - 1);
let cursor = 640 - total / 2;
const letters = [...TITLE].flatMap((ch, i) => {
  const x = cursor + widths[i] / 2; cursor += widths[i] + TRACK;
  return ch === ' ' ? [] : [{ type: 'text', text: ch, threeD: true, style: { fontSize: SIZE, fontWeight: '800', fontFamily: FAMILY, fill: '#fff' },
    initial: { x, y: 350, anchorX: 0.5, anchorY: 0.5 } }];
});

// Hold an orbit's final pose after it ends (otherwise the default camera comes back).
const orb = orbit({ at: 3.8, duration: 5.6, degrees: 30, start: 0, dollyZoom: { from: 36, to: 54 } });
const last = orb.keyframes[orb.keyframes.length - 1];
const hold = { type: 'camera', at: 9.4, duration: 2.6, initial: Object.assign({}, orb.initial, last.set, last.to) };
```
