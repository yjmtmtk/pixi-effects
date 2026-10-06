# pixi-effects

> **Status**: experimental — current release `0.11.0`. The API may still change between minor versions (see [CHANGELOG](./CHANGELOG.md): `0.11.0` adds particles, motion blur, a shared loader and a much faster build for pieces with many layers, `0.10.0` adds seeded randomness, `wiggle` and `stagger`, null layers with `parent`, `animateText`, `followPath` and path morphing, and click-to-play in the player, `0.9.0` adds a poster time (`movie.init({ poster })`) and a guide site, `0.8.0` adds events and a theme for building your own player, `0.7.0` adds filters by name, the `pixi-effects-render` and `pixi-effects-view` commands and the timeline chart, `0.6.0` adds draw-on strokes (`trimEnd`) and text that changes over time, `0.5.0` adds synthesised sound effects (`sfx`, no files) and the `check` tool, `0.4.0` makes a mask share its layer's lifetime, `0.3.0` made keyframe `at` relative to the layer).

**[Guide →](https://yjmtmtk.github.io/pixi-effects/guide/)** · **[Gallery →](https://yjmtmtk.github.io/pixi-effects/examples/gallery/)** · 36 portfolio pieces written as plain data by AI models · **[Live demos →](https://yjmtmtk.github.io/pixi-effects/)** · 12 numbered examples + an in-browser playground.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/) and [GSAP](https://gsap.com/), with strict TypeScript types. Render to MP4 / WebM / MOV via [mediabunny](https://mediabunny.dev/).

- **Declarative DSL** — describe your composition as a tree of typed sequences (text, image, video, audio, shapes, nested compositions). No imperative tween code.
- **Sound effects without files** — `{ type: 'audio', sfx: 'swoosh', at: 2 }`: 11 synthesised presets (click, pop, swoosh, riser, hit, chime …) with `pitch` / `brightness` / `seed`, or your own `voices`; deterministic and in the exported file at the same moments as in the browser; `movie.inspectAudio()` checks them as numbers.
- **Expression language** — sprinkle `'GW * 0.5'` or `'min(W, H) / 2'` anywhere a number goes. Resolved at runtime against a sequence-relative scope.
- **Filters by name** — `filters: [{ type: 'glow', outerStrength: 3 }]`, no import: `blur noise alpha colorMatrix` (pixi.js) and the 38 filters of [`pixi-filters`](https://github.com/pixijs/filters) (`dropShadow crt rgbSplit oldFilm glitch pixelate twist …`), animated with `'filters.<name>.<option>'`. Any other PixiJS `Filter` goes in as `{ type: 'custom' }`.
- **Draw-on strokes and changing text** — `trimEnd` 0 → 1 draws a line, border or SVG path on; a keyframe `set: { text }` swaps a string and `visibleChars` is a typewriter.
- **Masks, transitions, chroma key** — inline masks; chroma key; seven scene transitions (`crossfade`, `wipe`, `iris`, `slide`, `dip`, `zoom`, `dissolve`).
- **Presets** — `kenBurns` for stills, `withFade` for fade-in/out.
- **2.5D layers & camera** — add `threeD: true`, `z`, `rotationX/Y` and a `{ type: 'camera' }` layer for parallax, flips and dolly zooms; no three.js needed.
- **three.js layer** *(optional)* — drop a real three.js scene in as a layer via `pixi-effects/three`; keyframes drive its objects (`three.cube.rotation.y`).
- **Built-in player UI — or your own** — a drop-in HTML5-`<video>`-style overlay controller (play, scrub, mute, volume, fullscreen, export-to-file) whose colours are one option (`theme: { accent: '#ff4d6d' }`); or build a player yourself on the movie's `<video>`-named events (`play pause ended seeking seeked volumechange error`).
- **MP4 / WebM / MOV export** — pick container and quality from the controller, call `movie.render()` from code, or render headless from the command line (`pixi-effects-render`).
- **A timeline you can read and scrub** — `movie.timelineChart()` draws every layer as a bar on a time axis; `pixi-effects-view` opens the page with that timeline under it, zoomable, with a playhead you can drag.
- **Tiny dependency surface** — only `mediabunny` (runtime) plus PixiJS and GSAP (peer deps). three.js is an *optional* peer, needed only if you import `pixi-effects/three`.

## Install

```bash
npm install pixi-effects pixi.js gsap
npm install three        # optional — only if you import `pixi-effects/three`
npm install pixi-filters # optional — only if a layer uses a named filter other than blur / noise / alpha / colorMatrix
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
    "pixi-effects":            "https://cdn.jsdelivr.net/npm/pixi-effects@0.11.0/dist/index.js",
    "pixi-effects/controller": "https://cdn.jsdelivr.net/npm/pixi-effects@0.11.0/dist/Controller.js"
  }
}
</script>
<script type="module">
  import { Movie } from 'pixi-effects';
  import { Controller } from 'pixi-effects/controller';
  // ...
</script>
```

Load the `dist/` files **as they are** (jsDelivr's `/npm/…/dist/…`, or unpkg's `https://unpkg.com/pixi-effects@0.11.0/dist/index.js`) rather than a CDN-rebundled build such as `esm.sh/pixi-effects` or jsDelivr's `+esm`: the entries (`pixi-effects`, `…/controller`, `…/three`) share internal chunks, which only works when each file is served untouched.

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
    "pixi-effects/three":      "https://cdn.jsdelivr.net/npm/pixi-effects@0.11.0/dist/three.js"
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

- **Look at a page with its timeline, and scrub one with the other:** `npx pixi-effects-view my-video.html` (or `node ai/tools/view.mjs …`) opens your browser on a viewer: the page on top, the timeline of every layer under it with a playhead that follows the movie. Click or drag the timeline to seek, click a layer's name to jump to where it starts, Space plays, ← / → step a frame, + / − (or Ctrl/⌘ + wheel) zoom, the names stay in place. For the human who wants to see what the AI made.
- **Render a page to a video file, headless:** `npx pixi-effects-render my-video.html -o my-video.mp4` (or `node ai/tools/render.mjs …`; Node ≥ 22 and Chrome installed, no dependencies). The container follows the extension (`mp4 webm mov mkv`); `--quality very-low…very-high`, `--query lang=ja` (added to the page URL), `--fail-on-warn` (exit 1 when the page logged a warning), `--quiet`. It waits for `window.__ready`, runs `movie.render()` and streams the file to disk; exit 0 = written, 1 = the page or the render failed (no file). For scripts, CI and batches; `pixi-effects-check` below is the review.
- **One-command review for the AI that wrote the page:** `npx pixi-effects-check my-video.html` (or `node ai/tools/check.mjs my-video.html`; Node ≥ 22 and Chrome installed, no dependencies). It opens the page in its own headless Chrome and reports warnings, layout (`movie.inspect` over the whole timeline), the soundtrack (`movie.inspectAudio`) and a real export decoded again, and writes a contact sheet PNG and a `timeline.html` (every layer as a bar on a time axis) to look at. Exit code 0 / 1.

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
  - `06-filters.html` — built-in and pixi-filters (as `{ type: 'custom' }`; most can now be written by name, see `docs/dsl.md` → Named filters)
  - `07-transitions.html` — all seven transition kinds in one timeline
  - `08-presets-export.html` — `kenBurns` preset and `movie.render()` from code
  - `09-audio.html` — multi-track audio mixing with BGM ducking and SFX cues
  - `10-three.html` — a three.js scene as a layer (`pixi-effects/three`)
  - `11-depth.html` — 2.5D layers and camera: parallax, spin, dolly zoom
  - `12-title-motion.html` — a staggered 2.5D title: letters fly in from depth, particles, orbiting camera
  - `13-sfx.html` — synthesised sound effects (no audio files), a riser into a hit, a custom voice
  - `15-custom-player.html` — a complete player of your own in about 40 lines (play, seek, volume, replay) using the movie's events
  - `14-draw-on.html` — draw-on strokes (`trimStart` / `trimEnd`) and text that changes over time (`visibleChars`, `set: { text }`)
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
