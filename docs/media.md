# Media tools: look at, listen to and cut footage

Four commands for an AI agent (or a person) who is handed a video or a sound and has no ffmpeg: `probe` says what is in it, `frames` shows it, `sound` measures it, `trim` cuts it. They read and write files with [mediabunny](https://mediabunny.dev) (which ships with pixi-effects), so there is nothing else to install; the ones that decode or re-encode use the headless Chrome that `check` and `render` already use.

**If ffmpeg is installed and the job is a long transcode, use ffmpeg.** It is faster at that, and it does far more. These commands are for the other cases: no ffmpeg, a quick look, and answers shaped for an agent: structured output (`--json`), the real times of a cut, and no flag-order traps.

Exit code: **0** done · **1** a problem (the file, the browser, the job as asked) · **2** usage. Every command prints a short report, or the same facts as JSON with `--json`. A file argument is a path or an `http(s)` URL. A mistake is one sentence that names the file and what to do, never a stack trace.

## Look before you use footage

Footage you have not looked at is footage you do not know. Before a clip goes into a video: `probe` it (size, length, rotation, sound), look at a few frames with `frames --sheet` and read the numbers of `sound`. A clip from a phone is often rotated and has a variable frame rate; a screen recording often has no sound; a download may be 4K when the video is 720p. Each of those is one line of `probe`.

```sh
npx pixi-effects probe footage.mp4
npx pixi-effects frames footage.mp4 --sheet -o looks
npx pixi-effects sound footage.mp4
```

## probe

```sh
npx pixi-effects probe footage.mp4 --keyframes
```

```
footage.mp4
  MP4 · 6.036 s · 53 KB
  video  avc 320×180 · 30 fps · 8 kb/s
  audio  aac 48000 Hz · 2 ch · 157 kb/s
  key packets at: 0, 2, 4, 6 s
```

Container, duration, size, and a row per track: codec, size **as it is shown** (a rotated clip says `180×320 … rotated 90°`), frame rate (and whether it varies), bitrate, sample rate, channels. `--keyframes` lists the key packets (the only places a cut by copy can start). Notes say what an author would trip on: `no audio`, `no video`, `rotated 90°`, `variable frame rate`. Runs in Node, no browser.

## trim

```sh
npx pixi-effects trim footage.mp4 2 4 -o cut.mp4
npx pixi-effects trim footage.mp4 3.3 4.9 -o cut.mp4 --force
npx pixi-effects trim footage.mp4 3.3 4.9 -o cut.mp4 --force --exact
```

`trim <file> <start> <end> -o <out>`: times are seconds (`12.5`) or `1:02.5`. The output type follows the extension (`.mp4 .mov .webm .mkv .m4a`); an existing file is only replaced with `--force`.

**By copy (the default)** nothing is re-encoded: the picture and sound are the source's own bytes, so there is no loss and it takes a moment. A copy can only start on a **key frame**, so it starts on the next one and says so:

```
cut.mp4  13 KB
  asked 3.3–4.9 s, got 4–4.9 s
  copied: video avc, audio aac (no re-encode)
  note   a copy can only start on a key frame: it starts on the next key frame, 4 s, not 3.3 s (0.7 s later); use --exact to start on 3.3 s …
```

Read `got`, not `asked`: `--json` has `requested`, `actual`, `reencoded`. A range with no key frame inside it (a cut shorter than the gap between key frames) is refused with the key frames around it. Why the next key frame and not mediabunny's default of starting exactly where asked with hidden earlier frames: the default file plays right in Chrome and in ffmpeg (measured), but other players treat those hidden frames differently and were not measured, and a glitch there would be invisible to an agent; this file is plain and right everywhere. `probe --keyframes` lists where a copy can start.

**`--exact`** re-encodes in the browser so the cut starts on the frame asked for. The cut is held in memory until it is written, so it is for clips, not for hours: for those, ffmpeg.

## frames

```sh
npx pixi-effects frames footage.mp4 --at 0.5,50%,end --sheet -o looks
```

`frames <file> [--at <list>] [--size 480] [--sheet] [-o dir]`: a PNG of the frame at each time, named by time (`01-0.50s.png`), and with `--sheet` one **contact sheet** (`sheet.png`: every frame with its time under it) so a whole clip is one picture to look at. `--at` takes seconds (`3.5`), a percentage (`50%`), a frame (`f120`), `start`, `end` (the last frame) and `every 2s`, separated by commas; the default is `0,25%,50%,75%,end`. At most 60 frames. `--size` is the width in pixels (default 480; a smaller video is not enlarged). A rotated video comes out the way up it is shown. A time past the end of the file is refused with the length of the file.

The words are the ones `check --at` uses where they overlap (seconds, `%`, `f120`), so a time you read off one works in the other.

## sound

```sh
npx pixi-effects sound footage.mp4 --waveform -o sound-report
```

```
footage.mp4
  6.036 s · 48000 Hz · 2 ch
  loudness  -12.7 LUFS · true peak -10.4 dBTP · peak -11.9 dBFS · 0 sample(s) at full scale
  silences  none (nothing quieter than −70 dBFS for a second or more)
  level     -15 -15 -15 -15 -15 -15 dBFS rms, every 1 s
```

Integrated loudness (ITU-R BS.1770), true peak, the number of samples at full scale, silences with their times, the level over time, and notes (quiet or loud for web video, little headroom). `--waveform` writes `waveform.png`. These are the numbers `check` gives for a movie's mix, from the same code (`inspectSound`, see [the API reference](./api.md)), so a clip you measure here and the movie you check agree. Measured on one of our own exports, `sound` read the −14.8 LUFS that `check` had said (true peak −3.6 against −3.7: the file is AAC, `check` measured the mix before encoding); on a second, very quiet one it read −30 where `check` had said −29.7. The whole sound is decoded into memory, so it takes sounds up to 600 s; for longer, ffmpeg's `-af ebur128`. A last window shorter than half a window is not shown as a row (a file that ends 36 ms into a second would read −90 dBFS there).

## What it needs

- **No ffmpeg**, anywhere. A test runs every command with only `node` on `PATH`.
- **Chrome** for `frames`, `sound` and `trim --exact` (it decodes and re-encodes; `--chrome PATH` or `CHROME_PATH`); `probe` and `trim` by copy run without a browser. With no Chrome the three say so in one sentence.
- **Offline**: mediabunny comes from this package.
- Which codecs the browser can decode and encode depends on the machine. Headless Chrome on the author's Mac decoded and encoded H.264, HEVC, VP8, VP9, AV1, AAC and Opus; MP3 decodes only; no FLAC. A codec it cannot decode is named in the error.

## What was measured, and what was not

- A lossless cut of 5.6 s of a 3.9 MB file took 0.05–0.15 s in ffmpeg and 0.10–0.15 s with mediabunny in plain Node; a 5.6 s re-encode took 0.6–0.75 s in ffmpeg (the browser re-encode was not timed). **One file, one machine.**
- The files tried: H.264 + AAC made by our own renderer, the same as WebM (VP9 + Opus) and MOV, and a rotated and a one-track version of it. Not tried: files from phones and cameras at length (a trial on real footage is done before this is promoted), HEVC or ProRes sources, files over 1 GB.
- A cut was checked in Chrome by playing it and reading the colour of every frame, and its packets were compared byte for byte with the source's. Not checked: QuickTime, VLC, a phone.
