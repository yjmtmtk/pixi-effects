# isometric-city - usability notes (music retrofit)
Model: opus   Slot: M6-isometric-city   Cycles: 3 checks of the piece (2 --no-export, 1 full) + 2 probe renders   Result: works
Timeline: copy rendered with the score at +2 min after the first check; full check + contact sheet looked at at about +6 min; done at about +8 min (wall clock 13:00 to 13:08; reading docs before that)

## What changed in the file
- Importmap `pixi-effects*` entries and `loader.css` now point at the CDN for 0.35.0.
- The original's audio block had an mp3 bed (`asset: 'bgm'`, `src: '../_assets/bgm.mp3'`). That file does not exist next to the slot, and the gallery rules ban external files, so the layer and the asset are removed and replaced by the `music` score.
- Kept: the river swoosh (1.0 s), the 7 pops on the tallest towers, the title chime (10.0 s). Their levels went up together with the music (swoosh 0.43 -> 0.6, pops 0.25 -> 0.35, chime 0.1 -> 0.16), and the chime is pitched +2 semitones (reason below).
- Picture: NOT changed. No timing had to be nudged: at 120 bpm the picture's own times already fall on the grid.

## Musical decisions
- Key D major, borrowing Bbmaj7 (bVI, from D minor) for dusk. 120 bpm in 4/4: a beat is 0.5 s, a bar 2 s, so the 12 s piece is exactly 6 bars (24 beats), and the piece's built-in times (1.0, 6.0, 7.0, 8.0, 10.0 s) are all on beats.
- Style: a small "city process music" (Reich-like eighth-note ostinato) that grows with the build, then thins out into evening; ends on a struck and released chord, not a loop.
- Parts: `pad` (the light, chord per sky phase, wet), `bass` (the ground), `pluck` ostinato in eighths (the construction), `musicbox` (a noon tune + the stars), `bell` (the windows waking + the title chord), drums (shaker while the city fills, kick + hat at noon, one kick at dusk and one on the title). Layer `volume: 1.5`, `drumVol: 0.4`, `reverb: 0.3`.
- Harmony: | Dsus2 | Bm7 | Gmaj7 A7sus4 | Dadd9 | Bbmaj7 Asus4 A | Dmaj9 (2.5 beats, then silence) |

| Picture moment | Time | Sound |
|---|---|---|
| Sky + slab fade in (dawn) | 0.0 s | pad Dsus2 swells in (attack 0.9 s) |
| River wipes in | 1.0 s (beat 2) | bass enters on d2 + the swoosh sfx (kept) |
| First blocks rise; the build sweeps back to front | 1.5 to 4.05 s (first block 1.75 s) | pluck ostinato: pickup at 1.5 / 1.75 s, then eighths, fading up beats 3 to 9; shaker from 2.0 s |
| Tallest towers pop up | 2.57 to 3.33 s | the 7 pop sfx (kept, exactly on their frames) |
| Full daylight, sky fully blue | 6.0 s (bar 4) | Dadd9, kick + offbeat hat start, musicbox tune f#5 e5 d5 a5 |
| Dusk deepens, windows go dark | 8.0 to 8.6 s (bar 5) | borrowed Bbmaj7, drums thin to one kick + soft hat |
| Windows light up (most between 9.25 and 10.0 s) | 8.75 to 9.875 s | bell f5 a5 d6 c#6 e6 a6, the notes getting closer as more windows wake |
| Title "Kōbe, 2040" rises | 10.0 s (bar 6) | Dmaj9 struck on pad, pluck, bell, bass + a kick + the chime (now on D6) |
| Stars appear | 10.3 to 11.2 s | musicbox a5 (10.5), e6 (10.75), f#6 (11.25) |
| Final hold | 11.25 to 12 s | everything released; level falls from -19 to -50 dB by 11.95 s |

