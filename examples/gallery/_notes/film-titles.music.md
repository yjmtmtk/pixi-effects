# film-titles - usability notes (music retrofit)
Model: opus   Slot: M2-film-titles   Cycles: 6 checks (4 quick `--no-export`, 1 scratch `musicEvents` read-out, 1 full)   Result: works
Timeline: started 12:51; docs read by ~12:54; first check (with the score) at ~12:55; contact sheet looked at at ~12:58; done at ~13:01

## Went smoothly because the docs said so
- `help music` was the whole manual: the token table, chords vs notes (capital vs lowercase), `[a b c]` voicings, `~` hold,
  `!` / `,` accents, `vol` points, drums with `from` / `to` in BEATS, `tail`, and the length rule (longest track + tail, never past the
  movie end). I wrote a 7-track score with drums in one pass; every track came out at exactly 21 beats on the first try.
- The `check` music read-back (bars per track, what starts on which beat) confirmed the score without listening. Very good.
- `help sfx` gives each preset's length and loudest point (swoosh 0.16 s of 0.5, riser at its end). For STRETCHED sfx the loudest point
  scaled proportionally (swoosh 0.5 -> 4.0 s: loudest at 1.284 s, i.e. 0.32 of the length as predicted), and `inspectAudio().sound.loudestAt`
  confirmed it: the headlight swoosh peaks at 7.20 s, exactly when the light crosses the shard.
- The swoosh "moves left -> right" (doc line) matched the picture's headlights, which also move left -> right. The doc saying so made the choice.
- The per-0.1 s `windows` (rms / peak / brightness) in report.json let me see every onset I wrote (2.6, 5.6, 8.0, 8.45, 9.2, 10.4, 12.2) and
  the decay of the ending (13.4 -30 dB, 13.6 -38, 13.8 -59: a natural fade, not a cut).
- Library warning for a bad token named the track index, the instrument and the token: fixed in one edit.

## Stumbles
### 1. Accent before the length after a bracket chord   [WRONG or GAP]
- tried: `[d2 a2 d3]!:3` (the docs show `c4!:1`: "accent / soft, before or after the length").
- happened: `warn: pixi-effects: layer "score" music.tracks[6] (keys): cannot read ":3" (a note in lowercase like c4 ...)`.
  The warning told me which track and which token, but not that the `!` was the problem; it suggested the token was a bad note.
- cause: after `]` only the `:len!` order is accepted (`[d2 a2 d3]:3!` works).
- would have prevented it: accept `]!:3` like `c4!:1`, or say in the table "after a `[...]` chord put the accent after the length".
### 2. The original's stylesheet points at the local build too   [SPEC-ODD]
- tried: the brief says replace the three `pixi-effects*` importmap entries.
- happened: `<link href="../../dist/loader.css">` would 404 in the slot folder; I replaced it with the 0.35.0 CDN `loader.css` that `new` writes.
- would have prevented it: the brief naming the loader.css link as the fourth line to rewrite.
### 3. Low end eats headroom; nothing told me   [GAP]
- tried: a `sub` drone on d1 (37 Hz) under bars 2-5.
- happened: no warning; the windows showed brightness 60-80 Hz for the whole title bar and the title hit only ~2 dB above its bed.
  Moving the drone to d2 at vol 0.3 fixed it (the hit now stands 4-5 dB above the bar after it).
