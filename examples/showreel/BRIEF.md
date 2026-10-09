# The reel: brief for the author of ONE chapter

You are a **motion designer** making ONE chapter of an 80-second video that shows everything the JavaScript library **pixi-effects** can do. The reel is the
library's front door: it will be posted on X and on the project's site. People watch it **on a phone, often with the sound off**, and decide in two seconds
whether to keep watching. Your chapter has one job: make ONE capability of the library unmistakable, beautiful, and obviously made from data.

Repo: `/Users/tomotakayajima/Desktop/yjm/git/pixi-effects`. The table of chapters, their lengths and ideas is `examples/showreel/chapters.json`: your row has
your `id`, your exact `duration` (seconds) and the `idea`. Read the other rows too, so you know what your neighbours show and do not repeat them.

## What you may read
`ai/SKILL.md` first (follow its workflow), then `ai/reference/cheatsheet.md`, `recipes.md`, `pitfalls.md`; `docs/dsl.md`, `README.md`, `examples/*.html`,
`examples/gallery/*.html` (finished pieces: look for ideas, never copy a whole piece), `dist/*.d.ts`. **Do not read** `src/`, `tests/`, `docs/superpowers/`,
`node_modules/`, `dist/*.js`. No git, no npm. Do not edit anything but your own files (below). Run ONE Chrome at a time (many authors share this machine).

## Your files (and only these)
- `examples/showreel/chapters/<your id>.js` — the chapter. It replaces a placeholder that is there now.
- `examples/showreel/_notes/<your id>.md` — your stumble notes (format at the end).
- (the sound chapter only) `examples/showreel/music.js`, the music of the whole reel.

## The shape of a chapter file
ONE function and nothing else (the build inlines it into a single page, and fails with a clear message if the file has an `import`, a second export or other top-level code):

```js
export default function chapter(P) {
  const { C, F } = P;                       // palette and font stacks
  return {
    duration: 8,                            // EXACTLY the number in chapters.json
    assets: [],                             // optional: [{ name: '<id>-grid', src: '<data URL drawn on a canvas>' }] (names start with your id)
    poster: 4.2,                            // optional: the moment that stands for the chapter in a thumbnail (seconds)
    sequences: [ P.bg(C.ink), ...P.tag('03', 'SPACE', 'a camera moves through cards in depth'), /* your layers */ ],
  };
}
```
`P` is everything `pixi-effects` exports at run time (`animateText`, `splitText`, `measureText`, `stagger`, `particles`, `wiggle`, `followPath`, `cameraPath`, `orbit`,
`deck`, `react`, `bpmEnvelope`, `musicEnvelope`, `kenBurns`, `withFade`, `random`, `rand`, `noise`, …), plus:
- `P.C` — the palette: `ink #0b0d12`, `ink2 #141824`, `bone #f2ede4`, `dim #98a1b3`, `red #ff5a36` (the signal colour), `cyan #38c8ff`, `gold #ffd166`.
- `P.F` — font stacks: `display` (Arial Black), `sans`, `serif`, `mono`, `jp` (Japanese). System fonts only: nothing is loaded.
- `P.tag(n, title, caption, opts)` — the label every chapter wears (`03 / SPACE` top left, one line of caption bottom left). **Use it**: it is what makes twelve chapters read as one piece.
- `P.bg(color)` — a full-frame opaque background layer.
- `P.facts`, `P.music` — see the chapters that use them (`11-source`, `09-sound`). In the one-chapter check page they are empty / sample values.

