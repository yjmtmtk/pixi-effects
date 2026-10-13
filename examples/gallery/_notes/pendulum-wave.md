# pendulum-wave - usability notes
Model: opus   Slot: T34   Cycles: 9   Result: works
Timeline: started 13:49 JST; first page that rendered at +10 min; first contact sheet looked at at +10; done at +20 (14:09).

## Went smoothly because the docs said so
- AGENTS.md (the repo copy is the same file as the raw GitHub one; I read it from the system context instead of fetching) -> quickstart.md -> SKILL.md: the path is short and clear.
- `help music` answered everything about the score in one call (humanize default 0.012 -> set 0 for exact alignment; decimals in `:n`).
- `help yoyo`: `repeat` + `yoyo` on one keyframe. Insight: a half-cosine is exactly `sine.inOut`, so simple harmonic motion = ONE keyframe `to: { x }` with `ease: 'sine.inOut', repeat: 2n-1, yoyo: true`. No sampling needed. (Worth a doc line: "a pendulum / spring oscillation = sine.inOut + yoyo".)
- `help trimEnd` (shape table) told me `line` / `polygon` take canvas coordinates and that `trimStart` 1 -> 0 grows a line from its END: the tracks grow out of the column of held bobs.
- SKILL.md "Group / parent layers = null": a pendulum is a null at the pivot with a rotation keyframe, rod and bob as children. Worked first time.
- The check's `music` read-back plus the "music has 17 tracks; only the first 16 play" warning: told me exactly what to change (I moved the pad and bass into a second music layer).
- The audio `note` lines (true peak -0.7 dBTP: keep it below -1) made the loudness pass a two-step job: -20.7 LUFS -> raise volumes -> -17.2 LUFS, -1.4 dBTP.
- `--at` with several times + `at.png` is the right loop: 6 chosen moments per cycle, each cycle ~40 s.

## Stumbles
### 1. 16-track limit of one music layer   [GAP]
- tried: 15 musicbox tracks (one per pendulum) + pad + bass = 17 tracks in one `music`.
- happened: `warn: pixi-effects: layer "wave": music has 17 tracks; only the first 16 play` (clear; said what happens, I knew to split).
- cause: a limit not written in `help music` (Tracks section).
- would have prevented it: one line in the Tracks paragraph of dsl.md: "at most 16 tracks per music layer; use a second audio layer for more".
### 2. "ends early: silent from beat 13" on tracks that do not end early   [TOOLING]
- tried: 15 tracks of exactly 13 beats written with `toFixed(6)` decimal lengths (10/7 beats etc.).
- happened: the read-back flags 14 of 15 tracks "ends early: silent from beat 13" because one track sums to 13.000001.
- cause: float rounding; the check compares exact sums.
- would have prevented it: compare track lengths with a tolerance (1e-3 beat) in the music read-back.
### 3. Music read-back bars are noisy for non-grid rhythms   [TOOLING, minor]
- the bar view (`e4(2.6667) e4(4.3333)`) is unreadable for 15 tracks of polyrhythms and printed ~15 long lines; I filtered it out with grep. A `--quiet-music` or a one-line summary when tracks have >8 notes per bar would help.
### 4. A double bob at the match cut   [MY-MISTAKE]
- tried: every row's bob pops in just before the release, including row 0, which is the act-1 pendulum's bob arriving.
- happened: at 3.53 s two vermilion dots side by side (seen on the contact sheet, not reported by check: shapes do not count as collisions).
- fix: row 0's bob appears exactly at T0 with no pop-in, and the act-1 bob shrinks to the same radius on its way there.
### 5. motionBlur is export-only   [SPEC-ODD, documented]
- wanted smear on fast bobs (up to 4400 px/s). The cheatsheet says motionBlur affects render/snapshot/contactSheet, not live playback, so the gallery page would look different from the export. Used 6 time-delayed ghost copies per bob instead (a chronophotograph trail) - same live and exported.
- would help: a per-layer "trail" option (n copies, delay, alpha falloff) - I wrote it as a 4-line loop, but it is a common want.

## Docs I read, and which answered my question
- quickstart.md, SKILL.md (all of it): enough for the structure, nulls, sfx and music.
- `help music`: answered humanize, decimals, track options. Did not mention the 16-track limit.
- `help yoyo`: answered repeat/yoyo.
- `help trimEnd`: shape geometry, line/polygon coordinates, trimStart direction.
- `help motionBlur`: printed the named-filters section, not the `motionBlur: true` movie option; I found the option by grepping cheatsheet.md (render section). `help motionBlur` should lead with the movie option.
- AGENTS.md: read from the repository copy already in my context rather than WebFetch (same file).

## Wished the library had
- A documented "oscillation" line: `sine.inOut` + `yoyo` + `repeat` is EXACT simple harmonic motion (half a cosine per play). Many physics/loop pieces would benefit; I discovered it by reasoning, not from the docs.
- A `trail` option on a layer (see stumble 5).
- `music` tracks whose step is in seconds (or a `period` per track): I computed 10/n beats at 75 bpm so the notes land exactly on each pendulum's turn; it worked, but a polyrhythm helper would be friendlier.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. Act 1 (0-3.6 s) is sparse: a pendulum and a formula on black. A slow push-in or the arc drawing as a light trail would give it more presence.
2. The middle (4.5-6 s and 8-10.5 s) looks similar between the clean pattern moments (T/4, T/3, T/2, 3T/4); I would mark those moments with a faint vertical guide line or a tiny label ("1/2") to make the structure legible without words.
3. The musicbox flurry is dense (~24 notes/s at its peak) and the pad is generic; I would thin the high rows (shorter ring, lower volume) so the clusters at the pattern moments are heard more clearly, and give the act-1 ticks a little room reverb.
