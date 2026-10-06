# liquid-flow-title — stumble notes
Model: fable   Cycles: 4 (run → fix blend + mask → run → replace mask with a punched cover image → run → verify / export / poster)   Result: works
Export: `movie.render({ format: 'mp4' })` → 836,982 bytes (video/mp4) in 9.9 s wall time for 10 s at 1280×720 · `__logs` = `[]` on every run · `inspect` issues = `[]` at frames 30 / 60 / 150 / 180 / 200 / 207 / 225 / 250 / 260 / 299.
Concept: six blurred colour blobs (oklch `fillColor` tweens, additive cores) drift on a pale field, saturate and gather onto a band; the pale field then returns everywhere except inside "FLOW" (a canvas-drawn cover image with the letters punched out), chime on the resolve, rule + caption, quiet hold.

## Went smoothly because the docs said so
- `filterArea` "in the layer's OWN coordinates" (pitfall 15b) + `BlurFilter` via `{ type: 'custom' }`: six heavily blurred circles (strength 70, quality 10) drew unclipped on the first run; a helper `blurred(strength, halfW, halfH)` returns both fields.
- `colorSpace: 'oklch'` + `fillColor` keyframes: pastel → vivid ramps with no grey midpoints, first try. (`fillGradient` is documented as not animatable, so the blobs are flat colour + blur, not gradients.)
- "No per-frame expression — sample the curve into short linear keyframes in a JS loop" (pitfall 20 / `orbit()`): a Lissajous wander that smoothsteps toward a band target was 100 `to` keyframes per blob at 0.1 s, perfectly smooth, no warning.
- Round-two rule "omit `duration` on a one-shot sound effect": the chime layer is one line and `__logs` stayed `[]`.
- `__logs` was `[]` on every run; `inspect` issues `[]` at every frame checked.

## Stumbles
### 1. `blendMode: 'multiply'` on a blurred layer renders solid BLACK   [LIBRARY-BUG]
- tried: six circles with `blendMode: 'multiply'` (the mode that fits ink-like blobs on a pale field) and a `BlurFilter` in `filters`.
- happened: every blob, and the bed ellipse, rendered as a black blur (contact sheet 1). No warning.
- cause (inferred, I may not read `src/`): the layer's blend mode is applied while the filter renders the layer into its offscreen texture, which is cleared to transparent black — `colour × 0 = 0` — and the blurred black is then composited back. `add` (and presumably `screen`) survive the same path because `x + 0 = x`: the additive cores in this piece work and visibly brighten where blobs merge.
- would have prevented it: either apply the blend mode only when compositing the filter output (the correct behaviour), or a warning "`blendMode: 'multiply'` with `filters` renders black — put the blend mode on an unfiltered layer or a parent composition" and a line in the cheatsheet next to `blendMode`.

### 2. A `text` used as a mask cuts a RECTANGLE, not letters   [WRONG]
- tried: the resolve as a pale cover rect with `maskInverted: true, mask: { type: 'text', text: 'FLOW', … }` ("Any sequence type works as a mask (shape / image / text / nested composition)" in docs/dsl.md).
- happened: the hole was the text's bounding box; the letters were nowhere. No warning.
- cause: Pixi v8 stencils a non-Sprite container by what it draws, and a Text quad covers its whole box (stencil ignores alpha). Only Sprites (`image`) get an alpha mask.
- would have prevented it: the mask doc should say "a `text` mask masks by its box; for letter shapes render the text to a canvas and use an `image` mask (or the inverse: punch the text out of a canvas image)", or the library could render a text mask to a texture itself.

### 3. `maskInverted` is ignored on an `image` mask   [LIBRARY-BUG]
- tried: the same cover with `mask: { type: 'image', asset: 'wordmark' }` (a canvas-drawn data-URL of the word, 2x) and `maskInverted: true`.
- happened: the mask applied the right way round but NOT inverted: the pale cover showed only inside the letters (white FLOW on the colour field), the opposite of the design. No warning.
- cause: the alpha-mask path (sprite masks) does not honour `inverse`; the stencil path does. The DSL doc ("routed through PIXI v8's native `setMask({ inverse: true })`") reads as if it works for every mask type.
- would have prevented it: a warning "`maskInverted` has no effect on an image mask", or a doc line. Workaround used (and worth a recipe): skip the mask — draw the cover on a canvas with the letters punched out (`globalCompositeOperation = 'destination-out'` + `fillText`) and fade that `image` in. One texture, no mask, no second copy of the field.

