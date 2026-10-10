---
title: How it works
section: Start
order: 3
summary: Layers, time, keyframes and expressions. Everything else is built from these four ideas.
---

## A video is a tree of layers

`composition.sequences` is a list of **layers** (the docs also call them sequences). Each one is a plain object with a `type`. They are drawn **in array order, later on top**:

```js
sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0d1220' } },   // the background, first = at the bottom
  { type: 'text',  text: 'On top', style: { fontSize: 80, fill: '#fff' }, initial: { x: 100, y: 100 } },
  { type: 'audio', sfx: 'pop', at: 1 },
]
```

The types are `text`, `shape` (rect, circle, ellipse, arc, line, polygon, path), `image`, `video`, `audio`, `composition` (a group with its own size and time), `camera` and `three`. A **composition** is a layer that holds layers, so a video is a tree, and a repeated structure (a card, a lower third) is a function that returns an object:

```js
const card = (title, at) => ({ type: 'composition', width: 400, height: 220, at, duration: 4, sequences: [ /* … */ ] });
sequences: [card('One', 0), card('Two', 2), card('Three', 4)]
```

## Space: pixels, from the top-left

The canvas is measured in pixels with the origin at the top-left, `+x` to the right and `+y` **down**. A 1280×720 video has its centre at (640, 360). Angles are in **degrees**. A text layer's position is its **top-left** corner unless you set `anchorX: 0.5, anchorY: 0.5`, which makes `x, y` its centre (rect, circle and ellipse shapes are centred by default).

## Time: three clocks, all in seconds

| Where | `at` means |
|---|---|
| a layer | seconds from the start of its **parent** (the movie, or the composition that holds it). Default 0 |
| a keyframe | seconds from the start of **its own layer**. **A negative `at` counts back from the layer's end** |
| a transition | seconds from the start of the parent composition |

`duration` defaults to the parent's duration. A layer is **hidden outside** `[at, at + duration)` and is not removed: it simply is not drawn. Because keyframes count from their own layer, you can move a whole scene later by changing one `at`, and nothing inside it changes.

```js
{ type: 'text', text: 'Later', at: 3, duration: 2,
  keyframes: [
    { at: 0,  from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },     // fades in the moment the layer appears (3.0 s)
    { at: -0.5, to: { alpha: 0 }, duration: 0.5 },                        // fades out over the last half second (4.5 s)
  ] }
```

## Keyframes: set, to, from

A layer's starting values go in `initial`. Changes go in `keyframes`:

| Keyframe | Does |
|---|---|
| `{ at, set: { … } }` | jumps to the value at that time (and jumps back when you scrub backwards) |
| `{ at, to: { … }, duration }` | animates from where it is now to the value |
| `{ at, from: { … }, duration }` | animates from the value to where it is now |
| `{ at, from: { … }, to: { … }, duration }` | explicit start and end |

`ease` is an ease name (the familiar ones: `'power2.out'`, `'back.out(1.7)'`, `'elastic.out(1, 0.5)'`…); the default is linear. `repeat`, `yoyo` and `repeatDelay` loop a keyframe a finite number of times.

The things you can animate: `x y alpha rotation scale scaleX scaleY pivotX pivotY anchorX anchorY skewX skewY tint width height`; for shapes their colour and geometry (`fillColor`, `radius`, `trimEnd`…); for text `fill` and the [text tricks](text.html); for audio `volume`; for 2.5D `z rotationX rotationY`; and filter options as `'filters.<name>.<option>'`.

## Expressions: numbers that know the canvas

Anywhere a number goes, you can write a string with arithmetic:

```js
initial: { x: 'GW / 2', y: 'GH * 0.8', anchorX: 0.5 }       // centred horizontally, 80 % of the way down
width: 'min(W, H) * 0.4'                                      // 40 % of the smaller side of the parent
```

| Name | Is |
|---|---|
| `GW`, `GH` | the movie's size (the root) |
| `W`, `H` | the size of the parent composition |
| `w`, `h` | this layer's own size (a text layer's size **after** its style is applied) |
| `cover`, `contain` | the scale that makes an image or video cover / fit its parent |
| `t`, `d`, `T` | this layer's start time, its duration, its parent's duration |

You can use `+ - * /`, parentheses, and `min max abs floor ceil round sqrt pow sin cos tan` (radians; there is no `pi`, write `3.14159`). Expressions are evaluated **once, when the layer is built**, not every frame: use keyframes for anything that moves.

## Repeated structure is just JavaScript

The video is an object, so use functions and loops freely:

```js
const dots = Array.from({ length: 20 }, (_, i) => ({
  type: 'shape', shape: 'circle', radius: 10, initial: { x: 100 + i * 50, y: 360, fillColor: '#4cc9f0' },
  at: i * 0.1, keyframes: [{ at: 0, from: { scale: 0 }, to: { scale: 1 }, duration: 0.4, ease: 'back.out(2)' }],
}));
sequences: [background, ...dots, title]
```

Give layers a `name` when you will refer to them later (transitions find layers by name, and the [timeline](review.html) groups `dot-1`, `dot-2`… into one row).

## Next

Pick the guide for what you are making: [Text](text.html), [Shapes](shapes.html), [Images and video](images-video.html), [Audio](audio.html), [Filters](filters.html), [Transitions](transitions.html), [2.5D and camera](depth.html), [Motion](motion.html) or [Presenting](presenting.html) (a talk as one movie, with stops).
