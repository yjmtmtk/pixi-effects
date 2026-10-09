# 04-light — stumble notes
Model: opus (Claude Opus 5.5, self-reported)   Cycles: 6   Result: works

## Went smoothly because the docs said so
- The floor (a big layer, `rotationX: 90`, origin at its far edge with `anchorY: 0`) is spelled out in docs/dsl.md Lights rule 11 and pitfall 88, and it worked the first time. The floor also takes shadows.
- The spot light's key list (`lookAtX/Y/Z`, `coneAngle`, `coneFeather`, `shadowDiffusion`, `castsShadows` on the light AND the layer) worked as documented. `shadowDiffusion: 16` gave soft glyph shadows right away.
- A text layer casts a shadow in the shape of its glyphs: the word LIGHT throws letter-shaped shadows. Nothing extra needed.
- Fog that fades to a haze colour, with a 2D gradient behind it in the same colour, matched the fog-depth recipe.
- `check --at` printing how lit each threeD layer is ("light 0.80s — letter-1 0.9 …") was useful for seeing which letters the lamp reached.

## Stumbles
### 1. Five letters cast shadows, but a receiver takes only four   [SPEC-ODD]
- tried: L I G H T as five `threeD` text layers, each `castsShadows: true`, over one floor.
- happened: `unnamed composition layer: 5 layers cast shadows, but a layer receives shadows from at most 4 (the first 4, in layer order); "letter-4" and later cast none`. The warning is clear and names the layer.
- cause: the 4-caster limit is per receiver and counts layer order, not geometry, so splitting the floor into a left half and a right half would not help (both halves would still take the first four).
- fix: the whole word is ONE text layer (one caster). The lighting is per pixel, so each letter is still lit on its own; I only gave up moving the letters one by one.
- would have prevented it: a line in pitfall 86: "a word of more than 4 letters: make it one text layer, it is one caster".

### 2. A low lamp lit a dark floor so little that the shadows did not show   [MY-MISTAKE]
- tried: a mid-grey floor (`#6b655c`) with the camera at eye level (default y).
- happened: the floor stayed nearly black (light 0.24) and the shadows were thin slivers. The camera looked at the floor almost edge-on, and a low lamp reaches the floor at a shallow angle, so N·L is small.
- fix: a much lighter floor colour (`#bdb3a1`, it is darkened by the light anyway), aim the spot BEHIND the word (`lookAtZ: -700`, `lookAtY` on the floor) so the pool is where the shadows fall, and raise the camera (`y: 270, lookAtY: 610`) so the floor is seen from above.
- would have prevented it: a line in Lights: "a floor lit by a low lamp gets light at a shallow angle (N·L): give it a light base colour and look down at it from above eye level".

### 3. The floor's far edge showed as a band against the background   [MY-MISTAKE]
- tried: a 6000 × 5000 floor and a 2D sky gradient reaching the haze colour at 42 % height.
- happened: a visible edge with rounded corners where the floor ended in front of the darker gradient.
- fix: a much bigger floor (16000 × 9800, far edge at z −9000, beyond `fogFar`) and the sky gradient reaching the fog colour by about the horizon (24 %).
- would have prevented it: the fog-depth recipe could say "make the floor reach past `fogFar` and paint the 2D background in the fog colour from the horizon down".

### 4. Keystone from looking down   [GAP]
- tried: a camera high above the floor looking down at the word.
- happened: the letters at the sides lean outwards (vertical lines converge), so the word looks splayed. A camera tilt of about 13° was a compromise between seeing the floor and keeping the word upright.
- would have prevented it: nothing is wrong; a camera "shift" (lens offset without tilting) would let you see more floor and keep verticals vertical.

## Wished the library had
- A way to choose which casters a receiver takes (per-receiver `shadowsFrom: [...]`, or picking the nearest casters instead of the first in layer order), so a row of more than four objects could all throw shadows on one floor.
- A camera lens shift (`shiftY`) to frame a floor without tilting the camera (no keystone).
- A visible-lamp helper (a glow sprite that follows a light's position) would make "where the light is" readable without hand-copying the keyframes.
