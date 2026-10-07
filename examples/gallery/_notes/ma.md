# ma — stumble notes
Model: opus   Cycles: 7 look-and-fix rounds   Result: works. Written in one session from a short brief ("a showpiece film that makes people ask whether an AI made it"), after the library had the `music` layer.

48 s, 1920x1080 @ 30 fps. `__logs` = `[]`. MP4 export with 16-sample motion blur took 99 s (8 samples: 54 s). 20 sound sources: two `music` layers (one score would have had a reverb tail across the silence) and sfx cut to the picture's hits.

## What it shows
- A concept that uses the data model on purpose: the kanji 間 is a gate (門) with the sun (日) in the gap, and the film acts that out. A hairline of light is the gap between two doors; a corridor of gates is flown through on a camera path sampled into keyframes; a beat of true silence (the *ma*); the doors swing open in 3D; the sun morphs into the glyph; a seal is stamped on the downbeat.
- Every visual hit is cut to a known beat (80 bpm: a bar is exactly 3 s); `musicEnvelope()` + `react()` make the gate glow pulse with the actual kick.
- Type with system fonts only (Hiragino Mincho, Georgia italic, Helvetica Neue caps, monospace): weight, scale, tracking and one accent colour do all the work.

## Stumbles (library gaps this piece ran into)
1. **Seek bug in 3D cards [BUG, fixed after this piece was written].** After a jump-seek (`gotoFrame`, `snapshot`, `contactSheet`), a 3D card whose children's `trimEnd` changed is not redrawn, so a review picture can show a gate half drawn or missing. Playing forward and the export were right. Cause: a card is drawn into its texture before the stage is, but the shapes inside it were only brought up to the playhead after that, so every card showed the previous frame (the piece's gate lines were missing in the review pictures). Fixed in `Movie._updateSpace`.
2. **`trimEnd` across subpaths [GAP].** One `path` with several subpaths stops short of the later ones: each subpath needed its own layer.
3. **Stretched glows in 3D [GAP].** A radial gradient on a very elongated ellipse in a 3D layer gives a hard-edged band; a stretched circle works.
4. **One mask per layer, none shared [GAP].** Cutting the 日 out of the glyph needed polygon masks measured by rendering the glyph and reading pixels. A way to colour part of a glyph, or a glyph-component mask, would help.
5. **Camera paths [GAP].** An accelerating rush had to be sampled into per-frame keyframes, with the time each gate must disappear computed by hand (the library warns when a layer is behind the camera). A spline path for the camera and quiet culling of layers behind it would remove a lot of code.
6. **No built-in grain [GAP].** A noise image generated at load and jittered with per-frame `set` keyframes.
7. **`fillGradient` cannot be animated [GAP].**
8. **Music [GAP].** No way to choke a reverb tail or mark a hard stop (two layers instead), and no koto, shakuhachi or taiko voices.
9. **`wiggle()` shares no property [GAP].** A handheld camera shake collides with the camera's own move on the same property.
