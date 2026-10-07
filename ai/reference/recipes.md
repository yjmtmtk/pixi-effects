# pixi-effects recipes

Copy, adapt, run. Every block marked `@recipe` is a function body that **returns the composition's `sequences`** (or `{ sequences, transitions, duration }`); the repo's tests build each one and fail on any warning, so they stay correct. Blocks marked `@docs-only` need a browser (canvas / three.js) and are not executed by the tests.

Assumed canvas: 1280×720 @ 30 fps. `kenBurns`, `withFade` and `orbit` come from `pixi-effects`.

---

## Words that slam in on the beat (kinetic type)

Slam = big scale + tiny rotation easing out fast, plus a white flash rect on the beat. Keyframe `at` is local to the layer, so every word's keyframes start at `0`.

```js
// @recipe slam-words
const WORDS = [['KAFFE', '#ffd166'], ['NORD', '#ef476f'], ['ROAST', '#06d6a0']];
const BEAT = 0.5;                                    // seconds per beat
const sequences = [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#111111' } },
];
WORDS.forEach(([word, color], i) => {
  const at = i * BEAT * 2;
  sequences.push({
    type: 'text', text: word, at, duration: BEAT * 2,
    style: { fontSize: 'GH * 0.4', fontWeight: '900', fill: color, fontFamily: 'Arial Black, Arial, sans-serif' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { scale: 2.6, rotation: -5, alpha: 0 }, to: { scale: 1, rotation: 0, alpha: 1 }, duration: 0.16, ease: 'expo.out' }],
  });
  sequences.push({                                   // white flash on the beat
    type: 'shape', shape: 'rect', width: 'GW', height: 'GH', at, duration: 0.3,
    initial: { x: 'GW/2', y: 'GH/2', fillColor: '#ffffff', alpha: 0.8 },
    keyframes: [{ at: 0, to: { alpha: 0 }, duration: 0.28 }],
  });
});
return sequences;
```

Size text by eye: Arial Black glyphs are ~0.8 × fontSize wide, monospace ~0.6 ×. Leave ~7 % of the frame for a hold-scale.

---

## Lower-third revealed by a wipe mask

A `mask` is a layer in the **parent's** coordinate space and does **not** move with the layer it masks: reveal by growing the mask's `width` from a fixed left edge (`anchorX: 0`); exit by moving the left edge to the right while the width shrinks to 0. Rects are centred by default, hence `anchorX: 0`.

```js
// @recipe lower-third
const bar = (name, y, w, h, color, at) => ({
  type: 'shape', shape: 'rect', name, width: w, height: h, anchorX: 0, at, duration: 3.6,
  initial: { x: 80, y, fillColor: color },
  mask: {
    type: 'shape', shape: 'rect', width: 0, height: h, anchorX: 0,
    initial: { x: 80, y, fillColor: '#ffffff' },
    keyframes: [
      { at: 0, to: { width: w }, duration: 0.5, ease: 'power3.out' },                    // reveal
      { at: -0.5, to: { x: 80 + w, width: 0 }, duration: 0.5, ease: 'power3.in' },        // exit
    ],
  },
});
return [
  bar('name-bar', 600, 520, 56, '#e63946', 0.2),
  bar('title-bar', 656, 420, 40, '#1d3557', 0.35),
  { type: 'text', text: 'JANE DOE', at: 0.5, duration: 3, style: { fontSize: 34, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: 100, y: 600, anchorX: 0, anchorY: 0.5, alpha: 0 },
    keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }, { at: -0.4, to: { alpha: 0 }, duration: 0.3 }] },
];
```

---

## A ticker that scrolls out completely (`w` = the text's own width)

`'-w'` is the exact x at which the text has left the screen on the left (`w` is measured after the style is applied).

```js
// @recipe marquee
return [{
  type: 'text', text: 'BREAKING NEWS  •  MARKETS RALLY  •  NEW RECORD SET', duration: 8,
  style: { fontSize: 30, fontWeight: 'bold', fill: '#ffffff' },
  initial: { x: 'GW', y: 670, anchorX: 0, anchorY: 0.5 },
  keyframes: [{ at: 0, to: { x: '-w' }, duration: 8, ease: 'none' }],
}];
```

---

## Numbers that count up

A text layer has an animatable number, `value`, printed wherever the text has `{value}`. Animate it with ordinary keyframes (ease, `from`/`to`, `repeat`).

```js
// @recipe count-up
return [{
  type: 'text', text: '{value}', format: { grouping: true },            // → "2,480"   (decimals: 0 by default)
  style: { fontSize: 96, fontWeight: 'bold', fill: '#ffffff' },
  initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, value: 0 },
  keyframes: [{ at: 1, to: { value: 2480 }, duration: 1.2, ease: 'power3.out' }],
}];
```

Prefixes and suffixes go in the text (`'${value}'`, `'{value} users'`, `'{value}%'`). If a bar must stay locked to its counter, give both the same `at`, `duration` and `ease` — see the bar chart below.

---

## Data-driven bar chart

Generate the whole spec from the data. Bars grow from the baseline (`anchorY: 1` + a `height` keyframe); each value label rides the top of its bar and counts up with the same ease and timing, so they stay locked. A line's `from` / `to` are plain canvas coordinates (give `x,y` only to move it). A callout pill must be sized from its text.

