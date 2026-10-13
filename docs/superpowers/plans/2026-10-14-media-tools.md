# Media tools for AI agents (0.38) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** four commands, `pixi-effects probe | trim | frames | sound`, that let an AI agent look at, listen to and cut footage with no ffmpeg installed.

**Architecture:** a Node side (`ai/tools/media.mjs`) that parses the command line and does container-only work with mediabunny (`probe`, `trim` by copy); for anything that decodes or re-encodes it opens the headless Chrome the other tools already use and loads a page (`ai/tools/media-page.html`) that imports mediabunny from the package's own bundle. Files go through the tool's local server (`Range` reads in, `PUT` out), as `render.mjs` does.

**Tech stack:** Node 22 (ESM `.mjs`), mediabunny 1.61 (`FilePathSource` / `FilePathTarget`, `Conversion`, `EncodedPacketSink`, `VideoSampleSink`), headless Chrome via `check.mjs`'s `serve` / `launchChrome` / `Cdp`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-media-tools-design.md`

## Rulings on the spec (made while planning)

- **One public export is added** (the spec said no library API): `inspectSound(pcm)` in `src/core/inspectAudio.ts`, exported from `src/index.ts`. The media page must measure loudness with the same code `check` uses. It is `analyzeAudio(pcm, [], null, duration)` with the movie-only parts left out. `docs/api-surface.txt`, `docs/api.md` and the CHANGELOG say so.
- **The page does not import `dist/index.js`** (it imports `pixi.js` from a CDN, which breaks "works offline"). A new tsup entry `sound` (`src/core/soundEntry.ts`, which only re-exports `inspectSound`) builds `dist/sound.js` with no `pixi.js` in it, and the tool's server serves it (and the chunks it imports) from `dist/` by name. A test reads `dist/sound.js` and every chunk it imports and fails if any imports `pixi.js` or `http`.
- **`--at` syntax is written again, small, in `media.mjs`** (`parseTimes`), not imported: `resolveAtList` is TypeScript inside the library and needs a movie's layers. A test runs both on the shared syntax (`3.5`, `50%`, `f120`, `end`) so they cannot drift.
- **Open question 1 (a trim that starts between frames) is settled by a measurement in this plan (Task 4)**, with a stated rule, not by opinion.

## Global Constraints

- Four top-level commands of the existing `pixi-effects` bin: `probe`, `trim`, `frames`, `sound`. Nothing in the library's runtime or spec changes (only the one export above).
- Every command: text report by default, `--json` prints the same facts as JSON; **exit 0** = done, **1** = a problem was found or the job could not be done as asked, **2** = usage. Never a stack trace for a bad input: a sentence naming what and what to do.
- No ffmpeg is needed anywhere, including in the tests (a test runs with `PATH` stripped of it). Works offline: mediabunny comes from `node_modules/mediabunny/dist/bundles/mediabunny.min.mjs` served locally.
- `probe` and `trim` (copy) must run with **no Chrome**. `frames`, `sound`, `trim --exact` use Chrome and say what is missing when it is not found (`--chrome PATH` / `CHROME_PATH`, as `check` does).
- Every result names what was actually done (`requested`, `actual`, `reencoded`).
- A file argument is a path or an `http(s)` URL.
- Test fixtures are made by a script from our own renderer and committed small (< 200 KB each); tests never download anything.

## Review Focus

Failure modes the spec implies that no task's happy path exercises; each has a test in the task that owns the code.

1. **A file with no video track** (audio only) given to `frames`, and **no audio track** given to `sound`: a sentence and exit 1, not an empty folder or a crash. (Task 5, Task 6)
2. **A rotated video** (a phone clip, `rotation: 90`): `frames` must write PNGs the right way up; `probe` must say "rotated 90°". (Tasks 3, 5)
3. **Times outside the file** (`start` after `end`, negative, past the duration, `--at 99` on a 6 s file): clamped or refused with the real duration in the sentence. (Tasks 4, 5)
4. **A path with spaces and non-Latin letters, and an output path that exists or whose folder is missing**: works / says so (the earlier batch recipe broke on exactly this). (Task 1)
5. **A URL whose server ignores `Range`**, and **a very long file**: the page must not read the whole file into memory to take three frames. (Task 5)

