# pixi-effects

> **Status**: pre-alpha (v0.1.0). API stable but unpublished.

**[Live demos →](https://yjmtmtk.github.io/pixi-effects/)** · 8 numbered examples + an in-browser playground.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/) and [GSAP](https://gsap.com/), with strict TypeScript types. Render to MP4 / WebM / MOV via [mediabunny](https://mediabunny.dev/).

- **Declarative DSL** — describe your composition as a tree of typed sequences (text, image, video, audio, nested compositions). No imperative tween code.
- **Expression language** — sprinkle `'GW * 0.5'` or `'min(W, H) / 2'` anywhere a number goes. Resolved at runtime against a sequence-relative scope.
- **Filters** — chroma key, blur, color matrix. Animatable per-keyframe.
- **Built-in player UI** — drop-in HTML5-`<video>`-style overlay controller (play, scrub, mute, volume, fullscreen, export-to-file).
- **MP4 / WebM / MOV export** — pick container and quality from the controller, or call `movie.render()` from code.
- **Tiny dependency surface** — only `mediabunny` (runtime) plus PixiJS and GSAP (peer deps).

## Install

```bash
npm install pixi-effects pixi.js gsap
```

## Quickstart

```ts
import { Movie } from 'pixi-effects';
import { Controller } from 'pixi-effects/controller';

const canvas = document.querySelector('canvas')!;
const movie = new Movie();
new Controller(movie, { canvas });

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 5, frameRate: 30,
  composition: {
    sequences: [
      {
        type: 'text',
        text: 'hello pixi-effects',
        initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0,    from: { alpha: 0, scale: 0 }, to: { alpha: 1, scale: 1 }, duration: 0.6, ease: 'back.out(1.7)' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.05', fill: '#ffffff', fontFamily: 'Arial' },
      },
    ],
  },
});
```

`movie.play()` starts playback. The controller bar handles user input. To export from code:

```ts
const blob = await movie.render({ format: 'mp4' });
```

## Documentation

- [**DSL reference**](./docs/dsl.md) — composition, sequences, keyframes, expressions, filters
- [**API reference**](./docs/api.md) — `Movie`, `Controller`, events, render options
- [**Examples**](./examples/) — runnable HTML files (read in order):
  - `01-hello.html` — minimum viable composition
  - `02-keyframes.html` — keyframes, easings, expressions
  - `03-shapes.html` — every shape primitive
  - `04-media.html` — image / video / audio
  - `05-composition-mask.html` — nested compositions and masks
  - `06-filters.html` — built-in and pixi-filters via `{ type: 'custom' }`
  - `07-transitions.html` — all seven transition kinds in one timeline
  - `08-presets-export.html` — `kenBurns` preset and `movie.render()` from code
  - `playground.html` — in-browser editor with preset dropdown

## Browser support

Rendering uses the [WebCodecs API](https://developer.mozilla.org/docs/Web/API/WebCodecs_API) via mediabunny:

| Feature   | Chrome 94+ | Edge 94+ | Safari 16.4+ | Firefox 130+ |
| --------- | ---------- | -------- | ------------ | ------------ |
| Playback  | ✅          | ✅        | ✅            | ✅            |
| MP4 (avc) | ✅          | ✅        | ✅            | ✅            |
| WebM (vp9)| ✅          | ✅        | ✅            | ✅            |
| MOV (avc) | ✅          | ✅        | ✅            | ✅            |

Some codecs (notably `aac` audio in older Firefox) may need the [mediabunny polyfill encoders](https://mediabunny.dev/) (`@mediabunny/aac-encoder`, etc.).

## License

MIT — see [LICENSE](./LICENSE).
