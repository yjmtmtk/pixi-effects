# loader-gallery — stumble notes
Model: sonnet   Cycles: 3   Result: works

1080x1080, 10 s @ 30 fps, 9 tiles, ~230 layers (~25k sampled keyframes). Build 2.2-3.1 s, `__logs` = `[]`, inspect clean at 4 frames, MP4 export 2.3 MB in 7.4 s.

## Went smoothly because the docs said so
- "Total = duration x (repeat+1)", rotor pattern (full-canvas composition, pivot = x/y) from generative-orbits notes: orbiting dots are 3 linear rotation tweens, exactly loop-safe.
- `from`+`to` keyframes hold the start value from the layer start: the staggered tile pop-in (alpha + scale on a composition) needed no `initial`.
- Nested compositions (tile > rotor) with absolute canvas coordinates worked first try; alpha/scale of the tile composition apply to all children.
- cornerRadius, scaleX, width, strokeAlpha are all animatable on rect: morph / flip / stretch worked without surprises.
- `blendMode: 'add'` (announced mid-task) worked on shapes at top level of the layer spec (comet trail, halo, ring dots), no warning.

## Stumbles
### 1. Sampled keyframes are the only way to loop a multi-stage / phase-shifted curve   [GAP]
- tried: per-dot phase offsets for fading rings, bouncing waves, checkerboard flips.
- happened: `repeat` only repeats ONE keyframe, so a phase offset or a multi-segment cycle needs either explicit per-cycle keyframes (pendulum) or sampling the whole 10 s (~300 linear keyframes per layer). Works (3 s build), but is bulky.
- would have prevented it: a recipe "periodic function -> sampled keyframes (period must divide the duration)", or a `curve(fn)` / `cycle` helper; or `repeat` on a keyframe group.

### 2. Additive blend turned the comet trail white   [MY-MISTAKE]
- tried: `blendMode: 'add'` on 18 trail dots already mixed towards white.
- happened: overlapping dots summed to white instead of cyan glow.
- fix: use the pure accent at alpha ~0.7 x falloff, white only on the head.
- would have prevented it: one line "with add, use dim saturated colours; overlaps sum".

### 3. Pendulum overshot the tile   [MY-MISTAKE]
- 36 degrees with a 124 px string put the end ball on the tile edge; found on the contact sheet, not by inspect (inspect does not check shapes vs shapes). Fixed with 25 degrees / 118 px.

### 4. No loop check   [TOOLING]
- Loop safety is by construction (every period divides 10 s: 1.25 / 2 / 2.5); nothing verifies it. A `movie.loopCheck()` would help.

## Wished the library had
- `repeat` on a group of keyframes (or a `cycle: P` field) so a phase-shifted cycle needs no sampling.
- Animatable `from`/`to` on `line` shapes (I used rotated thin rects for pendulum strings).
- `inspect` option to flag shapes leaving their container rectangle.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// Periodic curve -> seamless loop. Every period used must divide the duration T.
function sampled(fn, dt = 1 / 15) {            // fn(t) -> props, periodic
  const keyframes = [], n = Math.round(T / dt);
  for (let i = 0; i < n; i++) keyframes.push({ at: i * dt, to: fn((i + 1) * dt), duration: dt, ease: 'none' });
  return { initial: fn(0), keyframes };
}
// ring of fading dots: dot k lit at k*P/n, fades over one turn
alpha: 0.1 + 0.9 * Math.pow(1 - frac(t / P - k / n), 1.6)
```