---

### Task 1: The command line, the routing and the local server

**Files:**
- Create: `ai/tools/media.mjs`
- Modify: `ai/tools/pixi-effects.mjs` (`TOOLS`, `USAGE`, `nearest`)
- Create: `tests/tools/media.test.ts`

**Interfaces:**
- Produces: `parseMediaArgs(argv: string[]): { command: 'probe'|'trim'|'frames'|'sound'; file: string; opts: object }` (throws `UsageError` with `.exitCode = 2`); `runMedia(argv: string[], io?: { log, err }): Promise<number>` (the exit code); `serveMedia({ inputs: Map<string,string>, outDir: string }): Promise<{ server, port, close() }>` serving `/__in/<id>` with `Range` and `PUT /__out/<name>`; `UsageError`.
- Consumes: `serve`, `launchChrome`, `Cdp`, `findChrome`, `sleep` from `ai/tools/check.mjs` (later tasks).

- [ ] **Step 1: Write the failing tests** (`tests/tools/media.test.ts`)

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const cli: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/pixi-effects.mjs')).href);

describe('the media commands: the command line', () => {
  it('routes probe, trim, frames and sound, and the usage text lists them', () => {
    for (const c of ['probe', 'trim', 'frames', 'sound']) expect(cli.route([c, 'a.mp4']).tool ?? cli.route([c, 'a.mp4']).inline).toBeTruthy();
    expect(cli.route([]).usage).toMatch(/probe[\s\S]*trim[\s\S]*frames[\s\S]*sound/);
  });
  it('parses a trim: file, start, end, -o; times may be 12.5 or 1:02.5', () => {
    const r = media.parseMediaArgs(['trim', 'in.mp4', '2.5', '1:02.5', '-o', 'out.mp4', '--exact']);
    expect(r).toMatchObject({ command: 'trim', file: 'in.mp4', opts: { start: 2.5, end: 62.5, out: 'out.mp4', exact: true } });
  });
  it('a usage mistake is exit code 2 with a sentence (no file, a missing -o, an unknown option with a guess)', async () => {
    const lines: string[] = [];
    const io = { log: (s: string) => lines.push(s), err: (s: string) => lines.push(s) };
    expect(await media.runMedia(['probe'], io)).toBe(2);
    expect(await media.runMedia(['trim', 'in.mp4', '1', '2'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/-o/);
    expect(await media.runMedia(['frames', 'in.mp4', '--att', '1'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/did you mean --at/);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/tools/media.test.ts`. Expected: FAIL (`media.mjs` does not exist).
- [ ] **Step 3: Implement** `ai/tools/media.mjs`: the header comment (usage of each command, options, exit codes), `UsageError`, `parseTime(s)` (`12.5`, `1:02.5`, `1:02:03`), `parseMediaArgs` (options per command: `trim`: `-o`, `--exact`, `--json`; `frames`: `--at`, `--size`, `--sheet`, `-o`, `--json`, `--chrome`; `sound`: `--waveform`, `-o`, `--json`, `--chrome`; `probe`: `--keyframes`, `--json`; unknown option → UsageError with a did-you-mean from the command's own option list), `runMedia` (dispatches to `commands[command]`, which later tasks fill in; unknown command → 2; catches `UsageError` → 2 and any other error → a one-sentence message and exit 1), and `serveMedia` using `serve(root, onRequest)` from `check.mjs` with the two routes (`/__in/<id>` maps ONLY ids in `inputs`; `Range: bytes=a-b` → 206 with `Content-Range`; `PUT /__out/<name>` accepts `[A-Za-z0-9._-]+` only and writes into `outDir`; `/__mb/mediabunny.min.mjs` is the package's own bundle and `/__lib/<name>.js` serves a file of `dist/` by name, nothing else).
- [ ] **Step 4:** In `pixi-effects.mjs` add the four commands to `TOOLS` (all map to `media.mjs`, passing the command word as the first argument) and to `USAGE` and `nearest`. Run the tests. Expected: PASS.
- [ ] **Step 5: Add the server tests** (Range returns exactly the bytes asked and `206`; an id that was not registered is `404`; `PUT /__out/../x` is refused; a file named `été café.mp4` with a space is served), watch them fail, then pass. Also add the output-path cases (`-o` to a missing folder is created; an existing file is overwritten only with `--force`, else exit 1 with the sentence).
- [ ] **Step 6: Commit** `git add ai/tools/media.mjs ai/tools/pixi-effects.mjs tests/tools/media.test.ts && git commit -m "media: command line, routing and the local server for footage tools"`

### Task 2: Fixtures

**Files:**
- Create: `scripts/make-media-fixtures.mjs`, `tests/fixtures/media/colors.html`, and the committed outputs `tests/fixtures/media/{colors.mp4,colors.webm,colors.mov,rotated.mp4,audio-only.m4a,video-only.mp4,tone-20.wav,tone-26.wav}`
- Test: `tests/tools/mediaFixtures.test.ts`

**Interfaces:**
- Produces: fixtures with known contents: `colors.mp4` is 320×180, 30 fps, 6 s, **second k is one flat colour** (red, green, blue, yellow, magenta, cyan) with a 440 Hz tone, keyframes every 2 s (the renderer's default); the same as `.webm` (VP9 + Opus) and `.mov`; `rotated.mp4` is `colors.mp4` remuxed with `rotation: 90`; `audio-only.m4a`, `video-only.mp4` (remuxed, one track dropped); `tone-20.wav` and `tone-26.wav` are 4 s stereo 997 Hz sines at −20 and −26 dBFS, written as PCM in Node.

- [ ] **Step 1: Write the test** that opens each fixture with mediabunny in Node and asserts the facts above (duration within 0.05 s, codec, size, track count, `rotation`); watch it fail (no fixtures).
- [ ] **Step 2: Write `scripts/make-media-fixtures.mjs`:** renders `colors.html` (a page of six flat `shape` rects at `at: k` plus an `audio` layer with a 440 Hz `sfx` tone) with `render.mjs` to mp4, webm and mov; remuxes the variants with mediabunny in Node (`Output` + `EncodedPacketSink` copy, `addVideoTrack(..., { rotation: 90 })`); writes the two WAVs as 16-bit PCM from a sine function. Run it once; commit the outputs (check each is < 200 KB).
- [ ] **Step 3:** Run the test. Expected: PASS. **Step 4: Commit.**

### Task 3: `probe`

**Files:**
- Modify: `ai/tools/media.mjs` (`commands.probe`, `probeFile`)
- Test: `tests/tools/media.test.ts`

**Interfaces:**
- Produces: `probeFile(source: string): Promise<{ file, container, duration, bytes, video: Array<{ codec, width, height, fps, fpsVaries, rotation, bitrate }>, audio: Array<{ codec, sampleRate, channels, bitrate }>, keyframes?: number[], notes: string[] }>`.

- [ ] **Step 1: Write the failing tests:** `colors.mp4` → `container: 'mp4'`, one `avc` video 320×180 30 fps, one `aac` audio, duration 6 ± 0.05, no notes; `colors.webm` → `vp9` + `opus`; `rotated.mp4` → `rotation: 90` and a note `rotated 90°`; `video-only.mp4` → a note `no audio`; `audio-only.m4a` → `video: []` and a note `no video`; `--keyframes` lists `[0, 2, 4]`; a text file → exit 1, message `not a media file`; a missing path → exit 1, `no such file`; an empty file → exit 1; the text report fits 12 lines for `colors.mp4`; `--json` parses and has the same fields.
- [ ] **Step 2:** Run; expected FAIL. **Step 3: Implement** with `Input` + `ALL_FORMATS` + `FilePathSource` (or `UrlSource` for `http(s)`), `getTracks()`, `computeDuration()`, `track.getDecoderConfig()`, `computePacketStats(...)` for fps/bitrate (cap the packets read at 600 for the fps/variance estimate; say `~` when estimated), and the notes (rotation ≠ 0, no audio, no video, variable frame rate when the spread of frame durations exceeds 10 %). **Step 4:** Run; expected PASS. **Step 5: Commit.**

### Task 4: `trim` (copy, real times) and the between-frames rule

**Files:**
- Modify: `ai/tools/media.mjs` (`commands.trim`, `trimFile`)
- Test: `tests/tools/media.test.ts`, `tests/tools/mediaTrimBrowser.test.ts` (real Chrome)

**Interfaces:**
- Produces: `trimFile({ input, start, end, out, exact }): Promise<{ requested: [number, number], actual: [number, number], mode: 'copy'|'reencode', reencoded: boolean, tracks: string[], bytes: number, notes: string[] }>`.

- [ ] **Step 1: Write the failing tests** (Node): `trim colors.mp4 2 4 -o out.mp4` → `actual` equals `[2, 4]` ± 1 frame, `mode: 'copy'`, and the output's video packets from the key packet on are **byte-identical** to the source's packets between 2.0 s and 4.0 s (read both with `EncodedPacketSink`); `trim colors.mp4 2.37 4.1` → `actual[0]` is the first frame boundary at or after 2.37 (2.4) and the text report says `asked 2.37–4.1, got 2.40–4.10 (frame-aligned)`; `start >= end` → exit 1 `start must be before end`; `end` past the duration → clamped, with `notes` `end is past the file (6.0 s): cut at 6.0`; `-o` equal to the input → exit 1 `would overwrite the input`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3: Implement** with `Conversion.init({ input, output: new Output({ format, target: new FilePathTarget(out) }), trim: { start, end } })` (format from the output extension; `.mp4`, `.mov`, `.webm`, `.mkv`), then read the result back with `Input` to report the real `actual` times and whether any track was transcoded (`conversion.utilizedTracks` and the packets' equality). `--exact` calls the browser engine (Task 5's `withBrowser`; until then it exits 1 with `--exact needs Chrome: not wired yet` and a test marks it pending).
- [ ] **Step 4: The between-frames measurement (a decision gate).** Real-Chrome test on `colors.mp4`: trim `2.37–4.1` by copy, load the output in a `<video>` in the page, seek to 0.0, 0.05, 0.1, 0.5 s, draw each frame to a canvas and read its colour. Expected from the fixture: source 2.37–2.4 is still green… (the second boundary is at 3.0 s: the output must show the source colour of that moment at every seek). **Rule:** if every seek shows the right colour, the copy default stays; if any of the first ~4 frames shows an earlier colour, then `trim` with a start that is not on a frame boundary is **refused in copy mode with a sentence that names `--exact`**, and the test asserts that refusal instead. Record the measured result in the task's commit message and in the spec's open question 1.
- [ ] **Step 5:** Run all; PASS. **Step 6: Commit.**

### Task 5: The browser engine and `frames`

**Files:**
- Create: `ai/tools/media-page.html`, `ai/tools/mediaBrowser.mjs`
- Modify: `ai/tools/media.mjs` (`commands.frames`, `parseTimes`), `ai/tools/media.mjs` `trim --exact`
- Test: `tests/tools/mediaFrames.test.ts` (real Chrome)

**Interfaces:**
- Produces: `withBrowser(opts, fn: (page: { call(name: string, args: object): Promise<any> }) => Promise<T>): Promise<T>` (starts the server from Task 1, launches Chrome, opens `media-page.html`, closes both; throws a sentence `Chrome was not found: set CHROME_PATH or pass --chrome` when there is none); the page's `window.media = { frames({ id, times, size, sheet }), trimExact({ id, start, end, outName }), sound({ id }) }`; `parseTimes(list: string, { duration, fps }): Array<{ label: string, t: number }>` supporting `3.5`, `50%`, `f120`, `end`, `start`, `every 2s`.

- [ ] **Step 1: Write the failing tests.** `parseTimes('1,3.5,50%,f60,end', { duration: 6, fps: 30 })` → `[1, 3.5, 3, 2, 5.967]` (`end` is the last frame); the shared-syntax equivalence with `resolveAtList` from `dist` (run in Chrome through the page that imports `pixi-effects`, or via `node -e` on `dist/index.js` if exported: choose the one that does not add a public export; if neither is possible, assert the table of expected values by hand and say so in the test); `every 2s` → `[0, 2, 4]`; `99` on a 6 s file → exit 1 `99 s is past the end of the file (6.0 s)`. Real Chrome: `frames colors.mp4 --at 0.5,1.5,2.5,end -o <dir>` writes four PNGs of 320×180 (`--size 160` → 160 wide) whose centre pixel is red, green, blue and cyan (within 6 per channel); `--sheet` writes `sheet.png` with all four and their times; `frames rotated.mp4 --at 0.5` writes a **180×320** PNG (rotation applied); `frames audio-only.m4a` → exit 1 `no video track`; the heap of the page stays small on a 6 s file (assert `performance.memory.usedJSHeapSize` < 150 MB after three frames; this is the guard against reading the whole file).
- [ ] **Step 2:** Run; expected FAIL. **Step 3: Implement** the page: `import * as mb from '/__mb/mediabunny.min.mjs'` (the server maps `/__mb/` to the package's bundle file only); `frames` opens `new mb.Input({ source: new mb.UrlSource('/__in/<id>'), formats: mb.ALL_FORMATS })` (`UrlSource` reads by `Range`), uses `new mb.CanvasSink(track, { width, rotation: ... })` (or `VideoSampleSink`) `.getCanvas(t)` for each time, applies the track's rotation, encodes `canvas.convertToBlob({ type: 'image/png' })` and PUTs it to `/__out/<name>.png`; the sheet is drawn on one canvas with the time under each cell. `withBrowser` is `check.mjs`'s `serve` + `launchChrome` + `Cdp` (the pattern in `render.mjs`), with the CDP page-ready wait of `check`.
- [ ] **Step 4:** Wire `trim --exact` (`trimExact`: `Conversion` in the page with `trim` and `video: { forceTranscode: true }`, PUT the result, report `reencoded: true`); add a test that `trim colors.mp4 2.37 4.1 --exact` gives `actual[0]` of 2.367 (the frame at or before) or 2.4 as decided in the gate (the rule from Task 4 says which) and that the first frame's colour is right. Run all; PASS. **Step 5: Commit.**

### Task 6: `inspectSound` and the `sound` command

**Files:**
- Create: `src/core/soundEntry.ts`
- Modify: `src/core/inspectAudio.ts` (`inspectSound`), `src/index.ts`, `tsup.config.ts`, `docs/api.md`, `docs/api-surface.txt` (generated), `ai/tools/media-page.html` (`sound`), `ai/tools/media.mjs` (`commands.sound`)
- Test: `tests/core/inspectAudio.test.ts`, `tests/tools/mediaSound.test.ts`

**Interfaces:**
- Produces: `inspectSound(pcm: PcmLike): { duration: number; sampleRate: number; channels: number; loudness: { integratedLufs: number | null; truePeakDb: number; clippedSamples: number; silences: Array<{ from: number; to: number }> }; windows: Array<{ t: number; rmsDb: number }>; notes: string[] }`.

- [ ] **Step 1: Write the failing unit test** in Node: a generated 4 s stereo 997 Hz sine at −20 dBFS and one at −26 dBFS: `integratedLufs` of the first minus the second is 6.0 ± 0.1; silences are `[]`; a sine followed by 2 s of zeros and a sine gives one silence `{ from: 4, to: 6 }` ± 0.1; `clippedSamples` is 0 for the −20 sine and > 0 for a sine at +3 dB clipped to ±1; and **the numbers equal `analyzeAudio(pcm, [], null, duration)`'s `loudness`** (the agreement `check` and `sound` need).
- [ ] **Step 2:** Run; expected FAIL (`inspectSound` is not exported). **Step 3: Implement** `inspectSound` as a thin wrapper of `analyzeAudio` plus the per-window levels it already computes; export it and its type from `src/index.ts`; add `src/core/soundEntry.ts` (`export { inspectSound } from './inspectAudio';`) and the tsup entry `sound`; run `npm run build`, then `node scripts/api-surface.mjs --write`; add the entry to `docs/api.md`. **Step 4:** PASS, including the test that `dist/sound.js` and the chunks it imports do not import `pixi.js`.
- [ ] **Step 5: Write the failing real-Chrome tests:** `sound tone-20.wav --json` and `tone-26.wav` differ by 6.0 ± 0.1 LU and each equals `inspectSound`'s value for the same samples read in Node (decode the WAV with mediabunny in the test); `sound colors.mp4` reports ~ the loudness of the 440 Hz tone (equal to the Node-side number for the same file decoded in the page, to 0.1 LU); `--waveform` writes a PNG of the stated size with non-background pixels; `sound video-only.mp4` → exit 1 `no audio track`; the text report fits 10 lines.
- [ ] **Step 6: Implement** `window.media.sound({ id })`: open the input, `AudioBufferSink` (or `AudioSampleSink`) → one `Float32Array` per channel → `inspectSound` from `/__lib/sound.js` → JSON; the waveform is drawn on a canvas and PUT as PNG. Run; PASS. **Step 7: Commit.**

### Task 7: No ffmpeg, no Chrome, bad input

**Files:**
- Test: `tests/tools/mediaEnvironment.test.ts`
- Modify: `ai/tools/media.mjs` (sentences only)

- [ ] **Step 1: Write the failing tests** (spawn the real command): with `PATH` containing only `node`'s directory, `probe`, `trim` (copy), `frames` and `sound` on the fixtures all exit 0 (proves no ffmpeg dependency; the test first asserts `ffmpeg` is not found on that `PATH`); with `CHROME_PATH=/nonexistent` and `PATH` stripped, `probe` and `trim` still exit 0 and `frames`, `sound`, `trim --exact` exit 1 with a sentence containing `Chrome was not found` and `--chrome`; a text file, an empty file, a directory, a path that does not exist and an `http://127.0.0.1:1/x.mp4` (nothing listening) each exit 1 with one sentence and no `at ` stack lines; a file named `été café 日本.mp4` (copy of `colors.mp4`) works for all four commands.
- [ ] **Step 2:** Run; fix every stack trace and every sentence that does not name the file and the next step; PASS. **Step 3: Commit.**

### Task 8: Docs for the agent, the version and the check on real footage

**Files:**
- Modify: `skills/pixi-effects/SKILL.md`, `README.md`, `CHANGELOG.md`, `ai/tools/lookup.mjs` (only if `help media` needs a heading rule), `docs/dsl.md` is **not** touched; create `docs/media.md` (the reference `help media` reads) and add it to `files` in `package.json` if `docs/` is not already shipped for that file
- Test: `tests/tools/lookup.test.ts`, `tests/docs/*`

- [ ] **Step 1: Write the failing tests:** `help media` prints the section about the four commands; `help trim`, `help frames`, `help sound`, `help probe` find it; a docs test asserts that SKILL.md has a section "Look at footage before you use it" and that README and `docs/media.md` both say "if ffmpeg is installed and the job is a long transcode, use ffmpeg"; every example command in `docs/media.md` is run by a test against the fixtures and exits 0 (so the docs cannot lie).
- [ ] **Step 2:** Run; FAIL. **Step 3: Write** `docs/media.md` (each command, its options, the report you get, the exit codes, the measured numbers from the spec with their limits: one file, one machine; the codecs headless Chrome handled on the author's machine and that this varies; when to use ffmpeg), the SKILL.md section (the rule: footage an agent has not looked at is not used: three frames and the loudness first), the README line and the CHANGELOG entry (an `Unreleased` section: the four commands, `inspectSound`, the measurements and what was not measured), `npm run build:ai`. **Step 4:** PASS.
- [ ] **Step 5: Whole-branch gate.** `npm run test:fast`, `npm run test:changed`, `npm run release:check` (once, at the end). A fresh-context reviewer reads the diff (`git diff <base>..HEAD`) with this plan's Review Focus; verify each finding on the real build before fixing it.
- [ ] **Step 6: Trial on real footage (before any claim on the landing page or FACTS).** Three fresh agents, each given a real phone clip, a screen recording and a WebM the owner provides (or ones from `pixi-effects-opus/` renders if none), asked to describe what is in each and cut a 3 s moment, using only these commands and the docs; record what they stumbled on, as for the canvas layer; fix what is a bug or a missing sentence. No release before this.
- [ ] **Step 7: Commit** with the trial's numbers in the CHANGELOG. The release (version, tag, GitHub Release) follows the owner's go, one step at a time.
