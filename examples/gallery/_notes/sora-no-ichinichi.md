# sora-no-ichinichi - usability notes
Model: opus   Slot: T22   Cycles: 8   Result: works
Timeline: started 13:49; first page that rendered at +10 min; first contact sheet looked at at +11; done at +14 min after the full check (about 14:05, roughly 16 min wall clock)

## Phase 1: reading (13:49 - 13:55)
- Read BRIEF, AGENTS.md (already in my context from the repo CLAUDE.md, same text as the raw GitHub one), quickstart.md, SKILL.md, `help shader`, `help music`, `help animateText`, `help blur`.
- `new sora-no-ichinichi --duration 13` worked first time and printed the next commands.
- Plan: one full-frame shader layer (sky + sea + sun + stars + clouds + grain) driven by a single uniform `hour`, keyframed by one schedule array that also drives a hairline 24 h scale marker; Japanese time words (暁 朝 昼 夕 宵 夜) bottom-left; title at night; pad/bass/bell score at 80 bpm (bar = 3 s) with the day's phases on bar lines.

## Phase 2: build and look (13:55 - 14:20), cycles 1-5
- First page rendered at about +10 min, first contact sheet looked at at +11 min. `check` was clean (no warnings) at the first run: the shader compiled first time.
- Cycle 1 sheet: the sea's sun glints were blocky squares (my value noise at too low a vertical frequency near the bottom), the night (9.5-13 s) was nearly black and empty, the label clocks were fixed strings that disagreed with the moving scale marker (17:25 printed while the marker stood at 18:30).
- Cycle 2: glints with a perspective-scaled frequency, a moon with its own reflection, a lighter night palette, a live clock above the marker (`set: { text }` keyframes generated for every 5-minute change: 140-odd keyframes, no problem), an italic English gloss under each reading instead of the clock.
- Cycle 3: crescent moon (two discs subtracted).
- Cycle 4: the 24 h scale now records the day: a 4 px transparent shader layer that paints each hour's horizon colour up to the current hour, sharing the palette GLSL with the sky. By the end the scale is an abstract colour chart of the day.
- Cycle 5: the ribbon was washed out at midday (I multiplied by 1.25); mixed more zenith blue in.
- Cycle 6-8: title blur-in shortened (1.8 s to 1.4 s) so the final composition holds about a second; full check: no warnings, no layout issues, export 2.47 MB, 13.03 s, -17.6 LUFS; the full check (load + inspect + export + decode) took 46 s.

## Went smoothly because the docs said so
- `help shader` answered everything I needed in one screen: `mainImage`, bottom-left `fragCoord`, `iTime`/`iFrame`, a number uniform is a float and keyframes move it as `'uniforms.hour'`, `transparent: true` with premultiplied alpha, a small layer sits by its top-left corner at `initial.x/y`. Const arrays, a constant-bound loop and helper functions all compiled first time.
- `help music`: beats, chord names, `vol` as `[beat, level]` points, `attack`/`release`/`ring`/`reverb` per track. The check's music read-back (bars per track) confirmed the score was what I meant without listening.
- `set: { text }` (from `help set`) made a live clock trivial: I generate one keyframe per change in a loop.
- One JS schedule array drove three things (the sky uniform, the marker's x, the clock's x) through generated keyframes, and they stayed in sync: the data model makes this natural.
- Named filter animation (`filters: [{ type: 'blur', name: 'soft' }]` + `'filters.soft.strength'`) worked as documented for the title's focus-pull.

## Stumbles   (one entry each, also small ones)
### 1. Blocky sun glints on the sea   [MY-MISTAKE]
- tried: value noise in perspective coordinates with a sharp `smoothstep` threshold.
- happened: square blocks near the bottom of the frame (no warning: a picture problem only the sheet shows).
- cause: too low a vertical frequency where the perspective coordinate changes slowly.
- would have prevented it: nothing in the library; the contact sheet caught it on the first look.
### 2. A fixed clock string next to a moving marker   [MY-MISTAKE]
- tried: each time word printed the clock computed at its start.
- happened: "17:25" printed while the marker already stood past 18:00. Only visible in a full-size frame.
- would have prevented it: n/a (design error); fixed with `set: { text }` keyframes.
### 3. No way to share GLSL between two shader layers except string concatenation   [GAP, small]
- tried: the colour-record ribbon needs the same palette function as the sky.
- happened: works fine by concatenating a JS string (`PALGLSL + ...`); just noting that the docs do not mention that `fragment` is plain text you can assemble (obvious to a JS writer, maybe not to everyone).
- would have prevented it: one sentence in `help shader`: "fragment is a string: build shared functions in JS and concatenate".
### 4. AGENTS.md says "use WebFetch on the raw URL" (the brief), but the same text was already in my context   [SPEC-ODD]
- I did not fetch it again; it is the same file as the repository's AGENTS.md.
### 5. A clock in HH:MM cannot be a `{value}` counter   [GAP, small]
- tried: wanted an animated hours:minutes readout.
- happened: `{value}` prints one number; I generated ~140 `set: { text }` keyframes instead (works, deterministic, no warning).
- would have prevented it: a `format` option on counters (e.g. `'time'` -> `HH:MM` from hours), or a line in `help counter` saying "for a clock, generate `set: { text }` keyframes".

## Docs I read, and which answered my question
- quickstart.md, SKILL.md: answered the workflow; the shader / music / set paragraphs are what I used.
- `help shader`: complete for my needs. `help music`: complete. `help set`: answered (live text). `help animateText` / `help blur`: I only needed the blur filter naming (the blur hit landed on the named-filters section, which answered it).
- I did not need the cheatsheet or pitfalls.

## Wished the library had
- A time/clock format for `{value}` counters.
- `check` printing how long the export itself took (I timed the whole command: 46 s).

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. Midday (4-6 s) is the least distinctive stretch: a white sun on a blue sky reads as a stock sky render, less abstract than dawn and dusk. I would desaturate the noon sun and let the sky go almost white-blue and flat (a Turrell-like field) so the middle is quiet rather than literal.
2. The small type (13 px reading, 11 px clock, 10 px hour numbers) is near the limit at 1280x720; on a phone it disappears. I would raise the reading to 15 px and the clock to 12 px.
3. The piece opens on ~0.8 s of near-black and the moon pops in quickly (9.0-9.4 s) with a strong halo that then dims as the night palette darkens. I would start the fade earlier and give the moon a slower, steadier rise; and the sound has no event that marks the title (a single low bell on the title's arrival would close the piece more deliberately).
