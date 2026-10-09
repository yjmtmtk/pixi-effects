# 02-shapes — stumble notes
Model: opus (Claude Opus 5.5, self-reported)   Cycles: 5   Result: works

## Went smoothly because the docs said so
- `shape: 'arc'` progress ring: the cheatsheet's "startAngle -90, animate endAngle to 270" worked first time.
- Dashes as sub-paths: the cheatsheet's "write the outline as alternating sub-paths, trimEnd walks them in order" gave a 60-tick dial that draws on clockwise as ONE path layer.
- `morphTo` disc (four cubics) to a four-point star (eight L points): no twist, as the docs promise ("closed outlines are lined up").
- A partial `fillGradient` in a keyframe (`to: { fillGradient: { angle: 315 } }`, stops left out) just worked on a `path`, together with the morph.
- Rotating / scaling a path about its centre with `pivotX/pivotY` = the point and `x/y` = the same point (pitfall 40) worked exactly.
- `stagger(n, { grid, from: <index> })` for the halftone release, plus a second per-column wave as a yoyo keyframe (scale + fillColor in oklch).
- An inline rect `mask` on the word (a slot it rises through) starts with the layer, as documented; no timing surprises.
- `check --at ... --onion` was enough to judge every beat; the first run had `warnings none`.

## Stumbles
### 1. Thin construction lines vanish in the contact sheet   [MY-MISTAKE]
- tried: 2 px bone lines at `strokeAlpha: 0.35`.   - happened: visible in a full 1080p frame, invisible in the sheet tiles (and so on a phone).   - cause: thin + faint at 1/4 scale.   - would have prevented it: a line in the brief / SKILL layout section: "a hairline needs ≥ 3 px and ≥ 0.5 alpha at 1080p to survive a phone".
### 2. Second wave ran into the end calm zone   [MY-MISTAKE]
- tried: per-column ripple starting at 4.75 s, 0.065 s per column, yoyo 0.28 s.   - happened: the last column was still red at 6.0–6.2 s (`--at 6.0` showed it).   - cause: I did not add up `start + 13 × step + 2 × duration`.   - would have prevented it: nothing in the library; a check option that prints "last moving layer settles at X s" would make the calm-edge rule verifiable in one line.
### 3. "Exact geometry with GW/GH" only goes so far   [SPEC-ODD]
- tried: expressions everywhere.   - happened: `line.from`, `polygon.points` and `path.d` take numbers / path strings, not expressions, so the geometry is computed in JS from `GW = 1920` constants; only layer `x / y` use `'GW*5/16'` / `'GH/2'`.   - would have prevented it: a doc line saying which fields accept expressions (points / d do not).
### 4. Quiet mix note   [SPEC-ODD]
- happened: `the mix is quiet for web video: -32.3 LUFS`.   - cause: the brief asks for sfx at 0.3–0.6 (the music is the bed), so the chapter alone is quiet by design. Left as is.

## Wished the library had
- `trimStart / trimEnd` on `arc` (it warns and says use endAngle; fine, but a travelling dash around a ring needs both angles animated by hand).
- A `check` line "motion ends at X s" (last frame where any layer's value changes), to prove the calm in/out edges.
