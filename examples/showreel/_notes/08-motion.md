# 08-motion — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 5 check runs (1 full export)   Result: works

## Went smoothly because the docs said so
- The `rewind-and-replay` recipe and pitfalls 65 / 69 / 70 gave the whole clock (`time` keyframes on a composition: play, freeze, rewind, slow motion) at once.
- `duration: 'auto'` plus the settle times in the cheatsheet (`wobbly` 1.61 s / 1.40) let me size the race (content length, finish line) before drawing a frame.
- `wiggle({ at, duration, props })` on a composition's `x` / `y` just worked and ended back at `around`, so the stage is calm again at the end.

## Stumbles
### 1. Composition `duration` is also the life of its own `time` keyframes   [GAP]
- tried: `type: 'composition', duration: LEN (1.5)` with `time` keyframes spread over the movie's 0.8–6.2 s.
- happened: `layer "race": keyframes[1] starts at 2.3s, after the layer ends (duration 1.5s), so it never plays.` (3 warnings + "1 more").
- cause: I used `duration` as "the length of the content" (the content length rule is max(duration, farthest time)), but `duration` is the layer's life in OUTER time, and the `time` keyframes' `at` count from the layer start in outer time.
- would have prevented it: one line in the composition entry of the cheatsheet / pitfall 69: "with `time` keyframes the composition's `duration` must reach the last keyframe (it is outer time); the content length is a separate thing that comes out of the `time` values".

### 2. The spring needs room: overshoot can leave the margins   [MY-MISTAKE]
- tried: finish line at x 1500, `spring.bouncy`.  - happened: no error, but a spring with 1.28x (and wobbly 1.40x) travel would overshoot to x ~1890.  - cause: overshoot is a multiple of the whole travel, not of the end point.
- would have prevented it: nothing missing (the table of "highest value" was enough), just worth a line in the spring recipe: "the dot overshoots by (peak - 1) x travel: leave that room".

### 3. `sed -i` on macOS   [TOOLING]
- `sed -i "s/…/"` fails with "invalid command code e" (BSD sed wants `-i ''`); nothing to do with the library.

## Wished the library had
- A way to read the remapped time as a number for another layer (here I wrote the same `time` keyframes twice, once on the composition and once as the x of a playhead tick: a `clock: 'race'` or `time` expression that follows a named composition's local time).
- `check --at` could print the composition's local time at each moment (it is easy to lose track of what second of the content a frame shows inside a remapped composition).
