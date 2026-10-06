# travel-slideshow — stumble notes
Model: sonnet   Cycles: 6   Result: works

## Went smoothly because the docs said so
- The `slideshow` recipe gave the exact timing algebra (scene i starts at i*(L-T), transition `at` = next scene start, scene alive until `S[i+1]+T`); I generalised it to uneven scene starts without a single transition error.
- `kenBurns` + `ease: 'none'` + per-scene `motion/origin/zoom/from/to` worked first try; the "source images >= canvas-sized" advice (1920x1080 data-URL JPEGs as assets) was right.
- `fillGradient` (linear with alpha, radial `center`) made the whole warm grade (tint, top/bottom shade, vignette, light leaks) plain shapes; `center: [x/W, y/H]` just worked.
- `contactSheet({ times, columns, cellWidth })`, `inspect({layers:'none'})`, `snapshot` and `save-image.py` made the look-then-fix loop fast. `inspect` reported zero issues on 12 frames (text + overlay shapes).
- Layer-local keyframe `at` plus `-0.4` "back from end" made every caption fade-out one line.

## Stumbles
### 1. Short sfx layer warns about its own duration   [GAP]
- tried: `{ type:'audio', asset:'chime', at:0.7, duration:0.7 }` (rounded the clip length up).
- happened: `pixi-effects: layer "sfx-chime": audio asset "chime" is 0.6s but the layer lasts 0.7s, so it goes silent after 0.6s. Add loop: true, or shorten the layer's duration.` (x4, one per sfx)
- cause: I guessed durations; the doc lists none for `sfx-*.mp3`, and the warning is aimed at bgm. The warning is useful but I had to run `afinfo` to learn 0.627 s / 0.104 s / 0.157 s / 0.340 s.
- would have prevented it: list the length of each `examples/_assets/*.mp3` (bgm 6.03 s, chime 0.63, click 0.10, pop 0.16, swoosh 0.34) in cheatsheet "Assets"; or let a one-shot audio layer omit `duration` (default = asset length) instead of the composition length.

### 2. Content hidden behind my own caption / grade   [MY-MISTAKE]
- tried: painted the four scenes with horizons at 60-70 % of the picture height, then put captions + a dark bottom gradient over the bottom third.
- happened: in the first contact sheet the sea, houses and foregrounds were cropped by the Ken Burns zoom or sat under the caption; houses collided with the title text.
- cause: `inspect` only checks text vs. text/edges, not text vs. picture content, so only the contact sheet showed it.
- would have prevented it: a layout line in the slideshow recipe "keep the subject in the upper 60 % of the source image: captions + shade take the bottom ~35 % and the zoom crops ~10 % each side". I fixed it by drawing every painting through a `start(g, shift)` helper that translates the whole scene up.

### 3. `dissolve` defaults look like camouflage   [SPEC-ODD]
- tried: `{ kind: 'dissolve' }` (defaults scale 30, smoothing 0.05) between a lagoon and an aurora.
- happened: hard-edged black/white blobs (a "camo" pattern) at mid-transition; not cinematic. `scale: 220` gave TV static; `scale: 90, smoothing: 0.5` finally looked like a soft grainy dissolve.
- cause: defaults suit a stylised pixel reveal; the docs describe the parameters but do not say what a "film-like" setting is.
- would have prevented it: one line in docs/dsl.md or the recipe: "soft film dissolve: `scale: 90, smoothing: 0.5`".

### 4. Cannot tie a captions/counter to the slides   [GAP, known]
- tried: a changing day number "01..04" in one text layer.
- happened: text content cannot change (only `{value}` numbers), so I made one text layer per day with cross-faded alpha, plus 4 tick rects with colour keyframes. Works, but 4 x (name + sub + number + rule) = 16 caption layers.
- cause: pitfalls #21 (no caption linked to a slide). Doc-known, but I had to hand-write the `appear(spec, y, inAt, outAt)` helper.
- would have prevented it: a `caption`/`appear` helper in recipes (see pattern below), or `withFade` accepting `rise: 14`.

### 5. Reflection / shifting a painted canvas   [TOOLING]
- tried: reuse the canvas itself for a water reflection (`drawImage(c)` mirrored) while the scene was drawn under a `translate`.
- happened: the mirror landed in the wrong place because `drawImage` is affected by the active transform.
- cause: plain canvas-2D, not the library. `g.setTransform(1,0,0,1,0,0)` inside the helper fixed it.
- would have prevented it: n/a (maybe a `paintScene` helper in the "generated placeholder images" recipe showing layered ridges, glow, reflection and grain; the current recipe is just a gradient).

## Wished the library had
- Blend modes (screen / overlay / multiply) for a real colour grade and light leaks; I faked both with plain-alpha tinted rects and radial gradients.
- A one-shot `audio` layer whose default duration is the asset's own length.
- `kenBurns` zoom target given as image coordinates plus a `focus` so captions-safe framing is easy; I tuned `origin/from/to` by eye.
- Transition presets with a documented "soft" look (dissolve) and a gentle `slide`/`push` with parallax.

## Reusable pattern worth adding to ai/reference/recipes.md (optional)
Caption that rises in, holds, fades out (local keyframes, so `at` is just the layer's own start); `outAt: null` = hold to the end:
```js
const appear = (spec, y, inAt, outAt, inDur = 0.7) => ({
  ...spec, at: inAt, duration: (outAt ?? DURATION) - inAt + (outAt == null ? 0 : 0.4),
  initial: { ...spec.initial, y, alpha: 0 },
  keyframes: [
    { at: 0, from: { alpha: 0, y: y + 14 }, to: { alpha: 1, y }, duration: inDur, ease: 'power3.out' },
    ...(outAt == null ? [] : [{ at: -0.4, to: { alpha: 0 }, duration: 0.4, ease: 'sine.in' }]),
  ],
});
```
Procedural landscape layers (midpoint-displacement ridge with a vertical gradient, filled to the bottom, drawn far to near and fading to sky colour) look convincingly "photographic" with a radial glow and 70k grain specks on top; see `paintHarbour` / `paintAurora` in `examples/gallery/travel-slideshow.html`.
