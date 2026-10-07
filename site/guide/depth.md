---
title: 2.5D and camera
section: Guides
order: 8
summary: Depth, perspective and a camera for parallax, flips and dolly zooms, with no 3D engine.
---

Add `threeD: true` to any visual layer and it gains depth: `z` (toward the viewer is positive, so bigger and nearer), `rotationX` and `rotationY` (degrees). A layer at `z: 0` with the default camera looks exactly like a normal 2D layer, so you opt in one layer at a time.

```js
{ type: 'image', asset: 'poster', threeD: true, initial: { x: 640, y: 360, z: 0, anchorX: 0.5, anchorY: 0.5, scale: 'cover' },
  keyframes: [{ at: 0, from: { rotationY: -60, z: -400 }, to: { rotationY: 0, z: 0 }, duration: 1.5, ease: 'power3.out' }] }
```

- Rotate about the **centre** by giving the layer `anchorX: 0.5` and `anchorY: 0.5` (or `pivotX` / `pivotY`).
- `threeD` layers are drawn farthest first (equal `z` keeps array order). Layers without `threeD` ignore the camera and keep array order, so a title can sit in front of everything.
- Layers at or behind the camera plane are hidden.

{{demo examples/11-depth.html}}

## A camera

Add a layer of `type: 'camera'` and animate it. Its properties go in `initial` / `keyframes`: `x y z lookAtX lookAtY lookAtZ fov`. By default it is centred, looks at the `z = 0` plane and has a field of view of 40°.

```js
{ type: 'camera', initial: { x: 640, y: 360 },
  keyframes: [{ at: 0, to: { x: 900 }, duration: 4, ease: 'sine.inOut' }] }        // a slow pan: near layers move more than far ones (parallax)
```

For a camera that circles a point, use the `orbit` preset:

```js
import { orbit } from 'pixi-effects';
orbit({ duration: 6, degrees: 40 })      // a camera layer that swings ±20° about the centre
```

An orbit makes the side the camera swings toward the *near* side: a card that is "far" at `z: -200` can end up bigger than 1× there. Pull such cards inward, and look at a frame at the extreme of the sweep.

{{demo examples/12-title-motion.html}}

## A flight, and a handheld shake

`cameraPath()` writes a camera flight as keyframes: a smooth curve through `[x, y, z]` points at an even speed, facing where it flies. An `ease` of `'power2.in'` makes it an accelerating rush. A handheld shake goes on the camera's **offsets** (`offsetX`, `offsetY`, `offsetZ`), which are added to the move, so a `wiggle()` never fights the flight. Layers the camera flies past on purpose take `hideBehindCamera: true`, so they are hidden quietly behind it instead of printing a warning.

```js
{ type: 'camera', keyframes: [
  ...cameraPath({ points: [[640, 360, 2200], [690, 330, 900], [640, 360, -3000]], duration: 7, ease: 'power2.in', frameRate: 30 }),
  ...wiggle({ duration: 7, freq: 9, props: { offsetX: { around: 0, amp: 5 }, offsetY: { around: 0, amp: 3 } } }),
] }
```

The whole corridor of gates is the `camera-fly-through` recipe.

## Groups in depth: a composition as a card

A `composition` with `threeD: true` is a **card**: its children are drawn into one texture that moves, spins and tilts as a unit. Give it `width` and `height`; content outside that rectangle is clipped, so size it for a soft shadow too.

## What it does not do

`threeD` layers do not support masks, transitions or `filterArea` (put those on a plain layer or on the card's parent). For real 3D models, add the optional `pixi-effects/three` entry and use a `three` layer: a three.js scene whose objects you drive with keyframes such as `'three.cube.rotation.y'`.

{{demo examples/10-three.html}}
