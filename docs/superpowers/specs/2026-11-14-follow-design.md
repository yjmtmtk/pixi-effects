# `follow` and `movie.project`: a 2D layer that stays next to an object of a scene

Owner: 「オススメで」 (2026-11-14) to "both: a function that says where an object is on screen, and a one-line way for a layer to follow it".

## Why

Trial 2026-11-14 (planets-click, Sonnet and Opus): both agents put a name label next to each orbiting planet of a `scene3d` layer. Both re-implemented the camera's projection by hand and copied the camera keyframe's ease to bake label keyframes; Opus called it the most fragile part of the piece. The same wish came up for products ("a callout on the lid") and is common in explainers. PixiJS 3D has `view3d.worldToScreen(point)`; three.js has `vector.project(camera)`; nothing in pixi-effects connects them to a layer.

## What

1. **`follow: '<layer>/<object>'`** on any 2D layer (text, shape, image, composition, null, …): every frame the layer is carried to where that object is on screen; its own `x` / `y` (initial and keyframes) become an offset from that point, in px. The common case is one line:
   `{ type: 'text', text: 'Mars', follow: 'planets/Mars', initial: { x: 18, y: -14, anchorX: 0 } }`.
   - `<layer>` is a layer's name (a path through nested compositions, `group/planets`, or a name found anywhere in the movie when it is unique); `/<object>` is an object of a `scene3d`, `three` or `scene2d` layer: a name its `setup` returned in `objects`, or the `label` of any node in the scene (a part of a glTF model). Without `/<object>` the layer follows the other layer's anchor point.
   - When the object is behind the camera, or the followed layer is not on screen (outside its `at` / `duration`, or hidden), the follower is hidden for that frame.
   - A follower is a function of the time like everything else: placed after every layer has been set for the frame (after `update(t)` of the scene layers and their `followCamera`), before the threeD projection and the mattes, in playback, a seek and an export.
2. **`movie.project(target)`** → `{ x, y } | null`: where the same target is on the canvas in the frame on screen (composition px, the space of `movie.pick`), null when it is behind the camera or not on screen. Unknown names throw with the names there are.
3. **`check --do 'click planets/Mars'`** clicks where `movie.project` says (today `--do` knows only layer names).

## Not in this version (said in a sentence when met)

- A `threeD` layer cannot follow, and a layer inside a `threeD` card cannot be followed (the card is projected after; its 2D coordinates are not the screen's).
- No 3D offset on the object (a point above the planet is a screen offset in `x` / `y`; a node in the scene can be added and named for a point on a model).
- No smoothing or clamping to the frame edge.

## How (the builder's notes)

- **Carrier:** for each follower the composition makes an internal `NullSequence` with no keyframes and puts the follower inside it, exactly as `parent: 'null'` does (masks, mattes, pick and inspect carriers, stacking all work unchanged); a follower that also has `parent` keeps it: the carrier sits inside that null. Hiding = the carrier's `renderable = false` (pick and inspect already read carriers' `renderable`).
- **Placement:** `Movie._updateSpace` calls `placeFollowers(root)` after `syncFrame` and before `updateSpace`: for every carrier, resolve the target (cached per build), get its global point, `carrier.position = carrier.parent.toLocal(global)`.
- **Where an object is:** each scene layer answers `screenPoint(object)` → global `{ x, y }`, `null` (behind / hidden), or `undefined` (no such object): scene3d `view.worldToScreen(node.getGlobalPosition())`; three `getWorldPosition` → `project(camera)` → the layer's box → `toGlobal`; scene2d `node.getGlobalPosition()`. A plain layer: its display's position in its parent, `toGlobal`.
- **Mistakes in a sentence:** unknown layer or object (did you mean, and the known names), a follower that is `threeD` / a camera / a light / a sound, a target inside a `threeD` card, a follower whose `x` / `y` offset is larger than the composition (the usual sign of absolute coordinates written by habit: "x / y are measured from the followed point").
- **Tests (film `follow`):** a follower lands on the object (scene2d moving node, scene3d moving mesh, a plain layer, a nested composition) at several frames and equals `movie.project` plus the offset; hidden behind the camera and outside the target's lifespan; forward / backward / repeat seeks give one picture per frame; the export equals the seek; pick finds the follower where it is drawn; the warnings above; three in its own test; `check --do click layer/object`.
