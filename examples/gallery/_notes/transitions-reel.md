# transitions-reel — stumble notes
Model: opus   Cycles: 6   Result: works

## Went smoothly because the docs said so
- The scene-overlap formula (scene i alive until the next transition has finished) from pitfalls #4 / the slideshow recipe; I computed each scene's lifespan as `[S_k, S_{k+1} + T_{k+1})`.
- `examples/07-transitions.html` showed that wrapping each scene in a named `composition` makes the whole scene (background + type) transition as a unit.
- dip "shows whatever is behind" was stated in the docs, so I put one persistent ink rect under all scenes for a dip-to-ink.
- All seven transition kinds worked first time with the field names from the cheatsheet (`direction`, `mode`, `fromScale`, `scale`, `seed`, `smoothing`); first run had `__logs: []`.
- `contactSheet({ times, columns, cellWidth })` + `save-image.py` made every check one command; `inspect(f, { layers: 'none' })` over 16 frames in one eval.
- Measuring per-letter widths with a 2D canvas `measureText` (same font string) to lay out "D I P" as separate layers worked well — no guessing of Arial Black glyph widths.

## Stumbles
### 1. A rect that grows from `width: 0` with `anchorX: 0` is not drawn after a seek   [LIBRARY-BUG]
- tried: wipe-scene stripes `rect(..., width: 0, initial: { anchorX: 0 }, keyframes: [{ at: 0.25, to: { width: 1280 }, duration: 0.7 }])`.
- happened: playing / stepping frame-by-frame is fine, but `gotoFrame(70)` (before the stripes start, width 0) followed by `snapshot(114)` (width 1280) draws NOTHING for those stripes. Same in a contact sheet whose previous tile was mid-wipe (two of three stripes missing). `inspect(114)` still reports them `visible: true` with full bounds `{x:0, width:1280}`, so inspect can't catch it. No warning.
- cause (guess): the geometry is not rebuilt when a seek jumps from width exactly 0 to a large width with a non-centre anchor; centred rects (`anchorX` 0.5, width 0 → 860) in the same piece were fine after the same kind of jump.
- workaround: start at `width: 0.01`.
- would have prevented it: a fix; until then a pitfalls line "grow-from-zero shapes: start at 0.01, not 0". A scrubbing user would see stripes pop in and out.

### 2. `inspect` reports every mid-transition frame as broken   [SPEC-ODD]
- tried: `inspect(f, { layers: 'none' })` at the middle of each transition, as the BRIEF / SKILL ask.
- happened: `text layers "scene1/s1-word" and "scene2/s2-word" overlap by 93%`, `"scene3/s3-word" is cut off by the canvas edge: 570px beyond the left edge` (slide), `"scene6/s6-label" is entirely outside the canvas` (zoom-in from scale 3) … all expected: two scenes overlap by design during a crossfade/wipe/iris/dissolve and slide/zoom move text off-canvas.
- cause: inspect does not know that `from`/`to` of an active transition are meant to overlap / leave the frame.
- would have prevented it: inspect could skip (or tag `"(during transition crossfade scene1→scene2)"`) issues between the two layers of a running transition and the off-canvas reports for slide/zoom. As is, real issues in mid-transition frames are buried in noise; I only trusted the rest frames (all `[]`).

### 3. Iris default edge softness looks blurry for flat graphics   [GAP]
- tried: `{ kind: 'iris', mode: 'in' }` with default `smoothing` (0.02).
- happened: at 720p the expanding circle had a visibly soft ~15 px blurred rim — wrong for a flat-colour design (wipe's 0.02 also looked soft; I used 0.01).
- cause: smoothing is a 0..1 fraction of the frame, so 0.02 ≈ 15–25 px.
- would have prevented it: docs saying "fraction of the canvas; 0.02 ≈ 20 px at 720p — use ~0.004 for a crisp, hard edge".

### 4. Exported MP4 is 421 frames / 14.08 s for `duration: 14`   [SPEC-ODD]
- tried: `movie.render({ format: 'mp4' })`, then `ffprobe`.
- happened: `nb_frames=421`, container duration 14.08 s (expected 420 frames / 14.00 s). No warning. Probably the frame at t = duration is included (inclusive end).
- would have prevented it: a note in docs/api.md on whether the end frame is inclusive, or exporting exactly `duration × frameRate` frames.

### 5. The bundled audio is mixed very quietly   [GAP]
- tried: bgm at volume 0.55 + swooshes at 0.45 (the recipe uses 0.8).
- happened: export measured mean −42 dB / peak −21.6 dB; at bgm 0.9 / sfx 0.7 still mean −37.9 dB / peak −17.7 dB. Not a bug, but nothing tells you the levels; I measured with ffmpeg `volumedetect`.
- would have prevented it: one line in recipes ("the sample assets peak around −18 dB; volume > 1 is / is not allowed") — I did not know whether `volume: 1.5` is legal, so I stayed ≤ 1.

## Wished the library had
- A transition-aware `inspect` (see #2): `inspect(f, { ignoreTransitions: true })` or tagging issues as "during transition".
- `scaleX`-style "grow from an edge" sugar for rects (`grow: 'left'`), so one never animates `width` from 0 (see #1).
- A per-transition hook to hang a caption on (e.g. `caption: '…'` drawn during/after the window) — every scene here needed the same chip+caption pair built by hand.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
Chain N scenes with a list of cuts that each have their own length (not one fixed T): compute the start times once, and each scene lives until the next cut has finished.

```js
const CUTS = [
  { kind: 'crossfade', duration: 0.6, ease: 'sine.inOut' },
  { kind: 'wipe', duration: 0.5, ease: 'power2.inOut', direction: 'left', smoothing: 0.01 },
  { kind: 'iris', duration: 0.6, ease: 'power2.inOut', mode: 'in', smoothing: 0.004 },
  // …
];
const snap = t => Math.round(t * 30) / 30, HOLD = 1.0;
const S = []; { let t = 1.2; for (const c of CUTS) { S.push(snap(t)); t += c.duration + HOLD; } }
const sceneAt  = k => (k === 0 ? 0 : S[k - 1]);
const sceneEnd = k => (k < CUTS.length ? snap(S[k] + CUTS[k].duration) : DURATION);
// scene(k) = { type: 'composition', name: `scene${k}`, at: sceneAt(k), duration: sceneEnd(k) - sceneAt(k), width: W, height: H, sequences: [...] }
const transitions = CUTS.map((c, i) => ({ ...c, from: `scene${i}`, to: `scene${i + 1}`, at: S[i] }));
```

Per-letter layout without guessing glyph widths:

```js
const ctx = document.createElement('canvas').getContext('2d');
ctx.font = `900 330px "Arial Black", Arial, sans-serif`;
const widths = [...'DIP'].map(ch => ctx.measureText(ch).width);
let x = W / 2 - widths.reduce((a, b) => a + b) / 2;
const letters = [...'DIP'].map((ch, i) => { const cx = x + widths[i] / 2; x += widths[i];
  return { type: 'text', text: ch, style: { fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: '900', fontSize: 330 },
           initial: { x: cx, y: 300, anchorX: 0.5, anchorY: 0.5 } }; });
```
