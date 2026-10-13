# Media tools for AI agents (0.38): probe, frames, sound, trim

Status: design, for review. Nothing is built. Decided with the owner on 2026-10-14.

## Why

Two things the owner wants:

1. A way to start that needs **no preparation**: an AI agent (the main user) can look at, listen to and cut footage without ffmpeg installed. mediabunny does the media work; the pixi-effects tools already run on a headless Chrome the agent has.
2. A difference from fframes and Remotion. Both help an agent look at the video it is *making* (fframes: `inspect`, `audio analyze`; Remotion: Studio and agent skills). Neither is built around **any footage an agent is handed**. mediabunny itself ships AI-readable docs (`llms.txt`) and nothing else for agents (checked 2026-10-14 on its site and the top 30 npm results; GitHub issues were not searched).

Evidence from our own work that agents lack eyes and ears for footage: the fidelity experiment (U2) needed ffmpeg and ImageMagick for frames, loudness and side-by-side pictures; the canvas trial pulled single frames out of exports with ffmpeg. Where ffmpeg is missing, none of that is possible.

## Non-goals

- Not an ffmpeg replacement. **Where ffmpeg is installed and the job is heavy (a long transcode), the docs say: use ffmpeg.** Measured on one 3.9 MB file on the owner's Mac: a lossless 5.6 s cut takes 0.05–0.15 s in ffmpeg and 0.10–0.15 s in mediabunny under plain Node (the same); a 5.6 s re-encode takes 0.6–0.75 s in ffmpeg (mediabunny in Chrome not measured yet). What this adds is not speed: it is **structured output, the real times, and no flag-order traps**.
- No filters, no GUI, no HLS, no streaming. Editing with effects is what a composition and its `video` layer already do.

## The four commands

All are top-level commands of the existing `pixi-effects` bin (`ai/tools/media.mjs`, routed from `pixi-effects.mjs`). Each prints a short text report; `--json` prints the same facts as JSON; exit 0 = done, 1 = a problem was found or the job could not be done as asked, 2 = usage. A file argument may be a path or an `http(s)` URL (read by range).

