# nagiro-light - usability notes
Model: opus   Slot: S3-product   Cycles: 12   Result: works
Timeline: started 12:50 (wall clock); brief.md written +3 min; first page that rendered at +6 min; first contact sheet looked at at +6 min; done at +14 min (12 check runs, 3 of them with the export; each no-export check took 6-9 s, a full one 15-24 s)

## Went smoothly because the docs said so
- AGENTS.md (WebFetch) -> quickstart -> SKILL.md was a short, clear path; `new` gave a working page in one command.
- SKILL.md pointed me to `reference/direction.md` for a product film: it pushed me to write brief.md before drawing.
- `help shader` answered everything I needed for a raymarched product in one read (mainImage, iTime per layer, vec3 uniforms from 3 numbers, 'uniforms.cam.0' keyframes, constant loop bounds, resolution).
- `help music` gave the instrument list, beat counting and the ring/attack options.

## Stumbles   (one entry each, also small ones)
### 1. sfx knobs at the layer's top level   [MY-MISTAKE / warning could be sharper]
- tried: `{ type: 'audio', sfx: 'click', pitch: 0.6, brightness: 0.3 }` (I half-remembered "knobs pitch, brightness").
- happened: `layer "switch": "pitch" is not a audio layer key. Valid keys: type, name, parent, ...` (and the same for brightness). The list of valid keys does not help: the fix is a different SHAPE (`sfx: { preset: 'click', pitch, brightness }`), not a different key.
- cause: SKILL.md says "knobs `pitch`, `brightness`, `seed`" right after the string form `sfx: 'swoosh'`, without showing the object form.
- would have prevented it: the warning saying "pitch belongs inside sfx: { preset: 'click', pitch: ... }" (SKILL.md promises a did-you-mean for exactly "`pitch` outside `sfx`", but this one did not have it), and SKILL.md showing `sfx: { preset, pitch }` in the same sentence.
### 2. "a" audio layer   [SPEC-ODD, cosmetic]
- the warning says "is not a audio layer key".

