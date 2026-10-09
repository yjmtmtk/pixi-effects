# 09-sound — stumble notes
Model: opus (Claude Opus 5.5, self-reported)   Cycles: 7 (chapter) + 4 (music loudness)   Result: works

## Went smoothly because the docs said so
- The `music` notation (beats, `:len`, chords like `Am7@4`, drums as 16-step strings, a list of `{ from, to }` sections) worked first time with no warnings; building every track bar by bar from arrays and joining with ` | ` made pitfall 58 (beats must add up) easy to guard (music.js warns per bar).
- "Line a picture up with a note: `at + beat × 60 / bpm`" (dsl.md music) is exactly how the chapter lights each note; sync is by construction.
- `bpmEnvelope` + `react({ audioOffset })` for the playhead glow and the blinking cursor: the offset rule ("where in the sound the layer's start is") was clear.
- `measureText` being synchronous made the drum lanes possible: the literal `'x...x...'` string with `letterSpacing = 37.5 − advance` puts each character on its 16th.
- A composition (width 6000) masked by a named gradient matte (`{ layer, channel: 'alpha' }`) gave a soft-edged scrolling window in one go.

## Stumbles
### 1. The chapter cannot see the plan   [SPEC-ODD]
- tried: to place the chapter in the music I need its reel start (59.6 s) and the music layer's `at` (1.4 s). `P` has `music` but no `plan` (and `planOf` needs the table, which the chapter does not get).
- happened: both numbers are written as constants in 09-sound.js, with a comment naming where they come from.
- would have prevented it: `shared.js` passing `P.plan` (and the music layer's `at`, e.g. `P.musicAt`) to chapters.

### 2. `volume: 0.5–0.7` and `-18…-14 LUFS` cannot both hold   [SPEC-ODD]
- tried: the brief's layer `volume` 0.6.   - happened: `-23.2 LUFS · true peak -10.1 dBTP` for the music alone.
- cause: the score is normalised to peak at −6 dBFS at `volume: 1` (dsl.md says so), so track `vol` values only change the balance, never the loudness; only the layer `volume` (and a lower crest factor) does.
- result: `volume: 1.22` gives the whole reel −18.2 LUFS, true peak −3.8 dBTP. Worth one line in the brief / pitfall 61: "a full arrangement needs `volume` ≈ 1.1–1.3 to reach −18 LUFS".

### 3. `visible: false` on a text layer is reported as a layout PROBLEM   [TOOLING]
- tried: hiding roll tokens that scrolled out of the window with `set: { visible: false }` (to keep the overlap review list short).
- happened: `text layer "roll/pad-tok-0" has no size (empty text, or not drawn yet)` → RESULT: 5 problems.
- fix: `set: { alpha: 0 }` instead. A hidden layer should probably be skipped by `inspect` like a transparent one.

### 4. Overlap review ignores masks   [TOOLING]
- happened: `text layers "roll/kick-steps-28" and "lane-kick" overlap by 100%` although the roll is masked to x ≥ 300 and the lane names sit at x = 96. Only a review item, but every scrolling-under-a-matte design will produce these.

### 5. Keyframes past the layer's end warn   [MY-MISTAKE]
- happened: `layer "pad-bar-5": keyframes[1] starts at 9.8s, after the layer ends (duration 8s), so it never plays` (+93 more). Notes in the look-ahead get their light-up keyframes after 8 s; filtered out with `k.at < D`. Clear warning, good grouping ("93 more layers with the same problem").

### 6. Notes that had already ended flashed at 0 s   [MY-MISTAKE]
- tried: `at: Math.max(0, t0)` set + `at: Math.max(0, t1)` fade for every note.   - happened: notes that ended before the chapter started lit up for 0.35 s at frame 0 (seen on the contact sheet, not by any check).
- fix: the initial state says whether the note is past, sounding or ahead; keyframes only after 0 s.

### 7. Section changes vs. chapter cuts   [GAP]
- Chapter starts are 6.4 / 7.4 s apart, so no single tempo puts every cut on a bar line. I searched bpm × offset in a scratch script: 120 BPM starting at 1.4 s puts every section change within −0.2…+0.8 s of a cut (inside or just after the transition). A tempo map would be exact, but would complicate drawing the score. A small `music` helper ("bar of a time / time of a bar") or a doc line on aligning a score to cuts would help.

### 8. Measuring the whole reel's loudness   [TOOLING]
- The one-chapter page does not play the music, and rebuilding `pixi-effects-reel.html` is not an author's file. I made a scratch page (symlinks to `dist/` and `examples/showreel/`, `--root` on check) that assembles every chapter + music like reel.src.html. A `chapter.html?music=1` mode (or `?ch=all`) would make this one command.

## Wished the library had
- `P.plan` (see 1) and a way to name a score's bar for a time.
- A `music` option to normalise to a loudness instead of a peak (so `vol` balance and loudness are separate knobs, and the brief's 0.5–0.7 would work).
- `inspect` honouring masks and `visible: false`.
- `musicEnvelope` in a synchronous chapter: it is async, so `react()` here follows a `bpmEnvelope` on the same tempo instead of the real score (fine for the kick, but the glow cannot follow the melody).