```js
// @recipe bar-chart
const data = [['Mon', 12], ['Tue', 30], ['Wed', 22], ['Thu', 41], ['Fri', 35]];
const max = Math.max(...data.map(d => d[1]));
const step = [1, 2, 2.5, 5, 10].map(m => m * 10 ** Math.floor(Math.log10(max / 4))).find(v => max / v <= 5) ?? 10;
const NICE = Math.ceil(max / step) * step;                    // axis top, so the chart survives changed data
const BASE = 600, CHART_H = 380, BAR_W = 90, GAP = 40, DUR = 0.9, EASE = 'power3.out';
const X0 = (1280 - (data.length * BAR_W + (data.length - 1) * GAP)) / 2, X1 = X0 + data.length * BAR_W + (data.length - 1) * GAP;
const sequences = [];
for (let v = 0; v <= NICE; v += step) {                       // grid lines + tick labels
  const y = BASE - CHART_H * v / NICE;
  sequences.push({ type: 'shape', shape: 'line', from: [X0 - 20, y], to: [X1 + 20, y], initial: { strokeColor: '#33405c', strokeWidth: 1 } });
  sequences.push({ type: 'text', text: String(v), style: { fontSize: 20, fill: '#7f8bb0' }, initial: { x: X0 - 32, y, anchorX: 1, anchorY: 0.5 } });
}
const best = data.findIndex(d => d[1] === max);
data.forEach(([label, value], i) => {
  const x = X0 + i * (BAR_W + GAP) + BAR_W / 2;
  const at = 0.4 + i * 0.12;
  const h = CHART_H * value / NICE;
  sequences.push({
    type: 'shape', shape: 'rect', width: BAR_W, height: 0, cornerRadius: 8, anchorY: 1, at, colorSpace: 'oklab',
    initial: { x, y: BASE, fillColor: '#4f6df5' },
    keyframes: [
      { at: 0, to: { height: h }, duration: DUR, ease: EASE },
      ...(i === best ? [{ at: 4 - at, to: { fillColor: '#ffd166' }, duration: 0.5 }] : [{ at: 4 - at, to: { alpha: 0.45 }, duration: 0.5 }]),   // highlight the maximum at t = 4 s
    ],
  });
  sequences.push({                                            // value label: counts up while riding the bar's top
    type: 'text', text: '{value}', at,
    style: { fontSize: 28, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x, y: BASE - 14, anchorX: 0.5, anchorY: 1, value: 0 },
    keyframes: [{ at: 0, to: { value, y: BASE - h - 14 }, duration: DUR, ease: EASE }],
  });
  sequences.push({ type: 'text', text: label, at, style: { fontSize: 26, fill: '#aab4d4' }, initial: { x, y: BASE + 16, anchorX: 0.5, anchorY: 0 } });
});
// callout: a pill sized from its text (~0.58 x fontSize per glyph + padding), a pointer triangle, clamped inside the plot
const text = 'Peak: ' + data[best][0] + ' ' + max, FS = 26;
const PW = text.length * FS * 0.58 + 44, cx = Math.min(Math.max(X0 + best * (BAR_W + GAP) + BAR_W / 2, X0 + PW / 2), X1 - PW / 2), cy = BASE - CHART_H - 70;
sequences.push({ type: 'shape', shape: 'rect', width: PW, height: 52, cornerRadius: 26, at: 4.2, initial: { x: cx, y: cy, fillColor: '#ffd166', alpha: 0 },
                 keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }] });
sequences.push({ type: 'shape', shape: 'polygon', points: [[-10, 0], [10, 0], [0, 12]], at: 4.2, initial: { x: cx, y: cy + 32, fillColor: '#ffd166', alpha: 0 },
                 keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }] });
sequences.push({ type: 'text', text, at: 4.2, style: { fontSize: FS, fontWeight: 'bold', fill: '#1b1b2f' }, initial: { x: cx, y: cy, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
                 keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }] });
return sequences;
```

---

## Letters that fly in from depth (2.5D title)

One `threeD` text layer per letter, staggered; monospace so the advance is predictable (~0.6 × fontSize). `fov` eases while `z` auto-follows it, so the `z = 0` plane (the title) stays put. Letters start at `z: 560`, which must stay **below the camera distance** (≈ 808 at `fov` 48) or they are hidden. `dropShadow` glow needs `padding` (≥ 2 × blur).

```js
// @recipe depth-title
const TEXT = 'PIXI EFFECTS', SIZE = 118, ADV = SIZE * 0.602;
const letters = [...TEXT].flatMap((ch, i) => ch === ' ' ? [] : [{
  type: 'text', text: ch, threeD: true,
  style: {
    fontSize: SIZE, fontWeight: '800', fill: '#3de0ff',
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    dropShadow: { color: '#5b6cff', blur: 20, distance: 0, alpha: 0.9 }, padding: 48,
  },
  initial: { x: 640 + (i - (TEXT.length - 1) / 2) * ADV, y: 330, anchorX: 0.5, anchorY: 0.5, z: 560, rotationY: 75, rotationX: -45, alpha: 0 },
  keyframes: [
    { at: 0.55 + i * 0.075, to: { z: 0, rotationY: 0, rotationX: 0 }, duration: 1.0, ease: 'expo.out' },
    { at: 0.55 + i * 0.075, to: { alpha: 1 }, duration: 0.3 },
    { at: 0.7 + i * 0.075, to: { fill: '#f4f6ff' }, duration: 0.8, ease: 'sine.out' },      // colour flash on landing
  ],
}]);
return [
  { type: 'camera', initial: { fov: 48 }, keyframes: [{ at: 0, to: { fov: 34 }, duration: 6.5, ease: 'sine.inOut' }] },
  ...letters,
];
```

---

## Camera orbit (+ optional dolly zoom)

`orbit()` returns a camera layer that circles a point (the circle is sampled into short linear keyframes; the ease applies to the angle). Add `dollyZoom: { from, to }` and `fov` animates while the radius follows it, so the `z = 0` plane keeps its size and only the perspective changes. Under a dolly zoom everything with `z > 0` balloons toward the viewer: keep the hero content at `z = 0` and near content at small `z`; far layers are pulled toward the centre, so spread far cards to the outer x positions and near cards inward, and leave ~10 % margin for the orbit sweep.

```js
// @recipe camera-orbit
const card = (x, z, color) => ({
  type: 'shape', shape: 'rect', width: 300, height: 200, cornerRadius: 20, threeD: true,
  initial: { x, y: 360, z, fillColor: color },
});
return [
  orbit({ duration: 6, degrees: 50, dollyZoom: { from: 38, to: 62 } }),    // options: radius (not with dollyZoom), center, start, fov, ease
  card(240, -300, '#3a6ea5'), card(640, 0, '#d96a3a'), card(990, 60, '#38a169'),     // near cards stay at small z
];
```

A call-to-action or any overlay that must stay screen-aligned should be a plain 2D layer (no `threeD`) placed last: it ignores the camera and stays on top. Fade the 3D scene and headline out before it appears; a dim rect alone leaves them visible.

---

## A card in depth (a composition with `threeD: true`)

