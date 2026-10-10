# sketch-launch — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 6 check runs and 5 renders   Result: works
poster: sonnet (Claude Sonnet 5.5, self-reported) (poster time 8.5 s in `movie.init`)
Made on 2026-10-10/11 in the main working session, NOT by a fresh subagent from the brief: the author knew the library. A field test of "Rough.js makes the wobbly numbers, pixi-effects draws them on", not of the documentation.

## How Rough.js is used (the page imports `roughjs` through the import map; the library did not change)
- `rough.generator()` never touches a canvas: `gen.path / polygon / circle / rectangle / line / linearPath / curve(...)` return a drawable, and `gen.toPaths(drawable)` turns it into plain `{ d, stroke, fill, strokeWidth }` objects. `d` holds only absolute `M` and `C` commands, so it goes straight into `{ type: 'shape', shape: 'path', d }`.
- A hachure fill comes out FIRST as a path whose stroke colour is the fill colour; the outline comes last. Each path is a layer that draws itself on with `trimEnd`; a solid fill (`stroke: 'none'`, `fill: colour`) becomes a `fillColor` that fades in.
- The paths are in the numbers you gave Rough.js, so the page shifts each `d` by the part's place (a small regex over the `M`/`C` pairs) instead of relying on a layer offset.
- The rocket is one `composition`: it shivers (`x: '+=4'` with `repeat` / `yoyo`) and lifts off (`y: '-=1100'`, `power3.in`) as one object. The flame "boils" with three drawings of the same flame (three seeds) shown in turn by `set` keyframes on `alpha`, like a flipbook.

## Stumbles
### 1. Rough.js `fillStyle: 'dots'` is not seeded   [NOTE, found by comparing two renders]
- Every other style (hachure, solid, zigzag, cross-hatch, dashed, zigzag-line) gives the same path for the same `seed`; `dots` uses `Math.random`, so the smoke changed between two exports of the same page (frames from 8.3 s on differed). The smoke is `cross-hatch` now and two renders have the same frame hashes.
- Lesson for any generator library: render twice and compare before trusting a `seed`.
### 2. Notes that point at nothing   [MY-MISTAKE]
- The three labels ("nose cone", "porthole", "fins") stayed on the page after the rocket left. A layer's `duration` ends it: they are cut at the lift-off.
### 2b. Arrowheads that pointed the wrong way   [MY-MISTAKE, found by the owner looking at a crop]
- I drew the two wings of every arrowhead at fixed offsets to the left of the tip, which is right for an arrow that points right and wrong for the two that point left (their tips looked broken). The wings are computed from the arrow's own direction now (`atan2` from the tip back along the arrow, plus and minus 0.5 rad). Lesson: check a CROP of small details at full size, a contact sheet hides them.
### 3. Small ones   [MY-MISTAKE]
- Stars drawn at random places landed on the handwriting; the sky positions were chosen by hand around the title, the word and the moon. The countdown ring overlapped a label until it moved right.
- The tune lasted 13 s in a 14.5 s film (the check says so: "music is 13.0 s but the layer lasts 14.5 s"); more bars fixed it.
- Handwriting uses a font STACK (`Bradley Hand`, `Segoe Print`, `Marker Felt`, `Comic Sans MS`, cursive): it looks different per machine, which the brief allows ("system stacks only").

## Went smoothly
- `check`: no warnings after the fixes, no layout problems, export 8.7 MB, 14.5 s.
- `trimEnd` on a Rough.js path (long wobbly Béziers), `visibleChars` for handwriting-in, a composition that moves as one object, `grain` over the whole page: all as the docs say.
