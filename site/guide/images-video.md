---
title: Images and video
section: Guides
order: 3
summary: Load pictures and clips, move them with Ken Burns, cut them with masks, and key out a green screen.
---

## Assets and image layers

List the files in `assets` when you call `movie.init`, then refer to them by `name`:

```js
await movie.init({
  /* … */
  assets: [{ name: 'photo', src: './photo.jpg' }, { name: 'clip', src: './clip.mp4' }],
  composition: { sequences: [{ type: 'image', asset: 'photo', initial: { x: 0, y: 0 } }] },
});
```

`src` can be a URL, a `data:` URL or a `blob:` URL, so an image drawn on a canvas (`canvas.toDataURL()`) works too. An image's natural size is `w` and `h` in expressions; `initial: { scale: 'cover' }` makes it cover its parent (`'contain'` fits inside). The default anchor is the top-left. Colour an image with `tint`.

**Make source images at least as large as the canvas** (1920×1080 for a 1280×720 video): zooming in on a small image looks soft.

## Ken Burns: a still that moves

`kenBurns` is a preset that returns a ready image layer which covers the canvas and moves slowly:

```js
import { kenBurns } from 'pixi-effects';
kenBurns({ asset: 'photo', name: 'scene1', at: 0, duration: 5, motion: 'scale', zoom: 1.15, origin: [0.55, 0.6], ease: 'sine.inOut' })
kenBurns({ asset: 'photo', at: 5, duration: 5, motion: 'position', from: [0.4, 0.5], to: [0.6, 0.5], zoom: 1.12 })
```

`motion` is `'still'`, `'scale'` (zoom in or out about `origin`), `'rotation'` or `'position'` (pan). Combine it with [transitions](transitions.html) for a slideshow.

{{demo examples/gallery/still-water.html}}

## Transparent images

A PNG or WebP with an alpha channel just works, and **WebP is much smaller**: four museum teapots cut out of their backgrounds are 64–94 KB each as WebP and about 650–700 KB as PNG. Put them in front of other layers, give them a soft shadow that is itself a feathered PNG, and the transparency does the rest.

{{demo examples/gallery/teatime.html}}

## Video clips

```js
{ type: 'video', asset: 'clip', initial: { scale: 'cover' }, loop: true, volume: 0.8 }
```

`audio` and `volume` control the clip's own sound; `loop` repeats it. Video layers are frame-accurate when you scrub and when you export.

Change the speed with `speed`: `{ type: 'video', asset: 'clip', speed: 0.5 }` is slow motion, `speed: -1` plays backward, `speed: 2` is twice as fast (with no `duration` the layer is as long as the clip divided by the speed). For a freeze or a ramp animate `time`, the position in the file in seconds, like any property: `keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 1 }, { at: 1, to: { time: 2 }, duration: 0.5 }]` plays two seconds, then holds. The sound follows, pitch included. [Motion](motion.html#time-slow-motion-rewind-freeze) has the same idea for any group of layers.

## Masks

Any layer can be a **mask** for another: only the part under the mask shows. A mask is a layer spec, so it can be a shape, a text, or even an image:

```js
{ type: 'image', asset: 'photo', initial: { scale: 'cover' },
  mask: { type: 'shape', shape: 'circle', radius: 220, initial: { x: 640, y: 360 },
          keyframes: [{ at: 0, from: { radius: 0 }, to: { radius: 420 }, duration: 1.2, ease: 'power2.out' }] } }     // an iris that opens
```

`maskInverted: true` cuts a hole instead. A mask with no `at` of its own lives exactly as long as the layer it masks, and its keyframes count from that layer's start.

{{demo examples/05-composition-mask.html}}

## Blend modes and chroma key

`blendMode` on a layer mixes it with what is behind it, with the same 18 names as CSS `mix-blend-mode` (`add`, `screen`, `multiply`, `overlay`, `soft-light`, `color-dodge`, `hue`, …): `add` and `color-dodge` for glows and light leaks, `soft-light` for a colour cast over a photo, `multiply` for a vignette (the recipe `light-leak`). On a composition each child blends; to blend a composition as one picture give it `threeD: true` or a filter. `filters: [{ type: 'chromaKey', keyColor: '#00ff00' }]` removes a green screen from a video; its `threshold`, `smoothing` and `spill` are animatable.

{{demo examples/04-media.html}}
