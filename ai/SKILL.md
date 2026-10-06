---
name: pixi-effects
description: Make motion graphics and videos as code with the pixi-effects JS library — titles, lower-thirds, kinetic typography, slideshows with transitions, 2.5D / depth scenes, three.js titles, data-driven charts. A video is a plain-object composition (text, shape, image, video, audio and file-free sound-effect, camera layers with keyframes and expressions) that plays in the browser and exports MP4/WebM. Use when asked to create, animate, preview, or export a video / title / promo / animated chart in JavaScript or HTML.
---

# pixi-effects — write a video as data

You describe a video as a tree of plain objects; the library plays it in a canvas and exports it (MP4/WebM/MOV). You never write per-frame code. **Read `reference/cheatsheet.md` once before writing anything**, copy a recipe from `reference/recipes.md` when one fits, and skim `reference/pitfalls.md` — every item there cost a previous session a retry.

## Workflow

1. **Start from `template.html`** (copy it; it loads the library from a CDN, collects every console warning into `window.__logs`, and exposes `window.movie`). One HTML file, plain JS. Default canvas 1280×720 @ 30 fps.
2. **Write the composition as data.** Anything repeated (letters, bars, particles, scenes) is a JS function or loop that returns specs — never copy-paste objects. Derive coordinates and times from constants/data, not magic numbers.
3. **Run it and read the logs first.** `window.__ready` must be `true` and `window.__logs` should be `[]`. A pixi-effects warning is an instruction: fix what it names.
4. **Look at it** — you cannot judge motion from code. The library has the tools built in:
   - `await movie.contactSheet({ count: 6, as: 'dataURL' })` → ONE image of several labelled frames (pass `frames: [...]` / `times: [...]` to choose; include the middle of every transition and the last second). Save it and view it.
   - `await movie.inspect(frame)` → every layer's canvas bounds and visibility, plus `issues` (text off the canvas, cut off by an edge, empty, or overlapping other text). Run it at several frames; fix every issue it names.
   - `await movie.snapshot(frame, { as: 'dataURL' })` → one frame, canvas only (no player bar).
   - `movie.inspectAudio()` → **hear with numbers**: for every sound its `start`, `sound.length`, `sound.peakDb`, `sound.loudestAt` (line this up with the picture) and `sound.brightnessHz` (< 500 dark, > 8000 airy), plus `issues` (limited mix, inaudible or cut-off sounds). Check it whenever the movie has audio; `render()` encodes this same mix.
   From a browser tool the result is a `data:` URL string: `agent-browser eval "movie.contactSheet({ count: 6, as: 'dataURL' })" | python3 ai/tools/save-image.py /absolute/sheet.png`, then open the PNG. Sheet tiles are small (~480 px): use `snapshot` for detail. `inspect` output is long on busy scenes: pass `{ layers: 'none' }` and read `issues` first. Give layers a `name` so inspect paths are readable. A moving ticker is not flagged as cut off.
5. **Iterate** on what you saw (clipped text, collisions, wrong timing). Then export: `const blob = await movie.render({ format: 'mp4' })` (about real time; `movie.on('progress', …)` reports 0–100).

## The rules that cause most failures

- **Keyframe `at` starts at 0 when the layer appears** (negative = back from the layer's end). A layer's own `at` and a transition's `at` are composition time.
- **Layers are hidden, not removed, after their lifespan; z-order is array order.** Switch scenes by stacking layers with `at`/`duration` over an opaque background rect.
- **Angles are degrees. `+z` is toward the viewer. Numbers can be expressions** (`'GW/2 - w/2'`; no `pi`; no per-frame variable).
- **Anchors**: rect/circle/ellipse are centred on `x,y`; text and image are top-left (use `anchorX/anchorY: 0.5`); compositions use `pivotX/pivotY`. A bar that grows from its base needs `anchorY: 1`.
- **Sound effects need no files:** `{ type: 'audio', sfx: 'swoosh', at: 2 }` — presets `click pop swoosh swipe hit riser chime beep coin glitch typewriter`; knobs `pitch`, `brightness`, `seed`. The layer lasts as long as the sound (`duration` stretches it); a `riser` is loudest at its end (`at = hit − duration`), a `swoosh` 0.16 s in. A music file shorter than its layer goes silent — `loop: true`.
- **Masks live in the parent's coordinates and don't follow the masked layer.** **`filterArea` is in the layer's own coordinates.**
- **2.5D needs `threeD: true`** on each layer plus a `{ type: 'camera' }` layer; camera props go in `initial`/keyframes; keep every `z` below the camera distance (≈ 989 at 720p, fov 40); under a dolly zoom only `z = 0` stays fixed.
- **Built in:** `splitText()` / `measureText()` (per-letter / per-word layers, exact positions), `shape: 'arc'` (progress rings, pie / donut slices: animate `endAngle`), `fillGradient` (linear/radial, alpha stops → vignettes), `{value}` counters, `repeat`/`yoyo`, `orbit()`. **Not in the DSL (hand-roll, recipes exist or loops are easy):** stroke draw-on (trim path), text that changes over time (other than `{value}`), other per-frame curves and jitter, per-letter text animators (one layer per letter), particle emitters, group/parent layers.
- **Blend modes:** `blendMode: 'add' | 'screen' | 'multiply'` on any layer (glows, light leaks).
- **One `Movie` per page.** A sound effect needs no `duration` (it lasts as long as its clip). Seeking is safe: counters, colours and growing shapes are right after any jump.

## Layout sanity (the cheap bugs a screenshot catches)

Centred text must be positioned by `anchorX/anchorY: 0.5`; estimate text width as ~0.6 × `fontSize` per glyph (monospace) or ~0.8 (heavy sans) and leave margin; captions stay above the bottom 60 px; nothing important within 5 % of the frame edge; a `threeD` layer can be sorted in front of text.

## Files

- `reference/cheatsheet.md` — every layer type, prop, default and rule on one page.
- `reference/recipes.md` — tested building blocks: slam type, lower-third, marquee, count-up, bar chart, 2.5D title, camera orbit, slideshow with transitions + music, looping, particles, gradients/vignette, three.js metal.
- `reference/pitfalls.md` — the full list of real mistakes, with status.
- `template.html` — the starting file. (It loads the library from a CDN; when testing against a local build, point the three `pixi-effects*` importmap entries at `../../dist/…`.)
- `tools/save-image.py` — save a `dataURL` result (contact sheet / snapshot) to a PNG.
- Full reference: `docs/dsl.md` and `docs/api.md` in the repository.
