# aiai-gasa - usability notes
Model: opus   Slot: T35   Cycles: 12   Result: works
Timeline: start 13:49 JST; first page that rendered at +6 min; first contact sheet looked at at +7; done at +27

Concept: 相合傘 / おむかえ. A bird's-eye view of a rainy crossing in the evening. A child in a yellow school cap with a randoseru waits under a shop
awning. A vermilion umbrella crosses the zebra. It stops, the umbrella is tilted over the child, and the adult's right shoulder sticks out into the rain.
The two of them cross back. The rain thins out and stops. The umbrella closes, and for the first time we see both of them: the coat is soaked dark on the right
shoulder. The camera pushes in and a warm pool of light comes up. Caption (vertical Mincho): 右の肩だけ、濡れていた。 Poster at 10.45 s.
Palette: wet slate / asphalt, vermilion #d4553a, amber light, cream type. Music: 80 bpm, so a bar is 3 s: bar 1 is rain only, bar 2 the walk, bar 3 the gesture, bar 4 home.
It resolves on Cmaj9 at 10.5 s, exactly as the umbrella closes. Rain is a noise sfx bed, plus awning drips and soft wet footsteps.

## Went smoothly because the docs said so
- `new --size 720x1280 --duration 12` gave a working page at once. I knew from the round-3 lessons that the 16:9 CSS has to change, and changed it.
- Canvas-drawn data URLs as `assets` (cheatsheet: "`src` may be a URL or a `data:` URL"). Umbrellas, people, the street and the kawara roof are all canvas
  drawings, and image layers made the scene much richer than shapes alone would have.
- `null` + `parent` (help null). "Children are drawn where the null stands in the list" told me the z-order in advance. Nested nulls (world → pair → adult → images) worked first time.
- Animating shape geometry (`radius`) with `repeat` / `repeatDelay` for the rain ripples, as `help repeat` says.
- A custom `sfx.voices` noise bed for rain (help sfx). The music read-back in `check` confirmed 16 beats = 4 bars, so my bar arithmetic was right.
- `blendMode: 'add'` + `fillGradient` for the shop light, the afterglow and the warm pool; a `multiply` radial for the vignette.
- `check --no-export --at …` took 7-9 s per cycle, which is fast enough for 12 cycles. Zero warnings from the second cycle on.

## Stumbles
### 1. An sfx is capped at 10 s   [GAP]
- tried: a rain bed as one custom noise sfx, `duration: 11.5`.
- happened: `warn: pixi-effects: layer "rain": an sfx lasts 0.02–10s (got duration 11.5); using 10`. The warning was clear and said what it did.
- cause: the limit is not in `help sfx` (the text says "its default length is 0.5 s" and "duration IS the sound's length", but gives no maximum).
- would have prevented it: one line in the sfx section: "at most 10 s; for a longer ambience, chain layers or use `loop` on a music/pad track".
  An ambience preset (`rain`, `wind`, `room tone`) would be welcome: rain in a story piece is a common ask.
### 2. Figures read as eyeballs   [MY-MISTAKE]
- a cream ellipse with a dark circle in the middle, seen from above, reads as an eye in a sheet tile. I fixed it with a yellow school cap, a randoseru and a soft
  blurred shadow (`ctx.filter = 'blur(4px)'`). The library could not have caught this. Only looking at a cropped frame did.
### 3. Moving images colliding are not reported   [GAP]
- three umbrellas crossed paths (passer-by vs the red umbrella at 3.5 s, a passer-by over the waiting child at 1.2 s, a passer-by under the fading title at 3.9 s).
  `check` reported "no cut-off / off-canvas text" because it only checks text against text and the frame. I found each case in the sheet by eye and needed 3 cycles to clear them.
- would have prevented it: an opt-in review `check --overlaps images` (or a `collide: true` flag per layer) that lists the times when the bounds of named layers intersect.
### 4. Sheet tiles are too small to judge 40-px figures   [TOOLING]
- I cropped `frames/*.png` with PIL to judge the people and the wet shoulder. Wish: `check --at 12.9 --crop x,y,w,h` (or `--zoom 2@x,y`) to write a magnified detail.
### 5. Frame label and file name differ   [TOOLING, tiny]
- `--at 10.45` writes `frames/10.45s.png`, but the at.png label says `10.47s` (rounded to frame 314). I tried to open `10.47s.png` first.
### 6. No 2D camera: a push-in needs a 'world' null   [GAP / wish]
- for the closing push-in I parented every picture layer to a `world` null with `pivotX/Y` and keyframed `scale` / `x` / `y`. That works, but I had to keep the text and the vignette
  out, and make the street picture 260 px taller than the frame so no background showed at the bottom edge. A 2D `camera` (zoom / pan without `threeD`) that leaves
  chosen layers (type, vignette) alone would make this one line. A recipe "push in on a flat scene" would also do.
### 7. Default loudness is soft   [SPEC-ODD, small]
- with music 0.85 and the rain bed at 0.55 the export read −18.9 LUFS. `check` does not call this out as a note in the summary line, so I raised the levels by hand to −16.5 LUFS (−3.7 dBTP).
  A one-line "quiet for web video (−14…−16): raise volume" in the summary, when integrated loudness < −18, would help.
### 8. Vertical Japanese, one layer per character   [GAP, known]
- I wrote a `column()` helper. 、 and 。 needed a manual offset of (+0.56, −0.56)·fontSize to sit at the top right of their cell. It looked right first time, but it is guesswork that a `writingMode: 'vertical'` text option would remove.

## Docs I read, and which answered my question
- BRIEF + round-3 lessons (answered the CSS, check --out, keyframe '+=' and vertical-text questions before I hit them).
- `reference/quickstart.md`, `SKILL.md`: the workflow, anchors, nulls, blend modes.
- `help sfx` (custom voices: yes; max length: no), `help music` (complete), `help repeat` (yes), `help image` + cheatsheet line 162 (data URL assets: yes), `help null` (yes).
- `help vertical` printed camera / format sections, nothing about vertical text (expected, known gap).

## Wished the library had
- an ambience sfx preset (rain / wind), or a longer sfx cap with `loop`;
- a 2D camera layer (zoom / pan) with an `exclude` list;
- an image / shape overlap review in `check`;
- vertical text (`writingMode: 'vertical-rl'`), with punctuation placed correctly;
- `check --crop` for detail frames.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The people are small, and the adult is a simple capsule. The wet shoulder reads mainly through the caption. With more cycles: draw the adult with a
   collar and a clearer arm on the exposed side, and add a few rain ripples hitting that shoulder while it is exposed (8-10 s).
2. The first 2.7 s is atmosphere only (rain, two grey umbrellas, the title). The child at the top is tiny, so the "waiting" beat is weak. A small gesture
   (the child holding a hand out to test the rain, or shifting weight) would plant the setup.
3. The two grey passers-by pause slightly at their turns (ease `power1.in`). It reads as hesitating, not walking. Better paths with `followPath()` and a constant speed.