- would have prevented it: a `notes` line in the audio report when a long stretch has its brightness below ~100 Hz ("mostly sub-bass:
  inaudible on laptop speakers, uses headroom"); and in `help music`, "sub below c2 is felt, not heard".
### 4. `musicEvents()` is only reachable from inside a page   [TOOLING]
- tried: verifying the note times by data, as the docs recommend.
- happened: there is no CLI for it; I made a scratch copy of the page that `console.warn`s `musicEvents(score)` and read it from
  `report.json.logs` via `check`. It worked (all times matched my beat grid to the millisecond), but it is a hack.
- would have prevented it: `check` printing the music read-back in SECONDS of the movie too (e.g. `d5(4) @2.60`), or
  `pixi-effects music <page>` printing `musicEvents` for each music layer with the layer's `at` added.
### 5. A source's `peakDb` in inspectAudio is ambiguous   [GAP]
- happened: `sfx-headlights` reports `peakDb: -4.5` while its `sound.peakDb` is -12 at volume 0.8. It looks like the mix peak during the
  layer's span (the kick and the musicbox are under it), not this layer's contribution.
- would have prevented it: name it `mixPeakDb` or document it in one line; a per-layer "contribution" level would tell "buried under the sfx" apart.
### 6. Loud level target for a cinematic piece   [SPEC-ODD, small]
- the docs say web video is -14 to -16 LUFS; a title sequence with a quiet start and a decaying end measures low by integration.
  I settled at -17.5 LUFS integrated, true peak -2.9 dBTP: the louder sections (8-13 s) sit at -15.5 to -16.5 dB RMS/s. No note fired, which is right.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: orientation, the check workflow. Answered.
- `help music`: everything about the score. Answered (except stumble 1).
- `recipe music-lofi`: a full working score to pattern-match the syntax. Answered.
- `help sfx`: presets, knobs, stretched durations, loudest points. Answered.
- Not needed: cheatsheet, pitfalls (the `help` output already quoted pitfalls 49, 58, 61, 68).

## Wished the library had
- Music read-back in movie seconds (stumble 4), and a "beat at time" helper in the check output for scoring to picture.
- A tempo-to-picture helper: given a list of picture hit times, suggest bpm + offset (I wrote a 10-line search script for this).
- A dark, low "boom" or "sub drop" preset distinct from `hit`, and a "whoosh-by" (doppler) preset for a passing car; I approximated with a
  stretched, pitched-down swoosh.
- An sfx `pan` knob on presets (the bars closing in from top and bottom would sit centred anyway, but a credit at the right edge could ping from the right).

## Musical decisions
- Key: D minor (the shard is amber on teal night; minor, low, slow). Harmony over a D pedal throughout:
  i (Dm) - bVI (Bb/D) - iv (Gm/D) - bII (Eb/D, the Phrygian darkening as the starring card arrives) - V7b9 (A7b9/C#, tension into the title) - i(add9) (Dm with E on the title).
- Tempo: 100 bpm, 4/4, music starts at 0.8 s, so a bar is 2.4 s and the bar lines are 0.8 | 3.2 | 5.6 | 8.0 | 10.4 | 12.8.
  Chosen because the starring card (8.0) and the main title (10.4) are exactly one bar apart, and the rule (11.7 -> 11.6) and tagline (12.2)
  then fall on beats 3 and 4 of the title bar.
- Parts: `pad` (the night, slow attack, swelling to the title); `sub` d2 drone (bars 2-5); `bass` dry eighth-note ostinato in a 3+3+2
  accent pattern (bars 2-4) that stops dead for the title; `pluck` harp arpeggio (bars 3-4, crescendo); `musicbox` theme D-F-E-A ... D, one
  note per credit name; `bell` (one high A on the rule); `keys` (title chord, last chord); drums: a soft lub-dub kick from bar 3, a ticking
  off-beat hat in bar 4. No crash, no snare: the restraint of the picture.
- Sound effects (5): dark stretched swoosh for the letterbox bars; long low swoosh for the passing headlights; dark riser 8.0-10.4; deep hit on the title; soft dark swipe on the rule.
- Picture moments and their sounds:
  | time | picture | sound |
  |---|---|---|
  | 0.8-2.4 | fade from black, letterbox bars close in (0.6-2.6) | pad Dm rises from silence (attack 1.6 s); low swoosh loudest at 1.53 s (bars mid-move 1.6) |
  | 2.6 | "A NOCTURNE PRODUCTION" sharpens | musicbox D5 |
  | 3.2 | (bar 2) | bass ostinato and sub drone enter, pad moves to Bb/D |
  | 5.6 | "MIRA HALVERSEN" sharpens (credit nudged 5.2 -> 5.3) | musicbox F5, pad Gm/D, harp arpeggio and heartbeat kick enter |
  | 7.20 | the headlight crosses behind the shard (sweep 4.6-9.8, brightest 6.2-8.2) | long low swoosh loudest at 7.20 s, panning left -> right |
  | 8.0 / 8.6 | "starring", ELIAS MARCH / JUNE TAVERNER | musicbox E5 / A4 on the bar line and beat 2; pad Eb/D; riser starts; hat ticks |
  | 9.2 | (key light starts to drop at 9.6) | pad to A7b9/C#, ostinato to C#: dominant tension |
  | 10.4 | THE LONG NIGHT letters bloom from the centre | deep hit + sub D + keys D-A-D, pad Dm(add9); ostinato, drums and harp stop |
  | 11.6 | the amber rule draws out (nudged 11.7 -> 11.6) | bell A5 + soft dark swipe |
  | 12.2 | tagline fades in | last chord: keys D-F-A-E + musicbox D5; rings out to near silence by 13.8 s (score tail 0.6 s) |
- Timing changes to the picture (both 3 frames): credit c2 `at` 5.2 -> 5.3 (its name now sharpens on the bar line 5.6);
  `RULE_AT` 11.7 -> 11.6 (beat 3 of the title bar). Plus the four CDN URLs (importmap x3 + loader.css). Nothing else in the picture changed.

## What I could not verify (I cannot hear)
- Timbre: whether the stretched, -14-semitone swoosh reads as a car passing or as a smear; whether the musicbox is too "cute" for a thriller
  (I kept it at vol 0.5 with heavy reverb); whether the A7b9 voicing on the pad sounds muddy at d3-bb3.
- Whether the swipe and the bell on the rule are heard at all under the pad (the 0.1 s window shows the brightness jump 90 -> 740 Hz at 11.6,
  but the RMS does not move: they are colour, not a hit).
- Translation to laptop speakers: most of the energy is below 200 Hz (score brightness 190 Hz).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. Credit c1 ("presents") and the light sweep start (4.6) are not on the grid; the c1 name ping at 2.6 is 0.05 s after the name begins, fine,
   but nothing marks 4.6. I would add a very soft pad swell or a tom roll into 5.6.
2. The ostinato enters at 3.2 where the picture is static (c1 holding); an entrance at 5.6 with the second credit might feel more motivated.
3. Integrated -17.5 LUFS is a little quiet for web; I would push the score to 1.35 and watch the true peak (now -2.9 dBTP).
