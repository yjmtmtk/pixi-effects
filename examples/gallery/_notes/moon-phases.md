# moon-phases - usability notes
Model: opus   Slot: T33   Cycles: 5   Result: works
Timeline: started 13:49; first page that rendered at +6 min (13:55, first check, zero warnings); first contact sheet looked at at +6; done at +13 (14:02)

Concept: a top-down orbit diagram (sunlight from the left, Earth, the Moon always half lit, a blue ring on the half that faces Earth) beside a large
shader-drawn Moon "as seen from Earth". The orbit steps through 8 phases on the beat (120 bpm, one stop every 2 beats), the large Moon, the lunar-age
counter and a row of eight phase icons follow the same keyframes; a bell rises to the full moon and falls back. After the cycle a thin crescent returns
and the counter wraps to 0: "29.5日で、ひとめぐり". Colour code: amber = sunlight, blue = our line of sight, ivory = the Moon.

## Phase log
- 13:49-13:55 read the brief, quickstart, SKILL.md, `help shader / arc / counter / fillGradient / parent`; wrote the whole composition in one pass.
- Cycle 1 (13:55): first check OK, zero warnings. Sheet: all works. Defect: at 4.5 s the sight line (Earth -> Moon at the bottom) crosses the "地球" label; ending on a dark new moon was weak.
- Cycle 2: the Earth label leaves before the first move; epilogue added (Moon drifts on 30°, crescent returns, counter set to 0 and counts on, "29.5日で、ひとめぐり").
- Cycle 3: maria replaced (random fbm blotches -> the near side's real maria as noisy ellipses, so the "rabbit" reads). Result looked like clip-art spots (hard edges).
- Cycle 4: softer, noisier mare edges, density varied, speckle, smaller Tycho; crescent 40°.
- Cycle 5: maria enlarged so they connect like the real near side; full check with export: OK, 1.25 MB, video 14.04 s, -18.8 LUFS.

## Went smoothly because the docs said so
- `shader` docs: `transparent: true`, uniforms declared for me, `'uniforms.phase'` keyframes, fragCoord bottom-left, top-left placement of a sized shader layer. One function (`moon()`) shared by two shader layers via string concatenation; it compiled the first time.
- `null` + `parent` for the orbit: a null rotating about Earth, and the lit half counter-rotated with the same keyframes/ease so it always faces the sun. Exactly as documented.
- `shape: 'arc'` angle convention (0° = 3 o'clock, clockwise) in pitfall 51 made the half-disc and the facing ring right on the first try.
- `{value}` counter with `format: { decimals: 1 }` and `set: { value: 0 }` to wrap it.
- `spans` for coloured words inside a Japanese caption (amber / blue keywords).
- The `music` read-back in `check` confirmed the bell lands on beats 5, 7, ... 21 (the stops), without me computing anything.
- Lessons of round 3 (square page width, fonts, `--out` path) saved time: the page CSS uses `width: min(94vw, 86vh, 960px)`.

## Stumbles   (one entry each, also small ones)
### 1. Text crossed by a moving line is not reported   [GAP]
- tried: a sight line (thin rect child of the rotating null) and a static "地球" label under Earth.
- happened: at 4.5 s the line runs through the label. `check` said "layout: no cut-off / off-canvas text" and nothing under review (it reports text-over-text only).
- cause: overlap checks only compare text with text.
- would have prevented it: an optional review line for text overlapped by a non-background shape (thin lines included), e.g. `--strict-shapes`.
### 2. `check --at` frames accumulate across runs   [TOOLING]
- tried: several `check --no-export --at ...` runs into the same `--out check-out`.
- happened: `frames/` kept the PNGs of earlier runs (12.00s.png from run 1 next to new ones) while `at.png` showed only the new ones; an old frame could be mistaken for the current state.
- would have prevented it: clear `frames/` at the start of a run, or print "N old frames left from an earlier run".
### 3. Procedural "real" imagery needs taste, not API   [MY-MISTAKE]
- tried: fbm-threshold maria, then hand-placed ellipses.
- happened: first random blotches (not the Moon), then clip-art spots; two more cycles to get soft connected maria.
- would have prevented it: nothing in the library; a recipe "a lit sphere / planet in a shader layer" would save the first two tries for others.
### 4. A step-sequence helper had to be hand-written   [GAP, small]
- tried: the same eight stops on six properties of five layers with different `at`s.
- happened: wrote `steps(prop, values)` and subtracted each layer's `at` by hand (keyframe `at` is layer-relative). Works, but the subtraction is easy to forget.
- would have prevented it: a keyframe option for movie time (e.g. `atMovie`) or a `steps()` helper that takes the layer's `at`.

## Docs I read, and which answered my question
- quickstart.md, SKILL.md: workflow, rules (all useful).
- `help shader`: everything I needed (transparent, uniforms, placement).
- `help arc` -> pitfall 51: the angle convention. `help counter`: format + `{value}`. `help fillGradient`: alpha stops. `help parent`: null rig.
- `help music` (grep for chord syntax): `[g4 d5]:7` confirmed by the read-back.
- Did not need: cheatsheet, pitfalls end to end, recipes.

## Wished the library had
- Shape-over-text review in `check` (stumble 1).
- A tested "sphere lit by a direction" snippet / recipe for shader layers (planets, moons, phases).
- Movie-time keyframes, or a documented pattern for "one schedule drives many layers".

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. Holds are short (0.3 s per phase): the names read, but the rhythm is a little mechanical. I would give the four principal phases (新月 上弦 満月 下弦) longer holds and pass the intermediate ones in motion.
2. The orbit diagram is flat vector next to a rich shader Moon; the two styles meet but do not fully belong together. I would draw the orbit Moon and Earth with the same shader (a tiny lit sphere) and give the rays a slow drift.
3. The first 1.3 s are mostly empty dark and the band between caption and diagram (y 270-350) is a bit loose. I would open on the large crescent alone, then pull the diagram in, and tighten the vertical rhythm.
