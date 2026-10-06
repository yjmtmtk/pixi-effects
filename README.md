# pixi-effects

> **Status**: experimental — current release `0.4.0`. The API may still change between minor versions (see [CHANGELOG](./CHANGELOG.md): `0.4.0` makes a mask share its layer's lifetime, `0.3.0` made keyframe `at` relative to the layer).

**[Gallery →](https://yjmtmtk.github.io/pixi-effects/examples/gallery/)** · 30 portfolio pieces written as plain data by AI models · **[Live demos →](https://yjmtmtk.github.io/pixi-effects/)** · 12 numbered examples + an in-browser playground.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/) and [GSAP](https://gsap.com/), with strict TypeScript types. Render to MP4 / WebM / MOV via [mediabunny](https://mediabunny.dev/).

- **Declarative DSL** — describe your composition as a tree of typed sequences (text, image, video, audio, shapes, nested compositions). No imperative tween code.
- **Expression language** — sprinkle `'GW * 0.5'` or `'min(W, H) / 2'` anywhere a number goes. Resolved at runtime against a sequence-relative scope.
- **Filters, masks, transitions** — chroma key, blur, color matrix (or any PixiJS filter); inline masks; seven scene transitions (`crossfade`, `wipe`, `iris`, `slide`, `dip`, `zoom`, `dissolve`).
- **Presets** — `kenBurns` for stills, `withFade` for fade-in/out.
- **2.5D layers & camera** — add `threeD: true`, `z`, `rotationX/Y` and a `{ type: 'camera' }` layer for parallax, flips and dolly zooms; no three.js needed.
- **three.js layer** *(optional)* — drop a real three.js scene in as a layer via `pixi-effects/three`; keyframes drive its objects (`three.cube.rotation.y`).
- **Built-in player UI** — drop-in HTML5-`<video>`-style overlay controller (play, scrub, mute, volume, fullscreen, export-to-file).
- **MP4 / WebM / MOV export** — pick container and quality from the controller, or call `movie.render()` from code.
- **Tiny dependency surface** — only `mediabunny` (runtime) plus PixiJS and GSAP (peer deps). three.js is an *optional* peer, needed only if you import `pixi-effects/three`.

## Install

```bash
npm install pixi-effects pixi.js gsap
npm install three        # optional — only if you import `pixi-effects/three`
```

### Browser via CDN (no bundler)

Drop the imports into an [importmap](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap) and you're done — see [`examples/`](./examples/) for full files.

```html
<script type="importmap">
{
  "imports": {
    "pixi.js":                 "https://esm.sh/pixi.js@8.22.0?bundle-deps",
    "gsap":                    "https://esm.sh/gsap@3.12.5",
    "gsap/PixiPlugin":         "https://esm.sh/gsap@3.12.5/PixiPlugin",
    "mediabunny":              "https://esm.sh/mediabunny",
    "pixi-effects":            "https://cdn.jsdelivr.net/npm/pixi-effects@0.4.0/dist/index.js",
    "pixi-effects/controller": "https://cdn.jsdelivr.net/npm/pixi-effects@0.4.0/dist/Controller.js"
  }
}
</script>
<script type="module">
  import { Movie } from 'pixi-effects';
  import { Controller } from 'pixi-effects/controller';
  // ...
</script>
```

Load the `dist/` files **as they are** (jsDelivr's `/npm/…/dist/…`, or unpkg's `https://unpkg.com/pixi-effects@0.4.0/dist/index.js`) rather than a CDN-rebundled build such as `esm.sh/pixi-effects` or jsDelivr's `+esm`: the entries (`pixi-effects`, `…/controller`, `…/three`) share internal chunks, which only works when each file is served untouched.

> **Using three.js?** Add two more entries (`three` and `pixi-effects/three`) to this importmap — see [Adding three.js](#adding-threejs-optional) below.
>
> **Want the unreleased `main`?** Point the `pixi-effects*` entries at the GitHub Pages build instead: `https://yjmtmtk.github.io/pixi-effects/dist/index.js` (and `Controller.js`, `three.js`).

#### Adding three.js (optional)

Add two more entries to the importmap above: three.js itself, and the `pixi-effects/three` entry.

```html
<script type="importmap">
{
  "imports": {
    "...":                     "(everything from the importmap above)",
    "three":                   "https://esm.sh/three@0.178.0",
    "pixi-effects/three":      "https://cdn.jsdelivr.net/npm/pixi-effects@0.4.0/dist/three.js"
  }
}
</script>
```

Always route `three` through the importmap — both your code and `pixi-effects/three` then share **one** copy of three.js. Don't load a second copy from another URL (objects from one copy are not `instanceof` the other).

```html
<script type="module">
  import { Movie } from 'pixi-effects';
  import { registerThree, three } from 'pixi-effects/three';
  import * as THREE from 'three';

  registerThree();   // once, before movie.init()

  // ...inside composition.sequences:
  three({
    type: 'three', name: 'knot',
    width: 'GW * 0.6', height: 'GH * 0.6',
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    setup: (ctx) => {
      const knot = new THREE.Mesh(
        new THREE.TorusKnotGeometry(1, 0.35, 128, 32),
        new THREE.MeshStandardMaterial({ color: 0x7fb4ff }),
      );
      ctx.scene.add(knot, new THREE.AmbientLight(0xffffff, 0.4));
      ctx.camera.position.z = 6;
      return { objects: { knot } };        // addressable from keyframes
    },
    keyframes: [{ at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 }],
  })
</script>
```

The layer is a normal sprite once built, so 2D keyframes, masks and filters work on it. Full spec, rules and caveats (one WebGL context per layer, `update(t)` must be a pure function of `t`): [DSL reference § three](./docs/dsl.md#three) and [API reference](./docs/api.md#pixi-effectsthree). Runnable: [`examples/10-three.html`](./examples/10-three.html).

With a bundler, `import { registerThree, three } from 'pixi-effects/three'` works the same once you've installed `three`.

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

## 2.5D layers & camera

Any layer can be placed in depth and viewed through a camera — no three.js involved:

```ts
sequences: [
  { type: 'camera', keyframes: [{ at: 0, from: { x: 'GW/2 - 260' }, to: { x: 'GW/2 + 260' }, duration: 4, ease: 'sine.inOut' }] },
  { type: 'shape', shape: 'rect', width: 300, height: 200, threeD: true, initial: { x: 'GW/2', y: 'GH/2', z: -400, fillColor: '#3a6ea5' } },
  { type: 'shape', shape: 'rect', width: 300, height: 200, threeD: true, initial: { x: 'GW/2', y: 'GH/2', z: 250,  fillColor: '#d96a3a' } },
]
```

`+z` is toward the viewer, rotations are degrees (CSS signs), and with `z = 0` and the default camera a `threeD` layer looks identical to a 2D one. See [DSL reference § 3D layers & camera](./docs/dsl.md#3d-layers--camera) and [`examples/11-depth.html`](./examples/11-depth.html).

## For AI agents

This library is designed to be written by AI: a video is plain data, and every mistake we found while having AI sessions build test animations is either warned about at runtime or written down.

- [`llms.txt`](./llms.txt) / [`llms-full.txt`](./llms-full.txt) — index and full text for LLM tooling (generated from the files below).
- [`ai/SKILL.md`](./ai/SKILL.md) — a [skill](https://docs.claude.com/en/docs/claude-code/skills) (workflow, rules, verification loop). Copy the `ai/` folder to `~/.claude/skills/pixi-effects/` (or your project's `.claude/skills/`) to have Claude load it automatically when you ask for a video.
- [`ai/reference/cheatsheet.md`](./ai/reference/cheatsheet.md), [`recipes.md`](./ai/reference/recipes.md) (tested), [`pitfalls.md`](./ai/reference/pitfalls.md), and a starter [`ai/template.html`](./ai/template.html).

They ship in the npm package (`node_modules/pixi-effects/ai/`).

## Documentation

- [**DSL reference**](./docs/dsl.md) — composition, sequences, 3D layers & camera, three.js layer, keyframes, expressions, filters
- [**API reference**](./docs/api.md) — `Movie`, `Controller`, `pixi-effects/three`, events, render options
- [**Examples**](./examples/) — runnable HTML files (read in order):
  - `01-hello.html` — minimum viable composition
  - `02-keyframes.html` — keyframes, easings, expressions
  - `03-shapes.html` — every shape primitive
  - `04-media.html` — image / video / audio
  - `05-composition-mask.html` — nested compositions and masks
  - `06-filters.html` — built-in and pixi-filters via `{ type: 'custom' }`
  - `07-transitions.html` — all seven transition kinds in one timeline
  - `08-presets-export.html` — `kenBurns` preset and `movie.render()` from code
  - `09-audio.html` — multi-track audio mixing with BGM ducking and SFX cues
  - `10-three.html` — a three.js scene as a layer (`pixi-effects/three`)
  - `11-depth.html` — 2.5D layers and camera: parallax, spin, dolly zoom
  - `12-title-motion.html` — a staggered 2.5D title: letters fly in from depth, particles, orbiting camera
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
