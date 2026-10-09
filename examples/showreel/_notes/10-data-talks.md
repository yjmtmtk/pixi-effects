# 10-data-talks — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 2 check runs (+1 full export)   Result: works

## Went smoothly because the docs said so
- The `bar-chart` recipe (nice axis top, `anchorY: 1` bars, labels riding the top with the same ease) and `count-up` carried page 1 almost as written.
- `trimEnd` on a `path` and `stagger(n, { each })` returning plain numbers made the line draw-on and the bar wave one-liners.
- `deck()` option table (page = nested composition, stops per page, transition overlap) was enough to get the slide-deck feel right first time.

## Stumbles
### 1. The chapter host only passes `sequences`, so deck's `transitions` / `stops` would be lost   [GAP]
- tried: `return { duration, sequences: d.composition.sequences, transitions: d.composition.transitions }` as the `deck` recipe does.
- happened: nothing warned; but chapter.html / the reel build wrap only `chapter.sequences` in a composition, so a returned `transitions` is silently dropped (the slide would have been a hard cut).
- cause: BRIEF's chapter shape has no `transitions` key.
- would have prevented it: a BRIEF line "a deck: wrap `deck().composition.sequences` AND `.transitions` in your own `{ type: 'composition', sequences, transitions }` layer" (that is what I did).

### 2. `deck()` needs `width` / `height` for a 1920 page   [SPEC-ODD]
- tried: knew from the options table that `width`, `height` pass through; passed `width: 1920, height: 1080` to be safe. Not verified what the default would have been inside a nested chapter composition.
- would have prevented it: one line in the deck docs on what a page's size defaults to when `deck()` is used inside a composition (not as movie init).

### 3. macOS `sed -i` in a tool command   [TOOLING]
- tried: `sed -i "/pattern/d" file`; happened: `invalid command code e` (BSD sed); I used python instead. Not a library issue.

## Wished the library had
- A `line` / `polyline` chart helper is not needed (path `d` from the data array worked), but a tiny `pathFromPoints(points)` helper would save the string-building and `Math.hypot` loop I used to time the dots to the line's reach.
- Draw-on progress is not queryable from JS, so dots that must land when the line reaches them need the cumulative length computed by hand (with `ease: 'none'`).
