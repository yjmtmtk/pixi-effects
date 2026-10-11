# pixi-effects quick start

    npx pixi-effects new my-video          # a page to edit
    npx pixi-effects view my-video.html    # look at it while you edit
    npx pixi-effects check my-video.html   # warnings, layout, sound, a contact sheet: LOOK at the PNG
    npx pixi-effects help <word>           # the docs about a word: mask, threeD, keyframes, music
    npx pixi-effects recipe [id]           # tested pieces to copy

A video is data: `sequences` (text, shape, image, video, audio, composition, camera), each with `at`, `duration`, `initial`, `keyframes`.

```js
// @recipe quickstart
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#10162b' } },
  { type: 'text', text: 'Hello', at: 0.3, duration: 4, style: { fontSize: 140, fill: '#ffffff', fontWeight: '800' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { y: 'GH/2 + 40', alpha: 0 }, to: { y: 'GH/2', alpha: 1 }, duration: 0.6, ease: 'power3.out' }] },
];
```

What goes wrong most:
- A keyframe `at` is seconds from the layer's own start; a layer's `at` and a transition's `at` are movie seconds.
- A layer stays hidden after its time; z-order is array order; a scene is layers with `at`/`duration` over an opaque rect.
- Numbers may be expressions (`'GW/2 - w/2'`); angles are degrees.
- Anchors: rect and circle are centred on x,y; text and image are top-left (use `anchorX: 0.5`).
- A warning is an instruction: `window.__logs` must be `[]`. Fix what it names.
- Sound needs no files: `{ type: 'audio', sfx: 'swoosh', at: 2 }`, or `music: { bpm, tracks }`.
- Never say done before you have looked at the check's PNG.
- Anything else: `help <word>` first; the cheatsheet is for grep, not for reading.
