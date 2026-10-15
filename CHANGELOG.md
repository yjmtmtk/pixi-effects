# Changelog

## Unreleased

- **New: `check --seam` tells whether a movie made to loop closes without a jump.** In the page it takes the last frame against the first (`seam`) and nine ordinary neighbouring pairs (`steps`, the two next to the seam among them) on pictures a quarter of the size, as the mean absolute difference of the colour channels. A seam up to 1.5 times the largest ordinary step (or under 0.001) prints `seam  the loop closes: …`; more prints `seam  JUMP: … 8.1× the largest ordinary step …`, is a problem and exits 1. `report.json` has `seam: { seam, median, max, ratio, ok, frames }`. The movie is its own measure (no stored picture). Found by stock-clip agents, who measured the seam by hand with ImageMagick (`compare -metric MAE`, the last frame against the first). New export: `seamVerdict` (check.mjs); test pages `examples/_checks/seam-loop.html` and `seam-jump.html`.
- **New: `probe file --expect "size=3840x2160 fps=30 frames=300 bitrate>=35M audio=none"` checks a file against what it must be.** One line each (`ok` / `FAIL`, the number the file has and the one wanted), `RESULT: …`, exit 1 when one fails, `--json` adds an `expect` list. The numbers are measured over every packet of the file (the new `frames`, and the bitrate of the whole file), not over the first 300 like the plain report. Words: `size width height fps frames duration bitrate video audio container`; operators `= != >= <= > <`; a misspelt word gets `did you mean`; a bad expectation is a usage error before the file is read. `docs/media.md`, the skill and `help media` carry it; the docs test now runs example commands with quoted arguments.
- **Docs: `bitrate` is a ceiling, not a target (pitfall 119), measured.** A constant bitrate mode (`bitrateMode: 'constant'`) reaches the encoder and still writes 0.1 Mbps for a black frame with a circle (H.264, HEVC and VP9: no encoder pads), so there is no option to add: read the real rate (`render` prints it, `probe --expect` checks it) and, when a minimum is needed, raise it with what the picture really has (seeded film grain).
- **Changed (breaking, small): an export is exactly `duration × frameRate` frames, not one more.** `render()` wrote the frames 0 … `totalFrames` inclusive, so a 10 s movie at 30 fps was 301 frames and 10.033 s while `check` said 300; the moment `duration` is now not a frame (it belongs to the next one), so the file is 300 frames and 10.000 s, a clip made to loop has no repeated frame at its seam, and the picture and the sound have the same length. A `range` is `[from, to)`: `1:2` is 30 frames at 30 fps (it was 31). The progress events count the frames, then one `100` when the file is finished; the stage is left on the last exported frame. What you may have done to get 300 frames (`duration: 10 - 1/30`) now gives 299: write the plain `duration: 10`. Seeking to the end moment (`gotoFrame(totalFrames)`) and the last-frame check are unchanged. Found by agents making stock clips, which all had to know the trick. Tests: `renderRange.test.ts` counts the packets of the real file; the Renderer unit tests and two browser tests that assumed the extra frame were rewritten (the stage's last frame, the progress events, a reversed loop's first instant).
- **Fixed: the guide's demo pages scrolled a little inside their frame.** Every generated demo (`examples/_guide/*.html`) had `body { padding: 16px }` and a picture that sits on a text line, so each was 20 px taller than the 16:9 frame the guide gives it and could be scrolled (measured: 20 px at 880 px and at 360 px wide, in all 17 pages). The pages now fill the frame exactly (no padding, `line-height: 0`, no scrolling), and `first-video.html` (which the reader also copies) has the same CSS. Test: `tests/tools/guideDemoFit.test.ts` loads every demo at both widths and fails if one scrolls or does not fill its frame.
- **`render` and `check` say more about the file they wrote.** `render --help` now lists every option (`--video-bitrate` and `--video-codec` were missing, so an agent could not find them). A command whose stderr is not a terminal (an agent, a script, CI) used to print no progress at all, so a render of many minutes looked hung: it now prints a line at once and one every 15 s (`rendering 40% (47 s)`; `--quiet` still prints none). The result line gives the real bitrate (`· 17.8 Mbps ·`), and when `--video-bitrate` asked for more than twice what the encoder spent (55M gave 17.8 Mbps on a mostly black picture) a note says so and to read the real rate with `probe`. `check`'s own export line gives its bitrate and says it is for looking at, not the file to deliver (`render` is). New exports: `makeProgress`, `bitrateLine` (render.mjs), `exportLine` (check.mjs).
- **Fixed: `frames --at f1` gave frame 0 (and `f4` gave 3, `f7` gave 6 at 30 fps).** A frame number was turned into seconds and rounded DOWN to four decimals (1/30 s became 0.0333, which is before frame 1), so a third of the frames of a 30 fps file came back as the one before. A time asked for a frame (`fN`, `start`, `end`) now rounds up, so it lands on that frame (`end` was also a frame early for some lengths, such as 4.2 s at 29.97 fps); a time asked in seconds is still the instant asked for. Found by an agent measuring a loop's seam with `f0` and `f1`, which were the same picture. Tests: every frame number of 8 frame rates, and the real command on `colors.mp4`.
- **A start of `check`, `render` and the media commands sweeps the headless Chromes that an earlier run left behind.** On 2026-10-14 264 of them (5.7 GB, up to 7 hours old) piled up in one working day from runs that were cut off (a timeout, a harness that ended) whose watchman never got to stop them; the cause was not proven, so the fix does not depend on it. Every private profile folder (`pixi-effects-*` in the temp folder) now holds `pixi-owner.pid`, the process that started the browser; the next `launchChrome` (new export `reapStaleChrome(tmp?)`) stops, by process id and without `pkill`, everything started with a profile whose owner is gone and removes the folder. A profile whose owner is alive (another tool running now), one with no owner file and any other folder are left alone; it never throws. Tests: `tests/tools/chromeReap.test.ts` (stand-in processes, mutation-checked, and a real-Chrome case).
- **The release gate is shorter when only documents changed.** `npm run release:check` compares the tree with the last `v*` tag (`scripts/release-scope.mjs`): when every changed file is a document (the changelog, README, AGENTS, SKILL.md, `docs/*.md`, the generated llms files) or a bump of this package's own version (the old number turned into the new one, and in the manifests only the `"version"` key), it runs the unit and document tests and leaves out the real-browser ones (about 4 of the 5 minutes) and says so; anything else, a file added or deleted outside the documents, no tag, or any doubt is a full run. `--scope` says the decision and why without running anything, `--full` forces everything; the stamp that `npm publish` checks records the mode. Tested on real git repositories and with the mutations that must fail (a site file counted as a document, a dependency bump taken for a version bump, a pure reordering taken for a bump, an empty change taken for docs-only).
- **CI had been red since 0.38.0, and it is fixed (tests only, nothing in the package).** A test of the media commands ran `frames` with a `PATH` of only node's folder: on Linux `google-chrome` is a shell script that needs `dirname`, so Chrome exited with code 127, and the test also ignored `SKIP_BROWSER_TESTS`, which CI sets. The browser parts of that test, and of the docs example runner, now run only where browser tests run, and the PATH keeps the basic system folders (the test first proves ffmpeg is not in them). The two pushes (0.38.0, 0.38.1) were made without looking at CI: the red mail came from the maintainer.

## 0.38.1

**Docs, and 21 pieces leave the gallery (64 → 43)**

- **Gallery: 21 pieces removed** at the owner's choice (AURA ONE, Orbits, KAGEOKURI, Escapement, Hanabi Night, hanbun, Nengajo: Hatsuhi, Now Showing, Paper Planes, Tadaima, Hikari no oto, Same Grey, Nenrin, KOYU, Key and Lock, Pendulum Wave, Yakou ressha, Hanon Trio Night, Binary Counted, Made of Seconds, Kanreki): their pages, posters, notes, cards and counts are gone (`scripts/gallery-swap.mjs --remove`); the measurements in the guide and FACTS that named Hanabi Night now say "a firework piece".

- **Docs: what an agent does when its shell is a browser chat's sandbox** (AGENTS.md, SKILL.md). An agent in claude.ai's code execution (a small root container with a weak CPU and a network limited to package managers: starting Chrome and rendering there is very slow) stalled for minutes on `check` (Chrome refuses to start as root without `--no-sandbox`; with the CDNs unreachable `check` waits its whole 240 s and says only "timed out") and on rewiring the page to local libraries, and was stopped by the person twice. The docs now say: there, follow the chat way (the template from CHAT.md, no `npx`, no `npm i`, no `check` / `render` / `view`), hand over the page, do not render in the sandbox (the person exports with the player's download button on their own computer, warnings come back from the red box), stop after two tries at anything that stalls, say what was not checked. Not changed yet: `check` still hides Chrome's own error and the reason a page did not load (proposals in the project notes).

## 0.38.0

**Media tools for AI agents: look at, listen to, cut and join footage with no ffmpeg**

- **New: `pixi-effects probe | trim | frames | sound | concat | audio`** (docs: `docs/media.md`, `help media`). `concat a b … -o out` joins clips by copy (refused, naming what differs, when the video or audio codec, shown size, rotation, sample rate, channels or the presence of sound or picture differ; each clip starts where the longest track of the one before it ends, so picture and sound do not drift apart over many joins; the report says where each clip starts), and `audio file -o out.m4a` copies the sound out (AAC → `.m4a`, Opus → `.webm`, any → `.mka`). Both were asked for by the trial below (an agent making a highlights reel could only plan it), run in Node with no browser, are made aside and moved into place, and were played in Chrome (the colours before and after the seam) and run on the iPhone clip. A fresh review of them found, and this release fixes: clips of the same codec with different decoder parameters (profile, level, parameter sets) were joined into a file whose later clips decode as garbage (now refused, naming it; a `trim --exact` cut is such a case), a sound that began later than its picture lost that offset in every clip (one start per clip, not one per track), AAC's encoder-delay packet was copied into the middle of the join as a gap of silence, an output that was the input under another spelling (`A.MP4`) overwrote it on a disk that ignores case, hundreds of inputs held a file each and ran into the descriptor limit, a refused command left an empty new folder, a second sound track was dropped without a word, and `audio` lost the sound's lead-in offset without saying so. Description of the first four: For an agent that is handed a video or a sound: `probe <file|url>` (container, duration, size, per track codec / size as shown / frame rate and whether it varies / rotation / bitrate, key packet times with `--keyframes`, and notes: `no audio`, `rotated 90°`, `variable frame rate`), `frames <file> --at 1,50%,f120,end,"every 2s" [--size 480] [--sheet]` (PNGs of the frames, named by time, and a contact sheet with the times under each frame), `sound <file> [--waveform]` (integrated loudness, true peak, clipping, silences, level over time and a waveform: the numbers `check` gives for a movie, from the same code), `trim <file> <start> <end> -o <out> [--exact]` (a cut by copy, with the real times). Every command: a short report or `--json`; exit 0 done / 1 a problem / 2 usage; a bad file is one sentence naming it, never a stack trace.
- **Honest about what a cut is.** A copy can only start on a key frame, so `trim` starts on the next one and says it (`asked 3.3–4.9 s, got 4–4.9 s`); a range with no key frame inside is refused with the key frames around it; `--exact` re-encodes in the browser for a start on the frame asked. mediabunny's own default (start exactly, with hidden earlier frames and negative timestamps) plays right in Chrome and ffmpeg (measured by playing the cut and reading the colour of every frame, after a first attempt that seeked a paused `<video>` gave a wrong answer) but other players were not measured, so the cut starts ON the key frame and the report is read back from the written file. A fresh reviewer found that the first version of this left the picture starting 0.7 s late with the sound from 0 (the Chrome test had been blind to it: it read the first frame for every time before the first frame); the test now reads the file's tracks back and fails on a late start. The output is made aside and moved into place, so a refused copy leaves nothing and never empties an existing file.
- **No ffmpeg anywhere, offline.** `probe` and `trim` by copy run in Node with mediabunny's file source and target, no browser (about 0.1 s). `frames`, `sound` and `trim --exact` decode or re-encode, so they use the headless Chrome that `check` and `render` use; mediabunny comes from this package's own bundle through a local server (Range reads in, PUT out: a long video never goes through CDP). A test runs the four commands with only `node` on `PATH`. If ffmpeg is installed and the job is a long transcode, the docs say to use ffmpeg: measured on one 3.9 MB file on one Mac, a lossless 5.6 s cut took 0.05–0.15 s in ffmpeg and 0.10–0.15 s in mediabunny under Node, and a 5.6 s re-encode 0.6–0.75 s in ffmpeg (the browser re-encode was not timed).
- **New export: `inspectSound(pcm, { window? })`**, the measurement of `movie.inspectAudio()` for the sound of any file (loudness BS.1770, true peak, clipped samples, silences, level rows; a last window that is only a sliver is not a row). It is also built on its own as `dist/sound.js` with no PixiJS in it, which the media page loads so it works offline (a test follows every import of that file). On a real export the command read the −14.8 LUFS that `check` had said (true peak −3.6 against −3.7: the file is AAC); on a very quiet one −30 against −29.7.
- Found while building it: mediabunny's `UrlSource` retries a dead URL for ever by default and its delay is in seconds (the command gives up after two retries and says so); its own console lines are silenced so a failure is one line; `getDisplayWidth()` is already the width after a rotation. The staged site no longer carries the tools' browser page (`ai/tools/media-page.html`).
- **A trial by three fresh agents** (four clips: two of our renders, one with a rotation flag, one with no sound; only these commands and their docs; findings in `pixi-effects-opus/M1..M3`) found, and this release fixes: `trim --exact` files were 70–79 ms longer than reported (now only the picture is re-encoded, the sound is copied byte for byte, and `actual` is read back from the file); an audio bitrate that read 157 kb/s on a file and 55 on its cut (a declared figure against a measured one: both are measured now); a rotated clip's text did not say the stored size or the direction (`180×320 shown (stored 320×180, turned 90° clockwise)`; note that a flag on a landscape picture shows it sideways, which `frames` shows too); `--at every 2s` needed quotes (`every:2s` works, and the error says to quote); `sound` gave whole-dB rows with no times, no loudest stretch, no headroom and no verdict (now: loudest and quietest rows with times, `--window`, and a `reference` line with how many LU under −14 and the headroom to −1 dBTP, whether raising it would need a limiter; the library's own notes start at −24 and −9 LUFS, which the docs now say); `help media` opened with a line of the DSL (an exact heading now crowds out files that only mention the word). Then on one real iPhone clip (HEVC, 1080×1920 stored sideways and turned, variable frame rate ~59.94 fps): `probe`, `frames` (upright), `sound` and the copy cuts (0.2 s, HEVC kept) were right, four cuts matched the source frame at their first and last time, and `--exact` (8 s) turned the HEVC into H.264 without saying so, which it now does (`the picture was re-encoded as avc (the source is hevc)`). Not built: an option to show a rotated video unrotated, re-encoding clips so that different ones can be joined, `convert`, `scenes`, tempo.
- Spec and plan: `docs/superpowers/specs/2026-10-14-media-tools-design.md`, `docs/superpowers/plans/2026-10-14-media-tools.md`. Not claimed anywhere yet (landing page, FACTS): the trial above used our own renders, not footage from a phone or a camera.

## 0.37.0

**The `canvas` layer: draw it yourself, and what eight trial pieces taught**

