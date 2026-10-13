# tenon-joint - usability notes
Model: opus   Slot: S14-logo-sting   Cycles: 8 (look/fix)   Result: works
Timeline: started 12:52; first page that rendered at +4 min (12:56, on the first try, no warnings); first contact sheet looked at at +5; done at +12 (13:04)

Concept: HOZO (枘, the tenon of a Japanese wood joint), an invented Kyoto workshop that makes furniture without nails. The mark is a square split into a paper block with a mortise and a hinoki block with a tenon. Reveal: the two blocks slide together out of a 5x close-up while hairline "sumi" guides mark where the tongue will go; a breath of silence, then one dry wooden click locks them (3.0 s, the downbeat of bar 2 at 80 bpm); the guides turn hinoki and are pulled into the joint; the mark shrinks left and the name slides out from behind its edge; two bell notes say "HO-ZO" (4.875 / 5.25 s); tagline; 3 s hold with a 2.5 % push-in.

## Phase log
- 12:52 read BRIEF, fetched AGENTS.md (WebFetch returned only a summary, not the verbatim text; fine for the path, the local skill copy has the details), quickstart, SKILL.md.
- 12:53 `help music`, `help sfx`, `help null`, `help mask`, `help ease`: each answered what I asked. `npx --no-install pixi-effects new tenon-joint --duration 9` worked.
- 12:55 wrote brief.md, then the whole page in one go. First check: no warnings, OK.
- Round 1 critique (sheet at 0-8.9 s):
  1. 2.0-2.85 s the mark is only 150 px at the climax; the 14-unit gap and the pull-back are invisible. Fix: lock at scale 1.7, shrink to 1 while it slides left.
  2. 0-1 s silent ("note: the mix is silent from 0 s to 1 s"), because I started the music at 1.0 s to put the lock on a downbeat. Fix: 80 bpm (bar = 3 s), music from 0, lock = bar 2.
  3. 6.5 s the kanji 枘 in the tagline is a grey stray glyph. Fix: spans, kanji in hinoki.
- Round 2 critique:
  1. 6.5 s the wordmark cap top sits 7 px below the mark top; tagline 2 px above the mark bottom. Fixed by measuring the full-size frame.
  2. 5.25-9 s a totally static 3.75 s hold. Fix: a `world` null with a slow 2.5 % push-in.
  3. Audio: after 3 s the waveform is a flat bed; the HO-ZO bell does not stand out (sub too loud). Fix: bell louder, pluck doubling, sub and pad down, pad fades at the end.
  - Moving the wordmark under the `world` null gave a warning (see stumble 1); fixed with an inline mask.
- Round 3 critique:
  1. 3.0 s the click has no visual event besides a 3.5 % punch. Fix: guides flash hinoki and retract into the joint (scaleX / scaleY to 0, power3.in).
  2. 3.0 s the click sounded thin. Fix: a custom wood-block sfx (sine 900 to 620 Hz + band-passed noise) under the click.
  3. 1-px guides disappear in the 480-px sheet tiles; checked the full-size frame (3.10 s): they are there and hinoki. Kept (hairlines are the point).
- Round 4 critique (full check + onion 2.3-3.1):
  1. 0.0 s a 15-px paper sliver at the left edge looks like a mistake. Fix: the paper block starts off screen, only the hinoki tongue is in frame on frame 0.
  2. -18.1 LUFS, quiet for web video. Music volume 1.0 to 1.3: -15.8 LUFS, true peak -1.5 dBTP.
  - Onion of the snap shows the deceleration, the pull-back and the short power4.in snap as intended.

## Went smoothly because the docs said so
- The quickstart's anchor rule (rect centred, text top-left) and SKILL's null/parent paragraph: the mark built from 5 rects under two nested nulls worked first time, and nested null scale carried the children.
- `help music`: the beat counting and the `check` read-back (`bell | – | [e5 g5] g5(3.5) c6(4) | –`) confirmed my HO-ZO notes land on beat 6.5 and 7 without counting by hand.
- The "pick a tempo whose bar is a round number of seconds" line in SKILL (direction section) made me move from 120 bpm to 80 bpm (bar = 3 s), which fixed the silent first second and put the lock on a bar line.
- The custom sfx voice syntax in `help sfx` was enough to write a wood block on the first try.
- The check's "note: the mix is silent from 0 s to 1 s" and the waveform.png made two audio defects visible that I would not have heard (I cannot listen).
- `--onion` showed the snap easing in one picture.

