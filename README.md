# pixi-effects

> **Status**: stable — current release `1.4.0`. From 1.0 on, a breaking change comes only in a new major version (semver); see the [CHANGELOG](./CHANGELOG.md) for what each release changed.

**[The site →](https://yjmtmtk.github.io/pixi-effects/)** · videos Claude made from one sentence · **[Lab →](https://yjmtmtk.github.io/pixi-effects/lab/)** · a video that is not a file · **[For AI →](https://yjmtmtk.github.io/pixi-effects/for-ai.html)** · what an AI reads and runs.

## Make a video by asking an AI

Give any AI (ChatGPT, Claude, Codex, Cursor, Claude Code …) one sentence:

> Use https://github.com/yjmtmtk/pixi-effects to make a video: a 10-second title for a bakery, warm colours, a soft chime at the end.

That is all it needs. **To register it as a skill** in your agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode, …): `npx skills add yjmtmtk/pixi-effects` (update with `npx skills update`). In Claude Code you can also run `/plugin install pixi-effects --marketplace yjmtmtk/pixi-effects`. For the PixiJS code you may write inside a `scene2d` or `scene3d` layer, PixiJS's own official skills help too: `npx skills add pixijs/pixijs-skills` ([pixijs/pixijs-skills](https://github.com/pixijs/pixijs-skills)). **If you are the AI** that was asked to do this, do not read the whole repository: if you can run commands (a shell, Node 22, Chrome), read [`AGENTS.md`](./AGENTS.md) and [`skills/pixi-effects/SKILL.md`](./skills/pixi-effects/SKILL.md); if you can only write text (a browser chat), fetch https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/CHAT.md and follow it. You will write the video as plain data in one HTML file, check it (the check tool writes a contact sheet to look at), and hand it over; the person opens the file and downloads the MP4 with the button in the player bar.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/), with a small timeline of its own and strict TypeScript types. The ease names and the way `to` / `from` / `set` read are [GSAP](https://gsap.com/)'s, with thanks. Render to MP4 / WebM / MOV via [mediabunny](https://mediabunny.dev/).

- **Declarative DSL** — describe your composition as a tree of typed layers (text, image, video, audio, shapes, nested compositions). No imperative tween code.
- **Sound effects without files** — `{ type: 'audio', sfx: 'swoosh', at: 2 }`: 11 synthesised presets (click, pop, swoosh, riser, hit, chime …) with `pitch` / `brightness` / `seed`, or your own `voices`; deterministic and in the exported file at the same moments as in the browser; `movie.inspectAudio()` checks them as numbers.
- **Expression language** — sprinkle `'GW * 0.5'` or `'min(W, H) / 2'` anywhere a number goes. Resolved at runtime against a sequence-relative scope.
- **Filters by name** — `filters: [{ type: 'glow', outerStrength: 3 }]`, no import: `blur noise alpha colorMatrix` (pixi.js) and the 38 filters of [`pixi-filters`](https://github.com/pixijs/filters) (`dropShadow crt rgbSplit oldFilm glitch pixelate twist …`), animated with `'filters.<name>.<option>'`. Any other PixiJS `Filter` goes in as `{ type: 'custom' }`.
- **Draw-on strokes and changing text** — `trimEnd` 0 → 1 draws a line, border or SVG path on; a keyframe `set: { text }` swaps a string and `visibleChars` is a typewriter.
- **Masks, transitions, chroma key** — inline masks; chroma key; eight scene transitions (`crossfade`, `wipe`, `iris`, `slide`, `dip`, `zoom`, `dissolve`, `luma`).
- **Presets** — `kenBurns` for stills, `withFade` for fade-in/out; `wiggle`, `stagger`, `animateText`, `followPath`, `particles` and `react` return keyframes or layers (seeded, so every render is the same).
- **Presentations** — `stops` in the composition pause the movie where you say; the player bar plays it stop to stop, and `deck()` (`pixi-effects/present`) lays out pages and steps. (`Presenter`, the fullscreen talk mode with a page overview and a presenter view, is deprecated and will be removed in 2.0.) Export a deck as PDF (`exportPDF(movie)`, `pixi-effects render talk.html -o talk.pdf`).
- **Music written as text** — `{ type: 'audio', music: { bpm: 96, tracks: [{ inst: 'keys', notes: 'Cmaj7:4 Am7:4' }], drums: { kick: 'x...x...' } } }`: a tune with no audio file, played by a small built-in synthesiser (keys, pluck, pad, bass, lead, bell, music box, drums; chords by name, swing, fades, a ritardando). Deterministic, in the exported file at the same moment; an AI writes it as easily as a title.
- **Audio-reactive visuals** — `audioEnvelope('music.mp3')` analyses loudness, bass / mid / treble and the beats per frame; `react()` turns them into keyframes, so the picture follows the music and still renders identically.
- **2.5D layers & camera** — add `threeD: true`, `z`, `rotationX/Y` and a `{ type: 'camera' }` layer for parallax, flips and dolly zooms; no 3D engine needed.
- **PixiJS 2D by code** — a `scene2d` layer hands you a PixiJS container: build `Graphics`, `Sprite`s, `AnimatedSprite`s or a thousand pieces in `setup`, set them from the time in `update`, and it is a layer like any other (keyframes reach its objects as `scene2d.dot.alpha`, `movie.pick` names them, `check` holds it to "a function of the time").
- **3D scenes** *(optional)* — a real 3D scene (meshes, glTF models, PBR, lights, shadows) as a layer via `pixi-effects/3d`, drawn by [PixiJS 3D](https://pixijs.com/3d) inside PixiJS's own renderer, so masks, filters, blend modes and opacity work on it like on any layer; keyframes drive its objects (`scene3d.cube.rotation.y`). It can live in the composition's space (`followCamera`, `followLights`, `followFog`), load and pose a glTF from the time (`loadModel`), show a 2D layer on a mesh (`layerTexture`) and be clicked into (`movie.pick`).
- **Built-in player UI — or your own** — a drop-in HTML5-`<video>`-style overlay controller (play, scrub, mute, volume, fullscreen, export-to-file) whose colours are one option (`theme: { accent: '#ff4d6d' }`); or build a player yourself on the movie's `<video>`-named events (`play pause ended seeking seeked volumechange error`).
- **MP4 / WebM / MOV export** — pick container and quality from the controller, call `movie.render()` from code, or render headless from the command line (`pixi-effects render`).
- **A timeline you can read and scrub** — `movie.timelineChart()` draws every layer as a bar on a time axis; `pixi-effects view` opens the page with that timeline under it, zoomable, with a playhead you can drag.
- **Tiny dependency surface** — only `mediabunny` (runtime) plus PixiJS (a peer dep). `@pixi/3d` is an *optional* peer, needed only if you import `pixi-effects/3d`. mediabunny is fetched only when you export or use a video layer: a page that only plays never loads it.

## Install

```bash
npm install pixi-effects pixi.js
npm install @pixi/3d     # optional — only if you import `pixi-effects/3d` (needs pixi.js 8.23+)
npm install pixi-filters # optional — only if a layer uses a named filter other than blur / noise / alpha / colorMatrix
```

### Browser via CDN (no bundler)

Drop the imports into an [importmap](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap) and you're done — the [template](./skills/pixi-effects/template.html) is a full file.

```html
<script type="importmap">
{
  "imports": {
    "pixi.js":                 "https://esm.sh/pixi.js@8.23.0?bundle-deps",
    "mediabunny":              "https://esm.sh/mediabunny",
    "pixi-effects":            "https://cdn.jsdelivr.net/npm/pixi-effects@1.4.0/dist/index.js",
    "pixi-effects/controller": "https://cdn.jsdelivr.net/npm/pixi-effects@1.4.0/dist/controller.js"
  }
}
</script>
<script type="module">
  import { Movie } from 'pixi-effects';
  import { Controller } from 'pixi-effects/controller';
  // ...
</script>
```

The `mediabunny` line is needed only to export (the download button, `movie.render()`) or for a `video` layer; a page that only plays can leave it out and never fetches it (or call `useMediabunny(url)` instead, see [the API](docs/api.md#where-the-encoder-comes-from-usemediabunnysource)).

Load the `dist/` files **as they are** (jsDelivr's `/npm/…/dist/…`, or unpkg's `https://unpkg.com/pixi-effects@1.4.0/dist/index.js`) rather than a CDN-rebundled build such as `esm.sh/pixi-effects` or jsDelivr's `+esm`: the entries (`pixi-effects`, `…/controller`, `…/3d`) share internal chunks, which only works when each file is served untouched.

> **A 3D scene?** Add three more entries (`pixi-effects/3d`, `@pixi/3d`, `@pixi/3d/extras`; PixiJS 3D needs pixi.js 8.23+) — see [API reference § pixi-effects/3d](./docs/api.md#pixi-effects3d) for the lines and [DSL reference § scene3d](./docs/dsl.md#scene3d) for the layer. three.js can be drawn in a `canvas` layer (recipe `three-in-canvas`).
>
> **Want the unreleased `main`?** Point the `pixi-effects*` entries at the GitHub Pages build instead: `https://yjmtmtk.github.io/pixi-effects/dist/index.js` (and `Controller.js`, `3d.js`).

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
    layers: [
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

Any layer can be placed in depth and viewed through a camera — no 3D engine involved:

```ts
layers: [
  { type: 'camera', keyframes: [{ at: 0, from: { x: 'GW/2 - 260' }, to: { x: 'GW/2 + 260' }, duration: 4, ease: 'sine.inOut' }] },
  { type: 'shape', shape: 'rect', width: 300, height: 200, threeD: true, initial: { x: 'GW/2', y: 'GH/2', z: -400, fill: '#3a6ea5' } },
  { type: 'shape', shape: 'rect', width: 300, height: 200, threeD: true, initial: { x: 'GW/2', y: 'GH/2', z: 250,  fill: '#d96a3a' } },
]
```

`+z` is toward the viewer, rotations are degrees (CSS signs), and with `z = 0` and the default camera a `threeD` layer looks identical to a 2D one. Add `{ type: 'light', kind: 'spot', … }` layers for shading and shadows, and `fogNear` / `fogFar` on the camera for depth fog (nothing changes in a composition with neither). See [DSL reference § 3D layers & camera](./docs/dsl.md#3d-layers--camera).

## For AI agents

A video is plain data, and every mistake found while having AI sessions build videos is warned about at runtime or written down. An agent reads [`AGENTS.md`](./AGENTS.md), then the 6 KB [skill](./skills/pixi-effects/SKILL.md) (`npx skills add yjmtmtk/pixi-effects` installs it); [`llms.txt`](./llms.txt) / [`llms-full.txt`](./llms-full.txt) are for LLM tooling. The command line ships in the npm package: `npx pixi-effects new | check | render | view | help | recipe`, and `npx pixi-effects probe | frames | sound | trim | concat | audio` for footage ([`docs/media.md`](./docs/media.md); if ffmpeg is installed and the job is a long transcode, use ffmpeg). `<command> --help` lists the options.

## Documentation

- [**DSL reference**](./docs/dsl.md) — composition, layers, 3D layers & camera, 3D scenes (scene3d), keyframes, expressions, filters
- [**API reference**](./docs/api.md) — `Movie`, `Controller`, `pixi-effects/present`, `pixi-effects/3d`, events, render options
- [**Lab**](./lab/) — a video that is not a file: light, sharp at any zoom, changes while you watch (variables, `setVars`), touchable ([docs/api.md](./docs/api.md))
- [**Samples**](./site/samples/) — the site's videos, each made by Claude Opus from the message beside it
- [**Recipes**](./skills/pixi-effects/reference/recipes.md) — tested code you can copy (`npx pixi-effects recipe`)

## Browser support

Rendering uses the [WebCodecs API](https://developer.mozilla.org/docs/Web/API/WebCodecs_API) via mediabunny:

| Feature   | Chrome 94+ | Edge 94+ | Safari 16.4+ | Firefox 130+ |
| --------- | ---------- | -------- | ------------ | ------------ |
| Playback  | ✅          | ✅        | ✅            | ✅            |
| MP4 (avc) | ✅          | ✅        | ✅            | ✅            |
| WebM (vp9)| ✅          | ✅        | ✅            | ✅            |
| MOV (avc) | ✅          | ✅        | ✅            | ✅            |

**Renderer:** the movie tries WebGPU first and falls back to WebGL (with a console warning) when WebGPU is missing or its device cannot start, so a page needs no setting. Every filter the library ships has a GLSL and a WGSL version. A frame is the same picture however it was reached **on one renderer**; the two renderers can differ in a few edge pixels, so do not compare an export from a WebGPU machine and one from a WebGL machine byte for byte. Tested on Chrome with an Apple GPU only (WebGPU on Metal, WebGL through ANGLE); other GPUs, Windows and Linux are untested.

Some codecs (notably `aac` audio in older Firefox) may need the [mediabunny polyfill encoders](https://mediabunny.dev/) (`@mediabunny/aac-encoder`, etc.).

## Author

Made by [@t_yjm](https://x.com/t_yjm). Questions, bugs and ideas are welcome as [GitHub issues](https://github.com/yjmtmtk/pixi-effects/issues).

## License

MIT — see [LICENSE](./LICENSE).