- **New: `{ type: 'canvas', draw: (ctx, t, info) => { … } }`.** A picture drawn by your own function of the time into a canvas of the layer's own (cleared before every call, nothing survives into the next), shown like an image at its place in the stack: `initial`, `keyframes`, `filters`, `mask`, `blendMode`, `parent`, `threeD`, transitions and export work on it. Keys: `draw` (required), `setup` (once, may be async; its result is `info.state`, the place to compute a whole simulation), `width` / `height` (px or expression, at most 8192), `resolution` (0.25 to 4), `params` (numbers that keyframes animate as `'params.name'`), `seed` (seeds `info.random()`, which starts again at every call), `smoothing: false` (hard pixels, also when the layer is scaled up: pixel art). `info` is `{ frame, duration, progress, width, height, resolution, frameRate, params, state, random, start, time, canvas }`.
- **The contract is a function of the time, and `check` holds you to it:** a build-time warning for `Math.random`, `Date.now`, `performance.now` and `new Date()` in `draw`, and `check` (and `movie.review()`, so the Playground) draws every canvas layer twice at four moments and reports a layer whose two pictures differ, naming the moments (`movie.canvasProblems()`). The check draws in two orders (an integrator that moves by the time since the last call is caught, which two draws in a row cannot show) and in a scratch canvas (reading the pixels of the real one made Chrome move it from the GPU to the CPU in the middle of the check, which anti-aliases a few pixels differently), covers inline canvas masks, and `check` lists it under its own `canvas` heading, not as a layout issue. A missing or throwing `draw` / `setup` is said once with the layer's name and the layer is a magenta checkerboard (the next frames are tried again).
- It cannot see or paint on what is below it, it is not audio, and a spec that holds one holds functions (not pure JSON): an escape hatch like `three` and the `custom` filter. Recipes `canvas-trail`, `canvas-rings`, `canvas-pixel-sprite`, `canvas-life`; a guide section with a live demo; pitfall 115; `help canvas` finds the layer first (a heading that is the word now ranks first).
- **What eight fresh authors needed (a trial of eight different pieces made with the layer: a botanical plate, a fifths clock, a data race, a brush painting, an elastic exposure, a pixel-art scene, kinetic type, a flow field), and what changed because of it:**
  - **`info.time`** (the movie's seconds) and **`info.start`** (where the layer starts on the movie's clock, nested compositions counted; inside a time-remapped composition it is that composition's own clock): several canvas layers and the sound share one clock without adding the layer's `at` by hand, which broke quietly when someone moved the layer (6 of 8 pieces did it by hand).
  - **`info.canvas(w, h)`**: an offscreen canvas for sprites, masks and scratch pictures, with a 2D context made for reading (CPU). Found by tracing a `check` report that blamed `Math.random` for a layer that used none: a canvas made in `setup` with `document.createElement` and drawn with `destination-in` over 96 anti-aliased strokes was drawn differently the first time (up to 128 of 255, 40 418 channel values on a 1280×720 layer) and the same every time after.
  - **`check` tells the truth about canvas layers**: every moment is drawn once and thrown away before the two orders are compared (a first-use difference of the browser is not held against the layer, and a cache filled on the first call is fine); a layer that differs is reported with how many channel values differ and by how much; when every layer passes, `check` prints a `canvas` line (`2 canvas layer(s) drew the same picture twice at 4 moments (two orders): deterministic · slowest draw 3.2 ms on the CPU`; silence made 7 of 8 authors unsure it had run); `movie.canvasReport()` and `review().canvas` carry the rows. A draw that throws at a checked moment is no longer "deterministic" (its checkerboard was the same twice): the row says it could not draw there. The draw time is measured after a one-pixel read, because a canvas keeps its calls until something reads it (a draw that took 259 ms in the check was the flow-field piece's 3600 lines).
  - **New exports for `draw`:** `samplePath(d)` (SVG path data walked by length: `.length`, `.at(u)` → `{ x, y, angle }`, `.trim(a, b)` → flat point pieces; for a line that draws on, text along a curve, a petal that falls along a route) and `noise2(x, y, seed)` (smooth 2-D noise). `ease`, `noise`, `random` and `rand` were already exported and are now named in the docs: 6 of 8 authors rewrote easing by hand because nothing said it could be imported.
  - **Docs:** shared data belongs in module scope (the state `setup` returns is private to its layer), a cache of a pure function is fine, sprites and masks come from `info.canvas`, `ctx.filter` / composite operations / `drawImage` of another canvas / `measureText` all work, a web font is loaded with `await document.fonts.load(…)` in `setup`, **`check` does not see text drawn in a canvas**, the first line of SKILL.md and AGENTS.md no longer says "you never write per-frame code" without the one exception; pitfalls 116–118; recipes `canvas-text-mask` (words as a window onto moving bands: mask first, then `source-atop`), `canvas-text-on-path` and `canvas-bars` (bars that swap places) in a section of their own.
  - **Not built, on purpose:** values several layers read from one animated source (`composition.params`), reading another layer's picture, text on a path as a layer, pixel-art helpers (framebuffer, dither, palette, bitmap font), `paramAt(name, t)` (a keyframed param read at another time), a square wave for `music`. Each was asked for by one or two pieces.
- Gallery: five pieces made with the layer in the trial (a botanical plate, a bar-chart race, an elastic long exposure, a pixel cut-scene, a poem in kinetic type): 64 pieces.
- Spec and plan: `docs/superpowers/specs/2026-10-14-canvas-layer-design.md`. Plugins, registries and maintainer-only fields were considered and dropped: a layer that can draw anything makes them unnecessary.

## 0.36.0

**Vertical writing, `check` that sees pictures over text, holes in paths, and the fixes found by 18 fresh authors (the claims that were verified on the real build)**

- **New: vertical writing (tategaki).** `animateText(..., { vertical: true })` and `splitText(..., { vertical: true })`: characters go down a column and a new line is a new column to the left (`x` is the right edge of the first column). 、。 sit at the upper right of their cell, small kana a little up and right, and the long vowel mark, dashes, waves and brackets are turned a quarter clockwise (`rotation: 90`); pieces carry `cx` / `cy` / `rotation`. No tate-chu-yoko and no automatic line breaking.
- **New: `check` lists an opaque shape or image drawn over part of a text, and a thin line drawn over its body** (review list, with the other overlaps; a shadow, glow, ring or backdrop is not reported), **`check --at … --crop X,Y,W,H`** writes each picture as that part of the canvas, enlarged up to 4x, and **`help`** finds a heading written with spaces (`motionBlur`), a table row (`path`) and a call (`steps`).
- **New: `format: { time: 'hh:mm' }`** (also `'hh:mm:ss'`, `'h:mm:ss'`, `'mm:ss'`, `'m:ss'`) prints a counter's value, in seconds, as a clock; **`resolution`** on a text layer (1–8) draws it at N× the pixels so text inside a group scaled up N× stays sharp; **image `scaleMode: 'nearest'`** for pixel art; **`inspectAudio`** gives each source `belowMixDb` (how far below the mix around its loudest moment it is) and `check` gives ONE note when short sfx sit more than 12 dB under the mix ("buried", naming the worst).
- **Guide demos load this repository's build** (`../../dist/…`), like the gallery pages, so a demo shows the code of the same commit.
- **Fixed: `initial: { fill }` on a text layer was dropped without a word** (only a `fill` keyframe worked). It is now the colour from the start (it wins over `style.fill`).
- **Fixed: a filter option set to `undefined` (a misspelt variable) overwrote the filter's own default**: `{ type: 'bloom', strength: undefined }` made `movie.init` fail with "Cannot read properties of undefined (reading 'x')". The key is now left out and a warning names the filter and the options.
- **`check --at`** no longer leaves the pictures of an earlier run in `frames/` (it cleared nothing, so an old frame could be taken for the current one). The music read-back no longer says "ends early" for a track that is a few millionths of a beat shorter (decimal note lengths add up with float noise).
- **`pixi-effects new --size`** sizes the shown page for a tall or square movie (it was 960 px wide, so a 9:16 page was 1700 px tall).
- **New: `fillRule: 'evenodd'` on a `path`** (a donut written as two circles in one `d` was a solid disc: sub-paths were never holes). The biggest sub-path is the shape, every other one is cut out of it, and the stroke goes round all of them.
- **Changed: a morph between two outlines with the same number of corners is paired corner to corner** (it resampled both to 128 points along the edges, so a morph between two quads whose edges are not in proportion rounded the corners half way). Outlines with different corner counts, and curves, behave as before.
- Docs: a keyframe's `from` holds from the start of the layer and beats `initial` (cheatsheet, pitfall 114: no warning, because `initial` = the resting value and `from` = where it starts is what the recipes do); a path's `x` / `y`, when given, place its middle.
- Docs: `--out DIR` writes straight into DIR (no `<name>/` inside); pitfalls 112 (text under a scaled-up parent is soft) and 113 (an `sfx` lasts at most 10 s, a `music` layer plays 16 tracks).
- Gallery and guide: 59 pieces (18 new, 17 swapped, 11 removed); the guide no longer shows gallery pieces (its demos are built from its own recipes, `scripts/build-guide-demos.mjs`); `scripts/gallery-swap.mjs` also adds (`--add`) and removes (`--remove`).

## 0.35.0

**The player's seek-bar preview (`thumbnails: true`, off by default) and `movie.thumbnail()`**

- **`movie.thumbnail(frame, { width? | scale? })`** gives a small canvas of any frame **without moving the playhead or changing the picture**, also while the movie plays. It draws the frame on the side inside one task (nominal time set, 3D / shader layers awaited, the playhead put back and awaited), so the browser never shows the in-between; it equals `snapshot({ motionBlur: false })` at that size. `null` when a seek, render or another thumbnail is running. Seeks, renders and peeks wait for a running thumbnail, so they never interleave with it.
- **`movie.thumbnailsOff`** is `'variables'` for a movie that declares variables and `'video'` for one with a video layer, else `null`; `thumbnail()` gives `null` then (a video would have to seek twice, a variable movie can be re-laid out under it).
- **`new Controller(movie, { canvas, thumbnails: true })`**: hover (or move along) the seek bar and a 160 px picture with the time appears above it, kept inside the picture, hidden while dragging; pictures are cached per tenth of a second until a rebuild. Default off.
- Tests: `tests/tools/thumbnail.test.ts` (exact against `snapshot`, undisturbed canvas and playhead, playback with a thumbnail per frame, the off reasons, options) and `tests/tools/thumbnailPreview.test.ts` (the bar, with real mouse moves).

## 0.34.0

**From the capability probe of 2026-10-12 (15 kinds of video tried by fresh agents; nothing was impossible, 9 needed hand-written glue; these are the defects that were verified on the real build)**

- **Fixed (docs + a warning): `bulgePinch.center` is a fraction of the filtered layer (0 to 1), not canvas pixels.** The docs said pixels; a pixel value such as `{ x: 900, y: 500 }` moved the bulge out of the layer and nothing showed, silently (a trial lost three runs on it). The docs now say so (`docs/dsl.md`, the filters guide, pitfall 110), and a centre with a component beyond 3 warns: `bulgePinch.center is 0-1 of the layer ({ x: 0.5, y: 0.5 } is its middle), but {"x":900,"y":500} reads as pixels`. `twist.offset`, `zoomBlur.center` and `shockwave.center` were measured and are pixels, as documented.
- **Docs, facts only: right-to-left and complex scripts** (`docs/dsl.md` Text, pitfall 110). Arabic, Hebrew, Thai and Devanagari are shaped correctly with a font that covers the script; marks that hang below the font's box can be cut off (the dots of an Arabic ي: set `style.padding`; `check` cannot see it); `splitText` / `animateText` place words left to right, so an Arabic line comes out reversed; `visibleChars` shapes each prefix alone. Not changed in the code: nothing asked for it yet.
- **Fixed: `radialBlur` did nothing on WebGPU, the default backend.** pixi-filters 6.1.5 writes the filter's `kernelSize` as an i32 but its WGSL shader reads an f32, so the value was read as 0 and the blur was skipped, silently, for every user with WebGPU (WebGL was fine). Reproduced with pixi.js and pixi-filters alone (no pixi-effects); the shader is now rebuilt with the field as an i32, and the same blur comes out on both backends (`tests/tools/radialBlur.test.ts`, `examples/_checks/radial-blur.html`). Every other filter of the package was checked for the same mismatch: this is the only one. The workaround can be removed when pixi-filters fixes it.
- **A test that draws the recommended filters on WebGPU and on WebGL** (`tests/tools/filterSweep.test.ts`, `examples/_checks/filter-sweep.html`): `glow`, `outline`, `dropShadow`, `bevel`, `bloom`, `pixelate`, `crt`, `rgbSplit`, `dot`, `radialBlur`, `glitch` must show and look the same on both. All 38 `pixi-filters` filters were compared once: `multiColorReplace` (whole picture black), `kawaseBlur` (far weaker), `advancedBloom` (sharper) and `ascii` (stripes) differ on WebGPU; they are named in the docs with the filter to use instead (pitfall 111, `docs/dsl.md` Named filters, the filters guide) and the docs say which ones to reach for first. Not fixed in the code: they are not used by any of the repository's 100 example files, and `multiColorReplace` needs pixi-filters' uniform packing reworked.

## 0.33.0

**`check` tells the truth about what a trial found (design: the AI trial of 2026-10-12, 10 fresh agents on 0.32.0; a fresh review of this change found 2 gaps and 3 false alarms, fixed below)**

- **Fixed: `inspect` (and so `check`) never reported cut-off or off-canvas text on a layer that had an x or y in `initial` AND any keyframe** (a title with a fade-in: the commonest case). Such a layer was counted as "moving" (a ticker that crosses the edge on purpose) for its whole life, so a 2000 px title on a 1280 canvas passed with "no cut-off". A layer is now "moving" only **while a geometry keyframe is running**: `x y z scale scaleX scaleY rotation rotationX rotationY skewX skewY positionX positionY pivotX pivotY anchorX anchorY` (in the layer, in a `null` parent, in the composition that holds it; a camera with a tween running carries every `threeD` layer; a spring runs for its settle time). A fade (alpha) and a `set` are no motion. A title that rises and fades in is exempt while it rises and is reported once it has settled. A text that waits outside the canvas for its entrance, or slid out and stays parked there (an exit), is not called "entirely outside" (it has an x / y / z tween; a layer put off the canvas by a typo whose only motion is a scale pop is still reported); one that stops half cut off is reported. All 52 gallery pieces, the interactive pages, the showreel and the two films still say nothing; `tests/core/inspect.test.ts`, `tests/tools/layoutCutoff.test.ts` (`examples/_checks/layout-cutoff.html`). Pitfall 30b says what counts as moving.
- **A fade that the layer's end cuts off is warned about at build.** `layer "scene1": keyframes[1] runs from 4.2s to 5s but the layer ends at 4.5s, so the last 63% of it never plays (a fade stops half way)`. Only a fade (to `alpha` ≤ 0.1 or ≥ 0.9, or `from: { alpha: 0 }` with no `to` alpha), with a cut of more than 25% and at least 0.2 s; a `set`, a repeating tween (a blink), a spring, a decaying flash (to 0.22) and drifts or zooms that are still going at the end (confetti) are left alone. A negative `at` counts back from the end. A layer without a `duration` is judged against what is left of its composition; a keyframe that starts after that is the "starts after the layer ends" message.
- **A written `music` score much longer than what plays is a note in `check`'s audio block** (advice, not a fault: music that outlasts the movie ends with it; a looping layer is not noted): `layer "bgm" (music): the score is 19.2s long but only 10s of it play, so it is cut off mid-phrase`.
- **`pixi-effects new <name> --size 1080x1920 --duration 20`**: the canvas, the `W` / `H` constants and the length are set (the template had to be edited in three places). A bad size or duration, or an option nobody knows (`--fps`), says what is accepted and writes nothing.
- Docs, facts only: Japanese and Chinese do not wrap at spaces (`wordWrap` alone does nothing, `breakWords` breaks anywhere and leaves orphans; write the `\n`; Korean has spaces), and no font is bundled (load a web font that covers the script; a family nothing loads is silently replaced). Pitfalls 108 and 109, `docs/dsl.md` (Text). The quick start (still under 2 KB) now says what `check` cannot judge and names two features agents did not find on their own (`spans`, `vars` with `--var` / `--size`). The `variants` recipe's prose now matches its code (a declared variable is set with `--var`, the language comes from `--query`).
- Tried and dropped: a warning for a `{name}` that nobody declared when NO variable is declared at all. It would make a page that shows code (`const p = {x};`) fail `check` with no way out; the existing warning with declared variables stays.

## 0.32.0

**`spans`: colour and style inside one text layer, and the papercuts of five films (planned as 0.32)**

- **`spans`** (design: `docs/superpowers/specs/2026-10-12-spans-design.md`): a text layer takes `spans: [{ text: 'type', fill: '#7fa07f' }, ': ', { text: "'a'", fill: '#ffd166', fontWeight: '700' }, ',\n next']` instead of `text`. A span changes `fill`, `fontWeight`, `fontStyle`, `fontVariant`, `letterSpacing` or `dropShadow` (a size, a font, `lineHeight`, `align` or a `stroke` is warned about and ignored: they belong to the layer's `style`; the style's expressions and variables are resolved before measuring, and a missing `fontSize` is measured as the text layer's default); `\n` starts a line; `style.align` places the lines. At build time the layer becomes a group of ordinary text layers `<name>.0 …` (so every keyframe, filter and mask works, `anchorX` / `anchorY` centre the whole block, `inspect`, `check` and the timeline view see the pieces); a `visibleChars` typewriter counts over all the spans, the newline included; `{name}` variables inside spans are read before the layout, so `setVars` lays the line out again. Needs the font loaded, like `splitText`. The films needed one text layer per token to stream coloured code.
- **A dotted keyframe key on a filter now moves the leaf of a point option** (`'filters.s.red.x'`): it used to be written as a property literally named `red.x` and nothing moved, silently. A path that leads nowhere is warned about once. The docs said both that it works and that it does not; they say one true sentence now (the whole point `red: { x, y }` as a keyframe value still does not tween).
- **Filter options are copied** when the filter is made: a keyframe on `'filters.s.red.x'` writes the leaf of the point in place, which wrote into the author's spec object (after a `rebuild` a `to` keyframe then started from the last frame that had been drawn). A dotted key in `initial` / a `set` is a path too.
- **`pixi-effects render` prints the length of the FILE** (it printed the length of the whole movie for a `--range` or `--scene`).
- **A property written on a layer instead of in `initial`** (`z`, `x`, `alpha`, `rotationX` …) now says "put it in `initial`" instead of guessing another key ("did you mean d?" on a path).
- **The depth-of-field warning says where it starts** ("it warns from 20") and has a test.
- Docs: `animateText` without `out` (the pieces stay), what the default `dissolve` looks like (blotches; `scale: 200` is grain), a `path` in canvas coordinates takes no `x` / `y`. The roadmap's 0.32 list was checked against the 0.31.0 build before work began: of 11 gaps reported by AI agents, 6 were already documented or warned about.

**Landing: two 45-second films next to the reel**

- `examples/films/ink-and-paper.html` and `examples/films/light-as-material.html`: two films, each one HTML page of data, played live from the landing page on a click (the same way as the reel). They open in a terminal where an AI is asked for a video and then combine Rough.js, D3 and three.js with the library's own features (springs, particles, shaders, warp, light and shadows, depth of field, camera paths, time remap, music and sfx written as text). Written by an AI model from the docs and a short brief. Their web fonts load inside the film pages only; the landing page itself still loads nothing from third parties.
- They are not gallery pieces (the gallery's rules are 8–14 s and no third-party fonts), so the gallery's 52 is unchanged.
- A browser test: each of the two cards loads its page on a click, the page is ready and logs nothing.

## 0.31.0

**Added: variables, and a composition that is built again (design: `docs/superpowers/specs/2026-10-11-variables-0.31-design.md`)**

- **`movie.init({ vars: { title: 'NORD', accent: '#e5399a', shift: 0 } })`.** A number is a plain name in an expression (`x: 'W/2 + shift'`); any value is `{title}` inside a string anywhere in the composition (`text`, a colour, `asset`, a layer name). Not `$`: that is a price. Reserved (refused, said once): `w h W H GW GH t d T contain cover value`, the expression functions and `PI`. `at` and `duration` stay plain numbers: a variable moves values, not timing.
- **`movie.setVars()`, `movie.resize(w, h)`, `movie.rebuild({ composition, vars, width, height })`, `movie.vars`, the `'rebuilt'` event.** The composition is built off the stage and swapped in whole, at the same frame; a playing movie keeps playing, a poster stays; a failure keeps the old composition (`error` with `where: 'rebuild'`, and the promise rejects); calls that overlap are joined (the latest values are built once more). Each returns `{ reason, ms, audio: 'reused' | 'mixed' | 'none', frame, playing }`. The sound is mixed again **only if it changed** (a mix of a film takes 0.6 to 0.8 s, the rest about 20 ms). After `resize()` the movie's size beats a `width` / `height` the composition names. The `Controller` redraws its stop marks.
- **Warnings at `init` (and when `rebuild({ composition })` replaces the spec):** a variable nothing reads, and a `{name}` nobody declared (with the declared name it looks like). `setVars` of an undeclared name is ignored with a did-you-mean.
- **`pixi-effects check` / `render` take `--var name=value` (repeatable) and `--size WxH`.** The tool builds the page again once it is ready, so a page needs nothing for it; a number variable is given a number, a name the page did not declare stops the run with the nearest one. `check --size 1920x1080,1080x1920` writes a contact sheet and a layout review per size (`sheet.png`, `sheet-1080x1920.png`) and a `vars` and a `sizes` line; `render --var lang=ja --size 1080x1920` writes the variant.
- **Fixed with it: `play()`'s first frame could land one frame BEHIND where it was started** (the animation frame's time is a little earlier than the start time), so a pause and play in a row walked the playhead back; and rebuilds that came faster than a frame held a playing movie still. A rebuild that leaves the sound alone no longer stops anything.
- **`movie.loop` (and `init({ loop })`, the `loopchange` event) and the Controller's loop button.** At the end of an ordinary `play()` the movie goes back to the start and plays on: no `ended`, no `pause` / `play` events at the wrap, the sound starts again. Default `false`, like a `<video>`; `playUntil()` and `render()` ignore it. The bar has a loop button next to the volume and the `L` key (`Controller` option `loopButton`, default true).
- **Fixed: a text outline no longer spikes.** `style.stroke: { color, width }` was drawn with PixiJS's default `miter` join, which grows spikes on the sharp corners of W, V, A, k (an AI wrote this often). An outline that names no `join` is round-joined now; `join: 'miter'` / `'bevel'` still say what they say. Pitfall 106; `docs/dsl.md` (Text).
- Recipes `variants` (a language and a colour as variables) and `liquid-layout` (`ResizeObserver` + `rebuild`); pitfalls 104 and 105; `docs/dsl.md` "Variables", `docs/api.md` "Movie variables and rebuilding".

**Known limits.** While a movie plays, the new composition is built beside the old one (it keeps playing); when the sound is unchanged nothing stops, when it changed the sound starts again from the same frame (a short gap); a rebuild is the whole composition, not one property (measured in the spike: evaluating the expressions is about 40 µs, so a finer recompute buys little).

## 0.30.1

**Docs**

- **Found by six fresh agents (three before 0.30.0's docs, three after):** a recipe for **a plain cut with generated images and music written as text** (`slideshow-cuts`; the slideshow recipe had only transitions and a music file); the **bar chart** recipe grows its bars one at a time with `EACH = DUR + 0.3` (the highlight and the callout wait for the last bar: `PEAK_AT`); `AGENTS.md` and the skill now agree that the check writes to `check-out/<name>/` (the example passed `--out check-out`).

**Fixed**

- `pixi-effects recipe` listed only the recipes whose code block had a name, so three (`deck-in-page`, `placeholder-images`, `metallic-three`) were invisible to it; every section is listed now (a section without a name gets one made from its title), and a test requires every section of `recipes.md` to have a name.

## 0.30.0

**Added**

- **`pixi-effects new <name>`, `recipe [id]` and `help <word>`: read what you need, not 100 KB.** `new` writes `<name>.html` from the template, titled with the name and pinned to the installed version (it will not overwrite without `--force`). `recipe` lists the tested recipes (id and title); with an id (or a unique part of one) it prints that recipe's text and code; an id nobody has says the nearest one. `help <word>` prints the sections of the docs about a word (`docs/dsl.md`, the cheatsheet, the pitfalls, `docs/api.md`, `direction.md`), headings first, each cut to 30 lines with where the rest is, never more than 170 lines in all.
- **`skills/pixi-effects/reference/quickstart.md`** (under 2 KB, a test holds it there): the five commands, a title card that the recipe tests build and lint, and the rules that cause most failures. `SKILL.md`, `AGENTS.md`, `llms.txt` and the README start an agent there; the 35 KB cheatsheet and the 41 KB pitfalls are for looking things up.

## 0.29.0

**Changed (breaking): presentation leaves the core**

The talk side of the library is now its own entry, `pixi-effects/present`, built on the core's public API only (a test enforces the import rule). The core keeps `composition.stops` (named times, `movie.stops`) and gains two general moves; everything else that was about a talk moved out.

| before | now |
|---|---|
| `movie.next()` `prev()` `goToStop(i)` `goToPage(n)` | `next(movie)` `prev(movie)` `goToStop(movie, i)` `goToPage(movie, n)` from `pixi-effects/present` |
| `movie.stopIndex` `pageIndex` `pageCount` `currentStop` | `stopIndex(movie)` `pageIndex(movie)` `pageCount(movie)` `currentStop(movie)` |
| `movie.on('stop', fn)` | `const off = onStop(movie, fn)` |
| `movie.stopImages(o)` `movie.inspectStops(o)` `movie.exportPDF(o)` | `stopImages(movie, o)` `inspectStops(movie, o)` `exportPDF(movie, o)` |
| `import { deck } from 'pixi-effects'` | `import { deck } from 'pixi-effects/present'` |
| `import { Presenter } from 'pixi-effects/presenter'` (`dist/Presenter.js`) | `import { Presenter } from 'pixi-effects/present'` (`dist/present.js`; the import map line is `"pixi-effects/present"`) |
| `normalizeStops`, `pictureStops` exported from `pixi-effects` | not exported (the core normalises `composition.stops` itself; `pictureStops` is inside `pixi-effects/present`) |
| the types `StopEvent`, `StopImage`, `StopImagesOptions` from `pixi-effects` | the same names from `pixi-effects/present` (`Stop` and `StopSpec` stay in `pixi-effects`) |

A page that only maps `"pixi-effects"` still gets its stops reviewed and its PDF exported by `check` / `render`: they load `present.js` from beside the library.

**Changed (breaking): the API list for 0.29** (`docs/api-surface.txt` is the whole public surface, read from the sources and frozen by a test; the decisions are in `docs/superpowers/specs/2026-10-11-api-list-0.29.md`)

| before | now |
|---|---|
| `maskInverted: true` next to `mask: { …a layer… }` | `mask: { layer: { …the mask layer… }, invert: true }` (the one inverted-mask form, the same as `{ layer: 'name', invert: true }` for a named matte; `channel: 'luma'` works on a layer written in place too). The old key warns and says this. Inside a list of masks only names are allowed |
| `Controller` options `enableKeyboardShortcuts`, `showExportButton`, `present` | `keyboard`, `exportButton`, `presentButton` (the Presenter's names). An unknown `Controller` option now warns, with did-you-mean |
| `pixi-effects/controller` also exported `CONTROLLER_CSS`, `formatTime`, `frameToPercent`, `pxToFrame`, `pxToFraction`, `extensionForMimeType` | `Controller`, `ControllerOptions`, `ControllerTheme` only |
| the bins `pixi-effects-check`, `pixi-effects-render`, `pixi-effects-view` | `pixi-effects check|render|view` (the one bin; `npx pixi-effects-check` never worked) |
| `pixi-effects render --fail-on-warn` | `--strict`, the word `check` already used (the old flag says so) |
| `Movie.emit`, `audioSource`, `gainNode`; `Sequence.bindTimeline`, `collectAudio`, `absoluteStart`, `keepHidden`, `maskSequence`, `filters`, `updateSpace`, `syncFrame` in the type declarations | marked `@internal` and stripped from the declarations (the library still uses them) |

**Added**

- `movie.playUntil(seconds?)`: play and pause exactly at a time (`true` when it landed; `false` when a pause, a seek or a newer `playUntil` ended it first; no time = to the end). It is what `next(movie)` is made of, and the way to "play the intro, then wait".
- `movie.peek(fn)`: run a function that looks around (seeks, pictures) and put the playhead or the poster back; the seeks inside are not reported as `seeking` / `seeked`.
- `movie.snapshot(frame, { quality })` (JPEG quality) and `{ as: 'imageData' }` (the pixels, to measure or compare).
- `warnUnknownOptions(where, options, validNames)` is exported: the did-you-mean warning for an unknown option, for presets and layer types written outside the library.
- `animateText({ out: { preset, at: T } })`: the exit starts at composition second T (the pieces leave in the same wave and stay gone until the layer ends). Without `at` it is the end of the layer run backwards, as before; a warning says `out.at ≤ …` when the exit does not fit, or when T is before the entrance has finished.
- `pixi-effects render --help` and `pixi-effects view --help` (usage, exit 0), like `check`.
- A warning when a picture key (`filters`, `filterArea`, `mask`, `blendMode`, `threeD`, `hideBehindCamera`, `lit`, `castsShadows`) is put on a layer that is never drawn: an audio layer, a camera, a light (a light keeps `castsShadows`, its own switch). The key did nothing there, silently.

**Fixed**

- `NamedFilterType` lacked `'warp'`: `{ type: 'warp' }` was a TypeScript error though it worked at run time. The compiler now checks the type and the runtime filter tables against each other, both ways.

**Checked, not reproduced**

- The two bugs the old roadmap listed (an inline shape mask under a transition; a 4000 x 2400 `threeD` layer black on WebGPU) do not reproduce on this code. Real-browser tests pin both, on both backends.

**Docs**

- **The film guide says who it is for.** `direction.md` opens with a note for an AI in a browser chat (no shell, no files): this guide is not yours, follow `ai/CHAT.md`; you can still put a three-line plan in your reply and ask. The `llms.txt` line for it says "for an AI with a shell and files; a browser chat skips it".

## 0.28.2

**Added**

- **`pixi-effects view` tells you the work changed, and never switches by itself.** It watches the page's folder (not `node_modules`, `out`, `reviews`, `check-out`, hidden files); when something changes it shows "Updated hh:mm:ss — reload (R)" and nothing else. Reload (the button or R) loads the page again and returns to the frame you were on; the switch "auto" (off by default, remembered) reloads only while the movie is paused. The skill now says to start the viewer right after copying the template (before the brief is written) and to give the human the address in the first message, so the first address goes out within two minutes and they watch the film grow.

**Fixed**

- **`pixi-effects view` centres the page, and the timeline legend no longer gets cut off.** A page that keeps its picture at the left edge (the template does) sat against the left of a wide viewer; the iframe is now as wide as the page's own content and centred. The legend under the timeline (text, shape, image, …) is wrapped onto more lines when the chart is narrow instead of running past the right edge (`timelineSvg()` and the `timeline.html` that `check` writes).
- **A text layer whose `style` has an undefined value is no longer blanked.** `style: { fontSize: undefined }` (a variable that was never set) erased the default size and the text was not drawn; the check said only "has no size". The undefined keys are now skipped (Pixi keeps its default) and one warning names them: `style.fontSize is undefined … omit the key instead`.

**Docs**

- Pitfall 103: load a web font before `measureText` / `splitText` / `animateText` (measured: a Latin headline is 21 % wider in the fallback font). `direction.md` asks the reviewer to write the three defects into `reviews/notes.md`, to measure the smallest text, and to look at both ends of every cut. Both came from a fresh agent making a company film from the published skill alone.

## 0.28.1

**Changed**

- **A guide for directing a film, `reference/direction.md`** (renderer-neutral; linked from `SKILL.md` "For a film", pitfalls 101–102, recipe `two-formats`). Write `brief.md` (real assets with paths; if a needed asset is missing, stop and ask instead of drawing a fake), `style-guide.md` (taken from the real source, a motion rule per class of object) and `shotlist.md` (a row per beat with entry and exit state) before any composition; keep the files in a studio folder; put every cut on a bar line; review the rendered frames cold (the three largest defects, each with a timestamp, evidence and a local fix); make the formats the human asked for (one if they did not say; a vertical cut is its own composition, `?f=9x16`, `--query f=9x16`). Came from making two 32–45 s company films (16:9 and 9:16) from real websites' photos and copy, and from a published breakdown of building a code-rendered video studio (@0xwhrrari, rewritten, credited in the file).

## 0.28.1

**Added**

- **`musicEvents(music)`: what a score plays, as data.** Every note and chord with its `beat`, `time` (seconds, tempo map applied), `duration`, `bar`, `beatInBar`, audible `midi` pitches and the `name` the score gave it, and every drum hit with the pattern repeated out. The picture can follow the score (light the keys that sound, caption the chord (`name` is as written; `midi` is what sounds, transpose included)) without analysing audio. A score that cannot play throws with the reason.
- **`music.meter`** (beats in a bar, default 4, 1–16): it names the bars in `musicEvents()` and in the `check` read-back; playback does not use it.
- **`check` reads a music layer back.** A `music` block per layer: its length in bars per track (a track that ends early, or has a short bar, is named), the names that start in each bar with their beat (`Am(2)` starts on beat 2), and the drum spans, so an author can verify a score without listening. `movie.inspectAudio()` sources carry the same summary (`source.music`).
- **The music docs say what the author had to guess**: drums repeat by themselves and `from` / `to` are beats; a plain capital is a major chord; sharps and flats; which octave each instrument sits in; `swing` moves only off-beat notes (a comp on beats 2 and 4 stays straight, and how to write it); pitfall 100. Found by fresh Sonnet and Haiku authors writing six scores from the old docs: all but one passed first time, but nearly every one said it could not check bar lengths, drum spans or pitches without hand counting.
- **`Sequence` is exported, so a layer type can be written outside the library** (`registerSequenceType` was public, its base class was not). A subclass builds a Pixi display object in `build()` and may draw each frame in `awaitFrameAt(local)`; keyframes, filters, masks and the lifespan then work on it like on the built-in layers. See "Your own layer type" in `docs/api.md`.
- **A gallery piece with d3 (51 now): `d3-story`.** d3 computes the numbers (scales, `line`, `area`, `pie`, `arc`, `geoPath`, a seeded `randomLcg`) and pixi-effects performs them: bars that count up, a self-drawing line, a donut, a world map with great-circle routes. It imports `d3` and `topojson-client` through the import map; the library did not change.
- **A gallery piece with Rough.js (52 now): `sketch-launch`.** Rough.js makes the wobbly outlines and hachure fills as path data; pixi-effects draws them on (`trimEnd`), lifts the rocket off as one composition and flips three flame drawings like a flipbook. It imports `roughjs` through the import map; the library did not change. (Rough.js's `dots` fill ignores its `seed`, so two exports differed: the page uses `cross-hatch`.)

## 0.27.2

**Changed**

- The footer link to the author's X page now reads "Author on X" (it said "Updates on X"), and the README says only who made it.
- **The music is made more than twice as fast, with the same samples (to the last bit).** The reel's 80 seconds: 4.45 s to 1.9 s in Node, the sound stage of its load 4.9 s to 2.5 s in Chrome (the whole load 7 s to 4.4 s). The electric piano no longer computes the 1.2 s of silence after each note; what depends only on the pitch and the sample index (the exponentials and the modulator sines of the electric piano and the bell) is computed once per pitch for the render and shared by its notes; a track is filtered and mixed only where it sounds (and until its filter has run out); the volume curve is followed instead of searched; the five saws of the pad, the drums' writes and the reverb are plain loops; the long loops of the mix run outside the generator that slices the render. Four checksums of full renders (two with `loop`) taken before the changes are pinned in tests, and the reel's own checksum was checked.

## 0.27.1

**Fixed**

- **The load of a long movie no longer freezes the page, and the loading number moves through the sound.** The music was made in one piece (4.4 s of blocked page for the 81-second reel); it is now made in slices that hand control back every 50 ms (`renderMusicAsync`; the samples are the same ones as `renderMusic`'s, a test compares them), and the sound stage reports how far it is (the number used to sit at 75 % until the end). On the landing page the reel's loading line says the stage and the percentage, with a bar.
- **The landing page's "A real piece, live" plays in front of its poster** (the poster stayed on top of the frame, with the piece playing behind it).
- **Gallery: Matchday Graphics' two team panels meet on the seam** (a wedge of blue showed to the left of the gold blade).

## 0.27.0

**Changed (breaking)**

- **The library no longer uses GSAP.** The timeline is the library's own (`src/core/pure/`): a value at a time is computed from the script and the time alone, never from the way the playhead came to it, so scrubbing, looping, reverse play and export all give the same picture at the same time. `gsap` leaves the peer dependencies (`npm install pixi-effects pixi.js`), and every page loses the `gsap` and `gsap/PixiPlugin` lines of its import map (a page that still has them works; nothing imports them). Measured against the GSAP build on 92 pages by frame hash: 77 identical, 9 within 3/255, and the rest explained (four pages use `expo`, whose formula differs between GSAP 3.12 and 3.15; one page is not reproducible even with GSAP). The timeline itself is 1.3 to 11 times faster per frame and 25 KB (gzip) lighter for a page; a whole frame is dominated by drawing and changes by 1 to 15 %.
- **`expo` is GSAP 3.15's curve** (`2^(10(p-1))·p + p^6(1-p)`, which lands exactly on 1): up to 0.78 % of the range away from 3.12's, so a page made with 3.12 moves a little.
- **Where GSAP answered by the way the playhead came, the answer is now the script's**: overlapping tweens on one property (the one that started last wins), two items with the same start, a `set` where a tween ends (GSAP could lose it), a `from` after another segment (it ends where that segment ended).
- **`blur`, `blurX`, `blurY`, `blurPadding`, `colorize`, `colorizeAmount`, `colorMatrixFilter`, `lineColor`, `lineAlpha` are no longer keys** (they were GSAP PixiPlugin shorthands for a filter on the layer): the lint says so with the likely name; use a named filter and animate `filters.<name>.<prop>`. `scale`, `anchor`, `pivot`, `skew` (degrees), `rotation` (degrees), `position`, `tilePosition`, `tileScale`, `tint` and `autoAlpha` stay.
- `ease` names are the familiar ones (`power1…4`, `sine`, `expo`, `circ`, `back`, `elastic`, `bounce`, `steps(n)`, `spring…`, `cubic-bezier(…)`); a name nobody knows still warns and runs as `power1.out`. `delay` in a keyframe's vars moves its start; `onStart`, `onComplete`, `onRepeat` and `onReverseComplete` are said once and ignored.
- `movie.timeline` is the library's `Timeline` (`time(t)`, `duration()`, `segments()`), not a GSAP timeline.

**Added**

- `ease(name)` is exported: the function behind an ease name.
- Colour strings that Pixi can read (names, `hsl()`, `oklch()`) interpolate in `'rgb'` colour space as rgba.

## 0.26.3

**Added**

- **Sound-only export.** `render({ format: 'wav' })` (16-bit PCM) and `render({ format: 'ogg' })` (Opus) write the movie's mixed sound without drawing a frame, with `range` cutting it; `pixi-effects render page.html -o mix.wav` does it from a script. A movie with no sound says so instead of writing an empty file.
- **Video codec and bitrate options.** `render({ video: { codec, bitrate, hardware, keyFrameInterval } })`: `codec` is `avc`, `hevc`, `vp9`, `av1` or `vp8` (checked against the container and against what this browser can encode: the usual one falls back to the next that works with a warning, a codec you name is used or the error names the one that would work, and `h264` gets a did-you-mean); `bitrate` is a quality name or bits a second (`8_000_000`, `'8M'`, `'800k'`); `hardware` picks the encoder; `keyFrameInterval` (seconds, default 2). The render command gains `--video-bitrate`.
- **Relative keyframe values.** `to`, `from` and `set` accept `'+=36'` / `'-=36'`, measured from where the layer stands, with an expression on the right (`'-=GW*0.1'`): `from: { x: '-=36' }` is the usual slide-in, `to: { y: '+=40' }` a nudge, and keyframes one after another stack in any order of seeking. Until now `'+=36'` was evaluated as an expression and became **0 with no warning**; in `initial`, a style or the start of a `from` + `to` it now warns and is read as the number. (GSAP supported relative values all along; the keyframe pipeline did not let them through.)

**Changed**

- **Video: the pauses of reverse play and of a loop are read ahead.** A looping layer reads the first frames of the file (and a pass behind them) before the end comes, so the wrap shows no pause (a 30 s loop of two heavy layers: 0 pauses, it had 3). Reverse play reads the next window in the background while the held frames last, and each window now just fits what is held: one heavy layer played backwards shows 29.3 distinct frames a second with 1 pause in 6 s (24.8 and 6 pauses without the read-ahead, 14.1 and 31 before 0.26.2); four heavy layers, each reading its own window, reach 18 a second. Frames are now let go by where the playhead is (the ones it has passed first), not by age. Measured with the on-screen frame-number method of 0.26.2, on an M1 Pro.

## 0.26.2

**Fixed**

- **`music`: `G7`, `A7`, `E7`, `Bb7`, `C6`, `C5`, `D9` were read as single notes** (`G7` = the note G in octave 7, about 3 kHz) instead of chords, with no warning, and the documented example `G7:4` had the bug. The rule is now one line: **a capital letter starts a chord, a lowercase one is a note** (`G7` the chord, `g7` the note). A bare note in capitals (`Bb2`) is refused with its lowercase spelling (`bb2`), inside brackets any case is a note, and an unknown chord kind suggests the nearest (`Cmin7` → `Cm7`, `Csus` → `Csus4`). Scores that wrote notes in capitals (the gallery's spring-marquee did) need lowercase.

**Changed**

- **Video layers read frames in one decoder pass, not one seek per frame.** A render with a video layer is much faster: 1080p, 8 s, one layer 10.6 s → 6.1 s (the same as no video), four layers of one file 22.5 s → 6.8 s, reverse playback 11 s → 6.7 s (measured on an M1 Pro; a `getSample` per frame cost 19-25 ms, a pass under 1 ms). The pictures are the same (a snapshot of 125 frames in order, out of order, at speed 2 / 0.5 / -1 and looped matched the old reader byte for byte). Live playback is smoother too (measured by reading which frame is on screen every animation frame, 1080p, 6 s): the old reader fell behind as soon as the footage was heavy or there were several layers (one heavy layer: 79 % of the frames late, 14.5 distinct frames a second; four heavy layers: 95 % late, 6.6 a second); the new one keeps 30 a second in every case tried (0 to 0.3 % late), and a 30 s loop with two heavy layers showed no warning. Dragging the playhead forward costs about 4 ms a step instead of 62 ms; a far jump (a seek) is one frame as before (about 65 ms on heavy footage); reverse play and dragging backwards are much faster on average but still pause for 0.1-0.2 s about every 30 frames and at each loop wrap. A video layer now holds decoded frames up to about 96 MB (never fewer than 3) instead of 30 whatever the size, so a 4K layer no longer holds hundreds of MB.

## 0.26.1

**Fixed**

- The skill's `description` had a colon-space, which the `skills` CLI refuses ("Nested mappings are not allowed": no skill found); fixed, and a test reads the frontmatter as a plain YAML scalar.

**Added**

- **Loading progress.** `movie.init()` reports how far it is: a `loadprogress` event (`{ stage: 'assets' | 'build' | 'sound' | 'frames', loaded, total, progress }`, `progress` 0 to 1) and `movie.loadStages` (milliseconds per stage). The page's `.pe-loader` shows it by itself: a bar along the bottom (`--pe-progress`) and a label such as `BUILDING LAYERS  62%`; the build now lets the page paint every 50 ms. `pixi-effects check` prints a `loading` line with the time of each stage and names the slowest when the load took a second or more. The template links the library with `modulepreload`, so the download overlaps the page parse.

## 0.26.0

**Added**

- **Agent skill.** `npx skills add yjmtmtk/pixi-effects` registers pixi-effects as a skill in Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode and about 70 more agents; its description starts from the task (a video, motion graphics, an animated title, a lower third, a promo, a chart), so an agent can reach it without being told the library's name. Claude Code also installs it as a plugin (`/plugin install pixi-effects --marketplace yjmtmtk/pixi-effects`).
- **`pixi-effects` bin** (named like the package): `npx pixi-effects check my-video.html`, `npx pixi-effects render … -o x.mp4`, `npx pixi-effects view …` run the same three tools with nothing installed, and a mistyped command says which one you meant. The three `pixi-effects-check|render|view` bins stay; `npx pixi-effects-check` on its own never worked (npm looks for a package of that name), the docs now say `npx pixi-effects check`. **Fixed:** the three tools printed nothing and exited 0 when npm started them through its symlink (`./node_modules/.bin/pixi-effects-check`); they now run.
- **`movie.audioBlocked`**: true while the browser keeps the movie's sound silent until a tap (iOS Safari); a player can then ask for the tap. The landing page does: the reel and the gallery pieces start with one tap inside the frame when the sound is locked.

**Changed**

- The skill moved from `ai/` to `skills/pixi-effects/` (`SKILL.md`, `template.html`, `reference/`, `scripts/save-image.py`); `ai/` keeps the chat guide and the tools. Old links to `ai/SKILL.md`, `ai/reference/*` and `ai/template.html` no longer exist. The skill's commands are `npx pixi-effects-check|render|view`.

## 0.25.0

One release holds three milestones that were built one after the other: **composition** (named mattes, the luma wipe), **light** (lights, shadows, fog) and **freedom of drawing** (the shader layer, the `warp` filter). Wipe, iris and dissolve transitions now also work on WebGL (they drew nothing there before).

**Added**

- **Light, shadows and fog for 2.5D.** A `{ type: 'light', kind: 'ambient' | 'point' | 'spot' | 'parallel' }` layer (a carrier like the camera: its numbers go in `initial` / `keyframes`) lights every `threeD` layer of its composition, per pixel, in the layer's own mesh shader (no extra pass; GLSL and WGSL): Lambert shading with `falloff` (`none`, `smooth`, `inverseSquare`), a spot's cone and feather, a sun. `lit: false` opts a layer out. Shadows need `castsShadows` on the light AND on the layer: hard by default, `shadowDiffusion` for a penumbra that widens with distance, up to 4 casters per receiver, the strongest wins. The camera takes `fogNear` / `fogFar` / `fogColor` / `fogAmount` for depth fog. A composition with no light and no fog builds nothing and draws the same picture at the same cost: frames of all ten `threeD` pages of the repository are pixel-identical before and after. Checked against an independent JS reference (every pixel within 2/255) on WebGPU and WebGL for every kind, the falloffs, a card turned on two axes, a card seen from its back, fog, shadows (hard, soft, two and four casters, a turned caster), and together with depth of field, blend modes, the layer's own filters, cards, nested and time-remapped compositions and colour keyframes. Cost at 1080p on one machine: lights add 1 to 2.6 ms; soft shadows are the expensive part (3 soft lights over 20 layers: about 20 ms). Warnings, said once at build with a fix: no ambient light, a half-set `castsShadows`, too many lights or casters (which are dropped), 3 or more lights with soft shadows, misplaced keys and aliases (`target` → `lookAtX/Y/Z`, `angle` → `coneAngle`, `castShadows` → `castsShadows`, `intensity: 80`), `fogFar` not beyond `fogNear`. `movie.inspect` gives each lit layer a `light` number and `check --at` prints them most lit first.
- **Shader layer.** `{ type: 'shader', fragment, uniforms, width, height, resolution, transparent }` draws a Shadertoy `mainImage` (GLSL ES 3.00) as a layer: `iResolution`, `iTime` (the layer's own seconds; a time-remapped composition's clock inside it) and `iFrame` are declared for you, and so is every `uniforms` entry (a number is a `float`, 2 to 4 numbers a vector, a hex colour a `vec3`); keyframes move them as `'uniforms.speed'` and `'uniforms.tint.0'`. It is a layer like any other: masks, named mattes (it can be a matte too), filters, blend modes, `threeD` and lights work on it. Every shader layer draws with ONE shared WebGL2 context (a context per layer would hit the browser's limit of about 16) and copies the result into a canvas of its own; a lost context is made again on the next frame. A compile error is reported in the author's own line numbers (`line 2: 'x' : undeclared identifier`) and the layer is a magenta checkerboard, never a silent blank. Static warnings with a fix: no `mainImage`, `gl_FragColor`, `texture2D`, `varying`, `#version`, a declared built-in, `iMouse` / `iChannel` / `iDate` (not provided), a `while` loop or a `for` with a bound that is not a constant, a bad `uniforms` value or name, `resolution`, `transparent`. Checked on WebGPU and WebGL: pixels against the formula, every seek order identical, error lines, transparency (premultiplied), layers of different sizes on one context, a rebuilt movie, a lost context, masks, mattes, filters, blend, `threeD`, lights, export. Cost in a prototype at 1080p on one machine: 20 small heavy shaders +11 to +17 ms a frame, one full-size shader about +10 ms. No `iChannel` textures, mouse or feedback in this version, and a shader cannot read what is behind it (it is a layer, not a filter).
- **`warp` filter.** `{ type: 'warp', kind: 'wave' | 'haze', strength, scale, speed, angle, seed }` bends a layer's picture: a travelling wave (water, a flag) or drifting noise (heat haze). Its own GLSL and WGSL, a pure function of the frame's time through the same `TimeFilter` hook as `grain` (the sub-frames of a motion-blurred frame share one time), padded by `strength` so a shifted edge is not cut, options animated by the filter's name. Checked stripe by stripe against a JS reference on both backends (a worked-by-hand wave and constants from an independent implementation of the integer hash for `haze`). Aliases `distort`, `displace`, `ripple`, `wavy`, `heatHaze` point to it.
- **Docs and examples:** `docs/dsl.md` (`shader`, the filter table and a distortion paragraph), the cheatsheet, SKILL, recipes `shader-plasma` and `warp-water`, pitfalls 89–92, the guide "Shaders and warps", Playground example 20, and a gallery piece (50 now): `shader-garden`, four formulas and no pictures (a flowing field under a title bent like water, contour lines of a noise terrain seen only through letters, ripples through a disc), made by a Claude Sonnet 5.5 subagent from the docs alone (its notes are in `examples/gallery/_notes/`; the two gaps it found are fixed: a mask cuts what the shader drew and does not move the pattern, and a small shader layer sits by its top-left corner).
- **Docs and examples:** `docs/dsl.md` (Lights, Shadows, Fog), the cheatsheet, SKILL, recipes `spot-room` and `fog-depth`, pitfalls 85–88, the 2.5D guide, Playground example 19, and a gallery piece (49 now): `spotlight-room`, a dark room where one tight lamp picks out three pictures and they throw shadows on the wall, with slow camera and depth fog (made by a Claude Sonnet 5.5 subagent from the docs alone; its stumble notes are in `examples/gallery/_notes/`, and the gaps it found are fixed: the size of a spot's pool and the card that hides it, a hard shadow reading as a slab, how to build a floor, the `check` light line cut at 8 layers).

- **Named mattes.** A layer can be named and used as the `mask` of any number of layers in the same composition: `mask: 'band'` (the matte reads its opacity), `mask: { layer: 'band', channel: 'luma', invert: true }` (its brightness, Rec. 709; the opposite) and a list `mask: ['panel', { layer: 'hole', invert: true }]` (an intersection; subtracting a matte is inverting it). The matte layer itself is not drawn: it is drawn once per frame into a texture (so three layers sharing a moving matte cost one pass for the matte) and a `MatteFilter` cuts each layer that names it. `blendMode` works with every matte. Warnings, said once at build with a fix: a name nobody has (did-you-mean), the same name twice, a matte that is not alive for as long as its users (they would vanish), a `threeD` matte or a masked `threeD` layer, a matte with a mask of its own, `maskInverted` written with a named matte, a `channel` that is not `alpha` / `luma` (`luminance` → `luma`), a masked layer with a `parent`, and more than 8 mattes in one composition (each is a texture the size of the composition: about 8 MiB at 1080p). `inspect` skips matte layers.
- **Luma wipe.** The transition `{ kind: 'luma', from, to, at, duration, map, softness, flip }` follows a brightness map: dark parts change first. `map` is `'linear'`, `'diagonal'`, `'radial'` (computed on the GPU from the position on screen, a circle whatever the aspect ratio: no image, no canvas) or the name of a grayscale image asset; `softness` is the soft band (0.1), `flip` reverses it. An unknown map name warns once with the closest built-in. A layer a transition wraps keeps its named matte.
- **A gallery piece for mattes and the luma wipe** (48 now): `matte-reel`, one moving matte shared by gradient "photographs", hairlines and captions, an inverted hole, a headline that blends in through a luma ramp, a multiply band, and a luma wipe (with a venetian-blind map drawn on a canvas) to an end card (made by a Claude Sonnet 5.5 subagent from the docs alone; its stumble notes are in `examples/gallery/_notes/`, and the two gaps it found are fixed in the docs: outside the matte layer's shape the matte is 0 for `luma` too, and a whole composition can be the masked layer).
- **Docs and examples:** `docs/dsl.md` (Named mattes and luma, `luma` transition, blend rule 10), the cheatsheet, SKILL, recipes `shared-matte` and `luma-wipe`, pitfalls 81–84, the transitions and images guides, and Playground example 18.

**Changed**

- **Inverted masks (`maskInverted`) and text, image and video masks now go through the matte filter** (the same one as a named matte); a plain shape mask that is not inverted stays the stencil (the cheapest, hard-edged). The `AlphaMask` code, the `erase` wrapper group of 0.22 and the warning "a text mask with a blend loses the blend" are gone: **`blendMode` now works with every kind of mask**. Measured before and after on the 16 gallery and example pages that use masks (frames at 0, 25, 50, 75 and 99 %): 14 are pixel-identical (largest difference 0 to 1 of 255), `ma` differs in 10 edge pixels (largest 11 of 255), and the `05-composition-mask` example now draws its `maskInverted` hole correctly inside a nested composition (it was cut off at the bottom, and missing in the last frames).

**Fixed**

- **Wipe, iris and dissolve transitions did nothing on WebGL**: their fragment shader declared the frame uniforms without `highp`, so it did not link ("Precisions of uniform 'uOutputFrame' differ between VERTEX and FRAGMENT shaders") and the transition drew nothing (WebGPU, the default, was fine). The transitions are now tested on both backends.

## 0.22.0

**Added**

- **Blend modes: 18, the CSS names.** `blendMode` takes `overlay`, `soft-light`, `hard-light`, `color-dodge`, `color-burn`, `darken`, `lighten`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` and `linear-burn` besides `normal`, `add`, `screen` and `multiply`. They are our own blend filters, checked against the W3C formulas on WebGPU and WebGL (within 2/255: measured worst 0.5/255 at alpha 1 and 1.5/255 at alpha 0.5), in a separate chunk that a movie loads only when a layer uses one (nothing changes for the others), and they work on a layer with filters, on a `threeD` layer (after the depth-of-field blur) and on a composition (each child blends). A typo (`softlight`, `soft_light`) says what was meant; 10 or more on screen at once warns (about 2 ms each on WebGL in the author's measurement). The recipe `light-leak`, pitfalls 78–80, Playground example 17, and the gallery piece `light-leaks` (47 now: a dusk city told by five blend modes, made by a Claude Sonnet 5.5 subagent from the docs alone; its stumble notes added to the docs that `soft-light` / `overlay` need a mid-tone backdrop, that `color-dodge` over dark gives a saturated colour and that `blendMode` is not animatable).

**Changed**

- Blend modes: the same blend-mode mistake in many layers (particles make hundreds) is one warning with a count, not hundreds; an advanced mode while the blend filters are not registered warns on a layer with no filters too (Pixi's own message used to be the only one); if the `blendModes-*.js` chunk cannot be loaded the movie still plays (a warning, the advanced blends drawn normal) instead of failing to load; `linear-dodge` / `plus-lighter` (add), `luminance` (luminosity) and `exclude` (exclusion) are understood in the did-you-mean; the many-blends warning follows a negative `at` correctly and counts through nested compositions (a card with three blends in it, five cards on screen together: fifteen); the blend filters, groups and carriers a composition made are destroyed with it.

**Fixed**

- `blendMode` together with `maskInverted` rendered the layer black (the layer is drawn into a texture for the alpha mask, and its blend applied inside that texture against nothing; wrapping it in a group with a blend filter did not help either, because Pixi 8.22 skips a parent's filter when an alpha-masked layer is inside). A layer with both is now built as a group whose filter blends, with the mask shape drawn over the layer with the `erase` blend; it works with every mode on WebGPU and WebGL. A **text, image or video** layer as a (not inverted) mask still cannot carry a blend: it warns and draws the layer normal. A mask with filters of its own (a feathered hole) works too.
- Depth of field: a layer that was hidden (its lifespan over, `alpha` 0) kept the depth of the last frame it was drawn, so it was still counted as blurred: the "N layers are blurred" warning could fire for a movie that had only two layers on screen, and `inspect` returned a different `depthBlur` for the same frame depending on how you had got there. And `focus` could not name a layer called `hero card` or `3d-title` (only names shaped like a word): any name a sibling layer has now works.

**Changed**

- Depth of field warns about more mistakes: a negative or non-numeric `aperture` (it was silently off), two layers with the name `focus` points at (the first `threeD` one is used, as before, and now the check and the build agree on it), and `focus` / `aperture` written on a layer that is not a camera.
- `check.mjs --help` prints the usage (it was rejected as an unknown option), and `--at` prints each threeD layer's blur at every moment you name (`depth  2.40s — title 0 px, badge 10.12 px, …`; all of it is in `report.json` as `at[].depthBlur`).
- **Docs:** a dolly with no typed home distance (`offsetZ` on an automatic `z`, or the expression `H / 2 / tan(20 * PI / 180)`), how big a bokeh card must be to fill the frame at a depth (`(W / s) × (H / s)`), pitfall 77.

## 0.21.0

**Added**

- **Three gallery pieces made by Claude Haiku 5.5** (45 with them; the model name is the authors' own report): `replay-highlight` (a sports replay: live, a wipe, then the same shot in slow motion with a freeze and a drawn-on arc, one composition with its own clock), `piano-roll` (a four-bar tune written as text and falling down a piano roll, the bars and the score built from one array) and `departure-board` (a vertical split-flap station board in Japanese and English). They were made from the docs alone and left as the authors made them; their stumble notes are in `examples/gallery/_notes/`. The gallery lists `haiku` as a fourth model.
- **Depth of field.** The camera takes `focus` (the plane that is sharp: a `threeD` layer's name or a z) and `aperture` (how shallow; 30 by default, 0 = off): `threeD` layers blur with their distance from the focus, with a disc ("bokeh") blur, and a rack focus is an ordinary keyframe on `focus`. Free when unused. Warnings for a layer name that is not there (with did-you-mean), a layer that is not `threeD`, a focus behind the camera and a crowd of blurred layers; `inspect` reports each layer's blur (`depthBlur`).
- **A gallery piece for depth of field** (46 now): `rack-focus`, a shallow-depth still life where the lens racks from a badge to the title to a sign that resolves only when the focus lands on it (made by a Claude Sonnet 5.5 subagent from the docs alone; its stumble notes are in `examples/gallery/_notes/`). Playground example 16 is a rack focus too.

**Docs** (from those stumble notes, each checked before it was written): where the animatable props go (`initial` / keyframes, not the top level of a shape), what `duration` means on a composition with its own time (with an example), dashes (alternating sub-paths and `trimEnd`), `volume` above 1 for an sfx, the keys of `inspectAudio().windows`, how to find the onsets of a `music` score, `grid: 2` for 3/4, and a measured loudness of a music bed.

## 0.20.0

**Added**

- **Time remap: `speed` and `time` on video, audio-file and composition layers.** `speed` is a fixed multiplier on the layer (`2` twice as fast, `0.5` slow motion, negative backward; with no `duration` a video or audio file lasts its length ÷ |speed|). `time` is the layer's own clock as an ordinary animatable property, in seconds of its content (a file's position, a composition's local playhead), in `initial` and `keyframes` with every keyframe word (`at`, `duration`, `ease`, `repeat`, `yoyo`, `from`, `to`, `set`): a freeze is the same value twice, a loop is `repeat`, a rewind is `to: { time: 0 }`. A negative `time` counts back from the end of the content. **A composition with its own time** plays the layers inside in its local seconds (their `at`, `duration` and keyframes are written in it; the composition's own `at`, `duration` and keyframes stay in the movie's time, as in After Effects' pre-composition time remap); everything inside follows: particles, grain, springs, gradients, cameras, nested compositions and videos, sounds and `sfx`. The sound follows like a tape (the pitch moves with the speed; no time-stretch).
- **`cubic-bezier(x1, y1, x2, y2)` easing**, the CSS curve exactly, no plugin (`ease: 'cubic-bezier(.2, .8, .2, 1)'`, a fast start with a long glide). A malformed one warns once and runs as `'none'`.
- **The mistakes of the new keys are warned about, with what to write:** `speed` of 0 or not a number, `speed` together with keyframed `time` (`time` wins), `speed` in `initial` or a keyframe (it is a setting: animate `time`), `speed` / `time` on a layer that cannot have them (a shape, text, an `sfx`: its `pitch` is in semitones), other names (`playbackRate`, `timeScale`, `rate`, `reverse: true`, `timeRemap`), and a layer inside a remapped composition that its clock never reaches (`at: 3` in a 4 s composition at `speed: 0.5`).
- **The timeline says which times are local.** `movie.timelineData()` rows and transitions inside a remapped composition carry `local` (`stage ×0.5`, `stage time keyframes`) and are in that composition's seconds; the chart's tooltip says so; `--at inner@end` for such a layer says to name the composition; `inspect()` reads a remapped composition's transition windows in its own time; `inspectAudio()` reports a sound inside one when it plays in the movie (every pass, forward, backward, replayed), and an `sfx` that its composition's clock never lets finish is reported as cut off by the clock, with how far the clock reaches (it used to be blamed on the end of the movie).
- `transitions` inside a composition with its own time are measured against its content (in its local seconds; a negative `at` counts back from the end of the content), and a frame-driven layer (`pixi-effects/three`) inside one is asked for the composition's local time.
- Playground preset 15 (rewind and replay a title), the recipe `rewind-and-replay`, pitfalls 69–73, and the guide (Motion: Time; Images and video).
- **One gallery piece for the new feature** (42 now): `rewind-title` ("Again.": a title card is built, rewound like a tape with its sounds running backward, held on an empty frame and replayed in slow motion; one composition with its own clock, an on-screen display that keeps real time). Its author worked from the docs alone, and its stumble notes corrected them: `cubic-bezier(.2, .8, .2, 1)` is front-loaded (half of the change in the first 13 % of the time, 99 % by 74 %), GSAP's `power2` is a cubic (`power2.in` has done 12.5 % at half time), what children of a `time`-keyframed composition default to, and what `inspectAudio` reports for a remapped sound.

**Fixed**

- A video frame was looked up by a time rounded to a millisecond, so two different times could share one cached frame and the answer depended on which was asked first; it is a microsecond now. A time that is a frame boundary up to float noise (k / 30) could pick the frame before it; it is nudged by 5e-5 s. A looping video wraps a negative time.
- `grain`: the grain frame of a time exactly on a boundary (k / fps) could be the previous one when the time had passed through a remapped clock (gsap rounds time to about 1e-8 s); the slack is a thousandth of a grain frame.

**Measured (headless Chrome, M1 Pro)**

- A video under `speed` 2, 0.5, 0.37, −1, a ramp, a freeze, `yoyo`, `repeat`, `initial.time`, a negative `time`: the clip frame shown is the one the clock says (within one frame) and every seek order (forward, backward, two shuffles) gives the identical picture; the export, played back, shows the same frames.
- A composition at `speed` 2, −1, 0.5 and a keyframed loop + hold + backward ramp, holding `to` / `from` / `set` keyframes, a gradient, a spring and a nested video, equals the unremapped composition at the mapped time (largest difference 60/255 allowed, on antialiased edges) and every seek order is identical; the same for particles, grain, a threeD card with a camera, and (up to 6/255) motion blur.
- Sound, a 440 Hz tone: `speed: 2` → 880 Hz, `speed: 0.5` → 220 Hz; a 200 → 1000 Hz sweep played backward starts at 950 Hz and ends at 250 Hz; a held `time` is silent (RMS 0); an `sfx` inside a composition at `speed: 0.5` is exactly half as high.
- Cost: a composition of 200 layers takes 0.47 ms a frame plain and 0.46 ms with its own time (0.45–0.48 ms with `speed: 1`, `time` keyframes or two nested remaps; two runs).
- `cubic-bezier` is within 9.8e-7 of Chrome's own CSS easing (12 curves, 1001 samples each).
- Sound that is not remapped is unchanged: the mix checksum of a three-sound test mix is pinned; 25 of the example and gallery pages with sound mix to the identical samples before and after (the 10 music pages differ at the 7th–8th digit of the sum, and so does the previous build from one run to the next: Web Audio float noise).

**Known limits**

- No time-stretch: the pitch follows the speed. Speeds above 2 are not low-pass filtered (aliasing).
- A composition has no `loop` (an audio or video file does): loop its time with a finite `repeat`.

## 0.19.0

**Added**

- **Spring easing.** `ease: 'spring(mass, stiffness, damping)'` (defaults 1, 100, 10) or a preset (`spring.gentle`, `snappy`, `bouncy`, `wobbly`, `slow`), and `duration: 'auto'` = the time the spring takes to settle (within 0.5 %). Closed form (no integration, no dependency), so a seek in either direction gives the same value; checked on a real browser: every frame is identical forwards, by jumps and backwards, and a spring slider overshoots its target and rests on it. The presets settle in 0.72 s, 0.42 s, 1.08 s, 1.61 s and 1.29 s. A malformed spring (`spring(1, 170`, `spring.floppy`) is reported once with what is wrong; `'auto'` without a spring warns once; a `stagger` ease may be a spring (its delays are held inside the spread). `spring(1,170,26)` is critically damped and does not bounce (damping ratio 1): use `spring(1, 170, 12)` or a preset.

- **`fillGradient` can be animated, on shapes and on text.** A keyframe's `set` / `from` / `to` takes a partial gradient (`angle`, `center`, `innerRadius`, `radius`, `stops`; what is left out stays); stop colours move through the layer's `colorSpace` (green to magenta is grey in the middle in `rgb` and vivid in `oklch`, measured on a rendered frame). A text layer takes `fillGradient` for its letters (linear only: a radial type, centre or radius is ignored with one warning). One canvas and one texture per animated gradient are repainted in place and given back when the layer is destroyed (50 animated gradients make 50 painters, and not one more after 40 seeks). Mistakes (another number of stops, a mistyped key with a did-you-mean, no starting gradient, `'fillGradient.angle'` / `gradientAngle`, a `type` change, a radial gradient on text) are said once, when the layer is built, not at every seek. Every frame is the same forwards, by jumps and backwards, also under motion blur. Cost, 1080p, headless Chrome on an M1 Pro with its GPU, including a small snapshot read-back: 50 animated gradient rectangles 10.6 ms per frame against 2.8 ms for 50 animated flat colours and 2.4 ms for 50 static gradients; 10 animated gradient texts 10.1 ms against 6.1 ms for 10 solid ones (software GL, `--use-angle=swiftshader`: 85 ms against 39 ms for the 50 rectangles). The static `fillGradient` path is unchanged: moving it onto the painter changed 0.1–0.2 % of the channels by more than 2/255 (up to 35, at the rounded edges), so the two paths stay.

- **`grain`: film grain as a named filter** (`{ type: 'grain', amount, size, seed, fps, color }`, no extra package; on a layer or on `composition.filters`). The existing `noise` is not film grain (frozen pattern, random seed, same strength at every tone, lifts blacks by about 5/255). `grain` is seeded and new every 1/`fps` s (24), weighted to the mid-tones (4L(1−L): blacks and whites are untouched, the mean does not move: under 0.7/255 on mid and dark greys), and uses an integer hash, so the same frame is the same picture reached forwards, by jumps or backwards (also in a motion-blurred frame and in a layer inside a `threeD` card: the grain gets the time of the frame being drawn, not the playhead's), and WebGL and WebGPU draw the same pattern, their 8-bit values agreeing to within 1/255 (0.02 % of the values differ by 1). Measured on a real browser: `amount` 0.08 gives a standard deviation of 20.4 of 255 (0.02 gives 5.1) whatever the `size`; another seed is uncorrelated (|r| < 0.05); under motion blur the sub-frames share one grain frame, so the grain does not average away; a keyframe on `filters.g.amount` moves it. The movie feeds each time filter the moment it draws (a list collected once after the build, not a walk of the stage). Cost at 1080p on a GPU (headless Chrome, M1 Pro, with a small snapshot read-back): 2.2 ms a frame without a filter, 2.8 ms with mono grain, 4.5 ms with `color: 1`, 2.5 ms with `noise`. **Grain costs bitrate:** with the default export settings 3 s of flat 1280×720 grew from 6.9 KB to 9.3 MB (`amount` 0.03) and 22.3 MB (0.08).

- **Keys that do not exist are warned about.** A layer key the layer does not have (`bogus: 1`, `duraton`, `anchorX` on a text layer, `radius` on a rect, `pitch` on an `sfx` layer), a property in `initial` / `set` / `to` / `from` that is not animatable (`alhpa`), and a text `style` key Pixi does not know (`fontSzie`) used to be ignored without a word; each is now one warning per layer and key, with what was probably meant ("did you mean …", "it belongs to a circle shape"). Never an error. The key tables are checked against the spec types by the compiler (a key added to a type and not to its table fails `tsc`, a table name the type does not have fails too), so the warning cannot call a real key unknown; dotted paths (`filters.g.amount`, `three.box.x`) belong to their routers and a layer kind registered elsewhere (`three`) is not checked. **The condition for shipping it was a test that runs all 39 gallery pieces and the 14 numbered examples with no warning at all, and that test found three real mistakes:** `hanabi-night`, `orbit-rig` and `shape-shift` wrote `pitch` on the layer (`{ type: 'audio', sfx: 'click', pitch: 6 }`), where it was ignored, so their sound effects were never pitched; the knob is `sfx: { preset: 'click', pitch: 6 }`. The three pieces are fixed (their sound changes: the pitches the authors wrote now apply). Bad expressions (`fontSize: 'nope'`) were already warned about, at build, with the expression; they are left as they were.

- **Two gallery pieces for the new features** (41 now): `spring-marquee` ("Now Showing": a cinema marquee whose bulbs snap, letters bounce and ticket wobbles on four spring presets, under one `grain`) and `gradient-type` ("Spectrum": a word whose four-stop gradient turns and shifts through OKLCH over four chained keyframes, over two drifting radial glows). Their authors' stumbles went into the docs: the settle time and overshoot of each spring preset (a table in the cheatsheet, the DSL reference and the motion guide), a radial gradient's `center` / `radius` are fractions of the shape and not of the canvas, `music.reverb` is 0–0.6, a pitched sfx keeps its length.

**Fixed**

- A numeric colour (`fillColor: 0xff0000`) tweened in the default `rgb` colour space was interpolated as a number: red to green passed through `0x7fff80` (a bright green) instead of olive. It is now interpolated as a colour, like the CSS strings.

## 0.18.1

**Fixed**

- `animateText()`: a time in `in` / `out` (`out: { preset: 'fade', at: 7.6 }`, also `delay`, `start`) was ignored without a word, so the text stayed until `at + duration` and overlapped what came next (found when an AI wrote it that way). It now warns that the time is ignored and what decides it (an `out` leaves from the END of the layer: set `duration` to the time it must be gone minus `at`); any other unknown key of a tween warns with a did-you-mean. The cheatsheet, the guide and the pitfalls say so.

## 0.18.0

**Fixed**

- `pixi-effects-render --range 5:2` is a usage error (exit code 2, with what to write), not a failed render (exit code 1).
- `pixi-effects-check`: a mistake in `--at` or `--onion` is reported before any of the slow work (no sheet or report is written); a `--at` label such as `a/b@end` can no longer make a folder or an illegal file name.
- A mistyped `ease` that is empty (`ease: ''`) or a family name (`ease: 'Power2'`, which GSAP answers with an object, not an ease) now warns with what to write; before, `Power2` passed silently.
- `movie.inspectFonts()` and `check`: a web font that failed to load fails the check only when a text layer uses it; an unused broken `@font-face` (`failedUnused`) is listed for review. An offline CI page that links web fonts it never uses no longer fails.
- After a range export with motion blur the stage is left on the last frame that was exported, not on the end of the movie.
- A layer the timeline folds into a family row (`pop-1` … `pop-12` → `pop-# ×12`) can be named in `render({ range })`, `--scene` and `--at name@end` (`movie.timelineData()` rows carry `partNames`).
- The docs' motion-blur claim is now a measurement: 4 s of `hanabi-night` (a piece that asks for motion blur) took 14.0 s and 8.2 s as a draft, about 7 s of each being the browser's start-up.

**Checked, nothing to change:** the true peak reads 0.00 dB for a faded 0 dBFS sine from 1 to 18 kHz and +0.06 dB at 20 kHz (a sine switched on abruptly reads up to 0.4 dB higher at 20 kHz: that is real ringing at the switch-on); a test pins it.

**Added**

- **The Playground is rebuilt** ([guide](https://yjmtmtk.github.io/pixi-effects/guide/playground.html)). The editor holds the same block an AI edits in a chat (`ai/chat-template.html` between `EDIT FROM HERE` and `EDIT UNTIL HERE`), so what an AI wrote can be pasted in and what you wrote can be saved as the chat template's page. The movie runs in an `iframe` with no origin (`sandbox="allow-scripts allow-downloads"`: it cannot reach the page or the site's stored data; proved on a real browser) and the page talks to it through eight fixed commands. A problems panel shows what `movie.review()` finds (click to jump to the frame). **Share link** packs the code into the address (`#code=`, deflate + base64url, no server; a link is read, never run, until you press Run; one that unpacks to more than 200 KB is refused). **Save HTML** downloads one page that runs on its own (examples that use the site's own files load them from the site); **Copy for AI** copies the code with a sentence for an AI. Light and dark. The twelve examples are rewritten in the edit-block form and each runs with no warning. Twenty runs in a row leave one frame and raise no WebGL-context warning (a calibration warning raised in the frame proves the test can see it); a run takes 0.2 to 0.3 s for a title and 0.4 to 0.6 s for a piece with a video file (headless Chrome, libraries cached).
- **Ten WebMCP tools** on the Playground (`get_docs`, `list_examples`, `load_example`, `get_code`, `set_code`, `run`, `check`, `look`, `onion`, `render_draft`), registered with `document.modelContext` where the browser has it, so an AI agent in the browser writes, runs, reads the warnings and looks at the picture without a person pasting a red box back. They run one at a time (Chrome runs calls in parallel), a movie that never starts (an endless loop) or never answers is given up on after 70 s / 120 s so the queue cannot stall, content the page's own code can write (warnings, the code) is marked `untrustedContentHint`, and a mistake in an argument is an error result that says what is wrong. Checked on Chrome 154 with `--enable-features=WebMCP`: results are `{ content: [...] }` (text and image), `executeTool` takes the arguments as a JSON string, a tool that throws reaches the agent with no message, so tools return `isError` results instead.
- **`movie.review({ at, strict })` and `movie.resolveAt(list)`**: what `pixi-effects-check` looks at, in the library (frames inspected, problems, things to look at, fonts, the sound, the moments of `at`), so the `check` command, the Playground and the WebMCP tools share one judgement. Running it leaves the movie as it was (playhead and poster). The report of `check` is the same before and after the move: no difference in `inspect`, fonts, `at`, problems and audio on six gallery pieces.
- The chat template accepts an optional `const INIT = { assets: [...], composition: { transitions: [...] } }` in its edit block, merged into `movie.init`.

**Changed**

- `pixi-effects-check` needs a page that loads pixi-effects **0.18 or newer** (it calls `movie.review()`); an older page says so instead of being checked.
- The old `examples/_presets/` is gone (the presets live in `examples/playground/presets/`, in the edit-block form).

## 0.17.0

**Fixed**

- **A text layer used as a mask is the letters, not their bounding box.** `mask: { type: 'text', … }` cut out a plain rectangle (a stencil ignores the letters' alpha), although the docs say any layer works as a mask. It is now an alpha mask: drawn into a texture, so the letters (soft, antialiased edges) are what is kept.
- **`maskInverted` inside a masked group no longer shows the layer outside the outer mask.** PIXI's inverted stencil tests against the empty level, so a layer with an inverted mask inside a masked composition or `null` layer was drawn everywhere the outer mask hides. An inverted mask is now an alpha mask too (inverse = 1 − alpha). Both fixes cost one extra offscreen pass for the masked layer; ordinary shape masks are unchanged (still a stencil), and the two gallery pieces that use `maskInverted` (`ma`, `liquid-flow-title`) render the same before and after in the six frames compared of each (no pixel differs by more than 29 of 255, and almost all by 0).

**Added**

- **Part of the movie, and drafts.** `movie.render({ range: [10, 15] })` (seconds) or `range: 'title'` (a top-level layer's span) exports only that part, picture and sound (the file starts at 0; a cut edge of the sound fades over 10 ms). `scale` (above 0, at most 1) and `draft: true` (half size, low quality, no motion blur) make the picture smaller. `pixi-effects-render` takes `--range 10:15`, `--scene title`, `--scale 0.5` and `--draft`. Measured with the 48 s 1080p film on an M1 Pro (whole command, about 7 s of it the browser's start-up): the whole film 20.8 s, `--range 10:15` 10.4 s, `--draft` 20.6 s with a file 7 times smaller (12.0 MB to 1.7 MB), `--scale 0.5` 19.0 s. **A range saves time; a draft or a scale saves file size** (each frame is still drawn at full size, then copied smaller).
- **`pixi-effects-check` looks harder, and shows a moment or a movement.** It inspects the first and last frame of every scene (a named top-level composition of a second or more) and a frame every 0.25 s, up to 240 frames (a gallery piece went from 59 to 86 inspected frames in the same 3 s; measuring the sound adds time on sound-heavy pieces: `movie.inspectAudio()` takes 1.4 s on the 22 s `christmas-eve` and 3.3 s on the 48 s `ma`, and a whole `check --no-export` takes 3.2 s, 5.5 s and 10 s on `quiet-hours`, `christmas-eve` and `ma`). `--at 3.5,title@end,50%,f120` writes the pictures at those moments (`frames/*.png`, `at.png`); `--onion 1:3` writes `onion.png` (below); `--draft` makes the export a draft; `--query "name=Aiko"` adds to the page address (for a page that reads it, such as a batch of videos). A web font whose file did not load fails the check, and a text layer none of whose fonts is installed is listed for review (`movie.inspectFonts()`).
- **`movie.onionSkin({ from, to, count, scale, as })`**: frames laid over one another into one picture of a movement, the later the stronger. A thing that moves leaves a trail (its path and its easing); what stays still stays itself.
- **Loudness.** `movie.inspectAudio()` also returns `loudness` (`integratedLufs`, `truePeakDb`, `clippedSamples`, `silences`; ITU-R BS.1770, no dependency), `scenes` (the same per named top-level layer), `cues` (when each sound starts) and `notes` (advice that does not fail the check: quiet below −24 or loud above −9 LUFS, a true peak above −1 dBTP, silent stretches of a second or more; web video is typically −14 to −16 LUFS). Clipping, or a true peak above 0 dBTP, is an issue and fails the check. `pixi-effects-check` prints it and writes `waveform.png` (the mix as bars and a peak line, scene edges, numbered ticks where each sound starts). The default level of `music` measures about −19 to −20 LUFS (`christmas-eve` −18.8, a lone tune −19.9), inside that range.
- **Two recipes in the cookbook:** subtitles from an SRT file, and a batch of videos from a table (a page that reads its address plus a shell loop over `pixi-effects-render --query`); both are tested.

**Site**

- **One look for the whole site.** The landing page, Guide, Gallery, Examples and Playground share one set of colours, fonts, header and footer (`site/shared/`), with the landing page's palette as the reference and both the dark and the light theme everywhere. The navigation is the same five entrances on every page (Home, Guide, Gallery, Examples, Playground); on a phone the header is two rows so nothing falls off the screen. `site/README.md` says where everything is and how to change it.
- **The Gallery is rebuilt on those parts.** Same behaviour (filters, the theatre with next / previous, `#id` links); it no longer loads a web font, and its theatre stays a dark room in the light theme. The total running time in its intro no longer prints `47.700000000000045 s`.
- **The Examples entrance is back, as a list of cards** (`examples/examples.json`, including the music lab and the playground). When the landing page became the Pages root it replaced the old list of the numbered examples, and the README's "Live demos" link pointed at the landing page; the README and `llms.txt` now link to `examples/`. A test fails if a numbered example is missing from the list.
- **The landing page moved to `index.html` at the repository root** (the repository root is the site root), so it opens from any static server without symlinks; the preview script and `npm run landing` are gone.
- **The deployed layout is code** (`scripts/stage-site.mjs`, which the Pages workflow runs) and a checker (`scripts/site-links.mjs`) fails the tests when a page has an `href` / `src` / `srcset`, an import-map target or an inline-module `import` that does not resolve to a file of the site (it does not follow links inside separate script or style files). `npm run site` builds that layout and serves it locally. The header, footer and `<head>` links of every page are written from one place (`scripts/site-parts.mjs`, `npm run site:sync`).

**Changed**

- **A mistyped `ease` warns once, with a guess** (`power3.outt`: did you mean `power3.out`). GSAP used to run an unknown ease as its default (`power1.out`): the motion changed and nothing said so.
- **The browser tools no longer make a sound.** `pixi-effects-check`, `pixi-effects-render` and the test suite start their private Chrome with `--mute-audio`, so a piece with sound no longer plays through the speakers while it is checked or exported (the audio is still analysed and encoded as before).
- **The release check runs once.** `npm run release:check` builds, type-checks and runs every test, then stamps the exact committed tree. `npm publish` (`prepublishOnly`) sees the stamp and only rebuilds instead of running the whole suite a second time; with no stamp, or with uncommitted changes, it runs everything as before. `npm run test:fast` runs the suite without the real-browser tests (about 10 s).

## 0.16.3

**Site**

- The landing page no longer undersells speed: it says what was measured (on the author's M1 Pro most gallery pieces export at 105–115 frames per second, 3.5 to 3.8 times real time, the 48 s 1080p film in about 14 s; one heavy particle piece at 21 fps), credits mediabunny's own benchmark against fframes (13.8 s against 17.7 s on one scene, an M4) with what it is and is not, and stops calling fframes "the fast one". The export guide has the same numbers.

**Fixed**

- **The export progress (the "Exporting video…" bar) disappeared when the mouse stood still.** It lives inside the player bar, which fades after 2.5 s of an idle mouse, so a long export looked like it had stopped unless the mouse kept moving. The bar now stays on screen for the whole export (a video or a PDF, also with the Shift+E shortcut), and fades again as usual when the export ends or fails.

## 0.16.2

**Site**

- **A landing page** at the root of the GitHub Pages site (`site/landing/index.html`, replacing the plain list of examples): a hero whose video is the exact snippet shown beside it, running live in the browser after a click; "Start with one sentence" (`Use https://github.com/yjmtmtk/pixi-effects to make a video: …`); what you get; how an AI writes and checks it (contact sheet, timeline); a gallery strip; and an honest comparison with Remotion and fframes (facts read from their own pages on 2026-10-07, with when NOT to choose pixi-effects). A poster in its gallery strip plays that piece in a player on the page (its link goes to that piece in the gallery; the frame shows only the picture: the piece's page is scaled so its canvas sits exactly on the frame, with no scrollbars, measured for all 16 posters at 1440 and 390 px); "A real piece, live" plays on the first click. `npm run landing` builds a local preview. Written by Fable from a fact sheet (`site/landing/FACTS.md`); tests keep it honest (the release it names, the links, its size, no third-party loads).
- **`AGENTS.md`** (and `CLAUDE.md`, which imports it) and a one-sentence start at the top of the README: an AI that is told only "Use https://github.com/yjmtmtk/pixi-effects to make a video" is sent to the right file for what it can do (a shell, or a chat with no shell). Tried with a fresh session given only that sentence: it found its way and made a video.

**Changed**

- **`animateText()` and `splitText()` reject an expression string for `x` / `y`** with an error that says what to write (`x: 640`): `animateText({ x: 'GW/2' })` used to draw nothing, silently, because the letters are measured at build time. The docs now say that `y` is the top of the line. (Found by a fresh AI session given only the repository URL.)

**Fixed**

- **A `threeD` card showed the previous frame after a seek.** A card (a `threeD` composition) is drawn into its own texture before the stage is drawn, but the shapes inside it were only brought up to the playhead after that, so after a jump seek, `snapshot()`, `contactSheet()` and the paused canvas showed a card whose children had animated (a `trimEnd` draw-on, a growing box) as it was one seek earlier: lines half drawn or missing. Seeking the same frame twice hid it; playing forward and the export were one frame late. The layers are now synced first. (Found by the Opus showpiece `ma`, whose gate lines were missing in review pictures.)

**Added**

- **`cameraPath({ points, duration, ease, look, … })`**: a camera flight through `[x, y, z]` points as keyframes (a smooth curve at an even speed; an `ease` such as `'power2.in'` accelerates; it faces where it flies, or a fixed `look`). With the recipe `camera-fly-through`.
- **Camera `offsetX` / `offsetY` / `offsetZ` and `lookOffsetX` / `lookOffsetY` / `lookOffsetZ`**: added to the camera's position and look-at point, so a handheld shake (`wiggle()`) on them never collides with a dolly or an orbit (two tweens on one property overwrite each other).
- **`hideBehindCamera: true`** on a threeD layer the camera passes on purpose: it is hidden quietly behind the camera instead of warning.
- **`trimEach: true`** on a `path` with several sub-paths: every sub-path is trimmed on its own, so they all draw on at the same time (a glyph or logo made of several strokes). The default is unchanged: the trim walks the sub-paths in order as one outline. (From the Opus showpiece's list: it had given every sub-path its own layer.)
- **A showpiece in the gallery: `ma`** (「間 MA — the space between」, 48 s, 1920×1080, by Opus): a kinetic essay about one word, with a corridor of 2.5D gates, a beat of true silence and a score written as text. 39 pieces. Its notes list the library gaps it ran into (a seek redraw bug for 3D cards, `trimEnd` across subpaths, camera paths, a shared mask, grain, an animatable gradient).

## 0.16.1

**Added**

- **`musicBuffer(music, { sampleRate?, duration?, loop? })`**: the sound of `music` as a Web Audio `AudioBuffer`, to play without a movie.
- **`examples/music-lab.html`**: eight tunes written as text (a lo-fi loop, a launch build, a jingle, a thriller opening, three Christmas pieces, and the first test tune), each with its brief, a play / stop button, its score shown as source, Copy score and Save as WAV. Seven of them were written by fresh Claude sessions from the notation guide and a one-line brief. Linked from the guide's Audio page, the README and the examples page.

## 0.16.0

**Added**

- **Music written as text.** `{ type: 'audio', music: { bpm, tracks, drums } }` plays a tune with no audio file: notes (`c4:2`), chords by name (`Am7`, `Cmaj7`, `G7sus4`, `Bm7b5`, `C@4`, `Am7/e`), rests, holds and accents as strings, counted in beats, played by a small built-in synthesiser. Eight instruments (`keys` electric piano, `pluck`, `pad`, `bass`, `sub`, `lead`, `bell`, `musicbox`) and ten drums (`kick snare hat openhat clap rim tom crash shaker sleigh`) as step patterns, with `swing`, `reverb`, a `grid` for 6/8 and triplet feels, `humanize`, `transpose`, per-track `vol` points (a fade or a swell), `pan`, `tone`, `reverb` send, `attack` / `release` / `ring`, drum sections (`from` / `to`), and a tempo that changes (`bpm: [[0, 96], [28, 96], [32, 60]]`, a ritardando). Deterministic, in the exported file at the same moment, its own chunk (movies without music never load it). It lasts its notes plus a tail and ends with the movie; `loop: true` repeats it; at `volume: 1` it peaks at −6 dBFS. Mistakes warn with "did you mean" (an instrument, a drum, an option, a note it cannot read names the track and the token). The sound was approved by ear from a spike: eight tunes written by AI sessions from the notation alone (lo-fi, a heroic build, a jingle, a dark opening, three Christmas pieces).
- **`musicEnvelope(music, { frameRate })`**: the envelope of that music for `react()`: `level` / `bass` / `mid` / `treble` from analysing the very sound the layer plays, exact beats (the kick hits, or every beat) and the starting tempo.
- A gallery piece with a score and no audio file, `christmas-eve` (38 pieces), guide section "Music written as text" in Audio, a recipe, `ai/CHAT.md` section with a tested example, and DSL / API / cheatsheet / pitfalls entries.

## 0.15.0

**Added**

- **A way in for an AI in a browser chat (ChatGPT, Claude) with no shell and no files.** `ai/CHAT.md` is a short guide (the rules that prevent most failures and a worked example) and `ai/chat-template.html` a self-contained starter page that loads only from `cdn.jsdelivr.net` (so it also runs in a sandboxed preview), shows every warning in a red box with a Copy button to paste back to the chat, and has the player bar's download button for the MP4. Tested in a real Chrome under a strict content security policy: no warnings, ready, an MP4 exported, and the worked example runs. The README, `llms.txt`, SKILL and the guide's "Working with an AI" page point to it with a one-paragraph prompt to paste.

## 0.14.0

**Added**

- **`movie.inspectStops({ lookback?, tolerance? })`**: is the picture at each stop still changing? It compares each stop with the picture 3 frames before it and reports the stops where more than 0.4 % of the pixels differ (a stop that lands before its animation ends, so the audience, the page overview and a PDF see it half-finished), naming the stop, its page and what to do. `pixi-effects-check` runs it for a deck and lists the result as a review (`--strict` fails on it). It found a real fault in `quiet-hours` (page four's first stop was a few frames early), now fixed.

**Fixed**

- `pixi-effects-check` no longer prints "audio: Unable to decode audio data" for a movie with no sound: it says "no audio track".

## 0.13.1

**Fixed**

- **A deck's first click played through the stops.** The guide's live demos and the gallery started a piece with `movie.play()`, which ignores stops; for a movie with stops they now call `movie.next()` and stop at the first stop.

**Changed**

- **The stop marks are dots on the seek bar** (they were thin bars): a small white dot with a dark ring for a step, a larger dot with an accent ring where a page starts.

## 0.13.0

**Changed**

- **The `Controller` plays a deck stop by stop.** For a movie with `stops`, the play button, Space and a click on the picture now play to the next stop and pause there (a second press while playing pauses; after the end, play starts again from the first page). `new Controller(movie, { pauseAtStops: false })` plays straight through as before; `movie.play()` itself still ignores stops. Scrubbing and the export resume use the same rule.
- **The stop marks are easier to see**: a taller white mark with a dark outline on the seek bar, and a page start is taller still, with a dot on top.

**Added**

- **`pdf` on a stop** chooses which moment stands for a page in a PDF and in the page overview: `{ at: 4, pdf: true }` is the page's picture, `{ at: 5, pdf: false }` keeps the stop out (default: the page's last stop). With `which: 'stops'` a PDF leaves out the stops flagged `false`; a page whose stops are all `false` is left out of the PDF. `deck()` takes `stops: [1.2, { at: 3, pdf: true }]`, and `pictureStops()` is the helper behind it. `movie.stopImages({ pdf: true })` applies the same rule for your own PDFs.
- **PDF in the player bar's download panel.** For a movie with stops the format list also offers PDF (pages) and PDF (every step); the quality choice becomes the JPEG quality, and the progress bar counts pages.

## 0.12.0

**Added**

- **Audio-reactive visuals.** `audioEnvelope(source, { frameRate, bands, beatBand, beatSensitivity })` analyses a sound (a URL, Blob / File, ArrayBuffer or AudioBuffer) into one value per video frame for its loudness (`level`) and the energy in frequency bands (`bass` / `mid` / `treble` by default, or bands you name in Hz), 0–1 on a perceptual scale measured against the loudest, plus the times of its beats and its tempo. `react(env, { duration, props })` bakes that into keyframes (`base + amount × level`; `band`, `beats` + `decay`, `attack` / `release` smoothing, `invert`, `curve`, `audioOffset`, `loop`), so playback, seeking and export agree. `bpmEnvelope(120, { duration })` is a stand-in with no audio file (kick, snare and hats exactly on a tempo). The gallery piece Night Drive now listens to its music (24 bands mirrored into 48 bars, rings on the real kicks) instead of faking a spectrum on an invented tempo.
- **Presentations.** A composition can say where a presentation pauses: `composition: { stops: [2, { at: 5, page: 'The problem', notes, advance }] }` (a stop with `page` begins a page, the others are steps of it). `movie.next()` plays to the next stop and pauses exactly on its frame (pressed again while playing it skips to that stop), `prev()` jumps back to the previous one, `goToStop(i)` / `goToPage(n)` jump, `movie.on('stop')` says where it landed, and `movie.stops` / `stopIndex` / `pageIndex` / `pageCount` / `currentStop` tell where the playhead is. An ordinary `play()` ignores the stops.
- **`Presenter`** (`pixi-effects/presenter`): the player for it. Arrows, Space, Enter, PageDown, a click, a tap or a swipe move on; back, Home / End, a page number then Enter, B / W for a black or white screen, F for fullscreen, `?` for the list of keys; a page counter, the page name and a progress line that fade out when idle; `advance` for kiosks and `loop`. A movie with stops shown through the **`Controller`** gets a mark per stop on its seek bar and a Present button that hands the page to a Presenter (Esc gives the bar back).
- **The page overview and the presenter view.** In a `Presenter`, **G** shows every page as a picture (arrows and Enter, or a click, to jump) and **P** opens a second window for the speaker: the picture on screen (live), the next picture, the notes of the page, a timer, and Back / Next buttons. The pictures are made once, before the audience sees anything (`start()`, behind a "Preparing…" cover), with the new `movie.stopImages()` (a picture per page, or per stop, leaving the playhead where it was).
- **A deck as a PDF.** `movie.exportPDF()` (one PDF page per page of the deck, JPEG at the canvas size, no dependencies) and `npx pixi-effects-render talk.html -o talk.pdf` (`--all-stops` for a page per stop).
- **`deck({ pages, transition })`**: a talk as one movie. Each page is a nested composition laid out after the one before (its layers use the page's own time), the stops come from the pages, and the transition joins them with the existing crossfade / slide / wipe / … transitions. A gallery piece, `The Quiet Hours`, is a five-page deck (37 pieces now); a new guide page explains presenting.
- **`pixi-effects-check` knows decks.** For a page with `stops` it writes `stops.png` (one labelled picture of every stop, in order), prints the number of stops and pages, and puts them in `report.json` (`stops`).

**Fixed**

- A transition that ends exactly where its layer ends could fail with "not covered by `from`" because of floating-point sums (2.4 + 4.3 is 6.699999999999999): the coverage check now allows 1e-6 s.

## 0.11.0

**Performance**

- **A piece with many layers builds in a fraction of the time.** Every layer now builds its animation in a small timeline of its own, which is added to its parent once finished. Adding thousands of tweens one by one to a single GSAP timeline made GSAP re-measure the whole timeline at every add, so the cost grew with the square of the count: the 700-layer `hanabi-night` took 3.2 s to build with two 1.3–1.6 s freezes of the page, and now takes 0.5 s with none above 170 ms. Positions stay absolute, so every frame is the same.
- **A shared loader.** `pixi-effects/loader.css` (shipped as `dist/loader.css`) and one line of HTML, `<div class="pe-loader" data-label="LOADING"></div>` next to the canvas: a ring, `--pulse` (a breathing dot) or `--bar` (a sweeping line), or `--custom` for a drawing of your own, restyled with `--pe-loader-color` / `-bg` / `-track` / `-size`. It is HTML and CSS, so it is on screen before any script runs, and it animates only `transform` and `opacity`, which the browser runs off the main thread, so it keeps moving while the page builds the piece. `movie.init()` finds it, fades it out when the movie is ready and, if init fails, stops it and says so (`init({ loader })` names another element or turns it off). Every gallery piece has one (`hanabi-night` has a rocket of its own on the shared frame), `ai/template.html` has one, and the guide's player page says how to use it.

**Changed**

- The gallery pieces `orbit-rig` and `shape-shift` were redesigned as pieces first and feature showcases second: an orrery plate in ivory and brass ("Orrery") and a Bauhaus poster in motion ("Form Follows"). Same ids, so existing links keep working.

**Added**

- A gallery piece that uses particles and motion blur (`hanabi-night`: a fireworks festival title card, 36 pieces now), with its demo in the guide.
- **Motion blur.** `movie.init({ motionBlur: true })` (or a sample count, or `{ samples, shutter }`, or the same option on one `render()`, `snapshot()` or `contactSheet()`) exposes every frame over a shutter interval: the frame is drawn several times at moments around its time and averaged, so fast motion smears like on film. It applies to what is made (the export, snapshots, contact sheets, so `pixi-effects-check` shows what the file will have), not to live playback. `pixi-effects-render --motion-blur 8 --shutter 0.5` sets it for one file.
- **`particles()`**: bursts, fountains, snow, confetti and sparks as plain layers. Every particle has its own seeded start, launch angle and speed, size, colour and life, and a path baked into keyframes (gravity, wind, drag, sway), so playback, seeking and export agree. `emit` spreads births over time, `fade` / `scale` shape the life, `shape` is `circle` / `rect` / `star` or any `template` layer, `blendMode: 'add'` makes overlaps glow.

**Fixed**

- **The last frame of an export was empty.** The final frame sits at the exact end of the movie, where every layer's lifespan has just closed, so a layer that lasts to the end vanished in it (the exported video, and the last cell of a contact sheet, ended on a blank frame). That frame is now drawn a hair before the end, so the final composition stays on screen.

## 0.10.0

**Added**

- **Seeded randomness.** Expressions gain `rand(seed)` (0…1) and `noise(x, seed)` (smooth, −1…1), plus `lerp`, `clamp`, `smoothstep`, `mod`, `step` (the way to write an "if") and `PI`. For plain JS, `random(seed)` returns a repeatable stream. The same seed always gives the same picture, in playback, seeking and export.
- **Null layers and `parent`.** `{ type: 'null', name: 'rig' }` draws nothing and only moves; layers with `parent: 'rig'` are drawn inside it and follow its position, rotation, scale and alpha (orbits, clock hands, a whole group fading). Nulls chain; a child's `x` / `y` are measured from the null's origin. A wrong parent (unknown name, not a null, a cycle, a `threeD` layer) warns and the layer is drawn without one.
- **`stagger()`**: delays for a wave of items, GSAP style (`each` or `amount`, `from: 'start' | 'end' | 'center' | 'edges' | 'random' | index`, `grid: [cols, rows]`, `ease`, seeded `random`). `stagger(8, { each: 0.08 })` returns the delays; `stagger(layers, …)` returns the layers with `at` pushed back.
- A gallery piece for the path and text tools (`shape-shift`, 35 pieces now: morphing outlines, a comet on a loop, a title that arrives letter by letter), with the demo in the guide.
- A guide page on these four (`Motion: groups, waves and randomness`, with tested recipes) and a gallery piece that uses all of them (`orbit-rig`, 34 pieces now).
- **Click the picture to play / pause** in the `Controller` (a tap on a phone too), like a `<video>`; the pointer cursor shows it. A tap that only closes the export popover does not also toggle. `new Controller(movie, { canvas, clickToPlay: false })` turns it off.
- **`animateText()`**: per-character, per-word or per-line text animation in one call (`...animateText('Hello', style, { x, y, align, at, duration, in: 'rise', out: 'fade', stagger: { each: 0.05, from: 'center' }, idle: { y: 4 } })`). One text layer per piece laid out like the whole text, entering and leaving in a wave; presets `rise drop fade pop zoom slide spin` or your own `from` / `to`; an optional seeded idle drift; a clear error when `duration` is too short for the wave.
- **`followPath()`**: a layer travelling along an SVG path as keyframes (`keyframes: followPath({ d, duration, ease, orient: true, frameRate: 30 })`), by arc length so the speed is even, one sample per frame, with optional heading (`orient` / `rotate`) that never jumps by a turn, and `from` / `to` fractions.
- **Path morphing.** A `shape: 'path'` with `morphTo` (another SVG path) and an animatable `morph` (0 → 1) turns into the other outline: closed outlines are lined up so they do not twist, sub-paths are paired in order, fill, stroke and a trim follow, and the ends are drawn exactly as the paths.
- **`wiggle()`**: a seeded shake or drift as keyframes (`keyframes: [...wiggle({ duration: 6, props: { x: { around: 'GW/2', amp: 6 } } })]`); every property moves on its own and ends back at its resting value.

## 0.9.0

**Added**

- **Poster time.** `movie.init({ poster: 9.5 })` names the moment that stands for the movie (a negative value counts back from the end). Once the movie is ready the canvas shows that frame while the playhead stays at 0, and play still starts from 0, like `<video poster>` but derived from the same data, with no separate image file. `movie.poster`, `movie.posterFrame` and `movie.posterImage()` (a `snapshot()` at the poster time that leaves the movie as it was); `pixi-effects-check` writes `poster.jpg`. The gallery uses it: every piece declares `poster` once (the `?poster` handling copied into all 33 pieces and `posterFrame` in their meta are gone), `node scripts/make-posters.mjs` takes the posters and writes `posters/manifest.json` (with a hash of each page, so a poster that is out of date fails a test).
- A guide for people, as a standalone site on GitHub Pages (`/guide/`, next to the gallery and the live demos): your first video, how it works, guides for text, shapes, images and video, audio, filters, transitions, 2.5D, exporting, the player and reviewing, a cookbook of tested recipes with live demos, a page on working with an AI, and a FAQ. It puts the AI-development tools up front: `check`, the contact sheet, the timeline and viewer, `inspect`, `inspectAudio` and `render`. Pages are markdown in `site/guide/`, built to HTML by `scripts/build-guide.mjs` (`npm run guide` previews it in `guide-preview/`); the recipes in them are built and linted by the tests, and the first-video page is a real file checked in Chrome.

## 0.8.0

**Added**

- Movie events with the names an HTML5 `<video>` uses: `ended` (playback ran off the end, after `pause`), `seeking` / `seeked` (a `gotoFrame()` to another frame; not for playback ticks, `render()`, `snapshot()` or `contactSheet()`), `volumechange` (`{ volume, muted }`) and `error` (`{ where: 'init' | 'render' | 'playback', message, error }`; the call still rejects). A player of your own needs nothing else: `examples/15-custom-player.html` is a complete one, and `docs/api.md` has a section on it.
- `Controller` theme: the bar's colours and thickness are CSS custom properties (`--mc-accent`, `--mc-fg`, `--mc-track`, `--mc-bar-bg`, `--mc-track-height`, `--mc-font`) with the old values as defaults, set by `new Controller(movie, { canvas, theme: { accent: '#ff4d6d' } })`, by `controller.setTheme(…)` (`null` = default) or by your page CSS. `CONTROLLER_CSS` is exported.
- `{ type: 'colorGradient', gradientType: 'linear' | 'radial' | 'conic' }`: the filter's own `type` option clashes with the DSL's `type`. 40 of the named filters are now rendered and exported in a real browser (`examples/_checks/named-filters-2.html` is the second half); the table in `docs/dsl.md` lists each one's options, and which ones are driven by `time` or need a texture.
- CI (`.github/workflows/ci.yml`): typecheck, build and unit tests on every push and pull request (Node 22), and the real-browser tool tests in headless Chrome as a non-blocking job.

**Fixed**

- The player showed a fullscreen button on browsers without the Fullscreen API for elements (iPhone Safari, which can only fullscreen a `<video>`): a button that did nothing. It is not shown there now, and the F key does nothing.
- Exporting a movie WITH SOUND to mp4 / mov failed on browsers without an AAC encoder (Chrome on Linux, which is also what a Linux server or CI runs) with "This specific encoder configuration (mp4a.40.2 …) is not supported". The audio codec is now the first one the browser can encode (aac, then opus, mp3, flac for mp4; opus, vorbis for webm), with a warning that says so; a codec you name with `audio.codec` is never swapped, and its failure says which one would work. Found by the real-browser CI job; checked by making `AudioEncoder.isConfigSupported` refuse AAC: the file was h264 + opus.

## 0.7.0

**Fixed**

- The player (`Controller`) wrapped a canvas sized in percent (`canvas { width: min(960px, 100%) }`, the usual page CSS) in a wrapper as wide as the canvas's width ATTRIBUTE (1280): in a window wider than that the picture sat at the left edge with an empty strip beside it, and the bar was wider than the picture. The wrapper is now fitted to the canvas (measured as the page styled it, re-measured on resize and after fullscreen). Checked in a real browser at 1600, 700 and 1600 px.

**Added**

- `pixi-effects-view` (`node ai/tools/view.mjs page.html`): opens your browser on the page with its timeline under it and a playhead that follows the movie. Click or drag the timeline to seek, click a layer's name to jump to its start, Space plays / pauses, ← / → step a frame (Shift: a second), + / − or Ctrl/⌘ + wheel zoom (fit = the whole movie, no sideways scrolling; at most about 12 px per frame; the names stay in a fixed column; the view follows the playhead). The page is shown whole above the timeline, scaled down to leave room for it. `movie.timelineSvg({ chartWidth, labels })` is the chart alone, with its geometry in `data-*` attributes (the ticks get finer as it gets wider).
- The timeline as a picture: `movie.timelineChart()` returns one self-contained HTML page (an inline SVG): a bar per layer on a time axis, ◆ at each keyframe, a shaded band per transition, tooltips. `movie.timelineData()` is the same as data (absolute start / end / keyframe times). Layers of one type whose names differ only by numbers (four or more) are one row, so the 706-layer `countdown-newyear` is 28 rows. `pixi-effects-check` writes it as `timeline.html`.
- `pixi-effects-render` (`node ai/tools/render.mjs page.html -o out.mp4`): renders a composition page to a video file, headless, in one command. Its own private static server and Chrome; waits for `window.__ready`; the file is streamed to disk by an upload from the page (no base64 over DevTools, so long videos are fine); mp4 / webm / mov / mkv from the extension; `--quality`, `--query`, `--fail-on-warn`, `--quiet`; exit 0 = written, 1 = failed (no file), 2 = bad usage. Rendered a 12 s gallery piece with audio in 11 s (h264 + aac).
- Filters by name, as plain data: `filters: [{ type: 'glow', name: 'halo', outerStrength: 3 }]` instead of `{ type: 'custom', filter: new GlowFilter(…) }`. The type is the class name without `Filter` in camelCase: `blur noise alpha colorMatrix` (pixi.js; `colorMatrix` has presets `sepia grayscale negative polaroid technicolor vintage kodachrome browni`) and the 38 filters of `pixi-filters` (`glow dropShadow outline pixelate crt rgbSplit oldFilm glitch twist …`). `pixi-filters` is an optional peer dependency, loaded on first use (an import-map entry or `npm i pixi-filters`; `ai/template.html` has it). A misspelt type says what you probably meant. 24 of them were rendered and exported in a real browser (`examples/_checks/named-filters.html`); the gotchas that showed up (centres in canvas pixels, margins filled black, pixelate's `sizeX`) are in `docs/dsl.md` and the cheatsheet.

## 0.6.0

**Added**

- `examples/gallery/teatime.html` (33rd piece): transparent images. Four museum teapots cut out of their studio backgrounds are saved as lossless-alpha WebP (64–94 KB each; 650–700 KB as PNG) and stand in front of a giant word, on feathered RGBA PNG shadows (`examples/_assets/cutouts/`, licences in `examples/_assets/LICENSES.md`).
- `examples/gallery/still-water.html` (32nd piece): the first piece built on real photographs (three public-domain lake photos in `examples/_assets/photos/`, licences in `examples/_assets/LICENSES.md`): Ken Burns, a dip and a crossfade, a viewfinder drawn on with `trimEnd`, a caption re-typed with `set: { text }` and `visibleChars`.
- `examples/gallery/blueprint-house.html` (31st piece): a blueprint that draws itself with `trimEnd`, `visibleChars` and `set: { text }`.
- Draw-on strokes: `trimStart` / `trimEnd` (0–1 of the outline, animatable) on `line`, `polygon`, `path`, `rect`, `circle` and `ellipse`. `trimEnd: 0` plus a keyframe `to: { trimEnd: 1 }` draws it on; `trimStart` wipes it off; both give a travelling dash. The fill is not trimmed. A rect starts top-left and a circle at 12 o'clock, both clockwise; a polygon counts its closing edge; an SVG path's curves are followed. Not for `arc` (it warns: animate `endAngle`). `examples/14-draw-on.html`.
- Text that changes over time: a keyframe `set: { text: 'Two' }` swaps the string at that time (undone on seek back), and `visibleChars` (a number, the first N characters) is a typewriter. `to` / `from` with `text` warn: a string cannot be tweened. The `{value}` lint knows about swapped strings.
- `movie.on('play', fn)`: emitted when `play()` starts a paused movie.

**Fixed**

- The player bar showed the ▶ icon while a host page's `movie.play()` was running (it only updated for its own button): it follows the movie's `'play'` / `'pause'` events now.
- `movie.play()` before the browser allows sound (an AudioContext stays `suspended` until a user gesture): the picture ran on silently and the audio was scheduled at a stale position. It now starts the sound when the context runs (it asks to resume again on the first click / key press), from the position the movie has reached by then.
- Gallery: a deep link or a reload opened the piece at its poster frame (e.g. 0:09). Every piece now opens at 0:00; a card click plays at once, a deep link keeps the poster with a play button (a browser would block the sound without a click).

## 0.5.0

**Added**

- Sound effects without files: an `audio` layer with `sfx: 'swoosh'` (or `{ preset, pitch, brightness, seed }`, or a custom `{ voices: [...] }`) plays a synthesised sound — click, pop, swoosh, swipe, hit, riser, chime, beep, coin, glitch, typewriter. The layer's `duration` is the sound's length. Deterministic; the synthesiser is a separate chunk loaded only when used.
- `ai/tools/check.mjs` (`npx pixi-effects-check page.html`): a one-command review for an AI author — its own private headless Chrome and static server, then warnings, `movie.inspect` over the whole timeline (grouped), `movie.inspectAudio()`, a contact sheet PNG, and a real export decoded again (video / audio length, loudness per second, silence); `report.json`; exit 0 / 1. No dependencies (Node ≥ 22 and an installed Chrome). Cut-off / off-canvas text fails the check; text overlaps are listed for review (7 of the 30 gallery pieces overlap on purpose), `--strict` fails on them.
- `measureText(text, style)` and `splitText(text, style, { by: 'chars' | 'words' | 'lines', x, y, align })`: text layout with the renderer's own font metrics, for per-letter / per-word animation (and sizing pills) without hand-measuring.
- `shape: 'arc'` — progress rings, pie and donut slices (`radius`, `innerRadius`, `startAngle`, `endAngle` in degrees, all animatable) — and `strokeCap` / `strokeJoin` on every shape.
- An `audio` layer's starting volume may be written `initial: { volume }` (it was silently ignored there and played at 1) as well as `volume`.
- Text counters: `format: { pad: 2 }` zero-pads the whole part (`18:42:05`); a `{value}` placeholder that nothing sets or animates warns that it prints 0.
- `movie.inspectAudio()`: each sound's length, level, loudest moment and brightness (Hz), when it plays, the mix over time, and issues (limited mix, inaudible or cut-off sounds).
- The audio mix is soft-limited above 0.9 (a quieter mix is unchanged) and warns, naming the layers, when it would have clipped.

**Fixed**

- MP4 / MOV exports: the audio started ~45 ms after the picture (AAC encoder priming). It is now trimmed with an edit list.
- `colorSpace: 'oklch'` from or to a nearly grey colour (`#9a9ab4`) swept through pink: a low-chroma endpoint now borrows the other end's hue.
- `blendMode` on a layer with `filters` (a blurred `multiply` glow rendered black) goes through the last filter.
- An `image` / `video` used as a `mask` was drawn as a normal picture over the layer, and `maskInverted` looked ignored; sprite masks now stay hidden.
- A tilted `threeD` layer hidden because one corner passes the camera plane gets a warning that says so (it blamed `z`).
- `movie.inspect`: text in a panning composition is not "cut off", text scaled to 0 is not "no size".
- The seek / volume drag of the player ends when the pointerup never arrives (button released outside an iframe).
- sfx: a negative `at` or an end-relative keyframe past the start of a short sound crashed `movie.init()` (Web Audio rejects negative times): such a sound now starts at 0 with its first part cut off, with a warning; a non-number `duration` falls back to the preset length; silent custom voices (`from >= to`, `gain: 0`) and a non-numeric `seed` warn.
- `ai/template.html`: the player bar was wider than the canvas.

**Breaking (types)**

- `AudioSequenceSpec` is now `AudioAssetSpec | AudioSfxSpec`; `AudioDescriptor.buffer` is optional (a descriptor carries `buffer` or `synth`).

## 0.4.0

**Changed**

- A mask with no `at` of its own now starts and ends with the layer it masks, so its keyframes are measured from that layer's start (as `docs/dsl.md` always said: "shares its lifetime"). An explicit mask `at` is still composition time. **Migration:** a mask reveal that used `at: 0` on a layer that appears later now plays when the layer appears (before, it had finished long before). Give the mask an explicit `at` to keep the old timing.
- An `audio` layer with `loop: true` and no `duration` lasts until the composition ends (it used to stop after one clip length). Without `loop` and without `duration` it lasts as long as its clip, so a one-shot sound effect needs no `duration`.

**Fixed**

- **Volume keyframes** behaved unlike every other keyframe: a `to` ramped from the end of the previous keyframe, so the documented fade-out `{ at: -2, to: { volume: 0 }, duration: 2 }` faded the music across the whole piece, and `set` ramped towards its time instead of jumping. Each change now holds the current value until its own start, and keyframes apply in time order.
- A `set` keyframe (text `{value}` counter and fill, image tint, shape style) stayed applied after seeking back before it.
- **A shape could be missing after a jump seek** (contact sheet, snapshot, scrubbing): geometry was drawn only while rendering, after the culler had measured the previous frame's bounds, so a rect growing from `width: 0` at the left edge was culled. Shapes now redraw before the cull.
- `threeD` layers whose size changes (a growing shape, text) no longer make Pixi warn "destroyed while still bound": the render texture is resized in place.
- Text `style` words (`stroke: { join: 'round' }`, named colours, `textBaseline`, `whiteSpace`) were parsed as expressions and warned.
- `movie.inspect` judges overlaps on what is visible (cut to the canvas and the layer's mask), so a ticker parked off the canvas is not reported, and does not report the two scenes of a running transition.
- The same "keyframe starts after the layer ends" warning, printed once per layer by a loop, is summarised after three.
- `docs/dsl.md` contradicted itself on whether text content can change (it can, through `{value}`).

**Added**

- `blendMode: 'normal' | 'add' | 'screen' | 'multiply'` on every layer (a composition's children inherit it): glows and light leaks that add up.
- The four sample sound-effect mp3s (`examples/_assets/sfx-*.mp3`) are gone: the examples and all 23 gallery pieces that used them now use `sfx` presets (volumes matched to the old files within about 2 dB). `examples/_assets/bgm.mp3` is now a 16 s seamless loop of "One Cool Minute" (Loyalty Freak Music, CC0 1.0; see `examples/_assets/LICENSES.md`) instead of the 6 s drone; the gallery pieces' music volumes are retuned (peak 0.3, about −32 LUFS under the sound effects).
- `examples/gallery`: 30 portfolio pieces written as plain data by three AI models, with a showcase page, and the stumble notes that fed these fixes. `ai/reference/pitfalls.md` items 32–48.

## 0.3.0

**Breaking**

- Keyframe `at` is now measured from the start of the layer it belongs to (After Effects style); negative `at` counts back from that layer's end. Before, it was measured from the parent composition, so a keyframe with `at: 0` on a layer that starts at `at: 2` ran two seconds before the layer appeared, silently. Layers' own `at` and transitions' `at` are unchanged (composition time). `kenBurns`, `withFade` and transitions emit layer-local times. **Migration:** on a layer with `at: N`, subtract `N` from its keyframes' `at`.

**Fixed**

- **A layer could be missing right after a seek, or from an exported video.** PixiJS only culls inside `app.render()` (the ticker), and `Movie` draws by hand (and `render()` stops the ticker), so `culled` flags were stale: a layer that had just come on screen could be skipped. The movie now culls immediately before every draw.
- `line`, `polygon` and `path` without `x` / `y` were drawn around (0,0): their points are now plain canvas coordinates.
- Videos inside nested compositions started at the wrong time.
- Text `w` / `h` in expressions were measured before the style was applied.
- Shape geometry written in `initial` (`width`, `anchorX`, …) was silently ignored.
- 2.5D: hidden layers could keep a stale texture (`autoAlpha`), filter output was clipped at the layer edge, and render textures could use excessive memory.

**Added**

- Unknown option names now warn with a suggestion (`contactSheet({ cols })` → `columns`, `init({ fps })` → `frameRate`) instead of being ignored. `inspect(frame, { layers })` can list only the visible layers or none; it ignores faint layers and moving text.
- Warnings for the silent failures AI authors hit: keyframe or layer starting after its layer / composition ends, audio shorter than its layer without `loop`, a `threeD` layer hidden behind the camera, transitions on `threeD` layers, `lookAt` equal to the camera position, and more.
- Keyframes: `repeat` / `yoyo` / `repeatDelay` on every kind of animation (finite repeats only).
- Text counters: `text: '{value} users'` + animate `value`; `format: { decimals, grouping }`.
- Shapes: `fillGradient` — linear and radial gradients with alpha stops (vignettes).
- `orbit()` preset: a camera that circles a point (`dollyZoom: { from, to }` animates `fov` while the radius follows it).
- `movie.snapshot()`, `movie.contactSheet()`, `movie.inspect()`: look at the result — one frame, many labelled frames on one image, or per-layer bounds plus layout issues (text off the canvas, cut off, overlapping).
- `ai/` (skill, cheatsheet, tested recipes, pitfalls, starter template), `llms.txt`, `llms-full.txt`.

## 0.2.0

- 2.5D layers and camera (`threeD`, `z`, `rotationX/Y`, `{ type: 'camera' }`), the optional `pixi-effects/three` entry, `withFade`, shared-chunk builds.
