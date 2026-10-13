# line-to-light - usability notes
Model: opus   Slot: T20   Cycles: 10 (check runs; 4 written critique rounds)   Result: works
Timeline: started 13:49; brief written +8 min; first page that rendered +10 min (13:59); first contact sheet looked at +10 min; done at +26 min (14:15)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart -> SKILL.md got me to `new`, `recipe`, `help` in three reads; `recipe draw-on-and-type` + `recipe follow-path` (morph) answered "how do I draw a line on and turn a plan into an axonometric" at once.
- `help morph` (docs/dsl.md) states the important details: morph 0 = d exactly, 1 = morphTo, in between resampled (128 pts), closed outlines are re-aligned, sub-paths are paired in order.

## Stumbles   (one entry each, also small ones)
### 1. A morph between two quads rounds their corners on the way   [SPEC-ODD / GAP]
- tried: the sun patch (a parallelogram) drifting as the sun climbs, as `d` -> `morphTo` with `morph` 0 -> 1; then `morphPoints: 1024`.
- happened: every in-between frame had visibly rounded / chamfered corners (10 px on a 150 px patch); the end frames were exact. No warning. Raising `morphPoints` changed nothing.
- cause: both outlines are resampled evenly by length, so when the edge proportions differ, a corner of one shape is paired with a point on an edge of the other. The doc says "points half way between" and "lined up so they do not twist", which is true, but not that corners are lost.
- would have prevented it: one doc line under Morph: "corners survive only when both outlines have the same edge proportions; for a shape that only shears / scales, animate the layer (or a null) with scaleX / scaleY / skewX / rotation instead"; or an option `morphPairing: 'vertices'` that pairs the written vertices 1:1 when both paths have the same number of points (my case: 4 and 4).
- workaround used: a null with rotation / scaleX / scaleY / skewX computed from the 2x2 matrix (the drift is an affine shear). It matched the target quad exactly.
### 2. `--query` is needed to try a debug overlay   [TOOLING, small, worked]
- `check --query debug=1` let me draw a red target outline only in the check; nice, but I found the flag in SKILL.md's two-formats paragraph, not under `check` options.
### 3. Wrong first guess at visibility of a floor patch   [MY-MISTAKE]
- in my head the first plan had the sun coming through the south window; projecting it showed the south wall would hide the whole patch from a SSW axonometric. Moved the window to the east wall before writing code. Nothing the library could have said.
### 4. No hidden-surface help for solids made of shapes   [GAP, expected]
- a 2.5D "box" needs threeD layers and has no depth buffer; for a crisp line drawing I projected the axonometric myself and sorted the faces back to front in JS (a topological sort of wall boxes). It worked, but a short recipe "an extruded plan / axonometric with path faces" would save 20 minutes for anyone drawing architecture or isometric objects.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch: the summariser refused to return the text verbatim, but the local copy is identical), quickstart.md, SKILL.md: enough for the whole workflow.
- `recipe draw-on-and-type` (trimEnd draw-on), `recipe follow-path` + `help morph` (morphTo, morphPoints, sub-paths), `recipe shared-matte` + `help mask` (a named luma matte for the light reveal), `recipe spot-room` / `depth-cards` (read, then decided against threeD lights for a line drawing).
- cheatsheet grep: fillColor tween, fillGradient on shapes (angle, alpha stops), skewX / skewY exist and are degrees, `random(seed)`, `{value}` + `format.pad` for the clock. All answered.
- Not answered: corner behaviour of morph (stumble 1).

