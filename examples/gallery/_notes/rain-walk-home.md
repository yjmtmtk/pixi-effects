# rain-walk-home - canvas trial notes
Model: opus (claude-opus-5-5)   Slot: C6   Cycles: 8 check runs (6 `--no-export --at`, 2 full)   Result: works
Theme: pixel-art scene at 320x180 shown at 4x (`smoothing: false`), parallax, day-to-night palette, walking sprite, rain, lit windows, chiptune.
Timeline: started 05:51 (read BRIEF-canvas, BRIEF-round3, `help canvas`, the dsl `canvas` section, SKILL.md, quickstart, recipe canvas-pixel-sprite, `help music`, the sfx table); page written in one go and first rendered at +~8 min (it worked on the first run, one warning: sfx longer than 10 s); first contact sheet looked at +~9 min; 7 more look/fix cycles; final check + render at +~11 min of wall clock after the first render (06:01); notes written after.

Piece: 14.5 s, 1280x720 (all art 320x180 x4). 10 canvas layers, all 320x180, `smoothing: false`, `scale: 4`: sky+sun (per-pixel ImageData, Bayer-dithered bands), clouds (ImageData, `params.cover` keyframed), mountains (value noise), city (windows that light one by one and go off at the end), far rain, street (wall, lamps with dithered cones, the house, the door, wet-road reflections of the city windows), walker (8x18 sprite, 4-frame walk tied to distance walked, umbrella that opens and folds in 3 frames), near rain (lit in lamp cones, stopped by the umbrella), railing (parallax 1.5), titles (a hand-made 5x7 bitmap font, typed in and dither-dissolved). Sound: `music` (musicbox arps, octave bass, lead, soft hats) + custom `sfx` voices (noise footsteps on every contact frame, a rain bed of band-passed noise, square-wave umbrella open/shut, door thud, lamp flicker) + `coin` for the window.

## Wishes for `draw` / `info` / the canvas layer

### Values shared by several canvas layers (one clock, one palette, one camera)   [MISSING-LAYER-FEATURE]
- wanted: six layers need the same palette phase, camera scroll, "lamps on", "walker x": I wanted to keyframe them ONCE and read them in every `draw`.
- tried / did instead: `params` belong to one layer, so I wrote module-level pure functions of `t` (`phaseAt`, `camAt`, `walkerX`, `lampsOn`, `nightAt`, ~15 lines) and called them from each draw. This only works because every layer starts at `at: 0`, so its `t` happens to be movie time; a layer with `at: 3` would silently be 3 s off.
- would have prevented it: `info.time` (absolute movie seconds) at least; better, movie-level animated values readable in every draw, e.g. `composition.params: { phase: 0 }` keyframed on the composition and exposed as `info.global.phase` (or `info.vars`). This is the one I would need in almost every multi-layer canvas piece.

### Read another canvas layer's picture or state (a reflection)   [MISSING-LAYER-FEATURE]
- wanted: the wet road mirrors the city's lit windows; the street layer needed the city layer's buildings (or its pixels).
- tried / did instead: moved the building list out of the city layer's `setup` into module scope with my own seeded RNG (mulberry32, 4 lines) and re-drew the reflections from that data in the street layer (~15 lines). `setup` state is private to its layer, so `setup` was the wrong place for anything two layers need.
- would have prevented it: a doc line "data two layers share belongs in module scope, made with `random(seed)`, not in `setup`"; or `info.layers.<name>.state` / `info.layers.<name>.canvas` (read-only, drawn earlier in the same frame) for reflections, shadows and echoes.

### An indexed / pixel framebuffer helper   [MISSING-CTX]
- wanted: write pixels by palette name, with ordered dithering, for sky gradients, clouds, lamp cones, text dissolves.
- tried / did instead: `ctx.createImageData` + a `Uint32Array` view + packing ABGR by hand + a 4x4 Bayer table + `putImageData` (~12 lines), and `fillRect(x, y, 1, 1)` loops for dithered shapes in the fillRect layers.
- would have prevented it: `info.pixels()` returning `{ buf: Uint32Array, set(x, y, color), commit() }` and an `info.dither(x, y)` (Bayer threshold 0..1). Every pixel-art or "retro" canvas piece re-writes these.

### A palette that the layer enforces   [MISSING-LAYER-FEATURE]
- wanted: "one palette" for the whole picture, fading between palette keys in steps.
- tried / did instead: a palette function of `t` (three keys per entry, lerped at a phase quantized to 1/8, memoised in a Map, ~25 lines) and discipline: every colour in every draw comes from it. Nothing stops a stray colour (and nothing would quantize a normal text layer to it).
- would have prevented it: a `palette` filter (nearest-colour quantize to a list, optionally with dither) usable on a canvas layer or on the root composition, plus a helper `lerpPalette(keys, phase, steps)`.

### Keep the pixel grid honest when the layer moves   [MISSING-LAYER-FEATURE]
- wanted: scroll a 320x180 layer with keyframes (`x` in screen px) and have it land on multiples of 4.
- tried / did instead: never moved a layer; all scrolling is `Math.floor(camAt(t) * parallax)` inside `draw`. The recipe's `ease: 'steps(16)'` trick only steps time, it does not snap to the art grid.
- would have prevented it: a layer key `snap: 4` (round the stage position to multiples of N px), or a movie option "render at 320x180 and upscale nearest" so ordinary text/shape layers could join the grid too.

