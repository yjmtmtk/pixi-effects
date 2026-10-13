# koyu-incense - usability notes
Model: opus   Slot: T23   Cycles: 7 (render + look)   Result: works
Timeline: started 13:49; brief written +5 min; first page that rendered at +10 min; first contact sheet looked at at +11; done at +15 (approximate wall clock is enough)

Concept: an invented incense house, 香結 KOYU, product No.07 「白檀・雨上がり」. A single stick on washi paper, one thread of procedural smoke climbing into a mostly empty page, vertical Mincho copy 「雨のあと、/白檀はすこし/甘くなる。」 in stepped columns on the right, then the brand mark replaces the copy in the same place, with a small ember-coloured seal and a bottom-left info block. 60 bpm (1 beat = 1 s); the bell rings when the ember lights (2.0 s) and when the brand comes in (8.0 s).

## Went smoothly because the docs said so
- AGENTS.md (the local copy) -> quickstart -> SKILL.md was a short, clear path. `new koyu-incense --size 720x1280 --duration 12` wrote a working page at once.
- `help shader` answered everything for a procedural paper + smoke ground in ONE shader layer: fragCoord origin bottom left, a `'#rrggbb'` uniform becomes a vec3, a vec2 uniform component animates as `'uniforms.src.1'`, constant loop bounds. It compiled first time and the keyframed uniforms (`rise`, `src.1`) just worked.
- `help music`: beats as the unit; at 60 bpm a beat is a second, so I could line the bell up with the ember and the brand by just writing `_:2 a5:6 [d5 a5]:4`. The check's music read-back (`bell | a5(3) | – | [d5 a5]`) confirmed it without listening.
- Named blur filter animated as `'filters.ink.strength'` in `from`/`to`: an "ink settling" entrance for the per-character vertical text with no extra machinery.
- `fillGradient` radial with alpha stops gave the ember glow in one line; `anchorY: 1` on a rect made the stick grow from its base and burn down (height keyframe), as the cheatsheet said.
- The round-3 lessons saved me twice: I wrote the stage CSS from the height (`width: min(94vw, calc((100vh - 32px) * 720 / 1280))`) from the start, and avoided `'+=10'` in a `from` (I had written a helper that did exactly that, and deleted it before running).
- `check` was fast (about 30 s with `--no-export`, 36-76 s with the export) and never warned; `--at` frames at full size were what I actually judged the smoke and the paper texture from.

## Stumbles   (one entry each, also small ones)
### 1. WebFetch of AGENTS.md returns a summary, not the text   [TOOLING]
- tried: WebFetch on the raw AGENTS.md as the brief says.
- happened: the fetch tool refused to return it verbatim and summarised; the summary lost the concrete commands (`check --no-export --at`, `render --range`).
- cause: the agent's fetch tool, not the library.
- would have prevented it: nothing in the library; the skill files on disk carry the same content (and `npx pixi-effects help` works offline).

### 2. GLSL `smoothstep(edge0 > edge1)` is undefined, nothing warns   [GAP]
- tried: my first draft of the smoke fade used `smoothstep(reach, reach - 250.0, h)` (a reversed smoothstep, which works on many GPUs).
- happened: I caught it while writing; on some drivers it silently returns garbage. The shader docs list the warned mistakes (`gl_FragColor`, `texture2D`, `while`) but not this common Shadertoy habit.
- would have prevented it: one line in `help shader` rule 1: "write a falling edge as `1.0 - smoothstep(a, b, x)`; `smoothstep` with edge0 >= edge1 is undefined in GLSL ES 3.00".

### 3. Vertical Japanese punctuation needs hand offsets   [GAP] (known from round 3)
- tried: one text layer per character for the vertical copy.
- happened: 、 and 。 sit at the bottom-left of their em box, so in a column they look wrong; I shifted them by (+0.58 em, -0.58 em). It looked right first time, but only because I knew to.
- would have prevented it: a `vertical: true` option on `splitText()` / `animateText()` that places characters top-to-bottom and moves 、。 to the top-right (and rotates ー).

