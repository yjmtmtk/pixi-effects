# synthwave-drive - usability notes
Model: opus   Slot: M1-synthwave-drive (music retrofit)   Cycles: 4 checks (3 --no-export, 1 full, 1 final full)   Result: works
Timeline: started 12:51; score planned from the docs at +8 min; first check with music at +11; contact sheet + waveform looked at at +14; done at +20

## Went smoothly because the docs said so
- `help music` gave the whole notation in one screen: beats not seconds, lowercase notes / capital chords, `!` `,` accents, drums as a list of `{ from, to }` sections counted in BEATS. My first score played with no warning.
- The `check` music read-back ("pad | Am | Am | F | C G(3) | ...", "drums kick, snare · beats 4-24") let me verify the arrangement without hearing it; it caught my first mistake (see 1) immediately.
- `musicEvents()` imports and runs in plain Node (no browser), so I could print every note time and every drum hit and compare them with the picture's times. Very useful.
- SKILL.md's "pick a tempo whose bar is a round number of seconds" pushed me to look for the piece's own clock: the grid floor repeats every 0.8 s, so 150 bpm half-time (bar 1.6 s) locks one drum hit to each grid line.
- The sfx table with "loudest at" let me place the swooshes by their peak, and `inspectAudio().sources[].sound.loudestAt` confirmed it.
- `report.audio.windows` (0.1 s RMS) showed the intro swell and the ring-out to silence numerically; `waveform.png` showed the same at a glance.

## Stumbles
### 1. A drum section with `to` past the last note lengthened the music   [MY-MISTAKE, read-back caught it]
- tried: the final hit as `{ from: 26, to: 30, kick: 'x...', crash: 'x...' }` (one hit at beat 26, "to" just generous).
- happened: read-back said "30 beats = 7.5 bars · 12 s (+0.4 s tail)" and every track "ends early: silent from beat 29"; the tail would have been cut by the movie end.
- cause: drums' `to` counts toward the music's length even when no hit falls in the extra beats.
- would have prevented it: one doc line under Drums: "`to` sets the music's length too; a section that only needs one hit should end right after it (`to: 27`)".

### 2. Read-back flags an intentionally short last bar   [SPEC-ODD]
- tried: 7 bars + a 3-beat final chord, so the last sound decays to silence by 12.0 s instead of being faded by the movie end.
- happened: "pad 7.25 bars (not a whole number of bars: a bar is short)" for every track.
- cause: the read-back cannot tell a deliberate shortened ending from a counting error.
- would have prevented it: say "the LAST bar is short (3 of 4 beats)" when only the final bar is partial, which reads as a design choice rather than a bug.

### 3. `sound.peakDb` ignores the layer's `volume`   [GAP]
- tried: compare sfx levels with the music via `inspectAudio().sources[].sound.peakDb`.
- happened: every swoosh/hit/custom sfx reports -12 dB whatever its `volume` (0.45, 0.6, 0.75); the glitch -18.1 at both 0.65 and 0.6.
- cause: "the sound alone" appears to be measured before the layer volume. api.md does not say so.
- would have prevented it: document it ("before `volume`"), or add `sound.peakDbAtVolume`, so "is my sfx buried under the music?" can be answered by number.

### 4. glitch's "loudest at 0.22 s" depends on the seed   [GAP, small]
- tried: placed the stutter glitch by the table's 0.22 s.
- happened: seed 3 peaks at 0.149 s, seed 9 (pitch -2) at 0.082 s; moved the layer after reading `loudestAt`.
- would have prevented it: the table could say "≈ 0.08-0.22 s depending on seed: read `loudestAt`".

### 5. Template's loader.css also points at the local build   [SPEC-ODD]
- the brief named three importmap entries; the original also links `../../dist/loader.css`. Replaced it with the CDN 0.35.0 URL too (the template does the same).

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: workflow and the tempo advice. Answered.
- `help music` (dsl.md music section + api musicEvents/musicEnvelope/musicBuffer + pitfall 58): everything about the score. Answered.
- `recipe music-lofi`, `recipe sfx-cues`, `help sfx` (preset table, custom voices with `pan: [from, to]`): answered.
- `help inspectAudio`: answered except stumble 3.
- Not needed: cheatsheet, pitfalls end to end.

