# ramulus-seminalis - canvas trial notes
Model: opus (claude-opus-5-5)   Slot: C1 (generative botanical growth, 1080x1350)   Cycles: 8 edit/look   Result: works
Timeline: started 05:51 JST; first page rendered + first frames looked at 05:54 (+3 min, it worked on the first run); full check + export 05:59 (+8); render + notes done ~06:05 (+14).

## The piece
A copperplate botanical plate (TAB. VII, "Ramulus seminalis") draws itself on aged paper: from one seed (no. 417) a branching plant grows,
unfurls sage-washed leaves, opens madder-red flowers (a music-box note per opening flower), then sheds every petal and the old low leaves,
which drift down and lie on the engraved ground; seed pods remain. A "Fig. 2" magnifier shows one flower at 2.5x; a phase rule
(germinatio / ramificatio / anthesis / abscissio) walks with the time. 14 s, poster 8.9 s (full bloom). Three canvas layers:
`plate` (paper made once in `setup` + frame rules + phase rule), `plant` (the whole plant, 1080x1350), `inset` (the magnifier, 290x290, clipped circle).
All text is normal text layers; sound is `music` (pad + music box notes generated from the model's bloom times + a falling pluck line).

## Log
- 05:51 read BRIEF-canvas, BRIEF-round3, `help canvas`, the four canvas recipes, quickstart, SKILL.md, template. Wrote design.md.
- 05:53 wrote the whole page (plant model as plain data computed once at module level; draw functions read it). First check: no warnings, it rendered. Look: a dense bush with ~60 flowers, a blizzard of 300 petals still in the air at 13.5 s and landing outside the plate; paper mottling looked like dirty clouds.
- 05:55 sparser (depth 2, spaced children, bigger leaves/flowers), petals detach so they have landed by 12.7 s (I compute each faller's landing time first, then pick the detach time), softer paper. Look: good plant; petals land in a clump right of centre and fly past the plate's right edge; poster time showed the inset flower already shedding.
- 05:57 retimed phases (growth 0.8-6.2, blooms by 7.5, poster 8.9), aimed each falling thing at a target spot on the drawn ground (solve the drift from the landing time), trunk pulled toward the centre, inset zoom 3.2 -> 2.5 (the fan was cut by the circle), only low leaves fall (senescence starts at the bottom).
- 05:58 petal release spread over the whole window (no gust), landed petals lie flat and dry (alpha 0.82 -> 0.52).
- 05:59 crop at 8.9 s: thin stems drawn as solid ink looked heavier than the engraved thick ones; threshold lowered, solid ones thinned. Full check OK, export ok, -16.5 LUFS after volume 1.35.
- 06:00 verified the determinism check really runs (a probe copy with a hidden Math.random: `check` reported it under `canvas`; the healthy page prints no canvas line at all). Probed draw time (see PERF). Rendered the mp4 and looked at four frames decoded from it: they match the check frames.

## Wishes for `draw` / `info` / the canvas layer

### Absolute movie time   [MISSING-INFO]
- wanted: to start the magnifier layer at 6.4 s (`at: 6.4`) and still draw the flower at the movie's time, since every canvas reads the same plant timeline.
- tried / did instead: gave every canvas layer `at: 0` (full length) and faded the inset in with an alpha keyframe; otherwise I would have had to write `t + 6.4` and keep that number in sync with `at` by hand. 0 extra lines, but a trap: anyone who moves `at` breaks the drawing silently.
- would have prevented it: `info.time` (movie seconds) and `info.start` (the layer's `at` in movie seconds) next to `t`.

### Named eases inside draw   [MISSING-INFO]
- wanted: the library's own `power2.out`, `back.out`, `cubic-bezier(...)` for leaf unfurling, petal opening, rule draw-on.
- tried / did instead: wrote `easeOut2`, `easeOutBack`, `smooth`, `clamp01` by hand (5 lines); my back-ease does not match the library's `back.out`, so a text layer and a canvas thing with "the same" ease do not move alike.
- would have prevented it: `info.ease(name, x)` (or an exported `ease(name)`), plus `info.clamp` / `info.lerp` / `info.smoothstep` (the expression functions, as JS).

### A seeded generator I can hold, not one that restarts   [MISSING-INFO]
- wanted: per-object randomness that does not depend on the order of calls (a leaf's wobble should not change when I add a branch above it).
- tried / did instead: did all randomness once at module level with the exported `random(seed)` and stored the numbers on each object; `info.random()` restarting per call is right for the contract but its sequence shifts whenever the drawing order changes.
- would have prevented it: `info.random.at(key)` / `rand(seed)` in JS (the expression `rand()` / `noise(x, seed)` exported as plain functions: I wanted `noise` for the stem curl too and did without).

### Seeded noise   [MISSING-INFO]
- wanted: smooth 1D noise for stem curvature and petal sway, 2D noise for paper fibres.
- tried / did instead: random walk on the angle + sines for the sway; per-pixel white noise + 70 radial gradients for the paper. Fine here, but every organic piece will want it.
- would have prevented it: `info.noise(x, y?)` seeded by the layer's `seed` (the same function the expressions have).

### State shared by several canvas layers   [MISSING-LAYER-FEATURE / DOC]
- wanted: one plant model read by the main canvas and the magnifier (and the music score built from its bloom times).
- tried / did instead: computed it at module level and closed over it in both `draw`s: works and is pure, but the docs only say "a simulation is computed whole in `setup`", which suggests each layer must rebuild it; `setup` is per layer and its result is per layer.
- would have prevented it: one doc line: "data computed once outside the composition (a module-level constant) is fine: draw may read it; that is how two canvas layers share one simulation" — and maybe say whether `setup` may be async-shared.

### Caching a picture that rarely changes   [PERF]
- wanted: the `plate` canvas changes only during the first 1.4 s and when the phase marker moves; otherwise it redraws a full 1080x1350 `drawImage` of the paper each frame.
- tried / did instead: nothing; the export was still fast (14 s rendered in 16 s), but a bigger page would pay.
- would have prevented it: a way to say "same picture as last frame": `draw` returning `false`, or a `key: (t, info) => …` whose unchanged value skips the redraw (the library already skips draws "on frames that do not change" per the docs, but I could not tell what counts as a change).

### How long does my draw take?   [PERF / TOOLING]
- wanted: to know whether the plant's draw (≈ 70 stems, 150 leaves, 17 flowers, 85 fallers) is near a budget.
- tried / did instead: wrapped `draw` with `performance.now()` in a probe copy: 0.3 ms average, which is meaningless because the 2D canvas defers its work to the flush; the only honest number was the render time.
- would have prevented it: `check` printing per-canvas-layer cost (ms per frame including the upload), and a positive line when the determinism check passes ("canvas 3 layers, deterministic at 2.1, 5.6, 9.1, 12.6 s") — today a healthy page prints nothing, so I had to plant a bug to see that the check ran.

### Physics glue for "falls and lands"   [OTHER]
- wanted: an object that detaches, falls with drag, sways, and rests where it lands — as a pure function of time.
- tried / did instead: closed-form drag fall + sway, landing time found by stepping in plain JS, drift solved from it so it lands on a chosen spot, detach time chosen so it has landed by 12.75 s: ~25 lines. Every leaf-fall / confetti-settle / snow-on-ground piece needs exactly this.
- would have prevented it: a small helper `fall({ from, at, vt, drag, sway, ground, landX })` returning `pos(t)` and `landsAt`, or the `particles()` helper offering a "ground" option that it can also give to canvas code.

### Tapered strokes   [MISSING-CTX]
- wanted: a stroke whose width varies along the path (stems).
- tried / did instead: built the two offset sides from node normals and filled the polygon (~20 lines), plus the hatching.
- would have prevented it: a path helper `taperedPath(ctx, points, widths)`; any ink / brush piece needs it.

## What went well
- The contract is easy to honour when the model is data: compute everything once, `draw` is a pure read. It worked on the first run, no warnings, the determinism check passed, and the export equalled the preview.
- `setup` returning an offscreen DOM canvas (paper built with `getImageData`) just worked and is drawn with `drawImage`.
- The layer is a normal layer: alpha keyframes faded the magnifier in, text layers sat over/under canvas layers in array order, everything exported.
- `check --at … --crop` was exactly right for judging 0.5 px veins and hatching.
- Driving the music from the same model (a music-box note when each flower opens) took 12 lines and keeps picture and sound in sync.

## Docs: wrong or missing
- `help canvas` does not say whether data outside `setup` may be read in `draw` (it may; see above).
- It says a draw costs time "on every frame that changes" without saying what "changes" means for a canvas layer (t changes every frame).
- `check` prints no `canvas` line when all is well (the dsl says it "reports a layer that is not deterministic" — true, but a positive line would help).
- Not wrong, just noted: `info.random()` "starts again at every call" is clearly explained and the recipes show it.

## The usual usability notes (3 most important stumbles)
1. Nothing was broken; the stumbles were design ones that only looking showed (density, a petal blizzard, petals landing outside the plate, poster moment already shedding). The contact sheet + `--at` frames caught all of them in one round each.
2. `check` is silent on canvas health: I could not tell whether the determinism check ran without planting a bug.
3. The probe with a performance timer printed "8 more console warning(s) … while the page was built at the other size(s)" — a confusing phrase for a page that has only one size.

## Self-critique
Round 1 (after the first render): far too dense — a bush, not a specimen; no negative space; the shedding was a blizzard that did not land before the end; the paper mottling looked dirty. Fixed: depth 2, spaced children, bigger organs, timed detachment, softer paper.
Round 2 (final): (a) the plant still leans right and its left half is filled only by the magnifier — balanced, but by luck of seed 417; (b) the fallen petals make a dense red band on the ground line at the end, heavier than a real plate would show (fewer petals per flower, or petals that wither on the plant, would be quieter); (c) the first 0.3 s is blank paper and the middle of the shedding (≈ 11 s) still reads as one cloud. With 3 more cycles: fewer petals reaching the ground, a slow pan-in of the magnifier's leader line to the real flower, and a seed `vars` so one page makes a whole series of plates.
