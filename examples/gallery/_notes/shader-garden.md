# shader-garden — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 6 check runs (1 write, 4 look-and-adjust, 1 final full check)   Result: works
poster: sonnet (Claude Sonnet 5.5, self-reported) (poster time 8.9 s in `movie.init`; the poster picture itself was not made, per the brief)
Field test of the new `shader` layer and `warp` filter documentation. Written only from ai/SKILL.md, ai/reference/*, docs/dsl.md "shader" and site/guide/shaders.md; `src/` was not read.

## Shaders written (4, all full-frame, `resolution: 0.5` on the two soft ones)
1. `flow` (0 to 10 s): domain-warped fbm noise (value noise, 4-octave loop, `q`/`r` warp), green field with a `tint` colour and a `glow` mix. Uniforms `speed` (1.8 to 0.45 to 1.5, keyframed), `tint` (green to rust, keyframed by component `'uniforms.tint.0'`..`.2`), `glow`.
2. `contours` (3.95 to 6.4 s): the same noise read as height, drawn as iso-lines with `fwidth` anti-aliasing, every 5th line coral. Cut out by a TEXT matte (`mask: 'letters'`, a named text layer) so the lines show only inside the letters of CONTOUR. Uniforms `levels` (5 to 22) and `rise` (0 to 1) keyframed: the terrain "grows" lines.
3. `ripples` (7.0 to 10 s): three drifting sources, a sum of damped sines, two-tone with `fwidth` edges. Cut by a CIRCLE matte (`mask: 'disc'`) whose `radius` is keyframed 0 to 236. Uniforms `freq`, `speed` (keyframed), `centre` (a `vec2`, the disc centre in layer pixels), `warm`, `cream` (colours).
4. `pollen` (0 to 10 s): a `transparent: true` layer: three parallax grids of soft gold dots rising. Uniforms `dust` (colour), `density` (keyframed 0 to 0.9).
The title is seen through water: `warp` kind `wave`, `strength` 26 keyframed to 3 by name (`'filters.water.strength'`) so the water settles as the title arrives.

Was writing GLSL from the docs alone easy? Yes. The `mainImage` / `fragCoord` / `iResolution` / `iTime` contract is exactly Shadertoy, the uniforms are declared for you, and I never had to look anything up about the wrapper. No shader needed more than one pass of my own debugging, and none of the bugs I had were the library's (all in the look; see 1 and 2). I never saw the magenta checkerboard or a compile warning, so I cannot say how good the line-number message is.

## Went smoothly because the docs said so
- The `uniforms` rules (number is float, 2 to 4 numbers a vec, `'#rrggbb'` a vec3 of 0..1, `'uniforms.tint.0'` for a channel) were all I needed: a keyframed colour, a keyframed speed and a `vec2` uniform all worked first time.
- "Opaque by default, `transparent: true` uses your alpha": I wrote `fragColor = vec4(dust, a)` (straight, NOT premultiplied) and the dots blend cleanly with no dark halo, so the doc's "the colour is premultiplied by its alpha" means the library does it for you. Worth saying in one sentence ("write a straight colour and an alpha; do not premultiply").
- `mask: 'name'` with a shader layer as the masked layer, a `text` layer as the matte (pitfall 81) and a keyframed circle's `radius` as a matte: all just worked, including `mask` + a layer's own `at` / `duration` (the matte shares the lifespan).
- `warp` named + `'filters.water.strength'` keyframe worked as the recipe shows; the layer needed no `filterArea` (the "pads the layer by strength" line is true: no clipped glyph edges at strength 26).
- `fwidth()` and `mod`/`step`/`smoothstep` compile fine in GLSL ES 3.00: the contour and ripple edges are anti-aliased with no extensions.
- `check` printed no warnings on any of the 6 runs; its layout line, sound line and export (3.24 MB mp4, 10.03 s, 1280x720) all passed.

## Stumbles
### 1. My first contour formula drew everything as a line   [MY-MISTAKE]
- tried: `line = 1 - smoothstep(0.5 - w - 0.04, 0.5 - w + 0.02, 0.5 - d)` from memory.
- happened: letters were solid coral/ink with no contours (the whole field counted as "line").
- cause: my own maths (I mixed up distance-to-line with distance-from-middle). Not a doc matter.
- would have prevented it: nothing in the docs; a contour/iso-line snippet in the recipes would have saved a cycle (see "Reusable pattern").

### 2. Ripple look: sources at the layer centre, the disc is not at the centre   [GAP]
- tried: a ripple shader that centres its sources on `iResolution.xy / 2`, cut by a disc matte placed at x = 410.
- happened: the disc showed only the outer part of the waves (a plane wave of parallel stripes), no concentric rings.
- cause: a shader layer is the full frame and the matte just cuts it. The docs say "a shader is a layer that can be masked" but nothing says that the picture is positioned by the SHADER's frame, not the mask's. Obvious in hindsight, but the first time I forgot.
- would have prevented it: one doc line, "a masked shader is still drawn at full size: put the pattern's centre where the matte is, or give the shader its own `width` / `height` and `x` / `y`." I fixed it with a `centre` `vec2` uniform; I did not try `width` / `height` + `x` / `y` instead (the docs say width / height exist, but not whether the shader layer is then anchored top-left or centred; "layers are centred by default" for shapes and "top-left" for text/image, shaders are not listed in the anchor rule of the cheatsheet).

### 3. Which anchor does a smaller shader layer have?   [GAP]
- tried: nothing; I avoided it because of the above.
- would have prevented it: cheatsheet "Anchors" line: add "a shader layer is top-left like an image" (or whichever is true).

### 4. A shader inside a mask fades by `alpha` while its matte stays   [SPEC-ODD, minor]
- tried: fading the contour scene out with `keyframes: [{ at: -0.35, to: { alpha: 0 } }]` on the shader and on the coral shadow text.
- happened: for 0.35 s the translucent shader shows the coral shadow layer through itself (muddy mix) because the shadow is a separate layer. That is correct behaviour for separate layers; I left it (it is short) rather than group them in a composition.
- would have prevented it: nothing wrong; mentioned because a "fade a masked shader" recipe would show the two-layer trap.

### 5. Loudness advice   [TOOLING, trivial]
- `check` said "the mix is quiet: -24 LUFS" for six short sfx. Intentional (sfx only, long silences), the note's advice to "raise the volume" is aimed at music beds. Not an error.

## Warnings hit
None, on any run. So I cannot report what a warning made me change; I did not try writing a deliberately wrong shader.

## Wished the library had
- A way to put a shader on a smaller area without a mask (documented `width` / `height`, but I did not see a one-line example of positioning it).
- `iResolution`-independent "layer position": maybe an `iOrigin` uniform, or documented that `fragCoord` is relative to the layer. (`fragCoord` is in the layer's pixels per the docs, so a shader with its own `x/y` would be simple if the anchor were documented.)
- A text layer's alpha as a matte for `luma` reads (works for me with `alpha`, not tested with `luma`).

## Reusable pattern worth adding to ai/reference/recipes.md
Contour lines of a noise height, cut through letters, with the terrain "rising" (levels and rise keyframed):
```js
// @recipe shader-contour-letters
const NOISE = `
  float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnz(p); p = p * 2.0 + vec2(3.1, 8.7); a *= 0.5; } return s; }`;
return { duration: 5, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#0c1713' } },
  { type: 'text', name: 'letters', text: 'CONTOUR', style: { fontSize: 196, fontFamily: '"Arial Black", Arial, sans-serif', fill: '#ffffff' },
    initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 } },                          // the matte: not drawn
  { type: 'shader', mask: 'letters', uniforms: { levels: 5, rise: 0, line: '#f2ead8', accent: '#ff6b4a' },
    fragment: NOISE + `
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        float h = fbm(fragCoord / iResolution.y * 3.2 + vec2(iTime * 0.08, iTime * 0.03)) * rise;
        float x = h * levels, w = fwidth(x);
        float dd = 0.5 - abs(fract(x) - 0.5);                      // 0 on a line
        float ln = 1.0 - smoothstep(w * 1.1, w * 2.4, dd);        // anti-aliased, about 2 px
        float major = step(mod(floor(x), 5.0), 0.5);
        vec3 base = vec3(0.122, 0.290, 0.227) * (0.45 + h);
        fragColor = vec4(mix(base, mix(line, accent, major), ln * 0.96), 1.0);
      }`,
    keyframes: [{ at: 0, to: { 'uniforms.rise': 1 }, duration: 1.2, ease: 'power2.out' }, { at: 0.2, to: { 'uniforms.levels': 22 }, duration: 1.5, ease: 'power2.inOut' }] },
] };
```