| Command | What it says or makes | Engine |
|---|---|---|
| `probe <file>` | container, duration, file size; per track: codec, size, frame rate (and whether it varies), rotation, bitrate, sample rate, channels; keyframe times with `--keyframes`; notes ("no audio", "rotated 90°", "variable frame rate") | Node only (no decoding) |
| `trim <file> <start> <end> -o <out>` | the cut file, and **the real times**: `asked 2.37–6.11, got 2.40–6.10 (frame-aligned), copied: video, audio (no re-encode)`. Default: copy (mediabunny's `Conversion` copies whenever it can). `--exact`: re-encode so the start is the frame asked for | copy: Node only; `--exact`: Chrome |
| `frames <file> --at <list> [--size 480] [--sheet] [-o dir]` | PNG files of the frames at those times, and with `--sheet` one contact sheet with the time under each. `--at` takes what `check --at` takes (`1,3.5`, `50%`, `f120`, `end`, `every 2s`) | Chrome (decoding) |
| `sound <file> [--waveform]` | integrated loudness (LUFS), true peak, clipped samples, silences, level per second (the numbers `check` gives for a movie, from `inspectAudio`'s own measurement), and with `--waveform` a PNG | Chrome (decoding) |

Out of the first version, on purpose (each is a clean addition later): `concat`, `audio` (extract), `convert`, `compare` (side by side), `scenes` (cut detection), tempo and beat detection for `sound` (an estimate that is wrong is worse than none: it needs its own trial). The Node spike already showed that lossless `concat` and `audio` work: a 27.1 s join of two files decoded with no error, a join of two different renders showed the right frames across the seam, and an AAC track was copied out with no re-encode.

## Architecture

- **Two engines, chosen per command, never by the user.** A command that only reads containers and copies packets (`probe`, `trim` by copy) runs in Node with mediabunny's `FilePathSource` / `FilePathTarget`: no browser, ~0.1 s. A command that decodes (`frames`, `sound`) or re-encodes (`trim --exact`) opens the headless Chrome the other tools already use (`launchChrome`, about 1.5 s) and loads the page `ai/tools/media-page.html`.
- **mediabunny comes from the package, not from a CDN.** `node_modules/mediabunny/dist/bundles/mediabunny.min.mjs` is served by the tool's own static server (the page's import map points at it), so it works offline and the version is the one pixi-effects depends on.
- **Files go through the local server, never through CDP.** The page reads the input by `Range` requests from a route that serves exactly the one file given (no directory listing), and PUTs its output to the server, the way `render.mjs` already does ("so a long video never goes through base64").
- **Reuse, do not copy.** `--at` parsing and the contact sheet layout (`src/core/frames.ts`, `resolveAtList`), loudness and silence measurement (`analyzeAudio` in `src/core/inspectAudio.ts`) are the code `check` uses, so `check` and these commands agree on the same numbers for the same sound.
- Code: `ai/tools/media.mjs` (the Node side and the command line), `ai/tools/media-page.html` (the browser side), small shared pieces in `src/` only where `check` also needs them. The library's runtime and its spec stay untouched: this is tooling, not a layer.

## What an agent is told (the point of the tool)

- Every result names what was actually done, in the report and in `--json`: `requested`, `actual`, `reencoded: false`.
- A refusal says why and what to do: `trim --exact needs a browser (Chrome was not found: set CHROME_PATH)`; a codec the browser cannot decode (headless Chrome here decodes and encodes H.264, HEVC, VP8, VP9, AV1, AAC and Opus; MP3 decodes only; FLAC neither) is named, with the one-line ffmpeg command when ffmpeg is the sensible answer.
- `help media` and a section of `SKILL.md` ("Look at footage before you use it"), with the rule: footage an agent cannot see is not used; look at three frames and the loudness first. The docs also say plainly when to prefer ffmpeg.

## Success criteria (each is a test, with a mutation that must fail it)

1. `probe` of a fixture says its codecs, size, frame rate and duration; for a file with no audio it says so.
2. `trim` of a fixture from a frame boundary gives frames that are identical to the source's (PSNR 99 dB over every frame, as in the spike); from a time between frames it returns the real start and says "frame-aligned"; `--exact` gives the frame asked for.
3. `frames --at 1,end --sheet` writes the PNGs and a sheet whose cells carry the times; the first and last frames match the source.
4. `sound` of a fixture of known loudness (a generated tone at a known level) gives its LUFS within 0.1 LU, and the same number as `inspectAudio` for the same samples.
5. No ffmpeg on the machine (the test removes it from `PATH`) and the four commands still work; with no Chrome, `probe` and `trim` (copy) still work and the others fail with a sentence that says what is missing.
6. A bad path, a file that is not media, an empty file and a start after the end each give exit 1 with a sentence, never a stack trace.

## Open questions (to settle in the first days, not decide here)

1. **A trim that starts between frames.** mediabunny wrote the cut with a pre-roll key packet and a negative start (an edit list). ffmpeg's decode showed the first ~4 frames as earlier frames of the source; QuickTime, Chrome's `<video>` and VLC were not looked at. If real players differ, the default for an off-boundary start becomes `--exact`, or the tool snaps to a boundary and says so.
2. **Only H.264 + AAC from our own renderer was tried.** The fixtures must include a phone video (rotation, variable frame rate), a WebM (VP9 + Opus) and a MOV.
3. **Command names.** Top-level (`pixi-effects probe`) is short but crowds the namespace beside `check` and `render`; the alternative is `pixi-effects media probe`. Preference: top-level, as agents type the shortest thing.
4. **Whether `@mediabunny/server` (NodeAV, native ffmpeg inside) should be an optional engine** so that decoding commands could run with no Chrome. Not for the first version: it adds a native dependency.

## Release shape

One minor version (0.38). CHANGELOG, `help media`, SKILL.md, README ("if you have ffmpeg, use it for long transcodes"), `llms-full.txt`, `docs/api-surface` not affected (no library API). The landing page and FACTS are not touched until the commands are used on real footage by a few fresh agents (as with the canvas trial), so claims on the site come from what they did, not from this design.
