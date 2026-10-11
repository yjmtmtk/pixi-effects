# Roadmap: more expressive, still easy for an AI

Status: rewritten 2026-10-11, current release 0.28.2. Nothing here is promised; the order is the proposal.

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

## The order now

1. **Presentation leaves the core.** `Presenter`, `deck()`, `stopImages()`, `inspectStops()`, `exportPDF()` and `next()` / `prev()` / `goToStop()` / `goToPage()` move into `src/present/`, published as `pixi-effects/present`, and may use only the core's public API (a test enforces the import rule). The core gains one general primitive, `playUntil(time)`, and keeps `composition.stops` as named times. Why first: it shrinks `Movie.ts` before the variables work touches it, and it is a rehearsal of "an extension built on the public API only". A separate package only when someone else needs it.
2. **A spike on named variables** (throwaway, outside the repository), run beside step 1. See "Variables" below.
3. **The API list, then one breaking release (0.29).** Done in the first pass (2026-10-11, `docs/superpowers/specs/2026-10-11-api-list-0.29.md`, `docs/api-surface.txt`): `maskInverted` is `mask: { layer, invert: true }`; the Controller's options are named like the Presenter's; the three old bins are gone (`pixi-effects check|render|view`), `--fail-on-warn` is `--strict`; the internals of `Movie` / `Sequence` / `Presenter` are `@internal`; `pixi-effects/controller` exports the player only. Kept as they are: the anchor defaults that differ by type, geometry at the top level and in `initial`, `speed` against `time`, the `three` layer (an escape hatch; revisit at the 3D engine's launch). Still open: `draft` / `scale` (decide after measuring in step 4).
4. **Reading less, waiting less.** `npx pixi-effects recipe <id>`, `help <word>`, `new <name>`, a 2 KB quick start in front of the cheatsheet (written once, for the cleaned API), and a draft export that really is faster (fewer frames: `--fps`; measured first: today `--draft` saves file size, not time). Measured by a before / after run of three fresh agents (reads, failed commands, time to the first picture).
5. **Variables, built** (after the spike), smallest level first.

## Variables: one definition for what used to be five features

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
- **Type**: per-token colour in one text layer (`spans`), `fitText(text, style, maxWidth)`, text on a path.
- **Picture and light**: a lens shift, a fade for a layer nearing the camera plane, `lightLeak()`, shader-driven transitions, a small tested shader kit.
- **Small API holes**: a union of mattes (`mask: { any: [...] }`), `pathFromPoints()`, a gradient `direction`.
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
