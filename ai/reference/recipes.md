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

Scene `i` starts at `i × (L − T)` and overlaps the next by the transition length `T`; the transition's `at` is the next scene's start; total = `n × (L − T) + T`. Transitions and `kenBurns` combine freely. Captions are top-level layers (transitions never touch layers they do not name); keep them above the bottom ~60 px. `bgm.mp3` is only 6 s: **`loop: true`** or it falls silent.

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

## Particles (seeded, so every run and export is identical)

```js
// @recipe particles
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
return Array.from({ length: 40 }, () => {
  const x = rnd() * 1280, y = 100 + rnd() * 620;
  return {
    type: 'shape', shape: 'circle', radius: 2 + rnd() * 4, duration: 6,
    initial: { x, y, fillColor: '#ffffff', fillAlpha: 0.3 + rnd() * 0.5 },
    keyframes: [{ at: 0, to: { y: y - 80 }, duration: 6, ease: 'none' }],
  };
});
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
