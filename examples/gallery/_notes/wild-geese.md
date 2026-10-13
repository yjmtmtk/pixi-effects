# wild-geese - usability notes
Model: opus   Slot: S6-wa-ink   Cycles: 10   Result: works
Timeline: start 12:50; brief.md written +6 min; first page that rendered at +7; first contact sheet looked at at +7; done at +15 (13:05)

## Phase log
- +0  read BRIEF, fetched AGENTS.md (WebFetch only returns a summary, not the verbatim file; the local CLAUDE.md copy had the real text), quickstart.md, SKILL.md.
- +1  `npx --no-install pixi-effects new wild-geese` worked first time.
- +2..6  `help mask`, `help matte`, `help vertical`, `help dataURL`, `help blur`, `help repeat`, `help fillGradient`, `help sfx`. Wrote brief.md.

- +7  (12:57) first page rendered; first check (`--no-export --at 2,4,5.5,8.4,11.5`) OK, no warnings at all on the first try. Looked at sheet.png and frames/8.40s.png, 4.00s.png.

### Critique round 1 (sheet + frames of the first render)
1. 2.2 s onward: the horizon reads as a ruled marker bar, not a dry brush. Bristles are too dense to separate, no dry streaks show until the last 5 %, the thickness is almost uniform.
2. 3.3 s onward: the mist image shows as a lighter rectangle reaching x = 1110 with a visible corner at its right end (it is lighter than the vignetted paper and its blobs reach the canvas edge).
3. 8.4 s (poster): the receding skein ends as 3-4 specks at (330, 375) that read as dirt on the paper, not as birds. At 4.0 s the trailing birds caught mid-flap are flat dashes.
4. 5.5 s: the second glyph 雁 mid-soak is a grey blurred square; blur and alpha run together, so the blurry state is visible at half opacity.
5. 3 s onward: the hills are smooth vector gradients with a drawn outline; no ink granulation, so they look like an illustration app, not sumi.
- +10 round 1 fixes applied (mist band edge-faded and toned, soak = blur resolves first then alpha, hills granulated, geese end larger and fade earlier, stroke rewritten).

### Critique round 2 (frames 2.4, 5.2, 8.4 and 2x crops of the stroke and the skein)
1. 2.4 s onward: the new dry brush broke into horizontal dashes across the whole stroke ("Morse code"): every bristle broke at the same short scale. Real kasure is long light hair-streaks INSIDE the stroke.
2. 3 s onward: granulation (destination-out specks) took ~40 % of the hills' density: the near ridge almost vanished into the paper.
3. 8.4 s (poster): the skein is again specks near the hills because the path ease (`sine.out`) front-loads the flight: by 8.4 s they are at 88 % of the path. The poster should show the birds mid-sky above the hills.
4. 5.2 s / 8.4 s (2x crop): birds caught mid-flap (scaleY -0.45..0.3) are flat dashes at this size; the down-beat pose never reads as a ^.
- fixes: stroke = 44 thin hairs with their own smooth "tooth" noise (30-70 px scale) and wander, edge hairs dry first; hills wash alpha up (0.55 → 0.72, 0.34 → 0.46) and fewer specks; path ease `none`, the null's scale carries the recession, fade 9.4-10.9 s; flap 1 ↔ -0.75 and thicker wing dabs.
- +11 round 2 fixes applied; the 2x crop of the stroke now shows hair streaks in the lift and a ragged edge.

