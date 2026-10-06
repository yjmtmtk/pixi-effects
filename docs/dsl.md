# DSL Reference

This document describes the declarative composition spec that you pass to `Movie.init({ composition })`. Every shape is exported as a TypeScript type from `pixi-effects` for editor autocomplete.

- [Composition](#composition)
- [Sequences](#sequences)
- [3D layers & camera](#3d-layers--camera)
- [Assets](#assets)
- [Keyframes](#keyframes)
- [Expressions](#expressions)
- [Filters](#filters)

---

## Composition

A composition is a tree node that has a width, a height, a duration, and a list of child sequences. The root composition is what you pass to `Movie.init({ composition })`. Nested compositions appear inside a parent as a `{ type: 'composition' }` sequence.

```ts
interface CompositionSpec {
  width?: number;        // pixels; defaults to Movie width
  height?: number;       // pixels; defaults to Movie height
  duration?: number;     // seconds; defaults to Movie duration
  sequences?: SequenceSpec[];
  // (also: name, at, initial, keyframes, filters — same as SequenceCommon below)
}
```

Children of a nested composition use that composition's local coordinate system. `W`/`H` in the [scope](#expressions) refer to the **immediate parent**; `GW`/`GH` always refer to the root.

---

## Sequences

Every sequence shares this base shape:

```ts
interface SequenceCommon {
  name?: string;            // optional id, used for cross-references and debugging
  at?: number;              // start time in seconds, measured from the start of the PARENT composition (default 0)
  duration?: number;        // seconds; defaults to the parent's duration
  initial?: Props;          // properties applied before any keyframes evaluate
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
}
```

### Timing at a glance

| What | Measured from |
|---|---|
| a sequence's `at` | the start of its **parent composition** (the root composition starts at 0) |
| a **keyframe's** `at` | the start of **its own sequence** (After Effects style): `at: 0` = the moment the layer appears. **Negative = back from the sequence's end** (`-0.5` = 0.5 s before it ends) |
| a transition's `at` | the start of the **parent composition** (like a sequence's `at`) |
| `audio` volume keyframes | the start of their own sequence (same rule as every other keyframe) |

A layer is **not removed** when its lifespan `[at, at + duration)` ends: it is only hidden, and it keeps its last animated values. Outside the lifespan it is invisible. **z-order is array order** (later = on top). Build scenes by giving layers `at` / `duration` and stacking them; a full-screen background rect in each scene hides what is below it.

`Props` is `Record<string, number | string>`. String values are evaluated as [expressions](#expressions) unless the prop is a textual one (e.g. `fill`, `fontFamily`).

### `text`

Renders a [PIXI.Text](https://pixijs.com/8.x/guides/components/scene-objects/text/text). Animatable position, rotation, scale, opacity. Style fields (font size, color, weight, etc.) are set once at build time.

```ts
{
  type: 'text',
  text: 'hello',
  initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  keyframes: [
    { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
  ],
  style: {
    fontSize: 'GW * 0.05',     // expression OK
    fill: '#ffffff',           // verbatim string
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
}
```

The text's `fill` is also animatable via keyframes (under the `to`/`from`/`set` keys, not under `style`). Set `colorSpace` for perceptual interpolation:

```ts
{
  type: 'text', text: 'COLORSPACE',
  colorSpace: 'oklch',
  style: { fill: '#ff0000', fontSize: 48, fontWeight: 'bold' },
  keyframes: [
    { at: 1, to: { fill: '#00ff00' }, duration: 2, ease: 'sine.inOut' },
  ],
}
```

### `image`

Renders a [PIXI.Sprite](https://pixijs.com/8.x/guides/components/scene-objects/sprite/sprite) from a registered asset. Intrinsic `w`/`h` come from the loaded texture.

```ts
{
  type: 'image',
  asset: 'logo',
  initial: { x: 'GW/2 - w/2', y: 'GH/2 - h/2' },
}
```

`tint` is animatable via keyframes. Optionally set `colorSpace` to interpolate the tint perceptually:

```ts
{
  type: 'image', asset: 'logo',
  colorSpace: 'oklch',                 // smooth hue sweep instead of muddy sRGB
  initial: { tint: '#ff0000' },
  keyframes: [
    { at: 1, to: { tint: '#00ff00' }, duration: 2, ease: 'sine.inOut' },
  ],
}
```

### `video`

Renders a video. Intrinsic `w`/`h` come from the video's natural size. `currentTime` is driven by the timeline (so seeking the Movie scrubs the video).

```ts
{
  type: 'video',
  asset: 'green',
  loop?: false,           // loop back to start when finished (default false)
  audio?: true,           // route audio track into the mix (default true)
  volume?: 1,             // initial volume 0..1 (animatable via volume keyframes)
  initial: { x: 0, y: 0, scale: 'cover' },
}
```

Use `scale: 'cover'` or `scale: 'contain'` (these resolve via the [scope](#expressions)) to fit the video to the parent composition.

### `audio`

Audio-only sequence. No visual. Volume is animatable via keyframes.

```ts
{
  type: 'audio',
  asset: 'bgm',
  loop?: false,
  volume: 0,
  keyframes: [
    { at: 0,  to: { volume: 0.6 }, duration: 1 },     // fade in
    { at: -1, to: { volume: 0 },   duration: 1 },     // fade out (negative `at` = relative to end)
  ],
}
```

Audio is mixed during `Movie.init()` and during `Movie.render()`. Volume keyframes interpolate linearly.

### `composition`

Nested composition. Same shape as the root spec but with `type: 'composition'` and an explicit `width`/`height`. Children animate within the local coordinate system; the composition itself can be positioned, scaled, and rotated as a unit.

```ts
{
  type: 'composition',
  width: 600, height: 120,
  initial: { x: 'GW/2 - 300', y: 'GH * 0.86' },
  keyframes: [
    { at: 2.4, from: { alpha: 0, rotation: -12 },
               to:   { alpha: 1, rotation: 0 },
               duration: 0.7, ease: 'elastic.out(1, 0.5)' },
  ],
  sequences: [
    { type: 'text', text: 'inside', initial: { x: 300, y: 60, anchorX: 0.5, anchorY: 0.5 }, style: { fontSize: 28, fill: '#fff' } },
  ],
}
```

### `shape`

Parametric primitive backed by PIXI v8 `Graphics`. Six kinds, discriminated by `shape`. All geometry props accept the [expression language](#expressions), so dimensions can follow the canvas:

```ts
// Centered rounded panel that fills 80% of the canvas
{
  type: 'shape', shape: 'rect',
  width: 'W * 0.8', height: 'H * 0.6', cornerRadius: 24,
  initial: {
    x: 'W/2', y: 'H/2',
    fillColor: '#1a2640', fillAlpha: 0.85,
    strokeColor: '#3a5680', strokeWidth: 2,
  },
}
```

Every primitive draws centred on its local origin (so `anchorX`/`anchorY` and `pivotX`/`pivotY` semantics line up with the other sequence types).

| `shape`   | Required props                           | Optional               |
|-----------|------------------------------------------|------------------------|
| `rect`    | `width`, `height`                        | `cornerRadius`         |
| `circle`  | `radius`                                 | —                      |
| `ellipse` | `radiusX`, `radiusY`                     | —                      |
| `line`    | `from: [x,y]`, `to: [x,y]`               | —                      |
| `polygon` | `points: [[x,y], …]`                     | `open` (default false) |
| `path`    | `d` (SVG path data)                      | —                      |

**Style** is set on `initial` and animatable via keyframes:

| Key           | Notes                                                        |
|---------------|--------------------------------------------------------------|
| `fillColor`   | Hex string (`'#3399ff'`) or number (`0x3399ff`). Omit = no fill. |
| `fillAlpha`   | 0..1, default 1                                              |
| `strokeColor` | Hex string or number. Requires `strokeWidth > 0` to render.  |
| `strokeAlpha` | 0..1, default 1                                              |
| `strokeWidth` | Pixels. Default 0 (no stroke).                               |

Colour keys (`fillColor`, `strokeColor`) tween smoothly between hues — no snap at the end. Numeric keys (`fillAlpha` / `strokeAlpha` / `strokeWidth`) animate linearly.

#### `colorSpace`

Per-shape choice of how colour keyframes are interpolated. Default `'rgb'` (linear sRGB lerp via `gsap.utils.interpolate`) is fast but classic — a red → green ramp passes through muddy olive at the midpoint. The two perceptually uniform options keep saturation through the transition:

| Value     | Behaviour                                                                                         |
|-----------|---------------------------------------------------------------------------------------------------|
| `'rgb'`   | Default. Linear sRGB lerp.                                                                        |
| `'oklab'` | Straight line in OKLab's chromaticity plane. Brighter, more chromatic midpoints.                  |
| `'oklch'` | (L, C, h) with hue along the shorter angular path. Smooth rainbow-style sweeps; ideal for hue cycling. |

```ts
{
  type: 'shape', shape: 'circle', radius: 40,
  colorSpace: 'oklch',                       // ← red → green via vibrant orange
  initial: { fillColor: '#ff0000' },
  keyframes: [
    { at: 1, to: { fillColor: '#00ff00' }, duration: 2, ease: 'sine.inOut' },
  ],
}
```

```ts
{
  type: 'shape', shape: 'circle', radius: 40,
  initial: { x: 'W/2', y: 'H/2', fillColor: '#ff5577' },
  keyframes: [
    { at: 1, to: { fillColor: '#55ddaa' }, duration: 1.0, ease: 'sine.inOut' },
    { at: 2, to: { strokeColor: '#fff', strokeWidth: 6 }, duration: 0.5 },
  ],
}
```

**Transforms animate normally.** `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotation`, `alpha` etc. all go through the standard keyframe pipeline.

```ts
// SVG-path heart that scale-pops on entry, then beats twice
{
  type: 'shape', shape: 'path',
  d: 'M 0 -20 C -30 -50 -70 -10 0 30 C 70 -10 30 -50 0 -20 Z',
  initial: { x: 'W/2', y: 'H/2', fillColor: '#ff3366' },
  keyframes: [
    { at: 0,   from: { alpha: 0, scale: 0 },
               to:   { alpha: 1, scale: 1 },
               duration: 0.5, ease: 'back.out(2.5)' },
    { at: 1.5, to: { scale: 1.2 }, duration: 0.3, ease: 'power2.out' },
    { at: 1.8, to: { scale: 1.0 }, duration: 0.3, ease: 'power2.in' },
  ],
}
```

**Scalar geometry is animatable.** `width`, `height`, `cornerRadius` (rect), `radius` (circle), `radiusX` / `radiusY` (ellipse) all flow through the same per-frame redraw and can be tweened via keyframes — useful for progress bars (animate `width`), pulsing icons (animate `radius`), or shape-morph callouts. Array geometry (polygon `points`, line endpoints, path `d`) is baked at build time; use `scale` / `scaleX` / `scaleY` for those.

`anchorX` / `anchorY` (default `0.5` each) control which point on the bbox sits at the local origin — `0` is left/top, `1` is right/bottom. They're animatable too. Critical for "grow from one edge" effects:

```ts
// Left-anchored progress bar — width animates 0 → W, left edge stays at x
{
  type: 'shape', shape: 'rect', width: 0, height: 18, cornerRadius: 9,
  anchorX: 0,                                  // ← left edge at x
  initial: { x: 0, y: 'H/2', fillColor: '#5599ff' },
  keyframes: [
    { at: 0, to: { width: 'W' }, duration: 4, ease: 'sine.inOut' },
  ],
}
```

---

## 3D layers & camera

Place any 2D layer in depth and view it through a camera — After Effects style, no three.js. Everything uses the normal `initial` / `keyframes` / expression vocabulary.

### Conventions (read this first)

| Thing | Convention |
|---|---|
| Axes | `+x` right, `+y` down, **`+z` toward the viewer** (like CSS `translateZ`). Bigger `z` = nearer = larger on screen. |
| Units | Positions in composition pixels. **Rotations in degrees.** |
| Rotation signs | Same as CSS: `rotationY: 30` swings the right edge away; `rotationX: 30` brings the bottom edge toward you; `rotation` is the Z axis. |
| Rotation centre | The same point 2D `rotation` uses: `anchorX/anchorY` (sprites, text, shapes) or `pivotX/pivotY` (compositions). Set `anchorX: 0.5, anchorY: 0.5` to spin about the centre. |
| Default camera | Centred, looking straight at the `z = 0` plane, which maps 1:1 to pixels. A `threeD` layer at `z = 0` looks identical to a 2D layer. |
| Camera props | `x`, `y`, `z`, `lookAtX`, `lookAtY`, `lookAtZ`, `fov` — all in `initial` / `keyframes`, never on the camera itself. |

### `threeD` layers

Add `threeD: true` to any visual layer, then use `z`, `rotationX`, `rotationY`:

```json
{
  "sequences": [
    { "type": "text", "text": "tilted", "threeD": true,
      "style": { "fontSize": 64, "fill": "#ffffff" },
      "initial": { "x": "GW/2", "y": "GH/2", "anchorX": 0.5, "anchorY": 0.5, "rotationY": -35 },
      "keyframes": [{ "at": 0, "to": { "rotationY": 0 }, "duration": 1, "ease": "power2.out" }] }
  ]
}
```

`z`, `rotationX` and `rotationY` are ignored on a layer without `threeD: true` (a warning tells you). `threeD: false` layers ignore the camera and keep stack order.

### Camera

The camera is a layer: `{ "type": "camera" }`. It has no visuals. With nothing set it is the default camera.

| Prop | Meaning | Default |
|---|---|---|
| `x`, `y` | camera position | `W/2`, `H/2` |
| `z` | camera depth. **Auto:** if you never set it, it follows `fov` so the `z = 0` plane stays 1:1 | `(H/2) / tan(fov/2)` |
| `lookAtX`, `lookAtY`, `lookAtZ` | the point it looks at | `W/2`, `H/2`, `0` |
| `fov` | vertical field of view, degrees (clamped to 1–179) | 40 |

```json
{
  "sequences": [
    { "type": "camera", "name": "cam",
      "keyframes": [
        { "at": 0, "from": { "x": "GW/2 - 260", "lookAtX": "GW/2 - 260" },
                   "to":   { "x": "GW/2 + 260", "lookAtX": "GW/2 + 260" },
          "duration": 4, "ease": "sine.inOut" }
      ] },
    { "type": "shape", "shape": "rect", "width": 300, "height": 200, "threeD": true,
      "initial": { "x": "GW/2", "y": "GH/2", "z": -400, "fillColor": "#3a6ea5" } },
    { "type": "shape", "shape": "rect", "width": 300, "height": 200, "threeD": true,
      "initial": { "x": "GW/2", "y": "GH/2", "z": 250, "fillColor": "#d96a3a" } }
  ]
}
```

Moving the camera sideways makes the near rectangle slide faster than the far one (parallax). Animating only `fov` keeps the `z = 0` plane fixed and changes how strong the perspective is (a dolly zoom):

```json
{
  "sequences": [
    { "type": "camera",
      "keyframes": [{ "at": 0, "to": { "fov": 70 }, "duration": 3, "ease": "sine.inOut" }] },
    { "type": "shape", "shape": "circle", "radius": 120, "threeD": true,
      "initial": { "x": "GW/2", "y": "GH/2", "z": 300, "fillColor": "#38a169" } }
  ]
}
```

- A camera affects the `threeD` layers that are its **siblings** (same composition). A nested composition has its own camera for its children, and is itself a layer in its parent's space when it has `threeD: true`.
- Several cameras may exist if their lifespans (`at` / `duration`) do not overlap — each is a camera cut. Overlapping cameras warn; the last-listed one wins.
- With no camera layer the default camera is used.

### Depth order and limits

- Consecutive `threeD` layers are drawn farthest-first. A non-`threeD` layer between them splits the group (like After Effects).
- A layer at or behind the camera is hidden for that frame.
- v1 limits: planes do not intersect (whole layers are sorted); masks, transitions and `filterArea` are not supported on `threeD` layers (a mask is ignored with a warning); each `threeD` layer costs one extra render pass per frame.
- Wrong-but-likely names (`rotateY`, `translateZ`, `depth`, `perspective`, `zoom`) are not accepted; the console tells you the right name.

---

## three

Composites a [three.js](https://threejs.org/) scene as a normal layer. Each frame, the scene is rendered into an offscreen WebGL canvas and uploaded into the sequence's PIXI texture — so once built, the layer is a plain sprite: 2D `initial` / keyframe props, [masks](#masks), and [filters](#filters) all apply to it exactly like any other sequence type.

`type: 'three'` lives in the optional `pixi-effects/three` entry, not core `pixi-effects` — see [API reference](./api.md#pixi-effectsthree) for install/import details.

```ts
import { registerThree, three } from 'pixi-effects/three';
import * as THREE from 'three';

registerThree();   // once, before Movie.init

three({
  type: 'three',
  name: 'knot',
  width: 'GW * 0.6', height: 'GH * 0.6',
  initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  setup: (ctx) => {
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1, 0.35, 128, 32),
      new THREE.MeshStandardMaterial({ color: 0x7fb4ff }),
    );
    ctx.scene.add(knot);
    ctx.camera.position.z = 4;
    return { objects: { knot } };    // exposes `knot` to keyframes, see below
  },
  keyframes: [
    { at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 },
  ],
})
```

### Spec fields

| Field        | Type                                                        | Notes                                                                                   |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `width?`     | `PropValue`                                                 | layer size in composition px; expressions allowed (e.g. `'W * 0.5'`). Default: parent composition size. |
| `height?`    | `PropValue`                                                 | see `width`.                                                                              |
| `resolution?` | `number`                                                    | supersampling factor for the offscreen canvas. Default `1`.                              |
| `setup`      | `(ctx: ThreeContext) => Promise<ThreeSetupResult \| void> \| ThreeSetupResult \| void` | builds the scene once. Add objects to `ctx.scene`, position `ctx.camera` (or replace it via `{ camera }`). Async, so `Movie.init` can await GLTF / texture loading. |
| `update?`    | `(t: number, ctx: ThreeContext) => void`                    | optional per-frame hook; `t` is sequence-local time in seconds.                          |
| `dispose?`   | `(ctx: ThreeContext) => void`                                | cleanup for user-created GPU resources (geometries, materials, textures). Called from `destroy()`. |

`ThreeContext` is `{ scene, camera, renderer, width, height }` — the three.js `Scene`, `Camera`, `WebGLRenderer`, and the resolved layer size in composition px.

### Keyframe paths: `three.<name>.<path>`

Objects returned from `setup`'s `{ objects }` are addressable from keyframes as `three.<name>.<path>`, using the same `from`/`to`/`set` vocabulary as every other prop:

```ts
setup: (ctx) => {
  const knot = new THREE.Mesh(/* ... */);
  ctx.scene.add(knot);
  return { objects: { knot } };
},
keyframes: [
  { at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 },
  { at: 0, to: { 'three.knot.position.x': 1.5 },         duration: 3 },
],
```

`camera` is exposed implicitly as `three.camera.<path>` unless `setup`'s `objects` already defines a `camera` key.

### Rules

1. Call `registerThree()` before `Movie.init` builds a composition containing a `type: 'three'` sequence — the sequence type is looked up by name at build time.
2. `update(t)` must derive all state purely from `t` — no wall clock, no unseeded randomness. Playback and export both seek arbitrarily; anything else in `update` means identical timestamps can render different pixels.
3. Each three sequence owns one WebGL context (an offscreen canvas + renderer). Browsers cap live WebGL contexts at roughly 8–16 — budget accordingly if a composition uses several three layers.
4. Like `custom` filters, the spec carries functions (`setup`, optionally `update` / `dispose`) and is **not** JSON-serializable.
5. The scene renders into the layer rectangle: anything that projects outside it is clipped at the layer's edges. Frame the camera with margin for the whole animation — rotating objects often project taller/wider than their resting pose (a `TorusKnotGeometry(radius, tube)`, for instance, extends to `1.5 * radius + tube`, not `radius`).

---

## Masks

Any sequence can carry an inline `mask` — itself a full sequence — that shapes which pixels of the maskee are visible. The mask runs in the same coordinate space as the maskee (added to the same parent composition) and shares its lifetime, so a circular avatar crop is just:

```ts
{
  type: 'image', asset: 'photo',
  initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
  mask: {
    type: 'shape', shape: 'circle', radius: 130,
    initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
  },
}
```

The mask is itself a sequence, so it can have `keyframes` of its own — useful for reveal animations (a circle growing from `scale: 0` to full size, a rect wiping across, …):

```ts
// Iris reveal — image is wiped in by a growing circle
{
  type: 'image', asset: 'photo',
  initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
  mask: {
    type: 'shape', shape: 'circle', radius: 200,
    initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff', scale: 0 },
    keyframes: [
      { at: 0, to: { scale: 1 }, duration: 1.0, ease: 'power2.out' },
    ],
  },
}
```

Notes:
- The mask sequence is rendered as a mask, not as a normal child — its `fillColor` / `strokeColor` only matter for which pixels are kept, not for the visible colour.
- Any sequence type works as a mask (shape / image / text / nested composition); shapes are the natural choice for geometric reveals.
- For a left-to-right wipe, give the mask `anchorX: 0` (rect/circle/ellipse) so `width: 0 → full` grows rightward from the left edge.

#### `maskInverted`

When `true`, flip the mask sense: pixels INSIDE the mask shape become transparent, pixels OUTSIDE stay visible. Useful for knockout / cutout effects (punch a circular hole through a panel, etc.).

```ts
// Photo with a circular hole punched through the middle
{
  type: 'image', asset: 'photo',
  initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
  maskInverted: true,
  mask: {
    type: 'shape', shape: 'circle', radius: 80,
    initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
    keyframes: [
      { at: 0, to: { radius: 120 }, duration: 1.5, ease: 'sine.inOut' },
      { at: 1.5, to: { radius: 80 }, duration: 1.5, ease: 'sine.inOut' },
    ],
  },
}
```

Routed through PIXI v8's native `setMask({ inverse: true })`.

---

## Assets

Pass a flat list of named assets to `Movie.init({ assets })`. Sequences refer to them by `name`.

```ts
await movie.init({
  assets: [
    { name: 'logo',  src: '/img/logo.png' },
    { name: 'bgm',   src: '/audio/bgm.mp3' },
    { name: 'green', src: '/video/green.mp4' },
  ],
  composition: { /* sequences reference 'logo', 'bgm', 'green' */ },
});
```

Supported formats are whatever PixiJS Assets and the browser's audio/video decoders accept (typically PNG/JPG/WebP for images; MP3/AAC/Opus for audio; MP4/WebM for video).

---

## Keyframes

```ts
interface Keyframe {
  at?: number;       // start, in seconds from the start of THIS sequence; negative = back from the sequence's end (-0.5 = 0.5 s before it ends)
  duration?: number; // seconds (default 0 — instantaneous)
  ease?: string;     // GSAP easing name (default 'none')
  set?:  Props;      // jump to these values at `at`
  to?:   Props;      // animate from current to these values over `duration`
  from?: Props;      // animate from these values to current
  // `from` + `to` together is a 'fromTo' tween
}
```

The four kinds are mutually exclusive per keyframe:

- **`set`** — instantaneous property assignment at `at`.
- **`to`** — tween from whatever the property is at `at` to the given values, over `duration`.
- **`from`** — tween from the given values back to the current property, over `duration`.
- **`from` + `to`** — full fromTo tween, with explicit start and end values.

### Negative `at`

If `at < 0`, it's interpreted as `duration + at` — measured back from the end of **the sequence the keyframe belongs to**. Useful for fade-outs:

```ts
{ type: 'text', text: 'bye', at: 2, duration: 3,
  keyframes: [{ at: -0.5, to: { alpha: 0 }, duration: 0.5 }] }   // fades during the last 500 ms of this text (global 4.5 s – 5 s)
```

### Easing

Standard GSAP easing strings: `'none'`, `'linear'`, `'power1.in'` ... `'power4.inOut'`, `'sine.in/out/inOut'`, `'expo.in/out/inOut'`, `'circ.in/out/inOut'`, `'back.in/out/inOut(overshoot)'`, `'elastic.in/out/inOut(amplitude, period)'`, `'bounce.in/out/inOut'`. See [GSAP easing docs](https://gsap.com/docs/v3/Eases/).

### PIXI shorthands

These keys are auto-routed through GSAP's PixiPlugin when used in `initial` / `set` / `to` / `from` / `keyframes`:

```
scale, scaleX, scaleY
anchor, anchorX, anchorY
pivot, pivotX, pivotY
skew, skewX, skewY
position, positionX, positionY
tilePosition, tilePositionX, tilePositionY
tileScale, tileScaleX, tileScaleY
tint, autoAlpha
colorize, colorizeAmount, colorMatrixFilter
blur, blurX, blurY, blurPadding
lineColor, lineAlpha, fillColor, fillAlpha
```

(In addition to plain DisplayObject props like `x`, `y`, `rotation`, `alpha`, `width`, `height`, `visible`.) **Angles are in degrees**: `rotation`, `skew` / `skewX` / `skewY` (PixiPlugin converts them), and `rotationX` / `rotationY` for 3D layers.

### Filter keyframe paths

Animate a named filter's parameter using a dot-path key:

```ts
import { BlurFilter } from 'pixi.js';

{
  type: 'video',
  asset: 'green',
  filters: [
    { name: 'k', type: 'chromaKey', keyColor: '#00ff00' },
    { name: 'b', type: 'custom', filter: new BlurFilter({ strength: 0 }) },
  ],
  keyframes: [
    { at: 2, to: { 'filters.b.strength': 8 }, duration: 1 },
    { at: 4, to: { 'filters.k.threshold': 0.5 }, duration: 1 },
  ],
}
```

The path is `filters.<filter-name>.<animatable-param>`. A filter must have a `name` to be addressable.

---

## Expressions

Any string `Props` value may be an arithmetic expression. Strings whose first character is a letter or digit are tried as expressions; verbatim strings (color hex, font names, etc.) are passed through when used in fields that don't expect a number.

The expression parser is in-tree (no eval, CSP-safe). See [`src/expr/Parser.ts`](../src/expr/Parser.ts).

### Operators and functions

| Form                    | Notes                                                |
| ----------------------- | ---------------------------------------------------- |
| `+ - * /`               | binary arithmetic                                    |
| `-x`, `+x`              | unary                                                |
| `( ... )`               | parens                                               |
| `1`, `1.5`, `.25`       | decimals                                             |
| `min(a, b)`, `max(a, b)`| variadic                                             |
| `abs(x)`                |                                                      |
| `floor(x)`, `ceil(x)`, `round(x)` |                                            |
| `sqrt(x)`               |                                                      |
| `pow(a, b)`             | power                                                |
| `sin(x)`, `cos(x)`, `tan(x)` | radians                                         |

No comparison, conditional, bitwise, or string operators — keep it numeric.

### Scope variables

Each sequence has its own scope, computed at build time:

| Name      | Meaning                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `w`       | sequence intrinsic width (e.g. video natural width). 0 if not applicable.             |
| `h`       | sequence intrinsic height.                                                            |
| `W`       | parent composition width (or root if no parent).                                      |
| `H`       | parent composition height.                                                            |
| `GW`      | global (root) composition width.                                                      |
| `GH`      | global (root) composition height.                                                     |
| `contain` | scale factor that makes the sequence fit inside the parent (preserve aspect, no crop) |
| `cover`   | scale factor that makes the sequence cover the parent (preserve aspect, may crop)     |
| `t`       | sequence start time (the `at` after negative-`at` resolution), seconds                |
| `d`       | sequence duration, seconds                                                            |
| `T`       | parent (or root) duration, seconds                                                    |

### Examples

```ts
// Center an image
initial: { x: 'GW/2 - w/2', y: 'GH/2 - h/2' }

// Fit a video without cropping
initial: { x: 0, y: 0, scale: 'contain' }

// Fill a video, may crop
initial: { x: 0, y: 0, scale: 'cover' }

// Responsive font size
style: { fontSize: 'min(GW, GH) * 0.06' }

// Subtitle 4% above bottom
initial: { x: 'GW/2', y: 'GH * 0.96', anchorX: 0.5, anchorY: 1 }
```

---

## Transitions

A composition can declare scene-to-scene `transitions` that compress paired keyframes into a single line and add visual effects (mask wipes, iris reveals) that aren't expressible at the keyframe level.

```ts
{
  sequences: [
    { type: 'video', name: 'A', asset: 'a', at: 0, duration: 5 },
    { type: 'video', name: 'B', asset: 'b', at: 4, duration: 5 },
  ],
  transitions: [
    { kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' },
  ],
}
```

Common fields (`TransitionCommon`):

| Field      | Type    | Notes                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------- |
| `from`     | string  | sibling sequence's `name`. Must exist in the same composition.                         |
| `to`       | string  | sibling sequence's `name`. Must be declared **after** `from` in `sequences[]`.         |
| `at`       | number  | start of the transition, in the **parent composition's** time (like a sequence's `at`, not sequence-local); negative = back from the parent's end. |
| `duration` | number  | seconds, must be > 0.                                                                  |
| `ease`     | string? | GSAP easing name. Default `'none'` (linear).                                           |

Validation runs at composition build time. Errors throw with the offending `transitions[<index>]` quoted in the message: missing names, `to` before `from`, transition window outside either sequence's lifespan, duplicate use of one sequence as `from`, `from === to`, `duration <= 0`.

### `crossfade`

Alpha cross-dissolve. `from` fades to `alpha: 0`, `to` starts at `alpha: 0` and fades to `1`, both over `[at, at + duration]`.

```ts
{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }
```

If `to` already has an explicit `initial.alpha` (other than 0), the expander throws — remove the manual setting.

### `wipe`

A directional reveal. `to` is masked by a soft edge that travels across the screen.

```ts
{
  kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1,
  direction: 'left' | 'right' | 'up' | 'down',
  smoothing: 0.04,    // 0..1 edge softness (default 0.02)
}
```

`direction` is the direction the wipe edge travels — `'left'` means the edge moves leftward across the canvas, exposing B starting from the right side. Mirror that for `'right'` / `'up'` / `'down'`.

### `iris`

A circular reveal centered on the canvas.

```ts
{
  kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1,
  mode: 'in',         // default — B opens up from a point. 'out' = A closes down to a point.
  smoothing: 0.03,    // 0..1 edge softness (default 0.02)
}
```

`mode: 'in'` (default): B emerges from the center and grows outward.
`mode: 'out'`: A disappears from the outside in, exposing B.

### `slide`

Both sequences slide together; the new scene comes in from the opposite side.

```ts
{
  kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1,
  direction: 'left' | 'right' | 'up' | 'down',
}
```

`direction` is the direction of motion. `'left'` means A slides off to the left and B enters from the right.

The slide macro reads each sequence's existing `initial.x` / `initial.y` (if any) and treats it as the natural resting position. `B` is shifted off-screen by ±W or ±H from that position and slides back to it; `A` slides from its position to off-screen on the opposite side. So a centered text with `initial: { x: 'GW/2', anchorX: 0.5 }` ends the slide centered, not at `x: 0`.

If you've manually keyframed `x` / `y` on `A` or `B`, the slide expansion appends new keyframes alongside — your existing motion is not overwritten. Behavior with conflicting motion is the user's responsibility.

### `dip`

"Dip through": A fades out across the first half of the window and B fades in across the second half. The visible color during the dip is whatever sits behind A and B — set `Movie.background` (or place a persistent layer beneath them) for dip-to-black / dip-to-white / dip-to-color.

```ts
{ kind: 'dip', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }
```

If `to` already has a non-zero `initial.alpha`, the expander throws — remove the manual setting.

### `zoom`

A scaled punch-in / punch-out. By default `B` opens up: it starts large and zooms back to scale 1 while fading in; `A` simply fades. With `mode: 'out'` it's the opposite — `A` zooms outward as it fades, and `B` fades in at scale 1.

```ts
{
  kind: 'zoom', from: 'A', to: 'B', at: 4, duration: 1,
  mode: 'in',          // default — B opens up. 'out' = A closes outward.
  fromScale: 4,        // starting scale of the zoomed sequence (default 4)
  ease: 'power2.out',
}
```

### `dissolve`

Pixel-grain noise reveal driven by deterministic 2D Perlin noise. Pixels with a low noise value reveal first; as `uProgress` advances, more pixels reveal. The same `seed` always produces the same dissolve pattern, so a render is bit-exact reproducible.

```ts
{
  kind: 'dissolve', from: 'A', to: 'B', at: 4, duration: 1,
  scale: 30,         // pattern frequency (higher = finer grain). Default 30.
  seed: 0,           // pattern offset. Different seeds → different reveal patterns.
  smoothing: 0.05,   // edge softness within each chunk. Default 0.05.
}
```

---

## Filters

Filters are named, ordered, and per-sequence. Animate parameters via `'filters.<name>.<param>'` keyframe paths.

### `chromaKey`

Removes a key color from the source. Works on video, image, or composition layers.

```ts
{
  name: 'k',
  type: 'chromaKey',
  keyColor?: string | [number, number, number],  // hex '#00ff00' or RGB 0..1; default green
  threshold?: number,        // default 0.4 — distance from key color counted as transparent
  smoothing?: number,        // default 0.1 — softness of the cutoff edge
  spill?: number,            // default 0.2 — green-tint suppression
}
```

Animatable: `threshold`, `smoothing`, `spill`. `keyColor` is set at build time.

### `custom`

Escape hatch for any PIXI `Filter` instance — including PIXI's own built-ins (`BlurFilter`, `ColorMatrixFilter`, `NoiseFilter`, etc.), [pixi-filters](https://github.com/pixijs/filters), community packages, or your own `Filter` subclass. The instance is used as-is; animation works the same way as for `chromaKey` as long as the filter has writable scalar properties at the addressed paths.

```ts
import { BlurFilter } from 'pixi.js';
import { GlowFilter, OldFilmFilter } from 'pixi-filters';

{
  type: 'image',
  asset: 'photo',
  filters: [
    { type: 'custom', name: 'b',    filter: new BlurFilter({ strength: 0 }) },
    { type: 'custom', name: 'glow', filter: new GlowFilter({ outerStrength: 1, color: 0xffaa00 }) },
    { type: 'custom', name: 'film', filter: new OldFilmFilter() },
  ],
  keyframes: [
    { at: 1,    to: { 'filters.b.strength': 8 },          duration: 0.5 },
    { at: 2,    to: { 'filters.glow.outerStrength': 4 },  duration: 1 },
    { at: -0.5, to: { 'filters.film.noise': 0 },          duration: 0.5 },
  ],
}
```

Notes:

- `filter` must be a `Filter` instance (constructor must have run on the consumer side).
- Animation paths use scalar property setters. Filters whose properties are PointData (e.g. `pixi-filters` `RGBSplitFilter` exposes `red: { x, y }`) currently don't propagate the change to the GPU uniform when only `.x` is mutated — replace the whole point in an `onUpdate` callback or use a scalar-API filter instead.
- Without a `name`, the filter still applies but cannot be addressed via `filters.<name>.<prop>` keyframe paths.

Notes:

- `filter` must be a PIXI `Filter` instance (constructor must have run on the consumer side). Plain object literals throw.
- `pixi-filters` is **not** a dependency of pixi-effects — install it on your side if you want to use it.
- Without a `name`, the filter still applies but cannot be addressed via `filters.<name>.<prop>` keyframe paths.

---

## Presets

Presets are pure helpers that return a ready-to-use `SequenceSpec`. They expand into the existing keyframe / initial primitives — no engine surgery — so anything you can do with a preset you can also write by hand.

### `kenBurns`

Per-image motion preset for slideshows. Returns an `ImageSequenceSpec`; drop the result straight into `sequences[]`. Pair with `crossfade` / `dip` etc. transitions for the cuts between images — `kenBurns` itself emits no fade.

```ts
import { kenBurns } from 'pixi-effects';

sequences: [
  kenBurns({ asset: 'photo1', name: 'p1', at: 0,  duration: 6, motion: 'scale',    origin: [0.25, 0.25], zoom: 1.2 }),
  kenBurns({ asset: 'photo2', name: 'p2', at: 5,  duration: 6, motion: 'rotation', angle: 6 }),
  kenBurns({ asset: 'photo3', name: 'p3', at: 10, duration: 6, motion: 'position', from: [0, 0], to: [1, 1] }),
  kenBurns({ asset: 'photo4', name: 'p4', at: 15, duration: 6, motion: 'still' }),
],
```

The image is centred on the canvas; `fit` (default `'cover'`) controls how the texture is scaled to fill. The fitted scale is computed at runtime from the texture's intrinsic size, so you don't pass `imageWidth` / `imageHeight`.

#### Common fields

| Field      | Type                  | Notes                                                                                |
| ---------- | --------------------- | ------------------------------------------------------------------------------------ |
| `asset`    | string                | image asset name (registered via `Movie.init({ assets })`)                           |
| `duration` | number                | seconds of animation (required)                                                      |
| `name?`    | string                | sequence name so transitions can reference it                                        |
| `at?`      | number                | start time, parent-relative seconds                                                  |
| `fit?`     | `'cover'` \| `'contain'` | how the texture fills the canvas. Default `'cover'`.                              |
| `ease?`    | string                | GSAP easing name. Default `'sine.inOut'`.                                            |

#### `motion: 'still'`

Image sits at the canvas centre, fitted but unanimated. Useful as a stable "rest" in between motion-heavy frames.

#### `motion: 'scale'`

Zoom in or out around an arbitrary 9-point pivot.

| Field        | Type                       | Notes                                                                                       |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------- |
| `origin?`    | `[number, number]`         | pivot in [0..1] image coords. Default `[0.5, 0.5]` (centre). The original convention uses the 9-point grid `0.25 / 0.5 / 0.75`. |
| `zoom?`      | number                     | zoom factor relative to the fitted base. Default `1.15`.                                    |
| `direction?` | `'in'` \| `'out'`          | `'in'`: 1 → zoom (default). `'out'`: zoom → 1.                                              |

The pivot point stays pinned at its world position; the rest of the image grows / shrinks around it. This is the "focal-point" zoom you want for ken-burns slideshows — the eye anchors on the pivot while the surrounding pixels move.

#### `motion: 'rotation'`

Gentle rotation while keeping the image filling the canvas.

| Field        | Type                                | Notes                                                                                       |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `angle?`     | number                              | total rotation in degrees. Default `8`. Capped at 30.                                       |
| `direction?` | `'cw'` \| `'ccw'` \| `'through'`    | `'cw'` (default) = 0 → +angle. `'ccw'` = 0 → −angle. `'through'` = −angle/2 → +angle/2.     |

The scale is over-set so the rotated bounding box still covers the canvas — no background gaps as the image tilts.

#### `motion: 'position'`

Pan the image between two points within its over-scaled bounds.

| Field   | Type                | Notes                                                                                  |
| ------- | ------------------- | -------------------------------------------------------------------------------------- |
| `from?` | `[number, number]`  | start position in [0..1] of the over-scaled bounds. Default `[0.25, 0.25]`.            |
| `to?`   | `[number, number]`  | end position. Default `[0.75, 0.75]`.                                                  |
| `zoom?` | number              | over-scale factor (must be > 1 for any pan to be visible). Default `1.15`.             |

`[0, 0]` looks at the top-left of the image; `[1, 1]` looks at the bottom-right. The default pans diagonally across the upper-left and lower-right quarters of the over-scaled image (matches the Yajima-Motion preset).

### `withFade`

Spec helper that adds alpha fade-in / fade-out to **any** sequence spec. Mutates and returns the spec, so it composes with other presets (`kenBurns`, …) and drops straight into `sequences[]`.

```ts
import { kenBurns, withFade } from 'pixi-effects';

sequences: [
  withFade(kenBurns({ asset: 'photo', at: 0, duration: 6, motion: 'scale' }), { in: 0.5, out: 0.5 }),
  withFade({ type: 'text', text: 'hi', at: 5, duration: 3, initial: { x: 'GW/2' } }, { in: 0.4 }),
]
```

| Option | Type   | Notes                                                                                         |
| ------ | ------ | --------------------------------------------------------------------------------------------- |
| `in?`  | number | fade-in length in seconds, at the start of the sequence. Sets `initial.alpha = 0`.            |
| `out?` | number | fade-out length in seconds, anchored to `at + duration`. **Requires `duration` on the spec** (throws otherwise). |

The added keyframes are layered on top of any keyframes the spec already has. `withFade` is available since `0.2.0`.
