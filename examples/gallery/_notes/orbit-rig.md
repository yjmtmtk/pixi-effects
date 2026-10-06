# orbit-rig — stumble notes
Model: sonnet   Cycles: 3 (1 write, 2 look-and-adjust); redesigned after the first version   Result: works
Note: written by the library's author to put null layers, wiggle, stagger and seeded randomness through one real piece; not a fresh-session trial.

## Went smoothly
- The whole diagram hangs off ONE `null` layer ("rig") at the sun: the slow push-in is a `scale` keyframe on it, and the hand-held breathing is `wiggle` on its x / y / rotation (2 px, 0.12°: you feel it more than you see it). Every ring, planet and star says `parent: 'rig'`, so none of them needs a keyframe for that.
- Each planet is a circle on a `null` that turns (`orbit-0` … `orbit-4`, turns over the whole movie 3.2 / 2.1 / 1.5 / 1.0 / 0.45) with the circle at `x: radius`; the Earth's moon is a null on the Earth's null. No trigonometry anywhere.
- `stagger(5, { each: 0.42 })` gives the five start times: the rings draw on one after the other (`trimEnd`, starting at 12 o'clock), the planets fade in with them, and the five `click` sounds use the same numbers.
- The legend is five rows, each a `null` with a swatch and a line of text as children, staggered with `stagger(layers)`: one `at` per row moves all three parts.

## Stumbles
### 1. The first version was a feature demo, not a piece   [DESIGN, the big one]
- It had a sun, a planet and a moon, letters and tiles rippling in, and a shaking title, all on one canvas; the owner called it plain bad. The redesign is a museum plate: ivory and brass on a blue-black ground, a hairline frame, one large serif title (Didot / Bodoni / Georgia), small letter-spaced captions, a legend, "NOT TO SCALE". Nothing moves that does not belong to an orrery.

### 2. Children are measured from the null's origin   [WORTH KNOWING]
- The rig sits on the sun, so the sun is `(0, 0)` and Jupiter's ring is a circle of radius 284 centred there. The title and legend are outside the rig, in canvas coordinates.

### 3. The outer ring ran off the frame   [MY-MISTAKE]
- With a radius of 318 and the push-in, Jupiter's ring crossed the frame line. The radii are 68 / 112 / 162 / 218 / 284 and the sun sits a little above the middle.
