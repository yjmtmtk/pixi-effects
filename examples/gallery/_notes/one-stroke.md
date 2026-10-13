# one-stroke - usability notes
Model: opus   Slot: S2-type-poster (PROCESS)   Cycles: 11 check runs (4 critique rounds)   Result: works
Timeline: started 12:50; brief.md written +4 min; first page that rendered at +6 min (12:56); first contact sheet looked at at +6; full check with export at +12 (13:02, about 1 min); done at +14

## Phase 1: start (12:50 - 12:58)
- AGENTS.md via WebFetch: the fetch tool only returned a summary (it refuses verbatim), but the local copy in the package says the same. Followed it: quickstart.md, SKILL.md, `new`, `help text`, `help sfx`, `help anchorX`.
- `npx --no-install pixi-effects new one-stroke --duration 12` worked first time and printed the next commands.
- First check: the 一 at 600 px was flagged "cut off by the canvas edge: 32px beyond the bottom edge" although its ink is a thin bar in the middle of the frame (the em box is measured, not the ink). Switched the hero glyph to a canvas-drawn picture cropped to its ink (allowed by the brief).

## Went smoothly because the docs said so
- quickstart.md: anchors (rect centred, text top-left), keyframe `at` is layer-local: no mistakes there.
- `help anchorX` table: "left to right: `anchorX: 0`" on a rect, and that line/polygon ignore anchorX (use from/to). Exactly what I needed for the hairline that draws from the left.
- `assets: [{ name, src }]` accepts a `data:` URL (`canvas.toDataURL()`), found with one grep in the cheatsheet.

## Stumbles   (one entry each, also small ones)
### 1. A huge glyph is "cut off" when only its em box leaves the frame   [GAP]
- tried: `一` as a text layer at fontSize 600 (and wanted 900: a poster-size stroke).
- happened: `text layer "hero" is cut off by the canvas edge: 32px beyond the bottom edge`. The ink (a thin horizontal bar) is 300 px away from any edge; the em box of a CJK glyph is much taller than its ink.
- cause: inspect measures the text layer's box, not its ink; there is no per-layer way to say "this box may bleed, the ink does not".
- would have prevented it: inspect could measure the ink (alpha bounds of the text texture) before calling text cut off, or a layer flag like `bleed: true` / `inspect: false`, plus one line in `help text`: "display-size CJK glyphs: the em box is ~1.0 x fontSize tall even for 一; draw it as a picture or ...".
- workaround: draw the glyph into a 2D canvas, crop to `measureText().actualBoundingBox*`, use it as an image asset with `tint`. Works well and even lets me scan the bar thickness for the morph.

### 2. `y: '+12'` in a `from` is silently an absolute 12   [MY-MISTAKE, a warning would help]
- tried: `from: { alpha: 0, y: '+12' }, to: { y: '+0' }` meaning "rise 12 px".
- happened: every text with this keyframe jumped to the top edge (y = 0); the check then said "cut off by the canvas edge: 9px beyond the top edge". No warning about the value itself.
- cause: the relative syntax is `'+=12'` (cheatsheet line 12); `'+12'` is a valid expression = 12.
- would have prevented it: a build-time warning when a position keyframe value is a string starting with `+`/`-` followed by a number (`'+12'`): "did you mean '+=12' (relative)?" - in the spirit of the existing did-you-mean warnings.

### 3. The music read-back caught my miscounted bell line   [MY-MISTAKE, the tool saved me]
- tried: a bell note meant for the landing (beat 16), written `'_:6 g5:2 | _:8 | _:8 | c6:1 e5:1 _:6'`.
- happened: check printed `bell 8 bars | – | g5(3) | – | – | – | – | c6 e5(2) | –` and the note "the score is 16s long but only 12s of it play". The read-back showed the landing note two bars late at once.
- would have prevented it: nothing more needed; the read-back is excellent. (Small wish: print the beat number or the second next to `c6`, e.g. `c6@8.0s`, so you do not have to convert bar/beat to seconds.)

### 4. Vertical Japanese (tategaki) is hand-made   [GAP]
- tried: the vertical presentation forms `︑` `︒` for 、 and 。 in a column of per-character text layers.
- happened: they rendered like the horizontal forms (bottom-left of the cell), so I used plain 、。 and moved them by hand (+0.62 em right, -0.62 em up) into the top-right of their cell.
- would have prevented it: a `vertical: true` text option (or a `splitText(..., { direction: 'vertical' })` helper that sets the punctuation), or one line in `help text` on how to set a vertical line.

