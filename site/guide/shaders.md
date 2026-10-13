---
title: Shaders and warps
section: Guides
order: 8.5
summary: Draw colour fields and patterns with a Shadertoy fragment shader, and bend any layer like water or heat.
---

Most of a video is made of layers you can name: text, shapes, pictures. A **shader layer** is for what is drawn by a formula: a flowing colour field, plasma, noise, waves, a pattern that never repeats. You write a Shadertoy-style `mainImage` and it becomes a layer that fades, masks, filters, blends, moves in 2.5D and takes lights like any other.

```js
{ type: 'shader', name: 'plasma',
  fragment: `
    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 uv = fragCoord / iResolution.xy;
      float v = sin(uv.x * 10.0 + iTime) + sin(uv.y * 8.0 - iTime * 1.3);
      fragColor = vec4(mix(tint, vec3(0.1, 0.0, 0.3), 0.5 + 0.25 * v), 1.0);
    }`,
  uniforms: { tint: '#ff8040', speed: 1 },
  keyframes: [{ at: 0, to: { 'uniforms.speed': 3 }, duration: 4 }] }
```

`iTime` is the layer's own clock in seconds, `iResolution` its size, `iFrame` the frame number. Your `uniforms` are declared for you (a number, 2 to 4 numbers, or a colour) and move with keyframes by name; a component of a vector or colour is `'uniforms.tint.0'`. The colour is opaque unless you say `transparent: true`. A shader cannot read the layers behind it, so it makes pictures; to bend a picture that already exists use `warp`.

If the shader does not compile you get a warning with **your own line numbers** and the layer is a magenta checkerboard until it is fixed. A `while` loop, or a `for` loop whose bound is a variable, can hang the GPU, so write loops with a constant bound. A heavy shader can draw at `resolution: 0.5`; a few big shader layers are cheaper than many small ones.

## Bending a picture

The `warp` filter bends whatever a layer shows. `kind: 'wave'` sends a wave through it (water, a flag), `kind: 'haze'` drifts it with noise (heat over asphalt). `strength` is the largest shift in pixels, `scale` the wavelength, `speed` how fast it moves, `angle` the way a wave travels.

```js
{ type: 'text', text: 'UNDER WATER', style: { fontSize: 120, fill: '#d8f3ff' }, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
  filters: [{ type: 'warp', name: 'ripple', kind: 'wave', strength: 6, scale: 70, angle: 90 }],
  keyframes: [{ at: 0, to: { 'filters.ripple.strength': 16 }, duration: 6 }] }
```

It follows the time of the frame by itself, so there is nothing to keyframe but the options. For a swirl or a lens, `twist` and `bulgePinch` are in the filter table. The `shader-plasma` and `warp-water` recipes are complete examples.

## Draw it yourself: the `canvas` layer

When no layer draws what you need (an afterimage, rings that grow, a brush stroke, a chart, a pixel sprite), write the picture as **a function of the time**. A `canvas` layer gives your function the layer's own cleared 2D canvas and shows the result like an image, at its place in the stack: it takes `initial`, `keyframes`, `filters`, `mask`, `blendMode` and exports like any layer.

```js
// @recipe canvas-trail-guide
const at = (t) => ({ x: 640 + 420 * Math.sin(t * 1.7), y: 360 + 200 * Math.sin(t * 2.9) });      // where the dot is at time t
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101420' } },
  { type: 'canvas', name: 'trail', duration: 6, params: { tail: 0.5 },
    draw: (ctx, t, info) => {
      const N = 14;
      for (let i = N; i >= 0; i--) {                                  // the oldest first, the head last
        const p = at(Math.max(0, t - i * info.params.tail / N));
        ctx.globalAlpha = (1 - i / (N + 1)) * 0.85;
        ctx.fillStyle = '#ff4f1a';
        ctx.beginPath(); ctx.arc(p.x, p.y, 34 - i * 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } },
];
```

{{demo examples/_guide/canvas-trail.html}}

The one rule: **the same time must draw the same picture.** So `draw` uses `t` (not a counter it keeps), `info.random()` (a seeded generator, not `Math.random`) and `info.params` (numbers that keyframes can animate as `'params.tail'`). Nothing survives from the previous frame: a trail is drawn from the positions of the past. A simulation is computed whole in `setup` into an array and read by `info.frame`. `check` draws every canvas layer twice at a few moments and tells you about one whose pictures differ. A `canvas` layer cannot see what is below it (use `filters` or a matte for that), and a spec that holds one holds functions, so it is not pure JSON. The [DSL reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/dsl.md#canvas) has every key.