A `composition` with `threeD: true` is a card: its children are drawn into one texture that is then moved in depth, so a rect, an icon and a label rotate and scale together. `threeD` layers at the same `z` keep array order. Entrance from depth, then a gentle bob with `repeat` / `yoyo`.

```js
// @recipe depth-cards
const card = (title, color, x, y, z, at) => ({
  type: 'composition', name: title, at, width: 300, height: 190, threeD: true,
  initial: { x, y, z, pivotX: 150, pivotY: 95 },                       // pivot = the centre, so x,y is where the centre sits
  sequences: [
    { type: 'shape', shape: 'rect', width: 300, height: 190, cornerRadius: 24, initial: { x: 150, y: 95, fillColor: color } },
    { type: 'text', text: title, style: { fontSize: 34, fontWeight: 'bold', fill: '#ffffff' }, initial: { x: 150, y: 95, anchorX: 0.5, anchorY: 0.5 } },
  ],
  keyframes: [
    { at: 0, from: { alpha: 0, z: z - 400, rotationY: 55 }, to: { alpha: 1, z, rotationY: 0 }, duration: 0.9, ease: 'expo.out' },
    { at: 1, to: { y: y - 14 }, duration: 1.2, ease: 'sine.inOut', repeat: 3, yoyo: true },
  ],
});
return [
  { type: 'camera', initial: { fov: 42 } },
  card('Battery', '#3a6ea5', 220, 300, -280, 0.2),         // far cards at the outer x
  card('Sound', '#d96a3a', 1060, 260, -200, 0.4),
  card('Comfort', '#38a169', 640, 380, 0, 0.6),
];
```

---

## Cut to the next scene with an expanding circle

The outgoing scene must stay alive until the covering shape has finished; the next scene starts when the flood is complete. Reach the far corners: radius ≥ half the diagonal (734 px at 720p). `expo.in` stays tiny until the very end — use `power2.in`.

```js
// @recipe scene-flood
const FLOOD_AT = 3, FLOOD = 0.6, END = 6;
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', duration: FLOOD_AT + FLOOD, initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1d2b53' } },
  { type: 'text', text: 'BEFORE', duration: FLOOD_AT + FLOOD, style: { fontSize: 160, fontWeight: '900', fill: '#ffffff' }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 } },
  { type: 'shape', shape: 'circle', radius: 0, at: FLOOD_AT, duration: END - FLOOD_AT, initial: { x: 'GW/2', y: 'GH/2', fillColor: '#ffd166' },
    keyframes: [{ at: 0, to: { radius: 820 }, duration: FLOOD, ease: 'power2.in' }] },
  { type: 'text', text: 'AFTER', at: FLOOD_AT + FLOOD, duration: END - FLOOD_AT - FLOOD, style: { fontSize: 160, fontWeight: '900', fill: '#1d2b53' }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
    keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.25 }] },
];
```

---

## Slideshow with transitions and background music

Scene `i` starts at `i × (L − T)` and overlaps the next by the transition length `T`; the transition's `at` is the next scene's start; total = `n × (L − T) + T`. Transitions and `kenBurns` combine freely. Captions are top-level layers (transitions never touch layers they do not name); keep them above the bottom ~60 px. A music file shorter than the movie (`bgm.mp3` is a 16 s loop) needs **`loop: true`** or it falls silent.

```js
// @recipe slideshow
const photos = ['p1', 'p2', 'p3'], L = 4, T = 1, STEP = L - T;
const kinds = ['crossfade', 'wipe', 'zoom'];
const total = photos.length * STEP + T;
const sequences = photos.map((asset, i) =>
  kenBurns({ asset, name: 'scene' + i, at: i * STEP, duration: L, motion: i % 2 ? 'position' : 'scale' }));
const transitions = photos.slice(1).map((_, i) => ({
  kind: kinds[i % kinds.length], from: 'scene' + i, to: 'scene' + (i + 1), at: (i + 1) * STEP, duration: T,
  ...(kinds[i % kinds.length] === 'wipe' ? { direction: 'left' } : {}),
}));
photos.forEach((_, i) => sequences.push(withFade({
  type: 'text', text: 'Scene ' + (i + 1), at: i * STEP + 0.5, duration: L - 1.5,
  style: { fontSize: 44, fill: '#ffffff', dropShadow: { color: '#000000', blur: 6, distance: 2, alpha: 0.7 } },
  initial: { x: 'GW/2', y: 600, anchorX: 0.5, anchorY: 0.5 },
}, { in: 0.4, out: 0.4 })));
sequences.push({ type: 'audio', asset: 'bgm', loop: true, volume: 0, duration: total,
  keyframes: [{ at: 0, to: { volume: 0.8 }, duration: 2 }, { at: -2, to: { volume: 0 }, duration: 2 }] });
transitions.forEach(tr => sequences.push({ type: 'audio', sfx: 'swoosh', at: tr.at + tr.duration / 2 - 0.16 }));   // a swoosh is loudest 0.16 s in: centre it on the transition
return { sequences, transitions, duration: total };
```

Source images should be at least canvas-sized (`kenBurns` zooms in): draw generated images at 1920×1080 for a 1280×720 movie.

---

## Music with no file (`music`)

A tune written as text: tracks of notes and chords (`c4:2`, `Am7:4`, `_` rest), drum patterns, a tempo. Count the beats (a 4/4 bar is 4); keep every track the same length; give the drums `from` so they enter after the intro; fade a track in with `vol` points. It lasts its notes plus a reverb tail and ends with the movie; `loop: true` repeats it. The mix sits at −6 dBFS peak at `volume: 1`: use 0.5–0.8 under speech or sound effects.

