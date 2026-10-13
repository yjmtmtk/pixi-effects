# loop-grid - usability notes
Model: opus   Slot: S5-music-visual   Cycles: 9 look cycles (4 critique rounds)   Result: works
Timeline: started 12:50 (wall clock as printed by `date`); brief.md at about +5 min; first page rendered and first contact sheet looked at at about +6 min (it worked on the first run); done at about +15 min of tool time (plus my own thinking time, which `date` does not show well)

## Went smoothly because the docs said so
- AGENTS.md (WebFetch only returned a summary, not the text; the local copy in the repo is the same) -> quickstart.md -> SKILL.md was a short, clear path. `help music` printed the whole music section (tokens, drums from/to in BEATS, per-track transpose, humanize, read-back) in one go: everything I needed to compose was there.
- `recipe music-lofi` and `recipe audio-react` showed a complete score and react(); `musicEvents()` is documented as the way to line a picture up with a note.
- `new loop-grid --size 1080x1080 --duration 13` wrote the page with my size and length already filled in.
- The first render had no warnings and the `music` read-back in `check` matched the score I meant (bars, beats, drums from/to), so I could check the score without hearing it.
- The docs said where the level would end up ("0.8 reads about −22 LUFS ... raise `volume` and watch truePeakDb"). It did: 0.9 gave −21.3 LUFS, so I raised it to 1.5 → −16.9 LUFS, −2.0 dBTP, judged only by the check's numbers.
- Per-track `transpose` let the grid rows stay in pitch order while the bass sounds an octave down and the bell an octave up. `humanize: 0` gave exact timing for frame-accurate sync.
- `check --no-export --at a,b,c` took about 5 s per round, so the look loop was cheap. The full check with export took 15–17 s.
- The waveform.png and the per-second RMS (−24 dB in pass 1 → −16 dB in pass 2 with drums → the ending decays) confirmed that the sound builds where the picture builds.

## Stumbles   (one entry each, also small ones)
### 1. WebFetch of AGENTS.md returned a summary, not the text   [TOOLING]
- tried: WebFetch raw AGENTS.md "verbatim". happened: the fetch model refused to give the text verbatim and returned a summary. cause: the fetch tool, not the library. Read the local copy instead.
- would have prevented it: nothing in the library. The short AGENTS.md also lives in the npm package (`node_modules/pixi-effects/...`): saying so in the README would help.
### 2. The grid showed at frame 0 before its "draw-in"   [MY-MISTAKE, documented]
- tried: 256 cells, each `keyframes: [{ at: t, from: { alpha: 1, scale: 0.6 }, to: {...} }]` with t = its count-in hat (0–0.875 s), so they would appear on the hats.
- happened: on the contact sheet, frame 0 showed every cell, small and grey. No warning. cause: pitfall 34, "`from` shows its start value from the LAYER's start". I had not read it, and found it with `help from` after seeing the sheet. Fix: the layer's own `at: t` and a keyframe at 0.
- would have prevented it: a review line in `check` when many layers have a first keyframe with `from` and `at > 0` while `initial.alpha` is 0 ("these layers show their `from` value from their start; if you meant them hidden until then, give the layer an `at`"). A single sentence about this in quickstart's "what goes wrong most" would also help.
### 3. A named mask on parented layers   [GAP, the warning was excellent]
- tried: `mask: 'grid-clip'` on each ripple (children of a null `rig`).
- happened: `layer "ripple-bass-1.00": it has a parent, so it is drawn in the null layer's space and the matte is in the composition's: mask the null layer ("rig") instead`. I did exactly that and it worked. This only goes under GAP because SKILL.md's mask rule does not mention nulls. The warning tells you what to change.
### 4. A note with no picture   [MY-MISTAKE, caught only by my own test]
- tried: the score and the cells come from one array, but I wrote the three final notes by hand in both places and forgot the pluck's final note in the picture.
- happened: nothing warned (the library cannot know). A temporary `musicEvents()` comparison found it: 53 of 54 notes had a cell.
- would have prevented it: a way to see note onsets in `check` without writing code, e.g. `check --music-events` writing `report.audio.music[i].events` (time, track, name), or a `musicEvents` timeline row in timeline.html. Then a reviewer can line the notes up with `--at`. `inspectAudio()` lists the music as ONE source, so on its own it cannot show sync.
### 5. The read-back counts bars from the score's beat 0, so a pickup shifts every bar   [SPEC-ODD]
- tried: a 2-beat count-in (soft hats), then the 2-bar loop.
- happened: the read-back says "6.25 bars" and puts my downbeats on beat 3 of each printed bar ("a2(3) ..."). It is correct, but harder to read than it needs to be.
- would have prevented it: a `pickup: 2` (anacrusis) score option that only shifts the bar numbering in the read-back and in `musicEvents` (like `meter`).
### 6. The template's page style for a square canvas   [SPEC-ODD, small]
- `new --size 1080x1080` keeps `.stage { width: min(960px, 100%) }`, so a 960 px square does not fit a laptop screen. I changed it to `min(760px, 100%, calc(100vh - 32px))`. `new` could write a height-aware width when the size is not 16:9.