### A tiny bitmap font   [MISSING-CTX]
- wanted: crisp pixel text for the two titles at 320x180 (canvas `fillText` at 7 px anti-aliases into mush, and a normal text layer at 1280x720 breaks the grid).
- tried / did instead: typed 14 glyphs of a 5x7 font by hand + a draw function with a dither reveal (~35 lines).
- would have prevented it: a built-in `info.pixelText(str, x, y, { scale, color })` with one 5x7 ASCII font, or a recipe that ships one.

### Seeded value noise in JS   [MISSING-INFO]
- wanted: a 1D noise for a mountain ridge.
- tried / did instead: a sin-hash + smoothstep value noise (2 lines). Cheap, but every landscape piece writes it.
- would have prevented it: `info.noise(x, y?)` seeded by the layer's `seed` (expressions already have `noise(x, seed)`; `help canvas` does not say whether a JS export exists).

### Is a pure memo cache allowed?   [CONTRACT]
- wanted: to cache the palette per phase across calls (it is a pure function of the phase).
- tried / did instead: a module-level `Map`; `check`'s determinism test passed. But the contract says "no state that outlives a call", which reads as forbidding it.
- would have prevented it: one sentence: "a cache of a pure function (same input, same output) is fine; state that depends on which frames were drawn before is not".

### Music has no square / pulse instrument   [OTHER]
- wanted: a chiptune; `sfx` voices have `wave: 'square'` but `music` instruments do not.
- tried / did instead: musicbox arpeggios, an octave-jumping bass with short `legato`, a `lead`: it reads as "retro" but not as a console.
- would have prevented it: `inst: 'square'` / `'pulse'` (duty) / `'triangle'` / `'noise'` drum kit for music.

### Long noise bed   [OTHER]
- wanted: 11 s of rain noise; an sfx is at most 10 s ("an sfx lasts 0.02–10s (got duration 11); using 10" — the warning said exactly what happened).
- tried / did instead: made it 10 s and faded it with volume keyframes.
- would have prevented it: `loop: true` for a `noise` sfx, or a longer limit for `hold` envelopes.

Not needed in this piece (said for the record): the layer's stage transform, alpha, previous frame, audio data, images, pixel read-back, `measureText`, speed (14.5 s of 10 full-frame 320x180 canvas layers rendered in 15.7 s; check in 14-16 s).

## What went well
- The contract was easy to honour: a walk cycle tied to `V * t`, rain as `(phase + t * speed) % cycle`, windows from thresholds; nothing needed the previous frame.
- `smoothing: false` + `scale: 4` gives truly hard pixels in playback, in the check frames and in the exported mp4 (I pulled a frame from the mp4 with ffmpeg and enlarged it: crisp, only codec chroma bleed).
- `info.random()` restarting at every call is exactly right for rain: draw 4 numbers per drop for every drop, use the first `n` (n from `params.amount`), and the drops are stable frame to frame.
- `params` + keyframes for the cloud cover and the rain amount (in and back out) was natural.
- The determinism check works: I tried a deliberately stateful draw (a counter in a closure) in a throwaway copy and `check` reported it under `canvas` (`movie.canvasProblems`). My real page passes.
- The page worked on the first render; the only warning was clear and self-explaining.

## Docs: wrong or missing
- `check` prints no `canvas` line when every canvas layer passes, so I could not tell from the output that the determinism test had run at all (I had to make a failing copy to see it). A line "canvas: 10 layers drawn twice at N moments, all the same" would settle it.
- `help canvas` / the recipes say nothing about data shared between layers (module scope vs `setup`), or which seeded helpers exist in JS (`random(seed)` is mentioned in SKILL.md, not in `help canvas`; noise in JS is not mentioned).
- The `canvas-pixel-sprite` recipe moves the layer with `steps(16)`: steps in time, but the positions (300→420 in 16 steps of 7.5 px at scale 30) are not on the art grid; a pixel recipe should show the snap (or warn about it).
- Missing: a pixel-art recipe for a whole scene (several 320x180 layers at scale 4, scrolling in `draw`), the ImageData pattern, and a dither helper.

## The usual usability notes (3 most important stumbles)
1. sfx limited to 10 s (the warning told me; one edit).
2. The house was on screen almost from the first second because the camera only travels ~200 art px in 9 s: a story planning mistake of mine, but the reason is structural (320 px is a wide world for a 22 px/s walk); fixed by walking faster (30 px/s, a longer stride) and moving the house.
3. `--crop` on the art scale: the crop works in 1280x720 canvas pixels, which is fine, but for a 4x pixel piece I kept converting art px to stage px by hand (x4). A `--crop` in a layer's own pixels would help pixel art.

## Self-critique
Round 1 (after the first contact sheet): the house appeared too early; the lamp cones were sparse dots that read as ladders; rain drops had a hooked "J" shape; the umbrella stick ran through the face; every city window was lit at night (flat); the chimney floated above the roof; the road was an empty dark band. Fixed: faster walk and later house, denser two-tone cones, straight drops, stick in front of the face, thresholds spread so ~70 % light, chimney behind the roof, reflections of the windows on the wet road, windows going off one by one after the walker is home, rain easing at the end, umbrella folds at the door.
Round 2 (final sheet): still weak — (a) the walker is tiny (18 art px) and at night his dark coat is hard to find; the yellow umbrella carries him, but a lamp that lights him as he passes would help; (b) he vanishes into the door by simply disappearing, a frame of him in silhouette inside the lit doorway would sell "going in"; (c) the music is pleasant but not chiptune (no square instrument), and the last 0.5 s fades fast because the score ends at 14 s; (d) the afternoon opening is a little flat (a uniform blue city) before the colour starts to move.
