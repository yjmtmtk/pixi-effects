# music-visualizer — stumble notes
Model: sonnet   Cycles: 4   Result: works

## Went smoothly because the docs said so
- Keyframe `at` is layer-local (SKILL rules + pitfall 1): 144 bar layers with per-step `to` keyframes worked first time.
- `fillGradient` on a rect with an animated `height` stretches with the bar: neon gradient bars cost nothing. Radial gradient circles gave the orb/halo/vignette for free.
- `custom` filter + `BlurFilter` (docs/dsl.md) + `filterArea` hint (pitfall 15b): a glow copy of the bars in a `composition` with a blur filter worked first try.
- `{value}` counter, `loop: true` audio and the volume-fade recipe: copy-paste.
- `contactSheet({ times, columns })`, `inspect({ layers: 'none' })`, `save-image.py`: all fine.
- Picking BPM 112.5 (beat = 16 frames, 16th = 4 frames) makes every keyframe frame-aligned.

## Stumbles
### 1. Last sample keyframe starts exactly at the layer end   [MY-MISTAKE]
- tried: sampled `for (s = 0; s <= STEPS; s++)` with `at: s*STEP`, so the last keyframe starts at 12 s on a 12 s layer.
- happened: one warning per layer (150+): `layer "orb": keyframes[90] starts at 12s, after the layer ends (duration 12s), so it never plays.`
- cause: off-by-one in my loop. The warning was clear and fixed it at once.
- would have prevented it: nothing needed; maybe de-duplicate the warning (it was printed once per layer, ~145 lines in `__logs`) or add a summary "N layers ...".

### 2. A progress ring has no primitive   [GAP]
- tried: an arc / ring with an animatable sweep.
- happened: `path` `d` cannot be animated and there is no arc/trim-path, so I used 60 line "ticks" that light up one by one (plus 60 dim ticks). Works, looks like a dial, but 120 layers + 60 timed `at`s for one ring.
- would have prevented it: a `shape: 'arc'` (radius, startAngle, endAngle animatable) or `strokeDash` / `trim` property; or a recipe "progress ring from ticks" in recipes.md.

### 3. No group / parent layer, so the glow needs the whole bar spec twice   [GAP]
- tried: one blur over the bar set.
- happened: only a `composition` can carry the filter, so I built the bars once as data and mapped the array into the composition (with new names) AND at top level: 2x layers (and 2x keyframes, ~13k tweens). Playback and export (7.9 s for 12 s) were still fine.
- would have prevented it: a doc line in cheatsheet "to blur / glow a set of layers, put copies in a `composition` with a `custom` BlurFilter + `filterArea`" (the recipe exists only for single shapes); a `glow` built-in filter.

### 4. Text position/scale between centre and corner   [SPEC-ODD, small]
- tried: a title that goes from centred to top-left at half size with one text layer.
- happened: worked using `anchorX: 0` and expressions in keyframe targets (`x: 'GW/2 - w/2'`) so the centred state is exact at scale 1. I only found this works (expressions in `to`) by trying; the cheatsheet says "any number may be an expression" which was enough, but `w` under scale is the unscaled width, which only works because the centred state is at scale 1.
- would have prevented it: a line "`w` is the unscaled width, expressions are allowed inside keyframes".

## Wished the library had
- A `shape: 'arc'` / trim-path for progress rings and radial meters.
- A `glow` / bloom filter shortcut (`glow: { color, blur, strength }`) and a way to apply one filter to a list of layers without a composition.
- A per-layer `values: number[]` + `step` sampler (or an `expr` with a time variable) so an audio-reactive bar is one keyframe track instead of 90 hand-written keyframes. Not the same as real audio analysis, which would also be great (`audioLevel(asset, band)` returning sampled keyframes).
- A blend mode `add`/`screen` so the glow, rings and orbs stack as light instead of alpha.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// Pseudo-spectrum bars on a beat grid: seeded, deterministic, frame-aligned (NOT audio analysis)
const BPM = 112.5, BEAT = 60 / BPM, STEP = BEAT / 4;          // 16 frames per beat, 4 per 16th
const STEPS = Math.round(DURATION / STEP);
const bars = Array.from({ length: N }, (_, i) => ({
  type: 'shape', shape: 'rect', width: 12, height: 4, cornerRadius: 4, anchorY: 1,
  fillGradient: { angle: 90, stops: [[0, '#ff2d95'], [1, '#6a3cff']] },
  initial: { x: X0 + i * 20, y: BASE },
  keyframes: Array.from({ length: STEPS }, (_, s) => ({ at: s * STEP, to: { height: 4 + level(i, s) * 260 }, duration: STEP, ease: 'power2.out' })),  // s < STEPS, not <=
}));
// level(i,s): kick*bassWeight + hat*highWeight + noise, soft-clipped with tanh and given a release `max(target, prev*0.7)`.
```


## Update: it listens now (0.12)
The bars, the pulse and the rings used to come from a seeded pseudo-spectrum on an invented 112.5 bpm grid: the sample loop is really 120 bpm, so the picture never matched the sound. The page now analyses `bgm.mp3` with `audioEnvelope()` (24 log-spaced bands from 50 Hz to 12 kHz, a wide bass band for the kick, one value per frame) and samples it every 4 frames: the 48 bars are the 24 bands mirrored (lows in the middle), each stretched to its own range and blended 1-2-1 with its neighbours so they read as a spectrum; the orb follows the kick; a ring is born on the strong detected kicks (not on a grid); the flash is the biggest kick between 6 s and 9 s. What you see follows what you hear: the visuals fade with the music layer's volume.

### Stumbles
- A raw 24-band analysis looked like isolated spikes (most narrow bands are quiet at any moment). Stretching each band to its own 95th percentile and a 1-2-1 blend across bands fixed it.
- The first run threw "this envelope has no series bass": a custom `bands` list replaces the defaults, so a band named `bass` has to be listed (the beat detector looks in it by default).
