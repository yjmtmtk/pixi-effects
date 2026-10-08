---
title: Motion: groups, waves and randomness
section: Guides
order: 7
summary: Move a whole group with a null layer, send a layer along a path, ripple things in with stagger, and add shake and variety that comes out the same on every run.
---

Small tools that make motion feel designed instead of mechanical. They fit together: the piece at the bottom of this page uses all of them.

## Randomness that does not change

`Math.random()` gives a different picture every time you play, scrub or export, which is exactly what you do not want in a video. pixi-effects has **seeded** randomness instead: the same seed always gives the same number.

- In an expression: `rand(seed)` is a number from 0 to 1, and `noise(x, seed)` is smooth noise from −1 to 1. Give every layer its own seed, usually its loop index.
- In plain JavaScript: `random(seed)` returns a function that gives a repeatable stream, and `rand(seed)` / `noise(x, seed)` are exported too.
- Small helpers in expressions: `lerp(a, b, t)`, `clamp(x, lo, hi)`, `smoothstep(a, b, x)`, `mod(a, b)`, `step(edge, x)` (the way to write an "if"), and `PI`.

```js
// @recipe seeded-field
// 40 specks placed and sized by seed: the same field in the preview, on every run and in the exported file
return Array.from({ length: 40 }, (_, i) => ({
  type: 'shape', shape: 'circle', radius: 2 + rand(i) * 4, duration: 6,
  initial: { x: 40 + rand(i + 100) * 1200, y: 40 + rand(i + 200) * 640, fillColor: '#ffffff', fillAlpha: 0.2 + rand(i + 300) * 0.5 },
}));
```

## A shake that is the same every time

`wiggle()` turns a seed into keyframes: each property drifts between random targets and ends back where it started. A low `freq` floats, a high one shakes, and `ease: 'none'` gives a jittery flicker.

```js
// @recipe shake
return [
  { type: 'text', text: 'NIGHT SHIFT', duration: 6, style: { fontSize: 120, fill: '#ffffff', fontWeight: '800' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: wiggle({ duration: 6, freq: 3, seed: 1, props: { x: { around: 'GW/2', amp: 8 }, y: { around: 'GH/2', amp: 6 }, rotation: { around: 0, amp: 1.2 } } }) },
  { type: 'shape', shape: 'rect', width: 520, height: 8, duration: 6, initial: { x: 'GW/2', y: 'GH/2 + 90', fillColor: '#ff4d6d' },
    keyframes: wiggle({ duration: 6, freq: 12, seed: 5, ease: 'none', props: { alpha: { around: 0.8, amp: 0.2 } } }) },   // a stuttering neon light
];
```

`keyframes` is a list, so you can spread a wiggle next to other keyframes: `keyframes: [...wiggle({ … }), { at: 4, to: { alpha: 0 }, duration: 1 }]`.

## Move a group: null layers and `parent`

A `{ type: 'null' }` layer draws nothing; it only moves. Give other layers `parent: 'its name'` and they are drawn inside it, so moving, turning, scaling or fading the null does the same to all of them. A child's `x` and `y` are measured **from the null's origin**, which is why a rotating null makes its children circle it.

Nulls can have nulls as parents, so an orbit within an orbit is just a chain:

```js
// @recipe orbit-chain
return [
  { type: 'shape', shape: 'circle', radius: 50, duration: 8, initial: { x: 640, y: 360, fillColor: '#ffd166' } },
  { type: 'null', name: 'earth-orbit', initial: { x: 640, y: 360 }, keyframes: [{ at: 0, to: { rotation: 360 }, duration: 8, ease: 'none' }] },
  { type: 'shape', shape: 'circle', radius: 20, parent: 'earth-orbit', initial: { x: 240, y: 0, fillColor: '#4cc9f0' } },
  { type: 'null', name: 'moon-orbit', parent: 'earth-orbit', initial: { x: 240, y: 0 }, keyframes: [{ at: 0, to: { rotation: 1440 }, duration: 8, ease: 'none' }] },
  { type: 'shape', shape: 'circle', radius: 7, parent: 'moon-orbit', initial: { x: 55, y: 0, fillColor: '#e8eefc' } },
];
```

Two things to know. The children of a null are drawn together, at the null's place in the layer list. And only `null` layers can be parents (not shapes, text or images); a wrong name or a cycle gets a warning and the layer is drawn without a parent.

A null at the middle of the canvas that carries *everything* is also the easiest way to make a camera shake or a slow push-in: put the `wiggle()` and a `scale` keyframe on that one layer.

## Travel along a path

`followPath()` turns an SVG path into keyframes for `x` and `y`: a layer rides a curve at an even speed, and with `orient: true` it also turns to face the way it is going. Set `frameRate` to the movie's so the layer is exactly on the path at every frame.