## Went smoothly because the docs said so
- `help music` gave everything needed in one place: token syntax, instruments and ranges, `drums` as a list of `{from, to}` sections counted in beats, `vol` points for a fade-up, the -6 dBFS level of the bed.
- `check` reads the score back per bar (`d2(3)`, `[a2 d3 e3 a3](3)`): I trusted it instead of counting, and every track was 24 beats on the first try.
- The check's audio block (`windows` every 0.1 s in report.json, LUFS, true peak, per-source peaks) and the "mix is quiet for web video" note told me exactly how much to raise the level.
- pitfall 68 (a pitched sfx keeps its own length) answered the question before I asked it.

## Stumbles
### 1. The original's mp3 bed is a dangling external file   [SPEC-ODD]
- tried: reading the original before editing.
- happened: it has `{ name: 'bgm', src: '../_assets/bgm.mp3' }`, which the brief does not mention (it says "sfx presets only"). The file is not there.
- cause: the piece was made for the repository layout.
- would have prevented it: the brief naming it ("remove the bgm asset"). The library side was fine: pitfall 61 says "Do not also add an mp3 bed".

### 2. No way to know an sfx preset's pitch   [GAP]
- tried: putting the `chime` preset on the final Dmaj9.
- happened: the sfx table gives "brightness ≈ 1400 Hz", which is a spectral centroid, not a note. I rendered a probe page with only the chime and ran a Goertzel scan over the export: it rings on C6 (1046.5 Hz), a semitone against the chord's C#. Pitched +2 to D6.
- cause: the docs describe the presets for timing and loudness, not for music.
- would have prevented it: a "note" column in the sfx table (`chime: C6`, `coin: ...`, `beep: ...`), or `inspectAudio` reporting a pitched sfx's fundamental. Now that music exists, every pitched preset will clash with some key.

### 3. `pixi-effects new` has no `--out`   [TOOLING, tiny]
- tried: `new x --out <dir>` to make a probe page outside the slot.
- happened: `unknown option --out (accepted: --size WxH, --duration S, --force)`: clear, I ran it inside the folder instead.

### 4. The pops are off the beat grid and I could not judge whether that sounds like a flam   [MY-LIMIT]
- The 7 tower pops land at 2.57, 2.6, 2.7, 2.93, 3.1, 3.23, 3.33 s, between the ostinato's eighths (2.5, 2.75, 3.0, 3.25). They follow the picture, so I kept them; the `pop` has no clear pitch (broadband 400 to 1100 Hz in my scan), so at least it cannot clash harmonically.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch only returned a summary, the local CLAUDE.md copy had the full text), `reference/quickstart.md`, `help music` (answered almost everything), `help sfx` (answered timing/levels, not pitch), `recipe music-lofi` (shape of a full score), template.html (CDN URLs).
- Not needed: `musicEvents()`: at a constant 120 bpm a beat is exactly 0.5 s, and the check's read-back shows the beat of every note; I measured the onsets in the exported file instead (sound-report.md).

## Wished the library had
- The fundamental of each pitched sfx preset in the docs (or `sfx: { preset: 'chime', note: 'd6' }`).
- The check's music read-back in SECONDS as well as beats (`bell f5 @8.75 s`), for lining up with a picture without doing arithmetic.
- `inspectAudio` reporting the level of the last 0.3 s, to say "ends in a decay, not a cut" directly.

## Self-assessment: 3 honest weaknesses, and what I would do with 3 more cycles
1. Bars 2 and 3 (2 to 6 s) stay flat in level (-21/-22 dB RMS every 0.1 s) while the picture is at its busiest; the ostinato fade-up is barely visible in the numbers. I would add a second pluck voice an octave down in bar 3 or a soft clap on beat 4 to build into noon.
2. The noon kicks stand about 9 dB over the bed in 0.1 s windows; on small speakers that may read as thumps rather than a groove. I would try `drumVol: 0.3` and a `sub` under the kick instead.
3. I cannot hear it: the voicings are reasoned, not heard. The Bbmaj7 against the bright dusk sky may feel darker than the picture, and the chime + bell + pluck all on 10.0 s may be one attack too many.
