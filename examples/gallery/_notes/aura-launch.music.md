# aura-launch - usability notes (music retrofit)
Model: opus   Slot: M4-aura-launch   Cycles: 4 checks (2 quick, 2 full)   Result: works
Timeline: started 12:59; first score played (check OK, no warnings) at +6 min; contact sheet + waveform looked at at +12; done at +20

## Went smoothly because the docs said so
- `help music` printed the whole notation in one go (tokens, chords, instruments and their ranges, drums with `from`/`to` in BEATS, `tail`, `vol` points, levels). The score played on the first try with zero warnings.
- SKILL.md's "pick a tempo whose bar is a round number of seconds, put every cut on a bar line" made me fit the tempo to the picture: beat = 0.65 s (92.31 bpm) puts the headline (0.9), the product (3.5) and the call-to-action (9.35) all on beats, 4 and 9 beats apart.
- The `check` music read-back (per track bars, what starts on which beat) confirmed all tracks are 17 beats long without counting by hand.
- `musicEvents()` worked from Node by importing `node_modules/pixi-effects/dist/index.js` (no browser): exact movie times of every note and drum hit, which is how I verified alignment.
- The level guidance ("volume 1 peaks at -6 dBFS", "web video is -14 to -16 LUFS: raise volume and watch truePeak") was exactly what I needed: first pass read -22.4 LUFS, raising music to 1.3 and the sfx x1.6 gave -16 LUFS, true peak -3.5 dBTP, no limiter.
- Building the music-box run from the same numbers as the headline letters (`T.headline + i * 0.08 + 0.15`, converted to beats) kept picture and score in step, as the docs suggest.

## Stumbles
### 1. The original carried an mp3 bed (`../_assets/bgm.mp3`) that does not exist in the slot   [SPEC-ODD]
- tried: reading the original before editing.
- happened: an `assets` entry and a looping `bgm` audio layer at volume 0.3 pointed at a file outside the folder (the brief calls the piece silent). Removed both; the `music` layer replaces it (pitfall 61: "Do not also add an mp3 bed").
- would have prevented it: nothing in the library; the brief could say "remove the bgm asset".
### 2. No way to say "the music starts with a one-beat pickup"   [GAP, small]
- tried: a pickup beat at 0.25 s so the headline (0.9) is the first downbeat.
- happened: the read-back counts bars from the start of the music, so every bar in the report is shifted by a beat (`d5(2.2308)` = bar 1 beat 2.23), and the product downbeat shows as "bar 2 beat 2". Musically harmless, only the report reads oddly.
- would have prevented it: a score option `pickup: 1` (beats before bar 1) used only for naming bars in `check` / `musicEvents`, like `meter`.
### 3. Off-grid notes print with long decimals in the read-back   [TOOLING, cosmetic]
- happened: `d5(2.2308) f#5(2.3539) a5(2.477) c#6(2.6001)`: correct, but rounding to 2 decimals would read better.
### 4. Sub octave chosen too low at first   [MY-MISTAKE]
- tried: `sub` on d1 / b0 / g0 (37 / 31 / 25 Hz).
- happened: no warning; the music's centroid read 190 Hz and the RMS windows showed 60 Hz content dominating. A laptop speaker plays none of that. Moved up an octave (d2 / b1 / g1).
- would have prevented it: the doc gives "bass c1-c3" but no range for `sub`; a line "sub sounds below c2 only on headphones / big speakers" or a check note when a track sits mostly below 40 Hz.
### 5. Unsure whether the end is my decay or the movie's cut   [GAP, small]
- happened: notes end at 11.3 s, `tail: 0.7` makes the layer exactly 12.0 s. The RMS falls -17 (11.0) -> -31 (11.5) -> -67 dB (11.9) and `issues` is empty, so it reads as a natural decay; but I cannot tell from the numbers whether the "short fade at the end of the composition" was applied.
- would have prevented it: `inspectAudio().sources[i].endFade: true|false` or an issue line "music cut by the end of the movie" (it does report cut-off sfx).

## Docs I read, and which answered my question
- `help music` (answered nearly everything), `help sfx` (presets, loudest points, riser = at hit - duration), `recipe music-lofi` (a working whole score), cheatsheet audio paragraph, SKILL.md "Time and sound", pitfalls 49 / 58 / 61 / 68.
- Not answered: a range for `sub`; whether a music layer that ends exactly at the composition end gets the forced fade.

