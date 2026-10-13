# hasshahyo - usability notes
Model: opus   Slot: S11-info-board   Cycles: 6 check runs (1 warnings fix + 4 look-critique-fix rounds + 1 full check)   Result: works
Timeline: started 12:51; brief written +6 min; first page that rendered at +7 min (12:58); first contact sheet looked at at +8 min; done at +12 min (13:03)

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md was a short, clear path; `npx --no-install pixi-effects new hasshahyo` gave a working page with the harness in place.
- `recipe` (the list) works as a table of contents. `recipe null-orbit` told me how to group a table row (a `null` + `parent`), so a whole row (band, time, type box, destination, track, minutes, remarks) moves as one object by animating one null's `y`. That made the reflow / re-sort (the core of the piece) trivial.
- `help set` answered "how do I change a flap's text" (`set: { text }`) at once; `set` also accepted `fill` in the same keyframe (`set: { text: '08:56', fill: AMBER }`), with no warning, exactly as I hoped.
- The cheatsheet's rect line (`anchorX: 0` for left-to-right) gave me draw-on rules via `scaleX`; `trimEnd` drew the amber outline around the changed track.
- The relative-value warning was precise and told me what to change (see stumble 1).
- `check` output is excellent for this kind of work: the `music` read-back (bars per track) confirmed every chime sat on its bar line; `waveform.png` showed that the sub bass started at full level on frame 0 (fixed with a `vol` ramp); `--onion 6.2:7.3` showed the re-sort crossing in one picture.
- `review` listed the one intended overlap (the delayed row's opaque band passing over another row) without failing the run.

## Stumbles
### 1. Relative value on the `from` side of a from+to keyframe   [MY-MISTAKE, warning was good]
- tried: an entrance `{ from: { alpha: 0, y: '+=10' }, to: { alpha: 1, y: '-=10' } }`.
- happened: `warn: pixi-effects: "+=10" (y) is a relative value (measured from where the layer is): it works in a keyframe's to / from / set, not in the from side of a from + to keyframe; it is read as the number 10`. Consequence: every header text jumped to y = 10 (the clock was reported 35 px beyond the top edge, and 159 overlaps were listed).
- cause: I wrote both sides; the docs (cheatsheet line 12) say "a slide-in is `from: { x: '-=36' }`" alone.
- would have prevented it: nothing more needed; the warning names the fix. A tiny improvement: append "write `from: { y: '+=10' }` alone (it runs to the layer's own value)" to the warning, since that is the one-line fix.

### 2. The check's `review` count without the item   [TOOLING, small]
- tried: piping `check` output through `grep -v "- text layers"` to shorten it.
- happened: "review 1 to look at" with the line itself filtered away; I had to find it in `report.json` under `inspect.review` (not a top-level `review` key, which I looked for first).
- would have prevented it: a top-level `review` array in report.json (mirroring the printed section), or the report key named in the printed header.

### 3. The first frame is black by construction   [SPEC-ODD, my choice]
- A board that "powers on" from black means frame 0 is empty; the contact sheet always shows that tile. It is intentional here (the poster is 8.5 s, so the page shows a designed frame before play), but a gallery viewer who scrubs to 0 sees black. Not a library problem.

No library bugs met. No warnings were unclear.

## Look-critique-fix rounds
**Round 1 (first sheet, 11.5 s cut):**
- 9.4-11.5 s: 3.5 s of nothing changing after the last event -> cut to 10.5 s (later 10 s = exactly 4 bars at 96 bpm).
- 5.3-6.1 s: the amber tick slides on the footer axis but the size of the change is not written -> added an amber `+10` that rides with the tick.
- 5.0 s / 7.5 s: the changed-row band overhung the rules by 12 px (52-1228) - read as an accident, not a decision -> made the band full-bleed (0-1280), a deliberate stripe.
- 3.25-3.7 s: the departing row slid 48 px into the left margin -> 32 px, slightly faster.
- whole film: time, destination, track and minutes were all 32-34 px, a flat hierarchy -> destination 36 px bold, the heaviest element in the row.
**Round 2:**
- 0.0-1.0 s: `waveform.png` shows the sub drone at full level from frame 0 while the picture is still black -> sub `vol` ramp `[[0,0],[3,0.35]]`; header rule now starts at 0.0.
- all rows: 各停 had no box, so its kanji started 12 px right of the TYPE column edge while "LOCAL" started on it -> a graphite-outlined box: three levels by fill (filled / paper outline / graphite outline), all aligned on the column line.
- 10.0 s end: music re-scored to 16 beats so the pad resolves on the last change (7.5 s) and the film ends on a bar line.
**Round 3 (full-size poster frame 8.5 s):**
- track change row: the old track number vanished - a passenger waiting at 15 must learn it moved -> EN remark now "Track 15 → 16".
- all rows: 300 px of dead space between DESTINATION and TRACK while REMARKS was cramped at the right edge -> TRACK 800->724, MIN 948->884, REMARKS 1024->968.
- 6.3-7.1 s (onion): the re-sort crossing is legible because the delayed row carries an opaque band; kept.

## Docs I read, and which answered my question
- AGENTS.md (WebFetch: it refused to quote verbatim and summarised, but the summary was enough; the repo copy was also in my context).
- `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: the workflow, anchors, sfx presets - answered.
- `recipe` list, `recipe null-orbit`, `recipe sfx-cues`, `recipe count-up`: answered grouping and sound placement.
- `help set`: answered text swaps. `help letterSpacing` printed the whole `text` section (useful anyway; it also explained CJK fonts and line breaks).
- `help music`: the full score syntax; answered everything (pad `attack`/`release`, `vol` ramps, bell `ring`, chord slash bass `Gmaj9/b`).
- cheatsheet grep for `shape:`, `trimEnd`, `format:` (`pad` for zero-padded numbers), `polygon` (canvas coordinates, so I avoided it inside a parented row). All answered.

## Wished the library had
- A "flap" (split-flap / value change) helper: `flap(at, set)` -> three keyframes (fold, swap, unfold). I wrote it in 8 lines; every info board, scoreboard and price ticker needs it.
- A `clock` / time-string formatter for `{value}` (e.g. `format: { time: 'mm:ss' }`), so a ticking clock is one keyframe instead of one `set` per second.
- report.json: a top-level `review` (see stumble 2).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The footer axis is small and quiet (11 px labels, unlabeled ticks); on a phone it is decoration rather than information. I would label the ticks with the destination initial or the train type, or make it taller.
2. The opening is a generic fade-up of rows; a real board "powers on" more characterfully (rows flap in left to right, column by column). I would build the rows with the same flap language as the changes, so the film has a single motion vocabulary from frame 1.
3. During the re-sort (6.3-7.1 s) the 青梅 row is hidden for a moment behind the delayed row's band; a viewer can lose track of it. I would stagger it: the rows below move up first, then the delayed row drops into the freed slot, so nothing is ever hidden.
