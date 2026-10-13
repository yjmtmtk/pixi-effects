# nengajo-hatsuhi - usability notes
Model: opus   Slot: T30   Cycles: 4   Result: works
Timeline: started 13:49; first page that rendered at +6 min (13:55, first check); first contact sheet looked at at +6; done at +16 (14:05)

Concept: a New Year card on washi. The first sun (hatsuhi) rises behind a gold hairline horizon, a five-strand mizuhiki cord
(gold / vermilion) draws itself into one loop, 謹賀新年 arrives vertically one character per beat, the greeting follows in
three lines, a glint runs along the gold strands, and a 寿 seal is stamped on the downbeat of the last bar. Koto-like pluck in
the yo scale (D E G A B) over a pad, 100 bpm, every entrance on a beat. Palette: washi #f5efe3, sumi #231d19, shu #b8352b,
gold #ad8b4c. Type: Hiragino Mincho / Yu Mincho, Georgia for the small Latin line.

## Went smoothly because the docs said so
- `new --size 1080x1350 --duration 12` gave a working page at once.
- `help music` was complete enough to write a 4-track score first time; the check's music read-back confirmed every bar is 4 beats.
- `help trimEnd` (cheatsheet shape section) answered draw-on for a path and the travelling-dash trick (trimStart + trimEnd), which became the glint.
- Inline `mask` on the sun (a rect above the horizon) worked first time from `help mask`.
- `help shader`: the washi paper shader compiled first time (mainImage / fragColor rules were clear).
- Wrapping everything in a canvas-sized `composition` with pivot at the centre for a slow 2.5 % push just worked, inline mask included.
- The brief's round-3 lessons (stage width from height, `--out` writes straight into the folder, Japanese font stacks) saved time.

## Stumbles
### 1. My own shell mistake   [MY-MISTAKE]
- tried: a stray `cat > file` with no input in a Bash call; it waited for stdin and hit the 120 s timeout.
- cause: mine. No library involvement.
### 2. Paper shader looked dirty / rain-streaked on the first sheet   [MY-MISTAKE]
- happened: fbm mottling at 220 px scale read as clouds and stretched fibre noise read as diagonal rain at 1080 px.
- fix: larger scale, 55 % of the contrast, two crossing fibre directions at 2 % brightness. Only visible by looking (the check cannot judge taste, as it says).
### 3. A glint drawn with `blendMode: 'screen'` in a pale colour read as a GAP in the cord, not a shine   [MY-MISTAKE]
- fix: a thin (2 px) bright core in normal blend inside the 4.5 px gold cord; reads as metal. Worth a line in a recipe: "a shine on a stroke = a narrower, lighter stroke on top with a trimStart/trimEnd window".
### 4. Decorative flakes overlapping the sun's edge   [MY-MISTAKE]
- a flake under the sun peeked out at its rim; excluded a circle around the sun in the scatter loop. Not something check reports (shapes are not checked for overlap, only text) - fine, but easy to miss in 480 px tiles.
### 5. No vertical text helper   [GAP] (known from round 3)
- four characters, one text layer each; trivial here, would be tedious for a vertical greeting paragraph (I kept the long lines horizontal for that reason).

## Docs I read, and which answered my question
- AGENTS.md (in context), reference/quickstart.md, SKILL.md: answered the workflow.
- `help music`: yes. `help trimEnd`: yes (shape table + draw-on). `help mask`: yes. `help shader`: yes. `help composition`: yes (pivot / culling note).
- Did not need cheatsheet or pitfalls directly.

## Wished the library had
- A vertical text option (`style.writingMode: 'vertical'`) with correct small kana / punctuation placement.
- A shape-overlap review (decorative shape vs. another shape) as optional `--strict` info, or at least shape-vs-text.
- A recipe for a metallic glint along a stroke.

## Self-assessment: 3 weaknesses, and what I would change with 3 more cycles
1. The mizuhiki strands simply overlap at the crossing; real cords weave (over / under). I would split each cord into two paths and draw the second half under the first at the crossing.
2. The last 2.4 s are a still hold apart from the slow push; a single breath of light (the sun warming slightly, or one flake catching light) would make the end feel alive without breaking the calm.
3. The washi texture is now very faint; on a good monitor it reads as plain cream. A few longer, visible kozo fibres (a handful of thin curved paths at low alpha) would make the paper more tactile.