## Review rounds (look -> critique -> fix)
### Round 1 (first render)
- 1.5 s: grain far too strong on large mid-grey areas; the macro is a grey CG bowl, the light sweep barely shows. -> grain 0.035 -> 0.018, macro re-framed from above onto the rim, opal diffuse turned down (new `opalI` uniform) so only reflections read.
- 5.5 s: the lit globe is flat beige, it does not read as light. -> emission: near-white core, amber rim (thin vs thick glass), plus a faint halo in the air.
- 7.5 s: the aluminium side looks like dark plastic. -> env() now reflects the lamp-lit table and a tall strip softbox instead of a round one.
- 12 s: product too central (x ~ 780 of 1280). -> lens shift 0.2 -> 0.3; spec line raised from 14 to 16 px.
### Round 2
- 12 s: the spec line "... 2700K" ran into the bowl (text to x 705, bowl from x 655); hard horizon where the table meets black at y ~150. -> line shortened to "TABLE LIGHT 01 · 2700K"; the table now dissolves into the dark by distance.
- 12 s: globe blown to a flat white disc; bowl side beige. -> emission lowered (1.6 core / 0.75 rim), table reflection on metal 1.4 -> 0.6.
- 1.6 s: flat top blown out, moire fan on the lathe lines at grazing angles. -> narrower strip, lathe-line fade uses the pixel footprint / cos(view angle).
### Round 3
- 5.9 s and 9.0 s: the 0.4 s crossfades are double exposures (two globes at two scales on top of each other): the "awkward half-transition frame" of direction.md. -> shots now meet on the bar line with an exposure dip (each shot opens from exposure 0 in 0.7 s and closes in the last 0.4 s); captions fade out before the cut.
- 1.6 s: the highlight on the flat top is a hard-edged trapezoid, obviously a CG strip. -> roughness per surface: bead-blasted top (soft wide lobe), polished chamfer (crisp line), turned side.
- 7.5 s: the bowl side still reads as ceramic. -> the strip softbox now extends low enough to put a vertical highlight on the side.
### Round 4
- 1.6 s (full-size frame): a dashed line of wrong pixels along the chamfer and black specks at the globe/dish seam. -> roughness blended smoothly by the normal (it switched abruptly between surfaces), raymarch step relaxed to 0.85, 140 steps.
- 12 s: the globe's top touched the outer 5 % (y 33 px) after I enlarged the product. -> camera pulled back, lens shift y 0.06 -> 0.
- Sound: -19.5 LUFS, quiet for web video (the check's own read-back). -> music volume 0.9 -> 1.3 (now -16.3 LUFS, true peak -3.7 dBTP); the lamp-switch click 0.6 -> 0.9.
- Final hold: the spec line finished at 12.1 s, leaving <1 s. -> closing type starts 0.2 s earlier; everything settled by 11.7 s, held 1.3 s.
### Round 5
- 3.5-5.2 s (zoomed crop of a full frame): single white sparkle pixels along the globe's silhouette (grazing rays, Fresnel -> 1 reflecting the strip) and a stair-stepped edge. -> reflection faded by the facing angle at the silhouette; shader layers drawn at `resolution: 1.5` (supersampled). Both gone on the next crop.

### 3. `resolution` above 1 is not documented   [GAP]
- tried: `resolution: 1.5` on the shader layers to anti-alias the raymarched silhouettes.
- happened: no warning, and the edges came out smoother, so it seems to supersample; but `help shader` only describes 1 (default) and 0.5 ("the way out for a heavy shader").
- would have prevented it: one sentence in the shader section: "`resolution` above 1 (up to N) supersamples: smoother edges for raymarched or line shaders, at resolution^2 the cost".

### 4. No anti-aliasing / no hint about silhouettes in a raymarch   [GAP, minor]
- a shader layer is aliased like any fragment shader; the docs talk about `fwidth` for line art (pitfall 94) but nothing about hard 3D silhouettes. A line in the shader section ("for a raymarched object, use resolution 1.5-2 or your own AA") would have saved one round.

### 5. Dissolves between shader shots look like double exposures   [MY-MISTAKE, design]
- tried: overlapping the shot layers by 0.4 s and fading the new one's alpha in.
- happened: two globes at two scales on screen at once (5.9 s, 9.0 s); direction.md's checklist ("no awkward half-transition frame") caught it when I looked.
- fix: keyframing the shader's own `uniforms.expo` to dip each shot to the floor colour instead. `'uniforms.expo'` keyframes with `from` worked first time; nice.

### 6. Check output is quiet about where `--at` frames land   [TOOLING, tiny]
- `check --no-export --at ...` writes `check-out/at.png` and `check-out/frames/*.png` (not `check-out/<name>/` as SKILL.md says, because I passed `--out check-out`): fine, but SKILL.md and the brief describe the path differently; I had to `ls` once.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch; the fetch tool only returned a summary, the local copy in node_modules was identical in substance) -> quickstart.md -> SKILL.md: enough to start.
- reference/direction.md: answered "how do I direct a product film" (brief, motion rule per object class, review protocol, the checklist that caught my double-exposure dissolves).
- `help shader`: answered everything about the shader layer except resolution > 1 and anti-aliasing.
- `help music`: answered the score syntax; the check's music read-back (bars per track) confirmed the bell lands on the cut bars.
- `help sfx` (grep for pitch): answered the object form after the warning did not.
- `help relative`: answered `'+=10'` (I first wrote `'+10'`; I looked it up before running, so no warning was involved).
- `recipe film-grain`: answered the grain filter on the root composition in one line.
- Did not need: cheatsheet.md, pitfalls.md end to end, any recipe for the 3D (the shader layer replaced 2.5D entirely).

## Wished the library had
- A documented supersampling option (or `antialias: true`) for shader layers.
- A per-source peak in the check's audio line, so I can see whether a quiet sfx (the lamp click) is audible under the music without opening report.json (cues only list start times).
- A tiny "glow / bloom on bright pixels" filter that is documented as the cheap way to make an emissive object read as light (I faked it inside the shader with a closest-approach halo).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. Shot 1 (1.2-2.0 s): when the strip light lines up with the flat top, the whole annulus lights up as one broad, slightly flat grey-white area; the most beautiful moments are the thin chamfer glints before and after it. With more cycles: a narrower, dimmer strip for the top, so the lathe grooves stay visible through the peak, or a sweep that never fully aligns.
2. The lit globe (6-13 s) is close to a uniformly bright disc: the amber rim helps, but there is no inner structure (a faint bulb shadow, a slight top/bottom gradient from the bowl's reflection) to say "hand-blown glass". I would add a subtle low-frequency density variation and a cooler, darker crescent where the bowl hides the lower glass.
3. The table is a featureless warm-brown plane; the pool of light is believable but the material of the table says nothing. A very faint wood or stone grain in the ground (procedural, low contrast) would carry the "material" theme into the last shot. Also the first 0.6 s is pure black (an intentional fade from dark, but a weak first frame for a feed).