### Critique round 3 (full sheet 0-12 s, frame 11.9)
1. 0-1.1 s and everywhere: the paper's mottling reads as dirty blotches at sheet scale (top left, 0.0 s / 1.1 s tiles).
2. 10.9-12 s: the ending just stops: after the skein fades nothing marks the close; the bengara index had already come in at 7.4 s with everything else, so the last 4 s have no event.
3. 11.9 s: granulation specks in the hills are large enough to read as white dust / snow on the near ridge.
4. 5.5 s: the skein passes ~110 px above 鴻 while the glyph soaks in: tight but it reads as "the geese bring their name"; kept on purpose.
- fixes: mottling alpha 0.05 → 0.03; the index 第四十九候 moved to 10.1 s with the bell, the seal on the finished sheet (the closing beat, then 1.4 s hold); finer, denser granulation; music volume 0.9 → 1.1 (-17.9 → -16.2 LUFS).
- +12 the round 3 sheet showed the index (moved to 10.1 s) still only half soaked at 10.9 s, leaving ~0.5 s of hold: moved it to 9.6 s (overlaps the skein's fade-out as a hand-off; fully on at 11.0 s, 1 s hold). Full check with export: OK, no warnings, 1.83 MB mp4, 12.03 s, -16.2 LUFS, true peak -5.2 dBTP; the whole check incl. export took ~12 s. Extracted 1.8 s and 10.5 s from the mp4 with ffmpeg: the soft-edged brush wipe and the soak survive the encode.

## Went smoothly because the docs said so
- `new` → `check --no-export --at …` → look at `frames/*.png` is a very fast loop (3-5 s per check). Ten cycles in ~8 minutes of wall clock.
- Canvas-drawn assets as `canvas.toDataURL()` in `assets` (`help dataURL` → cheatsheet "Assets") worked first time; all imagery here is procedural (paper, brush stroke, hills, mist, goose).
- Named matte with a sliding wide gradient rect for a soft-edged reveal: `help matte` literally says "a matte can be a wide gradient rectangle that you slide across the layers for a soft, moving reveal". Exactly what a brush wipe needed, and it knew to warn that the matte is not drawn.
- `null` parent carrying a formation (followPath on the null, scale on the null for recession, alpha on the null for the fade) while each child flaps on its own: SKILL.md's "Group / parent layers" paragraph was enough.
- Named blur filter animated as `'filters.<name>.strength'` (the `help blur` → named filters section) for an "ink soaking in" effect.
- Custom sfx voices (`noise` + `bandpass` freq sweep + `swell` + `pan: [0.7, -0.6]`) made a believable wind that crosses with the skein; no warnings.
- The `music` read-back in `check` confirmed each pluck lands on its glyph without me listening.
- Zero library warnings over the whole session: every key I guessed from the docs existed.

## Stumbles   (one entry each, also small ones)
### 1. AGENTS.md via WebFetch is only a summary   [TOOLING]
- tried: WebFetch on the raw AGENTS.md as the brief says.
- happened: the fetch tool refused a verbatim copy and returned a paraphrase (paths and commands partly lost). The same text was available locally, so no harm here.
- would have prevented it: nothing in the library; a line in the round brief to `curl` raw files instead.
### 2. No vertical Japanese text (tategaki)   [GAP]
- tried: `help vertical` hoping for a vertical writing mode.
- happened: it returned the 9:16 video-format pitfall and the camera section; nothing about vertical text. I stacked glyphs with `[...s].join('\n')` plus `align: 'center'` and a `lineHeight`. It works for kanji and ordinary kana, but small kana, 「」, ー and 、。 would sit in the wrong place / orientation.
- would have prevented it: a doc line under text ("vertical Japanese: join the characters with \n, align center; punctuation and ー are not rotated"), or `style.writingMode: 'vertical'` that rotates ー/「」 and shifts small kana.
### 3. Repeat a flap for the layer's whole life   [SPEC-ODD]
- tried: a wing-beat keyframe that should run as long as the bird is visible.
- happened: I had to compute `repeat: Math.ceil((dur - phase) / FLAP) - 1` by hand; `repeat: -1` is (documented) not allowed. A repeat that runs past the layer's end is silent (fine).
- would have prevented it: `repeat: 'layer'` (repeat until the layer ends) as the one-line common case.
### 4. Sine-out path ease made the skein arrive too early   [MY-MISTAKE]
- tried: `followPath({ …, ease: 'sine.out' })` to fake a receding flight.
- happened: by 8.4 s (60 % of the time) the birds were at 88 % of the path and the poster showed specks. Linear path + an eased `scale` on the null reads the same depth and keeps them mid-sky. The onion skin (`--onion`) would have shown it at once; I did not think of it.
### 5. Blur + alpha together show a grey block   [MY-MISTAKE, a doc hint would help]
- tried: blur 9 → 0 and alpha 0 → 1 over the same duration with the same ease on a 46 px glyph.
- happened: at mid-soak the glyph is a grey square. Fix: alpha `sine.in` over the full time, blur `sine.out` over 70 % (the blur is gone before the ink is dark).
- would have prevented it: a "blur-in" recipe line ("let the blur resolve before the alpha arrives").
### 6. Music read-back notation took a moment to decode   [GAP, small]
- happened: `pluck … | – | a4(1.2) b4(1.75) e5(2.3)` — I had to work out that `(1.2)` is the beat inside the bar, 1-based (bar 2, beat 1.2 = 4.2 s). Also "(no meter set: 4 assumed; a waltz is meter: 3)" and "ends early: silent from beat 8.3" print on every run for a deliberately sparse score: noise once you know.
- would have prevented it: print the movie second next to the bar-beat (`a4 @4.2s`), and say the meter hint once.
### 7. A full-second hold is easy to lose with a slow "sine.in" soak   [MY-MISTAKE]
- happened: the closing index soaked in from 10.1 s with `sine.in`, so at 10.9 s it was still faint and the true hold was ~0.5 s. Only the sheet showed it. `check` could flag "the picture still changes in the last second" (it already does that for deck stops).

## Docs I read, and which answered my question (path or `help <word>` / `recipe <id>`); which did not
- `skills/pixi-effects/reference/quickstart.md`, `skills/pixi-effects/SKILL.md`: answered the workflow, anchors, nulls, followPath, sfx, music.
- `help mask`, `help matte`: answered (soft sliding matte, matte must have a fill, lifetime rules).
- `help dataURL`: answered (assets accept data URLs).
- `help blur`: answered via the named-filters table and `'filters.<name>.<param>'`.
- `help repeat`, `help fillGradient`, `help sfx`: answered.
- `help vertical`: did NOT answer (vertical text); see stumble 2.
- No recipe was needed.

## Wished the library had
- Vertical Japanese text (`writingMode: 'vertical'`) with correct punctuation / small kana / ー.
- A tiny helper for procedural images: `canvasAsset(w, h, (g, rand) => { … })` returning an asset with a seeded random; most of my code is canvas drawing plus my own `rgba()` and value-noise helpers.
- `repeat: 'layer'` for cycles that last as long as the layer (wing beats, breathing, blinking).
- A sprite / frame swap for 2-pose cycles (wings up / wings down) instead of faking a beat with `scaleY` through zero.
- `check` warning (review-level) when the last ~1 s is not still, since the gallery rule asks for a held final frame.

## Self-assessment: 3 honest weaknesses of the piece, and what I would change with 3 more cycles
1. The hills are still a little digital: Gaussian ridges with a vertical gradient. With more cycles: noise-driven ridges, a few dry texture strokes (披麻皴) on the near slope, and a second, paler range behind for depth.
2. After 3 s the landscape is static except a 60 px mist drift; the middle of the piece leans entirely on the skein. I would add a second, slower mist veil crossing the near ridge between 6 and 11 s, and let the horizon ink "dry" (a very slight lightening of its wet halo).
3. The horizon is revealed by a soft wipe, not painted: no brush head, no pressure change in time, and the ink pool exists before the wipe reaches it. I would reveal the pool first with a tiny soak, then wipe the body with a speed curve that slows at the lift. Also the wing beat is a `scaleY` flip; at larger sizes it would read as a flip, not a flap.

