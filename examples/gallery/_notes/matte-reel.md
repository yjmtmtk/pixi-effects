# matte-reel — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 3 (1 build + 1 volume fix + 1 full export check)   Result: works
poster: 5.7 s (the multiply band crossing the headline)

This piece doubles as a field test of the NEW docs for named mattes, `{ layer, channel: 'luma', invert }`, lists and the transition `{ kind: 'luma', map }` (dsl.md "Named mattes and luma" and "luma", recipes `shared-matte` / `luma-wipe`, pitfalls 81-84).

## Went smoothly because the docs said so
- No library warning at any point (`warnings: none` in all three runs); the first build already rendered what I designed. Everything below worked from the written rules alone.
- Recipe `shared-matte` gave the whole vocabulary: a named, undrawn, animated layer; `mask: 'name'`; `{ layer, channel: 'luma' }`; `{ layer, invert: true }`. The table in dsl.md ("form / meaning") was enough to write a LIST (`mask: ['disc', { layer: 'hole', invert: true }]` and `['hole', { layer: 'fade', channel: 'luma' }]`) on the first try: "intersection, subtract with invert" is stated plainly.
- The idea "the same matte, used inverted by one group and plain by another" (photographs cut OUT of the hole, paper shown ONLY in the hole) came straight from the `invert` row; it works exactly as written and is a very strong transition between two scenes without any transition object.
- Rule 1 (matte must live as long as its users) shaped the timeline: all four mattes of scene A have no `at` / `duration` of their own, so they live for the whole composition; the `tint` layer (multiply, cut by the band) starts later, which is fine because a user may be shorter than its matte.
- Rule 5 (`blendMode` works with every matte): a full-frame vermilion rect with `blendMode: 'multiply'` and `mask: { layer: 'band', channel: 'luma' }` worked first time (bone becomes vermilion, ink stays ink). One advanced blend mode in the whole piece.
- Rule 2 / pitfall 82 (a mask name works inside one composition only) told me to put the end card's matte (`sweep`) INSIDE scene B, next to the layers it cuts, and that is what makes it work even though B is wrapped by a transition. Rule 2 also says a transition keeps the matte of the layers it wraps: here the whole of A (with four mattes inside) is a transition `from`, no trouble.
- A grayscale map for the luma wipe drawn on a canvas and passed as `assets: [{ name: 'blinds', src: dataURL }]` + `map: 'blinds'` worked first time ("dark parts change first", "give the map the composition's aspect ratio" were both enough: 1280x720, venetian-blind rows, dark at the left, so the new scene opens left to right in slats).
- Check workflow: `--no-export --at ...` in about 10 s; the 13-frame contact sheet showed every state; the full export (598 KB, 10.03 s, audio 10.025 s) passed.

## Stumbles
### 1. "Where does a luma matte read 0: outside the matte layer?"   [GAP, small]
- tried: a progressive luma reveal. The matte `fade` is a 3000 px wide rect with a linear gradient white -> white (0.7) -> black, slid across the headline by animating its `x`. At the start the rect sits entirely off to the left, so the headline is not covered by the matte layer at all.
- happened: nothing went wrong: outside the rect the headline is hidden (luma 0), exactly what I hoped. But I had to find out by looking at 3.5 s / 4.2 s.
- cause: rule 1 says "where the matte is missing the layers it cuts are invisible", which is about the matte's LIFETIME; pitfall 83 says luma is 0 for black. Neither says in so many words that "outside the matte layer's own shape counts as black / transparent, for alpha AND luma".
- would have prevented it: one sentence in dsl.md rule list: "Outside the matte layer's shape the matte is 0 (for `luma` too), so a matte can be a gradient rect you slide across the layers." Even better a recipe: `luma-reveal` = the sliding gradient rect (it is the usual way to make a soft, moving, directional blend-in).

### 2. Gradient stops inside a SLID matte: soft zone is in the matte's pixels, not in time   [GAP, small]
- tried: a soft left-to-right blend-in of a headline. I first thought "animate the gradient" (cheatsheet: partial `fillGradient` keyframes), then chose to slide a very wide rect instead because stop animation keeps the same stop count and the rect is simpler.
- happened: works; but I had to work out the numbers myself: for a ramp of 900 px (stops 0.7 -> 1 of 3000 px) the rect `x` must start with its right edge at the left of the text and end with the 0.7 stop right of the text's right end. Easy, but the docs offered no worked example.
- would have prevented it: the `luma-reveal` recipe above with the arithmetic in a comment.

### 3. An invisible matte is invisible: showing what cuts   [MY-DESIGN, not a bug]
- tried: the disc and the hole are not drawn (rule 1), so the viewer sees only their effect.
- happened: I added two thin `arc` rings (stroke only, vermilion, same radius keyframes as the matte) so the edge of the matte reads as a design element. The `discKeys` / `holeKeys` arrays are shared by the matte and its ring, so the two cannot drift.
- would have prevented the thinking: nothing needed; a one-line tip in the recipe ("to SHOW the matte, a second layer with the same keyframes", pitfall 81 already says "add a second layer that looks the same") is enough. Pitfall 81 had it.

