# generative-orbits - usability notes (music retrofit)
Model: opus   Slot: M3-generative-orbits   Cycles: 4 (3 audio-only checks + 1 full check)   Result: works
Timeline: start 12:51; first check (audio) at +6 min; first contact sheet looked at at +7; done at +9 (wall clock, approximate)

## Went smoothly because the docs said so
- `help music` gave the whole notation in one screen (beats as the unit, lowercase notes vs capital chords, `vol` as `[beat, level]` points, `ring`, `release`, the drum `from`/`to` in BEATS). Every token I wrote parsed first time, including `E/d`, `Gmaj7#11`, accents `,` and fractional triplet lengths (`0.6666…`).
- SKILL.md's advice "pick a tempo whose bar is a round number of seconds" turned into the core decision: the picture's own clock is 3.5 s (core-halo breath = T/4), so bpm = 480/7 = 68.571; the library took a non-integer bpm without complaint.
- The `check` music read-back (bars per track, what starts on which beat) confirmed every track is exactly 16 beats; `report.json` -> `audio.windows` (RMS per 0.1 s) let me shape the dynamic arc by numbers.
- `help sfx`: the custom `voices` sound let me build a chime tuned to the key (D6/A6/D7 in Hz) instead of guessing the pitch of the `chime` preset.
- `musicEvents(music)` (api.md) returned every note's time: the read-back of all notes against the picture's moments was exact (see sound-report.md).

## Stumbles
### 1. The original also links `../../dist/loader.css`   [SPEC-ODD]
- tried: the brief says replace the three importmap entries.
- happened: the page also has `<link rel="stylesheet" href="../../dist/loader.css">`, which would 404 from the slot folder (the loader would never style/fade). I pointed it at the CDN too (the URL `pixi-effects new` writes).
- would have prevented it: the brief/promotion note saying "four local URLs: three importmap entries and loader.css".
### 2. `pixi-effects new` has no `--out`   [TOOLING]
- tried: `npx pixi-effects new x --out <scratch>` to read the CDN URLs without writing into my slot.
- happened: `unknown option --out (accepted: --size WxH, --duration S, --force)` (good message); I ran it with the scratch dir as cwd instead.
- would have prevented it: nothing needed; maybe `pixi-effects new --print` to just show the import map.
### 3. `musicEvents` needs the score object, which the page keeps in a closure   [GAP]
- tried: verifying note times in the running page.
- happened: there is no `movie.musicEvents()`; `musicEvents(music)` needs the score object. I reached it through the private `movie._composition.sequences.find(s => s.name === 'score').music` from agent-browser. `check` only prints beats, not seconds.
- would have prevented it: `check` printing the seconds (or `movie.musicEvents('score')` / `inspectAudio().sources[i].music.events`), so a reviewer can line notes up with frames without touching privates.
### 4. `report.audio.scenes` lists 110 "scenes" for one piece   [TOOLING]
- happened: every top-level composition (here 10 ring rotors and 100 comet rotors used as transform groups) is reported as a scene with identical LUFS. Noise in report.json, nothing printed to the console.
- would have prevented it: count as scenes only compositions that do not span the whole movie, or only ones flagged as scenes / with `at`.
### 5. First mix was flat and bass-heavy   [MY-MISTAKE]
- happened: with `sub` at a constant 0.55 the RMS was -19 to -20 dB for the whole 14 s (brightness 90-300 Hz); the waveform.png made it obvious. Fixed with `vol` point envelopes on every track following the picture's brightness (dim at 0, full at 7 s, dim at 14).
- would have prevented it: a line in `help music` that a `sub` at default `vol` dominates the mix's RMS; the `notes` advice block in check could flag "level barely changes over the whole piece".
### 6. Cannot hear   [GAP, inherent]
- not verifiable by me: whether the Lydian colour reads as intended, whether the musicbox 3-note cell is pleasant or busy, whether the riser + hit + crash at 7.0 s is too much for a calm piece, the stereo image, and the tuned chime's timbre against the bell. Only levels, timing and pitches are verified.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch, summary only: the fetch tool refused to print it verbatim; the same file was in my context), quickstart.md, SKILL.md: workflow and tempo advice. Answered.
- `help music` (+ docs/dsl.md lines 255-300 for the 16 truncated lines), `recipe music-lofi`: notation, levels. Answered.
- `help sfx`: presets, knobs, custom voices, riser alignment. Answered.
- api.md `musicEvents`: answered, but needs the score object (stumble 3).
- Did not need: cheatsheet, pitfalls (beyond the lines `help` printed).

