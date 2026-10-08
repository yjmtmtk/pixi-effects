# gradient-type — stumble notes
Model: fable   Cycles: 4   Result: works

## Went smoothly because the docs said so
- Animated `fillGradient` worked first time on both a text layer and shapes, exactly as the cheatsheet / pitfall 66 describe: a start `fillGradient` on the layer, a partial gradient in each keyframe's `to`, the same stop count, `colorSpace: 'oklch'` on the layer. Four chained `to: { fillGradient: { angle, stops } }` keyframes on the word (95° per leg, the palette turned one place per leg) kept travelling with no gap; `rgba(...)` stops with alpha tweened fine in oklch on the radial glows.
- `ease: 'spring.snappy'` + `duration: 'auto'` for the word's landing and its settle after the lock: no guessing a settle time, no warning.
- `animateText(..., { by: 'words', in: 'rise' })` with `y` as the TOP of the line box (pitfall 63): the line sat where I computed it, and each piece's `at` was handy for one typewriter sfx per word.
- The canvas `measureText` fit helper from kinetic-manifesto justified SPECTRUM to the column (1088 px) to the pixel in Arial Black 900.
- `inspectAudio()` caught the one real sound mistake (below) and the quiet mix; `__logs: []` from the second run.

## Stumbles
### 1. A radial gradient's `center` / `radius` are fractions of the SHAPE's bounds, not the canvas   [MY-MISTAKE | docs]
- tried: a glow as a circle `radius: 760` centred on the frame (so it covers the canvas), with `center: [0.78, 0.26]` meaning "upper right of the frame".
- happened: the glow sat on the top edge: the bounds are 1520 × 1520, so y = 0.26 is 5 px above the canvas. No warning (nothing is wrong).
- cause: the cheatsheet says "0–1 of bounds", which is right; I read it as the frame because the circle covered the frame.
- would have prevented it: one clause in the `fillGradient` entry: "(of the shape's own bounds: for a circle that is bigger than the canvas, convert canvas pixels first)". The two-line converter is in the recipe below.

### 2. `music.reverb` has a ceiling of 0.6   [SPEC-ODD, minor]
- tried: `music: { bpm: 60, reverb: 0.7, ... }` for a washy pad.
- happened: `layer "pad": music.reverb 0.7 is outside 0–0.6; using 0.6` — a clear warning, fixed in one edit.
- would have prevented it: the cheatsheet lists `reverb` among the score options without its range; "`reverb` 0–0.6" would do.

### 3. A pitched chime still lasts 1.4 s and ran past the end   [MY-MISTAKE]
- tried: `sfx: { preset: 'chime', pitch: -3 }` at 9.8 s in an 11 s movie (I assumed the lower pitch would not matter and forgot the 1.4 s length).
- happened: `inspectAudio` issue: `sfx "chime" is cut off by the end of the movie at 11s (it runs to 11.20s)`.
- fix: `duration: DURATION - T.lock` (1.2 s): the cheatsheet does say the layer's `duration` IS the sound's length. Nothing to change in the docs; the check caught it.

### 4. The mix was quiet (−24.6 LUFS) on the first pass   [MY-MISTAKE]
- the cheatsheet's `-14 … -16 LUFS` advice and the `notes` line from `inspectAudio()` made it a one-edit fix (every `volume` up by ~50 %; now −20.2 LUFS, true peak −9.3 dB, no issues). A pad bed at `volume: 0.45` is too quiet to count.

### 5. Mid-fade of a two-colour glow goes pale   [SPEC-ODD, cosmetic]
- a radial glow tweening coral → cyan in `oklch` (hues ~180° apart) loses chroma around the midpoint and reads whitish for ~1 s (frame 192 of the first sheet). The letters, which tween neighbouring hues, never do. Not a bug (that is what an oklch hue tween between opposites does); I moved the poster off that moment. A line in the cheatsheet ("tween neighbouring hues, or go through a third colour, when two stops are ~180° apart") would save a retry.

## Wished the library had
- A canvas-pixel form for radial `center` / `radius` (`centerPx: [x, y]`, `radiusPx`), or a note that they are shape-bounds fractions.
- `inspectAudio()` could say the pitched length of an sfx (`pitch` does not change it, which surprised me).

## Reusable pattern worth adding to ai/reference/recipes.md (optional)
```js
// @docs-only — a drifting radial glow written in CANVAS pixels: a circle bigger than the frame, the gradient centre converted to its bounds
const GLOW_R = 760;                                                     // > half the diagonal: the circle covers 1280 × 720
const cen = (px, py) => [(px - (W / 2 - GLOW_R)) / (2 * GLOW_R), (py - (H / 2 - GLOW_R)) / (2 * GLOW_R)];
const rad = px => px / (2 * GLOW_R);
const glowStops = (c, a) => [[0, rgba(c, a)], [0.45, rgba(c, a * 0.3)], [1, rgba(c, 0)]];
sequences.push({ type: 'shape', shape: 'circle', name: 'glow', radius: GLOW_R, colorSpace: 'oklch',
  fillGradient: { type: 'radial', center: cen(300, 540), radius: rad(420), stops: glowStops('#5b3cff', 0.85) },
  initial: { x: W / 2, y: H / 2 },
  keyframes: [
    { at: 0.6, duration: 3.4, ease: 'sine.inOut', to: { fillGradient: { center: cen(980, 200), radius: rad(560), stops: glowStops('#ff5c7a', 0.66) } } },
    { at: 4.0, duration: 3.2, ease: 'sine.inOut', to: { fillGradient: { center: cen(520, 480), radius: rad(500), stops: glowStops('#17d4e8', 0.62) } } },
  ] });

// @docs-only — a word whose gradient keeps travelling: turn the palette one place and the angle 95° per leg, chained keyframes
const PALETTE = ['#5b3cff', '#17d4e8', '#ff5c7a', '#ffc24a'];
const rot = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);
const wordGradient = (k, angle) => ({ angle, stops: rot(PALETTE, k).map((c, i) => [i / 3, c]) });
sequences.push({ type: 'text', text: 'SPECTRUM', colorSpace: 'oklch', style: { fontFamily: 'Arial Black', fontWeight: '900', fontSize: 170 },
  fillGradient: wordGradient(0, 0), initial: { x: 96, y: 318, anchorX: 0, anchorY: 0.5 },
  keyframes: [1.0, 3.2, 5.4, 7.6].map((t, i) => ({ at: t, duration: 2.2, ease: 'sine.inOut', to: { fillGradient: wordGradient(i + 1, 95 * (i + 1)) } })) });
```
