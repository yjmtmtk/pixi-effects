# paper-cutout-forest - usability notes (music retrofit)
Model: opus   Slot: M5-paper-cutout-forest   Cycles: 7 (check runs on the deliverable) + 3 separation runs   Result: works
Timeline: started 12:59; first check (CDN + bgm removed, no score) at +3 min; first score heard by numbers at +6; contact sheet looked at at +10; done at +14 (approximate wall clock)

## What changed in the file
- The importmap's three `pixi-effects*` entries and the `loader.css` link now point at the CDN 0.35.0 (as `pixi-effects new` writes them).
- The original was NOT silent as the brief said: it had a stock `bgm.mp3` loop (`../_assets/bgm.mp3`, which does not exist from this folder) plus sfx presets. The mp3 layer and its asset are removed (an external file is against the gallery rules, and pitfall 61 says not to add an mp3 bed under `music`); the score replaces it.
- A `music` layer `score` (a 6/8 lullaby in F major) is added; the existing sfx (5 hill pops, the swoosh, 10 letter pops, the chime) are kept at their times and only re-levelled for the new mix (they had been set for a quiet mp3 bed).
- Picture: no change at all. No timing was nudged: the bar lines were fitted to the picture instead (MUSIC_AT = 0.5, 120 bpm in 6/8). The check's contact sheet is byte-identical (`cmp`) to the sheet of the untouched picture.

## Went smoothly because the docs said so
- `help music` was enough to write the whole score: beats not bars, 6/8 = bars of 3 beats with `grid: 2`, chords capital / notes lowercase, `vol` points for fades, `!`/`,` accents.
- `meter: 3` made the check's read-back count my 6/8 bars correctly; the per-bar read-back (`C7sus4 C7(2.5)`, `c4(3.5)`) let me confirm every note lands on the beat I meant without listening.
- `help sfx` gave the chime/swoosh loud points (swoosh peaks 0.16 s in) so I could put the C7 on the swoosh's peak (8.6 + 0.16 = 8.76 vs the chord at 8.75).
- `inspectAudio()` windows (0.1 s rms / peak) and `loudness` (LUFS, true peak) gave the whole dynamic arc as numbers.
- Free-time notes work: `_:0.2 c5:0.4 f5:0.4 …` put the music-box notes exactly on the hill pops spaced 0.2 s (off the 0.25 s grid), so I did not have to move the hills.

## Stumbles
### 1. The brief / piece said "no sound" but the original had an mp3 bed   [SPEC-ODD]
- tried: read the original before editing.
- happened: `{ type: 'audio', asset: 'bgm', src: '../_assets/bgm.mp3' }`, a file that does not exist next to the slot.
- cause: the gallery piece used a shared stock loop.
- would have prevented it: nothing in the library; noted for the experiment owner.

### 2. Music is normalised: track `vol` is relative, the score's peak is always -6 dBFS × volume   [GAP]
- tried: lowered the music box (0.55 → 0.42) to make the fox's stop quieter.
- happened: the mix peak stayed at -6.0 dBFS at the same instant and everything else got louder; the loudest moment stayed at 5.0–5.5 s.
- cause: the score seems to be normalised to its own peak, so lowering one track raises the others. The docs say "at volume 1 the music peaks at -6 dBFS" but not that this is a normalisation that makes track `vol` purely relative.
- would have prevented it: one sentence in `help music`: "track `vol` sets the balance between tracks; the score is normalised so its loudest instant peaks at -6 dBFS × `volume`".

### 3. Checking that a cadence is clean needs a pitch read-out the tools do not have   [GAP]
- tried: verifying that the F chord at 9.5 s really lands.
- happened: I wrote my own Goertzel scan over the exported mp4: the pad's C7 (b-flat 3) with `release: 1.4` was still the loudest pitch 50–350 ms into the F chord, so the cadence smeared. Fixed with `release: 0.6, legato: 0.94`; b-flat then fell to -4 dB under f.
- would have prevented it: a doc line that the pad's `release` rings over the next chord (and the reverb on top of it), or `inspectAudio` reporting the strongest pitches per window.

### 4. "not a whole number of bars: a bar is short" for an intentional short final bar   [TOOLING]
- tried: a 23-beat score (7 2/3 bars) so the notes end at 11.5 s and the tail fades before the movie's 12 s end.
- happened: every track line says "(not a whole number of bars: a bar is short)". It is only a note (RESULT OK), but it cannot tell "every track ends together on purpose" from "one track is short".
- would have prevented it: only flag tracks that differ from the longest, or say "all tracks end together at beat 23".

### 5. inspectAudio's per-sfx `sound.peakDb` ignores the layer volume   [TOOLING]
- happened: a pop at `volume: 0.29` reports `sound.peakDb: -12` (the preset at volume 1) while the layer's `peakDb` is the mix's peak during it. Neither tells how loud the sfx itself is against the music.
- what I did: rendered two temporary copies (sfx only, music only) and compared their exports at each cue (`sound-report.md`).
- would have prevented it: a per-source "own level at its volume" and "music level under it" (a masking ratio) in `inspectAudio()`.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: the workflow.
- `help music` (dsl.md music section, musicEvents/musicEnvelope/musicBuffer api sections, pitfalls 58/61/68): answered everything about notation and levels.
- `recipe music-lofi`: confirmed the shape of a score and the `vol` fade idiom.
- `help sfx`: presets' lengths, loud points and brightness; the limiter at 0.9.
- Not answered: track `vol` normalisation (stumble 2), how far a pad's `release` overlaps the next chord (stumble 3).

