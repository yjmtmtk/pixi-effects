# DSL Reference

This document describes the declarative composition spec that you pass to `Movie.init({ composition })`. Every shape is exported as a TypeScript type from `pixi-effects` for editor autocomplete.

- [Composition](#composition)
- [Sequences](#sequences)
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
  at?: number;              // start time in seconds (default 0)
  duration?: number;        // seconds; defaults to parent duration
  initial?: Props;          // properties applied before any keyframes evaluate
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
}
```

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

### `image`

Renders a [PIXI.Sprite](https://pixijs.com/8.x/guides/components/scene-objects/sprite/sprite) from a registered asset. Intrinsic `w`/`h` come from the loaded texture.

```ts
{
  type: 'image',
  asset: 'logo',
  initial: { x: 'GW/2 - w/2', y: 'GH/2 - h/2' },
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
    { at: 2.4, from: { alpha: 0, rotation: -0.2 },
               to:   { alpha: 1, rotation: 0 },
               duration: 0.7, ease: 'elastic.out(1, 0.5)' },
  ],
  sequences: [
    { type: 'text', text: 'inside', initial: { x: 300, y: 60, anchorX: 0.5, anchorY: 0.5 }, style: { fontSize: 28, fill: '#fff' } },
  ],
}
```

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
  at?: number;       // start time in seconds; negative values are relative to the end (-0.5 = duration - 0.5)
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

If `at < 0`, it's interpreted as `duration + at` (i.e. measured from the end of the parent). Useful for fade-outs:

```ts
{ at: -0.5, to: { alpha: 0 }, duration: 0.5 }   // last 500ms of the parent
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

(In addition to plain DisplayObject props like `x`, `y`, `rotation`, `alpha`, `width`, `height`, `visible`.)

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
