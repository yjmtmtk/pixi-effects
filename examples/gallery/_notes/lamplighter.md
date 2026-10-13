# lamplighter - usability notes
Model: opus   Slot: T25   Cycles: 11 (look / fix)   Result: works
Timeline: started 13:49; brief.md +8 min; first page that rendered +9 min (0 warnings on the first run); first contact frames looked at +9; done at +29 min (14:18)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md got me to `new`, `check`, `help` in a few minutes; `help music` and `help sfx` answered the sound questions completely (custom `voices` with `wave: 'square'` exist, which a chiptune needs).
- cheatsheet line 162 / pitfall 23 / recipe text: `canvas.toDataURL()` as an asset `src` works - the basis of the pixel art.

## Stumbles   (one entry each, also small ones)
### 1. No word in the docs about pixel art / nearest-neighbour scaling   [GAP]
- tried: `help pixel`, `help nearest`, grep for scaleMode / nearest / roundPixels / crisp in the skill and docs/dsl.md.
- happened: nothing about texture filtering. An image layer scaled up (or placed at a fractional x) is filtered linearly, so 8-bit art would go soft.
- cause: no `scaleMode` / `pixelArt` option documented (maybe none exists).
- would have prevented it: a pitfall line "pixel art: bake the image at its final size (draw at game resolution, upscale on a canvas with `imageSmoothingEnabled = false`), keep scale 1 and integer x/y; move it with per-frame `set` keyframes". Or an image option `pixelated: true` (nearest filtering) / a composition `roundPixels`.
### 2. No stepped ease   [GAP]
- tried: looking for `steps(n)` in the ease list (cheatsheet line 49).
- happened: not there. 8-bit motion must move in whole game pixels, so I generate one `set` keyframe per frame in JS.
- would have prevented it: `ease: 'steps(12)'` (CSS syntax, like the `cubic-bezier()` that already exists), or a `snap: 4` option that rounds x / y to a grid.
### 3. `music` has no square / triangle / noise-channel instrument   [GAP]
- tried: the instrument list `keys pluck pad bass sub lead bell musicbox`.
- happened: a chiptune needs pulse and triangle waves; `lead` is described as "soft". Custom sfx `voices` do have `wave: 'square'`, but only one sound per layer.
- would have prevented it: an `inst: 'square'` / `'pulse'` / `'triangle'` / `'noise'` (the sfx synth already has the waves).

