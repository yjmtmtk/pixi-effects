# pythagoras-rearranged - usability notes
Model: opus   Slot: S13-science-explainer   Cycles: 8   Result: works
Timeline: first page that rendered at +3 min; first contact sheet looked at at +4; done at +9 (12:51 -> 13:00)

Concept: the rearrangement proof of Pythagoras. Inside an (a+b) square, four identical 3-4-5 triangles leave a tilted
vermilion gap (c²); the triangles slide (pure translations; the bottom-left one moves at right angles to its hypotenuse,
straight across the gap, and docks on the top-right one) and the same vermilion now shows as a² and b². The colour IS the
area, so "the area did not change" is seen, not told. Paper / ink / one vermilion; Mincho captions, Georgia italic maths,
mono kicker; every beat on a 96 bpm bar line (2.5 s); 12.5 s, poster 11.5 (the finished equation).

## Went smoothly because the docs said so
- quickstart + SKILL.md were enough to write the whole piece in one go; first check: no warnings, OK.
- pitfall 40 (rotate/move a polygon about a chosen point: `pivotX/pivotY` = `x/y` = a vertex, points in canvas coords) gave me
  an unambiguous way to translate triangles with x/y keyframes. Worked first time.
- `measureText` (help measureText) to lay out the equation pieces so `c²` can arrive first at its final place and `a² + b² =`
  later in front of it: the spacing was exact.
- `trimEnd` draw-on for dimension lines and the underline; `cubic-bezier(...)` ease; sfx `pitch` / `seed` variation.
- `check --no-export --at a,b,c` writing `at.png` = the perfect iteration loop (3-4 s per look).
- The check's music read-back (bars per track) and the "mix is quiet: -24.1 LUFS" note told me exactly what to change.

## Stumbles   (one entry each, also small ones)
### 1. polygon placement wording   [GAP]
- tried: understand how to move a polygon whose points I know in canvas coordinates.
- happened: dsl.md/pitfall 15 says "with x,y those place the shape's centre" - centre of what (bounds? first point?) is not said.
- cause: wording.
- would have prevented it: one line in the shape table: "polygon/path with x,y: the centre of the points' bounding box goes to x,y;
  to move by a delta, set pivotX/pivotY and x/y to the same point (pitfall 40)". I used the pivot route and it was fine.
### 2. variables in italic inside a Japanese caption   [SPEC-ODD]
- tried: `spans` with a Georgia-italic *c* inside a Mincho caption.
- happened: spans cannot change `fontFamily` (documented, so no surprise, but it is exactly what maths captions need).
- workaround: caption `fontFamily: "Georgia, 'Hiragino Mincho ProN', serif"` - Latin glyphs come from Georgia, Japanese falls
  through to Mincho - and a span `{ text: 'c', fontStyle: 'italic' }`. Looks right.
- would have prevented it: mention this font-stack trick in the spans section ("for Latin-in-CJK put the Latin font first").
### 3. muddy fade of dark shapes over the accent   [MY-MISTAKE]
- tried: triangles fading in (alpha) on top of an already visible vermilion square.
- happened: half-transparent ink over vermilion reads as brown smears at 0.8-1.1 s (seen on the sheet, not reported, as expected).
- fix: triangles land on bare paper first, then the vermilion rect scales 0 -> 1 from the centre underneath (a "flood" that fills the gap).
### 4. shell typo   [MY-MISTAKE]
- `echo ======` in zsh is `=` expansion -> "(eval):1: ===== not found"; nothing to do with the library.
### 5. AGENTS.md fetch   [TOOLING]
- The repo's AGENTS.md was already in my context, so I did not WebFetch it again; went straight to quickstart.md and SKILL.md from node_modules.

## Docs I read, and which answered my question
- `skills/pixi-effects/reference/quickstart.md`, `SKILL.md`: answered everything structural.
- `help path` (landed on followPath/three paths first: not what I wanted), `help polygon` (pitfalls 40 and 15 + shape table: answered).
- `help measureText`, `help spans` (answered; spans limitation clear), `recipe music-lofi`, `recipe sfx-cues` (answered).

## Wished the library had
- spans that can switch `fontFamily` (maths/variables in prose, code in prose).
- A one-call "flood fill" or "reveal from centre" for a shape is not needed (scale did it) - nothing missing for this piece really.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. 3.0-4.9 s is a static reading pause (only the caption and the c² term). Cycle 7 added a paper-coloured trace along the
   hypotenuse c, but it is subtle; a slow 1-2 % push-in on the figure would keep it alive.
2. The slide: the two tuck-in triangles move together and slightly read as one gesture; a 0.1 s offset and a tiny settle
   (overshoot of 2 px) on docking would make the mechanics more tactile.
3. The paper-coloured seams on the triangles also nibble the outer border (inset 1.25 px at the square's edge vs the vermilion);
   a separate seam line only on the inner diagonals would make the outer square perfectly crisp.
