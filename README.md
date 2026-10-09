# pixi-effects

> **Status**: experimental — current release `0.26.1`. The API may still change between minor versions; see the [CHANGELOG](./CHANGELOG.md) for what each release changed.

**[Guide →](https://yjmtmtk.github.io/pixi-effects/guide/)** · **[Gallery →](https://yjmtmtk.github.io/pixi-effects/examples/gallery/)** · 50 portfolio pieces written as plain data by AI models · **[Examples →](https://yjmtmtk.github.io/pixi-effects/examples/)** · 15 numbered examples, a music lab + an in-browser playground.

## Make a video by asking an AI

Give any AI (ChatGPT, Claude, Codex, Cursor, Claude Code …) one sentence:

> Use https://github.com/yjmtmtk/pixi-effects to make a video: a 10-second title for a bakery, warm colours, a soft chime at the end.

That is all it needs. **To register it as a skill** in your agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode, …): `npx skills add yjmtmtk/pixi-effects` (update with `npx skills update`). In Claude Code you can also run `/plugin install pixi-effects --marketplace yjmtmtk/pixi-effects`. **If you are the AI** that was asked to do this, do not read the whole repository: if you can run commands (a shell, Node 22, Chrome), read [`AGENTS.md`](./AGENTS.md) and [`skills/pixi-effects/SKILL.md`](./skills/pixi-effects/SKILL.md); if you can only write text (a browser chat), fetch https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/CHAT.md and follow it. You will write the video as plain data in one HTML file, check it (the check tool writes a contact sheet to look at), and hand it over; the person opens the file and downloads the MP4 with the button in the player bar.

