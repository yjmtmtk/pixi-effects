# yakou-ressha - usability notes
Model: opus   Slot: T26   Cycles: 6 (edit/check/look), 3 written critique rounds   Result: works
Timeline: started 13:49; brief written +4 min; first page that rendered at +6 min (no warnings on the first try); first contact sheet looked at at +6; done at +17 (wall clock)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart -> SKILL.md got me to `new`, `help`, `recipe` in three reads; `help mask`, `help composition`, `help polygon` answered exactly the questions I had (mask stays in parent coordinates; a composition does not clip but is culled by its rectangle; polygon/path points are canvas coordinates when no x/y).
- `recipe music-lofi` + the cheatsheet audio paragraph (via `help sfx`) gave the whole music/sfx vocabulary.

## Stumbles
### 1. WebFetch cannot return AGENTS.md verbatim   [TOOLING]
- tried: WebFetch of the raw AGENTS.md, as the brief says.
- happened: the fetch tool returned only a summary ("I can't return the full text verbatim"); it lost the exact commands (`--no-install`, the `node ai/tools/...` fallback).
- cause: the agent's fetch tool summarises long pages; nothing the library controls.
- would have prevented it: nothing in the docs; the local copy (also in CLAUDE.md here) carried the exact text. A two-line "if your fetch summarises, the commands are: ..." at the top of AGENTS.md would make the summary keep them.
### 2. No way to measure one source's own loudness   [GAP]
- tried: to balance the music against the rail/rumble bed, I wanted each group's level.
- happened: `check` gives the mix and per-second RMS; the round-3 lessons warn `inspectAudio().sources[].peakDb` is not a source's own level. I made two throwaway copies of the page (music muted / everything but music removed), rendered each to `.wav` with `pixi-effects render x.html -o x.wav`, and measured them with ffmpeg ebur128 (-20.3 vs -23.7 LUFS).
- cause: no per-source or per-group loudness in the report.
- would have prevented it: `check --solo music` / `render --only <layer names>` (or `inspectAudio({ group: [...] })`) that measures a subset of the sound layers; or per-source LUFS in `report.audio`.
### 3. A shoreline drawn by my polygon stood as a cliff in the water   [MY-MISTAKE]
- tried: a hill strip whose ridge falls to the water line and then jumps to the base.
- happened: a vertical dark wall in the lake (seen at 4.5 s). Not a library issue; the contact sheet caught it immediately.
### 4. `echo ======` in zsh   [MY-MISTAKE]
- a separator line in my shell command was read by zsh as `=cmd` expansion ("===== not found") and made the help command look like it failed (exit 1). Not the library.
### 5. Small: `help blur` returns depth-of-field and motion blur first   [SPEC-ODD]
- tried: `help blur` to find the plain blur filter's options.
- happened: pitfall 75 (DoF) and the motion-blur section came first; the filter table started at the end of the screen. I did not need it in the end (a radial `fillGradient` did all the soft light).
- would have prevented it: rank the `filters` table entry for `blur` first when the word is exactly a filter type.

## Docs I read, and which answered my question
- Answered: quickstart.md (anchors, polygon coordinates), SKILL.md (sfx, music, masks, blend modes), `help mask` (inverted mask for the cabin wall's window hole), `help composition` (no clipping, culling by rectangle: why each scrolling strip is a composition as wide as its travel), `help polygon` (canvas coordinates; move it by wrapping in a composition), `help radius` (cornerRadius, fillGradient radial for halos), `help sfx` (custom voices for the rail clack, the tunnel roar and the crossing bell), `recipe music-lofi`, `recipe wiggle` (shimmer of the moon's reflection).
- Did not answer: `help blur` (see stumble 5); nothing told me how to hear one part of the mix on its own (stumble 2).
- Also: WebFetch of AGENTS.md (the fetch tool only summarises; the local copy was what I followed), quickstart.md, SKILL.md, `help mask`, `help radius`, `help blur`, `help sfx`, `help composition`, `help polygon`, `recipe music-lofi`, `recipe wiggle`.

