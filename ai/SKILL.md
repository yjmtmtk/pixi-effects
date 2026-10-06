---
name: pixi-effects
description: Make motion graphics and videos as code with the pixi-effects JS library — titles, lower-thirds, kinetic typography, slideshows with transitions, 2.5D / depth scenes, three.js titles, data-driven charts. A video is a plain-object composition (text, shape, image, video, audio, camera layers with keyframes and expressions) that plays in the browser and exports MP4/WebM. Use when asked to create, animate, preview, or export a video / title / promo / animated chart in JavaScript or HTML.
---

# pixi-effects — write a video as data

You describe a video as a tree of plain objects; the library plays it in a canvas and exports it (MP4/WebM/MOV). You never write per-frame code. **Read `reference/cheatsheet.md` once before writing anything**, copy a recipe from `reference/recipes.md` when one fits, and skim `reference/pitfalls.md` — every item there cost a previous session a retry.

## Workflow

1. **Start from `template.html`** (copy it; it loads the library from a CDN, collects every console warning into `window.__logs`, and exposes `window.movie`). One HTML file, plain JS. Default canvas 1280×720 @ 30 fps.
2. **Write the composition as data.** Anything repeated (letters, bars, particles, scenes) is a JS function or loop that returns specs — never copy-paste objects. Derive coordinates and times from constants/data, not magic numbers.
3. **Run it and read the logs first.** `window.__ready` must be `true` and `window.__logs` should be `[]`. A pixi-effects warning is an instruction: fix what it names.
4. **Look at it** — you cannot judge motion from code. Seek with `await movie.gotoFrame(n, true)` (30 fps ⇒ `n = seconds × 30`), screenshot, and check **at least 5 timestamps** spanning the piece, including the middle of every transition and the last second. Combine frames into one contact-sheet image to save effort. The player bar overlays the bottom ~60 px of the canvas in screenshots (not in the video): hide `.movie-controller`.
5. **Iterate** on what you saw (clipped text, collisions, wrong timing). Then export: `const blob = await movie.render({ format: 'mp4' })` (about real time; `movie.on('progress', …)` reports 0–100).

## The rules that cause most failures

- **Keyframe `at` starts at 0 when the layer appears** (negative = back from the layer's end). A layer's own `at` and a transition's `at` are composition time.
- **Layers are hidden, not removed, after their lifespan; z-order is array order.** Switch scenes by stacking layers with `at`/`duration` over an opaque background rect.
- **Angles are degrees. `+z` is toward the viewer. Numbers can be expressions** (`'GW/2 - w/2'`; no `pi`; no per-frame variable).
- **Anchors**: rect/circle/ellipse are centred on `x,y`; text and image are top-left (use `anchorX/anchorY: 0.5`); compositions use `pivotX/pivotY`. A bar that grows from its base needs `anchorY: 1`.
- **`audio` shorter than its layer goes silent** — add `loop: true`.
- **Masks live in the parent's coordinates and don't follow the masked layer.** **`filterArea` is in the layer's own coordinates.**
- **2.5D needs `threeD: true`** on each layer plus a `{ type: 'camera' }` layer; camera props go in `initial`/keyframes; keep every `z` below the camera distance (≈ 989 at 720p, fov 40); under a dolly zoom only `z = 0` stays fixed.
- **Not in the DSL (hand-roll, recipes exist):** gradient fills, changing text (count-up), repeat/yoyo, per-frame curves (orbits), per-letter text animators, blend modes, particle emitters.

## Layout sanity (the cheap bugs a screenshot catches)

Centred text must be positioned by `anchorX/anchorY: 0.5`; estimate text width as ~0.6 × `fontSize` per glyph (monospace) or ~0.8 (heavy sans) and leave margin; captions stay above the bottom 60 px; nothing important within 5 % of the frame edge; a `threeD` layer can be sorted in front of text.

## Files

- `reference/cheatsheet.md` — every layer type, prop, default and rule on one page.
- `reference/recipes.md` — tested building blocks: slam type, lower-third, marquee, count-up, bar chart, 2.5D title, camera orbit, slideshow with transitions + music, looping, particles, gradients, three.js metal.
- `reference/pitfalls.md` — the full list of real mistakes, with status.
- `template.html` — the starting file.
- Full reference: `docs/dsl.md` and `docs/api.md` in the repository.
