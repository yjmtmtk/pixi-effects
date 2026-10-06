# lyric-video — stumble notes
Model: opus   Cycles: 5   Result: works

Piece: "Paper Planes", a karaoke lyric video for an invented song. 1280×720, 12.5 s, 120 BPM grid (beat 0.5 s, words on sixteenths snapped to frames). Intro title shrinks into the header → 3 two-line screens (verse 1 / verse 2 / bridge, each with its own sky colour and accent) → a yellow chorus that slams in on the beat. Every word is its own text layer laid out from canvas `measureText`, lights up with a `fill` tween + small scale pop, a bouncing ball lands on each word, and a progress bar fills under each line. First run: `__logs: []`, no `inspect` issues at any checked frame. Export: MP4 1,613,383 bytes in 7.9 s.

## Went smoothly because the docs said so
- Text `fill` is animatable with `colorSpace` (docs/dsl.md) — the per-word karaoke light is just one `to: { fill }` keyframe per word.
- Layer-local keyframe `at`: I wrote all times absolute and converted with one helper (`t - layerAt`), so the same `lineLayers()` function serves root-level verses and the chorus composition (whose children are composition-local).
- A rect growing from `width: 0` with `anchorX: 0` (the progress bar) drew correctly after jump seeks in `contactSheet`, as the round-two notes promised; no workaround needed.
- One-shot sfx without `duration` and a looping bgm without `duration` produced no warnings; the volume fade `{ at: -1.2, to: { volume: 0 } }` faded only the tail (decoded RMS of the export confirms: hits at 1/4/7 s, swoosh into the chorus, silence in the last half-second).
- The chorus "slam" about the centre: a `composition` with `pivotX/pivotY` = centre and `x/y` = centre, `from: { scale: 1.45, alpha: 0 }` — exactly as the cheatsheet says; scaling the words individually would have made them collide.
- `polygon` points around (0,0) + `x,y` = a reusable paper-plane sprite that rotates about its centre.

## Stumbles
### 1. `colorSpace: 'oklch'` on a word's fill tween flashes pink   [SPEC-ODD | docs]
- tried: unlit lavender-grey (`#8a90ad`, a 50 % mix of white and the indigo sky) → lit yellow `#ffd23f`, `colorSpace: 'oklch'` because the docs recommend it for "clean colour tweens".
- happened: mid-tween frames show the word in pink/salmon ("fold" and "name" in the first contact sheet) — the hue goes the long way from ~270° to ~90° through red.
- cause: oklch interpolates hue; a desaturated start colour has an arbitrary hue, so the path wanders. `oklab` is a straight line and looked right.
- would have prevented it: one line in the cheatsheet / dsl `colorSpace` section: "`oklch` keeps saturation but travels the hue wheel — use `oklab` when one end is greyish or the hues are far apart; `oklch` for saturated hue sweeps".