Declarative composition and video rendering for the web. After Effects-style timelines on top of [PixiJS v8](https://pixijs.com/) and [GSAP](https://gsap.com/), with strict TypeScript types. Render to MP4 / WebM / MOV via [mediabunny](https://mediabunny.dev/).

- **Declarative DSL** — describe your composition as a tree of typed sequences (text, image, video, audio, shapes, nested compositions). No imperative tween code.
- **Sound effects without files** — `{ type: 'audio', sfx: 'swoosh', at: 2 }`: 11 synthesised presets (click, pop, swoosh, riser, hit, chime …) with `pitch` / `brightness` / `seed`, or your own `voices`; deterministic and in the exported file at the same moments as in the browser; `movie.inspectAudio()` checks them as numbers.
- **Expression language** — sprinkle `'GW * 0.5'` or `'min(W, H) / 2'` anywhere a number goes. Resolved at runtime against a sequence-relative scope.
- **Filters by name** — `filters: [{ type: 'glow', outerStrength: 3 }]`, no import: `blur noise alpha colorMatrix` (pixi.js) and the 38 filters of [`pixi-filters`](https://github.com/pixijs/filters) (`dropShadow crt rgbSplit oldFilm glitch pixelate twist …`), animated with `'filters.<name>.<option>'`. Any other PixiJS `Filter` goes in as `{ type: 'custom' }`.
- **Draw-on strokes and changing text** — `trimEnd` 0 → 1 draws a line, border or SVG path on; a keyframe `set: { text }` swaps a string and `visibleChars` is a typewriter.
- **Masks, transitions, chroma key** — inline masks; chroma key; eight scene transitions (`crossfade`, `wipe`, `iris`, `slide`, `dip`, `zoom`, `dissolve`, `luma`).
- **Presets** — `kenBurns` for stills, `withFade` for fade-in/out; `wiggle`, `stagger`, `animateText`, `followPath`, `particles` and `react` return keyframes or layers (seeded, so every render is the same).
- **Presentations** — `stops` in the composition pause the movie where you say; `Presenter` (`pixi-effects/presenter`) moves on with arrow keys, a click or a swipe, with a page overview (G), a presenter view with notes and a timer (P), and `deck()` to lay out pages and steps. Export a deck as PDF (`movie.exportPDF()`, `pixi-effects-render talk.html -o talk.pdf`). See the [Presenting guide](https://yjmtmtk.github.io/pixi-effects/guide/presenting.html).
- **Music written as text** — `{ type: 'audio', music: { bpm: 96, tracks: [{ inst: 'keys', notes: 'Cmaj7:4 Am7:4' }], drums: { kick: 'x...x...' } } }`: a tune with no audio file, played by a small built-in synthesiser (keys, pluck, pad, bass, lead, bell, music box, drums; chords by name, swing, fades, a ritardando). Deterministic, in the exported file at the same moment; an AI writes it as easily as a title.
- **Audio-reactive visuals** — `audioEnvelope('music.mp3')` analyses loudness, bass / mid / treble and the beats per frame; `react()` turns them into keyframes, so the picture follows the music and still renders identically.
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
    "pixi-effects":            "https://cdn.jsdelivr.net/npm/pixi-effects@0.26.1/dist/index.js",
    "pixi-effects/controller": "https://cdn.jsdelivr.net/npm/pixi-effects@0.26.1/dist/Controller.js"
  }
}
</script>
<script type="module">
  import { Movie } from 'pixi-effects';
  import { Controller } from 'pixi-effects/controller';
  // ...
</script>
```

Load the `dist/` files **as they are** (jsDelivr's `/npm/…/dist/…`, or unpkg's `https://unpkg.com/pixi-effects@0.26.1/dist/index.js`) rather than a CDN-rebundled build such as `esm.sh/pixi-effects` or jsDelivr's `+esm`: the entries (`pixi-effects`, `…/controller`, `…/three`) share internal chunks, which only works when each file is served untouched.

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
    "pixi-effects/three":      "https://cdn.jsdelivr.net/npm/pixi-effects@0.26.1/dist/three.js"
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

`+z` is toward the viewer, rotations are degrees (CSS signs), and with `z = 0` and the default camera a `threeD` layer looks identical to a 2D one. Add `{ type: 'light', kind: 'spot', … }` layers for shading and shadows, and `fogNear` / `fogFar` on the camera for depth fog (nothing changes in a composition with neither). See [DSL reference § 3D layers & camera](./docs/dsl.md#3d-layers--camera) and [`examples/11-depth.html`](./examples/11-depth.html).

## For AI agents

This library is designed to be written by AI: a video is plain data, and every mistake we found while having AI sessions build test animations is either warned about at runtime or written down.

- [`llms.txt`](./llms.txt) / [`llms-full.txt`](./llms-full.txt) — index and full text for LLM tooling (generated from the files below).
- [`skills/pixi-effects/SKILL.md`](./skills/pixi-effects/SKILL.md) — a [skill](https://docs.claude.com/en/docs/claude-code/skills) (workflow, rules, verification loop). Copy the `ai/` folder to `~/.claude/skills/pixi-effects/` (or your project's `.claude/skills/`) to have Claude load it automatically when you ask for a video.
- [`skills/pixi-effects/reference/cheatsheet.md`](./skills/pixi-effects/reference/cheatsheet.md), [`recipes.md`](./skills/pixi-effects/reference/recipes.md) (tested), [`pitfalls.md`](./skills/pixi-effects/reference/pitfalls.md), and a starter [`skills/pixi-effects/template.html`](./skills/pixi-effects/template.html).

- **Look at a page with its timeline, and scrub one with the other:** `npx pixi-effects view my-video.html` (or `node ai/tools/view.mjs …`) opens your browser on a viewer: the page on top, the timeline of every layer under it with a playhead that follows the movie. Click or drag the timeline to seek, click a layer's name to jump to where it starts, Space plays, ← / → step a frame, + / − (or Ctrl/⌘ + wheel) zoom, the names stay in place. For the human who wants to see what the AI made.
- **Render a page to a video file, headless:** `npx pixi-effects render my-video.html -o my-video.mp4` (or `node ai/tools/render.mjs …`; Node ≥ 22 and Chrome installed, no dependencies). The container follows the extension (`mp4 webm mov mkv`); `--quality very-low…very-high`, `--query lang=ja` (added to the page URL), `--fail-on-warn` (exit 1 when the page logged a warning), `--quiet`. It waits for `window.__ready`, runs `movie.render()` and streams the file to disk; exit 0 = written, 1 = the page or the render failed (no file). For scripts, CI and batches; `pixi-effects-check` below is the review.
- **A talk as a PDF:** `npx pixi-effects render my-talk.html -o my-talk.pdf` (one page per page of a `deck()` / `stops` movie; `--all-stops` makes a page of every step). The review tool writes `stops.png` for such a page, one picture per stop.
- **One-command review for the AI that wrote the page:** `npx pixi-effects check my-video.html` (or `node ai/tools/check.mjs my-video.html`; Node ≥ 22 and Chrome installed, no dependencies). It opens the page in its own headless Chrome and reports warnings, layout (`movie.inspect` over the whole timeline), the soundtrack (`movie.inspectAudio`) and a real export decoded again, and writes a contact sheet PNG and a `timeline.html` (every layer as a bar on a time axis) to look at. Exit code 0 / 1.

They ship in the npm package (`node_modules/pixi-effects/ai/`).

## Documentation

- [**DSL reference**](./docs/dsl.md) — composition, sequences, 3D layers & camera, three.js layer, keyframes, expressions, filters
- [**API reference**](./docs/api.md) — `Movie`, `Controller`, `pixi-effects/presenter`, `pixi-effects/three`, events, render options
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
  - `music-lab.html` — eight tunes written as text (no audio files): press play, read each score; `musicBuffer()` plays music with no movie
  - `playground.html` — in-browser editor on the chat template's edit block: twelve examples, a problems panel from `movie.review()`, share links, save as HTML, and WebMCP tools for an AI agent

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

## License

MIT — see [LICENSE](./LICENSE).
