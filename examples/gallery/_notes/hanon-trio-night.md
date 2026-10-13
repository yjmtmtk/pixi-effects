# hanon-trio-night - usability notes
Model: opus   Slot: T32   Cycles: 9 (4 full contact sheets, 5 --at looks)   Result: works
Timeline: started 13:49; brief.md +8 min; first page that rendered at +15 min; first contact sheet looked at at +16 min; done at +22 min of edits / ~+25 min wall clock

## Went smoothly because the docs said so
- AGENTS.md -> quickstart -> SKILL.md was a short, clear path; `help music` gave the whole score grammar (chord names, swing, drums from/to in beats, comping on named beats) in one print.
- `musicEvents()` lets the picture cues come from the score itself (every word lands on a note time), exactly the "build the bars and the score from one array" advice in the music doc.
- `check --no-export --at 1.2,9.4,11` is fast (~20 s here with other agents on the machine) and the `frames/*.png` are full size: enough to judge 13 px caps and a vertical 、.
- The check's `music` read-back (bars per track, chord names with the beat they start on) confirmed the comping rhythm without listening; it showed `D7b9(4)` = on beat 4, which is what I wrote.

## Critique rounds
### Round 1 (first contact sheet, +20 min)
1. 0.0-2.0 s: the frame is almost empty for two whole seconds (a 14 px label and three 4 px dashes). Fix: lead-sheet chord symbols over the bass line, thicker dashes.
2. 11.0 s: the descender of the g in "Night" nearly touches the line-up row (g ends ~490, labels at 494). Fix: title block up 20-26 px, line-up re-spaced, names 19 -> 22 px.
3. 9.25-10.0 s: the "semitone flat" state of 半音 (alpha 0.32 cream) reads as a rendering ghost, not an intention. Fix: draw it in ink at full opacity, a semitone low, and turn it cream as it rises.
   (While fixing 3 I found my own index mistake: I had counted the Rhodes hits wrong, so the rise fired on the Gm9 instead of the Gb9. Printing `musicEvents()` in Node fixed it for good.)
### Round 2 (+32 min)
1. 0.0-2.0 s: still weak, chords alone do not make an opening. Fix: a real jazz count-in bar: rim clicks on 1 2 3 4 and the numerals rise in the slot where "Trio" will land; the band now enters on the downbeat of bar 2 with the colour field. Movie 13 -> 14 s.
2. 14.0 s: the last bar tick started at 14 s (warning: "unnamed shape layer starts at 14s, after its composition ends (14s), so it is never visible" -- clear, told me which and why). Fix: it appears at 12.6.
3. 11.25-12.0 s: 半音 was still cream in its flat state: `fill` in `initial` of a text layer is silently ignored (no warning). Fix: style.fill = ink, keyframe `to: { fill: cream }`.
4. Loudness -17.8 LUFS: volume 1.0 -> 1.3 gives -15.5 LUFS, true peak -3.6 dBTP.
### Round 3 (+40 min, full check with export)
1. 0.0-2.0 s: the count-in clicks were nearly silent (export rms/s -39 / -38 dB against -17 for the band). Fix: finger-snap claps (`clap: 'o...o...o...x...'`) under the rim; waveform.png now shows peaks at -12 to -14 dBFS on each count.
2. 2.0-4.0 s: the oxblood field sat empty for two seconds. Fix: SAT lands 0.3 s after the field, 11.14 / OPEN / CHARGE move one Rhodes hit earlier each (4.0 / 4.75 / 5.5).
3. 3.6 s (full frame): the rising "Night" is cut by its slot so it reads "Niaht" for ~3 frames. Kept on purpose (it is the slot reveal), noted.
4. Lead-sheet flats: the ♭ in "D7♭9" comes from a fallback font and sits with a visible gap. Kept (it is the real glyph), listed as a weakness.

## Stumbles
### 1. `fill` in a text layer's `initial` is silently ignored   [GAP]
- tried: `initial: { ..., fill: INK }` then a keyframe `to: { fill: CREAM }` on a text layer (the venue name drawn "flat" in ink, then turning cream).
- happened: the text was cream the whole time; no warning, `window.__logs` empty.
- cause: the starting colour of a text comes from `style.fill`; `initial.fill` is not read (the docs only say fill is animatable "under to / from / set").
- would have prevented it: a warning "text: `initial.fill` is ignored, use `style.fill` (or a keyframe `from: { fill }`)", like the other misplaced-key warnings.
### 2. Counting comp hits by hand   [MY-MISTAKE]
- tried: picture cues as `keysT[8]`, `keysT[9]` from `musicEvents()`.
- happened: the venue name rose a chord early; nothing warned (it cannot).
- cause: I miscounted the chords in my own score.
- would have prevented it: nothing in the library; printing `musicEvents()` in plain Node (lesson of round 3) fixed it in a minute. A small doc example "print every note with its index" would help others: `ev.tracks.map(t => t.notes.map((n, i) => i + ':' + n.name + '@' + n.time))`.
### 3. A layer that starts exactly at the movie's end   [none: the warning was perfect]
- happened: "unnamed shape layer starts at 14s, after its composition ends (14s), so it is never visible". It told me what and why; giving the layer a `name` would have made it say which.
### 4. Drum transients look silent in the export's rms/s line   [SPEC-ODD]
- happened: the count-in second reads -36 dB rms while it is clearly audible in waveform.png (peaks -12 dBFS). The rms list alone made me think the clicks were inaudible; the waveform's peak line is the useful read for percussion.
- would have prevented it: print peak per second next to rms/s in the export line.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), quickstart.md, SKILL.md: enough to start.
- `help music`: answered everything about the score (chords with kinds, comping on named beats, swing only on off-beats, drums `from`/`to` in beats, read-back). The best doc page I used.
- `help mask` (inline mask = the "slot" for rising type): answered.
- `help animateText`: printed pitfalls 21/63/64 and the text section; I did not need animateText after all.
- cheatsheet grep for `measureText`: one line, enough.
- Not answered: how a text's starting colour is set when you want to animate fill (stumble 1).

## Wished the library had
- A warning for `initial.fill` on text (stumble 1).
- `musicEvents()` notes carrying their index per track, or `check` printing the note times in seconds (it prints beats), so cue indexes are easy to verify.
- A one-line vertical-text helper for Japanese (I placed 13 layers by hand and offset 、。 myself).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first frame (0.0 s) is black and the count-in shows only one numeral at a time: a bit thin. With more time: let the four numerals stay as a small brass "1 2 3 4" row that the bass line grows out of.
2. The ♭ glyph in the chord symbols comes from a fallback font and spaces unevenly; I would set the flat as its own small layer, or write the chords in a typeface that has ♭.
3. The last two seconds are a pure hold; the piece ends on the chord and the colour change of 半音 (0.3 s). A slower final gesture (a brass hairline drawing under 半音 across the 2 s) could make the end feel more authored, though it risks fussiness.
