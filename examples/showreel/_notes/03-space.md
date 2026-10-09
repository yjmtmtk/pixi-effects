# 03-space — stumble notes
Model: fable (Claude Fable 5.1, self-reported)   Cycles: 4   Result: works

## Went smoothly because the docs said so
- `focus: '<layer name>'` + `aperture` on the camera and a rack focus as one keyframe on `focus` (dsl.md "Depth of field", recipe `rack-focus`): worked first time, no warning.
- A dolly as `offsetZ` with the camera's `z` left automatic (dsl.md / pitfall 77): no home distance to type, the focus plane kept its meaning.
- `hideBehindCamera: true` on the cards the camera passes: no warning when they went behind the lens.
- A card as a `threeD` composition with `pivotX/pivotY` at its centre (recipe `depth-cards`): rect + two texts move and tilt as one.
- `check --at` prints each threeD layer's blur in px ("depth" lines): I could plan the rack focus from numbers without a screenshot.
- The blur formula in dsl.md (aperture × focal × |1/d − 1/f| / 2, capped at 32) predicted the start frame: 18 px on the far card, 0.3 px on the near one.

## Stumbles
### 1. Passing cards leave slivers in the held end frame   [MY-MISTAKE]
- tried: side cards about 400 px off the camera's path, a dolly of 900 px   - happened: in the last 2 s a 40–60 px blurred strip of a card the camera had passed stayed at the left / top-right edge (not a warning: `inspect` only checks text, and the text was already off)   - cause: a card at lateral offset d and distance D is fully out of frame only when (d − halfWidth) × focal / D > half the frame; near the end D is small but not small enough   - would have prevented it: a doc line in the camera section: "a card the camera passes is off the frame when (d − w/2) · f / D > W/2; put the cards it must pass further off the path than that, or fade them".
### 2. Cards drawn over the caption   [MY-MISTAKE]
- tried: `P.tag` spread before the cards (as in the BRIEF's example) and a near card in the lower right   - happened: the sharp near card sat under the caption line (both readable, but crowded); with the tag before the cards the 3D cards would also be drawn over the tag   - cause: non-threeD layers keep array order against threeD ones (pitfall 28), and I had placed a card where the caption lives   - would have prevented it: BRIEF: "put `...P.tag()` LAST when you have threeD layers; keep the bottom 120 px left of x≈1500 free for the caption".
### 3. Long caption   [MY-MISTAKE]
- tried: a 72-character caption at 40 px mono   - happened: it ran to x≈1800 under the near card   - cause: 40 px mono is about 24 px a glyph; 72 glyphs is 1730 px   - would have prevented it: a BRIEF line "caption ≤ 60 characters (≈ 1440 px at 40 px mono)".

## Wished the library had
- `check --at` listing non-text threeD layers that are partly outside the frame (a "cut-off card" line next to the "depth" line) so a sliver of a passing card is caught without a screenshot.
- A camera option `passing: 'fade'` (or on the layer: `hideBehindCamera: { fade: 200 }`) that fades a threeD layer over its last N px before the camera plane, so a fly-through does not need geometry planning to look clean.
