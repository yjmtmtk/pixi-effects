# social-quote-vertical - usability notes (music retrofit)
Model: opus   Slot: M7-social-quote-vertical   Cycles: 4 (3 quick `--no-export` audio checks, 1 full check)   Result: works
Timeline: copy + CDN swap at +3 min; first check (audio read-back) at +8; first contact sheet looked at at +12; done at +16 (approximate)

## Went smoothly because the docs said so
- `help music` gave everything needed in one screen: token syntax, instruments and their ranges, track options (`vol` points, `strum`, `tone`, `reverb` per track, `ring`), drums as one repeated bar with `from`/`to` in BEATS, `tail`, `drumVol`.
- Pitfall 58 ("count beats, every track must add up") plus the `|` bar separators: I counted all six tracks to 24 beats by hand, and the check's read-back confirmed "6 bars" for every track and printed each note's beat in its bar (`a5(4)`), so I could verify that line 5's note is the anticipation on beat 4 of bar 2 without listening.
- SKILL.md "pick a tempo whose bar is a round number of seconds / put every cut on the grid" led to the key decision: 144 bpm makes one beat 0.4167 s, which is the piece's own line step (0.42 s) and makes 24 beats exactly the 10 s.
- `help sfx` table (loudest point per preset: swoosh 0.16 s in) told me where to place the underline swoosh relative to the expo.out draw.
- `report.json` `audio.windows` (RMS / peak per 0.1 s) let me see every note entrance and the decay of the ending as numbers; `waveform.png` with red cue ticks showed the same at a glance.
- The CDN swap instruction in the brief (the three importmap entries + loader.css) worked first time; the page needed no other change.

## Stumbles
### 1. The music's level seems normalised to its own loudest moment   [GAP]
- tried: lowered `drumVol` 0.5 -> 0.4 and removed a soft kick on the final downbeat, to make the mix quieter around the ending.
- happened: integrated loudness went UP (-17.6 -> -17.0 LUFS) and the score's peak stayed at exactly -3.1 dBFS. So the whole score seems to be scaled so that its loudest instant hits a fixed peak; softening the loudest part raises everything else.
- cause: not stated plainly. The docs say "at volume 1 the music peaks at -6 dBFS", which implies it, but not that rebalancing tracks moves the level of the others.
- would have prevented it: one sentence in `help music`: "the whole score is normalised so its loudest moment peaks at -6 dBFS x volume: making one part softer makes the rest louder; balance tracks with `vol`, set the overall level with the layer's `volume`."
### 2. The -6 dBFS figure did not match what I measured   [WRONG?]
- tried: `volume: 0.9`.
- happened: the score's own `peakDb` was -6.0 (expected about -6.9); at `volume: 1.3` it was -3.1 (consistent with -5.1 at volume 1). Maybe the reverb or my score's dense final chord; I cannot tell.
- would have prevented it: state what the -6 is measured on (dry? with reverb? per score?) or report "music normalised to X dBFS" in the check line.
### 3. `sources[].peakDb` of an sfx is the mix, not the sound   [GAP]
- happened: the `swipe` on the last chord was reported with `peakDb: -6` (later -3.1), its `sound.peakDb` -14. The first number is the mix peak during that sound, I think; at first it read as "this swipe is very loud".
- would have prevented it: name it `mixPeakDb`, or one doc line in the inspectAudio section.
### 4. Default `drumVol` is hot for a soft bed   [SPEC-ODD, small]
- happened: with the default 0.8, each kick made a +8 to +10 dB spike in the 0.1 s windows over a keys/pad bed at -22 dB RMS. 0.4 sounded (numerically) like a bed.
- would have prevented it: the music-lofi recipe or `help music` could say "under a quiet bed, drumVol 0.3-0.5".
### 5. WebFetch of AGENTS.md returned a summary, not the text   [TOOLING]
- happened: the fetch tool summarised the file; the same AGENTS.md is in the repo context, so no harm. Not the library's fault.
### 6. No per-track level read-back   [GAP, wish]
- I could see the mix peak at 8.358 s but not which track makes it (keys chord, pad, pluck, bell all start there). I balanced by reasoning, not by numbers.

## Docs I read, and which answered my question
- `help music` (dsl.md music section, api.md musicEvents / musicEnvelope / musicBuffer, pitfall 58): answered syntax, structure, read-back. Enough on its own.
- `help sfx` (dsl.md sfx table, pitfalls 49, 61, 68, cheatsheet audio): answered presets, loudest points, levels.
- `recipe music-lofi`: a working full score to model track lengths and the `from` for drums on.
- SKILL.md grep for music/sound: the beat-grid advice. quickstart.md. Not needed: cheatsheet beyond the audio paragraph.
- Not answered: how normalisation works (stumble 1), what `sources[].peakDb` measures (stumble 3).

