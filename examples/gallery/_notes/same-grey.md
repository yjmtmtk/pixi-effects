# same-grey - usability notes
Model: opus   Slot: T29   Cycles: 5 (edit/look)   Result: works
Timeline: start 13:49; first page rendered and first contact sheet looked at at +5 min (13:54); done at +11 min (14:00)

Concept: one exact grey (#808080) is light on black, dark on white, graded on a gradient (and graded the other way when the gradient turns
180 deg), then vanishes when the field becomes #808080 itself; a hairline shows it is still there. "明るさは、となりで決まる。"
Sound: a pad whose chords change around a constant G (C minor, C major, Abmaj7, Ebmaj7, F add9, then octaves of G alone); a bell plays the
same G5 whenever a grey appears; typewriter ticks for the hex labels. 120 bpm, every act on a bar line. 1080x1080, 14 s, poster 7.6.

## Went smoothly because the docs said so
- quickstart + SKILL rules: anchors (rect centred, anchorX 0/1 to grow a rect from one edge), keyframe `at` relative to the layer: no mistakes.
- `help fillGradient`: partial gradient in a keyframe, same stop count, angle animation. I used 4 stops with two at offset 0.5 to START as a
  hard split identical to the two half rects, then animated the middle stop colours to grey (the split "melts" into a gradient), then
  `angle: 180` (the gradient turns), then all stops to #808080. Worked first time.
- `help music`: notes written out `[c3 eb3 g3]:4`, `_:2` rests, the check's music read-back confirmed every bar adds up (7 bars).
- Text `fill` is animatable (cheatsheet line 47); `visibleChars` typewriter; `set: { text }` for the figure numbers.
- First check: no warnings, layout clean, -17.7 LUFS; raising the music to volume 1.2 gave -16.3 LUFS / -4.4 dBTP as the docs predicted.

## Stumbles   (one entry each, also small ones)
### 1. `P="npx --no-install pixi-effects"; $P help`   [MY-MISTAKE]
- happened: zsh "command not found" (zsh does not word-split a variable). Wrote the command out. Not the library's fault.
### 2. `check --out <dir>` writes into `<dir>/` directly   [WRONG, known]
- SKILL.md still says `check-out/<name>/sheet.png`; the printed `files` line is right. Known from the round-3 lessons, so no time lost.
### 3. Hard-edged gradient stops (two stops at the same offset) are not documented   [GAP]
- tried: `stops: [[0, INK], [0.5, INK], [0.5, PAPER], [1, PAPER]]` to make a gradient that starts as a hard split.
- happened: it works (and the stop colours interpolate), but I had to try it to know. A doc line: "two stops at the same offset make a hard edge; animate their colours to soften it".
### 4. Where a rect's `trimEnd` stroke starts, and in which direction, is not documented   [GAP]
- tried: an outlined rect with `trimEnd 0 -> 1` to trace the vanished band.
- happened: it starts at the top-left corner and runs clockwise (seen in the frames). Fine for me, but a "start corner / direction" line (and a `trimOffset` to move the start) would let you plan the draw.
### 5. Music read-back notation `g5(3)` is unexplained   [GAP]
- the bell row read `g5(3) | g5 | g5(3) | – | g5 | – | g5`; I could not tell what "(3)" counts (my notes are 2, 6, 6, 8, 4 beats). One legend line under the block would do.
### 6. Text vanishes when its field passes through its own value   [MY-MISTAKE, design]
- at 8.6-9.0 the corner captions disappeared while the gradient turned (paper text on a field becoming paper). No tool could flag it
  (it is not overlap or clipping); I saw it on the sheet and made the captions step aside (alpha 0) during the turn. A contrast check
  in `inspect` ("text contrast below 1.5:1 against what is behind it at frame N") would have caught it.
### 7. SKILL step 4 asks for a `view` address to the human within two minutes   [SPEC-ODD]
- does not apply to a headless run; skipped.

## Docs I read, and which answered my question
- quickstart.md, SKILL.md (all), `help music`, `help fillGradient` (also printed `colorSpace`, `blendMode`, `shape`): answered everything.
- cheatsheet.md by grep (text `fill` animatable, trimEnd exists on rect). Did not need recipes or pitfalls.

## Wished the library had
- a contrast warning for text against the pixels behind it (stumble 6);
- `trimOffset` / documented start point for rect and circle strokes;
- a legend for the music read-back.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first 0.8 s is a plain wipe on black: a quiet start but not a striking one; I would try opening on the split already there with the
   left square cutting in on frame 0.
2. Act 3 (the gradient turning) is the strongest moment but the turn passes 90 deg where the band briefly matches the field, which
   anticipates the act-4 vanish and slightly spends the surprise; I would ease the turn so it lingers less near 90 deg, or turn by 180 in a cut.
3. The final plate (grey field, hairline, label, statement) is correct but low-energy; with more time I would let the hairline trace start
   on the beat with a slightly brighter bell and hold the last bar fully still for 1.5 s instead of ~1.

## Critique rounds (process slot)
- Round 1 (first sheet, 12 s): (a) 6.0-7.6 the gradient faded in OVER the split, so the hard edge showed through as a muddy double image;
  (b) 7.6 the gradient illusion was the best moment but lasted under 1 s before the flatten; (c) poster 3.8 (labels) less striking than the
  band on the gradient; (d) 0-0.5 dead black. Fix: one field layer that starts as the exact split (hard stops) and melts; a new bar where
  the gradient turns 180 deg (the band's light/dark ends swap while it does not change); 14 s; poster 7.6.
- Round 2: (a) 8.6 and 9.0 the corner captions vanished into the turning field; (b) 10.2 "FIG. 3 / ON ITSELF" appeared while the field was
  still a reversed gradient; (c) -17.8 LUFS a little quiet. Fix: captions step aside during the turn and return in ink at 11.2, once the field
  is grey; music 1.2. Acts 2-3 are now colour only, no text.
- Round 3: (a) the wipe started at 0.3, off the beat, (b) the swoosh preceded it, (c) the captions' fade-in was tied to the wipe's end
  rather than to beat 3. Fix: wipe on the downbeat (0-0.8), swoosh at 0.1, captions at 1.0 with the left square. Full check: OK, 0 warnings,
  mp4 666 KB, -16.3 LUFS. Checked pixel values at 11.5 s: field 127-129 vs band 128 (the band is really gone).
