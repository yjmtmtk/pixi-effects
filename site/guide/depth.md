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

## Depth of field

Two more camera properties turn on the blur of a real lens: `focus` (which plane is sharp: a `threeD` layer's name, or a `z`) and `aperture` (how shallow, 30 by default, 0 = off). The other `threeD` layers blur by how far they are from the plane in focus; with neither property written, nothing is blurred and nothing costs anything.

```js
{ type: 'camera', initial: { focus: 'title' } }                    // the title is sharp, the rest softens with distance
```

A **rack focus** moves the focus from one layer to another with an ordinary keyframe (a layer's name works there too), and a handheld `wiggle()` or a dolly can run at the same time:

```js
{ type: 'camera', initial: { focus: 'near', aperture: 40 },
  keyframes: [{ at: 1, to: { focus: 'far' }, duration: 1, ease: 'power2.inOut' }] }
```

`aperture` is the lens diameter in pixels: 30 is clearly shallow, 60 is strong, 100 is extreme. A name in `focus` means that layer's first `z`, so to follow a layer that moves, write `focus` as numbers. The blur is the same over the whole layer, and a card (a `threeD` composition) blurs as one layer. The whole example is the `rack-focus` recipe.

## Light, shadow and fog

Add a `light` layer and every `threeD` layer in the same composition is lit: it gets darker and brighter with its angle to the light and its distance from it, so flat cards start to look like a room. A light is a layer like the camera: it draws nothing, and its numbers go in `initial` and `keyframes`, so a spotlight can cross the picture.

```js
{ type: 'light', kind: 'ambient', initial: { intensity: 0.2 } },
{ type: 'light', kind: 'spot', initial: { x: 160, y: -120, z: 700, lookAtX: 260, lookAtY: 330, coneAngle: 34, coneFeather: 0.7 },
  keyframes: [{ at: 0.5, to: { x: 1100, lookAtX: 1020 }, duration: 4.5, ease: 'sine.inOut' }] },
```

The kinds are `ambient` (the same colour everywhere), `point`, `spot` (a cone) and `parallel` (the sun). **What no light reaches is black**, so keep a dim ambient light in the scene. A layer you want flat is `lit: false`. A shadow needs `castsShadows: true` on the light **and** on the layer that casts it; `shadowDiffusion` makes the edge soft, wider the farther the shadow falls. A layer takes shadows from up to four casters, and soft shadows are the costly part, so use them on one or two lights.

Fog belongs to the camera: `fogNear`, `fogFar`, `fogColor` (and `fogAmount`) fade `threeD` layers into a colour with distance. Draw the background in the same colour so the far things dissolve into it.

Layers are still drawn in distance order and there is no depth buffer, so a room is built from big layers (a wall behind, a floor whose origin is at its far edge), not from planes that cross. The `spot-room` and `fog-depth` recipes are complete examples.

## Groups in depth: a composition as a card

A `composition` with `threeD: true` is a **card**: its children are drawn into one texture that moves, spins and tilts as a unit. Give it `width` and `height`; content outside that rectangle is clipped, so size it for a soft shadow too.

## What it does not do

`threeD` layers do not support masks, transitions or `filterArea` (put those on a plain layer or on the card's parent). For real 3D models, add the optional `pixi-effects/three` entry and use a `three` layer: a three.js scene whose objects you drive with keyframes such as `'three.cube.rotation.y'`.

{{demo examples/10-three.html}}
