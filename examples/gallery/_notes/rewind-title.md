# rewind-title — stumble notes
Model: fable   Cycles: 4   Result: works

Concept: a title card ("AGAIN.") is built, rewound like a tape, held on an empty frame, and replayed in slow motion so the lock-up lands.
One composition `act` carries the whole title in its OWN seconds (0 … 4.5); the outer composition drives its clock with `time` keyframes
(play 0 → 2.2, hold, rewind to 0 with `power2.in`, hold, replay 0 → 4.5 over 6 s with `cubic-bezier(.2, .8, .2, 1)`). The on-screen display
(▶ PLAY / ❚❚ / ◀◀ REW / ■ STOP), a frame counter, the VHS snow and the tape-motor riser live in the MOVIE's time and are never rewound.

Measured: `window.__logs` = `[]`; `movie.inspect` at 17 frames: no issues; `inspectAudio`: no issues, −22.1 LUFS, true peak −9.6 dBFS,
0 clipped samples; loudest 0.1 s window at 6.6 s (the ring completes: chime + pop + riser end, −9.6 dBFS); quietest at 8.9 s (the hiss floor,
−47.8 dBFS rms); in the rewind window (2.7–4.0 s) ten sources are heard (the bar swoosh, five hits, the stop pop, the rule swipe, the motor,
the hiss), rms rising from −47 to −20 dBFS, peak −9.9 at 3.9 s. `render({ format: 'mp4' })` → 4.33 MB (4 543 103 bytes), 3.0–6.3 s.

