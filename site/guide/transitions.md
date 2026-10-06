---
title: Transitions
section: Guides
order: 6
summary: Cross-fades, wipes, irises, slides, dips, zooms and dissolves between two layers.
---

A transition blends **two named layers** over a short window. Declare it on the composition that holds them:

```js
// @recipe two-scenes
const scene = (name, at, color, label) => ({
  type: 'composition', name, at, duration: 4, width: 1280, height: 720,
  sequences: [
    { type: 'shape', shape: 'rect', width: 1280, height: 720, initial: { x: 640, y: 360, fillColor: color } },
    { type: 'text', text: label, style: { fontSize: 120, fill: '#ffffff', fontWeight: 'bold' }, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 } },
  ],
});
return {
  sequences: [scene('a', 0, '#3b5bdb', 'One'), scene('b', 3, '#e64980', 'Two')],     // they overlap for 1 s: 3 to 4
  transitions: [{ kind: 'wipe', from: 'a', to: 'b', at: 3, duration: 1, direction: 'left' }],
  duration: 7,
};
```

The rules:

- `from` and `to` are the `name`s of two **sibling** layers, and `to` is declared after `from`.
- **Both layers must be alive for the whole window**, so overlap them by the transition's `duration` (above, `b` starts at 3 and `a` lasts until 4).
- Only those two layers are affected; every other layer stays put. Captions are their own layers on top.
- Total length of a slideshow is `n × (L − T) + T` for `n` scenes of length `L` with transitions of length `T`.

| `kind` | Extra options | Looks like |
|---|---|---|
| `crossfade` | | the usual dissolve |
| `wipe` | `direction: 'left' 'right' 'up' 'down'`, `smoothing` | an edge sweeps across |
| `iris` | `mode: 'in' 'out'` | a circle opens or closes |
| `slide` | `direction` | the scenes push each other |
| `dip` | | through black |
| `zoom` | `mode`, `fromScale`, `scale` | a push-in |
| `dissolve` | `seed` | a noisy dissolve |

{{demo examples/07-transitions.html}}

{{demo examples/gallery/transitions-reel.html}}