## Stumbles   (one entry each, also small ones)
### 1. A named mask on a layer that has a parent   [GAP]
- tried: `mask: 'wordWindow'` on a text layer, after giving the text `parent: 'world'` (the mask rect also had `parent: 'world'`).
- happened: `warn: pixi-effects: layer "wordmark": it has a parent, so it is drawn in the null layer's space and the matte is in the composition's: mask the null layer ("world") instead`. Clear, but its advice (mask the null) would have masked the mark too. An inline `mask: {...}` on the child (docs: "a mask on a child shares the child's space") was the real fix; the warning does not mention it.
- would have prevented it: the warning could add "or give this layer an inline `mask: { ... }`, which lives in the null's space".
### 2. `--out check-out` writes straight into check-out/, not check-out/<name>/   [SPEC-ODD]
- tried: the BRIEF and AGENTS say the check writes `check-out/<name>/`; with `--out check-out` the files land in `check-out/sheet.png`.
- happened: no harm, just a different path than the text said; I had to `ls` to find `at.png` and `frames/`.
- would have prevented it: one line in the help: "`--out DIR` writes into DIR itself".
### 3. 1-px hairlines vanish in the contact sheet   [TOOLING]
- tried: judging the guides from `at.png` / `sheet.png`.
- happened: the 480-px tiles drop 1-px lines (sometimes fully), so at 2.6 s and 2.97 s it looked as if the horizontal guides were missing. Only the full-size `frames/*.png` showed them.
- would have prevented it: a note in the check output or SKILL ("tiles are downscaled 2.7x: lines under 2 px may disappear; open frames/<t>.png"). SKILL does say tiles are ~480 px, but not that thin lines vanish.
### 4. WebFetch of AGENTS.md returns a summary   [TOOLING]
- tried: WebFetch on the raw AGENTS.md URL as the brief says.
- happened: the fetch tool refused to give the verbatim text and summarised it; the command names were still there. Not a library issue.
### 5. Text y needs measuring for optical alignment   [GAP, minor]
- tried: aligning the wordmark's cap top with the mark's top edge.
- happened: a text layer's box starts above the cap height (internal leading), so the first guess was 7 px off; I fixed it by reading pixels in the full-size frame. `movie.inspect` gives the layer box, not the ink box.
- would have prevented it: an `inspect` field for the ink bounds (cap top / baseline) of a text layer, or an `anchorY: 'cap'` option.

## Docs I read, and which answered my question
- `reference/quickstart.md`, `SKILL.md`: answered the workflow, anchors, nulls, sfx/music basics.
- `help music`: answered everything about the score (tracks, vol curves, beat units, chord names).
- `help sfx`: presets, knobs, custom voices; answered.
- `help null`: parent space, chaining, "a mask on a child shares the child's space" (the sentence that solved stumble 1).
- `help mask`: answered (inline mask syntax).
- `help ease`: did not list the available ease names (it printed the `ease()` API, pitfall 31b and colorSpace); I used names I knew (`expo.inOut`, `power4.in`, `back.out`) and no warning came, so they exist. A list of names in `help ease` would be better.
- `cheatsheet.md` grep for `path` / `polygon`: answered that `path.d` is in canvas coordinates (so I built the mark from rects under nulls instead).

## Wished the library had
- Ink bounds for text in `inspect` (cap top / baseline), for logo lockups.
- `help ease` printing the list of ease names.
- A path/polygon whose `d`/`points` are local to the layer (moved by `x`/`y`), so a mark drawn as one path could ride a null. I avoided it by using rects.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The mark is simple to the point of generic (a two-tone square with a notch could read as a puzzle piece or an "E"). I would draw the tongue with a slight shoulder (a stepped tenon, as in real joinery) or a dovetail, built with a path once I knew how to move it.
2. 3.0-3.75 s after the lock and the guide retraction, nothing happens for about half a second before the slide; it is a deliberate rest, but it could carry a second, smaller beat (the bell dyad's ring visualised, e.g. a hinoki hairline seam that draws down the joint).
3. The tagline at 16 px is small at a 960-px player width and the kanji 枘 at the same size is close to illegible; I would set the kanji larger (24 px) as a separate element aligned to the wordmark's baseline grid, and check legibility at 960 px.
