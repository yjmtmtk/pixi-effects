# pixi-effects for an AI in a chat (no shell, no files)

You write ONE HTML file. The person opens it (or your chat previews it), watches, and can download an MP4 with the button in the player bar. You cannot run commands or look at the result, so you rely on two things: the rules below, and the red box the page shows when something is wrong (ask the person to paste its text back to you).

## Do this

1. Fetch `https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/chat-template.html` and copy it whole. (Use the `raw.githubusercontent.com` address; the normal github.com page does not return the file.) If you cannot fetch it, ask the person to paste it.
2. Replace only what is between `EDIT FROM HERE` and `EDIT UNTIL HERE`. Keep the rest: it loads the library from one CDN, collects warnings into a red box with a Copy button, and adds the player bar.
3. Give the person the whole file. Tell them: open it, press play (sound starts after the first click), use the download button (bottom right of the picture) for the MP4, and **if a red box appears, copy its text back to you**.
4. When they paste warnings, fix exactly what each one names. The messages say what to change ("did you mean …").

## The idea

A video is **data**: a list of layers in `sequences`. Each layer has `type`, a start `at` and a `duration` (seconds), `initial` values and `keyframes`. Repeated structure is a JS loop or function that returns layers. There is no per-frame code and no `Math.random()`.

```js
// @chat-example
const W = 1280, H = 720, FPS = 30, DURATION = 8;
const BACKGROUND = '#f3eee4';
const INK = '#2b2118', ACCENT = '#c0583a';

const sequences = [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: BACKGROUND } },
  {
    type: 'text', text: 'Rye & Sons', name: 'title', at: 0.4, duration: DURATION - 0.4,
    style: { fontFamily: 'Georgia, serif', fontSize: 110, fill: INK },
    initial: { x: 'GW/2', y: 300, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { alpha: 0, y: 330 }, to: { alpha: 1, y: 300 }, duration: 0.9, ease: 'power3.out' }],
  },
  {
    type: 'shape', shape: 'line', from: [420, 380], to: [860, 380], name: 'rule', at: 1.2, duration: DURATION - 1.2,
    initial: { strokeColor: ACCENT, strokeWidth: 4, trimEnd: 0 },
    keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 1, ease: 'power2.inOut' }],
  },
  {
    type: 'text', text: 'Bakers since 1952', name: 'tagline', at: 2.2, duration: DURATION - 2.2,
    style: { fontFamily: 'Georgia, serif', fontSize: 40, fill: INK, letterSpacing: 4 },
    initial: { x: 'GW/2', y: 430, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.8 }],
  },
  { type: 'audio', sfx: 'chime', at: 2.2 },
];
const POSTER = 4;     // the picture that stands for the video before play: its most striking moment
```

That is a complete, working video (the block between the two markers). Change the content, not the structure.

## Rules that prevent most failures