```js
// @recipe music-lofi
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1b1a2e' } },
  { type: 'text', text: 'evening', at: 0.5, style: { fontFamily: 'Georgia, serif', fontSize: 96, fill: '#f3eee4' }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 1.2 }] },
  { type: 'audio', at: 0, volume: 0.8, music: {
      bpm: 84, swing: 0.16, reverb: 0.26, seed: 7,
      tracks: [
        { inst: 'keys',  vol: 0.7, pan: -0.15, strum: 0.012, notes: 'Cmaj7:4 Am7:4 Dm7:4 G7:4 | Cmaj7:4 Am7:4 Dm7:2 G7:2 Cmaj7:4' },
        { inst: 'bass',  vol: 0.85, notes: 'c2:1.5 _:0.5 g2:1 c2:1 | a1:1.5 _:0.5 e2:1 a1:1 | d2:1.5 _:0.5 a2:1 d2:1 | g1:1.5 _:0.5 d2:1 g1:1 | c2:1.5 _:0.5 g2:1 c2:1 | a1:1.5 _:0.5 e2:1 a1:1 | d2:2 f2:1 a1:1 | g1:2 b1:1 d2:1 | c2:4' },
        { inst: 'pluck', vol: [[0, 0], [8, 0.55]], pan: 0.25, step: 0.5, notes: '_:8 | e5:1 d5:0.5 c5:0.5 e5:2 | c5:1 a4:1 e5:2 | f5:1 e5:0.5 d5:0.5 a4:2 | d5:1.5 b4:0.5 g4:2 | e5:1 g5:1 e5:1 d5:1 | c5:1 a4:1 c5:2 | d5:1 f5:1 e5:1 d5:1 | b4:2 d5:2 | c5:4' },
        { inst: 'pad',   vol: 0.5, notes: '[c3 g3 e4]:8 [a2 e3 c4]:8 [d3 a3 f4]:8 [g2 d3 b3]:8' },
      ],
      drums: [{ from: 8, kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo' }],
  } },
];
```

Other feels: a 6/8 lullaby is `bpm: 72`, `grid: 2`, bars of 3 beats (a dotted quarter `:1.5`, an eighth `:0.5`), instruments `musicbox` + `pluck` + `pad`; a build-up is layers entering with rests and `vol` points on the pad, drums from a later `from`; a ritardando is `bpm: [[0, 96], [28, 96], [32, 60]]`; a bright jingle is `lead` + `bell` + `sleigh` / `shaker` over a bouncy `bass`.

## Sound effects without files

No `assets`, no files: a sound effect is one audio layer with `sfx`. It lasts as long as the sound.

```js
// @recipe sfx-minimal
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0f1424' } },
  { type: 'text', name: 'word', text: 'HELLO', at: 2, duration: 3,
    style: { fontSize: 120, fontWeight: '900', fill: '#ffffff' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { x: -400 }, to: { x: 'GW/2' }, duration: 0.4, ease: 'power3.out' }] },
  { type: 'audio', sfx: 'swoosh', at: 2 },             // flies in with a swoosh…
  { type: 'audio', sfx: 'hit', at: 2.4 },              // …and lands (0.4 s later) with a hit
];
```

Check it without listening, then export — the file encodes this same mix (mp4 / mov: AAC, webm / mkv: Opus; lossy):

```js
// @docs-only render-and-verify
await movie.init({ canvas, width: 1280, height: 720, duration: 5, composition: { sequences } });
const a = movie.inspectAudio();
console.log(a.issues);                                    // must be []
console.log(a.sources.map(s => [s.layer, s.start, s.sound.loudestAt, s.sound.brightnessHz]));
const blob = await movie.render({ format: 'mp4' });
```

---

## Sound effects in sync with the picture

Line up the LOUD point, not the start: a `riser` is loudest at its end (`at = hit − duration`), a `swoosh` 0.16 s in, everything else at its start (`inspectAudio().sources[i].sound.loudestAt` tells you). Vary `pitch` for a series (a rising pitch reads as progress) and `seed` for repeats (no two typewriter keys alike).

```js
// @recipe sfx-cues
const BG = { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0f1424' } };
const HIT = 1.5, RISE = 1.2;                         // the title slams in at 1.5 s; the riser leads into it
const sequences = [BG,
  { type: 'audio', name: 'riser', sfx: 'riser', at: HIT - RISE, duration: RISE, volume: 0.7 },   // a riser is loudest at its END
  { type: 'audio', name: 'hit', sfx: 'hit', at: HIT },
  { type: 'text', name: 'title', text: 'LAUNCH', at: HIT, duration: 8 - HIT,
    style: { fontSize: 140, fontWeight: '900', fill: '#ffffff', fontFamily: 'Arial Black, Arial, sans-serif' },
    initial: { x: 'GW/2', y: 260, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { scale: 2.4, alpha: 0 }, to: { scale: 1, alpha: 1 }, duration: 0.18, ease: 'expo.out' }] },
];
['PLAN', 'BUILD', 'SHIP'].forEach((label, i) => {   // each item pops in with a pop; pitch climbs a step per item
  const at = 2.4 + i * 0.5;
  sequences.push({ type: 'text', name: 'item' + i, text: label, at, duration: 8 - at,
    style: { fontSize: 44, fontWeight: 'bold', fill: '#ffd166' },
    initial: { x: 360 + i * 280, y: 430, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { scale: 0, alpha: 0 }, to: { scale: 1, alpha: 1 }, duration: 0.25, ease: 'back.out(2)' }] });
  sequences.push({ type: 'audio', name: 'pop' + i, sfx: { preset: 'pop', pitch: i * 2 }, at });
});
const CAPTION = 'ships friday', T0 = 4.4, STEP = 0.07;   // typed caption: one letter + one key per step
[...CAPTION].forEach((ch, i) => {
  const at = T0 + i * STEP;
  sequences.push({ type: 'text', name: 'cap' + i, text: ch, at, duration: 8 - at,
    style: { fontSize: 36, fill: '#9fb3d9', fontFamily: 'ui-monospace, Menlo, monospace' },
    initial: { x: 640 - (CAPTION.length * 22) / 2 + i * 22, y: 540, anchorY: 0.5 } });
  if (ch !== ' ') sequences.push({ type: 'audio', sfx: { preset: 'typewriter', seed: i }, at, volume: 0.6 });   // seed: every key sounds a little different
});
sequences.push({ type: 'audio', name: 'done', sfx: 'chime', at: T0 + CAPTION.length * STEP + 0.3 });
return sequences;
```

---

## Progress ring (an arc) with a counter

