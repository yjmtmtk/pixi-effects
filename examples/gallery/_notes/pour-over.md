# pour-over - usability notes
Model: opus   Slot: T18   Cycles: 9 checks (4 critique rounds)   Result: works
Timeline: started 13:49; brief.md written +5 min; first page that rendered at +8 min; first contact sheet looked at at +8; done at +18 (wall clock 13:49-14:07)

## Went smoothly because the docs said so
- `pixi-effects new pour-over --size 1080x1080 --duration 12` gave a working page at once.
- `help music` and `help sfx` answered everything about the sound in one read each (custom `voices` for a pour noise, musicbox for drops).
- `recipe draw-on-and-type` showed `trimEnd` on a line / path in one example.

## Stumbles   (one entry each, also small ones)
### 1. A path's `y` places its midpoint, not an offset   [SPEC-ODD]
- tried: a steam path drawn in canvas coordinates (`d: 'M 684 430 C ... 250'`) with `initial: { y: 0 }` and a keyframe `to: { y: -36 }` to drift it up.
- happened: the steam was drawn at the very top edge of the frame. No warning.
- cause: like `line`, a `path` placed with `x` / `y` puts its MIDPOINT there (the cheatsheet says "canvas coordinates like line", and only the `line` row spells out the midpoint rule). Without `y` the path sits where `d` says; with `y: 0` it jumps to the top.
- would have prevented it: the `path` / `polygon` rows of the cheatsheet repeating "(giving x, y places the shape's midpoint there: to drift it, start from that midpoint)"; or a warning when a canvas-coordinate shape gets `x`/`y` of 0 in `initial`.
### 2. A text-vs-line collision is not reported   [GAP]
- tried: the closing recipe line at the bottom-left, the ground line starting at x 440.
- happened: "3:00" touched the start of the ground line; `check` said "no cut-off / off-canvas text" (it only compares text with text). Seen only on the contact sheet.
- would have prevented it: `inspect` listing text that overlaps a stroked shape (review level, like text/text), or the lesson-of-round-3 note extended to "text vs. lines".
### 3. My own off-by-a-formula in the liquid timing   [MY-MISTAKE]
- the carafe kept filling until 12.65 s (LIQ_DUR derived from beat 19 instead of 14); nothing could have flagged it, the sheet did. The good part: deriving the drop landing heights from the same `level(t)` function kept the drops and the surface together after the fix.
### 4. A generated strand cut by the end of the movie warns   [none: the warning was right]
- tried: steam strands generated in a loop up to the end; the last one got `duration: 0.6` but keyframes at 1.0 s.
- happened: `unnamed shape layer: keyframes[1] starts at 1s, after the layer ends (duration 0.6s), so it never plays.` Clear and correct; I filtered the keyframes. (It would be friendlier if a keyframe that starts after the end were dropped silently when the layer was clearly cut by the composition's end, but the warning is honest.)
### 5. WebFetch would not return AGENTS.md verbatim   [TOOLING]
- the fetch tool summarised the page instead of quoting it; the repository copy (same text) was available, so no harm. A user without the repo would get only a summary of the start page.
### 6. `check --at` only, no export: the full run is slow on a busy machine   [TOOLING, minor]
- the same full check took 23 s, 35 s and 77 s (other agents on the machine). `--no-export --at` stayed ~20-25 s, mostly page loading.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch: the fetch tool refused to return it verbatim and gave a summary; I used the identical local copy in the repo instructions)
- skills/pixi-effects/reference/quickstart.md, SKILL.md
- `recipe` (list), `recipe draw-on-and-type`, `help music`, `help sfx`, `help mask`
- cheatsheet.md grep: shape geometry table, particles signature

## Wished the library had
- a `spiral()` / `pathPoints(d)` helper: I measured an Archimedean spiral by arc length by hand so that the top-view dot, the trimEnd stroke and the side-view kettle sway stay in step. `followPath` covers the dot, but not "give me the point at fraction f" for driving another layer.
- a "steam" or looping draw-on helper (draw on, wipe off, again: a `repeat` on trimEnd + trimStart together); I generated one layer per cycle.
- a way for one audio layer to say "loudness target" (I left the piece at −22 LUFS on purpose; reaching −16 would mean guessing volumes).

