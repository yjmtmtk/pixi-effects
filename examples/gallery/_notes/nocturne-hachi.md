# nocturne-hachi - usability notes
Model: opus   Slot: T21   Cycles: 7 (check runs: 6 no-export + 2 full)   Result: works
Timeline: start 13:49; first page that rendered at +3 min (13:52); first contact sheet looked at at +4; done at +17 (14:06)

Piece: 夜想曲 — an original 8-bar nocturne in A minor (3/4, quarter = 144, a bar = 1.25 s, Picardy A-major ending), written as `music` text
(two `keys` tracks: right-hand melody, left-hand broken chords). Every note is an ink bar falling onto a printed keyboard (A1–C6);
its bottom edge touches the key at the instant it sounds, it slides under the key for exactly its length, the key is lit in the
hand's colour (vermilion = melody, indigo = accompaniment) for that length, a short tick marks each strike. Bar lines and bar
numbers fall with the notes; the header shows BAR n / 8 and the chord name, both timed from `musicEvents()`. End: the roll
empties and the whole piece is drawn left to right as a miniature score (time → x, pitch → y), the final chord stays lit, "fin.".
Poster 13.5 s (the full-score end frame).

## Went smoothly because the docs said so
- `help music` answered everything I needed: note / chord syntax, `[a1 e2 a2 c#3 e3]:3` for an exact voicing, `meter: 3` for bar
  numbering, `humanize: 0` (default 0.012 s jitter would blur a frame-exact sync), and it points straight at `musicEvents()`.
- `musicEvents()` in plain Node (round-3 lesson) confirmed 24 beats / 8 bars / 10 s before I drew anything; in the page I
  `await musicEvents(music)` before `movie.init` and build every bar, light, tick, caption and the final score from its output,
  so picture and sound share one source. The check's `music` read-back (bars per track, onset beats) matched my intent at once.
- `anchorY: 0` + `scaleY` 0 → 1 made keys "unfold" from the top edge; `anchorX: 0` + `scaleX` for the progress line and the
  end-score notes; both as documented in `help anchorX`.
- `check --no-export --at a,b,c` was fast (15 s) and the `frames/*.png` at full size caught defects the tiles hide.
- Zero warnings on the first run; all problems were design problems I saw in the pictures.

## Stumbles   (one entry each, also small ones)
### 1. Strum order and timing are not in `musicEvents()`   [GAP]
- tried: a rolled final chord (`strum: 0.03`) with each key lighting as its string sounds.
- happened: `musicEvents` returns the chord as one event at one time (`midi: [33,40,45,49,52]`); the docs say swing and
  humanize are not applied but say nothing about strum, nor whether strum rolls low → high.
- cause: undocumented.
- would have prevented it: one line in `help music` / `musicEvents` ("strum rolls from the lowest note up; offsets are not in
  the events: add i × strum"), or a per-pitch `times` array in the event. I assumed low → high, i × 0.03 s.
### 2. A short piano tail leaves the end silent   [GAP]
- tried: default `keys`; the last chord stopped sounding ~0.9 s after its written end (check: "the mix is silent from 12.3 s").
- happened: the check's note told me (good); `release` (documented as "a pad's fade in and out") turned out to be the fix:
  `release: 1.8` on the left hand gives a sustain-pedal ring and the final chord carries to the end.
- would have prevented it: in the Tracks paragraph, "`release` on keys / pluck works like a sustain pedal".
### 3. Partial alpha on a coloured key turns it grey   [MY-MISTAKE]
- tried: key light decaying 1 → 0.6 like a piano note.
- happened: indigo at 60 % over cream reads as dead grey; over a black key as brown. Lights are now full colour; re-strikes
  are shown by the strike tick and the 5 px gap between falling bars.
### 4. Falling bars came out BELOW the keyboard   [MY-MISTAKE]
- tried: notes slide under the keyboard (z-order) to show their length.
- happened: long final-chord bars kept falling past the keyboard's bottom edge into the foot (seen at 11.47 s in the sheet).
  Fixed with a paper band below the keyboard drawn above the notes. `check` does not report shapes, so only looking caught it.
### 5. Keys fading in showed the black key bed through them   [MY-MISTAKE]
- tried: keys rising with an alpha fade over one big ink "bed" rect.
- happened: half-transparent keys over the bed looked grey and the bed was a black slab at frame 0. Each white key now brings
  its own ink outline and unfolds with `scaleY` from its top edge: no transparency, reads as the keyboard being drawn.
### 6. Verifying sync needed my own script   [GAP / TOOLING]
- tried: proving "one note = one light" beyond the construction.
- happened: `check` reads back the score but cannot compare it with the picture. I wrote `verify-sync.mjs` (kept in the slot; run `check --out check-out` first, it reads `check-out/nocturne-hachi.mp4`):
  it decodes the exported mp4 with ffmpeg, finds sound onsets (42 / 43 score onsets found, mean +4.2 ms, worst 17.6 ms; the
  missing one is a soft left-hand a3 under a ringing a5, too quiet for my detector) and samples every key's pixel on the
  first frame of its note (76 / 76 lit in the right colour, none lit the frame before unless re-struck).
- would have prevented it: a `check --music-sync` style read-back ("these layers start on these note times") or a recipe that
  lights keys from `musicEvents()` and shows how to verify it.

## Docs I read, and which answered my question
- AGENTS.md (repo), `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: workflow; answered.
- `help music`: score syntax, meter, humanize, musicEvents, musicEnvelope; answered everything except strum order / tail.
- `help letterSpacing` (got the text section), `help ease` (default is linear), `help anchorX` (rect anchors at top level).
- `grep strokeColor cheatsheet.md`: style keys go in `initial`. Did not need recipes.

## Wished the library had
- A real acoustic `piano` instrument (`keys` is an electric piano; with `tone: 0.4–0.55` and release it passes, but a nocturne
  wants hammer and sustain).
- Strum offsets (and the roll direction) in `musicEvents()`.
- A ready helper `keyboard({ low, high, x, y, width })` returning key geometry (white index, black-key x) for piano visuals;
  every music-visual piece re-derives it.
- `check` reporting shapes that leave their intended region would have caught stumble 4.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first 1.4 s are silent (keys draw, notes fall toward the keyboard); on a feed this may lose a viewer. I would start the
   music at ~0.9 s with a shorter fall lead, or let a single soft low A sound under the keyboard drawing.
2. The middle of the keyboard (e4–f4) is almost never played, so the falling notes form two columns with an empty middle;
   a wider melody (or the left hand reaching up) would fill the roll more evenly.
3. The sound is a synth electric piano, not a piano; and the bar-number / tempo labels (15–17 px mono) are small on a phone.
   I would raise the labels to ~20 px and voice the melody with a touch of `bell` doubling for a brighter top line.
