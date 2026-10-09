# 00-open — stumble notes
Model: fable (Claude Fable 5.1, self-reported)   Cycles: 3   Result: works

## Went smoothly because the docs said so
- `P.measureText` / `P.splitText` work before `movie.init` (the chapter function runs first): I centred the diamond + gap + word as one block from the measured width, and the per-letter layers lined up with no guessing (cheatsheet + recipe `split-text`).
- `animateText` with `by: 'words'`, a custom `in: { from: { y, alpha }, duration, ease }` and `styleFor` (one word red) did the claim in one call; `y` is the TOP of the line box, as the cheatsheet says, so `RULE_Y + 70` landed where I wanted.
- `trimEnd` draw-on for the hairline, `visibleChars` for the JSON hint, `sfx: { preset, pitch }` for the hits: copied from the recipes, no warning on the first run.
- `P.tag(n, title, '', { at })`: an empty caption returns only the tag, and `at` moved it after the title had the stage.

## Stumbles
### 1. The mark flew through the first letters   [MY-MISTAKE]
- tried: mark shrinks into place over 0.75 s, letters start at 0.12 s.   - happened: at 0.27 s the still-large diamond overlapped the `p` (seen in `at.png`, no warning: shapes vs text is not inspected).   - cause: two entrances sharing the same spot at the same time.   - would have prevented it: nothing in the docs; the frame picture caught it. Fix: mark 0.6 s, letters from 0.18 s.

### 2. The check note "the mix is quiet / silent from 1.9 s"   [SPEC-ODD]
- tried: three short sfx at 0.4–0.45 as the brief asks (the music is the bed).   - happened: `note  the mix is quiet for web video: -32.1 LUFS` and `silent from 1.944 s to 6 s`.   - cause: the one-chapter page has no music, so the chapter's own sfx are measured alone.   - would have prevented it: a line in the BRIEF saying these two notes are expected in the one-chapter check (they are notes, not problems, so the run still says OK).

## Wished the library had
- A way for `inspect` to flag a shape overlapping text (even opt-in, by name): the only visual bug I had was exactly that, and only the picture showed it.
- `splitText` pieces carry no `baseline` / x-height numbers, so the mark's vertical place next to a lowercase word (`TOP + 0.62 × size`) was tuned by eye.
