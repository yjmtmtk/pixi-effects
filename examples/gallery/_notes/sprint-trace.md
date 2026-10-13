# sprint-trace - usability notes
Model: opus   Slot: T19   Cycles: 9   Result: works
Timeline: started 13:49; first page that rendered at +4 min (13:53, first check OK with no warnings); first contact sheet looked at at +4; done at +16 (14:05)

Concept: a 100 m final in REAL time (the race clock runs 0.00 -> 9.81 in 9.81 s of video). Only traces and numbers:
Marey-style chronophotographic ticks every 0.2 s per lane (the spacing IS the speed), a speed-over-distance graph that shares
the track's x scale and is revealed exactly under each runner, leader splits at every 10 m (lane 5 leads at every split until the
line, where lane 4 takes it), peak-speed markers (the loser has the higher peak and fades; the winner holds). One accent colour.
Positions come from a velocity model (v = vm(1-e^-t/tau) - k(t-td)+, vm solved per athlete for the finish time), sampled into
linear keyframes. The music is 122.32 bpm so that 20 beats = 9.81 s: the winner's finish lands on the downbeat of bar 6.

## Went smoothly because the docs said so
- AGENTS.md -> quickstart -> SKILL.md was a short, clear path; `help counter` answered the running clock in one screen (`{value}` + `format.decimals`).
- `help mask` said at its very top exactly the idea I needed: reveal by growing a mask rect's `width` from `anchorX: 0`. Used it to reveal each speed curve under its runner.
- Cheatsheet line 47 lists `width` as animatable and line 77 says `anchorX: 0` grows a rect left-to-right: traces as growing rects. Worked first time.
- `help null`: one null per lane with `alpha` keyframes dims a runner's whole group (ticks, trace, head, curve) at the end. Clear, worked first time.
- The `music` read-back in `check` confirmed bar/beat layout without counting by hand; a non-integer bpm (122.32) was accepted silently.
- The first check passed with zero warnings; ~800 generated layers (ticks, sampled keyframes) built in 0.2-0.6 s.
- `check --at` frames at full size were what I actually judged with; the sheet tiles are too small for 11 px data labels.

## Stumbles   (one entry each, also small ones)
### 1. Physics tuning took longer than the library   [MY-MISTAKE]
- tried: getting the early leader to be overtaken around 80 m with a simple exponential velocity model.
- happened: with any plausible numbers the crossing happens in the last 10 m; spent ~5 min sweeping parameters in a Node script.
- cause: the model, not the library. Accepted "led until the last 10 m" as the story (it reads well in the split row).
- would have prevented it: nothing in the library.
### 2. Peak label collided with the split row / ran into the times column   [MY-MISTAKE, caught by check]
- happened: `review: text layers "peakLabel" and "splitLane100" overlap by 100%` - the winner's peak was at 90 m and the label went right.
- the review line was precise (names + frame range) and found it before I looked. Fixed by moving the peak earlier and putting peak labels BELOW the curves.
### 3. Sound: sfx were quieter than the music at the moment that matters   [SPEC-ODD / GAP]
- tried: a finish `hit` sfx at volume 1.3 over music at volume 1.4.
- happened: waveform.png showed no peak at the finish at all; the kick of the music peaked higher than the hit. Needed hit volume 3 and `drumVol: 0.6`.
- cause: music peaks at -6 dBFS at volume 1, an sfx at -12...-18; so "volume 1" of each are ~8 dB apart. The cheatsheet does say both numbers, but in two different places.
- would have prevented it: one line next to sfx `volume`: "an sfx at volume 1 is about 8 dB under music at volume 1: an accent over music needs volume 2-3". Or `inspectAudio` advice when an sfx's peak sits below the music bed at its own start ("this hit is masked by the music").
### 4. A track `vol` ramp on the bass did not create an audible build   [GAP]
- tried: `vol: [[0, 0.55], [19.5, 1.0]]` on the bass for a crescendo across the race.
- happened: waveform rms per second stayed flat (-18.x every second).
- cause (my guess): the kick dominates the level and the score is normalised to its own peak. Did not dig further.
- would have prevented it: a `drumVol` that accepts `[beat, level]` points like a track `vol`, or a doc line that the drums set the loudness of a score.
### 5. `check --out` writes straight into the folder   [TOOLING, known]
- as the round-3 lessons said; the printed `files` line was right. No problem because I read the lessons first.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), reference/quickstart.md, SKILL.md: answered the workflow and anchors.
- `help counter` (clock), `help trimEnd` (it returned the shape table: draw-on for grid lines), `help mask` (reveal), `help null` (group dimming), `help music` (bpm, drumVol, track vol points): all answered.
- cheatsheet grep for "animatable" / "anchorX": answered width animation on rects.
- Did not need recipes or pitfalls.

## Wished the library had
- A "sampled curve" helper: `follow(fn, { from, to, step })` -> linear keyframes, for data-driven motion (I wrote 10 lines for it; every data piece will).
- Tabular figures: a `fontVariantNumeric`-style option for system fonts would let a proportional sans be used for counters without jitter (I relied on Helvetica/Arial digits being tabular).
- An sfx-vs-music masking hint in `inspectAudio` (stumble 3).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The middle 8 s are visually even: dots crawl, splits pop. A subtle event at the overtake (a faint vertical marker where L4 passes L5, with the gap number) would give the last second a beat in the picture, not only in the split row.
2. The lower 70 px are empty and the speed graph labels (11 px) are small for a phone; I would enlarge the graph by ~20 px and move the whole block down 10 px.
3. The first frame is black and the intro (rules drawing on) is quick and generic; a stronger opening would type the event line and draw lanes from the start line outward in sync with the "On your marks / Set" beeps.
