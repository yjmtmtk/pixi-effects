# route-atlas - usability notes
Model: opus   Slot: S15-route-map   Cycles: 10   Result: works
Timeline: started 12:52; brief.md written at +5 min; first page rendered and first contact sheet looked at at +6 min (12:58, no warnings first time); done at +17 min (13:09)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md was a short, clear path; `pixi-effects new` wrote a working page at once.
- `help trimEnd` answered both draw-on AND dashes ("there is no dash option; write alternating sub-paths") in one print; that is exactly the route-map need.
- `help followPath` said it walks by arc length with an `ease`, so a marker can ride a `trimEnd` head with the same ease/duration.

## Stumbles   (one entry each, also small ones)
### 1. The first page rendered with no warnings at all   [none, a positive]
- tried: ~300 lines of generated geometry (polar-noise islands, contours, depth lines, cubic legs, dash sub-paths, followPath per leg, a nested composition, text halos via `stroke: { color, width }`).
- happened: first `check` = `warnings none`, `RESULT: OK`, picture as intended. Nothing to fix from the library side.

### 2. Paper fill at partial alpha over the water read as muddy grey   [MY-MISTAKE]
- tried: coast `trimEnd` draw-on with the land `fillAlpha` fading in at the same time.
- happened: at 1.1 s the islands were grey ghosts before their coastlines closed.
- cause: alpha-blending a warm paper over a cool blue = grey. Fixed by starting the fill after the coast closes.
- would have prevented it: nothing the library could know; the contact sheet caught it immediately (good).

### 3. Coast features ("cape", "bay") came out much weaker than the numbers suggested   [MY-MISTAKE]
- my own geometry, not the library. Mentioned only because the check's `--at` frames are what showed it.

### 4. Routes crossing land   [MY-MISTAKE]
- two ferry legs cut over island corners; only visible at full size (`check-out/frames/*.png`), not in the 480-px sheet tiles. Cropping the frame PNG with PIL was the only way to judge a 1-px coastline vs a 2.4-px dash.
- would have prevented it: a `check --at 4.3 --zoom x,y,w,h` (a crop at 2x) would save the PIL step.

### 5. Does trimEnd on a dashed multi-sub-path follow the same progress as followPath on the continuous curve?   [GAP, small]
- tried: the ferry is drawn as dash sub-paths (trimEnd), the traveller dot uses followPath on the continuous curve with the same ease and duration.
- happened: they stay within one dash of each other (checked at 4.3 s and 8.1 s, cropped). The docs say sub-paths are "walked in order as one length" but not whether the gaps count; with even dashes it does not matter, with uneven ones it would.
- would have prevented it: one sentence in `help trimEnd`: "gaps between sub-paths are not counted" (or are).

## Critique rounds (process slot)
- Round 1 (first render, 10.4 s frame): (a) islands were scalloped cookies, all the same shape and size; (b) ferry leg 4 ran down over island B's east coast, leg 2 started with a hook at 02; (c) the 03 index sat on the coastline; (d) `20 KM` of the scale bar reached x=1238, inside the outer 5 %; (e) the bottom centre was empty water with no map vocabulary. Fixes: new island generator (strong low harmonics, weak mid, fine crinkle, Gaussian capes/bays), labels with a halo (`style.stroke` in water or paper colour), scale bar moved 30 px left, a sea name 凪ノ瀬戸 / Nagi Strait in spaced Mincho + Georgia italic.
- Round 2 (sheet): (a) 1.1 s grey ghost fills (stumble 2); (b) 霧ノ浦 and 遠音 had a WATER halo over land = blue boxes; (c) 9.4-12 s the map was frozen for 2.6 s; (d) mix -22.7 LUFS, too quiet even for a quiet piece. Fixes: fill after coast, paper halo / label moved to water, the map composition now settles from a west-weighted 1.1x framing to the full sheet over 0-10.2 s (lands as the summary appears), score volume 0.55 -> 0.95 (-18 LUFS).
- Round 3 (10.4 s, 4.3 s, 8.1 s crops): (a) ferry leg 2 crossed island A's east lobe; (b) an islet sat on its new path; (c) leg 4 still grazed B's north-east corner at the inlet. Fixes: leg 2 rerouted round the east cape, islet moved north of A, leg 4 leaves the inlet northward first.
- Round 4 (2.4 s, 10.4 s): (a) both road legs were smooth Bezier arcs, reading like flight paths rather than roads, too similar to the ferry arcs. Fix: roads meander (a tapered sideways sine along the curve), followPath uses the same polyline so the dot stays on the road.