## Wished the library had
- Per-track peak / RMS in `inspectAudio()` for a music layer (or `check --solo <track>`).
- A check line that lines up named picture moments with the nearest note: e.g. `check --sync line-1,line-5,end-glow` printing "line-5 starts 2.93 s; nearest note a5 at 2.917 s (-13 ms)". I did this by arithmetic.
- `musicEvents` output in report.json (times in movie seconds), so verifying needs no page code.

## Musical decisions
- Key F major (warm, matches the cream / terracotta palette); tempo 144 bpm felt in half time (beat = 0.4167 s = the quote's line step); 24 beats = 6 bars = exactly 10 s; layer at 0 s, `volume: 1.3`.
- Parts: Rhodes `keys` melody (one note per quote line), soft off-beat Rhodes comping (bars 4-5 only), warm `pad` (slow attack), dry synth `bass`, `pluck` figure for the swipe cue, two `bell` strikes; drums only in bars 4-5 (soft kick, rim, shaker, `drumVol 0.4`).
- Harmony: | Fmaj7 | Fmaj7 -> Bbmaj9 pushed on beat 4 | Bbmaj9 | Gm9 | C9sus4 -> C13 | Fmaj9 (held, rings out) |. The end is a deliberate tonic chord on the last downbeat (8.333 s) with a bell f6, decaying to -50 dB by 9.9 s: no cut-off.
- Picture moments and their sound:
  1. 0.35 s quote mark scales in: low `pop` (pitch -5, darker); pad has been swelling in since 0 s.
  2. 1.25 / 1.67 / 2.08 / 2.50 / 2.92 s the five quote lines rise: Rhodes a4, c5, f5, c5, a5 (beats 3-7; within 0-13 ms of each line's start). "details." lands on the tonic f5; "the design." (terracotta, italic) leaps a sixth to an accented a5 that anticipates the Bbmaj9, bass and pad change with it.
  3. 3.72 s (underline draws at 3.78): soft `swoosh`, loudest 0.16 s in, while the line shoots out.
  4. 4.13 s underline dot pops: `pop` (pitch +3) plus bell d6 on beat 10 (4.167 s); author name and role follow under a small Rhodes answer g5-f5-d5 (beats 11-12).
  5. 5.00 s (beat 12) the card is complete and holds: groove enters (half-time kick, rim, shaker) with Gm9 comping, so the hold does not go static.
  6. 6.0-6.25 s swipe cue fades in (label/arrow 6.2): a kick falls on 6.04 s; from beat 15 (6.25 s) a rising `pluck` figure (g4 ... bb5) leans to the right over C9sus4 -> C13, the dominant waiting for the swipe.
  7. 8.333 s the pager pill advances and the end glow breathes: `swipe` sfx + final Fmaj9 chord, bass f1, pluck f5 and bell f6; drums stop. Last held composition 8.9-10 s is the chord ringing out.
- Timing nudges (picture): `pager-pill` advance 8.40 -> 8.333 s (-2 frames); `end-glow` at 8.40 -> 8.333 s (-2 frames). Both now sit on beat 20, so the sound does not lead the picture by 67 ms. Nothing else in the picture changed.

## What I could not verify
- I cannot hear: whether the timbres sound good together, whether the a5 leap reads as the climax, whether the pop at 0.35 s is pleasant, whether the shaker/rim feel is too busy at 144 bpm. All verification was by numbers (level windows, read-back beats, arithmetic of beat times against layer `at`s).
- The contact sheet confirms the picture is unchanged apart from the two 2-frame nudges (not visible in a sheet).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first second is quiet (-30 dB RMS until the first line at 1.25 s, 10 dB under the body): fine as a breath, but on a social feed the opening could use a soft low note under the quote mark (a `sub` f2 at the 0.35 s pop, with the quote mark nudged to beat 1 = 0.417 s).
2. The final chord is the loudest instant of the piece (-3 dBFS peak) while the picture's end is a "soft breath": I would thin the final voicing (keys 3 notes, no pluck) so the end swells less and decays more.
3. The arrow's nudge loop (1.1 s period) is not on the grid and has no sound; a very soft `click` on its first rightward push (7.45 s) or retiming the loop to 2 beats (0.833 s) would tie it in, at the cost of changing the picture more than a few frames.