## Wished the library had
- `pickup` (anacrusis) for the read-back; a `sub` range line; a "music cut at the end" flag in `inspectAudio`.

## Musical decisions
- Key D major with a Lydian/major-9 colour (amber, aspirational). Tempo 92.31 bpm (beat 0.65 s, bar 2.6 s), chosen because 3.5 - 0.9 = 4 beats and 9.35 - 3.5 = 9 beats. Music layer `at: 0.25` (one-beat pickup), volume 1.3, reverb 0.3, tail 0.7.
- Parts: `pad` (bed, voicings written out: Dmaj9 | Bm9 Gmaj9 | Em9 A9sus4 | A7 | Dmaj9), `sub` (heartbeat on the chord roots), `bass` (eighth-note pulse only in the orbit section), `pluck` (eighth arpeggio, orbit section, crescendo by `vol` points), `musicbox` (headline run and the final figure), `bell` (card hits and the date), drums half-time (kick 1 + 3-and, snare 3, hats) from beat 5 to 13, one crash at beat 14.
- Form: pickup (0.25) | A, air (0.9-3.5) | B-C, pulse (3.5-8.7) | one-beat break (8.7-9.35) | final Dmaj9 at 9.35, held 3 beats, rings out to silence at about 11.9 s (no cut-off).
- Picture moments:
  1. 0.25-0.9 "INTRODUCING" fades in: pad swells from 0.25 to 0.45 of its level.
  2. 0.9 headline letters leave depth: sub d2 + the original swoosh (kept, 0.51 -> 0.82); 1.05-1.61 a seven-note music-box run d5 f#5 a5 c#6 / e6 f#6 a6, one note per letter, 0.15 s after each letter starts (its landing), with a rest for the space.
  3. 2.42 light streak crosses the headline: a dark, quiet swoosh, loudest at 2.58 (the streak's centre).
  4. 2.9-3.5 the headline shrinks to a wordmark: short riser; 3.5 product emerges: dark hit (pitch -5) + chord change to Bm9 + the groove starts (kick, bass, pluck).
  5. 4.8 / 5.125 / 5.45 / 5.775 the four feature cards: bell f#5 a5 b5 d6 on eighth notes (Gmaj9), card 1 also on the snare.
  6. 8.7 scene starts to leave: drums, bass and pluck stop (a one-beat break on A7), riser 8.35-9.35, swoosh loudest at 9.17 as the near cards whoosh past.
  7. 9.35 "10 . 24": crash, dark hit (pitch -3), Dmaj9, sub d2, bell d6; 9.45 the original chime (kept, 0.18 -> 0.48).
  8. 10.0 / 10.325 / 10.65 pill label and footer: music box a5 d6 f#6, the last notes; everything decays by 11.9 s while the frame holds.
- Timing changes to the picture: `T.cards` 4.7 -> 4.8 and `T.cardStep` 0.35 -> 0.325, so the cards land on beats 7, 7.5, 8, 8.5 (shifts of +3, +2.25, +1.5, +0.75 frames). Nothing else in the picture changed.
- Other edits: three `pixi-effects*` importmap entries and loader.css -> jsDelivr 0.35.0; the bgm mp3 asset and its layer removed.

## What I could not verify
- How it actually sounds: whether the half-time kit feels right at 92 bpm, whether the musicbox run reads as a run at 80 ms per note or blurs into a smear (humanize lowered to 6 ms for it), whether the pluck is too bright against the pad, the stereo image. All checks are numeric.

## Self-assessment: 3 weaknesses, and what I would change with 3 more cycles
1. Bar A (0.9-3.5) is a single held chord: the tagline flip at 2.0 has no sound of its own; I would add a soft keys dyad or a bell on beat 3 (2.2) to give the intro a second event.
2. The level is flat (about -17 dB RMS from 1 s to 11 s apart from the break): the groove section could be 2-3 dB louder than the intro for a clearer build.
3. The groove lasts only two bars, so the pluck arpeggio never repeats into a recognisable hook; a short motif shared by the headline run and the final figure would tie the piece together more strongly.