`shape: 'arc'` is a ring when it has only a stroke: animate `endAngle` from the start angle (−90 = 12 o'clock) round to +270 for a full circle. A second arc under it is the track; `{value}` in the middle counts in step with the same ease.

```js
// @recipe progress-ring
const CX = 640, CY = 360, R = 120, TO = 0.82;            // 82 % filled
const ease = 'power3.out', AT = 0.3, DUR = 2;
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0f1424' } },
  { type: 'shape', shape: 'arc', name: 'track', radius: R, startAngle: 0, endAngle: 360,
    initial: { x: CX, y: CY, strokeColor: '#27304d', strokeWidth: 24 } },
  { type: 'shape', shape: 'arc', name: 'progress', radius: R, startAngle: -90, endAngle: -90, strokeCap: 'round',
    initial: { x: CX, y: CY, strokeColor: '#ffd166', strokeWidth: 24 },
    keyframes: [{ at: AT, to: { endAngle: -90 + 360 * TO }, duration: DUR, ease }] },
  { type: 'text', name: 'percent', text: '{value}%', format: { decimals: 0 },
    style: { fontSize: 72, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: CX, y: CY, anchorX: 0.5, anchorY: 0.5, value: 0 },
    keyframes: [{ at: AT, to: { value: TO * 100 }, duration: DUR, ease }] },
];
```

---

## Draw a line, border or check mark on, and type text out

`trimEnd` 0 → 1 strokes a shape's outline on (`trimStart` 0 → 1 afterwards wipes it off); the fill is NOT trimmed, so fade `fillAlpha` in once the outline is done. A rect's outline starts top-left and goes clockwise, a circle's at 12 o'clock. `strokeCap: 'round'` rounds the ends. For text, `visibleChars` types it out and `set: { text }` swaps the string at a time.

```js
// @recipe draw-on-and-type
const ACCENT = '#ffd166', TEAL = '#4cc9f0', GREEN = '#7bd88f';
const drawOn = (at, duration = 1.2) => ({ at, to: { trimEnd: 1 }, duration, ease: 'power2.inOut' });
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0a0e1a' } },
  // an underline that draws itself
  { type: 'shape', shape: 'line', from: [340, 120], to: [940, 120], trimEnd: 0, strokeCap: 'round',
    initial: { strokeColor: ACCENT, strokeWidth: 6 }, keyframes: [drawOn(0.2, 1)] },
  // a card border (clockwise from the top-left), then its fill fades in
  { type: 'shape', shape: 'rect', width: 360, height: 200, cornerRadius: 28, trimEnd: 0, strokeJoin: 'round',
    initial: { x: 400, y: 360, strokeColor: TEAL, strokeWidth: 8, fillColor: TEAL, fillAlpha: 0 },
    keyframes: [drawOn(0.6, 1.4), { at: 2, to: { fillAlpha: 0.2 }, duration: 0.6 }] },
  // an SVG check mark
  { type: 'shape', shape: 'path', d: 'M 0 50 L 45 95 L 130 0', trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
    initial: { x: 880, y: 360, strokeColor: GREEN, strokeWidth: 16 }, keyframes: [drawOn(1.8, 0.9)] },
  // a typewriter: left-aligned so it grows rightward; 30 characters over 2.4 s
  { type: 'text', text: 'No mask, no per-letter layers.', at: 3, duration: 5,
    style: { fontSize: 40, fill: '#e8eefc', fontFamily: 'ui-monospace, Menlo, monospace' },
    initial: { x: 120, y: 560, anchorX: 0, anchorY: 0.5, visibleChars: 0 },
    keyframes: [{ at: 0, to: { visibleChars: 30 }, duration: 2.4, ease: 'none' }] },
  // a countdown: one layer whose string changes
  { type: 'text', text: '3', at: 3, duration: 5,
    style: { fontSize: 150, fontWeight: '900', fill: ACCENT },
    initial: { x: 1060, y: 540, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 1, set: { text: '2' } }, { at: 2, set: { text: '1' } }, { at: 3, set: { text: 'Go!' } }] },
];
```

---

## Letters and words that animate one by one (`splitText`)

Text content cannot change, so a per-letter or per-word effect is one text layer per piece. `splitText(text, style, { by: 'chars' | 'words' | 'lines', x, y, align })` measures the text with the renderer's own font metrics (kerning kept) and returns each piece's `text`, `x`, `y`, `width`, `index` and `line`: put them straight into the layers. Use the same `style` for the whole text and each piece, and a web font must be loaded first. `measureText(text, style)` gives `{ width, height, lines }` for sizing pills and underlines.

```js
// @recipe split-text
const style = { fontFamily: 'Arial, sans-serif', fontSize: 110, fontWeight: 'bold', fill: '#ffffff' };
const sub = { fontFamily: 'Arial, sans-serif', fontSize: 44, fill: '#ffd166' };
const sequences = [{ type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0f1424' } }];
splitText('MAKE THINGS', style, { x: 640, y: 200, align: 'center' }).forEach(p => sequences.push({
  type: 'text', name: 'letter-' + p.index, text: p.text, style, at: 0.3 + p.index * 0.06,
  initial: { x: p.x, y: p.y, alpha: 0 },                                   // x / y are the top-left of the letter: anchorX / anchorY stay 0
  keyframes: [{ at: 0, from: { y: p.y + 40, alpha: 0 }, to: { y: p.y, alpha: 1 }, duration: 0.35, ease: 'back.out(2)' }],
}));
splitText('one word at a time', sub, { by: 'words', x: 640, y: 380, align: 'center' }).forEach(p => sequences.push({
  type: 'text', name: 'word-' + p.index, text: p.text, style: sub, at: 1.4 + p.index * 0.25,
  initial: { x: p.x, y: p.y, alpha: 0 },
  keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }],
}));
return sequences;
```

---

## A wave of delays (`stagger`)

`stagger()` gives the delays for a wave of items, GSAP style: `each` (gap between neighbours) or `amount` (total), `from` (`'start'` `'end'` `'center'` `'edges'` `'random'` or an index), `grid: [cols, rows]`, `ease`, `seed`. Give it a count and it returns numbers; give it layers and it returns them with `at` pushed back.

```js
// @recipe stagger
const style = { fontFamily: 'Arial, sans-serif', fontSize: 96, fontWeight: 'bold', fill: '#ffffff' };
// letters rising from the middle outwards: the same layers, each starting a little later
const letters = stagger(
  splitText('RIPPLE', style, { x: 640, y: 120, align: 'center' }).map(p => ({
    type: 'text', name: 'letter-' + p.index, text: p.text, style, at: 0.2, duration: 4,
    initial: { x: p.x, y: p.y, alpha: 0 },
    keyframes: [{ at: 0, from: { y: p.y + 40, alpha: 0 }, to: { y: p.y, alpha: 1 }, duration: 0.4, ease: 'back.out(2)' }],
  })),
  { each: 0.07, from: 'center' });
// a 6 x 3 grid of tiles that pop in as a ripple from the middle (numbers: use them in `at`)
const COLS = 6, ROWS = 3, delays = stagger(COLS * ROWS, { each: 0.12, grid: [COLS, ROWS], from: 'center', ease: 'sine.out' });
const tiles = delays.map((d, i) => ({
  type: 'shape', shape: 'rect', width: 120, height: 120, cornerRadius: 18, name: 'tile-' + i, at: 1 + d, duration: 3 - d,
  initial: { x: 190 + (i % COLS) * 180, y: 330 + Math.floor(i / COLS) * 150, fillColor: '#4cc9f0', scale: 0 },
  keyframes: [{ at: 0, to: { scale: 1 }, duration: 0.4, ease: 'back.out(2)' }],
}));
return [...letters, ...tiles];
```

---

## Per-letter text in one call (`animateText`)

`animateText(text, style, options)` returns one text layer per character / word / line, laid out like the whole text, each arriving (and leaving) in a wave. `duration` is required: seconds from `at` until the last piece is gone (it throws if the wave does not fit). Letters turn and scale about their own centre.

```js
// @recipe animate-text
const style = { fontFamily: 'Arial, sans-serif', fontSize: 110, fontWeight: 'bold', fill: '#ffffff' };
return [
  ...animateText('Kinetic type', style, { x: 640, y: 230, align: 'center', at: 0.3, duration: 5,
    in: 'rise', out: 'fade', stagger: { each: 0.05, from: 'center' }, idle: { y: 5, rotation: 1 },
    styleFor: p => (p.index === 0 ? { fill: '#ffd166' } : {}) }),
  ...animateText('one word at a time', { fontFamily: 'Arial, sans-serif', fontSize: 44, fill: '#8fa0bf' },
    { by: 'words', x: 640, y: 420, align: 'center', at: 1.6, duration: 3.7, in: 'pop', stagger: { each: 0.25 } }),
];
```

Presets for `in` / `out`: `rise` (default) `drop` `fade` `pop` `zoom` `slide` `spin`; or `{ from: { x: -30, scale: 0.5, rotation: 20 }, duration: 0.8, ease: 'power3.out' }` (`x` / `y` in `from` are offsets from the resting place, the rest are absolute values). `idle` drifts each piece between the entrance and the exit.

---

## Travel along a path, and morph one shape into another

`followPath()` gives a layer's `x` / `y` (and `rotation` with `orient`) along an SVG path at an even speed. `morphTo` + `morph` turn one path outline into another.

```js
// @recipe follow-path
const ROUTE = 'M 120 560 C 360 120 920 120 1160 560';
return [
  { type: 'shape', shape: 'path', d: ROUTE, duration: 5, initial: { strokeColor: '#ffffff', strokeWidth: 3, strokeAlpha: 0.25 } },     // the route, faint
  { type: 'shape', shape: 'polygon', points: [[-18, -12], [18, 0], [-18, 12]], at: 0.5, duration: 4.5, initial: { fillColor: '#ffd166' },
    keyframes: followPath({ d: ROUTE, duration: 4, ease: 'power2.inOut', orient: true, frameRate: 30 }) },                               // a pointer that faces the way it goes
];
```

```js
// @recipe morph
const BLOB = 'M 640 160 C 780 160 860 260 860 360 C 860 470 770 560 640 560 C 510 560 420 470 420 360 C 420 250 500 160 640 160 Z';
const STAR = 'M 640 130 L 700 300 L 880 300 L 735 410 L 790 590 L 640 480 L 490 590 L 545 410 L 400 300 L 580 300 Z';
return [{
  type: 'shape', shape: 'path', d: BLOB, morphTo: STAR, duration: 4,
  initial: { fillColor: '#ffd166', strokeColor: '#ffffff', strokeWidth: 6, strokeJoin: 'round' },
  keyframes: [{ at: 0.5, to: { morph: 1 }, duration: 1.5, ease: 'power2.inOut', repeat: 1, yoyo: true }],                                // there and back
}];
```

Both outlines are in canvas coordinates. Closed outlines are lined up so they do not twist.

---

## Visuals that follow the music (`audioEnvelope`, `react`)

Analyse the sound **before** `movie.init` (`const env = await audioEnvelope('music.mp3', { frameRate: 30 })`: levels per band per frame and the beats), then `react()` bakes it into keyframes, so playback and export agree. With no audio file at hand, `bpmEnvelope(120, { duration })` is a drum pattern on a tempo (kick = `bass`, snare = `mid`, hats = `treble`), exactly on the beat; it is also how to match sound effects you place on that tempo.

```js
// @recipe audio-react
const env = bpmEnvelope(120, { duration: 8, frameRate: 30 });      // with a file: `const env = await audioEnvelope(url, { frameRate: 30 })`
const bands = ['bass', 'bass', 'bass', 'mid', 'mid', 'mid', 'treble', 'treble'];
const bars = bands.map((band, i) => ({
  type: 'shape', shape: 'rect', name: 'bar-' + i, width: 60, height: 10, cornerRadius: 6, anchorY: 1, duration: 8,
  initial: { x: 330 + i * 86, y: 600, fillColor: ['#ff2d95', '#8a4dff', '#22e0ff'][['bass', 'mid', 'treble'].indexOf(band)] },
  keyframes: react(env, { duration: 8, props: { height: { base: 10, amount: 260, band, release: 0.12 } } }),       // an equaliser bar: up fast, down slowly
}));
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#07060f' } },
  { type: 'shape', shape: 'circle', name: 'orb', radius: 90, duration: 8, initial: { x: 640, y: 260, fillColor: '#ffffff' },
    keyframes: react(env, { duration: 8, props: { scale: { base: 1, amount: 0.5, beats: true, decay: 0.16 }, alpha: { base: 0.55, amount: 0.45, band: 'bass', attack: 0.02, release: 0.15 } } }) },   // a flash on every kick
  ...bars,
];
```

---

## A deck: pages and steps for a presenter (`deck`, `Presenter`)

`deck({ pages, transition })` lays pages out one after the other (each page's layers are written in the page's own time) and turns their `stops` into where a `Presenter` pauses. A **step** is a layer that starts at the previous stop and ends at this one: "press next" plays exactly that animation and stops. A page should last its last stop plus the transition.

```js
// @recipe deck
const paper = { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#f4efe6' } };
const style = { fontFamily: 'Georgia, serif', fontSize: 96, fill: '#1c1a17' };
const line = (text, y, at, dur) => animateText(text, style, { by: 'words', x: 96, y, align: 'left', name: 'l' + y, at, duration: dur - at, in: { from: { y: 40, alpha: 0 }, duration: 0.8, ease: 'power3.out' }, stagger: { each: 0.1 } });
const T = 0.6;
const d = deck({
  transition: { kind: 'slide', direction: 'left', duration: T, ease: 'power3.inOut' },
  pages: [
    { name: 'Hello', duration: 2 + T, stops: [2], sequences: [paper, ...line('The Quiet Hours', 260, 0.4, 2 + T)] },
    { name: 'Two steps', duration: 3.4 + T, stops: [1.6, 3.4], notes: 'pause after the first line',
      sequences: [paper, ...line('We measure speed.', 200, 0.4, 3.4 + T), ...line('We rarely measure attention.', 340, 1.6, 3.4 + T)] },
    { name: 'Thanks', duration: 3, stops: [2], sequences: [paper, ...line('Go slowly.', 260, 0.4, 3)] },
  ],
});
return { duration: d.duration, sequences: d.composition.sequences, transitions: d.composition.transitions };
```

```js
// @docs-only
// in the page: the deck is spread into init; the Presenter (or the Controller, which then shows the stops and a Present button) plays it
import { Movie, deck } from 'pixi-effects';
import { Presenter } from 'pixi-effects/presenter';
const movie = new Movie();
await movie.init({ canvas, width: 1280, height: 720, frameRate: 30, ...deck({ /* as above */ }) });
new Presenter(movie, { canvas });     // arrows / Space / Enter / click / swipe = next, ← = back, B = black screen, F = fullscreen, ? = keys
```

---

## A camera flight through a corridor (`cameraPath`, `hideBehindCamera`, a handheld shake)

`cameraPath({ points, duration, ease })` is the camera's route as keyframes: a smooth curve through `[x, y, z]` points at an even speed (an `ease` shapes it; `'power2.in'` is an accelerating rush), facing where it flies (`look: 'ahead'`, the default) or at a fixed `look: [x, y, z]`. Layers the camera passes get `hideBehindCamera: true` (hidden quietly instead of a warning). A handheld shake goes on the camera's **offsets** (`offsetX`, `offsetY`, `offsetZ`, `lookOffsetX`…): they are added to the move, so a `wiggle()` never collides with the dolly.

```js
// @recipe camera-fly-through
const gate = (i, z) => ({
  type: 'composition', name: 'gate-' + i, threeD: true, hideBehindCamera: true, width: 360, height: 480,
  initial: { x: 640, y: 360, z, pivotX: 180, pivotY: 240 },
  sequences: [{ type: 'shape', shape: 'rect', width: 330, height: 450, cornerRadius: 6, initial: { x: 180, y: 240, strokeColor: '#ffe9c4', strokeWidth: 6 } }],
});
return { duration: 8, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0b0a10' } },
  ...Array.from({ length: 9 }, (_, i) => gate(i, -i * 380)),
  { type: 'camera', keyframes: [
    ...cameraPath({ points: [[640, 360, 2200], [690, 330, 900], [640, 360, -3000]], duration: 7, ease: 'power2.in', frameRate: 30 }),
    ...wiggle({ duration: 7, freq: 9, seed: 2, props: { offsetX: { around: 0, amp: 5 }, offsetY: { around: 0, amp: 3 } } }),
  ] },
] };
```

---

## Looping motion

`repeat` (a finite count) and `yoyo` go on any keyframe. Total time = `duration × (repeat + 1)`.

```js
// @recipe pulse
return [{
  type: 'shape', shape: 'circle', radius: 40, duration: 6,
  initial: { x: 'GW/2', y: 'GH/2', fillColor: '#ff3b3b' },
  keyframes: [{ at: 0, to: { scale: 1.15 }, duration: 0.5, ease: 'sine.inOut', repeat: 11, yoyo: true }],   // 12 plays x 0.5 s = 6 s
}];
```

---

## Particles (`particles()`: seeded, so every run and export is identical)

`particles()` returns one layer per particle: seeded start, launch angle and speed, size, colour and life, with gravity / wind / drag / sway baked into the keyframes. `count` and `life` are required, and so is the emitter `area` (its centre; add `width` / `height` to spread over a box). `emit: 0` is a burst, `emit: 3` spreads the births over 3 s. `angle`: 0 right, 90 down, −90 up. `blendMode: 'add'` makes overlaps glow. It throws (with the fix) if it would bake too many keyframes: lower `count`, `life` or `sampleRate`.

```js
// @recipe particles
const colors = ['#ffd166', '#ff6b9d', '#4cc9f0', '#ffffff'];
const burst = (at, x, y, seed) => particles({ count: 240, at, life: [1.2, 2], area: { x, y }, speed: [40, 520], gravity: 220, drag: 1.1,
  size: [4, 8], scale: [1, 0.3], colors, fade: { out: 0.7 }, blendMode: 'add', seed, name: 'burst' + seed });   // bursts of sparks
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0a0f1f' } },
  ...burst(0.5, 400, 260, 1), ...burst(1.6, 880, 200, 2), ...burst(2.8, 640, 330, 3),
];
```

```js
// @recipe particles-snow
return { duration: 10, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#16203d' } },
  ...particles({ count: 120, emit: 4, life: [4, 6], area: { x: 640, y: -20, width: 1400 }, angle: 90, speed: [40, 90],
    size: [2, 5], sway: { amp: 30, freq: 0.6 }, fade: { in: 0.5, out: 0.5 }, name: 'snow', seed: 4 }),     // drifting down, swaying
] };
```

---

## Group and orbit with a null layer (`parent`)

A `null` layer draws nothing and only moves; layers with `parent: 'name'` are drawn inside it. Their `x` / `y` are measured from the null's origin, so turning the null makes them circle it. Nulls chain (a moon on a null that is itself on the planet's null).

