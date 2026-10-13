# nenrin - usability notes
Model: opus   Slot: T31   Cycles: 6 (edit / look)   Result: works
Timeline: started 13:49; first page that rendered at +9 min (13:58, first try, no warnings); first contact sheet looked at at +10; done at +19 (14:08)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md was a short, clear path; `new nenrin --size 1080x1350 --duration 13.2` made the page in one go.
- `help music` printed the whole score syntax (rest `_`, chord names, instruments, `vol` as `[beat, level]` points, `ring`, `reverb` per track) in one screen; the check's music read-back confirmed every track was 5.5 bars and that the musicbox notes land on beats 4-7 (= the four seasons of year 1 at 2.4 / 3.0 / 3.6 / 4.2 s). No drift, no warning.
- SKILL.md's `null` + `parent` paragraph: a null at the pith with `scale` keyframes = a camera pull-back; a nested null (`faceRig`, parented to it) scales the cut face from the pith. Path `d` written relative to (0, 0) is drawn in the null's space, as I hoped.
- `trimEnd` on a path with 1600 sub-paths walks them in order (cheatsheet "Draw-on" line): the bark is swept on round the trunk with one keyframe.
- Text `{value}` + `set: { value: k }` keyframes for the age counter worked first time; `strokeColor` tween red -> ink on 100 ring layers worked.
- `check --at` frames + `--onion` + the full export in one command; the printed `files` line was right (`--out` writes straight into the folder, as the round-3 lesson said).

## Stumbles   (one entry each, also small ones)
### 1. A dot appears where a round-capped draw-on starts   [SPEC-ODD]
- tried: bark = one 14 px stroke, `strokeCap: 'round'`, `trimEnd` 0 -> 1, layer starting 0.1 s before the keyframe.
- happened: at 9.6 s a black 14 px dot sat alone on the trunk (the first frames of the draw-on are a dash of ~0 length, which a round cap draws as a full dot). No warning (none expected).
- cause: inherent to round caps; I had the layer visible slightly before the draw started.
- would have prevented it: one line in the cheatsheet's Draw-on paragraph: "with `strokeCap: 'round'` the first frame of a draw-on is a dot as wide as the stroke: start the layer on the keyframe, or fade `strokeAlpha` in over 0.1 s".
### 2. Is a `path`'s `d` in the parent null's space?   [GAP]
- tried: ring paths written around (0, 0) with `parent: 'section'` (a null at the pith).
- happened: it worked, but I had to guess; dsl.md says a path's `d` is "canvas coordinates" and a null child's `x / y` are "from the null's origin", neither says what `d` means under a parent.
- would have prevented it: in the null section, "a line / polygon / path child's coordinates are in the null's space (write them around its origin)".
### 3. Contact-sheet tiles show moire on fine concentric lines   [TOOLING]
- happened: at sheet size (~480 px) 100 rings 2-3 px apart show dark stripes at 3 and 9 o'clock that are not in `frames/*.png` at full size; I lightened the outer rings partly because of it (also good for phones).
- would have prevented it: the round-3 lesson about 1 px lines covers it; the sheet could be drawn with a smoothing filter (area average) when it downsizes.
### 4. Ring jitter made rings cross   [MY-MISTAKE]
- a per-ring wobble of 1 % of the radius is larger than a 2 px ring width at R = 335: outer rings crossed and made streaks. Capped the wobble at 0.3 x the ring's own width.
### 5. `echo ======` in zsh   [MY-MISTAKE]
- `=word` is a zsh expansion; my separator line broke a combined `help` command. Nothing to do with the library.
### 6. 100 hand-computed zoom keyframes   [GAP, small]
- to keep the growing edge at a chosen screen radius while the years accelerate I computed one `scale` keyframe per year in JS (scale = target screen radius / ring radius). Fine, but it is the "sample a curve into short linear keyframes" hand-roll SKILL.md mentions.

## Docs I read, and which answered my question
- quickstart.md, SKILL.md (whole), the round-3 brief lessons.
- `help trimEnd` (answered: every shape but arc; the dsl.md shape table), cheatsheet lines 63-75 (path is canvas coordinates; Draw-on walks sub-paths in order: answered).
- `help music` (answered fully).
- `help pivotX` (answered: anchors table, and the null / parent section, which made me use nulls instead of compositions).
- Not needed: recipes, pitfalls (no warning ever appeared).

## Wished the library had
- `keyframesFrom(fn, { from, to, step })`: sample a JS function of time into linear keyframes (my zoom-tracking and the accelerating year clock are both this).
- An offset / scaled outline helper for paths (`offsetPath(d, px)`) would have made the bark and the concentric rings one line each.
- A note or option so a round-capped draw-on does not start as a dot.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first 2.4 s are thin: a pith dot and a faint season column. I would start already inside year 1's spring (cut the intro bar to a beat) or let a single fine radial crack/grain line draw on as the opening gesture.
2. The seasons live only in the kanji column (one red character per beat) and in the music; the wood itself does not show early/latewood colour within a year. I would add a darker latewood band (a second wide low-alpha stroke per ring) so autumn visibly darkens the edge before the ring line closes.
3. The bark is a band of 1600 radial ticks: at full size it reads as an engraving, at phone size its outer edge is still a little fringe-like. I would try a filled rough band revealed by a growing arc mask instead of ticks, and compare both on the exported mp4 at 50 % size.

## Rounds (critique log, PROCESS method)
- Round 1 critique (at.png, 1.5-12.2 s):
  1. 8.5-12.2 s: the section is too big; at 9.6 s it runs off the right edge and the bark is cropped by accident; a stray black dot at the bark start (round cap) at 9.6 s.
  2. 9.9-12.2 s: the bark (one thick dark stroke) reads as a cartoon outline, the strongest element of the frame.
  3. 3.3-6.6 s: year 1 (the narrated part) is small on a big empty page.
  4. 11 s: caption crowded by the bark bottom.
  Fix: RMAX 452 -> 335 and the pith moved to (612, 640) after computing the outline's bounds in node; zoom 4x -> 6x; bark rebuilt.
- Round 2 critique:
  1. 10.2-12.2 s: the new bark (a WOOD band + a line) looked like a mustard app-icon ring; replaced with 300 radial ticks -> looked like a hairy fringe (12.2 s full frame). -> 1100 dense ticks of varying length.
  2. 8.5-12.2 s: outer rings crossed each other (stumble 4) and made dark streaks; jitter capped, outer rings thinner and lighter.
  3. 2.0 s: the counter showed "0 年" before the first spring; now it appears at 2.0 s already at 1.
  4. zoom 6x -> 8x so year 1 fills more of the frame.
- Round 3 critique (full contact sheet + at 9.7/10/12.2):
  1. 0.0-2.4 s: only a pith dot until 2.4 s; the season column now fades in from 0.8 s.
  2. 8.4-13.2 s: moire stripes at sheet scale (stumble 3); outer ring lines lightened (alpha 0.22-0.42).
  3. 10.8-13.2 s: the bark's outer edge spiky at small size; 1600 ticks, length noise reduced.
  4. 9.7 s: the first bark tick sits alone for a frame before the sweep: accepted.
  Also: caption moved up 18 px so it shares the baseline of "100 年".
- Final check: warnings none, layout clean, -16.8 LUFS / -5 dBTP, export mp4 3.98 MB, 13.23 s, 1080x1350 (the whole check incl. export took about a minute).