### 4. A contact sheet came back from ANOTHER author's session   [TOOLING]
- tried: `agent-browser --session liquid-flow-title eval "movie.contactSheet(…)"` in a chain of five calls on my session.
- happened: the saved sheet showed "A short history of computing" (someone else's piece, 13 s, 390 frames); the two `snapshot` calls in the same chain were mine. The brief warned about exactly this, so I looked before trusting it and re-took the sheet.
- would have prevented it: nothing on my side; the harness could echo `document.title` (or the page URL) in `eval` results, or the shared tool could refuse to answer for a session name it did not open.

### 5. `?poster` is silently dropped on the `.html` URL   [TOOLING]
- tried: `agent-browser open http://localhost:5190/examples/gallery/liquid-flow-title.html?poster` to check the poster park.
- happened: the page opened at 0:00; `location.search` was `""` — the static server redirects `/x.html` → `/x` and loses the query (pitfall 30c says so, I had forgotten). `…/liquid-flow-title?poster` (no extension) keeps it, and the page parked on frame 213 as intended.
- would have prevented it: the brief / pitfall giving the extension-less form as THE URL to use for `?poster`, or the server keeping the query on its redirect.

### 6. The template's canvas is not centred once the Controller wraps it   [GAP]
- tried: `body { display: grid; place-items: center }` + `canvas { width: min(960px, 100%) }`, as several round-one pages do.
- happened: the canvas sat at the left of the page (page screenshot): `new Controller(movie, { canvas })` wraps the canvas in a block `div.movie-controller-wrap` (docs/api.md) that fills the grid column, and the canvas is left-aligned inside it. Centring the canvas alone would leave the overlay bar spanning the whole wrapper.
- would have prevented it: the template shipping `.movie-controller-wrap { width: min(960px, 100%); margin: 0 auto; }` (what I used), or the Controller sizing its wrapper to the canvas (`width: fit-content`).

### 7. Half of the look is a guess until a screenshot   [TOOLING]
- tried: judging blur softness / blend results from code.
- happened: both big problems above were invisible in `__logs` and in `inspect` (which only checks text); the first contact sheet found them in one look.
- would have prevented it: nothing — this is what the contact sheet is for; noted so the next author takes the sheet before tuning numbers.

## Wished the library had
- Blend modes that compose correctly with `filters` (or a warning when `multiply` meets a filter).
- Text masks that mask by glyph alpha, and `maskInverted` on image masks (or a `mask: { type: 'text', … }` that is rendered to a texture first).
- A soft / gradient mask (an alpha ramp) — a cut-out from a blurred field would then be possible without a canvas image.
- An animatable `fillGradient` (at least its stop colours), so a blob could be a real radial gradient AND cross-fade through oklch without a blur filter.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)

### A wordmark that resolves out of a colour field: punch the letters out of a canvas-drawn cover and fade it in
```js
// @docs-only
function coverAsset(text, pale, W, H, y, font) {
  const S = 2, c = Object.assign(document.createElement('canvas'), { width: W * S, height: H * S }), g = c.getContext('2d');
  g.scale(S, S); g.fillStyle = pale; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';                      // the letters become transparent holes
  g.font = font; g.letterSpacing = '14px'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2 + 7, y);
  return { name: 'cover', src: c.toDataURL() };
}
// assets: [coverAsset('FLOW', '#f6f1f5', 1280, 720, 360, "800 320px system-ui, sans-serif")]
// { type: 'image', asset: 'cover', at: 6.2, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5, scale: 0.52, alpha: 0 },
//   keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1.3, ease: 'sine.inOut' }, { at: 0, to: { scale: 0.5 }, duration: 1.8, ease: 'sine.out' }] }
```

### Blobs that wander, then gather onto a band (sampled Lissajous + smoothstep blend)
```js
// @docs-only
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const posAt = (b, t) => {                                                   // b: { cx, cy, ax, ay, wx, wy, px, py, tx, ty }
  const s = smooth((t - 4.4) / 2.0), wob = 1 - 0.7 * s;
  return { x: b.cx + (b.tx - b.cx) * s + b.ax * wob * Math.sin(b.wx * t + b.px),
           y: b.cy + (b.ty - b.cy) * s + b.ay * wob * Math.sin(b.wy * t + b.py) };
};
const pathKeyframes = (b, duration, step = 0.1) =>
  Array.from({ length: Math.round(duration / step) }, (_, k) => ({ at: k * step, to: posAt(b, (k + 1) * step), duration: step, ease: 'none' }));
```
