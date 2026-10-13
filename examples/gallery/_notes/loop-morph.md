# loop-morph - usability notes
Model: opus   Slot: S10-loop-delight   Cycles: 8   Result: works
Timeline (wall clock, `date`): started 12:51; first page rendered and first contact sheet looked at at about +6 min; done at about +10 min (13:01). The check itself was never the slow part: `check --no-export` took 6 s, the full check with export 13-17 s.

Concept: one ink dot that keeps becoming the next small UI thing - typing dots, a progress bar, a toggle, a success check (with a ripple and a spark burst), a spinner that closes to a point and drops home as the dot again. 12 s, 120 bpm (one state per 2 s bar), every interaction is a musicbox note of one F major figure over a pad, plus quiet tactile sfx. A spec-sheet frame: 小さな動き title, a running clock, the state name, and a pagination control that is itself a micro-interaction.

## Went smoothly because the docs said so
- `npx --no-install pixi-effects new loop-morph --size 1080x1080 --duration 12` wrote a working square page at once.
- quickstart.md + SKILL.md were enough to plan. `help shape` answered rect / arc / trim / morph in one go (rect `width height cornerRadius` are animatable, so ONE rect layer is the dot, the bar, the toggle and the disc; arc angles 0° = 3 o'clock, clockwise; `trimEnd` for the check).
- `help counter` gave `{value}%` and a clock with `format: { decimals: 2, pad: 2 }`; `spans` gave the two-colour state label in one layer.
- `help shader`: a paper background with a faint dot grid and a soft vignette is ONE shader layer; colour uniforms as `'#rrggbb'` became `vec3` as promised; compiled first time.
- `help music`: notes in beats, `humanize: 0`, `drums: { from, to }` in beats. I wrote a small seconds → beats helper so every interaction note is generated from the same times as the picture; the `check` music read-back (`musicbox 6 bars | c5(2.5) d5(2.75) ...`) confirmed the notes land on the right beats without listening.
- `check --at 0.35,1.05,...` (one tile per transition midpoint) and `--onion 0.7:2.2` were the fastest way to judge morphs and squash-and-stretch. `waveform.png` showed the end-of-movie fade at a glance.
- Zero warnings during the whole session: every key I guessed was right, which says the docs' examples are representative.

## Stumbles   (one entry each, also small ones)
### 1. A loop cannot have a seamless sound: the music is always faded at the end of the movie   [GAP]
- tried: a 6-bar score exactly as long as the 12 s movie, `movie.init({ loop: true })`.
- happened: `waveform.png` showed the mix falling from -18 to about -40 dB over the last ~0.7 s (dsl.md: "never past the end of the composition (the music then ends with the movie, with a short fade)"); when the player loops, the pad jumps back in. No warning (correctly: nothing is broken).
- cause: the forced end fade, and the reverb tail of the last bar cannot wrap round to the start.
- worked around: I wrote the last bar to breathe on purpose (pad `C7sus4:2.5 _:1.5`, drums `to: 23`), so the fade only touches a tail and the restart sounds like a downbeat.
- would have prevented it: with `loop: true` on the movie (or `music.wrapTail: true`), skip the end fade and mix the score's tail into the first seconds, so the exported file loops without a seam. At least a line in `help loop` / the "Looping motion" recipe saying the sound will not loop seamlessly.

### 2. The export is 361 frames (12.03 s) for a 12 s movie: a looping file repeats one frame   [SPEC-ODD]
- tried: duration 12, full check.
- happened: `export mp4 ok · video 12.03 s`, and the contact sheet's last tile is `frame 360 · 12.00s`. For a loop, frame 360 is the same picture as frame 0 (only my clock says 12.00 instead of 00.00), so a player looping the mp4 shows the seam frame twice (a 33 ms hitch).
- would have prevented it: render frames 0 … N-1 (duration × fps frames) by default, or a `render --loop` that drops the last frame; say in the docs which one happens.

### 3. Did not know if text could change over time until the cheatsheet   [GAP, small]
- pitfall 18 in `help counter` says "Other text content cannot change over time", but the cheatsheet (and SKILL.md) say `set: { text }` exists. I used one layer per state anyway; the pitfall line looks outdated.
- would have prevented it: update pitfall 18 to mention `set: { text }` and `visibleChars`.

### 4. RGB colour tweens pass through muddy tints   [MY-MISTAKE / wish]
- tried: accent bar → grey toggle track, `fillColor` tween over 0.4 s.
- happened: a salmon-pink frame in the middle (4.20 s tile). Shortened the tween to 0.3 s; acceptable, but an `oklch` colour-space option for shape colour tweens would avoid it (text/image have `colorSpace`, I did not find it for shape `fillColor` keyframes).

### 5. `--onion` and `--at` share the frames folder; the at.png from a previous run stays   [TOOLING, tiny]
- after a run with only `--onion`, `check-out/at.png` and `frames/` were the previous run's. Not wrong, but I nearly looked at a stale picture. A line "at.png: from this run / kept from an earlier run" or clearing it would help.

## Docs I read, and which answered my question
- quickstart.md (all), SKILL.md (all): enough for the plan.
- `help shape` → geometry animatable, arc, trim, morph: answered. `help anchorX` → rect `anchorX: 0` for a left-growing bar: answered.
- `help counter` → `{value}%`, `format.pad`, `spans`: answered.
- `help music` → beats, `humanize`, tracks, instruments: answered. The end-of-movie fade is documented, but not what to do about it for a loop: not answered.
- `help shader` → answered first time.
- cheatsheet.md grep for "loop" / "cornerRadius" → `movie.loop` / `init({ loop: true })`, `repeat` rules: answered. recipes.md "Looping motion" → only `repeat`/`yoyo`; nothing about making a whole movie loop seamlessly (picture + sound).

## Wished the library had
- A seamless-loop mode: no end fade on music, the tail wrapped to the start, and an export of exactly duration × fps frames (stumbles 1, 2).
- `colorSpace: 'oklch'` for shape colour keyframes.
- A check line for loops: "first and last frame differ by N px" so a loop's seam can be verified like everything else.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The holds (toggle 5.4-6.0, success 7.0-8.0, idle 10.9-12) are completely still; a very small idle breath (1-2 % scale on the body, on the beat) would keep it alive while still matching frame 0 at the loop point.
2. The colour passes through tints in two tweens (accent → grey at 4.1 s, grey → accent at 5.0 s); I would cross-fade two layers instead of tweening RGB.
3. The sound is pleasant but safe: the musicbox figure and pad are generic; I would give each state its own timbre (a soft woodblock for the hops, a rising pluck for progress, a bell only for success) and fix the seam with a pre-rolled tail at 0 s.
