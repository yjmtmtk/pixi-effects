# Test films: what the library must always guarantee (2026-10-15)

Status: design, written by Claude on the owner's instruction ("leave the list of what must be protected to me"). **Phase 1 built 2026-10-15** (`docs/superpowers/plans/2026-10-15-test-films-phase1.md`): the harness, groups 1 Determinism and 3 Export; the live list is `tests/films/COVERAGE.md`.

## Why

`examples/` was a tour made for people, and it doubled as a smoke test ("runs with no warning"). It is going (see `2026-10-15-site-restructure-design.md`). The library is used by AI, not by people, so the tests must say what the library **promises**, not what some old page happened to draw. The real tests become **test films**: small compositions made for the tests, each with an answer known in advance. The gallery's tests stay as the **secondary** net (every piece loads, plays, checks clean).

## What a test film is

- **One area, one question.** A film exercises one group of guarantees below; its name says which.
- **Small and fast.** 320×180 (or 640×360 when the picture is the point), 1–4 s, no network, no web font, no randomness (a seed).
- **A known answer at named times.** The answer is computed, not stored as a picture: a pixel of a named colour at a named place, a number of frames, a measured loudness, a list from `movie.inspect`, a warning text. (No golden images: they break between GPUs for no reason. Where a picture must be compared, it is compared with a tolerance and between two paths of the same build: seek against playback against export.)
- **Real browser, both backends where the area draws** (WebGL and WebGPU), the same assertions.
- **Run by one harness**: a helper `withFilm(name, fn)` opens `tests/films/<name>.html` in the shared Chrome, waits for `window.__ready`, and hands the test the page; one `.test.ts` per film beside it states the answers. A film that cannot be read without eyes is not a test film.

## What must be guaranteed (the list)

Each guarantee is a sentence the library must keep true. "Seed" is the `examples/_checks` page that already carries a test of it and moves into `tests/films/`; "gap" is what has no film yet (to be confirmed by the coverage list, step 4a of the site design).

| # | Group | The guarantees | Seed (`_checks`) | Gap to fill |
|---|---|---|---|---|
| 1 | **Determinism** | A frame is a pure function of the script and the time: playing, seeking forward, backward and by jumps, snapshot and export give the same picture (to a tolerance); a seeded random is the same every run; `check` says so | `seeded`, `first-frame`, `card-seek`, `poster` | one film that compares the three paths on every layer type at once |
| 2 | **Time** | A layer lives from `at` for `duration`, then is hidden, not removed; keyframe `at` is local to its layer and negative counts from the end; `from` / `to` / `set`, repeat, yoyo, eases (named, spring, cubic-bezier); an expression is evaluated once at build | `relative-values`, `spring`, `cubic-bezier`, `spans` | lifespan edges (the frame before / on / after); the order of two keyframes on one property |
| 3 | **Export** | The file has exactly `duration × frameRate` frames and the same length in picture and sound; a range is `[from, to)`; the codecs asked for are the codecs written; a refused option says why | `render-range`, `render-formats`, `sfx-export` | exact frame counts per codec; the picture and the sound end together |
| 4 | **Geometry** | Anchors (a rect and a circle are centred, text and image top-left); scale, rotation and skew about the anchor; z-order is array order; a parent moves its children; a composition does not clip | `parent`, `layout-cutoff`, `overlap-picture` | skew; nested compositions two deep |
| 5 | **Shapes and paths** | A stroke draws on with `trimStart` / `trimEnd`; an even-odd path has holes; a morph pairs corners; a gradient follows its direction; a point along a path has the right angle | `path-motion`, `point-options`, `gradient-anim` | even-odd; morph |
| 6 | **Text** | A line wraps where it should (Latin and Japanese: never an orphan of one or two characters at the start of a line); vertical writing goes down and left; `visibleChars` types out; a missing font is reported, not drawn wrong | `animate-text`, `vertical-text`, `fonts`, `batch` | Japanese wrapping; right-to-left |
| 7 | **Camera and 2.5D** | A layer at depth `z` scales by the camera's perspective; depth of field blurs by distance from the focus; light and shadow; fog | `depth-of-field`, `rack-focus`, `light`, `spotlight-room` | perspective numbers; shadow edge |
| 8 | **Colour, filters, blend** | Each of the 18 blend modes matches its reference formula; a named filter and its numbers; a mask and a matte cut what they should, also under a transition; `motion blur` is the average of its samples | `blend-modes`, `named-filters`, `named-filters-2`, `filter-sweep`, `mattes`, `mask-bugs`, `warp`, `radial-blur`, `grain`, `motion-blur` | transition under a matte |
| 9 | **Media** | A video layer shows the frame the clock says (speed, reverse, freeze, loop) and its sound follows; an image keeps its ratio; a rotated video is upright | `time-remap`, `thumbnail`, `onion` | a rotated clip; an image ratio |
| 10 | **Sound** | `sfx` and `music` have the right length, peak and loudness; a score read back says what it plays; ducking and `react` follow their source; `inspectAudio` is the same number `check` prints | `music`, `audio-react`, `quiet-hours`, `sfx-export` | loudness target; silence detection |
| 11 | **Layer contracts** | A `canvas` layer is a function of the time and `check` holds it to that; a `shader` compiles, is deterministic and says its own line numbers on error; a `three` layer renders into the movie; particles are seeded | `canvas-layer`, `shader`, `particles` | `three` (render targets, tone mapping); shader error text |
| 12 | **Interactive** | A variable change rebuilds to the same result as building with it; a presentation stops where it says and its pages export; the controller wraps a canvas without changing its size | `variables`, `vars-page`, `presenter`, `controller-wrap` | stops and pages in one film |
| 13 | **The tools tell the truth** | `check` reports cut-off text, off-canvas layers, silent faults and slow loads, and does not report what is fine; `probe`, `frames`, `trim`, `concat` say what they did; a started tool leaves no process behind | `layout-cutoff`, `load-progress`, `loader`, `sandbox-runner` | one film per false alarm and per missed fault found so far |
| 14 | **Warnings are instructions** | A misspelt option, a unit mistake and a silent failure each give one sentence that says what to write | (inside the unit tests) | a film per warning family, asserting the text |
| 15 | **Backends agree** | WebGL and WebGPU draw the same film within a tolerance; a filter that differs (found: `multiColorReplace`, `kawaseBlur`) is named | (scattered) | the film runner runs each film on both and compares |

## How to start (order by risk)

1. The harness (`withFilm`) and the two paths of group 3 and 1 (export and determinism): they guard what every deliverable depends on, and the frame-count change of 2026-10-15 showed that the old tests did not state it (they allowed 0.2 s).
2. Group 2 (time) and 6 (text): the most common mistakes of an AI author.
3. The rest by the coverage list: a seed that already has a test is moved and renamed first; a gap gets a new film.
4. Each old `_checks` page is deleted when its film is in and its old test is rewritten to read the film. The numbered tour and the guide's 24 recipe blocks are deleted when the list shows nothing in them is unique.

## Not in scope

- Pictures stored as the expected answer; a visual-diff service.
- The gallery pieces as tests of correctness (they remain a smoke test of "loads, plays, checks clean").
- Performance numbers (a separate, later concern).

## Open points

1. **Both backends in every film** is the strongest and the slowest. Proposal: every film runs on the default backend; groups 7, 8, 11 and 15 run on both.
2. **Where an answer lives**: in the film's page (`window.__answers`) or in its test file. Proposal: in the test file, so the page stays a plain composition that an AI can also read as an example of the area.