## Wished the library had
- Seconds in the `check` music read-back (or a `--music-times` flag).
- A pitch for presets in the docs (what note `chime` / `coin` sound) so a preset can be put in key with `pitch`.
- A way to give a whole track a tremolo/swell without hand-written vol points (here every track got 5-6 points for one arc); a score-level `vol` envelope would do.

## Self-assessment: 3 weaknesses, and what I would change with 3 more cycles
1. The bloom at 7.0 s stacks riser + low hit + crash + bell + pad change: it is the mix peak (-3.1 dBFS) and might be heavier than this calm picture wants; I would try it without the `hit` and compare loudness at 7.0-7.5 s.
2. The musicbox runs 8th notes non-stop for 11 s; a generative piece might gain from gaps (a rest every few cells, like the rings' spokes appearing and dissolving).
3. The loop seam: the end decays to about -36 dB RMS while frame 0 starts at -24 dB, so a looping player hears a soft re-entry rather than a seamless join (deliberate ending chosen over a perfect loop).

## Musical decisions
- Key: D Lydian (D major with G#), floating and bright to match the ice-cyan -> amber palette. Progression, one chord per bar: Dmaj9 | E/D (the Lydian lift) | Gmaj7#11 (bloom) | Dmaj9 (fades to silence).
- Tempo: 480/7 = 68.571 bpm, beat 0.875 s, bar 3.5 s, 4 bars = the 14 s loop. Derived from the picture: the core halo breathes every 3.5 s (peaks at 1.75 + 3.5k) and the rings line up into radial spokes at 0, 7 and 14 s.
- Parts: `pad` (bed, swells to 7 s, fades to 0 by 14 s); `sub` (heartbeat: root on every downbeat, softer restrike on each halo peak); `musicbox` (the pendulum rings: a 3-note cell in 8ths that slips against the 4/4 bar the way the rings slip against each other); `bell` (the five rose comets: five rising notes); `pluck` (the 3:2 Lissajous comets: quarter-note triplets, three against the duple bed); one soft `crash`. Master `volume: 1.3`, reverb 0.5.
- SFX: two dark `swoosh`es, one `riser`, one low `hit`, one custom chime tuned to D (D6/A6/D7).
- No picture timing changed (no nudges were needed: every musical event was placed on the picture's own grid).

| time (s) | picture | sound |
|---|---|---|
| 0.00 | rings dim, at the seam, aligned as spokes | Dmaj9 pad + sub d2 enter softly (-23 dB RMS), musicbox cell begins |
| 1.75 | first halo breath peak; rose curve starts drawing (1.6) | sub restrike; first bell note a5; dark swoosh peaks (sfx-rose, at 1.59, loudest +0.16) |
| 1.75-3.50 | five rose comets fade in one after another (2.2-3.2) | five rising bell notes a5 b5 d6 e6 -> f#6 landing on bar 2 at 3.50 |
| 3.50 | full rose visible | chord change to E/D (Lydian lift), musicbox moves to E |
| 4.81 | Lissajous comets begin to fade in (4.8) | higher swoosh peaks on beat 5.5 (sfx-lissajous at 4.6525) |
| 5.25 | halo peak, Lissajous curve fully drawn | pluck triplets begin (3 against 2): e5 g#5 b5 at 5.25 / 5.83 / 6.42 |
| 4.375-7.00 | build toward full brightness | riser, loudest at its end = 7.00 |
| 7.00 | rings snap into radial spokes at full brightness; the two Lissajous comets pass either side of the core, 123 px from it | Gmaj7#11, sub g1, bell b6, pluck d6, soft crash, low hit: the mix peak (-3.1 dBFS, loudest at 7.02) |
| 8.40-11.3 | curves and comets fade out | pluck descends (b5 f#5 a5 f#5 d5), pad thins (vol points) |
| 10.50 | title plate "O R B I T S" fading in (10.2-11.1); rose comets wheel near the core | final Dmaj9 on bar 4; tuned chime D6/A6/D7 (sfx-title); musicbox f#5 e6 -> d6 (11.375) |
| 12.25 | last halo peak; title fading out (12.3-13.2) | soft last sub restrike |
| 13.0-14.0 | dim rings, back at the seam | last chord decays: -31 dB at 13 s, -36 dB at 13.5 s, silence at the end (no cut-off) |
