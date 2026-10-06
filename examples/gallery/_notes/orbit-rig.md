# orbit-rig — stumble notes
Model: sonnet   Cycles: 2 (1 write, 1 look-and-adjust)   Result: works
Note: written by the library's author to put null layers, wiggle, stagger and seeded randomness through one real piece; not a fresh-session trial.

## Went smoothly
- One `null` layer ("handheld") at the canvas centre carries the whole scene: every other layer says `parent: 'handheld'`, so the camera shake (`wiggle` on x / y / rotation) and the slow push-in (`scale` keyframe) are two lists on one layer instead of a keyframe per element.
- Nested nulls make the orbit: `system` → `planet-orbit` (rotation 0 → 720°) → planet; `moon-orbit` sits on the planet-orbit at the planet's position and turns four times as fast. No trigonometry.
- `stagger(layers, { each: 0.09, from: 'center' })` shifted the letters' `at`; the same call on five `pop` sound layers put the sounds on the same wave. `stagger(layers, { grid: [6, 2], from: 'center', ease: 'sine.out' })` made the tile ripple.
- `rand(i)` placed the 64 stars and picked the tile colours; `wiggle` with a per-star seed twinkles each one. Every run and every export is the same picture.

## Stumbles
### 1. Children are measured from the null's origin   [WORTH KNOWING]
- The null sits at (640, 360), so a child at `x: 230` is drawn at 870. Everything inside the rig is written as an offset from the centre (`splitText` takes the same offsets). Easy once known, a surprise if you expect composition coordinates.

### 2. `stagger` shifts `at` but not `duration`   [BY DESIGN]
- Layers that should live to the end of the movie need `duration: DURATION - at` after the stagger, or the last ones end a moment early. The piece maps that on after calling `stagger`.

### 3. Keyframes on a null's children count from the child's own start   [BY DESIGN]
- The system appears at 0.3 s, so each of its layers has `at: 0.3` and its keyframes start at 0 from there; the planet's 720° turn lasts `DURATION - 0.3`.