### 4. A full-frame procedural texture is hard to judge in the contact sheet   [TOOLING] (small)
- happened: in the 480 px tiles the first paper fibres read as regular grey "rain dashes" and the smoke's fine ribbons vanish; only the full-size `frames/*.png` showed what the texture really looked like (my round-1 fibres WERE too regular; the round-3 smoke filaments looked fine at full size and invisible in the tile).
- would have prevented it: nothing wrong in the tool; the round-3 lesson about thin lines applies to textures too. A `check --at ... --crop x,y,w,h` (a 1:1 detail crop) would make texture review quicker.

### 5. The export is large for a quiet 12 s piece   [SPEC-ODD]
- happened: 6.86 MB for 12 s of 720x1280 on a nearly flat paper ground. The cause is grain (the root `grain` filter at amount 0.035, fps 12, plus the shader's per-pixel tooth): the docs do say "grain eats video bitrate".
- would have prevented it: the check's export line could print the bitrate (Mbit/s) next to the size so one can see it is the texture.

## Docs I read, and which answered my question
- `reference/quickstart.md`, `SKILL.md`: the workflow, anchors, keyframe time.
- `help shader`: everything for the shader layer (answered).
- `help music`: score syntax, instruments, `ring`, `reverb` per track, volume / loudness (answered; raising volume to 1.3 brought -18.6 LUFS to -16.4 with -3.7 dBTP as the doc predicted).
- `help blur` printed motion blur and depth of field first; the named-filter table further down answered "blur strength by name". A little noisy for that word.
- cheatsheet grep for `repeat`, `fillGradient`, `ellipse`, `letterSpacing`: answered (finite `repeat` + `yoyo`; radial gradient stops with alpha).
- Did not need any recipe.

## Wished the library had
- Vertical (tategaki) text: a `vertical: true` layout in `splitText` / `animateText` with punctuation and long-vowel handling.
- A shader helper chunk (`hash`, `vnoise`, `fbm`) that can be included by name; every procedural ground re-types the same 15 lines.
- A detail crop in `check --at`.

## Critique rounds (process slot)
- Round 1 (first sheet): (a) from 4.4 s the smoke climbed straight through the folio "SANDALWOOD AFTER RAIN" at y = 100 and off the top edge; (b) the paper fibres read as regular diagonal grey dashes like rain streaks at every time; (c) the stone was a flat black ellipse that read as a hole (0-12 s); (d) the bottom info repeated 香結 right under the big 香結 (9.5 s+); (e) frame 0 was empty paper. Fixes: smoke drifts right and dissolves by y ≈ 170 with a lower reach; fibres rewritten as thin contour lines of noise, sparse; stone became a low mound visible from frame 0; info text changed to 「白檀・雨上がり　二十本入」 / KOYU INCENSE HOUSE.
- Round 2: (a) 10.8 s the smoke top forked into an even "V" like a flame; (b) 5.0 s entering characters at blur 6 smeared into grey blobs; (c) the mound was the heaviest dark mass; (d) the seal floated 50 px below the brand. Fixes: upper plume made of ribbons (contour lines of a rising noise field) with more curl; blur 3.5 and a shorter entrance; mound flattened, alpha 0.88; seal moved up 24 px.
- Round 3: (a) 12.0 s the ribbons closed into two loops that read like eyes/a face; (b) after smoothing them, 10.8 s smoke went too pale; (c) loudness -18.6 LUFS, quiet for a feed. Fixes: noise stretched vertically, second contour weakened, ribbon narrower, smoke mix 0.68; music volume 1.3 (-16.4 LUFS, -3.7 dBTP); poster moved to 11.4 s where the plume is fullest.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first 4 seconds are slow for a feed: paper, a stick drawing up, an ember. It is the brief (余白), but a scroller may leave before the copy. I would bring the first column of copy forward to about 2.8 s or let the stick draw in 0.6 s instead of 1.1 s.
2. The composition never changes its framing: stick at x = 240 for 12 s. A very slow 2-3 % push-in during bar 3 would add depth without breaking the stillness.
3. The smoke is convincing at full size but its top region is still a soft grey cloud at some frames (9.8 s); a real incense plume keeps sharper filaments higher up. I would make the ribbon width depend on height (thin low, softer high) and add a second, fainter thread that splits off.
