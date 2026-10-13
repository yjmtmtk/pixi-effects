# elastic-exposure - canvas trial notes

Model: opus (claude-opus-5-5)   Slot: C5   Cycles: 7 edit / look cycles (8 check runs, 1 render)   Result: works
Theme: a physical simulation as a beautiful object. I picked "billiards in a circle": six balls of light under gravity inside a circular rim,
perfectly elastic collisions (wall and body-on-body), the whole run traced as a long-exposure light painting, every collision a synthesised note.
Timeline: start 05:51 JST; first page rendered and contact sheet looked at 05:54 (it worked on the first run); full check with export 05:56;
final render 05:58; notes done ~06:05. The canvas layer itself cost almost no time: the contract was clear and every key I used worked the first time.

## Log
- 05:51 read BRIEF-canvas, BRIEF-round3, `help canvas`, the four canvas recipes, SKILL.md, quickstart, template, `help sfx`, `help filters`.
- Design decision forced by the library: the collision-synchronised sound needs the collision TIMES while I write the `sequences` array
  (one `audio` layer per hit), but `setup` runs at build, after the composition data exists, and its result only reaches `draw`.
  So the simulation runs in plain page JS BEFORE `movie.init` (`const SIM = simulate()`), and every canvas layer's `setup` just returns that object.
  Prototyped the sim in Node first (scratchpad) to count events per second (about 100 hits in 11 s, 1 to 20 per second as bodies enter).
- Cycle 1 (05:54): it ran, no warnings. Defects seen: the exposure far too faint for the end picture; the 3-line caption was centre-aligned
  (Pixi text default; needed `align: 'left'`); the tails looked beaded (per-segment strokes with round caps add up under `lighter`);
  and in a full-size frame the panel said `T 7.40 s` at 8.00 s: the panel layer starts at 0.6 s and `t` is the layer's own time. My bug, but one the API invites (wish 1).
- Cycle 2: brighter exposure + `bloom` on it + `params.exposure` keyframed 1 → 2.2 after the sim ends ("the print develops"); tails as short polylines with butt caps;
  panel adds its own `at` by hand. Looked right.
- Cycle 3: more launch energy (vy -60 → -260): the painting went from a fountain (top third empty) to a full luminous "nest". Kept the nest. Raised sfx volumes
  (-19.3 → -15.8 LUFS).
- Cycle 4: full check with export: waveform showed 1 s of digital silence (1.0 - 1.9 s, the first fall). Added a 10 s room tone (low D + low-passed noise)
  with volume keyframes. Develop target 2.2 → 1.9 (crossings were blowing out to cream and losing colour). Panel label `T` → `EXPOSURE` after the sim ends. Named the sound layers.
- Cycle 5: body-on-body hits were nearly invisible (a faint cyan ring). Added a cyan glint; found the pair times by re-running the sim in Node and checked frames 6.98 / 9.36.
  The glint read as a gun-sight crosshair: rotated it 45 degrees (cycle 6). Cycle 7: final full check, contact sheet, render, and a frame of the mp4 at 12.8 s via ffmpeg: matches the page.

## Wishes for `draw` / `info` / the canvas layer

### Movie time inside draw (`info.time` / `info.at`)   [MISSING-INFO]
- wanted: the movie's absolute seconds in a canvas layer that starts later than 0 (my panel starts at 0.6 s but reads simulation data indexed by movie time).
- tried / did instead: shipped a bug for one cycle (the panel showed 7.40 s at 8.00 s, the collision count lagged); fixed with a `PANEL_AT` constant used both in the layer's `at` and in `draw` (`t + PANEL_AT`). 3 lines, but only after a full-size frame showed the wrong number; the contact sheet tiles were too small to read it.
- would have prevented it: `info.time` (movie seconds) and `info.at` (the layer's start in movie seconds; for a nested layer, the parent's seconds too). Any piece where several canvas layers read ONE precomputed simulation by time needs this.

### Precomputed events that become sound (setup cannot add layers)   [MISSING-LAYER-FEATURE / DOC]
- wanted: simulate once in `setup` (as the docs say) and have the collisions there produce the `sfx` layers.
- tried / did instead: the simulation runs before `movie.init` in page JS; `setup: () => SIM` only passes it on. Then ~35 lines turn `SIM.events` into 88 audio layers (pitch, volume from impact speed, pan from x, a threshold to skip grazes).
- would have prevented it: a doc line in `help canvas`: "if the simulation also drives sound or other layers, run it before `movie.init` and let `setup` return it". Better: an `events` / `cues` helper, e.g. `sfxAt(times, (e) => sfxSpec)`, or a canvas-layer key `sounds: (state) => [{ at, sfx, volume, pan }]` that the library turns into audio after setup. A collision soundtrack is the obvious companion of any physics canvas.

### Easing functions inside draw   [MISSING-CTX]
- wanted: the library's named eases (`power3.out`, `cubic-bezier(...)`) for in-draw fades (a body's birth, the flash rings, the rim fade-in).
- tried / did instead: wrote `easeOut = x => 1 - (1 - x)^3` and a `clamp01` (2 lines). Cheap, but every piece re-writes them, and they do not match the keyframe vocabulary.
- would have prevented it: `info.ease('power3.out', x)` (or an exported `ease(name, x)`).