## Wished the library had
- An instrument with a sawtooth bite (a "synth lead" / "brass stab"): synthwave lives on saw leads and gated stabs; `lead` is described as "soft". I could not hear whether it is soft enough to sound wrong for the genre.
- Sidechain pumping (duck the pad on the kick), the signature synthwave sound; a `duck: 'kick'` track option would do it.
- A reverse direction for the `swoosh` preset (`pan` or `direction: 'rtl'`): I had to write a custom noise voice for the meteor that falls right to left.
- `check --audio-at 6.0` printing which notes / drum hits / sfx sound at a moment (I wrote a 20-line Node script with `musicEvents` to get this).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. I cannot hear it. Whether `lead` and `pluck` sound like 80s synths or like a soft lo-fi set is unknown; the genre fit is the biggest risk. With more cycles: render variants with `tone` 0.4 / 0.9 and compare `brightnessHz`.
2. The swooshes (meteor-1, DRIVE) peak around -16 to -19 dB alone against a -3 dB music peak; spectrally they sit far above the music (3-8 kHz vs 700 Hz) so they should cut through, but that is inferred, not measured.
3. The title strike at 1.2 s has only a glitch and the riser; the music's downbeat comes 0.4 s later at the lock-on. That is deliberate (strike, then drop), but a viewer may expect the boom on the first flash. I would A/B moving the crash/hit to 1.2 s.

## Musical decisions
- Key: A minor. Progression i-VI-III-VII (Am F C G), with a V (E major) in bar 7 so the last chord resolves as a real cadence.
- Tempo: 150 bpm counted in half time (beat 0.4 s, bar 1.6 s). Reason: the grid floor repeats every 0.8 s, so kick and snare alternate exactly once per grid line, and every picture event already sat on the 0.4 s grid except three (nudged, below).
- Parts: pad (Am swell from silence, chords throughout), bass (octave eighths from the drop, last root held), pluck arp (eighths up-and-back, bars 3-7), lead (a 3-bar line ending on a5 over the final chord), bell (meteor sparkles + a final shimmer), keys (the 4-hit stutter), drums (half-time kick/snare bars 2-6, hats bars 3-6, crashes at the drop / bar 5 / the end, a tom + snare fill in bar 7).
- Length: 29 beats = 11.6 s + 0.4 s tail. The final Am9 rings out: RMS -19 dB at 11.2 s, -28 at 11.6, -57 at 11.9, silence at 12.0. No cut-off.
- Timing nudges to the picture (3 frames each, nothing else changed):
  - meteor-1: 6.1 s -> 6.0 s (beat 15)
  - meteor-2: 8.7 s -> 8.8 s (beat 22, on a snare)
  - title end stutter: 10.5 s -> 10.4 s (beat 26, the last chord); its internal spacing (0.04 / 0.1 / 0.16 s) kept.

| Picture moment | Time | Sound |
|---|---|---|
| fade in from black | 0.0-0.85 s | pad Am swells from silence (RMS -69 dB -> -30 dB at 1.1 s); riser from 0.6 s |
| SYNTHWAVE neon strikes (flicker) | 1.2 s | `glitch` sfx (loudest 1.35 s, inside the flicker) |
| the tube locks on, ghosts converge | 1.6 s | the drop: crash + kick + octave bass + `hit` sfx (pitch -3); riser peaks at 1.56 s |
| DRIVE letters track out | 2.0 s | soft `swoosh` (loudest 1.99 s) |
| captions fade in | 3.2 s | arp (pluck) and hats enter, chord moves to F |
| poster moment, sun behind ridge | 5.6 s | chord change C -> G, snare |
| meteor 1 (left -> right) | 6.0 s | bell sparkle e6-b5-g5-e5 + bright `swoosh` (loudest 6.20 s) |
| bar 5, mid-piece lift | 6.4 s | lead melody enters, soft crash |
| meteor 2 (right -> left) | 8.8 s | snare + bell sparkle d6-b5-g5-d5 + custom noise sweep panned right -> left (loudest 8.97 s) |
| build to the end | 9.6-10.4 s | E chord, tom + snare fill |
| title stutter (dim/bright/dim/bright) | 10.4-10.56 s | Am9 on keys stuttered soft/accent/soft/accent at the same four times; crash + kick; `glitch` sfx loudest 10.44 s; lead a5, bell a6, bass a1 |
| final hold | 10.56-12.0 s | Am9 rings out to silence at 12.0 s |

## What I could not verify
- How it actually sounds (timbre, genre fit, whether the lead is too soft, whether the mix is muddy). Only levels, times and spectral centroids were checked.
- Whether the sfx are audible inside the mix (stumble 3: per-sound peaks ignore `volume`; inferred from volume x preset level and the spectral gap).
- The drum hits are 0.06 s after each grid line leaves the bottom edge (lines exit at ≈ 0.74 s mod 0.8); the period matches exactly, the phase I judged by numbers only, not by watching it at speed.