## Look-critique-fix round 1 (first contact frames at +9 min, 13:58)
Critique of the first render (`check --no-export --at 0.5,2,4.2,5,6,7.9,9.4`):
1. 4.2 s - the title lamp's dithered halo is a SQUARE block: the sparse outer ring has no outer radius.
2. 6.0 s - the hero (16 gpx) is tiny and its pole and flame are almost invisible; the lamps' heads sit far above the pole tip, so "lighting" does not read.
3. 5.0 s - "DEMO PLAY" collides with the demo moon.
4. 4.2 s (poster) - PUSH START is in its off phase at the poster time; the credit line sits over lit windows (letters touch amber window pixels).
5. 4.2 s - the title lamp's base floats above the roof under it.
6. 6.0 s - the near rooftops' window grid is one uniform wallpaper.
7. 4.2 s - the 12 px thresholded 街道 is mushy.
Good: everything is crisp (baked at 4x, scale 1, integer positions: confirmed in frames/*.png at full size); 0 warnings at the first run.
Fixes: halo clipped to a disc; hero redrawn at 20 x 23 (cap, coat, scarf, long pole); lamps on 18 px posts so the pole tip meets the lamp head; moon and DEMO PLAY moved apart; poster moved to 4.5 s (PUSH START on); windows cleared behind the credit; the building under the title lamp forced to its base height; four window styles; 14 px Japanese.

## Round 2 (14:03)
Critique of the zoomed 6.0 s / 7.95 s frames and the full sheet:
1. 6.0 / 7.95 s - the hero's violet cap, legs and pole vanish against the violet dithered far skyline. FIXED at once with a 1 px ink outline baked around every sprite (hero, lamps) and a sparser (25 %) far dither.
2. 4.9-11.1 s - the upper 55 % of the demo is empty sky: the whole action sits in a strip at the bottom.
3. 11.2-13.6 s - the return to the title is the same picture as before: it reads as a loop, not as an ending.
4. 0.1-1.5 s - the maker splash lantern is tiny and static; nothing happens on the jingle.
5. sound - `lead` and `bass` are soft synth voices; it does not sound like a cartridge (judged from the instrument descriptions; brightness is all I can measure).
Fixes round 2: drifting pixel clouds (two parallax speeds) and a bat that the hero jumps over (jump 2; jump 1 clears an alley) fill the sky and give the jumps a reason; after the demo the title returns with HI-SCORE 002000 and more of the city's windows lit (the demo's work stays done) and PUSH START stops blinking for the last 0.8 s: an ending, not a loop; the splash lantern is 3x bigger and lights on the jingle's top note; the lead is now a square wave and the bass a triangle wave: the same note text, parsed by a 10-line function into one sfx `voices` tone per note (87 audio layers; `check` was happy: -14.9 LUFS, no issues).

## Round 3 (14:11)
Critique of the full sheet + 2.85 s / 4.5 s / 9.9 s frames:
1. 2.8 s - the title lamp lit itself: nobody lit it. FIX: a standing lamplighter on the roof beside the lamp; his long pole (a Bresenham pixel line baked into a full-screen bitmap) is upright until 2.6 s, tilts to the lamp at 2.6 s, the lamp lights at 2.8 s with a sparkle, the pole comes down at 3.4 s.
2. 4.5 s (poster) - the T of "SOFT" in the credit touches an amber window (the window clearing stopped at x = 120 gpx, the line ends at 129). FIX: cleared to 140.
3. 0.0 s - the first frame was black (splash started at 0.1 s). FIX: the maker splash starts at 0.
4. 9.9 s - the bat was violet on violet dither: invisible. FIX: a 13 x 6 cream bat with amber eyes and the ink outline.
5. sound - the square lead at volume 0.32 sits about 10 dB under the music bed (sfx peak at -12 dBFS x volume, music at -6 dBFS x volume, from `help sfx` / `help music`): raised to 0.9, triangle to 1.2, music bed to 0.8.
Then: -9.9 LUFS was too loud (square waves are dense): pulse 0.5, triangle 0.9, bed 0.7 gave -14 LUFS, true peak -3.3 dBTP; the last 0.6 s of the export was digital silence (every voice ended at 12.8 s), so the last note of each chip line now rings out with `envelope: 'fall'` to the end (waveform.png shows the decay).
Final full check: 0 warnings, no layout issues, export mp4 558 KB, 13.63 s, whole check 16 s.

## Stumbles (continued)
### 4. Thin violet parts vanish against a dithered violet background   [MY-MISTAKE]
- the check cannot see it (it is not text); only a zoomed crop of frames/6.00s.png showed it. A 1 px ink outline (baked from the alpha) fixed it. Nothing for the library to do, but a pixel-art recipe would say "outline your sprites".
### 5. I thought `inspectAudio` dropped my layer names   [MY-MISTAKE]
- I read `sources[].name` (None); the name is in `sources[].layer` (`'layer "pulse0"'`). Nothing to fix; the key is simply called `layer`.
### 6. Balancing sfx against music is arithmetic, not a reading   [GAP]
- tried: putting a square-wave lead (sfx) over a `music` bed. `inspectAudio` gives the mix and each sound's own normalised peak (-12 dBFS for every sfx, whatever its volume), so I could not read how loud the lead sits against the bed; I estimated from the docs' "-6 dBFS x volume" / "-12 dBFS x volume" lines, and the first guess was ~10 dB too quiet, the second 4 dB too loud overall.
- would have prevented it: a per-source contribution in the mix (loudness of the mix with and without the source), or `inspectAudio({ group: /^pulse/ })`.
### 7. The music read-back lists only the `music` layer   [SPEC-ODD, small]
- the 87 chip notes I wrote as text are not in the `music` block of `check` (expected: they are sfx). Fine, but a "notes as text into any voice" API (`inst: 'square'`) would let the read-back cover the whole score (see stumble 3).

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), skills/pixi-effects/reference/quickstart.md, SKILL.md: workflow, rules, anchors - all answered.
- `help music`: score syntax, track options, levels - answered completely; `help sfx`: custom `voices` (square / triangle waves, `envelope: 'hold' | 'fall'`) - answered.
- cheatsheet.md (grep): keyframe kinds (`set`), ease list (no steps), image layer, `assets` with data: URLs - answered; `help pixel`, `help nearest`, grep scaleMode / smooth / crisp - nothing (stumble 1).
- The round-3 lessons in the brief: `check --out` writes straight into the folder (true; I relied on it).

## Wished the library had
- `pixelated: true` on an image (nearest-neighbour filtering) so a small bitmap can be scaled 4x by the library, and a `snap` / `ease: 'steps(n)'` for grid-quantised motion. I wrote ~30 per-frame `set` lists instead (fine, but every move is 100-190 keyframes).
- `inst: 'square' | 'triangle' | 'noise'` in `music` (the synth already has the waves in sfx).
- A sprite-sheet helper: `{ type: 'image', asset, frames: 4, fps: 10 }` cycling cells of one bitmap; I faked it with N layers toggling alpha.
- A bitmap-font text layer (`fontFamily: 'pixel5x7'` or a glyph table) - I hand-wrote 40 glyphs.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The demo runs at one speed and one height for 6.4 s: no level change, no stop. I would add a climb onto a taller roof and a beat where the hero stops to light a high lamp with a flourish (camera "lock" on the lamp).
2. The hero is small (22 x 25 px game sprite = 88 px on screen) and the run cycle is only 4 cells with stiff legs; a sharper silhouette (a coat tail that flaps) and 6 cells would read better at gallery thumbnail size.
3. The sound is unheard by me: only levels and brightness were measured. The triangle bass with `envelope: 'hold'` on eighth notes may click; the title section has no percussion and the jingle is quiet (-24 dB RMS). I would compare a draft render's waveform per section and add a soft noise-hat on the title bars.