## Self-assessment
1. The top half of the closing frame is empty paper with only the steam: intended as "ma", but on a small thumbnail it may read as unbalanced. With more cycles I would try the dripper being lifted off at 10.5 s so the carafe and its steam become the single object of the end.
2. The kettle is a cropped silhouette that enters and leaves on a plain translate + tilt; it has no weight (no settle, no small recoil when the pour stops). I would add a 2-3 px settle at 4.1 and 8.7 s.
3. Sound: the pour is filtered noise with a flat level; a real pour changes pitch as the water level rises (higher as the bed fills). I would sweep the bandpass from 1400 to 2400 Hz over the main pour, and give the grains a softer, sandier sound than a low click.

## Process log
- +8 min: first page rendered, first check (no warnings), first contact sheet looked at.

### Critique round 1 (sheet at 0-13 s + frames 2, 5, 7.5, 10, 12)
1. 10.6-13 s: the steam is drawn at the very top edge of the frame (y ~ 20-60), not above the dripper. My `initial: { y: 0 }` on a path moved its MIDPOINT to y = 0.
2. 3.5-9.5 s: the gooseneck is a lone wavy wire; with no kettle body it does not read as a kettle at all.
3. 10.6-13 s (the poster): the end is top-heavy: title block at y 300-530, then 400 px of empty paper down to the recipe line at the ground. The ending should settle downwards, onto the ground line.
4. 1.2-2.4 s: grains appear in mid-air (fine), but nothing else to fix there yet.
- +10 min: round 1 fixed (kettle body added, steam y set to the path's midpoint, final title moved down onto the ground line).

### Critique round 2 (frames 4.8, 7.8, 11, 12.5)
1. 4.8-9.5 s: the kettle body is an outline cropped by the frame: it reads as a "(" bracket plus a stray lid line, not as a kettle.
2. 11-13 s: the recipe line "HAND DRIP · ... · 3:00" ends at x ~ 466 and touches the start of the ground line (x 440): a collision `check` does not report (text vs. a line).
3. 10-13 s: the steam is two short strands that read like quotation marks "((": too short, too regular.
- +12 min: round 2 fixed (kettle body filled with the dust tone + a collar, ground line shortened to clear the recipe line, three seeded steam strands).

### Critique round 3 (frames 0.8, 1.6, 3.2, 6.4, 9.4, 10.4 + waveform)
1. 11.0-12.65 s: the carafe keeps filling until 12.65 s although the last drop lands at 10.5 s: the end is not really held (only ~0.35 s of stillness), and liquid rising with no drops is physically wrong. (LIQ_DUR was derived from beat 19 by mistake.)
2. 4.3-6.0 s ("Let it breathe."): the bloom is only a dome that grows; nothing on it says "gas escaping": it reads as a shape scaling, not as coffee breathing.
3. 9.4-10.0 s: the copper pool lingers over the bed after the stream has stopped and the kettle has gone; it should drain faster (it fades over 1.2 s starting 8.8 s).
- the waveform: the bar-2 entry of the bass at 3 s is a step of ~8 dB; acceptable (it is the kettle's entrance), kept.
- +14 min: round 3 fixed (level now settles at 11.0 s, so the end holds 2 s; seven gas rings open on the bloom at 4.75-5.95 s; pool drains by 9.0 s). Looked at 5.2 / 5.6 cropped at full size: the rings read.

### Critique round 4 (full check, sheet 0-13 s)
1. 11.8-13 s: the steam strands drift up and lose their lower half (trimStart), so at the last frame they float detached a third of the way above the rim: three squiggles in the air, not steam rising from the coffee.
2. 10.6-13 s: the steam is the only thing that moves in the held end; it should keep breathing (draw up, thin away, again) instead of freezing into a final shape.
3. 1.17 s: the carafe handle starts drawing as a lone dash left of the half-drawn glass (minor, it lasts 3 frames; kept).

### Critique round 4 result
- steam now cycles (draw up, thin away, again) from 9.8 s to the end; last strand's keyframes filtered to its cut duration. Full check: no warnings, OK, export 859 KB mp4, 13.03 s 1080x1080, −22.2 LUFS (quiet by design), true peak −8.5 dBTP. Poster (12 s) looked at.
