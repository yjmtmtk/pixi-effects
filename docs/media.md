# Media tools: look at, listen to, cut and join footage

Six commands for an AI agent (or a person) who is handed a video or a sound and has no ffmpeg: `probe` says what is in it, `frames` shows it, `sound` measures it, `trim` cuts it, `concat` joins clips, `audio` takes the sound out. They read and write files with [mediabunny](https://mediabunny.dev) (which ships with pixi-effects), so there is nothing else to install; the ones that decode or re-encode use the headless Chrome that `check` and `render` already use.

**If ffmpeg is installed and the job is a long transcode, use ffmpeg.** It is faster at that, and it does far more. These commands are for the other cases: no ffmpeg, a quick look, and answers shaped for an agent: structured output (`--json`), the real times of a cut, and no flag-order traps.

Exit code: **0** done · **1** a problem (the file, the browser, the job as asked) · **2** usage. Every command prints a short report, or the same facts as JSON with `--json`. A file argument is a path or an `http(s)` URL. A mistake is one sentence that names the file and what to do, never a stack trace.

## Media

```
pixi-effects probe  <file|url> [--keyframes] [--expect "…"]      what is in it: codecs, size, rotation, sound   (help probe)
pixi-effects frames <file|url> [--at 1,50%,end] [--sheet]        pictures of a video, and a contact sheet       (help frames)
pixi-effects sound  <file|url> [--waveform] [--window 0.5]       loudness, peak, silences, loudest stretch      (help sound)
pixi-effects trim   <file|url> <start> <end> -o <out> [--exact]  cut it, and say the real times                 (help trim)
pixi-effects concat <a> <b> [<c> …] -o <out>                     join clips by copy, and say where each starts  (help concat)
pixi-effects audio  <file|url> -o <out.m4a>                      the sound of a file, copied out                (help media: `help audio` is the DSL's audio layer)
```

All of them take a path or an `http(s)` URL and `--json`. `probe`, `trim` by copy, `concat` and `audio` need no browser; `frames`, `sound` and `trim --exact` use Chrome. A mistake exits 1 (the file, the browser, the job as asked) or 2 (usage) with one sentence.

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

Container, duration, size, and a row per track: codec, size **as it is shown** (a rotated clip says `180×320 shown (stored 320×180, turned 90° clockwise)`: the stored size, the shown size and the direction are all there, and whether the picture then reads upright depends on how the file was made, so look at a frame), frame rate (and whether it varies), bitrate, sample rate, channels. `--keyframes` lists the key packets (the only places a cut by copy can start). Notes say what an author would trip on: `no audio`, `no video`, `rotated 90°`, `variable frame rate`, `the video starts at 0.5 s` (the first frame is not at 0, so the sound can start before the picture). Runs in Node, no browser.

**Check a file against what it must be: `--expect`.** A platform or a brief asks for numbers (a size, a frame rate, a frame count, a bitrate, no sound). Write them, and `probe` measures the file (every packet, not a header) and answers one line each, exit 1 when one does not hold:

```sh
npx pixi-effects probe footage.mp4 --expect "size=320x180 fps=30 frames=181 audio=aac container=mp4"
```

```
  ok    size      320x180  (wanted =320x180)
  ok    frames    181  (wanted =181)
  …
RESULT: all 5 expectations hold
```

The words: `size` (`3840x2160`), `width`, `height`, `fps`, `frames`, `duration` (seconds, right to half a frame), `bitrate` (of the whole file's picture: `35M`, `800k` or bits a second), `video` and `audio` (a codec, `none` or, for audio, `any`), `container`. Operators: `=` `!=` `>=` `<=` `>` `<` (`size`, `video`, `audio` and `container` take only `=` and `!=`). Separate by spaces or commas; a misspelt word gets `did you mean`. `--json` adds an `expect` list with `got` and `ok` for each. Remember: a render's `bitrate` is a ceiling, not a target (a quiet or mostly black picture is written far under it): ask `probe` what the file really has.

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

Read `got`, not `asked`: `--json` has `requested`, `actual`, `reencoded`. A range with no key frame inside it (a cut shorter than the gap between key frames) is refused with the key frames around it. The cut is made starting ON that key frame, so picture and sound start together at 0 and the file is as long as `got` says (checked by reading the file back: both tracks start within 0.05 s of 0 and last what the report says). Why not mediabunny's default, which starts exactly where asked by writing the frames before it as hidden earlier frames: it plays right in Chrome and in ffmpeg (measured), but other players treat those hidden frames differently and were not measured, and a glitch there would be invisible to an agent. The report is read back from the written file, not predicted; the output is made aside and moved into place only when it worked, so a refused copy leaves no file and never empties one that was there. `probe --keyframes` lists where a copy can start.

**`--exact`** re-encodes the picture in the browser so the cut starts on the frame asked for (the sound is copied, not re-encoded: its packets are the source's own); `actual` is read back from the file, so it is where the picture really stops. The cut is held in memory until it is written, so it is for clips, not for hours: for those, ffmpeg.

## concat

```sh
npx pixi-effects concat footage.mp4 footage.mp4 -o joined.mp4
```

```
joined.mp4  1.9 MB
  2 clips, 12.07 s, joined by copy (no re-encode): video avc, audio aac
  1  footage.mp4  0–6.03 s
  2  footage.mp4  6.03–12.07 s
```

`concat <a> <b> [<c> …] -o <out>`: the clips one after another, in the order given, by copy: the packets are the sources' own bytes, so there is no loss and it takes a moment. The report says where each clip starts in the output (`from`), which is where to look for a seam with `frames`.

**What a copy cannot hide is refused, naming what differs**: the video or audio codec, **the decoder parameters** (two H.264 or HEVC files with the same codec name can have different profile, level or parameter sets, and a joined file can carry only the first clip's, so the others would decode as garbage: this was found by a review on two real encodes), the shown size, the rotation, the sample rate, the channel count, or sound in one and not in the other. Make them the same first (re-encode them with ffmpeg, whose concat filter does that). Clips from one phone with the same settings usually have the same parameters; a clip you cut with `trim` (by copy) joins the clips it came from; a `trim --exact` cut is re-encoded by the browser and usually has other parameters, so it is refused unless they happen to match.

**The seams.** Each clip starts where the longest track of the one before it ends, and its picture and sound keep their own offset to each other (a sound that begins 0.5 s after its picture still does, in every clip; one start per clip, not one per track, which is what kept them together over many joins). The encoder-delay packet of AAC (the one before time 0, which decodes to silence) is not copied into the middle of the file. If a clip's sound is much longer or shorter than its picture the report says so: the picture ends first and its last frame stays on screen while the sound goes on. Only the first picture and the first sound track of a clip are joined (a clip with two sound tracks says so). For clips with a picture the output is `.mp4`, `.mov`, `.webm` or `.mkv` (`.m4a` and `.mka` are for sound only). The output is made aside and moved into place when it worked: a refused join leaves no file and no new folder and never empties one that was there; an existing output needs `--force`; the output cannot be an input under another spelling of its name either (`A.MP4` for `a.mp4` on a disk that ignores case). Inputs are opened one at a time, so hundreds of clips are fine.

## audio

```sh
npx pixi-effects audio footage.mp4 -o sound.m4a
```

`audio <file> -o <out>`: the first sound track of a file as a file of its own, copied: the packets are the source's, nothing is re-encoded. The output type decides what can go in: AAC → `.m4a`, Opus or Vorbis → `.webm`, anything → `.mka`; a codec the type cannot hold is refused naming the codec and a type that can. A file with no sound is refused. Whether the first AAC packet (the encoder delay, before time 0, which no player plays) is kept depends on how the file was made: it was left out of a file from our renderer and kept in one from ffmpeg. If the sound began later than the picture in the source (a phone clip's often does), the report says so: the new file starts at 0, so that offset is gone. `sound` measures the result like any file.

## frames

```sh
npx pixi-effects frames footage.mp4 --at 0.5,50%,end --sheet -o looks
```

`frames <file> [--at <list>] [--size 480] [--sheet] [-o dir]`: a PNG of the frame at each time, named by time (`01-0.50s.png`), and with `--sheet` one **contact sheet** (`sheet.png`: every frame with its time under it) so a whole clip is one picture to look at. `--at` takes seconds (`3.5`), a percentage (`50%`), a frame (`f120`), `start`, `end` (the last frame) and `every:2s`, separated by commas (`--at every:2s,end`; with a space, quote the whole value: `--at "every 2s"`); the default is `0,25%,50%,75%,end`. At most 60 frames. `--size` is the width in pixels (default 480; a smaller video is not enlarged). A rotated video comes out the way up it is shown. A time past the end of the file is refused with the length of the file; a time before the first frame (a video that starts at 0.5 s, which `probe` says) gives the first frame; `end` and `%` are of the VIDEO, not of a longer sound. Pictures with the same names in an existing folder are replaced and nothing else in it is touched or removed.

The words are the ones `check --at` uses where they overlap (seconds, `%`, `f120`), so a time you read off one works in the other.

## sound

```sh
npx pixi-effects sound footage.mp4 --waveform -o sound-report
```

```
footage.mp4
  6.036 s · 48000 Hz · 2 ch
  loudness  -12.7 LUFS · true peak -10.4 dBTP · peak -11.9 dBFS · 0 sample(s) at full scale
  silences  none (nothing quieter than −60 dBFS for a second or more)
  level     -15 -15 -15 -15 -15 -15 dBFS rms, every 1 s
```

Integrated loudness (ITU-R BS.1770), true peak, the number of samples at full scale, silences with their times, the level over time in rows of `--window` seconds (default 1; the rows are in the text with one decimal and in `--json` with their times), the **loudest and quietest** rows with times, and a `reference` line: web video is typically −14 to −16 LUFS, so it says how many LU under (or over) −14 this is and the **headroom** (how many dB it can be raised before the true peak reaches −1 dBTP), and whether raising it to −14 would need a limiter (plain gain would clip). The `notes` are the library's advice and start late on purpose: **below −24 LUFS** (quiet), **above −9 LUFS** (loud), or less than 1 dB of headroom, so an empty note does not mean "fine for the web": read `reference`. `--waveform` writes `waveform.png`. These are the numbers `check` gives for a movie's mix, from the same code (`inspectSound`, see [the API reference](./api.md)), so a clip you measure here and the movie you check agree. Measured on one of our own exports, `sound` read the −14.8 LUFS that `check` had said (true peak −3.6 against −3.7: the file is AAC, `check` measured the mix before encoding); on a second, very quiet one it read −30 where `check` had said −29.7. The whole sound is decoded into memory, so it takes sounds up to 600 s; for longer, ffmpeg's `-af ebur128`. A last window shorter than half a window is not shown as a row (a file that ends 36 ms into a second would read −90 dBFS there).

## What it needs

- **No ffmpeg**, anywhere. A test runs every command with only `node` on `PATH`.
- **Chrome** for `frames`, `sound` and `trim --exact` (it decodes and re-encodes; `--chrome PATH` or `CHROME_PATH`); `probe` and `trim` by copy run without a browser. With no Chrome the three say so in one sentence.
- **Offline**: mediabunny comes from this package.
- Which codecs the browser can decode and encode depends on the machine. Headless Chrome on the author's Mac decoded and encoded H.264, HEVC, VP8, VP9, AV1, AAC and Opus; MP3 decodes only; no FLAC. A codec it cannot decode is named in the error.

## What was measured, and what was not

- A lossless cut of 5.6 s of a 3.9 MB file took 0.05–0.15 s in ffmpeg and 0.10–0.15 s with mediabunny in plain Node; a 5.6 s re-encode took 0.6–0.75 s in ffmpeg (the browser re-encode was not timed). **One file, one machine.**
- The files tried: H.264 + AAC made by our own renderer, the same as WebM (VP9 + Opus) and MOV, and a rotated and a one-track version of it; and **one real iPhone clip** (6.4 s, HEVC 1080×1920 stored 1920×1080 and turned 90°, variable frame rate around 59.94 fps, AAC, key frames every 0.93 s). On it: `probe` said all of that; `frames` came out upright and sharp in 2.4 s; `sound` read −41.8 LUFS (a quiet room) with its note; a copy cut took 0.2 s and kept HEVC; three cuts joined with `concat` (HEVC, 6.7 s) had their seams checked frame by frame, and `audio` gave a 127 KB `.m4a` that `sound` measured at the same −41.8 LUFS; `--exact` took 8 s and came out as H.264 (the note says so); the first and last frame of each of four cuts matched the source's frame at that time when put side by side. Not tried: other phones and cameras, ProRes sources, files over 1 GB, clips over a few minutes.
- A cut was checked in Chrome by playing it and reading the colour of every frame, and its packets were compared byte for byte with the source's. Not checked: QuickTime, VLC, a phone.