```js
// @recipe null-orbit
return [
  { type: 'shape', shape: 'circle', radius: 50, duration: 8, initial: { x: 640, y: 360, fillColor: '#ffd166' } },            // the sun
  { type: 'null', name: 'earth-orbit', initial: { x: 640, y: 360 },                                                         // pivot at the sun
    keyframes: [{ at: 0, to: { rotation: 360 }, duration: 8, ease: 'none' }] },
  { type: 'shape', shape: 'circle', radius: 20, parent: 'earth-orbit', initial: { x: 240, y: 0, fillColor: '#4cc9f0' } },     // 240 px from the sun
  { type: 'null', name: 'moon-orbit', parent: 'earth-orbit', initial: { x: 240, y: 0 },                                      // pivot at the earth
    keyframes: [{ at: 0, to: { rotation: 1440 }, duration: 8, ease: 'none' }] },
  { type: 'shape', shape: 'circle', radius: 7, parent: 'moon-orbit', initial: { x: 55, y: 0, fillColor: '#e8eefc' } },        // 55 px from the earth
];
```

---

## A hand-held shake and a flickering light (`wiggle`, seeded)

`wiggle()` returns keyframes (spread it into `keyframes`): each property drifts between seeded random targets and ends back at `around`. Use `freq` ~3 for a slow float, 8+ for a shake, `ease: 'none'` for a jittery flicker. Per-layer variety: give each its own `seed`.