- Round 5 (full check, sheet + waveform.png): (a) the bells on the arrival beats were buried under the pad (flat waveform, no bumps at 1.5 / 3.0 / 5.25 / 6.75 / 9.0 s); (b) the music was cut in the last 0.3 s instead of ending; (c) the ferries left in silence. Fixes: pad 0.7 -> 0.5, bell 0.5 -> 0.95 (the waveform now shows a peak on each arrival), a `vol` ramp to 0 over beats 13.5-16 on pad and sub (a 2 s fade into the end), a low dark `swoosh` (pitch -9, brightness -0.8) on each ferry departure.
- Round 6 (2x crops of the 10.4 s frame, 0.6 s frame): (a) `20 KM` was not centred on its tick; (b) 0-0.5 s was an empty blue field; (c) after adding meridian labels, the third one hung past the right edge at 0.4 s because the map composition starts at 1.1x. Fixes: scale-bar label anchor, a faint graticule that draws on first (3 meridians, 2 parallels, alpha 0.1), meridian labels right-aligned to their line so they stay inside the frame through the whole settle.

### 6. A label hanging off the frame during a scaled composition was not reported   [GAP, small]
- tried: meridian labels inside the map composition, which starts at scale 1.1 and settles to 1.0.
- happened: at 0.4-0.8 s the third label ran past x=1280 at low alpha. `layout: no cut-off / off-canvas text over 50 frames` said nothing; I only saw it by reasoning about the transform, then confirmed in a frame.
- cause: probably the 50 sampled frames or a low-alpha threshold; I did not dig.
- would have prevented it: the layout line saying how it samples ("50 frames, text with alpha > x"), or a review entry for text that is partly off-canvas while fading in.

### 7. Music `vol` ramps as the way to end a piece   [went fine, worth a doc line]
- the docs list track `vol` as `[[beat, level], ...]` "for a fade", which worked. I was not sure whether a top-level `volume` keyframe with a negative `at` counts from 12 s (the movie end) or 14.5 s (notes + tail), so I avoided it. A line in `help music` ("to fade the score at the end: ...") would answer it.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch: the fetch tool only summarised it, but the local copy said the same), `reference/quickstart.md`, `SKILL.md`: the whole workflow. Answered everything about the harness and the check.
- `help trimEnd`: draw-on, dashes as sub-paths, `strokeCap`. Answered. It also printed the shape table and the full text/audio/music sections of the cheatsheet (long, but it is where I learned `style.stroke` and track `vol` ramps).
- `help followPath` + `recipe follow-path`: answered (arc length, `at`, `ease`, several followPath trips in one keyframe list worked first time).
- Did not need: pitfalls.md, direction.md, cheatsheet read end to end.
- Not answered: whether sub-path gaps count in `trimEnd` (stumble 5); how to fade a `music` layer at the end with a layer keyframe (stumble 7).

## Wished the library had
- A dashed stroke option (`dash: [10, 7]`) that `trimEnd` respects. Hand-sampling a Bezier by arc length into dash sub-paths was ~20 lines; a map/route piece always needs it.
- A path sampler exported from the library (`pointAt(d, t)` / `pathLength(d)`), since followPath already walks by arc length internally: I re-implemented Bezier sampling for the dashes and the road sway.
- `check --at 4.3 --crop x,y,w,h` (or `--zoom 2`) for a close look at thin line work; I used PIL.
- A text halo is possible (`style.stroke` in the background colour), but a named `halo` in the docs would help map/label work be discovered.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The islands still read slightly "generated" (blob-like, similar sizes; the cape and the inlet I designed are faint). I would carve them with 2-3 explicit hand-placed control shapes per island (a real headland, a real bay where 霧ノ浦 sits) instead of Gaussian bumps on a polar radius.
2. 9.4-12 s is quiet: after the arrival ring and the summary, only the last of the map's settle moves. It holds well as a final page, but a tiny final beat (e.g. the route's total distance counting up in the summary, or the route line thickening once) would give the end a clearer full stop.
3. The middle (3-9 s) is a single repeated gesture (leg, pause, label). It is calm on purpose, but the ferry legs could be distinguished more in motion (a slower, constant-speed `ease: 'none'` crossing vs. an eased road) and the camera could lean slightly toward the active leg instead of one uniform settle.
