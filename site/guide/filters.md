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
| `oldFilm`, `noise` | `noise sepia scratch` | film grain |

`blur`, `noise`, `alpha` and `colorMatrix` come with PixiJS. The rest come from the `pixi-filters` package, which is loaded the first time a layer uses one: add it to your import map (`"pixi-filters": "https://esm.sh/pixi-filters@6.1.5?external=pixi.js"`) or `npm install pixi-filters`. The [DSL reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/dsl.md) has the whole table. Anything else that is a PixiJS `Filter` goes in as `{ type: 'custom', filter: new MyFilter() }`.

{{demo examples/06-filters.html}}

## Gotchas, all measured

- **Centres are in canvas pixels, not the layer's.** `twist`, `bulgePinch`, `zoomBlur`, `shockwave` and `radialBlur` default to the canvas's top-left corner, so a layer in the middle looks untouched. Put the centre on the layer: `{ type: 'twist', offset: { x: 640, y: 360 } }`.
- **A filter works inside the layer's bounds.** Glow, shadow and blur draw outside it and are clipped: widen the area with `filterArea: { x: -24, y: -24, width: w + 48, height: h + 48 }` (in the layer's own coordinates). Do **not** widen it for `grayscale` or `oldFilm`, which paint the extra margin black.
- **Point-valued options do not tween as a whole** (`rgbSplit.red`, `dropShadow.offset`). Animate a scalar such as `'filters.<name>.red.x'` if the filter exposes it. `pixelate` animates through `sizeX` and `sizeY`.
- `shockwave` and `godray` are driven by `time`: a still frame at `time: 0` shows nothing, so animate it.
- `colorMap` and `simpleLightmap` need an image (a texture), which data cannot hold: use `custom` for those two.