## Docs I read, and which answered my question
- AGENTS.md → `skills/pixi-effects/reference/quickstart.md` → `SKILL.md`: the workflow, poster, the check. Answered.
- `help music`: the whole notation, drums from/to, transpose, humanize, read-back, musicEvents/musicEnvelope. Answered everything about composing.
- `recipe music-lofi`, `recipe audio-react`: I did not use react()/envelopes in the end (every flash is a written note at its exact time), but the recipe made it clear what they would give.
- `help mask`: inline masks only. The named-mask-on-parent case came from the warning, not the docs.
- `help from` (after the frame-0 surprise): pitfall 34 answered it.
- grep cheatsheet for stroke / set / null: all answered (`set: { text }` for the counter, `strokeWidth` animatable, null + parent).

## Wished the library had
- Note onsets in the check report (see stumble 4). Better still, a helper `musicEvents(...).map(...)`-style "one layer per note" example in `recipe`, because "the picture follows the notes exactly" is the whole point of text music. The docs mention lighting keys, but no recipe shows it with exact frames.
- `pickup` (anacrusis) for the read-back bar numbering.
- Optional: `check --listen-report` printing per-track peak/level, so I could confirm that the bell sits above the bass by numbers. Right now I only get the mix.

## Self-assessment
1. In stills the middle (pass 2) looks much like pass 1. The build is real in sound (+7 dB, drums) and in motion (kick pump, snare flash, outlined pluck cells), but a viewer with the sound off sees little growth. With 3 more cycles I would let pass 2 change the grid itself (the kick briefly brightening the whole bass register, or the playhead getting an orange cap only once the drums are in).
2. Small type: the "54 NOTES" caption and the "BAR · BEAT" / "LOOP" labels are 13 px on a 1080 canvas, which is near unreadable on a phone. I would set them at 16–18 px and drop the legend's grey tail ("120 BPM · A MINOR PENTATONIC") to its own line.
3. The ending is a cut to a still: everything lights in a 0.27 s wave at 11.0 s and then nothing moves for 2 s. That is deliberate, but a slow last breath (the bell's ring shown as the final cells dimming in step with the reverb tail) would make the hold feel tied to the sound like the rest of the piece. Also, frame 0 is nearly black (two columns), so the first impression in a feed without a poster is weak.

## Critique log (process rounds)
First page rendered and first contact sheet looked at: ~+20 min. It worked first time: no warnings, music read-back exactly as written.
### Round 1 (looked at check-out/at.png + frames/7.00s.png)
1. 3.0 / 7.0 / 9.6 s: the playhead (orange at 13 % over graphite) reads as a muddy brown column; same for programmed bass cells (orange at 42 % = rust). Alpha blending breaks the 4-colour palette.
2. 7.0 s: ripples leave faint large rectangles (two at once, upper-left and lower-left) that read like UI selection boxes, not like a struck note: the alpha fades with the size, so the big end of the ripple is still visible.
3. 3.0-9.6 s: a pluck hit (filled bone) looks the same as a bell hit; the form code (filled vs outline) is lost at the moment it matters.
4. 0.5 s: the counter shows "0.0" during the count-in (a nonsense bar number).
5. Row labels say E5 / C4 but the bell sounds an octave above its row and the bass an octave below: the labels lie. Use pitch classes.
6. 12.0 s: the end holds the fingerprint but nothing tells what it is; add a one-line caption (2 bars, 16 steps, N notes) so the hold reads as the conclusion.
### Round 2 (frames 0.5-12.5 after round-1 fixes)
Fixed in round 1: playhead is a neutral 7 % bone column; programmed notes are small pure-colour "armed" squares that grow into full cells for the fingerprint; pluck hits are outlined; counter shows "–.–" during the count-in; row labels are pitch classes; "23 NOTES" caption appears at the end.
1. 11.0 s: the final A5 ripple runs up through the hat-tick lane into the legend line; bottom-row bass ripples (6.0 s, 11.0 s) cross the orange floor line. -> clip ripples to the grid.
   (First try: a named mask on each ripple; warning: `layer "ripple-bass-1.00": it has a parent, so it is drawn in the null layer's space and the matte is in the composition's: mask the null layer ("rig") instead`. Clear and correct: masked the rig, 10 px larger than the grid so the kick pump and a struck edge cell are not cut.)
2. The right column (16 grey letters) is dead weight: it carries no time. -> every note now lights its row letter in the instrument colour (the column plays the melody).
3. Mix too quiet for web: -21.3 LUFS, true peak -6.5 dBTP at volume 0.9 -> volume 1.5 gives -16.9 LUFS, -2.0 dBTP (read from the check's audio line).
4. 3.0 s and 7.0 s look almost the same in stills: the second pass's build (plucks, drums) only shows in motion. Kick pump 1.4 % is too timid.
Sync verified by numbers (temporary code, removed afterwards): `musicEvents(music)` lists 54 notes in bass/bell/pluck and 10 kicks; I compared each note's frame (round(time*30)) with the start frame of my hit layers. First run: 53/54, `pluck@330` missing: the pluck's final e4 at 11.0 s had no cell. Added it; second run 54/54 and 10/10 kicks. I cannot hear the piece: the sync claim rests on this comparison, the check's music read-back (bars and beats exactly as written) and the loudness numbers.
### Round 3 (0.27, 5.0, 9.0, 11.17, 12.5 s)
Fixed in round 2: ripples clipped to the grid (mask on the rig), row letters light with their notes (18 px now), kick pump 2.5 %, floor line 6 px, mix -16.9 LUFS.
1. 5.0 / 9.0 s (kick + a struck bottom-left cell at 1.4x): the struck cell touches the orange floor line and they merge into one orange L. -> floor line 6 px lower.
2. 12.5 s: the final pluck note (added after the sync test) holds as a grey filled box with a thick outline: a fifth visual state in the fingerprint, which otherwise has only full white, full orange and outlines. -> its fill fades out after the strike so it settles into the outline state.
3. 12.5 s: the caption says "23 NOTES" but 26 cells are lit (the ending adds three). -> caption counts what was played: 54 notes, from the same note list.
### Round 4 (full contact sheet after round 3)
Fixed in round 3: floor line lower, final pluck settles into the outline state, caption "54 NOTES", clip mask 16 px larger (a struck col-0 cell during the kick pump was cut by 3 px at 5.0 s).
1. 0.0 s: all 256 cells visible (small, grey) at frame 0, and all hat ticks at full white: the count-in draw-in never happened (stumble 2). -> layers start at their reveal time.
2. 4.73 s: a pluck "armed" outline appearing at scale 0.2 looks like a broken bracket for one frame. I accepted it as part of the reveal.
3. 11.83-13.0 s: the hold is clean. The caption is tiny (13 px); I left it (see self-assessment).
Final check: no warnings, no layout issues, mix −16.9 LUFS / −2.0 dBTP, export 1.14 MB, 13.03 s, audio 13.03 s.
