# kanreki-cycle - usability notes
Model: opus   Slot: S12-celebration   Cycles: 8 (edit / look)   Result: works
Timeline: started 12:51; brief.md written +3; first page that rendered at +4 min; first contact sheet looked at at +4; done at +10 (13:01). Final check: 15 s wall clock including the export.

Concept: a 還暦 (60th birthday) greeting. The sixty names of the sexagenary calendar stand in a ring; one vermilion line travels from 丙午 1966 round to 丙午 2026 (2026 really is a 丙午 year again) while the year counts and its name changes underneath; when the ring closes the dial steps aside and 還暦 / おめでとうございます appears. Poster 11 s.

## Went smoothly because the docs said so
- AGENTS.md (WebFetch) -> quickstart -> SKILL.md: short, clear path; `npx --no-install pixi-effects new kanreki-cycle` gave a working page at once.
- `help arc` (pitfall 51): 0 deg = 3 o'clock, clockwise, `innerRadius` for a donut slice. The progress line worked first time as an arc with an animated `endAngle`.
- `help counter`: `{value}` + keyframed `value`; it shares the line's `sine.inOut` so number and line agree.
- `help null`: a null `ring` carrying 60 labels, the arc, the counter and a chained null `hand` (the line's head) - the whole dial slides aside with one keyframe. Chaining nulls worked exactly as documented.
- `help music`: the token table was enough to write a 5-bar score without a recipe; the `check` music read-back (bars per track, beat positions) confirmed that every track adds up to 20 beats. Very reassuring.
- Cheatsheet line on `set: { text }` keyframes: 60 discrete swaps for the year name worked first time.
- Volume keyframe with negative `at` (fade the last 1.6 s of the music) worked as documented.
- `check --no-export --at a,b,c` plus `frames/*.png` at full size: 3-6 s per look. This is what made 8 cycles in 10 minutes possible.

## Stumbles   (one entry each, also small ones)
### 1. No "current value" in a keyframe expression   [GAP]
- tried: a helper `rise()` writing `from: { y: 'y + 16' }, to: { y: 'y' }` so I would not repeat each layer's y.
- happened: `warn: pixi-effects: expression failed: y + 20 undefined variable: y` (four of them). The warning names the unknown variable but does not list which names ARE available (W H GW GH w h t d T, vars), nor suggest writing the number. Side effect: with the failed expression the layers all sat at y 0, which made `check` report three spurious text overlaps - the overlap list was a symptom, not the cause.
- cause: expressions know `W H GW GH w h t d T` and declared vars, not the layer's own props.
- would have prevented it: the warning could add "known names: W, H, GW, GH, w, h, t, d, T and your vars; a layer's own x / y are not names - write the number". (Or support `x` / `y` = the layer's initial value inside keyframes: a relative "from 16 px below" is the most common entrance.)
### 2. Counter rounding vs. a value-matched text swap   [GAP, small]
- tried: switching the year-name caption at the moment the line passes year k (`passAt(k)`).
- happened: at 7.4 s the counter already read 2026 while the caption still said 乙巳 (2025).
- cause: `{value}` with `decimals: 0` rounds to nearest (not floor), so the number changes half a step early. Not documented in `help counter`.
- would have prevented it: one phrase in the Counters section: "the number is rounded to the nearest (2025.5 shows 2026)".
### 3. First draft overlapped the moving dial with the title   [MY-MISTAKE]
- the title entered at 8.125 s while the dial was still sliding until 8.95 s. `check` flagged "title and name11 overlap" - useful, it pointed to the exact frame (248).

## Docs I read, and which answered my question
- AGENTS.md (WebFetch: the fetch tool only gave a summary, but enough), `reference/quickstart.md`, `SKILL.md`: answered the workflow.
- `help arc`, `help counter`, `help music`, `help sfx`, `help null`, `help expressions`: all answered except "can a keyframe refer to the layer's own y" (help expressions lists the names, so the answer "no" was there by omission).
- Did not need a recipe, `pitfalls.md` or `cheatsheet.md` beyond what `help` printed.

## Wished the library had
- Relative keyframe values (`from: { y: '+16' }` or `'y + 16'` meaning "initial y + 16") for entrances.
- Text laid out along a circle (`textOnPath` / a `ring` helper): I computed 60 positions and rotations by hand (easy here, but it is the third piece that needs it).
- A way to express "this event happens when that keyframe reaches value v" (I inverted sine.inOut by hand to light each label when the line passes it). A small exported `easeInverse(name, p)` or `timeAtProgress()` would make syncing to an eased sweep trivial.

## Critique rounds (process slot)
Round 1 (first sheet, 12:55):
- 0-7.5 s: right half empty for 8 s except a tiny kicker, the dial sat left with dead space -> the dial now starts centred (null `ring` at x 640) and steps aside at 7.6 s.
- 7.5 s: the closure had no event (the head just vanished) -> a hairline ripple + chime.
- whole: -19.7 LUFS, quiet for web -> music volume 1.3 (now -16.2 LUFS, -3.1 dBTP).
Round 2:
- 8.3 s: 還暦 entered while the dial was still moving and overlapped its labels (check flagged frame 248) -> slide shortened to 1.0 s, greeting from 8.75 s.
- 7.7 s: the outward ripple cut through the ring of names like a strike-through -> ripple runs inward, into the empty centre.
- 0-2.5 s: unlit names at alpha 0.26 almost invisible on the sheet -> 0.34.
Round 3:
- 2.5-7.5 s: the payoff (2026 is 丙午 again) was not readable, because nothing showed that 1966 was 丙午 -> a caption under the counter shows each year's name as it passes (丙午, 丁未 ... 丙午).
- 7.4 s: caption one year behind the counter (rounding, stumble 2) -> switch at passAt(k + 0.5).
Round 4:
- 11.9-12.5 s: the last bell struck at 11.9 s and was cut by the end -> bell chord on beat 16 (10 s) and a 1.6 s fade of the music.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The labels in the lower half of the dial are upside down (true to a printed dial, but harder to read); I would try orienting the lower half inward or test a version where only the passed labels stay bright.
2. The first 0.6 s is near black and the first 2.5 s is static waiting for the sweep; I would start the line a beat earlier or give the dial a slow assembling motion (names arriving from slightly larger radius).
3. The closing moment is subtle (inward hairline + chime); a single stronger visual beat - e.g. the 丙午 label at the top swelling into the centre 丙午 (a real move along the radius) - would tie the two 丙午 together physically instead of with a crossfade.
