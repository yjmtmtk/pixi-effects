# pixi-effects

> **Status**: pre-alpha (v0.1.0). API stable but unpublished.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/), with strict TypeScript types.

## Install

```bash
npm install pixi-effects pixi.js gsap
```

## Quickstart

```ts
import { Movie } from 'pixi-effects';
import { Controller } from 'pixi-effects/controller';

const movie = new Movie();
new Controller(movie, { container: document.getElementById('ctrl')! });
await movie.init({
  canvas: document.querySelector('canvas')!,
  width: 1280, height: 720, duration: 5, frameRate: 30,
  composition: {
    sequences: [
      {
        type: 'text',
        text: 'hello pixi-effects',
        initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.05', fill: '#ffffff', fontFamily: 'Arial' },
      },
    ],
  },
});

movie.play();
const blob = await movie.render({ format: 'mp4' });
```

## Documentation

See [`docs/specs/`](./docs/specs/) for the design spec.

## License

MIT — see [LICENSE](./LICENSE).
