# Gallery brief (shared by every portfolio-piece author)

You are a **motion designer** making ONE finished **portfolio piece** with the JavaScript library **pixi-effects**
(repo `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects`). This is a showreel, not a tutorial: it must look *designed* —
a clear concept, a limited palette, typographic hierarchy, considered timing and easing, a beginning / middle / end.
You are also a usability tester: record honestly everything that made you retry or guess (see "Stumble notes").

## What you may read
`ai/SKILL.md` first (follow its workflow), then `ai/reference/cheatsheet.md`, `recipes.md`, `pitfalls.md`; `README.md`, `docs/dsl.md`,
`docs/api.md`, `examples/*.html`, `dist/*.d.ts`. **Do not read** `src/`, `tests/`, `docs/superpowers/`, `docs/specs/`, `docs/plans/`,
`node_modules/`, `dist/*.js`. Do not edit anything outside your own files (below). No git, no npm.

## Files you create (and only these)
- `examples/gallery/<id>.html` — the piece (start from `ai/template.html`; in the importmap point the three `pixi-effects*` entries at the
  local build: `"pixi-effects": "../../dist/index.js"`, `"pixi-effects/controller": "../../dist/Controller.js"`, `"pixi-effects/three": "../../dist/three.js"`).
- `examples/gallery/posters/<id>.jpg` — a poster still (see below).
- `examples/gallery/_notes/<id>.md` — your stumble notes.

## Page requirements
1. Keep the template's `window.__logs` harness, `window.__ready`, `window.movie`, and the `try/catch` around `init`.
2. Use `Controller` (play / scrub / export button) so the piece is playable. Style the page minimally: dark neutral background, the canvas centred and
   responsive (`width: min(960px, 100%)` for 16:9; scale vertical / square pieces so they fit a laptop screen). The piece itself carries the design.
3. After `init`, open at 0:00 (do NOT seek to the poster frame by default: Play would then start mid-piece). Park on it only with `?poster` in the URL: `if (new URLSearchParams(location.search).has('poster')) await movie.gotoFrame(POSTER_FRAME, true);`.
4. Embed metadata (an index page is generated from it):
   `<script type="application/json" id="piece-meta">{ "title": "...", "subtitle": "one line", "tags": ["..."], "width": 1280, "height": 720, "duration": 10, "posterFrame": 120, "model": "<your model name>" }</script>`
   (`width`/`height`/`duration` must match what you pass to `movie.init`).
5. Self-contained: no network except the importmap CDNs. No external images/fonts/video. Generate any imagery procedurally (shapes, gradients,
   canvas-drawn data-URL images). Audio only from `examples/_assets/` (`bgm.mp3` is 6 s — loop it; `sfx-*.mp3`). Fonts: system stacks only
   (`system-ui`, `ui-monospace`, `Georgia`, `Arial Black`...). Japanese text is fine where it fits the concept (system CJK fonts).
6. Duration 8–14 s, 30 fps. Pick the canvas size your brief says.

## Quality bar (self-review before you finish)
- Look with the tools: `await movie.contactSheet({ times: [...], as: 'dataURL' })` (≥ 8 timestamps incl. the first and last second and the middle of every
  transition), `movie.snapshot(frame, { as: 'dataURL' })` for detail. Save images with
  `agent-browser --session <id> eval "<js>" | python3 ai/tools/save-image.py /ABSOLUTE/path.png`. View them with the Read tool.
- `await movie.inspect(frame, { layers: 'none' })` at several frames: fix every real issue (text cut off / overlapping). Name your layers.
- `window.__logs` must be `[]`. Fix every library warning.
- Check at least once that export works: `const b = await movie.render({ format: 'mp4' })` → report the size.
- No text clipped by the frame, nothing important in the outer 5 %, no layout collisions, consistent easing language, a deliberate end frame (hold the
  last composition ~1 s; do not fade everything to an empty frame unless that is the design).
- Max ~12 edit / run cycles. If something truly cannot be done with the library, work around it, and record it.
- Browser: ALWAYS `agent-browser --session <id> ...` (many authors share this machine). A static server runs on http://localhost:5190 .
  Your page: `http://localhost:5190/examples/gallery/<id>.html`. Close your session when done.

