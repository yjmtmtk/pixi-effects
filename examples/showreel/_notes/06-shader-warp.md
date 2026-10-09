# 06-shader-warp — stumble notes
Model: opus (Claude Opus 5.5, self-reported)   Cycles: 5   Result: works

## Went smoothly because the docs said so
- Pitfalls 89-91 (mainImage / fragColor, uniforms declared for me, constant loop bounds): both shaders compiled on the first run, no warning.
- docs/dsl.md shader rule 8 ("size and place the layer to match"): drawing formula A into a 720 x 720 layer whose centre is the mask disc's centre meant no centre uniform at all.
- An inline circle mask whose `radius` is keyframed (r 1 → 330 → 1560) was a clean iris that opens formula B out of formula A; keyframes count from the masked layer's start, as the cheatsheet says.
- `'uniforms.twist'` / `'filters.water.strength'` keyframes worked exactly as documented; warp moved by itself with no time keyframe.

## Stumbles
### 1. My own vein mask was inverted   [MY-MISTAKE]
- tried: `vein = 1 - smoothstep(0, aa, bands - 0.44)` for thin vermilion lines.   - happened: the field came out almost entirely vermilion (no warning, it compiles).   - cause: the sign; I wanted `smoothstep(0.43 - aa, 0.43 + aa, bands)`.   - would have prevented it: nothing in the library; only looking at `at.png` caught it (which the brief insists on).

### 2. Relative keyframe values do not exist (I nearly wrote one)   [GAP]
- tried: `from: { x: '+-36' }` (an AE/GSAP habit, "36 px left of where it is").   - happened: caught it myself before the first run and wrote absolute values.   - cause: expressions are build-time and have no "current value" variable.   - would have prevented it: one line in the cheatsheet's Numbers row: "no relative `'+=N'` values: write the absolute start".

### 3. Vermilion mono text over a shader that also uses vermilion   [MY-MISTAKE / SPEC-ODD]
- tried: the warp code line in vermilion directly over the liquid field (whose veins are vermilion).   - happened: barely readable at phone size. A `calm` uniform that darkens a band behind the title helped the display word but not the thin mono line.   - fix: a dark rounded chip (ink, 0.88 alpha) behind the line. A shader cannot read what is behind it, but the reverse matters too: text cannot ask the shader to step back, so the shader has to be written with the type's place in mind (a uniform for it is the clean way).

### 4. `fwidth` on a half-resolution shader looks soft   [GAP]
- tried: `resolution: 0.5` on the full-frame field (the docs recommend it for heavy shaders).   - happened: fine for the flowing colour, but thin anti-aliased lines (`fwidth`) come out a little blurry after the upscale.   - would have prevented it: a sentence in rule 9 / pitfall 91: "resolution < 1 softens crisp lines; keep 1 for line art, 0.5 for soft fields".

## Wished the library had
- Relative keyframe values (`x: '+=36'`) or a `from` that names an offset, for the very common "slide in 36 px" entrance.
- A way for check to print a shader's cost per frame (ms) so I could decide on `resolution` with numbers.
