# still-field - usability notes
Model: opus   Slot: S1-generative-loop   Cycles: 9 (7 look cycles + 2 full checks)   Result: works
Timeline: start 12:50; first page that rendered at +6 min (12:56 incl. reading); first contact sheet looked at at +7; done at about +12 min (13:02)

Concept: a disc of 633 short strokes on a square lattice, each at rest tangent to a circle round the centre (raked rings, like a karesansui garden).
One wave travels out from the centre turning every stroke clockwise through radial and flaring it ember; it reaches the rim, then comes back to the
centre unwinding the same half turn and only brightening. The field is perfectly still for 1 s at the loop point, so start = end and the loop is seamless.
80 bpm pad + sub + musicbox: one bar = 3 s, four bars = the loop, the out wave starts on beat 1. A phase word bottom right (STILL / OUT / BACK / STILL).

## Went smoothly because the docs said so
- AGENTS.md -> local `SKILL.md` + `quickstart.md` were enough to start; I never opened the cheatsheet or pitfalls in full.
- `pixi-effects new still-field --size 1080x1080 --duration 12` wrote a ready page with the right size and length in one go.
- The `recipe` list is easy to scan; `pulse` and `stagger` answered "how do loops and waves work" in 20 lines (I then computed delays myself).
- The first composition (625 rects with rotation + fillColor keyframes) ran with zero warnings on the first try. Keyframes on different
  properties overlapping in time (rotation, scaleX/alpha, fillColor) just worked, as the docs say.
- `help music` gave everything for the score in one screen; the `check` music read-back (bars per track, what starts on which beat) confirmed the
  16 beats = 12 s at once. Loudness numbers (-19.4 LUFS at volume 0.9) told me exactly how far to raise it (1.4 -> -15.6 LUFS).
- `check --no-export --at 2.4,4.5,8.2` took ~4 s and the full-size frames were what I needed to judge stroke weight and the type.

## Stumbles   (one entry each, also small ones)
### 1. WebFetch would not return AGENTS.md verbatim   [TOOLING]
- tried: WebFetch on raw AGENTS.md as the brief says.
- happened: the fetch tool summarised instead of quoting ("would exceed the limit on quoting source documents"). The summary kept the steps, so no harm.
- would have prevented it: nothing in the library; the local copy in node_modules is the same text.
### 2. `--out check-out` writes into check-out/ directly, not check-out/<name>/   [SPEC-ODD]
- tried: `check still-field.html --out check-out` expecting `check-out/still-field/sheet.png` (SKILL.md says `check-out/<name>/sheet.png`).
- happened: files landed in `check-out/sheet.png`. The printed "files" line was correct, so I followed that.
- would have prevented it: SKILL.md: "with `--out <dir>` the files go straight into <dir>".
### 3. A 12 s movie exports 361 frames (12.033 s)   [GAP]
- tried: a seamless loop, duration 12 at 30 fps.
- happened: `ffprobe` counts 361 frames; frame 360 = frame 0 of the next pass, so a looping player shows that frame twice. Invisible here because
  the loop point is a still hold, but a continuously moving loop would hitch once per cycle. The check line says "video 12.03 s" without comment.
- would have prevented it: a doc line in `help loop` about seamless loops (is the last frame inclusive? is there a `loop: true` export that drops it?)
  or the check noting "361 frames: the last frame repeats frame 0 in a loop".
### 4. `help loop` has nothing about a seamless (start = end) loop   [GAP]
- tried: `help loop`.
- happened: it returns repeat/yoyo, z-order of layers built in a loop, and direction.md's "the loop" (a studio process), none about making a video loop.
- would have prevented it: a short recipe "seamless loop: make the last state equal the first, hold or cycle, mind the music tail being cut at the end".
### 5. Music at the loop seam   [GAP, minor]
- the music is cut at the movie's end "with a short fade" (rms of the last 0.03 s: -120 dB), so on a looping player the pad dips for a moment at the seam.
  Fine for this piece; a `music` option to wrap the reverb tail onto the start (for loops) would make the sound seamless too.

## Docs I read, and which answered my question
- `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: answered the workflow, anchors, keyframe `at`, check usage.
- `recipe` (list), `recipe pulse`, `recipe stagger`: answered loops and waves.
- `help ease`: answered colour interpolation (colorSpace) and ease names; `help music`: the whole score.
- `help loop`: did not answer (see stumble 4).

## Wished the library had
- A seamless-loop export mode (exactly duration x fps frames, music tail wrapped).
- A field helper: "place N layers on a grid / disc / polar rings and give each a value from its position" is the core of most generative pieces; I wrote it as a loop, which was easy, but a `grid()` helper next to `stagger()` would make the common case one line.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The return (BACK) wave is pale and quieter than the ember OUT wave; deliberate, but 7-9 s is the least striking stretch. I would give it a cool
   second accent or a slightly longer stretch so the inhale reads as strongly as the exhale.
2. (Cycle 8 widened the wave: a half turn now takes 3.3 s while the wave crosses the disc in 2.2 s, so far more strokes move at once; still,) between 5.5 and 6.5 s the centre is idle and only the rim turns; the eye has little to follow. Overlapping the two waves (summing two turns per
   stroke with sampled keyframes) would keep the middle alive and add interference patterns.
3. The type is correct but generic (system sans + mono caption); a numbered series label and a tighter relationship between caption and the disc
   (e.g. caption baseline aligned to the disc's top tangent) would make it feel more like a printed plate. Motion blur on the fastest strokes would also soften the 30 fps steps at the rim.
