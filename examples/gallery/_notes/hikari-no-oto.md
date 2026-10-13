# hikari-no-oto - usability notes
Model: opus   Slot: S16-lyric-vertical   Cycles: 6   Result: works
Timeline: started 12:52; first page that rendered at +12 min; first contact sheet looked at at +12 min; done at about +45 min (the machine clock printed odd times; approximate)

## Went smoothly because the docs said so
- quickstart.md + SKILL.md were enough to write the whole first version; the first check had no warnings.
- `help music` answered everything for a 4-track score (notes as text, `vol` as `[beat, level]` points, `ring`, `reverb` per track); the check's `music` read-back confirmed every line lands where I counted.
- `help shader`: the bottom-left origin and "a colour uniform is a vec3" were stated, so the ripple shader worked first time.
- `help blur` led to the named-filter table: `'filters.soft.strength'` keyframes for a blur-in worked first time.

## Stumbles
### 1. `--out check-out` writes straight into check-out/, not check-out/<name>/   [SPEC-ODD]
- tried: `check hikari-no-oto.html --out check-out` (as the brief says)
- happened: files land in check-out/sheet.png; SKILL.md says `check-out/<name>/sheet.png`. Harmless, only a doc mismatch for the `--out` case.
- would have prevented it: one clause in SKILL.md: "(with `--out dir`, the files go straight into dir)".
### 2. No vertical (tategaki) text   [GAP]
- tried: looked for a vertical writing mode for Japanese.
- happened: none found in help; I placed one text layer per glyph with a loop (works, and lets every syllable land on its own note, so here it was even the better choice).
- would have prevented it: a line in `help vertical` / cheatsheet: "vertical Japanese: no writing-mode; split into glyph layers, rotate ー and shift small kana (ゃっ) and 、。 by hand".
### 3. A slow push-in on everything means hand-converting coordinates   [GAP]
- tried: a 4 % scale on the whole page via a `null` rig (the docs explained null/parent clearly).
- happened: worked, but every child's x/y becomes relative to the null's origin, so I wrote a `rel()` helper, and a `from: { y }` keyframe needs the relative value too. The shader layer cannot have the rig as a parent in the way the ripples need (its centre is a uniform), so I keyframed `uniforms.cx/cy` with the same ease to stay on 「音」.
- would have prevented it: a camera-less "zoom the whole composition" knob (e.g. `composition.scale` keyframes), or a recipe line "push-in on a 2D page: null rig + rel() helper; move shader uniforms with the same ease".
### 4. Landing glyph was an unreadable blob in the first look   [MY-MISTAKE]
- tried: blur 10 + glow + scale 1.35 together on 「音」 for 0.8 s.
- happened: at 9.8 s the climax word was a blurred orange smudge. Shortened the blur to 0.35 s and scale to 1.25. Found only by looking at `--at 9.8`; no tool can know this.
### 5. Wall-clock / timing of syllables: I computed note times myself   [SPEC-ODD, minor]
- `musicEvents()` exists for this; with a constant bpm and `humanize: 0`, `beat * 60 / bpm` was simpler and the check's read-back confirmed it. Worth one line in `help music`: "constant tempo + humanize 0: time = beat * 60 / bpm, musicEvents is for tempo maps".

## Docs I read, and which answered my question
- quickstart.md, SKILL.md: enough for the structure, harness, check loop. Answered.
- `help music`: full answer (score syntax, per-track reverb/ring/vol points). Answered.
- `help shader`: origin, uniforms, keyframing uniforms. Answered.
- `help blur`: led to the named-filter table (`grain`, `glow`, `blur`, animating `filters.<name>.<opt>`). Answered.
- `help null`: parent rig. Answered.
- `help vertical`, `help tategaki`: nothing about vertical Japanese text (only about vertical video formats). Not answered.

## Wished the library had
- Vertical Japanese text (`style.writingMode: 'vertical'` or an `animateText(..., { vertical: true })` that lays out glyph layers top-to-bottom, rotates ー and offsets small kana / 、。).
- A whole-composition 2D zoom/pan that does not need a null rig and relative coordinates.
- A "ripple" helper (concentric rings from a point on a beat) — I wrote it in GLSL; fine, but a common motif for sound visuals.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The middle (2-9 s) is only glyphs arriving; restrained, but a viewer scrolling a feed gets no visual event until 9.6 s. I would add a faint per-line ripple (much smaller than the 「音」 one) at each line start, or let each column's rule brighten as its line is written.
2. The first frame is nearly black (the spark fades in from 0); for a short, frame 0 should already show the rules or the spark.
3. The sound: the arrival on 「音」 is musically a held note, so the loudness drops from -15 to -20 dB RMS at the climax. A soft low swell or a second bell voice there would make the visual peak and the sonic peak coincide.