### Colour with alpha from a hex   [MISSING-CTX]
- wanted: `'#ffd08a'` at 0.15 alpha for strokes, gradients and glows.
- tried / did instead: a 1-line `rgba(hex, a)` parser used ~12 times.
- would have prevented it: an exported `rgba(hex, a)` / `color(hex).alpha(a)` helper, the same parser the library uses for `fillColor`.

### A trajectory / polyline helper for state arrays   [MISSING-CTX]
- wanted: "stroke body i's path from step a to step b, every n-th sample", in chunks so crossings accumulate under `lighter`, and a tapered tail (alpha and width growing to the head).
- tried / did instead: ~25 lines (chunked polyline, tapered tail as short butt-capped polylines). First version (one segment per stroke, round caps) looked beaded: overlapping caps add up under `lighter`.
- would have prevented it: a recipe line about it ("a tapered trail: short polylines with butt caps; one stroke per chunk so self-crossings add") in `canvas-trail`, which currently shows dots, not a line.

### Was my canvas checked, and how long does draw take?   [PERF / OTHER]
- wanted: confirmation that the determinism check ran on my 4 canvas layers, and the cost of `draw` per frame (the exposure layer strokes ~8000 points per frame at the end, four full-frame canvases, two with `bloom`).
- tried / did instead: grepped `report.json`: `inspect.canvas` is `[]`, the printed report says nothing when it passes. No timing anywhere. Render took 10.9 s for 14 s, so it was fine, but I learned that only at the end.
- would have prevented it: a passing line `canvas    4 layers drawn twice at N moments: the same pictures · slowest draw 3.1 ms (exposure)`, and a warning when a draw exceeds ~1 frame.

### Bloom of a canvas layer worked; a second "glow copy" was not needed   [went well]
- I expected to have to draw the heads twice (sharp + blurred copy with `add`). `filters: [{ type: 'bloom' }]` on the canvas layer did it, first try. Same for `params.exposure` keyframed after the sim ends.

### Things I did not miss
- Fonts in `ctx`: `ui-monospace` drew, `ctx.letterSpacing` works in Chrome, `textAlign: 'right'` was enough (no `measureText` needed for the panel). System fonts only, so no loading question came up.
- Size: a full-frame canvas defaults to the composition size and shares the stage's coordinates, so the physics coordinates are the picture's coordinates. That is very convenient.
- Determinism: the contract (pure function of the frame, simulation precomputed) is exactly how a physics piece wants to be written anyway.

### Docs: what was right, what was missing
- Right and enough: `help canvas` (the contract, `setup`, `info` keys, `params` animation), recipe `canvas-life` (the by-frame pattern).
- Missing: the sim-drives-sound case (above); that `t` is the layer's own time while one shared `state` is usually indexed by movie time (one sentence would warn); `canvas-life` indexes by `Math.floor(t * 15)`, not by `info.frame` as the prose says (fine, but the prose and the code differ).

## The usual usability notes (the library at large)
1. **The buried-sfx note is noise for a dynamic soundtrack, and it groups unnamed layers.** With unnamed audio layers it said "1 sound effect is buried ... 11 times in all", which reads as one sound; after naming them it said "19 sound effects are buried". In a collision soundtrack quiet grazes are intended; there is no way to mark them. The volume is printed unrounded (`volume 0.30038536902602725`). Would help: round to 2 decimals, group by preset/name pattern, and a `quiet: true` / `accent: false` flag on a layer to exclude it.
2. **A sound bed made of `sfx` stops at 10 s and cannot loop.** My room tone had to end (fade at 8.7 - 10.3 s) before the piece does; for a longer bed I would chain overlapping layers by hand. `loop` exists for files but not for sfx.
3. **Multi-line text defaults to centre alignment.** My left-column caption came out centred until I added `style.align: 'left'`. A left-anchored text layer (`anchorX` 0, the default) with centred lines is rarely what anyone wants; a doc line or a default of `align` following `anchorX` would help.

## Self-critique
Round 1 (after cycle 4): the end picture was luminous but the run itself had no cold contrast (the cyan accent was invisible), there was a 1 s digital silence at the
first fall, and colours blew out to cream in the develop. Fixed: glint, room tone, develop 1.9.
Round 2 (final, honest): (1) the opening second is very sparse (one dot falling in a big dim circle with an empty left half until the caption fades in); a held
"ball on a thread" before the release would make the first second more intentional. (2) The six warm tints are so close that individual bodies cannot be told apart
in the final exposure; it reads as one material, which I chose, but a viewer cannot follow "body 3". (3) The sound is a pleasant pentatonic texture but never has a
real accent apart from the final D; a body-on-body hit could be louder/brighter than wall hits to make the rare cyan events land as events. With 3 more cycles:
a pre-release hold, louder pair ticks, and a slow 3 % push-in on the circle during the develop.