### 4. A masked COMPOSITION as the photograph   [worked, not documented]
- tried: each "photograph" is a small `composition` (gradient + sun + horizon) with `mask: [...]` and a pivot/centre `x, y` and a `scale` keyframe, so one mask applies to one picture instead of three layers.
- happened: it works (the matte cuts the composition as one picture, as rule 5 hints), and the `scale` keyframe about its pivot centre is unaffected by the matte (the matte stays in the parent's space, so a slowly settling photo moves under a fixed circle: exactly what you want).
- cause: dsl.md rule 5 only says "A matte on a composition cuts the composition as one picture"; the example list shows images / text / shapes, not a composition.
- would have prevented the hesitation: put a composition in the dsl.md matte example, e.g. `{ type: 'composition', name: 'photo', width, height, mask: 'wipe', sequences: [...] }`.

### 5. Sound level   [TOOLING, small]
- tried: `sfx` at `volume: 0.4`-`0.7` (what I would write for effects under a picture).
- happened: `check` printed "the mix is quiet for web video: -31 LUFS" (cheatsheet says a sparse click track needed ~2 for -24 LUFS).
- fix: I multiplied every volume by 2.6 in the `sfx()` helper: -22.7 LUFS, peak -7.5 dBFS, no issues. A sparse piece of seven short effects will never be -14 LUFS; I left it at -22.7 on purpose (long silences, deliberate pauses are part of the design).
- would have prevented it: the cheatsheet line about 0.5 -> 2 is already there; I just under-read it. A hint in the `sfx` description that "default volume 1 is the preset's standard level: a handful of effects reads as -30 LUFS, write volumes of 1.5-2.5" would put the number where I look.

## What surprised me (all positive, but worth knowing)
- The luma wipe with a custom map: `from` holds until `to` has covered it (hard cutoff), so with soft blind edges the old scene looks cut into slats while the new one is already showing through the soft part (frame 7.27 s). It looks like a designed effect; the dsl.md sentence "from holds until to has covered it" explains it, but I only understood it from the picture.
- A transition whose `from` is a composition that itself holds FOUR mattes, a list mask, a blend mode and nested compositions rendered correctly at every sampled frame, including the wipe frames.
- The nested composition B only starts its own clock at the transition's `at` (B's `at` = 6.8), so B's internal matte (`sweep`) uses local seconds. That is documented in the composition rules, but it is the thing most likely to confuse a reader of a matte inside a transition scene: the end-card reveal is at local 1.25 s = 8.05 s in the movie, after the wipe is over (local 1.1 s).

## Wished the library had
- A tiny helper for the sliding-ramp matte (`ramp({ from, to, angle, softness })` returning the gradient rect layer with its `x` keyframe), because a soft directional blend-in is the main use of a luma matte.
- `inspect` / the check listing the matte layers and their users (it says matte layers are skipped; fine) with one line such as "matte `disc`: 7 users, alive 0-8.0 s". I verified lifetime by eye.
- A way to see a matte while designing (`check --show-mattes`), instead of the `arc` rings I added by hand.

## Reusable pattern worth adding to ai/reference/recipes.md (optional)
```js
// @recipe luma-reveal  -- a headline that blends in left to right through a sliding brightness ramp, and a band that tints what it passes
const text = (name, y, size) => ({ type: 'text', name, text: 'One matte,', mask: { layer: 'ramp', channel: 'luma' },
  style: { fontSize: size, fill: '#0f1115', fontWeight: 'bold' }, initial: { x: 170, y, anchorX: 0, anchorY: 0.5 } });
return { duration: 6, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#efe9dc' } },
  // white up to 70 %, then a ramp to black; 3000 px wide, its right edge starts at the left of the text and slides right-to-left
  { type: 'shape', shape: 'rect', name: 'ramp', width: 3000, height: 'GH', anchorX: 0, anchorY: 0,
    fillGradient: { type: 'linear', angle: 0, stops: [[0, '#ffffff'], [0.7, '#ffffff'], [1, '#000000']] },
    initial: { x: -2940, y: 0 }, keyframes: [{ at: 0.5, to: { x: -900 }, duration: 1.5, ease: 'power2.inOut' }] },
  text('h1', 300, 124),
  // a soft band (black - white - black) as a luma matte for a multiply tint
  { type: 'shape', shape: 'rect', name: 'band', width: 380, height: 'GH', anchorX: 0.5, anchorY: 0,
    fillGradient: { type: 'linear', angle: 0, stops: [[0, '#000000'], [0.5, '#ffffff'], [1, '#000000']] },
    initial: { x: -220, y: 0 }, keyframes: [{ at: 2.5, to: { x: 1500 }, duration: 1.2, ease: 'power1.inOut' }] },
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', at: 2.4, blendMode: 'multiply',
    initial: { x: 'GW/2', y: 'GH/2', fillColor: '#ff5a36' }, mask: { layer: 'band', channel: 'luma' } },
] };
```
(Not run through the recipe test; the same layers run in `matte-reel.html`.)
