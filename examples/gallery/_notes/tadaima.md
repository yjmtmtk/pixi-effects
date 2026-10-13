# tadaima - usability notes
Model: opus   Slot: S4-vertical-short   Cycles: 9   Result: works
Timeline: started 12:50; first page that rendered at +6 min (12:56); first contact sheet looked at at +7; done at +13 (13:03)

Concept: a coral ball says 「かえろう。」, hops down ten ledges (one hop per beat at 120 bpm, each ledge lights up and stays lit, a descending
music-box note per landing), sticks the last landing, looks down, jumps into a socket in the floor the exact size of itself (the chord resolves),
and the camera pulls back so the whole trip becomes a chronophotograph (Marey-style ghost circles) beside a vertical 「ただいま」.
Poster 11.5 s. Export: mp4 7.8 MB (680 KB without the grain), the full check with export took 15 s.

## Went smoothly because the docs said so
- AGENTS.md -> quickstart.md -> SKILL.md was a short, clear path; `new tadaima --size 720x1280 --duration 12` wrote a correct vertical page in one go.
- `recipe` list + `help music` / `help format` answered what I needed before drawing (rests are `_`, a zero-padded counter is `format: { pad: 2 }`, null parents chain).
- The cheatsheet line "`power1…4` are the powers 2…5" saved me: I needed exact projectile arcs (rise `power1.out`, fall `power1.in` = t^2); in GSAP habit I would have guessed `power2`.
- Null parents (`world` null for the scrolling camera and the pull-back, a `ball` null carrying body + eye for squash and stretch) worked first time, chained, including scale on the parent.
- `check --at` frames + `--onion` gave me exactly the frames I needed; every check run took 5-15 s. The music read-back proved the landing notes sit on beats 4..12 as designed.
- `set` keyframes for a counter and an instant colour, `trimStart`/`trimEnd` on `line` shapes for impact ticks, the `grain` root filter: each worked from one doc line.
- No warnings at any time; `window.__logs` stayed `[]` throughout.

## Stumbles   (one entry each, also small ones)
### 1. Template CSS is 16:9-only   [GAP]
- tried: `new tadaima --size 720x1280`.
- happened: canvas attributes became 720x1280, but `.stage { width: min(960px, 100%) }` stayed, so the vertical canvas is 1707 px tall on a laptop and needs scrolling.
- cause: `new --size` only rewrites the numbers, not the stage CSS.
- would have prevented it: when height > width, `new` could write `.stage { width: min(100%, calc((100vh - 32px) * W / H)); margin: 0 auto }`.
### 2. A `path` given `x: 0, y: 0` moved to the top of the world   [MY-MISTAKE / GAP]
- tried: a floor-with-socket `path` (d in world coordinates) with `initial: { x: 0, y: 0, strokeColor ... }` out of habit.
- happened: no warning; the floor was drawn ~2600 px too high (its midpoint placed at the null's origin), invisible until the pull-back.
- cause: the cheatsheet says path is "canvas coordinates like `line`", and only the `line` row says "if you give them they place the line's midpoint". I read the path row only.
- would have prevented it: repeat "(giving x / y moves the shape's midpoint there)" in the `path` and `polygon` rows, or a build warning when a path/line/polygon gets `x`/`y` that differ from its own midpoint by more than its size.
### 3. sfx knobs at the layer's top level   [MY-MISTAKE, docs fine]
- tried: `{ type: 'audio', sfx: 'click', pitch: 0.7 }` (also a duplicated `sfx` key) from a half-memory of SKILL.md ("knobs `pitch`, `brightness`, `seed`").
- happened: I caught it before running by grepping the cheatsheet (`sfx: { preset, pitch /* semitones */ }`). SKILL.md's sentence lists the knobs without showing where they go; one example there would remove the guess.
### 4. A colour tween from navy to coral passes through brown   [SPEC-ODD, documented]
- tried: ledge `fillColor` INK -> CORAL over 0.08 s.
- happened: the contact frame showed a muddy brown ledge. The docs explain rgb lerp and `colorSpace: 'oklab'`; I switched to an instant `set`, which was the better design anyway.
### 5. Grain multiplies the file size by 11   [SPEC-ODD, documented]
- 680 KB -> 7.8 MB for 13 s at 720x1280 with `grain amount 0.035`. The recipe says "it costs video bitrate"; a number there (like this one) would help decide.
### 6. `check` uses a fixed 9-tile sheet that skips frame 0's state of the opening text   [none, just noting]
- The first frame is empty of text because the opening line fades in from 0.1 s; the sheet made that visible, which is good.

## Docs I read, and which answered my question (path or `help <word>` / `recipe <id>`); which did not
- quickstart.md, SKILL.md (all): workflow, anchors, null parents, sfx presets: answered.
- `recipe` (list), `recipe null-orbit`, `recipe count-up`, `recipe sfx-minimal` (did not show knobs), `recipe film-grain`: answered.
- `help music` (rests, tracks, bpm), `help format` (pad), `help fillColor` (colorSpace), `help ease` (did not answer quad vs cubic; the cheatsheet grep did).
- cheatsheet.md grep: rect `cornerRadius`, `trimEnd`, sfx knobs, `power1 = t^2`, path/line coordinates: answered (path only after the mistake).

## Wished the library had
- A `path`/`line` warning for `x`/`y` given together with absolute coordinates (stumble 2).
- `new --size WxH` that adapts the page CSS to a vertical or square canvas.
- A small "projectile" helper: `hop({ from, to, height, duration })` -> x/y keyframes with correct rise/fall timing (I solved the apex time by hand; bouncing balls are a common "satisfying" motif).

## Self-assessment: 3 honest weaknesses of the piece, and what I would change with 3 more cycles
1. The first frame has no text (the opening line fades in at 0.1 s); for a feed-scrolled short the hook should be on frame 0. I would start with the line already set and let only the ball blink.
2. In the final plate the protagonist is tiny (r = 9 px after the 0.4 pull-back) and its closed-eye "smile" is invisible; a slower second push-in on the socket, or a larger final scale with the title over the lower half, would keep the character readable.
3. The descent (2-6 s) is one uniform zigzag; satisfying but without variation. A slight acceleration of the hops (tempo up) or one near-miss would give the middle a beat of tension before the pause on the last ledge.