- **Time.** A layer's `at` is seconds from the start of the movie. A keyframe's `at` is seconds from the start of **its own layer** (negative = back from the layer's end). A layer is hidden after `at + duration`; give it a `duration` that reaches the end of its scene.
- **Order.** Layers are drawn in array order: later = on top. Put the background rect first.
- **Units.** Pixels from the top-left; angles in **degrees**; colours `'#rrggbb'`. Any number may be an expression string: `'GW/2'`, `'GH - 80'`, `'min(GW, GH) * 0.4'`.
- **Anchors.** `rect`, `circle`, `ellipse` are centred on `x, y`. **Text and image are top-left**: add `anchorX: 0.5, anchorY: 0.5` to centre them. A bar that grows from its base needs `anchorY: 1`.
- **Animate with keyframes.** `{ at, duration, ease, to: {...} }` animates to a value, `from: {...}` from one, `from` + `to` both (a delayed fade-in needs no `initial.alpha`), `set: {...}` jumps. Eases are GSAP names: `'power2.out'`, `'back.out(1.7)'`, `'none'`.
- **Draw a line on:** `trimEnd: 0` in `initial`, then a keyframe `to: { trimEnd: 1 }` (every shape except `arc`).
- **Shapes:** `shape: 'rect' | 'circle' | 'ellipse' | 'arc' | 'line' | 'polygon' | 'path'`. `rect`: `width height cornerRadius`; `circle`: `radius`; `line`: `from: [x, y], to: [x, y]` (canvas coordinates, no `x, y`); `path`: `d` (SVG path data). Style: `fillColor strokeColor strokeWidth fillAlpha`.
- **Text:** `style` is a PixiJS text style (`fontSize fontFamily fontWeight fill letterSpacing align wordWrap wordWrapWidth lineHeight`). Use fonts that exist everywhere (`Georgia, serif`, `Arial, sans-serif`, `ui-monospace, monospace`); this page loads no web fonts. Estimate a text's width at about 0.6 × `fontSize` per character, keep important text 5 % away from the edges, and keep the bottom 60 px free (the player bar covers it in the preview, not in the file).
- **Scenes.** Stack layers with `at` / `duration` over an opaque background rect. Do not remove layers.
- **Sound with no files:** `{ type: 'audio', sfx: 'swoosh', at: 2 }`. Presets: `click pop swoosh swipe hit riser chime beep coin glitch typewriter`; optional `pitch`, `brightness`. A `riser` is loudest at its **end**: start it `duration` seconds before the hit. This page cannot load music or images from your own files; use shapes, text, sfx and `music` (below).
- **Repeat with code, never by copying:** `Array.from({ length: 12 }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 20, at: i * 0.15, duration: DURATION - i * 0.15, initial: { x: 120 + i * 90, y: 360, fillColor: '#ffd166' }, keyframes: [{ at: 0, from: { scale: 0 }, to: { scale: 1 }, duration: 0.4, ease: 'back.out(2)' }] }))` returns twelve layers: spread them into `sequences` with `...`.
- **Helpers already imported** in the template: `kenBurns` (slow zoom for an image layer), `withFade`, `wiggle` (seeded shake as keyframes), `stagger`, `animateText` (per letter / word entrances), `followPath`, `particles` (seeded confetti / snow / sparks as layers), `deck` (slides). Each returns keyframes or layers: `keyframes: wiggle(...)`, `...particles(...)`. The full signatures are in `https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/reference/cheatsheet.md` (22 KB; read it only if you need a helper).
- **Not available on this page:** named filters beyond `blur`, `noise`, `alpha`, `colorMatrix` (the other 38 need the `pixi-filters` package), three.js layers, your own image / video / music files. Say so rather than guessing.

## Music with no file

Write the tune as text: an audio layer with `music`. Tracks of notes and chords, optional drums, a tempo. The unit is the **beat** (a quarter note; a 4/4 bar is 4 beats; make every track the same length).

```js
// @chat-music
const W = 1280, H = 720, FPS = 30, DURATION = 22;
const BACKGROUND = '#0e1a2b';

const sequences = [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: BACKGROUND } },
  {
    type: 'text', text: 'Snowfall', name: 'title', at: 1, duration: DURATION - 1,
    style: { fontFamily: 'Georgia, serif', fontSize: 120, fill: '#e8f1ff', letterSpacing: 6 },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 2.5 }],
  },
  { type: 'audio', volume: 0.8, music: {                 // a slow 6/8 lullaby in F major: 8 bars of 3 beats
    bpm: 72, grid: 2, reverb: 0.3, seed: 5,
    tracks: [
      { inst: 'musicbox', vol: 0.8, notes: 'a5:1.5 c6:1.5 | a5:1 g5:0.5 f5:1.5 | d6:1.5 a5:1.5 | bb5:1 a5:0.5 g5:1.5 | g5:1.5 d6:1.5 | e6:1 d6:0.5 c6:1.5 | a5:1 c6:0.5 f6:1.5 | f6:3' },
      { inst: 'pluck', vol: 0.45, pan: -0.2, step: 0.5, notes: 'f3 a3 c4 a3 c4 a3 | f3 a3 c4 a3 c4 a3 | d3 f3 a3 f3 a3 f3 | bb2 d3 f3 d3 f3 d3 | g3 bb3 d4 bb3 d4 bb3 | c3 e3 g3 e3 g3 e3 | f3 a3 c4 a3 c4 a3 | f3 a3 c4 g4 c4 a3' },
      { inst: 'pad', vol: [[0, 0], [6, 0.5]], attack: 1.2, notes: '[f3 a3 c4]:6 [d3 f3 a3 c4]:3 [bb2 d3 f3 a3]:3 [g2 bb2 d3 f3]:3 [c3 e3 g3 bb3]:3 [f3 a3 c4]:3 [f3 g3 a3 c4]:3' },
    ],
  } },
];
const POSTER = 8;
```

Every token is a note (`c4`, `f#3`, `Bb2`) with its length in beats after a colon, a chord by name (`Am7`, `Dsus4`, `C@4`, `Am7/e`) or written out (`[c4 e4 g4]:2`), a rest `_`, or a hold `~`; `|` is ignored. Instruments: `keys pluck pad bass sub lead bell musicbox`. Drums: `drums: [{ from: 8, kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo' }]` (16 steps = one 4/4 bar; `from` is a beat; `x` hit, `o` soft, `.` nothing; also `openhat clap rim tom crash shaker sleigh`). Shape it with `swing: 0.16` (a lilt), `reverb`, a track's `vol: [[0, 0], [8, 0.7]]` (a fade-in over 8 beats), `tone` (darker when lower), `transpose`, and a slowing tempo `bpm: [[0, 96], [28, 96], [32, 60]]`. Use `loop: true` on the layer to repeat a short tune under a long video. A mistake prints a warning in the red box that names the track and the token. Keep 3 to 6 tracks, vary the bars, end on the home chord.

## Check your own work before you answer

Read your file once for these: every layer has a `type`; every keyframe `at` is inside its layer's lifetime; text is anchored where you meant; layer `duration`s reach the end of their scene; colours have enough contrast; nothing important sits near the edges. A mistake in the data prints a warning in the red box; the person's paste is your test run.

## If the preview is blank

A blank preview with no red box usually means the chat's preview window blocks external scripts or does not allow `eval`. Tell the person to **save the file as `video.html` and open it in a browser** (Chrome, Edge or Firefox on a computer); that always works.

More: the full skill (`ai/SKILL.md`) and pitfalls (`ai/reference/pitfalls.md`) are for an AI with a shell and a browser; this page is the short version for a chat.
