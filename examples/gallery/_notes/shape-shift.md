# shape-shift — stumble notes
Model: sonnet   Cycles: 2 (1 write, 1 look-and-adjust)   Result: works
Note: written by the library's author to put path morphing, followPath and animateText through one real piece; not a fresh-session trial.

## Went smoothly
- A blob, a star and a heart are plain SVG path data. One layer morphs from its `d` to its `morphTo`, so the chain is three layers that hand over at the same moment: each starts as the outline (and colour) the one before ended as, and nothing jumps. The fill colour morphs with an ordinary `fillColor` keyframe next to `morph`.
- The loop the comet rides is drawn on first (`trimEnd` 0 → 1) from the very same path data that `followPath` walks.
- The comet is `followPath({ d, duration, orient: true, frameRate: 30 })` on a triangle, and the same keyframes (rotation removed) on five dots; `stagger(layers, { each: 0.1 })` starts each dot a little later, which is the trail. No per-dot arithmetic.
- `animateText` made the title (rising from the middle, a gentle idle drift, `styleFor` for the yellow word) and the subtitle (by words, `pop`) in one call each; `inspect` found nothing cut off.

## Stumbles
### 1. A morph is one pair of outlines per layer   [BY DESIGN]
- Three forms need three layers. Give each next layer the previous layer's `morphTo` as its `d`, and the same colour it ended with.

### 2. The trail dots must not rotate   [MY-MISTAKE]
- The first version reused the pointer's keyframes as they were, so the dots got `rotation` too (harmless for circles, but needless). The piece strips it from the copies.

### 3. The comet was too small to read   [TASTE]
- At 16 px the pointer and the trail were lost against the big shape; 24 px and dots from 15 px down read well at the gallery's thumbnail size.