## Wished the library had
- vertex-paired morph for paths with equal point counts (stumble 1).
- an `axo()` / `isoProject()` helper: points in metres -> canvas, plan or axonometric, so an extruded plan is data, not a projection function.
- a way to animate a `path`'s points directly (a list of `d` keyframes), so a drifting polygon needs neither a morph nor a matrix decomposition.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The exterior south wall is still a large flat grey slab; a fine vertical board pattern (thin lines at 455 mm) or a wall cut lower would make the front less heavy and more "architectural".
2. The sound is pleasant but generic (pad + musicbox); the pencil clicks are quiet. I would write a dry piano-like line on the plan beats and let the pad enter only with the extrusion.
3. The plan phase is small and quiet for 3 s; a hand-lettered dimension chain or a north arrow drawn on would give it more drawing character, and the first 0.3 s is empty ink.

## Critique round 1 (frames 1.5, 2.9, 3.8, 5.3, 6.5, 8.5, 11.0)
1. 11.0 s: the sun patch has a rounded bottom-right corner (mid-morph resampling: 128 points on a long outline chamfer the corners) -> morphPoints 1024 on the patch / shaft / shadow.
2. 8.5-11 s: the light does not read as "coming in": the east window is a thin sliver seen edge-on, the shaft is a flat grey wedge. -> fill the window opening with a bright glow, give the shaft a gradient (strong at the window, fading toward the floor).
3. 8.5-11 s: the lit south wall is a muddy khaki slab and the biggest area on screen; it competes with the patch. Sun colour should belong to the light only -> a warm light grey instead.
4. 11.0 s: the house shadow runs off the ground grid on the left into an unmotivated black wedge -> extend the grid west.
5. 9.0-13 s: the rule above the title is shorter than the subtitle line -> match the subtitle width.
6. 7.5-13 s: the clock "09:40" is static while the sun visibly drifts -> count it (a `{value}` counter).

## Critique round 2 (frames 0.8-12.5)
1. 7.5-8.7 s: the patch faded in through a muddy brown (sun yellow at low alpha over the navy floor). -> the light now pours in: a soft-edged luma matte slides from the window down the beam and reveals the patch and the shaft at full strength (1.3 s).
2. 12.5 s: the shaft added over the patch turned it lemon -> the shaft gradient now fades to 0 at the floor.
3. 8.4-13 s: the lit south wall was still the largest bright area (light grey) -> darker, barely warm; the interior darkens a step when the sun arrives so the patch carries the contrast.
4. 0.8 s: the grid draws on as a staircase of vertical lines (reads like a bar chart) -> all grid lines from the centre outward, same speed.
5. 7.0-13 s: every face keeps a 0.85-alpha white outline: it looks like a CAD wireframe, not a solid -> side-face outlines drop to 0.35 once the faces are filled; the poché tops stay the strong line (line-weight hierarchy as in a real drawing).

## Critique round 3 (frames 8.2-12.9, crops of the patch)
1. 9-12.5 s: the sun patch still had rounded corners although morphPoints was 1024: a morph between two quads whose edge proportions differ pairs corners with edge points (the outlines are resampled evenly by length), so every in-between shape is chamfered. -> the patch is now a fixed quad on a null whose rotation / scaleX / scaleY / skewX carry it (the drift is an affine shear of the floor that keeps the wall foot fixed). A debug outline (`?debug=1`) of the target quad matched the 12.9 s frame exactly.
2. 8.2-13 s: the beam was empty -> 26 seeded dust motes inside the light volume, add-blended, revealed by the same matte.
3. 11 s: the matte's soft edge had not fully passed the far corners of the patch -> the matte travels 360 px past the patch centre.

## Critique round 4 (full contact sheet, waveform, 12.9 s)
1. 12.5-13 s: the patch, shadow and clock were still drifting until 12.5, so the final hold was only half a second -> everything settles at 12.0 on the last chord (a `settle` time), one still second.
2. waveform: the pencil clicks, swoosh and chime were buried under the pad (no peaks at their cues) -> clicks 1.1, swoosh 0.7, chime 0.75; the score at 1.15 so the mix sits near -17 LUFS.
3. 8.3-13 s: the exterior south wall was still the largest light area -> one step darker, so the cream wall tops (the cut, as in a drawing) and the sun patch are the two lightest things.
