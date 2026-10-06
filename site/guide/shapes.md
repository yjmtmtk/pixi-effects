---
title: Shapes
section: Guides
order: 2
summary: Rectangles, circles, rings, lines and paths, and how to draw a stroke on.
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

Style: `fillColor`, `fillAlpha`, `strokeColor`, `strokeAlpha`, `strokeWidth`, plus `fillGradient` (a linear or radial gradient, which with transparent stops makes a vignette) and `strokeCap` / `strokeJoin` (`'round'` is friendly). Colours can tween in a perceptual colour space with `colorSpace: 'oklab'` or `'oklch'`, which avoids the muddy middle of a red-to-green fade.

{{demo examples/03-shapes.html}}

## Draw a stroke on

`trimStart` and `trimEnd` (0 to 1, animatable) are the part of the outline that is stroked. Start `trimEnd` at 0 and animate it to 1 and the line **draws itself**:

```js
{ type: 'shape', shape: 'path', d: 'M 0 50 L 45 95 L 130 0', trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
  initial: { x: 640, y: 360, strokeColor: '#7bd88f', strokeWidth: 16 },
  keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 1, ease: 'power2.inOut' }] }              // a check mark drawing itself
```

- A rectangle's outline starts at its top-left and goes clockwise; a circle or ellipse starts at 12 o'clock; a polygon's closing edge counts; a path's pieces count as one length, in order.
- Animate `trimStart` afterwards to wipe it off the same way, or both for a travelling dash.
- **The fill is not trimmed.** Fade `fillAlpha` in once the outline is drawn.
- On an `arc`, animate `endAngle` instead (a progress ring is an arc with `startAngle: -90`).

{{demo examples/14-draw-on.html}}

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