## Hard rules (the reel breaks without them)
1. **Canvas 1920 × 1080, 30 fps.** Positions and sizes are in those pixels (`GW` = 1920, `GH` = 1080 in expressions).
2. **Your first layer is a full-frame opaque background** (`P.bg(...)`, any colour). Chapters are joined by transitions that blend two whole chapters.
3. **The first 0.6 s and the last 0.6 s are the transition**: the neighbour is dissolving, wiping or irising over you. Keep those edges calm (settled, no key moment, no text arriving or leaving there).
4. **Margins: 96 px left and right, 54 px top and bottom.** Nothing important outside them, nothing cut off.
5. **Text must survive a phone**: nothing under 34 px, body lines 44 px or more, the display word as big as you dare. The sound is off for most viewers, so everything the chapter says is on screen.
6. **Data only, procedural only.** No external images, fonts or video. Imagery is shapes, gradients, shaders, canvas-drawn data URLs. No `{ type: 'custom', filter: <object> }` and no functions inside the spec (the last chapter prints the reel's data, so it must be plain data); named filters (`{ type: 'glow', … }`) are fine. Presets (`animateText(...)`) are fine: they return plain data.
7. **Sound**: short `sfx` hits in your chapter are welcome (`{ type: 'audio', sfx: 'swoosh', at, volume }`; volume 0.3–0.6: the music is the bed). No music in chapters (the sound chapter writes the reel's music). The chapter must still work completely muted.
8. **Name your layers** (`name: 'title'`), and keep every name unique inside your chapter.
9. **Honest**: show real features of the library doing real work. Do not fake a feature with a trick that hides what the library does.

## The design (what makes it a reel and not a tutorial)
- **One idea, shown so clearly that a stranger gets it in two seconds**, then developed, then a held end beat. A big word or number does the talking; the caption (`P.tag`) says in one plain line what is on screen.
- **Palette**: ink and bone carry it, vermilion is the signal; at most ONE guest hue (cyan or gold, or one your feature needs) used with intention. Shaders and light may use more colour inside their picture.
- **Type**: a huge display word (Arial Black, or serif for contrast), mono captions. A clear hierarchy of three sizes at most.
- **Motion language**: confident and unfussy. Entrances `power3.out`, moves `power2.inOut`, no bounce unless the chapter is about springs. Stagger instead of everything at once. Pauses are design: leave beats of stillness.
- The look is **flat, graphic and sharp** with depth only where the chapter is about depth. No clutter, no clip-art, no screensaver.
- A viewer scrolling a feed sees only the first ~2 s of YOUR chapter if they are reading the clips separately (each chapter is also cut out as a short clip): make the first beat after the transition already show the idea.

## How to check your chapter alone
```
node ai/tools/check.mjs examples/showreel/chapter.html --query ch=<your id> --no-export --at 0.8,2,4,6 --out /private/tmp/claude-501/reel-<your id>
```
It plays only your chapter, prints library warnings (each says what to change), layout problems (text cut off, collisions) and, with `--at`, writes `at.png` (pictures of
the moments you name) — **open the PNGs with the Read tool and LOOK** at the first and last second, the middle, and every key beat. `warnings  none` is required. Iterate with
`--no-export --at <the moment you changed>` (seconds); do ONE full run (without `--no-export`) at the end to prove it exports. At most ~12 edit/run cycles.
`ai/tools/check.mjs --help` lists the options. The page is `examples/showreel/chapter.html?ch=<id>` if you want to look at it yourself.

## Stumble notes (`examples/showreel/_notes/<id>.md`): this is half of your job
Write it as you go. One entry per stumble (also small ones); things that were *easy* thanks to the docs deserve one line at the top.
```
# <id> — stumble notes
Model: <your model> (Claude <name>, self-reported)   Cycles: N   Result: works | partly

## Went smoothly because the docs said so
- ...
## Stumbles
### 1. <short title>   [GAP | WRONG | LIBRARY-BUG | SPEC-ODD | MY-MISTAKE | TOOLING]
- tried: ...   - happened: ... (exact warning text)   - cause: ...   - would have prevented it: <a doc line / a warning / an API change>
## Wished the library had
- ...
```

## Final message (≤ 20 lines)
`<id>: works | partly`, the files, one line of concept, what each key beat shows, the `check` result (warnings, problems, export size), and the 3 most important stumbles.

## Known limits of the harness (found by the first twelve authors)
- A chapter cannot see the reel's plan: if it needs the reel's clock (the sound chapter does), it hardcodes the chapter's start and the music's start, and must be updated when durations change.
- In the one-chapter check the music is absent, so `the mix is quiet` / `silent from …` notes are expected (the chapter's sfx are measured alone).
- A `deck()` inside a chapter: wrap both `d.composition.sequences` and `d.composition.transitions` in your own `{ type: 'composition' }` layer; the chapter object has no `transitions` key.
- Hide a text layer with `alpha: 0`, not `set: { visible: false }` (the check reports a hidden text as "has no size").
- `inspect` ignores masks, so a text hidden by a matte still counts in the overlap review.
- `volume` 0.5–0.7 on the music tracks gives about −23 LUFS (the score is normalised); the shipped reel uses `volume: 1.22` to land at −18 LUFS.

