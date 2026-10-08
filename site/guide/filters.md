---
title: Filters
section: Guides
order: 5
summary: Glow, blur, pixelate, CRT and about forty more, written as plain data.
---

A filter changes how a layer looks after it is drawn. Name it in `filters` and give its options; no import and no `new`:

```js
{ type: 'text', text: 'NEON', style: { fontSize: 140, fill: '#ffffff' }, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
  filters: [{ type: 'glow', name: 'halo', outerStrength: 0, color: '#ff4d9d', distance: 20 }],
  keyframes: [{ at: 0, to: { 'filters.halo.outerStrength': 6 }, duration: 1 }] }       // the glow grows in
```

`type` is the filter's name in camelCase. Give it a `name` to animate its options with `'filters.<name>.<option>'`.

## The ones you will use most

| `type` | Options | Looks like |
|---|---|---|
| `blur` | `strength` | soft focus |
| `glow` | `distance outerStrength color` | a halo |
| `dropShadow` | `offset: { x, y }`, `blur`, `alpha` | a shadow |
| `outline` | `thickness color` | a stroke around the shape |
| `colorMatrix` | `preset: 'sepia' 'grayscale' 'negative' 'polaroid' 'vintage'…` | a colour grade |
| `adjustment` | `saturation contrast brightness gamma` | simple grading (1 = unchanged) |
| `pixelate` | `size` | mosaic |
| `crt` | `curvature lineWidth noise vignetting` | an old monitor |
| `rgbSplit` | `red green blue` (each `{ x, y }`) | chromatic aberration |
| `glitch` | `slices offset` | digital glitch |
| `twist`, `bulgePinch`, `zoomBlur` | `radius`, `strength` and a **centre** | distortions |
| `grain` | `amount size seed fps color` | film grain done properly (below) |
| `oldFilm`, `noise` | `noise sepia scratch` | a rougher grain and an aged-film look |

`blur`, `noise`, `alpha`, `colorMatrix` and `grain` need nothing extra (the first four come with PixiJS, `grain` with this library). The rest come from the `pixi-filters` package, which is loaded the first time a layer uses one: add it to your import map (`"pixi-filters": "https://esm.sh/pixi-filters@6.1.5?external=pixi.js"`) or `npm install pixi-filters`. The [DSL reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/dsl.md) has the whole table. Anything else that is a PixiJS `Filter` goes in as `{ type: 'custom', filter: new MyFilter() }`.

{{demo examples/06-filters.html}}

## Film grain

`{ type: 'grain' }` is the one-line film look: `composition: { sequences, filters: [{ type: 'grain' }] }`. It is **seeded and new every 1/`fps` second** (24 by default, so it changes at the rhythm of film, whatever your frame rate), it is **weighted to the mid-tones** (it fades out toward pure black and white, so blacks are not lifted and the average brightness does not move) and it is **the same grain pattern on every GPU** (an integer hash, no `Math.random()`; the 8-bit values agree to within 1/255). It is anchored to the filter's own frame: on a layer the grain moves with the layer (put the filter in the root `filters` for grain fixed to the picture). `amount` is the standard deviation at mid-grey as a fraction of full scale: `0.08` is a clear grain, `0.02` a hint. `size` is the grain in pixels, `color: 1` makes each channel grain on its own, `fps: 0` is a still pattern.

```js
composition: { sequences, filters: [{ type: 'grain', amount: 0.06, size: 2, color: 0.3 }] }                         // the whole film
{ type: 'image', asset: 'photo', filters: [{ type: 'grain', name: 'g' }], keyframes: [{ at: 3, to: { 'filters.g.amount': 0.2 }, duration: 2 }] }   // one layer, growing
```

The old `noise` filter is a different thing: one frozen pattern (its seed is random unless you give one), the same strength at every tone, and it lifts blacks (a pure black layer reads about 5/255 brighter). Use `grain` for film.

**Grain costs bitrate.** Every frame has new noise, which video encoders cannot predict. Measured with the default export settings, 3 s of flat 1280×720: 6.9 KB without grain, 9.3 MB with `amount: 0.03` and 22.3 MB with `0.08`. A real picture already costs bytes, so the growth is smaller, but plan for a bigger file (and a higher bitrate if you set one). On the screen it costs about 0.6 ms a frame (mono) or 2.3 ms (`color: 1`) at 1080p on a GPU, against 0.3 ms for `noise`.

## Gotchas, all measured

- **Centres are in canvas pixels, not the layer's.** `twist`, `bulgePinch`, `zoomBlur`, `shockwave` and `radialBlur` default to the canvas's top-left corner, so a layer in the middle looks untouched. Put the centre on the layer: `{ type: 'twist', offset: { x: 640, y: 360 } }`.
- **A filter works inside the layer's bounds.** Glow, shadow and blur draw outside it and are clipped: widen the area with `filterArea: { x: -24, y: -24, width: w + 48, height: h + 48 }` (in the layer's own coordinates). Do **not** widen it for `grayscale` or `oldFilm`, which paint the extra margin black.
- **Point-valued options do not tween as a whole** (`rgbSplit.red`, `dropShadow.offset`). Animate a scalar such as `'filters.<name>.red.x'` if the filter exposes it. `pixelate` animates through `sizeX` and `sizeY`.
- `shockwave` and `godray` are driven by `time`: a still frame at `time: 0` shows nothing, so animate it.
- `colorMap` and `simpleLightmap` need an image (a texture), which data cannot hold: use `custom` for those two.
