# shape-shift — stumble notes
Model: sonnet   Cycles: 4 (1 write, 3 look-and-adjust); redesigned after the first version   Result: works
Note: written by the library's author to put path morphing, followPath and animateText through one real piece; not a fresh-session trial.

## Went smoothly
- A square, a circle and a triangle are plain SVG path data around one centre. One layer morphs from its `d` to its `morphTo`, so the three shapes are three layers that hand over: each starts as the outline and the colour the one before ended as, and nothing jumps. `fillColor` morphs with an ordinary keyframe next to `morph`.
- The thin ring is a `path` that draws on (`trimEnd` 0 → 1), and the black dot rides the very same path data with `followPath({ d: RING, duration, frameRate: 30 })`, once round, at constant speed.
- `animateText` made the two big lines (letters slide in from the left, a few milliseconds apart) and the three changing words (rise in, fade out): one call each, and the words' timing is just the layers' `at` and `duration`.

## Stumbles
### 1. The first version was a feature demo, not a piece   [DESIGN, the big one]
- A comet with a trail, a blob / star / heart chain and a glowing title: three ideas and no point of view. The redesign is a Bauhaus poster: paper, ink and the three primaries, a very large grotesque, one shape on the right, one word that changes with it, fine print on a rule. The idea is the title: FORM FOLLOWS FUNCTION (red square), FEELING (yellow circle), FUTURE (blue triangle).

### 2. The type ran into the ring   [MY-MISTAKE]
- At 132 px "FOLLOWS" is about 630 px wide; the first ring started at x = 688 and the dot passed over the S. The shapes moved right (centre 982) and the ring got smaller (radius 206).

### 3. The shape changed while the wrong word was on screen   [TIMING]
- The first morph started 0.9 s into the first act, in the middle of "FUNCTION". Each act now holds its shape while its word is up and morphs just as the word is replaced (the sixth number of each act).

### 4. A morph is one pair of outlines per layer   [BY DESIGN]
- Three shapes need three layers; give each next layer the previous layer's `morphTo` as its `d`, and the colour it ended with.