### 2. Measuring words for a karaoke layout is hand-rolled   [GAP]
- tried: words placed side by side so each can light individually.
- needed: a canvas 2D `measureText` with the same `weight size family` string as the Pixi style (it matched Pixi's layout to the eye); word gap = measured space × 1.25 so a scale pop does not touch the neighbour.
- would have prevented it: `movie.measureText(text, style)` or a "split a line into word layers" helper (`splitText(spec, 'words')` returning positioned specs). A per-word / per-letter text animator would remove this whole layer.

### 3. A bouncing ball is ~5 keyframes per word   [GAP | hand-roll]
- x: a linear `to` per hop; y: `power2.out` up + `power2.in` down (two keyframes); squash/stretch on landing (two more). Works and stays locked to the word light because both use the same snapped times (pitfall 6), but a `path`/arc motion or a `bounce`-style "hop to (x,y) with height h" keyframe would make it one line.

### 4. Scale pop that is fine at 68 px overlaps at 132 px   [MY-MISTAKE]
- tried: pop `scale: 1.08` on every word.
- happened: in the chorus (132 px) "PAPER" and "PLANES," visibly closed the gap during the pop. `inspect` did not flag it (the pop lasts 2–3 frames and the boxes may not overlap by its threshold).
- fix: pop amount scaled by font size (`1 + 0.08 × min(1, 68/size)`).

### 5. A white flash on top made the chorus look translucent in a snapshot   [MY-MISTAKE, minor]
- I thought the drifting planes were drawn over the chorus text (they show through the unlit words at 10.2 s); reading pixels showed the text opaque and the flash rect (last in the array) lightening everything 8 %. A layer-under-cursor / z-order list in `inspect` output would have answered it in one call.

### 6. `?poster` is dropped by the local static server   [TOOLING]
- `http://localhost:5190/examples/gallery/lyric-video.html?poster` redirected to `/examples/gallery/lyric-video` without the query (pitfall 30c), so I could not test the `?poster` branch in the browser; the poster JPG was made with `movie.snapshot(POSTER_FRAME, …)` as the brief says.

## Wished the library had
- A text "split into words/letters" helper that returns positioned layer specs (karaoke, kinetic type).
- A hop/arc keyframe (or motion along a `path`) for bouncing balls and paper-plane swoops.
- `inspect` returning draw order for the layers under a point.
- Blend modes (a `screen` flash would have kept the ink text from greying).

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// @docs-only — karaoke line: words laid out from measured widths, lit in time, a progress bar and a bouncing ball
const FPS = 30, SIX = 0.125, snap = t => Math.round(t * FPS) / FPS;
const FAMILY = '"Avenir Next", "Helvetica Neue", Arial, sans-serif', WEIGHT = '800';
const mctx = document.createElement('canvas').getContext('2d');
const measure = (s, size) => { mctx.font = `${WEIGHT} ${size}px ${FAMILY}`; return mctx.measureText(s).width; };
function karaokeLine(id, words /* [[word, sixteenths]] */, { size, cy, unlit, lit, at, dur, singAt, W = 1280 }) {
  const space = measure(' ', size) * 1.25, widths = words.map(([w]) => measure(w, size));
  const lineW = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1), left = W / 2 - lineW / 2;
  let x = left, t = singAt;
  const ws = words.map(([text, n], i) => { const o = { text, cx: x + widths[i] / 2, t }; x += widths[i] + space; t += n * SIX; return o; });
  const L = tt => snap(tt - at), out = [];
  ws.forEach((w, i) => out.push({ type: 'text', name: `${id}-w${i}`, text: w.text, at, duration: dur, colorSpace: 'oklab',
    style: { fontFamily: FAMILY, fontWeight: WEIGHT, fontSize: size, fill: unlit },
    initial: { x: w.cx, y: cy, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: L(w.t), to: { fill: lit }, duration: 0.1 },
                { at: L(w.t), to: { scale: 1 + 0.08 * Math.min(1, 68 / size) }, duration: 0.07, ease: 'power2.out' },
                { at: L(w.t + 0.07), to: { scale: 1 }, duration: 0.3, ease: 'back.out(3)' }] }));
  const by = cy + size * 0.62;
  out.push({ type: 'shape', shape: 'rect', name: `${id}-bar`, width: 0, height: 8, cornerRadius: 4, anchorX: 0, at, duration: dur,
    initial: { x: left, y: by, fillColor: lit }, keyframes: [{ at: L(singAt), to: { width: lineW }, duration: snap(t - singAt), ease: 'none' }] });
  // ball: one linear x hop + power2 up/down per word, landing exactly when the word lights
  const low = cy - size / 2 - 21, bAt = snap(singAt - 0.25), B = tt => snap(tt - bAt), kf = [{ at: 0, to: { alpha: 1 }, duration: 0.08 }];
  let pt = bAt;
  ws.forEach(w => { const dt = w.t - pt, peak = low - Math.min(46, 16 + dt * 90);
    kf.push({ at: B(pt), to: { x: w.cx }, duration: snap(dt), ease: 'none' },
            { at: B(pt), to: { y: peak }, duration: snap(dt / 2), ease: 'power2.out' },
            { at: B(pt + dt / 2), to: { y: low }, duration: snap(dt / 2), ease: 'power2.in' });
    pt = w.t; });
  kf.push({ at: B(t), to: { alpha: 0, y: low - 30 }, duration: 0.22, ease: 'power2.in' });
  out.push({ type: 'shape', shape: 'circle', name: `${id}-ball`, radius: 9, at: bAt, duration: snap(t + 0.25 - bAt),
    initial: { x: ws[0].cx - 60, y: low, fillColor: lit, alpha: 0 }, keyframes: kf });
  return out;
}
```