## Went smoothly because the docs said so
- The recipe `rewind-and-replay` was copyable: the five `time` keyframes ran first try, with zero warnings, in every seek order (contact sheet, snapshots, export).
- "The composition's own x / alpha keyframes stay in the outer time": a `wiggle({ at: 2.7, duration: 1.3 })` on `act.x / y` next to the `time` keyframes gave a tracking jitter that only exists while the tape rewinds. Mixing `time` keyframes and ordinary keyframes in one list works (the docs do not say so, but it did).
- "A sound or `sfx` inside follows the clock": `inspectAudio()` shows the bar's swoosh heard 0 → 4.57 s (forward, backward during the rewind, again in the replay), and the hits stacked and reversed at the end of the rewind (−9.9 dBFS at 3.9 s). No `pitch` tricks needed.
- `cubic-bezier(.2, .8, .2, 1)` was accepted as written (no "malformed" warning) — but see stumble 1.
- A `null` rig with `pivotX / pivotY` INSIDE the remapped composition (children keep absolute coordinates, the rig scales about the block's centre) works; the push of 1.035 over act 2.6 → 4.5 is only reached during the slow replay, exactly as the local-seconds rule promises.
- `splitText` / `measureText` with Arial Black 196 px; `trimEnd` for the rule; `shape: 'arc'` + a rect hand (`anchorY: 1`, `rotation` 0 → 360) for the clock; `set: { text }` × 329 keys for the frame counter; `grain` on an additive dark rect for TV snow; `repeat` + `yoyo` for the blinking REW label. All first try.
- The "an sfx lasts 0.02–10s (got duration 11); using 10" warning told me exactly what to do (two 5.5 s hiss layers).

## Stumbles
### 1. `cubic-bezier(.2, .8, .2, 1)` is not "slow": where the glide lands is a matter of numbers the docs do not give   [GAP]
- tried: the recipe's replay: 4.5 s of act over 6 s with that curve, "so the final lock-up arrives slowly and settles; the last ~0.4 s is the held end frame".
- happened: the curve does 50 % of the change in the first 13 % of the duration, 80 % at 27 %, 99 % at 78 %. In outer time: the first 1.9 s of the act (bar + six letters) replay in 0.6 s — FASTER than the original, 3× — the ring completes at 6.6 s, and the frame is practically still from ~8 s: the "held end frame" is 3 s, not 0.4. The contact sheet at 7 / 8 / 9.5 / 10.9 is four identical tiles.
- cause: dsl.md "Easing" and the cheatsheet say only "`'cubic-bezier(.2, .8, .2, 1)'` a fast start with a long glide"; recipes.md "the slow replay that lands". Nothing quantifies the curve, and "fast start" hides that the start is faster than real time.
- worked around: moved the only motion that may be slow into the LAST tenth of the act (a halo growing from the accent dot to the ring's size and dissolving, act 4.1 → 4.5, which the glide spreads over outer 6.9 → 10.4 s) and a 3.5 % push on the rig. The chime, pitched down by the slowing clock, is the sound of the tape coming to rest.
- would have prevented it: after the doc line, add: "it is not slow motion throughout: over 6 s it covers half the content in the first 0.8 s and 99 % by 4.7 s, then holds. Whatever sits at the END of the content is what gets the glide: put the beat that should land slowly in the last 10–20 % of the content, and expect the start to run faster than real time. A shorter tail: `cubic-bezier(.2, .8, .5, 1)`." A tiny x → y table for the two example curves (or a pointer to `check --onion`) would settle it in one glance.

### 2. GSAP's `power2.in` is cubic, so the middle of the rewind shows only 12.5 % undone   [GAP]
- tried: the brief wanted the middle of the rewind to show the title half dismantled. I computed act time at 3.9 s as 2.2·(1 − 0.923²) = 0.33 s and saw 0.47 s (letter A at 92 % of its drop; a faint "G" at alpha 0.11 that I first took for a stray circle).
- cause: GSAP numbers its powers from 1: `power1` = t², `power2` = t³, `power4` = t⁵. Neither the cheatsheet nor the pitfalls say so, and the recipe uses `power2.in` for the rewind.
- consequence: with any cubic-in, the middle of the rewind has undone 12.5 % of the act; the dismantling bunches in the last third (my half-built frame is at 3.7 s, 77 % through the rewind). I moved the letters later in the act (0.5 … 1.9 s) so that frame exists at all.
- would have prevented it: one line next to "power2.in accelerates": "GSAP's `power1` is quadratic, `power2` cubic, `power4` quintic: `power2.in` has done 12.5 % at half time". (pitfall 7 already warns about `expo.in` the same way.)

### 3. A sound that outlives the clock's reach is reported "cut off by the end of the movie"   [GAP + misleading warning]
- tried: the chime (1.4 s) at act 4.0, the clock gliding to 4.5 and holding there from 10.4 s.
- happened: `inspectAudio().issues`: `layer "sfx-chime" (sfx "chime") is cut off by the end of the movie at 11s (it runs to 11.00s)`. Also `notes`: silent from 8.18 s (the clock is so slow that the chime's tail is sub-threshold long before the hold).
- cause: the clock never reaches act 4.5 + 0.9 s; the held clock is silence. The message blames the movie's end; nothing in the Time section says what a stopped clock does to a sound inside, nor that an sfx running past the farthest `time` is reported.
- worked around: `duration: ACT − SETTLE_AT` (0.5 s) on the chime: the sfx is regenerated shorter and ends exactly where the clock stops. Clean (no issue, no silence note).
- would have prevented it: in dsl.md "Time" / pitfall 69: "a sound inside the composition is silent while its clock stands still; an sfx that runs past the farthest `time` the clock reaches is reported as cut off: give it a `duration` that ends within reach". And the warning should name the clock: "runs past the farthest time 'act' reaches (4.5 s)".

### 4. What children of a `time`-keyframed composition default to, and the boundary trap on a held frame   [GAP]
- the cheatsheet says "with `speed: 2` the content is twice as long as `duration`, so children default to that length" — nothing for `time` keyframes. I gave every child `duration: ACT + 2 − at` without testing the default.
- a layer whose life ends EXACTLY at the held `time` (`duration: ACT − at`) is hidden on the hold, since the lifespan is `[at, at + duration)`: the lock-up would vanish on the end frame. I avoided it by design (the +2), so this is reasoning, not a measurement; pitfall 69's "to freeze, hold `time` at one value" should carry the warning.
- would have prevented it: "under `time` keyframes children default to … ; make a child that must be on a held frame outlive the held value".

### 5. `inspectAudio` for remapped sounds: one span per layer, and `peakDb` is the mix's   [GAP]
- `sources[i].start / end` for a sound inside `act` is the hull of all its passes (the bar swoosh: 0 → 4.57 s; it is heard three times, forward, backward and in the replay); `sources[i].peakDb` was −13.5 for almost every layer, then −9.9: it is the mix's peak within that span, not the layer's own (`sound.peakDb` is the preset's). The cheatsheet line `sources[i] = { layer, start, end, peakDb, sound: {...} }` does not say either.
- would have prevented it: name the fields ("`peakDb`: the mix while this layer plays"), and for a remapped layer list the passes (the check's `cues`), or say "the span of every pass".

### 6. Snow with `grain`: no numbers   [SPEC-ODD, small]
- a `grain` filter on an additive rect is TV snow (nice), but `amount: 0.7` on `#17171c` whitewashed the whole frame; `amount: 0.32` on `#0d0d11` with the rect's `alpha` ramping 0.35 → 1 (`power2.in`, with the tape speed) is right. Alpha keyframes on a filtered + blended layer work. One line ("snow = grain on an additive dark rect, amount ≤ 0.35") would save a cycle.

### 7. An sfx is at most 10 s   [docs, minor]
- the cheatsheet says `duration` "stretches" an sfx and gives no maximum; an 11 s hiss bed warned (clearly) and was cut to 10. Two 5.5 s layers with different `seed`s fixed it. Also undocumented: a custom voice's `filter.freq` as `[2200, 2200]` with `envelope: 'hold'` makes a steady hiss (works; whether a single number is accepted I did not try).

### 8. Tooling   [TOOLING]
- `agent-browser eval --stdin` has no top-level `await` (the skill's example suggests it does): wrap in `(async () => { … })()`.
- `inspect().layers[i].bounds` is `{ x, y, width, height }`, not an array (my mistake, but the cheatsheet says "canvas bounds" only).

## Wished the library had
- A one-line `ease` probe: `easeTable('cubic-bezier(.2,.8,.2,1)')` → progress at 10 / 25 / 50 / 75 / 90 % (or the x → y table in the docs).
- A clearer warning for a sound that outlives a composition's clock, and `inspectAudio` cues per pass for remapped sounds.
- A documented default life for children of a `time`-keyframed composition.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// a VHS on-screen display in the OUTER time, over a composition whose own clock is rewound (▶ PLAY / ❚❚ / ◀◀ REW / ■ STOP + a frame counter)
const osd = (name, text, at, duration, extra = {}) => ({ type: 'text', name: 'osd-' + name, text, at, duration,
  style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 24, fill: '#f2efe8', letterSpacing: 4 }, initial: { x: 64, y: 48, anchorY: 0.5, alpha: 0.55 }, ...extra });
const rew = osd('rew', '◀◀  REW', 2.7, 1.3, { style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 26, fontWeight: 'bold', fill: '#ff4d3d', letterSpacing: 4 },
  initial: { x: 64, y: 48, anchorY: 0.5, alpha: 1 }, keyframes: [{ at: 0, to: { alpha: 0.25 }, duration: 1.3 / 12, repeat: 11, yoyo: true }] });   // 12 half-blinks = the rewind
const tc = f => `00:${String(Math.floor(f / 30)).padStart(2, '0')}:${String(f % 30).padStart(2, '0')}`;
const timecode = { type: 'text', name: 'timecode', text: tc(0), style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 24, fill: '#f2efe8', letterSpacing: 4 },
  initial: { x: 1216, y: 48, anchorX: 1, anchorY: 0.5, alpha: 0.55 }, keyframes: Array.from({ length: 11 * 30 - 1 }, (_, i) => ({ at: (i + 1) / 30, set: { text: tc(i + 1) } })) };
// TV snow for the rewind only: grain on an additive dark rect, thickening with the tape speed
const snow = { type: 'shape', shape: 'rect', name: 'snow', width: 'GW', height: 'GH', at: 2.7, duration: 1.3, blendMode: 'add',
  initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0d0d11', alpha: 0.35 }, filters: [{ type: 'grain', amount: 0.32, size: 1.8, fps: 30, seed: 3 }],
  keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1.3, ease: 'power2.in' }] };
// the settle that survives a long glide: whatever sits in the LAST tenth of the content gets the slow motion
// (act 4.1 → 4.5 under cubic-bezier(.2,.8,.2,1) over 6 s spreads across outer 6.9 → 10.4 s)
const halo = { type: 'shape', shape: 'circle', name: 'dot-halo', radius: 7, at: 4.1, duration: 2.4,
  initial: { x: 1040, y: 350, strokeColor: '#ff4d3d', strokeWidth: 2, strokeAlpha: 0.7, scale: 1 },
  keyframes: [{ at: 0, to: { scale: 6, strokeAlpha: 0 }, duration: 0.4, ease: 'none' }] };
```
