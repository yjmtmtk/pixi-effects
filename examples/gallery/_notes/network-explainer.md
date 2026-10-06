# network-explainer — stumble notes
Model: opus   Cycles: 5   Result: works

## Went smoothly because the docs said so
- `{value}` counter + `format` worked on the first try; `anchorX: 1` on the text kept the ms counter right-aligned while digits were added. A `fill` keyframe on the same text layer (turn teal when the page loads) worked too.
- "Array geometry (line endpoints, path `d`) is baked at build time" in dsl.md told me up front that I could not grow a line. A `path` with a `mask` rect whose `width` grows from a fixed edge (`anchorX: 0`, or `anchorX: 1` for right-to-left) did the draw-on, as the mask notes describe.
- Pitfall 6 (drive locked things from one JS easing function with per-frame keyframes) was exactly right. Packet x/y, the comet tail and the mask width all come from one `easeIO(u)` sampled every frame, so the line tip stays under the packet. Because I mirror gsap's `power2.inOut`, the counter could use the gsap ease directly and still stay in step.
- Line/polygon/path in plain canvas coordinates (no x,y) meant arrowheads could be computed in JS as three absolute points. No anchor maths needed.
- `composition` with `pivotX/pivotY` = centre made each node (circle + icon) scale-pop as one unit. Line/path children of a composition use the composition's local coordinates, as I expected.
- The audio-shorter-than-layer warning named the asset length (0.1 s), so the fix took one edit.
- Export: `movie.render({ format: 'mp4' })` → 1,259,893 bytes in 8.2 s for 14 s of video, `__logs` stayed `[]`.
- `inspect` reported no issues at 10 frames. `contactSheet({ times })` + `snapshot` were enough to judge everything.

## Stumbles
### 1. One-shot SFX layers warn when the layer is longer than the clip   [SPEC-ODD]
- tried: `{ type: 'audio', asset: 'pop', at, duration: 0.6 }` for a one-shot click (intent: play once, then silence).
- happened: `pixi-effects: layer "pop-0": audio asset "pop" is 0.1s but the layer lasts 0.6s, so it goes silent after 0.1s. Add loop: true, or shorten the layer's duration.` (×8 layers)
- cause: the warning is designed for BGM. For a sound effect, "goes silent afterwards" is the intent. I had to look up every SFX length (0.1 / 0.3 / 0.6 s) through the warnings.
- would have prevented it: list the `_assets` durations in the BRIEF/cheatsheet. Or skip the warning when the layer has no explicit `duration`, so one-shots can omit it. Without `duration` an audio layer probably defaults to the parent's duration, which would also warn, so an `oneShot: true` flag or "duration defaults to the clip length for audio" would help.

### 2. No "draw-on" / trim-path for strokes   [GAP]
- tried: looking for a `trim`/`progress`/`dash` prop on `line`/`path`.
- happened: none exists. I used mask reveal + per-frame sampled packet keyframes (~25 keyframes × 4 layers per hop).
- cause: array geometry is baked at build time.
- would have prevented it: a `strokeProgress` (0–1) animatable prop on line/polygon/path. Along with a `followPath: { d, progress }` for a dot, this is the core of every explainer/diagram piece. A mask works only because my arcs are monotonic in x. An S-curve or a loop could not be revealed with a rect mask.

### 3. Badge swap needed manual "exit when the next badge appears" logic   [MY-MISTAKE]
- tried: a "CACHED" pill above the CDN node, later a "HIT" pill at the same spot.
- happened: the wider CACHED pill showed behind the narrower HIT pill as a ring (layers are hidden, not removed, and keep their last values).
- cause: my own logic only looked ahead within the EVENTS list; the HIT badge was added separately. Fixed by pushing HIT into EVENTS so the exit keyframe is generated.
- would have prevented it: nothing in the library. `inspect` flags overlapping text but not text over a shape. A "shape fully covered by another shape at the same position" hint would have caught it.

### 4. First layout put status badges and arc labels on the same row   [MY-MISTAKE]
- tried: badges above the nodes, hop labels above the arc peaks, same y.
- happened: `render 15 ms` pill touched `forward +38 ms`. `inspect` did not flag it because one is a shape-with-text and they barely touch.
- fix: moved the badges under the node labels. The sheet tile made it obvious, the issue list did not.

### 5. Sampled keyframes: `set` first, then per-frame `to`   [GAP]
- tried: writing the "sample a curve" helper. It is easy, but every author will write it again (the pitfall says "sample into short linear keyframes" with no code).
- would have prevented it: a `sampled(duration, u => props, { ease })` helper exported next to `orbit()`, or a recipe. See below.

## Wished the library had
- `strokeProgress` (trim path) on line / polygon / path, animatable.
- A motion-path helper: `alongPath({ d | points | quadratic, duration, ease })` → x/y keyframes (orbit() already does this for circles).
- One-shot audio: an audio layer's `duration` defaults to the clip length (or `oneShot: true`) so SFX don't need their length looked up.
- `inspect` that also reports text overlapping filled shapes (pills, bars) that are not its own background.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
Packet along a curve, with the line drawn on behind it (stays locked because both come from one eased function):
```js
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // = gsap power2.inOut
function sampled(dur, fn, lag = 0, FPS = 30) {                                    // fn(u) -> props, per frame
  const n = Math.round((dur + lag) * FPS), step = 1 / FPS, kfs = [{ at: 0, set: fn(0) }];
  for (let i = 1; i <= n; i++) kfs.push({ at: (i - 1) * step, to: fn(easeIO(Math.min(1, Math.max(0, (i * step - lag) / dur)))), duration: step, ease: 'none' });
  return kfs;
}
const p0 = [250, 311], c = [490, 241], p2 = [730, 311];                          // quadratic arc, left -> right
const at = u => [(1-u)**2*p0[0] + 2*(1-u)*u*c[0] + u*u*p2[0], (1-u)**2*p0[1] + 2*(1-u)*u*c[1] + u*u*p2[1]];
return [
  { type: 'shape', shape: 'path', d: `M ${p0} Q ${c} ${p2}`.replaceAll(',', ' '), initial: { strokeColor: '#f0533f', strokeWidth: 3.5 },
    mask: { type: 'shape', shape: 'rect', width: 0, height: 160, anchorX: 0, initial: { x: p0[0] - 8, y: 300, fillColor: '#fff' },
            keyframes: sampled(0.8, u => ({ width: at(u)[0] - p0[0] + 8 })) } },
  { type: 'shape', shape: 'circle', radius: 9, duration: 0.85, initial: { x: p0[0], y: p0[1], fillColor: '#f0533f' },
    keyframes: sampled(0.8, u => ({ x: at(u)[0], y: at(u)[1] })) },
];
```
(Rect mask reveal works only when the curve is monotonic in x. Otherwise you need a trim-path feature.)
