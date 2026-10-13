# hanbun-app - usability notes
Model: opus   Slot: S8-app-promo   Cycles: 10 (edit / look)   Result: works
Timeline (wall clock as `date` printed it): start 12:50; brief written ~12:56; first page that rendered and first contact sheet looked at ~12:58 (+8 min); done 13:06 (+16 min). The full check with export takes about 15 s, a `--no-export --at` check about 6 s, so a cycle was mostly my own writing time.

## Went smoothly because the docs said so
- `pixi-effects new hanbun-app --size 1080x1350 --duration 12` gave the right canvas at once (the size flag is in the quickstart's first line).
- The `recipe` list is a good menu; `help radius` landed straight on the shape table (cornerRadius, trimStart/trimEnd), `help counter` on `{value}` + `format`, `help null` on parent rigs. My first composition (about 300 lines: a nested composition, nulls as avatar rigs, 18 path arrows, masks, counters, music + 23 sfx) built with ZERO warnings on the first run.
- `trimEnd` walking sub-paths in order made arrowheads draw after their shaft for free (`M shaft L … M head …`): the cheatsheet sentence "a path with several sub-paths walks them in order" told me so.
- Text `fill` tweens (`to: { fill: accent }`) on a counter worked even though I could not find it documented (see Gaps).
- `check --no-export --at 5.6,6.1,…` was the right iteration tool: six full-size frames of exactly the moments I changed, in seconds. `waveform.png` with the cue ticks made the sound review quick.
- The music read-back (bars per track, drums span in beats) confirmed that the tap lands on beat 8 = bar 3 and the end card on the Cmaj7 at beat 20 without counting by hand.
- The loudness note ("the mix is quiet for web video: -25.7 LUFS … raise the volume") was actionable: doubling the volumes gave -19.7 LUFS.

## Stumbles   (one entry each, also small ones)
### 1. AGENTS.md via WebFetch comes back as a summary   [TOOLING]
- tried: WebFetch of the raw AGENTS.md asking for it verbatim.
- happened: the fetch tool summarised it; the exact paths (quickstart.md, SKILL.md) were lost, I found them by listing node_modules.
- cause: the fetch tool, not the library.
- would have prevented it: nothing in the library; the summary still said "read quickstart then SKILL.md", which was enough.

### 2. direction.md says "never invent a product screen", the request says invent the app   [SPEC-ODD]
- tried: following direction.md (SKILL.md says to read it for a product film).
- happened: its first rule (stop and ask for real assets; never invent a screen, metric or logo) does not fit a fictional-app request; I took a ruling: everything is invented, fixed once in brief.md (names, amounts, the 18 → 3 arithmetic), and the end card says 架空のアプリのコンセプト映像です.
- would have prevented it: one line in direction.md: "for a fictional / demo product, write the invented facts into brief.md, keep them consistent, and label the film as a concept".

### 3. "has no size" layout problem for a headline that slid out of its mask slot   [SPEC-ODD]
- tried: a rise-through-a-slot helper: text enters from below the mask, leaves upward, the layer's life ends when the exit tween ends.
- happened: `RESULT: 1 PROBLEM` — `text layer "step3" has no size (empty text, or not drawn yet) [frame 308]`. The text was simply fully masked on its last frame.
- cause: my exit tween ended 0.02 s before the layer did, so one frame had the text entirely outside its mask.
- would have prevented it: the message could say "(or entirely hidden by its mask)" — "empty text, or not drawn yet" sent me looking at the string first. Fixed by fading alpha on the exit and ending the tween exactly at the layer's end.

### 4. A counter that keeps counting across beats said the wrong thing in between   [MY-MISTAKE]
- tried: one persistent count layer 0 → 6 → 18 → 3 under unit text that swapped 件 → 回.
- happened: for half a second the headline read "6 回の送金" (six transfers), which is false; the number only became 18 later.
- cause: continuity of one object vs. the meaning of the sentence. Split into two counters, one per statement.
- would have prevented it: nothing in the library; my storyboard should have said what each frame claims.

### 5. Right-aligned numbers in ui-monospace show a slashed zero   [MY-MISTAKE]
- happened: the step labels read "Ø1 / Ø4" and the counter showed "Ø 回" for a few frames (SF Mono slashes zero).
- fix: proportional system-ui digits for display numbers (flush right, so the changing width does not matter); mono only for yen amounts in lists.
- would have prevented it: a line in the type notes of the cheatsheet: "`ui-monospace` on macOS (SF Mono) has a slashed zero: fine for code, odd for display numbers".

### 6. Drawing order of null children vs later siblings   [MY-MISTAKE, documented]
- happened: the avatars in the transfer rows looked grey: the row background rects (paper colour at 60 % alpha) were drawn ON TOP of them.
- cause: the avatar nulls were earlier in the array than the rows; the docs do say children draw where the null stands in the list. Moved the four avatar rigs after the rows.

### 7. Text fill animation: works, but I had to guess   [GAP]
- tried: `{ at: …, to: { fill: '#FF4B1F' }, duration: 0.3 }` on a text counter.
- happened: worked, no warning. `help fill` only returns `fillGradient` sections; I could not find a sentence that says `fill` on text is animatable (it does say `fillColor` for shapes).
- would have prevented it: in the cheatsheet's text line: "`fill` is animatable (a colour tween; `colorSpace` applies)".

### 8. The review list keeps reporting intended overlaps   [SPEC-ODD, minor]
- happened: `text layers "app/rowav4-kana" and "app/av-ken-kana" overlap by 69%` — two avatars that merge into one by design. Not a failure, the check says so, but there is no way to mark a pair as intended, so the list never goes empty.
- would have prevented it: a per-layer `review: false` (or `overlapOk: ['name']`) to silence a known pair.

## Docs I read, and which answered my question
- Read whole: AGENTS.md (summary via fetch), `reference/quickstart.md`, `SKILL.md`, `reference/direction.md`.
- `help radius` (shape table, cornerRadius, trim) — answered. `help counter` — answered (and spans). `help composition` — answered (local coordinates, sizing). `help null` — answered, including the draw-order rule I then tripped over. `help mask` — answered (inline mask in parent coordinates). `help fill` — did NOT answer whether text `fill` is animatable (only gradients).
- `recipe animate-text`, `recipe spring-pop` — used the spring preset names (`spring.snappy`, `spring.bouncy`, `duration: 'auto'`).
- The cheatsheet was grep'd once through `help` output (sfx presets / volume, music syntax, line/polygon/path coordinates, strokeCap).

## Wished the library had
- A text helper for a number + unit with different sizes/fonts on one baseline (I placed the unit by eye at a fixed x and a hand-computed top). `spans` cannot hold `{value}`, and spans cannot change size.
- Baseline alignment between two text layers (`anchorY: 'baseline'`) — aligning a 200 px numeral and a 64 px unit was trial and error.
- A way to mark a known overlap pair as intended for `review`.
- A tap/touch preset (touch point + press + ripple clipped to the target) — every UI film needs one; I built it from three layers and a mask.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The end card is correct but quiet: everything hangs left and the right 60 % of the frame is empty paper for 2 s. I would carry the big accent "3" from the headline into the end card (it travels down and becomes the proof line) instead of re-typing "3回" small.
2. 2.0–2.3 s (list → graph) has a near-empty headline and a card with only flying avatars; the avatars of the list also do not arrive in a satisfying order. I would keep the "必要な送金" statement on screen across the cut and order the avatar flights so each lands as its first line starts drawing.
3. Frame 0 is plain paper and the first 0.3 s is only an outline drawing; as a muted feed hook it is gentle rather than arresting. I would open on the big "6件" already present and let the card assemble under it, and give the eighteen debt lines a little more contrast so the "mess" reads at phone size.

## Review rounds (look → critique → fix)
**Round 1** (first sheet, 6-tile `--at` sheet)
- 2.17 s: avatars glide across the expense rows while the row text is still visible (collision). → rows leave at 1.8 s in 0.18 s; avatars start at 2.05 s.
- 2.17 s: headline reads "6 回の送金" — a false statement between beats. → two counters, one per statement.
- 1.10 / 6.53 s: a one-digit count right-aligned at x 300 left a ragged gap after the 96 px margin. → re-laid the headline as a stat: what is counted on the left column, the count flush right with its unit.
- 6.53 s: avatars in the transfer rows grey (row backgrounds drawn over them). → avatar rigs moved after the rows.
- mix -25.7 LUFS. → volumes doubled (-19.7 LUFS).
**Round 2**
- 6.5–8.5 s: transfer list static, bottom third of the card empty, and the copy says "tap" but nobody taps. → a second touch point taps each check on the beat; a progress bar fills 1/3 → 3/3 in the empty footer.
- 10.9–12 s: end card lost the story. → added the proof line "送金 18回" struck → "3回", and a fine-print concept label.
- 3.27 s: graph name labels crossed by the debt lines (ゆき, まい). → dropped the labels (the kana initials carry the identity).
- 10.27 s: "step3 has no size" (fully masked last frame). → exit fades and ends exactly at the layer end.
**Round 3**
- 4.10 s: touch point sits on the end of the button label. → moved right of the label.
- 5.60 s (poster): empty lower card after the button leaves. → one summary line "ゆき が受け取る合計 ¥20,050".
- 6.27 s: avatars cross each other flying to the rows. → row order follows the graph (そら top, けん middle, まい bottom; ascending amounts) and flights are staggered in row order.
**Round 4**
- 6.10 s: ゆき leaves while the arrows still point at her; けん flies over "¥14,350". → arrows and labels gone by 6.0 s.
- 6.40 s: row names arrive before their avatars land. → row text enters at 6.42 s + stagger.
- 10.17 s: end-card mark overlaps the still-fading card; 10.10 s an empty paper frame. → card leaves 9.75–10.1 s, end card starts 9.95 s.