### 5. Inspect cannot judge type drawn as a picture   [SPEC-ODD, consequence of #1]
- after the workaround, the hero glyphs are images, so the layout check no longer sees them (fine here, but a real clipping of the picture would go unnoticed). The ink-aware text measurement wished for in #1 would let the glyph stay a text layer.

## Critique rounds (PROCESS)
### Round 1 (12:57, first full sheet)
1. 3.0-4.0: the first glyph had no face label or index; the cycle said "10 / 11" while the final said "12 FACES". -> numbered 01..13 including the first glyph, final says `13 FACES`.
2. 8.0: the landing was a plain cut with no arrival. -> the red rule measures again (draw 0.6 s) with a click.
3. 8.5-9.7: tagline and statement faded + rose in, which the brief bans for main type. -> tagline characters cut in on sixteenths with a typewriter tick each; the Latin statement is wiped in by a growing mask (echo of the hairline).
4. 0-12: the info row's 一 in the mono font read as a dash ("— ICHI"). -> "U+4E00 · ICHI / ONE".
### Round 2 (12:59)
1. 0.5-2.9: act 1 was 2.5 s of one hairline: too long before the idea lands. -> the line draws in 1.0 s, the letter cuts in at 2.5 s (beat 5).
2. 10.0-10.7: the statement was still wiping in at the poster time 10.5 (half a word in the poster). -> everything earlier, statement done at 9.7, poster 10.5 is the full composition.
3. 8-12: the piece ended on the full layout with nothing deliberate. -> at 11.5 every annotation cuts away and only the stroke stays (14 s total, music re-written to 28 beats).
### Round 3 (13:00)
1. 11.5-14: the lone stroke stayed left-hung and read as "something is missing". -> it glides to the centre (1 s, expo.inOut): the one centred moment, justified in the brief's terms (only one thing is left).
2. 2.5: the onion skin of 2.2-2.6 showed the gathering bar 8 px lower than the glyph's bar (the Mincho entry stroke reaches lower than the bar). -> scan the bar's position, not only its thickness; now the cut adds only the entry and the serif.
3. 0-14: no sound at the start of the picture: added a dark swipe on the draw, a low hit on the letter and on the landing, rising clicks on every face cut. Loudness -16.9 LUFS, true peak -3 dBTP.
### Round 4 (13:02, final check with export): no new defect worth a change; weaknesses listed below.

## Docs I read, and which answered my question
- `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: the workflow; answered everything structural.
- `help text`: style keys, `measureText`, CJK wrapping. Did not say how big a CJK em box is relative to its ink (#1) or anything about vertical text (#4).
- `help sfx` (through `help trimEnd`, which printed the shape and audio sections): sfx presets and knobs; `music` syntax with the beat counting. Answered.
- `help anchorX`: the anchor table. Answered (rect `anchorX: 0` to grow from the left; line uses from/to).
- `help mask`: the growing-rect reveal. Answered first time.
- cheatsheet grep "relative": the `'+=12'` syntax (#2). Answered, after the mistake.
- `help inspect`: looked for a way to accept an intentional bleed; nothing (#1).
- Not needed: recipes, pitfalls, direction.md.

## Wished the library had
- Ink-aware text bounds in inspect (or `bleed: true`), so a display-size CJK glyph can stay a text layer.
- A warning for `'+12'`-style position strings ("did you mean '+=12'?").
- Vertical text (tategaki) with correct punctuation.
- A built-in "glyph as picture cropped to ink" helper would also be handy for type posters (`glyphPicture('一', style)` returning an asset + ink box).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The typefaces are macOS system fonts: on Windows/Linux most cuts fall back to the same face and the labels (KYOKASHO, MARU GOTHIC ...) lie. The exported MP4 is right; the live page is not portable. With more time: check `document.fonts.check()` per face and drop the faces that are missing, so labels never lie.
2. The act-3 cycle is hard cuts at a fixed position; it reads as a specimen, but the dimension rule jumps rather than measures. A 0.12 s snap of the rule's right tick to each new width would make the measuring feel alive.
3. The final layout leaves a large empty field right of the stroke and the Latin statement is a little generic in Helvetica bold; a tighter pairing (Latin set in the same Mincho's Latin, or a lighter weight) and aligning the statement's baseline to the tagline's last character would make the poster frame more resolved.
