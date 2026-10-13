# binary-count - usability notes
Model: opus   Slot: T24   Cycles: 8 (check runs; 2 of them full with export)   Result: works
Timeline: started 13:49; first page that rendered at +3 min (13:52, the whole composition rendered on the first try); first contact sheet looked at at +3; done at +12 (14:01)

## Concept
Start with ONE digit tile. It can only hold 0 or 1; when it overflows, a spark carries to the left and a new tile is BORN there, worth double (1, 2, 4, 8).
The decimal readout on the right and a running sum of the lit weights ("8 + 4 + 1") give the "aha": the number is just the lit weights added up.
It ends on 1111 = 15 with a ghost "?" tile marked 16 waiting on the left (the next digit). Each new digit's chime is an octave above the last (x2 in frequency = one octave).
Palette: near-black #101113, warm off-white #ECE7DC, greys, one amber #FFB240 (lit tiles with a blurred glow behind them). Type: Mincho headline, Hiragino Sans captions, light Helvetica Neue digits, monospace labels. Counting is on a 120 bpm grid (0.5 s beats, eighths in the fast run).

## Went smoothly because the docs said so
- `set: { text }` for a digit that flips (dsl.md "Changing text", found by `help set`): exactly what a counter of discrete states needs; the decimal readout and the "8 + 4 + 1" line are one layer each with a keyframe per step.
- Colour tweens on shape `fillAlpha` / `strokeColor` and on text `fill` worked as the cheatsheet says (style props in keyframes).
- A blur-filtered rect behind each tile as a lamp glow worked first time with `filterArea` in the layer's own coordinates (SKILL.md says so explicitly).
- `music` written as text plus `sfx` presets: the check's music read-back confirmed every chord landed on its bar; no counting by hand.
- The round-3 lesson "check --out writes straight into the folder" was right.

## Stumbles   (one entry each, also small ones)
### 1. My counting logic made the first tile born at the wrong time   [MY-MISTAKE]
- tried: `isBirth = (n & (n-1)) === 0` to find when a new digit appears.
- happened: n = 1 is also a power of two, so the ones tile was re-born at 2.0 s and showed "0" while the readout said 1 (seen on the first `--at 2.5` frame). No warning: the data was valid.
- cause: mine. Fixed with `n >= 2 &&`.
- would have prevented it: nothing in the library; the `--at` frames caught it within a minute, which is the point of looking.
### 2. "review" reports text overlaps that are not visible   [SPEC-ODD]
- happened: `text layers "lab-dec" and "decimal" overlap by 50% of the smaller one`, later `"decimal" and "sum" overlap by 36%`. The 150 px light numeral's line box (ascent/descent) touches the small labels; on the full-size frame there are 20+ px of clear space between the ink.
- cause: overlap is measured on text bounds, not ink. I moved the labels up once, then accepted the second one after looking at `frames/11.60s.png`.
- would have prevented it: the review line could say "line boxes overlap (ink may not)" or measure glyph ink for big numerals; or `review` could print the gap in px.
### 3. `ui-monospace` draws a slashed zero on macOS   [GAP]
- tried: ui-monospace (recommended by the brief's font list) for the tile digits and the big readout.
- happened: SF Mono's 0 has a slash: fine for code, ugly for a big elegant numeral. Switched digits to `"Helvetica Neue", system-ui, "Segoe UI", Arial` with weight 300 / 200.
- would have prevented it: a line in the fonts advice: "ui-monospace / Menlo / SF Mono draw a slashed zero; for display numerals use a sans with weight 200-300".
### 4. sfx buried under a pad at the levels I guessed   [MY-MISTAKE, small]
- happened: first mix -19 LUFS and the waveform.png showed no peaks at the click / pop cues (pad vol 0.55 + sfx volume 0.4-0.6). Raised sfx to 0.9-1.1 and lowered the pad: -16.6 LUFS, peaks visible at each cue.
- cause: the docs do say music peaks at -6 dBFS and sfx at -12 ... -18, so sfx need volume above 1 next to a bed. I just did not do the arithmetic.
- would have prevented it: an `inspectAudio` note like "sfx X is N dB under the music bed at its start" (masking), since I cannot listen.
### 5. Contact-sheet tiles cannot show 14-16 px labels   [TOOLING, known]
- the weight labels and "x2" marks are unreadable in sheet.png; judged them in `frames/*.png` via `--at`, as round 3 warned.

## Docs I read, and which answered my question
- AGENTS.md, reference/quickstart.md, SKILL.md: enough to build the whole piece.
- `help set` (changing text: answered), `help music` (score syntax, levels: answered), `help stroke` (shape table) and a grep of cheatsheet.md for radius / style props (answered).
- Did not need recipes or pitfalls.md.

## Wished the library had
- A "flip" text transition (old string slides out, new slides in, inside the layer's box) as a keyframe option: `set: { text, transition: 'roll' }`. I faked the change with a scale pulse.
- A masking hint in inspectAudio (sfx level vs the music bed at that moment).
- Ink-based text overlap in `review`.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first 5 s are right-heavy with an empty left half (intentional: that is where digits will be born), but a viewer may read it as unbalanced; I would add faint placeholder hairlines for the future slots, or pan the camera so the cluster stays centred.
2. Digit changes are a colour + scale pulse; a real split-flap / roll inside each tile (masked text sliding) would feel more crafted, especially in the fast run 8.5-10 s.
3. The ending is a still hold with a "?"; a final tiny gesture (the ghost tile's outline breathing once, or the 16 weight lighting as the music resolves) would make the last second more deliberate. I have not heard the sound: levels are judged from numbers and the waveform only.