## Wished the library had
- A pitch / chord read-out per window in `inspectAudio()` (what actually sounds at 9.5 s), so a cadence can be verified without ears or a home-made FFT.
- A "sfx vs music under it" ratio per cue, so "not buried" can be checked directly.
- A master `volume` for the whole mix (I scaled six numbers by 1.41 to go from -19 to -15.3 LUFS).

## Self-assessment: 3 weaknesses, and what I would change with 3 more cycles
1. I cannot hear it: the synth timbres (especially `lead` as the firefly's flute-like line) may sound more "synth" than "paper lullaby". I would audition `bell` or `keys` for that line.
2. The dynamic arc is fairly flat (window rms -17.6 … -15.1 dB from 1.5 to 10.5 s); the fox's stop at 5.0 s is a harmonic hush (Gm9, tiptoe stops) but not much quieter, because the hero-firefly arpeggio sits there. A deeper dip in bar 4 would make the stop read more.
3. Letter pops 6–10 (9.43–9.77 s) sit about 9 dB under the music's F downbeat; they read as texture, not as individual letters. I could hold the F chord back by an eighth or thin the pad there.

## Musical decisions
- **Key:** F major. The original's `chime` sfx (the label's dash) measured as C6 (1046.5 Hz, my Goertzel scan of the export), the fifth of F, so it rings inside the final F chord with no re-pitching.
- **Tempo / meter:** 120 quarter-beats a minute in 6/8 (`meter: 3, grid: 2`): one bar = 1.5 s, felt as a slow rocking 80 dotted-quarters a minute, a lullaby. The fox's leg half-swing is 0.25 s, which is exactly one eighth note, so its walk is the pulse.
- **Placement:** the layer starts at 0.5 s; movie time = 0.5 + beat × 0.5. That puts bar 2 on the fox's entrance (2.0 s), bar 4 on its stop (5.0 s), an eighth-note pickup on its re-start (6.25 s), the dominant's resolution on the swoosh's peak (8.75 s) and the tonic on the label landing (9.5 s). No picture timing was moved.
- **Parts:** `pad` (one chord a bar, the harmony: Fadd9 | Fmaj7 | Bbmaj7 | Gm9 | Dm7 | C7sus4 C7 | Fadd9), `bass` (roots, enters with the fox), `pluck` (the fox's tiptoe: staccato eighths only while it walks), `musicbox` (the hills, the fireflies, the last note), `lead` (the firefly's song, bars 5–7). No drums: it is a night lullaby; the pops of the paper are the only percussion.
- **Ending:** the final Fadd9 is struck at 9.5 s with the lead's a4 and a plucked F strum, the chime adds C6 at 9.9 s, the pad and bass fade by `vol` points, and a soft music-box f6 at 11.0 s marks the held last frame; the mix is at -32 dB rms by 11.5 s and -57 dB at 11.9 s, so the movie's end cuts nothing audible.

| Time (s) | Picture | Sound |
|---|---|---|
| 0.5 | moon swells in (0.3–1.1), stars fade up | pad Fadd9 fades in (vol 0.12 → 0.5 over 1.25 s) |
| 0.6, 0.8, 1.0, 1.2, 1.4 | the five hill layers rise into place | a paper `pop` each (kept) + a music-box note each, rising c5 f5 g5 a5 c6 (free time, beats 0.2 … 1.8) |
| 2.0 | the fox walks in from the left | bar 2: bass f2 enters, the pluck tiptoe starts on the eighths (2.0, 2.25, …), Fmaj7 |
| 3.5 | the fox crosses the meadow, fireflies start blinking | bar 3: Bbmaj7, tiptoe continues |
| 4.25, 4.75 | fireflies; the hero firefly appears at the fox's nose (4.8) | soft music-box d6, then f6 at 4.75 |
| 5.0 | the fox stops | bar 4: tiptoe stops, harmony turns to Gm9 (pad and bass dip) |
| 5.25, 5.5, 5.75, 6.0 | the head lifts (5.2–5.65) and the firefly rises (5.15–5.8) to hover | music-box arpeggio g5 bb5 d6 a6 |
| 6.25 | the fox walks on | pluck pickup c4 into bar 5 |
| 6.5–8.0 | the firefly floats up toward the moon (6.4–8.4) | bar 5, Dm7: the lead's phrase a4 c5 d5 |
| 8.0 / 8.6 / 8.75 | the fox leaves; the label unfolds (8.6–9.45) | bar 6: C7sus4; the `swoosh` (kept) peaks at 8.76; C7 at 8.75 under it |
| 8.97–9.77 | letters pop in one by one | the 10 letter `pop`s (kept) |
| 9.5 | the label has landed (9.45) | bar 7: Fadd9, bass f1, lead a4, a plucked F strum |
| 9.9 | the orange dash draws | `chime` (kept) = C6 over the F chord |
| 11.0 | the final frame holds | a soft music-box f6, the chord fades out by ~11.9 |
