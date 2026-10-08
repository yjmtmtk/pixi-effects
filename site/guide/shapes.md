---
title: Shapes
section: Guides
order: 2
summary: Rectangles, circles, rings, lines and paths, drawing a stroke on, and morphing one outline into another.
---

A shape layer is `type: 'shape'` with a `shape` kind and its geometry. Fill and stroke are style values in `initial` (and animatable).

| `shape` | Geometry | Notes |
|---|---|---|
| `rect` | `width`, `height`, `cornerRadius` | centred on `x, y` by default; `anchorX: 0` grows a bar to the right |
| `circle` | `radius` | centred on `x, y` |
| `ellipse` | `radiusX`, `radiusY` | |
| `arc` | `radius`, `innerRadius`, `startAngle`, `endAngle` | degrees, 0° = 3 o'clock, clockwise: rings, progress rings, pie and donut slices |
| `line` | `from: [x, y]`, `to: [x, y]` | plain canvas coordinates |
| `polygon` | `points: [[x, y], …]`, `open` | plain canvas coordinates |
| `path` | `d` (SVG path data) | plain canvas coordinates |

```js
{ type: 'shape', shape: 'rect', width: 360, height: 200, cornerRadius: 24,
  initial: { x: 640, y: 360, fillColor: '#3b5bdb', strokeColor: '#ffffff', strokeWidth: 4 } }
```

Style: `fillColor`, `fillAlpha`, `strokeColor`, `strokeAlpha`, `strokeWidth`, plus `fillGradient` (a linear or radial gradient, which with transparent stops makes a vignette; a keyframe can animate it, see below) and `strokeCap` / `strokeJoin` (`'round'` is friendly). Colours can tween in a perceptual colour space with `colorSpace: 'oklab'` or `'oklch'`, which avoids the muddy middle of a red-to-green fade.

{{demo examples/03-shapes.html}}

## A gradient that moves

A keyframe can carry a **partial** `fillGradient`: the keys you write change, the others stay. Angles and radii move linearly, the stop colours move through the layer's `colorSpace` (`'oklch'` keeps a fade vivid; `'rgb'` turns green to magenta through grey).

```js
{ type: 'shape', shape: 'rect', width: 560, height: 420, cornerRadius: 36, colorSpace: 'oklch', initial: { x: 520, y: 540 },
  fillGradient: { angle: 0, stops: [[0, '#ff2d55'], [1, '#0ea5e9']] },
  keyframes: [{ at: 0, duration: 2, to: { fillGradient: { angle: 360, stops: [[0, '#00e5ff'], [1, '#ffd60a']] } } }] }
{ type: 'shape', shape: 'circle', radius: 230, initial: { x: 1360, y: 540 },
  fillGradient: { type: 'radial', center: [0.2, 0.2], radius: 0.25, stops: [[0, '#ffffff'], [1, '#ff2d55']] },
  keyframes: [{ at: 0, duration: 2, ease: 'sine.inOut', to: { fillGradient: { center: [0.8, 0.8], radius: 0.6 } } }] }
```

The layer needs a starting `fillGradient`, the stops keep their count, and a gradient cannot turn from linear to radial. Mistakes are said once, when the layer is built.

## Draw a stroke on

`trimStart` and `trimEnd` (0 to 1, animatable) are the part of the outline that is stroked. Start `trimEnd` at 0 and animate it to 1 and the line **draws itself**:

```js
{ type: 'shape', shape: 'path', d: 'M 0 50 L 45 95 L 130 0', trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
  initial: { x: 640, y: 360, strokeColor: '#7bd88f', strokeWidth: 16 },
  keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 1, ease: 'power2.inOut' }] }              // a check mark drawing itself
```

- A rectangle's outline starts at its top-left and goes clockwise; a circle or ellipse starts at 12 o'clock; a polygon's closing edge counts; a path's pieces count as one length, in order (add `trimEach: true` to draw every piece on at the same time).
- Animate `trimStart` afterwards to wipe it off the same way, or both for a travelling dash.
- **The fill is not trimmed.** Fade `fillAlpha` in once the outline is drawn.
- On an `arc`, animate `endAngle` instead (a progress ring is an arc with `startAngle: -90`).

{{demo examples/14-draw-on.html}}

## Morph one outline into another

A `path` shape can turn into another outline. Give it `morphTo` (SVG path data, in the same canvas coordinates as `d`) and animate `morph` from 0 to 1: `d` becomes `morphTo`. Fill and stroke follow, and closed outlines are lined up so the shape does not twist on the way. At 0 and 1 the shapes are drawn exactly as the paths; in between, as a polygon of points half way from one to the other.

```js
// @recipe morph-shape
const BLOB = 'M 640 160 C 780 160 860 260 860 360 C 860 470 770 560 640 560 C 510 560 420 470 420 360 C 420 250 500 160 640 160 Z';
const STAR = 'M 640 130 L 700 300 L 880 300 L 735 410 L 790 590 L 640 480 L 490 590 L 545 410 L 400 300 L 580 300 Z';
return [{
  type: 'shape', shape: 'path', d: BLOB, morphTo: STAR, duration: 4,
  initial: { fillColor: '#ffd166', strokeColor: '#ffffff', strokeWidth: 6, strokeJoin: 'round' },
  keyframes: [{ at: 0.5, to: { morph: 1 }, duration: 1.5, ease: 'power2.inOut', repeat: 1, yoyo: true }],    // there and back
}];
```

{{demo examples/gallery/shape-shift.html}}

`morphPoints` (8 to 2048, default 128) is how finely the in-between shapes are sampled. If one outline has more sub-paths than the other, the extra one grows out of (or shrinks into) its own centre.

## Lines, polygons and paths are placed by their points

`line`, `polygon` and `path` use plain canvas coordinates: the points say where it is drawn. If you also give `x` and `y`, they place the shape's **centre** instead. A background pill behind text should be sized from the text: `measureText(text, style).width + padding`.

## A progress ring

```js
// @recipe ring
return [
  { type: 'shape', shape: 'arc', radius: 120, startAngle: 0, endAngle: 360, initial: { x: 640, y: 360, strokeColor: '#27304d', strokeWidth: 24 } },
  { type: 'shape', shape: 'arc', radius: 120, startAngle: -90, endAngle: -90, strokeCap: 'round',
    initial: { x: 640, y: 360, strokeColor: '#ffd166', strokeWidth: 24 },
    keyframes: [{ at: 0.3, to: { endAngle: -90 + 360 * 0.82 }, duration: 2, ease: 'power3.out' }] },
];
```
