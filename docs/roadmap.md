# Roadmap: more expressive, still easy for an AI

Status: rewritten 2026-10-15, current release 0.44.0 (`check --do` clicks, hovers and drags on a page; `pick({ alpha })` looks at a text layer's letters; a rebuild keeps a `three` layer that did not change; three click / hover / drag samples on the Interactive page); 0.43.0 was (a `three` layer on WebGPU draws on PixiJS's own GPU device: the same picture, faster, no limit of about 32 canvases; the tests stop using the gallery); 0.42.0 was (interaction on `pick`: `movie.hover`, `pick({ alpha })`, dragging a three object with `hit.three.grab`, `movie.redraw()`, and a fix for a false context warning on rebuilt three layers); 0.41.0 was (`movie.pick`: what is under a point of the canvas, flat, card or three; a better fit of the three layer's light falloff); 0.40.0 was (the `three` layer grows up: it lives in the composition's space with its camera, lights, shadows and fog, loads glTF models, and `check` holds it to "a function of the time"; it can use three's WebGPU renderer). 0.39.0 was the tools telling the truth (the tools tell the truth and a file can be checked against what it must be: an export is exactly `duration × frameRate` frames, `probe --expect`, `check --seam`, `grain` with a loop, a sweep of stray Chromes); 0.38.x added the media tools (`pixi-effects probe | trim | frames | sound | concat | audio`) and the sandbox guidance.

## The gate every item passes

A feature enters the library only when an AI model can write it and check it from the docs alone. For each item below we ask five things, and an item that fails one is reshaped or dropped:

1. **One line for the common case** (`from: { x: '-=36' }`, `music: { loudness: -16 }`), the rest behind options.
2. **The words are already ours**: `at / duration / initial / keyframes / filters / mask`, the same names for every layer.
3. **Deterministic**: seeded, no wall clock; the preview, the snapshot and the export agree.
4. **A build-time warning for the mistake an AI will make** (did-you-mean, a silent failure turned into a sentence).
5. **Checkable without eyes or ears**: `check`, `inspect`, `inspectAudio` give numbers or a picture the AI reads. A feature whose result an AI cannot verify waits until it can.

The measure of success is not the feature list: it is a **fresh agent given one sentence** (the landing page's) producing a checked video with fewer reads, fewer failed commands and fewer wasted cycles than before. Every theme ends with such a trial.

## What changed since the 2026-10-10 draft

| release | what | what it did to the plan |
|---|---|---|
| 0.27.0 | the library's own pure timeline (GSAP is gone): a value is a function of the script and the time, never of how the playhead came to it | seeking is exact and cheap, so a variable can be a plain input to the timeline |
| 0.27.1 | long movies load without freezing (the music is made in slices) | |
| 0.28.0 | `musicEvents()`, `music.meter`, a music read-back in `check`, the `Sequence` export (a layer type can live outside the library) | the music items M1 and M3 of the old draft are mostly done; a spike showed that a new score syntax (`bars` / `play`, `key` / degrees) adds no correctness, so M4 and M9 are dropped |
| 0.28.1–0.28.2 | `reference/direction.md` (how to direct a film), the viewer says "Updated … reload" and never switches by itself, the first address goes out within two minutes | the work on the AI's way of making a film moved from the library to the skill and the tools |
| 2026-10-12 | five films made by fresh AI agents with the library (a minimal-prompt reel, two 45-second films with Rough.js, D3 and three.js, a promo for a real site; two of them now on the landing page) | the gaps they hit become the next releases (steps 6 and 7) instead of the old candidate list; Rough.js, D3 and three.js were shown to work as plain data and need no new feature (no new recipes either: the typewriter-terminal opener stays a gallery piece) |

## After 0.39.0 (decided with the owner, 2026-10-15)

The library is made for AI to use, not for people to learn. What a person needs from the site is how expressive it is and that one sentence to an AI is enough; everything else is for the AI (`docs/`, the skill, `help`, `recipe`).

1. **Test films** (`docs/superpowers/specs/2026-10-15-test-films-design.md`): the real tests become small compositions made for the tests, each with an answer known in advance (15 groups of guarantees: determinism, time, export, geometry, shapes, text, camera, colour and blend, media, sound, layer contracts, interactive, the tools' truth, warnings, both backends). Seeded by `examples/_checks`. The gallery's tests become the secondary net. First: the harness, then export and determinism.
2. **The site shows, it does not teach** — DONE locally 2026-10-15 (`docs/superpowers/specs/2026-10-15-site-restructure-design.md`, plan `docs/superpowers/plans/2026-10-15-site-restructure.md`; unreleased, unpushed): the landing page is short (the reel, the two films, the sentence to tell an AI, the gallery, the interactive movies), with Gallery, Interactive, Playground and a new For AI page (`for-ai.html`: what an AI reads and runs, the recipe list generated from `recipes.md`). The Guide, the comparison with other tools, the music lab and the numbered tour (01–15, kept at the git tag `pre-test-films`) are gone; `stage-site.mjs` copies a list, so `examples/_checks` never ships. The Guide's 24 recipe blocks added no API the AI recipes lack and were dropped.
3. **A shader / three authoring kit** (candidate, evidence from 13 clips made as one `shader` layer each): safe helpers, thin-lens depth of field, loop-periodic grain and colour dither, a `three` bloom with a threshold, array and reserved-word notes in `help shader`, a determinism line for shader layers in `check`. Where it lives (a library export or recipes) is undecided.
4. Carried over: the sandbox fixes of `ai/` (Chrome's own error, `--no-sandbox` for root, a reason when the CDN cannot be reached), the capability gaps (`textOnPath`), what `check` says next, interactive movies, hardening before 1.0.

## The order now

1. **Presentation leaves the core.** `Presenter`, `deck()`, `stopImages()`, `inspectStops()`, `exportPDF()` and `next()` / `prev()` / `goToStop()` / `goToPage()` move into `src/present/`, published as `pixi-effects/present`, and may use only the core's public API (a test enforces the import rule). The core gains one general primitive, `playUntil(time)`, and keeps `composition.stops` as named times. Why first: it shrinks `Movie.ts` before the variables work touches it, and it is a rehearsal of "an extension built on the public API only". A separate package only when someone else needs it.
2. **A spike on named variables** (throwaway, outside the repository), run beside step 1. See "Variables" below.
3. **The API list, then one breaking release (0.29).** Done in the first pass (2026-10-11, `docs/superpowers/specs/2026-10-11-api-list-0.29.md`, `docs/api-surface.txt`): `maskInverted` is `mask: { layer, invert: true }`; the Controller's options are named like the Presenter's; the three old bins are gone (`pixi-effects check|render|view`), `--fail-on-warn` is `--strict`; the internals of `Movie` / `Sequence` / `Presenter` are `@internal`; `pixi-effects/controller` exports the player only. Kept as they are: the anchor defaults that differ by type, geometry at the top level and in `initial`, `speed` against `time`, the `three` layer (an escape hatch; revisit at the 3D engine's launch). Still open: `draft` / `scale` (decide after measuring in step 4).
4. **Reading less, waiting less.** Done in 0.30.0: `npx pixi-effects new <name>`, `recipe [id]`, `help <word>` and a 2 KB quick start (`skills/pixi-effects/reference/quickstart.md`). To do: measure it (three fresh agents, before / after: reads, failed commands, time to the first picture), and a draft export that really is faster (fewer frames: `--fps`; measured first: today `--draft` saves file size, not time).
5. **Variables, built** (0.31.0). The first version is L0 only: the whole composition is built again at the same frame, the sound is mixed again only if it changed (`movie.setVars` / `resize` / `rebuild`, `check` / `render --var --size`). The finer levels L1 and L2 below were measured to buy little and are not built; the spec is `docs/superpowers/specs/2026-10-11-variables-0.31-design.md`.
6. **0.32: papercuts and `spans`** (decided 2026-10-12, from the films above; the papercut list was then **checked against the 0.31.0 build** by a QA pass, and 6 of the 11 reported gaps turned out to be documented or warned already: the depth-of-field number, `focus` reading the first z, the 4 casters, a sound inside a remapped composition, the light read-back, a path's `x/y`). What is real: `rgbSplit` (and every point option) cannot be animated although two docs say it can, and it fails silently; `render --range` prints the length of the whole movie; the unknown-key warning on a path given a top-level `z` guesses "did you mean d" and never says that `z` belongs in `initial`; three sentences are missing (omitting `out` in `animateText` means no exit; what the default `dissolve` looks like; a path in canvas coordinates takes no `x/y`); the depth-of-field warning does not print its threshold (20). Together with **`spans`**: per-token colour and style inside one text layer (the films needed one text layer per token to stream coloured code). The gate applies: one line for the common case, a warning for the mistake, and `inspect` can read it. Lesson kept: an agent's "undocumented" is a claim to verify, not a spec.
7. **0.33: `check` tells the truth** (rebuilt 2026-10-12 from an AI trial: 10 fresh Sonnet agents on the published 0.32.0, building, revising and fixing planted-fault pages; all 10 delivered, 15/15 revisions ended right; the gaps were in the tools, not the agents). Done locally: `inspect` no longer skips a layer that merely has an x in `initial` plus a fade (5 of 10 agents met a false "no cut-off"), a fade cut by the layer's end, a music score longer than the movie, an undeclared `{name}` with no variables, `new --size / --duration`, facts on CJK wrapping and fonts (pitfalls 108, 109), a quick start that names `spans` and `vars`. Of 16 planted faults `check` now sees 14 (not a low-contrast label, not a font that fell back). The old "geometry" list (`pathFromPoints`, canvas-coordinate path placement, `mask: { any }`, gradient `direction`) came from AI opinions, not failures: three of the four already exist or are covered (a composition as one matte is a union; `angle` is the direction; the path rule is documented), so it waits for a real need. No new recipes: they would tie future, better models to today's designs (owner, 2026-10-12); the quick start names features, never designs.
8. **Capability gaps found by the probe of 2026-10-12** (all expressible with glue; ranked by how often an agent would meet them): text along a curve (`followPath` + `measureText`, ~25 lines: a `textOnPath` helper is the cheapest real addition, if a request asks twice), a refraction / lens that reads what is behind it (a `shader` cannot; `backdropBlur` shows the mechanism exists), a reflection helper, a mesh layer for cloth and a page-curl transition (three.js does them today), `splitText` / `animateText` that know right-to-left, and a default `padding` for scripts with marks below the box. Out of scope on purpose: a physics engine (bake a seeded JS simulation into keyframes: deterministic), handwriting stroke data, AI generation. (`radialBlur` did nothing on WebGPU because of an i32 / f32 mismatch inside pixi-filters 6.1.5: worked around, see the CHANGELOG.)
8b. **`check` says more, next candidates** (each needs a trial that shows it matters): a CJK line that ends with one to three characters, an empty `poster` frame, a font that fell back, `help <word>` printing only the paragraph about the word (it prints the whole section), `check --size` / `--query` for several values in one run, (done in the next release: a failed script load is named within seconds and a CDN hiccup is tried once more), a way to say a text bleeds off the edge on purpose, `light` read-back at the lit point, `threeD` layers partly outside the frame.
9. **Interactive movies, next** (when a piece needs it): a sound that continues across a rebuild that changes it, `pick`, more samples. See "Variables".
10. **Hardening before 1.0** (below): both backends in every browser test, Safari and Firefox by hand, the API freeze checklist.

## Variables: one definition for what used to be five features

**Status (released in 0.31.0).** Called **interactive movies** in the docs and on the site (the mechanism keeps the name *variables*). Level L0 only: `init({ vars })`, `setVars`, `resize`, `rebuild`, `check` / `render --var --size`, `movie.loop` and the player's loop button. Nine live samples in `examples/interactive/`, a guide chapter, a landing-page section. The finer levels (L1, L2) below were measured to buy little and are not built. **Next, when a piece needs it:** clicking an item in the picture (`pick`; the player's `clickToPlay: false` already leaves the canvas alone), a sound that continues across a rebuild that changes the sound, a warning when the root size differs between `init` and the composition, more samples (a roulette, a time-of-day sky, a title maker).

A **named variable** with a source: a default, a value the host sets, the canvas size, the pointer or scroll, a recorded track, a value derived from audio (`react()` bakes this one today) or the time. A layer reads it by name: a numeric expression reads it as a plain identifier (`x: 'W/2 + shift'`), a text or colour string as `{name}` (the form `{value}` already has; a `$` marker would collide with prices such as `'$5'`). The expression words `w h W H GW GH t d T contain cover` and the expression functions are reserved; a declaration that uses one is a lint warning. This one definition covers what the old draft listed apart: responsive ("liquid") layout, parameters for variants (language, brand, format), time driven by scroll, and pointer-driven layers.

Recomputing only what depends on a variable: the expression is already parsed to a tree (cached), so the identifiers it reads can be collected statically at build; a table says which property of which layer reads which variable; a change marks those places and only they are recomputed. The author declares nothing, the table comes from the strings already written. Three levels:

| level | what changes | what is recomputed |
|---|---|---|
| L2 | a numeric property (`x`, `scale`, `alpha`, `width` …) | that property's expression, and its keyframe chain |
| L1 | a text's content, wrapping or style; a shape's geometry; an image; a filter value | that layer, rebuilt |
| L0 | anything a JavaScript preset expanded before the spec existed (`splitText`, `animateText`, `particles`, `deck`) | the whole composition, rebuilt |

Boundaries for the first version: variables move values, not timing (`at` / `duration` stay numbers); audio is not reactive. Exports are one function of the script and a set of values (`render --var lang=en --size 1080x1920`), and `check --size 1920x1080,1080x1920` prints a sheet per size, so an AI can verify a layout it cannot see live. `check` / `inspect` will also say which layers depend on a variable.

Interactive input is this same mechanism with a different source. Pick, drag, branches and live camera (the old I4–I6) wait for a concrete piece that needs them; an input must always reduce to a recorded session that exports to the same video.

## Candidate pool (chosen by evidence from real films, not from this list)

- **Music**: a loudness target (`loudness: -16`), ducking under an sfx or voice, automation points (filter, pan, reverb), fitting a tempo so given bars land on given seconds, more timbres. A tempo-synced delay and a kick pump. The read-back (done) is how an AI checks them.
- **Type**: `fitText(text, style, maxWidth)`, text on a path (per-token colour, `spans`, is step 6).
- **Picture and light**: a lens shift, a fade for a layer nearing the camera plane, `lightLeak()`, shader-driven transitions, a small tested shader kit.
- **Small API holes**: (a union of mattes, `pathFromPoints()` and a gradient `direction` are step 7).
- **`check` says more**: when the last motion ends, the content time inside a remapped composition, `threeD` layers partly outside the frame, shader cost.
- **Video**: trim in one line, big footage through sinks, metadata and subtitle tracks, variable-frame-rate warnings.

## Hardening before 1.0

- Every browser test on both backends; Safari and Firefox checked by hand (documented, not yet verified).
- The two bugs of the old list are **not reproducible on the 0.28 code**: an inline shape mask under a transition (fixed in 0.25 with the matte work) and a 4000 x 2400 `threeD` layer black on WebGPU (not seen on WebGPU or WebGL, for a layer or a card). Both are pinned by real-browser tests; if either comes back, the test says so.
- The API freeze of step 3, and a freeze checklist.

## Parked

- **HTML-in-Canvas** (drawing real HTML and CSS into a layer): works as an outside layer type behind a Chrome flag (`CanvasDrawElement`), deterministic when the CSS animations are seeked by time (a spike, 2026-10-11). Not offered until the API ships without a flag; the host canvas must be on screen and not transparent.
- **A 3D engine layer**: waits for the engine's public launch; the neutral hook (`Sequence` export) is in.
- **Interactive pick / drag / branches / live camera and mic**: see Variables.

## What would change the order

- A trial showing an AI wasting more on something not listed here: that goes first.
- A feature needing a second look at determinism (inputs, physics): it waits for the variables design to settle.
- A gallery piece or a film that cannot be made because of a missing piece: the piece decides.
- A spike result that makes variables need a structural change in `Movie`: the API list waits for it, so that the breaking changes come in one release, not two.