```js
// @recipe wiggle
return [
  // a title that floats and tilts a little, like a hand-held camera
  { type: 'text', text: 'NIGHT SHIFT', duration: 6,
    style: { fontSize: 120, fill: '#ffffff', fontWeight: '800' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    keyframes: wiggle({ duration: 6, freq: 3, seed: 1, props: { x: { around: 'GW/2', amp: 8 }, y: { around: 'GH/2', amp: 6 }, rotation: { around: 0, amp: 1.2 } } }) },
  // a neon sign whose light stutters (fast, straight-line steps)
  { type: 'shape', shape: 'rect', width: 520, height: 8, duration: 6,
    initial: { x: 'GW/2', y: 'GH/2 + 90', fillColor: '#ff4d6d' },
    keyframes: wiggle({ duration: 6, freq: 12, seed: 5, ease: 'none', props: { alpha: { around: 0.8, amp: 0.2 } } }) },
  // dust: every speck has its own seed, so its drift is its own and never changes between runs
  ...Array.from({ length: 24 }, (_, i) => ({
    type: 'shape', shape: 'circle', radius: 2 + rand(i) * 3, duration: 6,
    initial: { x: 40 + rand(i + 100) * 1200, y: 40 + rand(i + 200) * 640, fillColor: '#ffffff', fillAlpha: 0.25 + rand(i + 300) * 0.4 },
    keyframes: [...wiggle({ duration: 6, freq: 0.6, seed: i, props: { y: { around: 40 + rand(i + 200) * 640, amp: 30 } } })],
  })),
];
```