```js
// @recipe path-ride
const ROUTE = 'M 120 560 C 360 120 920 120 1160 560';
return [
  { type: 'shape', shape: 'path', d: ROUTE, duration: 5, initial: { strokeColor: '#ffffff', strokeWidth: 3, strokeAlpha: 0.25 } },
  { type: 'shape', shape: 'polygon', points: [[-18, -12], [18, 0], [-18, 12]], at: 0.5, duration: 4.5, initial: { fillColor: '#ffd166' },
    keyframes: followPath({ d: ROUTE, duration: 4, ease: 'power2.inOut', orient: true, frameRate: 30 }) },
];
```

The layer's own `x` and `y` are the points of the path, so give circles and shapes their centre there and text `anchorX: 0.5, anchorY: 0.5`. Give the layer its own `at` (as above) so it is not drawn at the origin before the trip begins. `from` and `to` (fractions of the path) travel only part of the way, or backwards; `rotate: -90` fixes an image that points up. To turn one outline into another, see [Shapes](shapes.html#morph-one-outline-into-another).

## Springs

`ease: 'spring.bouncy'` moves a value the way a damped spring does: it overshoots, rings and rests. Name a feel with a preset (`spring.gentle`, `spring.snappy`, `spring.bouncy`, `spring.wobbly`, `spring.slow`) or write the physics, `spring(mass, stiffness, damping)`. `duration: 'auto'` gives the keyframe the time the spring needs to settle, so the numbers are real physics:

```js
{ at: 0.2, from: { y: -200 }, to: { y: 0 }, duration: 'auto', ease: 'spring.bouncy' }
{ at: 0,   to: { scale: 1 },  duration: 0.8,   ease: 'spring(1, 170, 12)' }
```

| Preset | Settles in | Highest value (target = 1) |
|---|---|---|
| `spring.snappy` | 0.42 s | 1.01 |
| `spring.gentle` | 0.72 s | 1.02 |
| `spring.bouncy` | 1.08 s | 1.28 |
| `spring.slow` | 1.29 s | 1.00 (no overshoot) |
| `spring.wobbly` | 1.61 s | 1.40 |

With a number for `duration`, that number is the settle time and only the damping decides how much it overshoots. A damping ratio of 1 or more never overshoots: `spring(1, 170, 26)` does not bounce, `spring(1, 170, 12)` does. A colour that overshoots is clamped, and `alpha` past 1 shows nothing, so springs are for position, scale and rotation first.

## Waves: `stagger`

`stagger()` gives the delays for a wave of items, in the style of GSAP: `each` (gap between neighbours) or `amount` (total), `from` (`'start'`, `'end'`, `'center'`, `'edges'`, `'random'` or an index), `grid: [columns, rows]` for a ripple across a grid, and `ease`. Give it a number to get the delays, or give it layers and it returns them with `at` pushed back.

```js
// @recipe ripple
const style = { fontFamily: 'Arial, sans-serif', fontSize: 96, fontWeight: 'bold', fill: '#ffffff' };
const letters = stagger(
  splitText('RIPPLE', style, { x: 640, y: 120, align: 'center' }).map(p => ({
    type: 'text', name: 'letter-' + p.index, text: p.text, style, at: 0.2, duration: 4,
    initial: { x: p.x, y: p.y, alpha: 0 },
    keyframes: [{ at: 0, from: { y: p.y + 40, alpha: 0 }, to: { y: p.y, alpha: 1 }, duration: 0.4, ease: 'back.out(2)' }],
  })),
  { each: 0.07, from: 'center' });                     // the letters rise from the middle outwards
const COLS = 6, ROWS = 3, delays = stagger(COLS * ROWS, { each: 0.12, grid: [COLS, ROWS], from: 'center', ease: 'sine.out' });
const tiles = delays.map((d, i) => ({
  type: 'shape', shape: 'rect', width: 120, height: 120, cornerRadius: 18, at: 1 + d, duration: 3 - d,
  initial: { x: 190 + (i % COLS) * 180, y: 330 + Math.floor(i / COLS) * 150, fillColor: '#4cc9f0', scale: 0 },
  keyframes: [{ at: 0, to: { scale: 1 }, duration: 0.4, ease: 'back.out(2)' }],
}));
return [...letters, ...tiles];
```

`stagger` changes only `at`. If a layer should live to the end of the video, set its `duration` after the stagger (`duration: total - layer.at`).

## All together

A museum plate of the solar system. One null layer carries the whole diagram (and breathes a little, by hand, with `wiggle`); five planets and a moon ride nested rotating nulls; the orbit rings draw on in a `stagger` wave, and so do the clicks. The stars come from seeds.

{{demo examples/gallery/orbit-rig.html}}

And a poster for the path and text tools: a square turns into a circle turns into a triangle (path morphing), a small dot rides the ring round them (`followPath`), and the big lines and the changing word arrive letter by letter (`animateText`).

{{demo examples/gallery/shape-shift.html}}

To make motion follow a sound instead of a seed, see [Audio](audio.html#visuals-that-follow-the-music): `audioEnvelope()` analyses the music and `react()` turns it into keyframes the same way. For slides that move, see [Presenting](presenting.html).