## Poster
Pick the most striking frame. Save it: `eval "movie.snapshot(POSTER_FRAME, { type: 'image/jpeg', scale: 0.5, as: 'dataURL' })"` piped to
`python3 ai/tools/save-image.py /ABSOLUTE/examples/gallery/posters/<id>.jpg`.

## Stumble notes (`examples/gallery/_notes/<id>.md`) — this is half of your job
Write it as you go. Format, one entry per stumble (even small ones; also things that were *easy* thanks to the docs are worth one line at the top):

```
# <id> — stumble notes
Model: <model>   Cycles: N   Result: works | partly

## Went smoothly because the docs said so
- ...

## Stumbles
### 1. <short title>   [GAP | WRONG | LIBRARY-BUG | SPEC-ODD | MY-MISTAKE | TOOLING]
- tried: ...
- happened: ... (exact warning text if any)
- cause: ...
- would have prevented it: <a doc line / a warning / an API change — be concrete>

## Wished the library had
- ...

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```

## Final message (≤ 30 lines)
`<id>: works | partly`, file paths, one-line concept, export size/time, and the 3 most important stumbles.

---

## Library changes since the first round (read this: where `ai/reference/pitfalls.md` disagrees, THIS wins)

The library was fixed after round one, and `dist/` already contains the fixes. So:

- **`set` keyframes are undone when you seek back** (they used to stay applied), and **shapes redraw before they are culled**: a rect growing from `width: 0` at the left edge (`anchorX: 0`) now draws after any jump seek. You no longer need `width: 0.01` or `to` with `duration: 1/30` as workarounds.
- **Volume keyframes now behave like every other keyframe**: `{ at: -2, to: { volume: 0 }, duration: 2 }` fades only the last 2 s (it used to fade across the whole piece). `set` is a jump. Keyframes are applied in time order.
- **A mask now starts and ends with the layer it masks** when the mask has no `at` of its own: its keyframes are measured from the layer's start (an explicit mask `at` is still composition time).
- **Audio length:** omit `duration` on a one-shot sound effect — it lasts exactly as long as its clip (no "goes silent" warning, nothing to measure). With `loop: true` and no `duration` the layer lasts until the composition ends. Clip lengths: sfx-pop 0.13 s, sfx-click 0.1 s, sfx-chime 0.6 s, **sfx-swoosh is new: an airy 0.55 s stereo whoosh** (the old one is gone), bgm.mp3 6 s.
- **`movie.inspect`** judges overlaps on what is visible (cut to the canvas and to the layer's mask) and does not report the two scenes of a running transition; repeated "keyframe starts after the layer ends" warnings are summarised.
- **Open at 0:00.** Do NOT seek to the poster frame on load (Play would start mid-piece). Only with `?poster` in the URL: `if (new URLSearchParams(location.search).has('poster')) await movie.gotoFrame(POSTER_FRAME, true);` (the poster JPG is still made with `movie.snapshot(POSTER_FRAME, …)`).
- `from` / `from+to` keyframes hold their start value from the LAYER's start (not from the keyframe's `at`): a delayed fade-in `{ at: 2, from: { alpha: 0 }, to: { alpha: 1 } }` needs no `initial.alpha`; to keep the old value until `at`, use `set` or put it in `initial`.
- Still missing (you will hit these; hand-roll and WRITE THEM DOWN in your notes): arc / trim-path / stroke draw-on, blend modes (add / screen), text content that changes over time (only `{value}` counters), per-frame jitter, particle emitters. A round-one note already covers most workarounds in `examples/gallery/_notes/*.md` — skim two or three for ideas before inventing.

## Round two ground rules

- Do NOT edit `MODELS.md`, `pieces.json`, `index.html`, `BRIEF.md`, anything under `src/`, `tests/`, `ai/`, `docs/`, or another author's files, and do NOT run `npm test` / `npm run build` / any git command that modifies the repo (the owner is editing the library and rebuilding `dist/` in parallel; if the library misbehaves, that is a stumble note, not something to fix).
- Another agent's browser session can answer your `agent-browser` call (it happened once): after saving a contact sheet or poster, look at it and confirm it is YOUR piece before trusting it.
- Time is tight: aim to finish in about 12 edit/run cycles at most, and keep the final message short.
