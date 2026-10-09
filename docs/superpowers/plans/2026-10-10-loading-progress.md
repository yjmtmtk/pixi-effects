# Loading progress (0.26.1) — design and plan

> Executed inline (the owner's standing choice). Owner decision 2026-10-10: option A (a determinate bar + stage name + percent), no poster / chapter-segment variants yet, plus `modulepreload` in the template and per-stage timings in `check`.

**Problem.** `movie.init()` builds a long video for seconds with nothing said: the loader is a ring that only says "LOADING". It is HTML/CSS and animates `transform` / `opacity` only, so it keeps moving while the main thread is busy; but no number ever reaches it, and a build that never yields cannot paint one.

**Design.**
1. `src/core/loadProgress.ts` (pure, unit-tested with a fake clock): stages `assets` / `build` / `sound` / `frames` with default weights (`.15 .60 .20 .05`, re-measured in Task 1), `begin(stage, total)`, `tick(n = 1)`, `end(stage)`, `progress` (0..1, never goes down), and `yieldIfDue()`: after ≥ 50 ms since the last yield it awaits one macrotask, so the page can paint. It reports through one callback `{ stage, loaded, total, progress }`.
2. `Movie.init` makes it, counts the layers of the expanded spec as the `build` total, feeds it from `loadAssetBundle` (per asset), `buildSequenceTree` (per layer, through an optional `progress` on the root shape), `mixdown` (per source) and the video-frame wait, emits **`loadprogress`** on the movie and writes the loader element: `--pe-progress` (0..1), `data-stage` (`LOADING ASSETS` / `BUILDING LAYERS` / `MIXING SOUND` / `PREPARING`), `data-percent` (0–100).
3. `src/loader.css`: the ring's label shows `attr(data-stage) " " attr(data-percent) "%"` when present (else `data-label`); every look gets a thin bar along the bottom (`transform: scaleX(var(--pe-progress, 0))`, `transition: transform .35s linear`, compositor-only, so the browser smooths the steps); `prefers-reduced-motion` drops the transition only.
4. `skills/pixi-effects/template.html` and `ai/chat-template.html` get `<link rel="modulepreload">` for `index.js` (and `Controller.js`), so the download overlaps the page parse.
5. `check` prints `ready in 3.3 s (assets 0.1 · build 2.4 · sound 0.6 · frames 0.2)` from the `loadprogress` events (a build over 5 s says which stage is the longest) and writes `loadStages` into `report.json`.

**Determinism.** Yielding changes timing only; the built tree, the render path and the exported frames are identical (a test builds a movie with a huge fake yield threshold and with 0 ms and compares `inspect` of a frame and the layer count).

## Tasks

### Task 1: the progress engine (unit)
- Create `src/core/loadProgress.ts`, `tests/core/loadProgress.test.ts`.
- Tests first (RED): stage weights add to 1 and the sum never exceeds 1; `progress` is monotonic even when a stage's `total` grows; `tick` past `total` is clamped; an empty stage (total 0) counts as done; `yieldIfDue` does not yield before 50 ms and yields once after (fake clock + a counted `yielder`); the callback gets `{ stage, loaded, total, progress }` and a final `progress: 1` on `finish()`.
- Run `npx vitest run tests/core/loadProgress.test.ts` → FAIL, implement, → PASS. Commit.

### Task 2: wire it into init, the events, the loader element
- Modify `src/core/Movie.ts` (create, count, feed, emit `loadprogress`, write the loader), `src/core/Composition.ts` (`buildSequenceTree` ticks and yields through `root.progress`), `src/core/AssetLoader.ts` (`onAsset`), `src/core/loader.ts` (`setLoaderProgress(el, state)`), `src/types.ts` or where `on(event, …)` overloads live (`on('loadprogress', fn)`).
- Tests first: `tests/core/loader.test.ts` (setLoaderProgress writes `--pe-progress`, `data-stage`, `data-percent`; tolerates null); a browser test `tests/loadProgress.browser.test.ts` (use the existing pattern of a test that opens a page: a movie with 40 text layers and a 1-asset bundle emits `loadprogress` with `progress` rising to 1, at least 3 events, the last stage is not `build`, and the movie's `inspect(0)` equals that of a build with progress off).
- Run, implement, green, `npm run test:fast`. Commit.

### Task 3: the CSS, the templates, `check`, the docs
- `src/loader.css` (bar + label, reduced motion), templates (`modulepreload`), `ai/tools/check.mjs` (stage timings line + `loadStages` in report.json; a test in `tests/tools/check.test.ts` style for the formatting function), docs: `docs/api.md` (`loadprogress`), `skills/pixi-effects/reference/cheatsheet.md` Player/loader line, CHANGELOG `## 0.26.1`.
- Look at it for real: a page with 600 text layers (slow build) screenshotted at 3 moments (`scripts` one-off, not committed) to see the bar and the label; the landing reel loader (parent page) is unchanged.
- Run `npm run build:ai`, targeted tests, `npm run test:fast`. Commit.

### Task 4: tidy-up for 0.26.1
- The npm copy of SKILL.md already has its YAML fixed on main (b89ab8e); verify `npx skills add yjmtmtk/pixi-effects --list` again after the next push.
- Bump pins to 0.26.1 only at release time (owner says go), not in this plan.

## Final review
One fresh reviewer over the range; Critical/Important in ONE fix pass with RED→GREEN; minors ledgered. Do not push or publish without the owner.