## Phase log
- +6 min: first page rendered with no warnings at the first try (check OK, 23 s for --no-export with 7 --at frames). +6 min: looked at at.png and frames/*.png.

### Critique round 1 (looked at at.png, frames 0.6 / 1.6 / 2.2 / 4.5 / 7 / 9.5 / 11.8)
1. 4.5-8 s: the mid hills end in a vertical cliff standing in the lake (my polygon jumps from HORIZON+18 to 760 at the shore). Fix: a diagonal near shore that sinks below the window.
2. 8.4-9.6 s: the last wire span (my "veers away" idea) is a long diagonal across the lake and the moon's reflection. Fix: wires end at the last pole.
3. 9.5-13 s: the moon reflection is a regular ladder of equal bright lines. Fix: thinner, random widths and gaps, dimmer.
4. all: the lamp's reflection in the glass reads as a brown smudge once outside is lit; the window frame is a saturated blue UI outline. Fix: reflection to 0.15 after the tunnel; frame closer to the wall colour.
5. 0-1.2 s: the tunnel is a black void with three lamps: add ribs (segment joints) that streak by. Far ridge too smooth (sine blob): sharper peaks + two far lights to show the slow layer moving in the final hold.

### Critique round 2 (full check with export, sheet.png + waveform.png + frames 8.6 / 11.8)
1. 11.8 s (the poster): two far amber lights sat exactly on the moon's reflection, reading as stray dots. Moved them so they drift past right of it.
2. all: the sky gradient had a dark band at y 280-350 above the haze (my 0.55 stop): four smoother stops.
3. all: the embankment grass was a regular scallop (abs(sin)): seeded random tufts instead.
4. 2.4-8 s: the middle is monotonous (poles and hills only) and the cabin wall stays empty for 8 s. Added a level crossing between two poles (lamps taking turns, crossbuck) with its bell ringing past: louder as it passes, panned right to left, a little lower after it passes (Doppler).
5. sound: stems rendered separately (music only -20.3 LUFS, bed only -23.7 LUFS; whole -19). Raised all a little to -17 LUFS; text now starts 0.3-0.4 s earlier so the final hold is about 1.5 s.

### Critique round 3 (onion 0.9-2.6 s, frames 1.3 / 1.8 / 2.1 / 11.6)
1. 1.2-2.3 s: the tunnel mouth is a flat light slab: now a horizontal gradient, lit on the outside edge.
2. all: the lamp was an amber pill that read as a UI button: now a stem, a trapezoid shade and a paper-white bulb line.
3. 10-13 s: the far mountains almost vanish into the horizon haze in the final hold: darker far tone so the far shore reads.
4. 5.9 s: the crossbuck floated above its post: post lengthened.

## Wished the library had
- A per-source / per-group loudness measurement (`check --solo <names>`), see stumble 2.
- A `scroll` / `parallax` helper: "this composition slides at N px/s for the whole movie" is one keyframe, but the strip width you need (speed × duration + canvas width) and the time a strip-x passes a screen-x ((X - screenX) / speed) I computed by hand for every element (shore under the moon at 8.1 s, crossing at the window centre at 6.1 s). A helper that takes `speed` and lets children say `passAt: 6.1, screenX: 516` would remove the arithmetic.
- Vertical Japanese text (known): one layer per character worked fine here because the lines had no 、。 or small kana.
- A sustained noise bed longer than 10 s: an sfx is capped at 10 s, so the train rumble is two layers cross-faded at 10.4-11.2 s.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The whole picture is very dark and low in contrast (by intent, but in a gallery grid of small posters it may read as murky). I would lift the horizon glow and the water a little and test the poster at thumbnail size.
2. The lamp reflection on the glass (top right of the window) still reads as a smudge rather than a reflection; a reflection of the vertical words and the shade, mirrored and very faint, would sell the glass better.
3. The music is three chords and seven music-box notes; it is quiet as wanted, but the final chord just fades with the volume keyframe instead of a written last bar with a resolution timed to the last character of the text. I would time the last melody note to the moment 「る」 lands (about 11.4 s) and end the pad on a written release.