---

## Gradients and vignettes

`fillGradient` fills a shape with a linear or radial gradient (positions are 0–1 of the shape's own bounds; colours can have alpha). A radial gradient from transparent to dark, on a full-screen rect placed last, is a vignette.

```js
// @recipe gradient-background
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2' },
    fillGradient: { stops: [[0, '#1b2a6b'], [0.6, '#7b3fe4'], [1, '#ff6a88']] } },                  // top → bottom
  { type: 'shape', shape: 'rect', width: 520, height: 200, cornerRadius: 30, initial: { x: 'GW/2', y: 'GH/2' },
    fillGradient: { angle: 0, stops: [[0, '#00f5a0'], [1, '#00d9f5']] } },                          // left → right
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2' },
    fillGradient: { type: 'radial', radius: 0.75, stops: [[0.45, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.7)']] } },   // vignette, last = on top
];
```

---

## Generated placeholder images (no photos available)

Draw on a canvas and register `canvas.toDataURL()` as an asset (`data:` URLs work). Make the image at least canvas-sized (1920×1080 for a 1280×720 movie) so `kenBurns` zooms stay sharp.

```js
// @docs-only
function placeholderPhoto(name, hueA, hueB, w = 1920, h = 1080) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hueA} 70% 45%)`); grad.addColorStop(1, `hsl(${hueB} 70% 25%)`);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  return { name, src: c.toDataURL() };
}
// await movie.init({ assets: [placeholderPhoto('p1', 210, 280), placeholderPhoto('p2', 10, 60)], composition: { … } })
```

---

## Metallic three.js object

`ctx.renderer` is a normal `WebGLRenderer`, so an environment map works; lights alone make `metalness: 1` look black. `three/addons` is not in the importmap: build the environment yourself. Size the layer to the area you want (it clips at its own rectangle) and pull the camera back (`z ≈ 5.4` for a radius-1 torus knot at fov 50).

```js
// @docs-only
// registerThree();  const THREE = await import('three');
three({
  type: 'three', width: 'GW * 0.56', height: 'GH * 0.9', initial: { x: 'GW * 0.77', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  setup: (ctx) => {
    const env = new THREE.Scene();
    for (const [x, y, z] of [[4, 4, 4], [-4, 2, -4], [0, -4, 4]]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lamp.position.set(x, y, z); env.add(lamp);
    }
    ctx.scene.environment = new THREE.PMREMGenerator(ctx.renderer).fromScene(env).texture;
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 128, 32), new THREE.MeshStandardMaterial({ color: 0xcfd8ff, metalness: 1, roughness: 0.25 }));
    ctx.scene.add(knot);
    ctx.camera.position.z = 5.4;
    return { objects: { knot } };
  },
  keyframes: [{ at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 }],
})
```
