# rain-fourteen-days - usability notes
Model: opus   Slot: S7-data-story   Cycles: 6 (5 look/fix + 1 final full check)   Result: works
Timeline: started 12:50; first page that rendered at +5 min (12:55); first contact sheet looked at at +6; last check at +9 (12:59), notes finished at about +11
(wall-clock times are from `date` in the shell; the experiment's clock may count thinking time differently)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md path was short and clear; SKILL.md pointed me to reference/direction.md for "a data story", which matched the PROCESS brief exactly (brief, shotlist, three defects with timestamps).
- `pixi-effects new <id> --duration 13` gave a working page at once.
- `recipe bar-chart` + `recipe draw-on-and-type` covered anchorY: 1 bars and trimEnd draw-on; `help dash` answered "no dash option, write sub-paths" directly.

## Stumbles   (one entry each, also small ones)
### 1. `from: { alpha: 0, y: '+=14' }, to: { alpha: 1 }` — relative value in a from+to keyframe   [MY-MISTAKE / docs were right]
- tried: a shared `rise()` helper as a from+to keyframe with `y: '+=14'` in the from side.
- happened: `warn: pixi-effects: "+=14" (y) is a relative value ...: it works in a keyframe's to / from / set, not in the from side of a from + to keyframe; it is read as the number 14`. Every caption jumped to y = 14 (the headline sat on the kicker at 9.47 s; `review` listed it as a text overlap).
- cause: I wrote from+to out of habit; the dsl section on relative values says exactly this.
- would have prevented it: nothing more needed; the warning named the fix. (Small wish: the warning could print the layer name.)

### 2. A review overlap that was really the warning above   [TOOLING, minor]
- happened: with the relative-value bug the check's `review` list reported "kicker and headline overlap by 100%" — correct, but the root cause was the warning two lines above; the two lines are not linked.
- would have prevented it: when a warning names a layer/property that also appears in a review item, say "probably caused by the warning above".

### 3. Lorenz curve over the bars: deciding the draw order and split by hand   [GAP, small]
- tried: one `path` with `trimEnd` 0 -> 1 for a cumulative curve of 365 points.
- happened: works, but `trimEnd` walks arc length, so the steep 50 % part (short in x, long in y) and the flat tail draw at speeds I could not set per part. I split it into two paths (head and tail) with their own timing and colour. Fine, but a doc line on "trimEnd is by length, not by x" next to the chart recipe would save a render.
- would have prevented it: one sentence in `recipe bar-chart` or `help trimEnd`: "to colour or time part of a line differently, split it into two paths at that point".

### 4. Warnings do not say which layer   [GAP, minor]
- the relative-value warning named the property (y) and the value but not the layer name; with 8 text layers sharing a helper it was obvious here, in a bigger file it would not be.

## Docs I read, and which answered my question
- AGENTS.md (web), `reference/quickstart.md`, `SKILL.md`: the workflow, all correct.
- `reference/direction.md`: answered "how do I direct a data story" (brief, shot list, three timestamped defects, smallest-text check); this is what made me enlarge the axis labels in round 3.
- `recipe bar-chart`: anchorY: 1 + height keyframe; I did not need the callout pill.
- `recipe draw-on-and-type`: trimEnd draw-on for the baseline, bracket, curve and dashed rule.
- `help dash`: answered at once (no dash option; sub-paths) and also gave me the `spans` and `{value}` sections in the same output.
- `help value`: `format: { grouping }` (I ended up formatting 1,500 in JS because the number is static).
- Not needed: cheatsheet / pitfalls end to end, recipes.md.

## Wished the library had
- A chart helper would be gold-plating; what I wanted was smaller: (a) layer names in warnings; (b) `trimEnd` driven by x (or a "progress along x" option) for line charts, so a curve can be revealed left to right regardless of its steepness.
- A way to give 365 layers one shared keyframe template (they differ only in numbers) - building them in a JS loop worked fine and the page built in 0.2 s, so this is a wish, not a problem.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The sort (5.0-6.7 s) is the film's key move but reads as "bars squeeze to the left" rather than "bars find their rank"; with more cycles I would let each bar lift slightly (y -6 px, 0.2 s) when it starts to travel, or sort in two passes (dry days drop away first, then the wet ones order themselves), so the reordering is legible.
2. The end frame is left-heavy: the right 60 % of the plot is empty except the 50 % rule. It is the honest "long tail of nothing", but a gallery viewer may read it as unused space; I would try moving "残りの351日で、もう半分。" to sit over the middle of the tail with a thin bracket spanning ranks 15-365, mirroring the blue bracket.
3. The calendar view (0.5-4.4 s) is a little too sparse to be beautiful: 2 px bars on a 2.98 px pitch with 261 dry days look like a seismograph with gaps. A light slate tick for each dry day (or a 1 px rain-coloured dot) would make the 365 days visible as a full year before the sort.

## Critique rounds
### Round 1 (first contact sheet, +6 min)
1. 8.3 s → end: the cumulative curve reaches 100 % at the plot top and runs flat across the whole width at y = 270: a bright full-width line that reads as a frame/ceiling and steals the accent from the 14 bars. Fix: split the curve; the part up to the 50 % crossing in rain blue 2.5 px, the rest thin slate.
2. 8.6–13 s: "14日" sits on the curve (the curve runs through the "1"), and its sub-line "365日のうち、雨の多かった14日で" repeats the headline. Fix: move "14日" right of the curve, and put the counterweight on the other side: "残りの351日で、もう半分。" over the long tail.
3. 9.4 s: the headline arrives at y = 14 over the kicker (the relative-value warning above). Fix rise() as a from-only keyframe. Also the headline says 降る (a general rule) while the chart is one year of one city: 降った.
Result: the flat 100 % line is now a quiet slate line; the headline sits where it should; "14日" no longer touches the curve.
### Round 2 (+7 min)
1. 9.6–13 s: "残りの351日で、もう半分。" floated at x = 560 in the middle of nothing, tied to neither the tail nor "14日". Fix: left-align it under "14日" at the same x, so the dashed 50 % rule divides the two halves of the sentence (14 days above, 351 below).
2. 8.3 s → end: nothing on the chart says WHICH bars are the 14 except colour; the lit sliver is 42 px wide. Fix: a rain-blue bracket under the baseline spanning exactly those bars, drawn on with the reveal.
3. 9.6 s → end: the slate line across the plot top has no meaning without a label (it is the cumulative 100 %). Fix: "100%" in mono at its right end. Also caption 2 ended in 「並べ替えると。」 (a dangling clause): now 「並べ替えてみる。」.
Result: checked at 5.5 / 6.0 / 6.5 / 11.8 s — the sort reads (wettest lead), the end frame has a clear structure.
### Round 3 (+8 min)
1. Whole film: the axis and month labels are 14 px on a 720p frame (= 21 px at 1080p; direction.md asks about 34 px for readable text), and "残りの351日" is slate on ink (contrast about 3:1). Fix: axis / month labels 16 px and moved 4 px lower (the "← 雨の多かった日" label was touching the new bracket), "残りの351日" 24 px in paper at 65 %. The fine print stays small on purpose.
2. 8.0 s → end: the 14 lit bars keep the 0.82 alpha of the calendar view, so under the blue curve head they look washed out next to the curve. Fix: lit bars go to full opacity with the colour change.
3. 0–0.55 s: the first half second is an empty ink frame with only a hairline; acceptable as a breath, but the kicker should already be readable at the first beat. Fix: kicker at 0.1 s and the baseline at 0.1 s.
### Round 4 (final full check, +9 min)
- Export: 760 KB mp4, 13.03 s, full check about 17-19 s. Loudness was -19 LUFS (the check's note says web video is typically -14 to -16): music 0.8 -> 1.1, sfx 0.6 -> 0.8 gave -16.2 LUFS, true peak -5.1 dBTP. A mid-sort frame (5.6 s) pulled from the exported mp4 with ffmpeg matched the in-page frames.
