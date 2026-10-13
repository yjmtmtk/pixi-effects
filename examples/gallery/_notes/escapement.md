# escapement - usability notes
Model: opus   Slot: T27   Cycles: 11   Result: works
Timeline: start 13:49; brief written +6 min; first page that rendered +15 min (14:04, worked first time, no warnings); first contact sheet looked at +15; done at +31 (14:20)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md was a short, clear path; `new escapement --duration 12.8` gave a working page at once.
- `help shader` answered everything I needed for a full-canvas procedural plate (uniforms, bottom-left origin, keyframing `uniforms.x`).

## Stumbles
### 1. Sub-paths of a `path` are not holes   [GAP]
- tried: one `d` with the toothed outline followed by the spoke cut-outs as extra sub-paths (the SVG way to make an open-worked wheel).
- happened: no warning; the cut-outs were drawn as extra FILLED shapes on top of the disc, each with its own `fillGradient` (a radial gradient per sub-path, so every cut-out had its own bull's-eye). Only visible at full size in `frames/*.png`.
- cause: the path fill has no fill-rule / hole support; the docs never say either way (`help path`, cheatsheet "path" row).
- worked around: the cut-outs as an inline inverted mask on the wheel (`mask: { invert: true, layer: { type:'shape', shape:'path', d: holes } }`), which follows the rotating null parent correctly. Works, but costs a matte filter per wheel.
- would have prevented it: one line in the path row ("sub-paths are filled separately, not holes: punch holes with `mask: { invert: true, layer }`"), or `fillRule: 'evenodd'` on path.
### 2. Wanted to keep the plate shader sharp under a camera zoom   [SPEC-ODD, small]
- tried: a 2D `composition` as the "world" (scale + pivot keyframes = a camera), and the plate as a full-canvas `shader` OUTSIDE it, with a `cam` uniform keyframed with the same values and eases, so the perlage is computed per screen pixel at any zoom.
- happened: works exactly (same keyframe curves -> same numbers, the plate never drifts against the wheels). I did NOT test a shader inside the scaled composition; I avoided it because `help shader` says the shader is "drawn into a picture" of `width x height`, so I expected it to be upscaled 3.3x and soft.
- would have helped: a doc sentence saying what happens to a shader inside a scaled composition (drawn at its layer size and then scaled? or at screen resolution?), and the "camera = composition pivot/scale + a mirrored uniform" pattern as a recipe; it is a very natural 2D macro-to-wide move.

### 3. A filter with an undefined option hung the page with no pixi-effects warning   [LIBRARY-BUG]
- tried: wrapping my wheel layers in a helper that adds `filters: [{ type: 'blur', name: 'dof', strength }]`; my own bracket mistake passed `strength: undefined`.
- happened: `check` -> "page NOT READY (window.__ready !== true within 60 s)", and the only logs were three PixiJS `[BindGroup] ... destroyed while still bound to a shader` warnings (which the docs call harmless). Twice in a row, so not machine load. `movie.init` neither resolved nor threw, so the template's try/catch never fired.
- cause: my typo (`strength: undefined`); the library does not validate filter option values.
- would have prevented it: a build-time warning "filter 'dof' (blur): strength is undefined, expected a number" (the library already warns about unknown keys, so a value check fits), or an init timeout that throws with the last layer being built.
### 4. Sound: a custom `sfx` is great for a mechanical tick   [went well, small note]
- two custom voices sets (band-passed noise + a short sine + a triangle transient, different centre frequencies for tick and tock, small opposite pans) gave a believable metallic tick/tock. The docs list `gain`, `from`/`to`, `q` only in prose (`help voices`), not in the cheatsheet's custom-sound sentence; I found them through `help voices`.
### 5. Musicbox bar written short   [MY-MISTAKE, caught by the tool]
- I wrote a 4-beat chord bar as four 8th notes (2 beats); `check`'s music read-back showed "musicbox 7 bars (ends early: silent from beat 28)" and the bars shifted against the pad. Building the 8th-note bars with a small JS map (`'d5 f5 a5 ...'.split(' ').map(n => n + ':0.5')`) fixed it. The read-back is exactly the right check.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch) -> `reference/quickstart.md` -> `SKILL.md`: the whole workflow, null/parent rigs, masks, shader, music, sfx. Enough to build everything.
- `help path`: answered `followPath` / `cameraPath` mostly; the path row in the cheatsheet answered "canvas coordinates"; NOTHING answered "are sub-paths holes?" (stumble 1).
- `help shader`: answered everything (uniforms as vec3, keyframing `uniforms.cam.0`, bottom-left origin, loops need constant bounds).
- `help mask`: the inverted inline mask (`mask: { invert: true, layer }`) solved the holes; "a mask lives in the parent's coordinates" told me it would rotate with the null parent, and it did.
- `help voices`: custom sfx voice options (`gain`, `q`, `from`/`to`).
- cheatsheet (grep): fillGradient (radial stops, shape-local bounds), composition pivot/scale, keyframe repeat rules, audio volume keyframes.
- Round-3 lessons in the brief: fonts (Hiragino/Yu Mincho stack), `check --out` folder layout, thin lines judged in frames/*.png (the hairspring is 0.8 px): all correct and useful.

## Wished the library had
- `fillRule: 'evenodd'` (or holes) for `path`; open-worked parts are a classic of mechanical / technical illustration.
- A "stepper" helper: rotation that advances by N degrees on a list of beat times (I generated 63 keyframes per axis in JS; trivial, but a `steps({ times, by, duration, ease })` like `wiggle()` would be self-documenting).
- A gear helper (`gear({ teeth, module, phase })` returning path data) would make mechanisms a one-liner; meshing phase math (tooth on the line of centres, pinion gap + 180/n) took real thought.
- A 2D camera layer (pan/zoom without threeD) that shader layers can read as a uniform; I mirrored the camera into a uniform by hand.
- Validation of filter option values (stumble 3).

## Self-assessment
Rounds: (1) after the first render: wheels clustered in one corner, cock was a wrong wedge, hairspring a vinyl record, ratchet the brightest thing, perlage aliased, opening caption on top of the balance (2.0 s) -> new layout around the plate, proper cock and barrel bridge, finer spring, darker ratchet, caption moved bottom-right. (2) macro framing lost the escape wheel after the re-layout (1.5-3.0 s), bridge stripes too coarse and bright (5-12 s), cut-outs were not holes (all frames) -> camera re-aimed, darker/finer Côtes de Genève, inverted-mask holes. (3) 8.1-9.3 s was a dead static wide shot, the end glint greyed the black background (10.5 s), barrel/ratchet out-shone the escapement in the wide shot -> power2.inOut move that lands on the 9.6 s downbeat plus a slow push during the type, glint masked to the plate, darker barrel; then depth of field on the lower plane in the macro, and a fade of the score over the last 1.6 s (the mix used to stop dead at 12.8 s).
Weaknesses:
1. The wide shot is small and busy on the right: the open-worked wheels overlap into a lattice and the heart (escapement) is tiny at the end. With 3 more cycles: a larger final scale (plate radius ~330) and one wheel fewer, or a bridge over the third/fourth wheels so the escapement reads as the focal point.
2. The geometry is plausible, not exact: the pallet stones do not truly lock and release a tooth (the wheel steps and the fork flicks on the same beat, but the stones never visibly catch a tooth), and the hairspring only turns a little with the balance instead of breathing. I would compute the stone positions per tick and morph the spring between two coilings.
3. The first 0.3 s is pure black and the macro shot has a stick-like lever tail crossing the balance; I would open on a glint already moving and draw the lever as a filled machined shape with bevel highlights.
