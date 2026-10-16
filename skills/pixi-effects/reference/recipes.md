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

## Pop in with a spring: a card that lands, a badge that bounces

A spring overshoots and settles: `duration: 'auto'` lets the physics set the length, a preset names the feel (`spring.gentle`, `snappy`, `bouncy`, `wobbly`, `slow`). Different presets on one layer's properties read as different materials.

```js
// @recipe spring-pop
const card = { type: 'shape', shape: 'rect', name: 'card', width: 520, height: 300, cornerRadius: 28, at: 0.3, duration: 3.7,
  initial: { x: 640, y: 360, fillColor: '#f4f1ea', scale: 0.4, alpha: 0 },
  keyframes: [
    { at: 0, to: { scale: 1 }, duration: 'auto', ease: 'spring.snappy' },
    { at: 0, to: { alpha: 1 }, duration: 0.2 },
  ] };
const badge = { type: 'shape', shape: 'circle', name: 'badge', radius: 46, at: 1.0, duration: 3,
  initial: { x: 860, y: 230, fillColor: '#e63946', scale: 0 },
  keyframes: [{ at: 0, to: { scale: 1 }, duration: 'auto', ease: 'spring.bouncy' }] };
const title = { type: 'text', text: 'Hello', name: 'title', at: 0.5, duration: 3.5, style: { fontSize: 88, fontWeight: 'bold', fill: '#1d3557' },
  initial: { x: 640, y: 380, anchorX: 0.5, anchorY: 0.5 },
  keyframes: [{ at: 0, from: { y: 440, alpha: 0 }, to: { y: 380, alpha: 1 }, duration: 'auto', ease: 'spring(1, 170, 12)' }] };
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1d3557' } },
  card, badge, title,
];
```

---

## Rewind and play again: a composition whose own time you control

Put the part you want to rewind, slow down or freeze **in a composition**, then give that composition `speed` (one straight speed: `0.5` slow motion, `-1` backward) or `time` keyframes (any curve of its own time: play, hold, rewind, play slowly). The layers inside write `at` / `duration` / `keyframes` in the composition's own seconds; the composition's own `at` / `duration` stay in the outer time. A sound or `sfx` inside follows the clock (backward and lower when it rewinds, like a tape). `cubic-bezier(.2, .8, .2, 1)` is front-loaded, not slow motion: half of the replay passes in the first 13 % of its time and 99 % by 74 %, so the replay opens quickly and what sits at the END of the content (the ring, the settle) gets the long glide. `power2` is a cubic: `power2.in` has done only 12.5 % at half time, so the dismantling bunches up in the last third of the rewind.

```js
// @recipe rewind-and-replay
const act = {
  type: 'composition', name: 'act', duration: 11,
  // its own time: play 0 → 2.2 s, hold half a second, rewind to 0 (accelerating), hold, then replay (4.5 s of content over 6 s: a fast start, a long glide at the end)
  keyframes: [
    { at: 0, from: { time: 0 }, to: { time: 2.2 }, duration: 2.2, ease: 'none' },
    { at: 2.2, to: { time: 2.2 }, duration: 0.5 },
    { at: 2.7, to: { time: 0 }, duration: 1.3, ease: 'power2.in' },
    { at: 4, to: { time: 0 }, duration: 0.4 },
    { at: 4.4, to: { time: 4.5 }, duration: 6, ease: 'cubic-bezier(.2, .8, .2, 1)' },
  ],
  sequences: [
    // everything in here is in the composition's own seconds: 0 … 4.5
    { type: 'shape', shape: 'rect', name: 'bar', width: 'GW', height: 16, anchorX: 0, anchorY: 0, at: 0, duration: 4.5,
      initial: { x: 0, y: 330, fillColor: '#ff4d3d', scaleX: 0 }, keyframes: [{ at: 0, to: { scaleX: 1 }, duration: 0.8, ease: 'expo.out' }] },
    { type: 'text', text: 'AGAIN.', name: 'title', at: 0.4, duration: 4.1, style: { fontSize: 150, fontWeight: 'bold', fill: '#f2efe8' },
      initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
      keyframes: [{ at: 0, from: { y: 430, alpha: 0 }, to: { y: 360, alpha: 1 }, duration: 0.9, ease: 'expo.out' }] },
    { type: 'audio', sfx: 'hit', at: 0.4 },
  ],
};
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0b0b10' } },
  act,
  // an overlay in the OUTER time: it shows while the act rewinds (2.7 s … 4 s of the movie)
  { type: 'text', text: '◀◀ REW', name: 'rew', at: 2.7, duration: 1.3, style: { fontSize: 36, fontWeight: 'bold', fill: '#ff4d3d' }, initial: { x: 60, y: 50 } },
];
```

The shortcuts, when one straight speed is enough: `{ type: 'composition', duration: 4, speed: 0.5, sequences: [ … ] }` (slow motion, the content plays half of its length), `speed: -1` (backward). For a **video file** the same words work on the layer itself:

```js
// @docs-only video-speed
// needs a real clip: assets: [{ name: 'clip', src: 'clip.mp4' }]
return [
  { type: 'video', asset: 'clip', speed: 0.5 },                 // slow motion; with no duration the layer lasts 2x the file
  { type: 'video', asset: 'clip', speed: -1, at: 4 },           // backward, the whole file
  { type: 'video', asset: 'clip', duration: 5, keyframes: [     // play 2 s, hold, then accelerate
    { at: 0, from: { time: 0 }, to: { time: 2 }, duration: 1 },
    { at: 1, to: { time: 2 }, duration: 0.5 },
    { at: 1.5, to: { time: 6 }, duration: 3.5, ease: 'power2.inOut' },
  ] },
];
```

---

## Push in on a whole flat scene (the 2D "camera"): a null that scales, and text drawn big enough

There is no second camera for flat scenes: the camera of the 2.5D layers is for `threeD` layers. For a push-in or pull-back of an ordinary 2D scene, put everything in a `null` layer that sits at the middle of the canvas and scale THAT (children use `parent: 'world'`, and their x / y are measured from the null's origin, so the middle of the canvas is 0, 0). Text is drawn once at its own size and then stretched, so give every text `resolution: R` where R is the biggest scale the group reaches (R 1–8); otherwise it goes soft.

```js
// @recipe scene-zoom
const R = 2;                                                  // the group grows to 2x: its text is drawn at 2x pixels
const inWorld = (spec) => ({ parent: 'world', ...spec });
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0f1424' } },
  { type: 'null', name: 'world', initial: { x: 'GW/2', y: 'GH/2' },
    keyframes: [{ at: 0.5, from: { scale: 1 }, to: { scale: R }, duration: 3.5, ease: 'power2.inOut' }] },
  inWorld({ type: 'shape', shape: 'circle', radius: 120, initial: { x: 0, y: 0, fillColor: '#3b5bdb' } }),
  inWorld({ type: 'shape', shape: 'circle', radius: 40, initial: { x: 260, y: -120, fillColor: '#ffd166' } }),
  inWorld({ type: 'text', text: 'Zoom in', resolution: R, style: { fontSize: 48, fontWeight: 'bold', fill: '#ffffff' }, initial: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 } }),
  inWorld({ type: 'text', text: 'sharp at 2x', resolution: R, style: { fontSize: 22, fill: '#c9d3f5' }, initial: { x: 0, y: 150, anchorX: 0.5, anchorY: 0.5 } }),
];
```

---

## Parallax: layers that scroll past at their own speed (a window of a train, a side-scroller)

Each layer is a long strip of repeated shapes that moves left at a constant speed, `speed × duration` pixels in all, so it must be that long plus the width of the screen. The speed is the depth: the near strip fast, the far one slow. A strip that is longer than it needs to be is only more layers.

```js
// @recipe parallax-strips
const D = 8, W = 1280;
// one strip: `count` shapes `gap` px apart, scrolling left at `speed` px/s from x = 0 for D seconds
const strip = (name, speed, gap, y, size, color) => {
  const count = Math.ceil((speed * D + W) / gap) + 1;
  return Array.from({ length: count }, (_, i) => ({
    type: 'shape', shape: 'rect', name: `${name}-${i}`, width: size, height: size * 2,
    initial: { x: i * gap, y, fillColor: color },
    keyframes: [{ at: 0, to: { x: i * gap - speed * D }, duration: D, ease: 'none' }],
  }));
};
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1b2a4a' } },
  ...strip('far', 30, 240, 420, 60, '#26365c'),               // distant hills: 30 px/s
  ...strip('mid', 120, 200, 500, 40, '#314a7a'),              // 120 px/s
  ...strip('near', 480, 360, 600, 24, '#0b1220'),             // poles: 480 px/s
];
```

To land something exactly where you want at a time `t` (a moon under a bridge at 6 s), compute the strip's x at `t` the same way: `i * gap - speed * t`.

---

## Draw it yourself: the `canvas` layer (an afterimage, rings that grow, a pixel sprite, a simulation)

When no layer draws what you need, write the drawing as a **function of the time**: `draw(ctx, t, info)` paints into the layer's own cleared 2D canvas and the layer is a normal layer (`initial`, `keyframes`, `filters`, `mask`, export). Rules: the same `t` and `info.params` give the same pixels (no `Math.random` or `Date.now`: `info.random()` is seeded), nothing survives from the last frame, and a simulation is computed whole in `setup`. `help canvas` has the contract.

An **afterimage** is drawn from the positions of the past, not from the last picture:

```js
// @recipe canvas-trail
const at = (t) => ({ x: 640 + 420 * Math.sin(t * 1.7), y: 360 + 200 * Math.sin(t * 2.9) });      // where the dot is at time t
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101420' } },
  { type: 'canvas', name: 'trail', duration: 6, params: { tail: 0.5 },
    draw: (ctx, t, info) => {
      const N = 14;
      for (let i = N; i >= 0; i--) {                                  // the oldest first, the head last
        const p = at(Math.max(0, t - i * info.params.tail / N));
        ctx.globalAlpha = (1 - i / (N + 1)) * 0.85;
        ctx.fillStyle = '#ff4f1a';
        ctx.beginPath(); ctx.arc(p.x, p.y, 34 - i * 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } },
];
```

**Rings that grow**, wobbling a little with a seeded `random()`, and `params` that keyframes animate (the `progress` of the layer is `info.progress`):

```js
// @recipe canvas-rings
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#efe9dc' } },
  { type: 'canvas', name: 'rings', width: 720, height: 720, duration: 8, seed: 3, params: { years: 0 },
    initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, to: { 'params.years': 40 }, duration: 8, ease: 'power1.inOut' }],
    draw: (ctx, t, info) => {
      const cx = info.width / 2, cy = info.height / 2, n = Math.floor(info.params.years);
      const wob = Array.from({ length: n + 1 }, () => [info.random() * 6, info.random() * Math.PI * 2]);      // the same wobble at every frame
      for (let k = n; k >= 0; k--) {
        const r = 8 + k * 8.5 + (k === n ? (info.params.years - n) * 8.5 : 0);
        ctx.beginPath();
        for (let a = 0; a <= 64; a++) { const th = (a / 64) * Math.PI * 2, rr = r + wob[k][0] * Math.sin(th * 3 + wob[k][1]); ctx.lineTo(cx + rr * Math.cos(th), cy + rr * Math.sin(th)); }
        ctx.closePath();
        ctx.fillStyle = k % 2 ? '#c9a36a' : '#a87c45'; ctx.fill();
      }
    } },
];
```

A **pixel sprite**: drawn small with `smoothing: false`, shown big (the layer is scaled up and the pixels stay hard):

```js
// @recipe canvas-pixel-sprite
const ROWS = ['..1111..', '.111111.', '11.11.11', '11111111', '.1.11.1.', '..1111..', '.1....1.', '1......1'];
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1b1330' } },
  { type: 'canvas', name: 'sprite', width: 8, height: 8, smoothing: false, duration: 8,
    initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5, scale: 30 },
    keyframes: [{ at: 0, from: { y: 300 }, to: { y: 420 }, duration: 8, ease: 'steps(16)' }],             // moves in whole steps
    draw: (ctx, t) => {
      const blink = Math.floor(t * 2) % 2;                          // two frames of animation
      ROWS.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') { ctx.fillStyle = (y === 2 && blink) ? '#1b1330' : '#ffd166'; ctx.fillRect(x, y, 1, 1); } }));
    } },
];
```

A **simulation** (a game of life) is computed WHOLE in `setup`, one array per generation, and `draw` only reads the generation for the time (`info.frame`, or here `t`): a pure function of the time, so a seek or an export agrees with playback:

```js
// @recipe canvas-life
const W = 48, H = 27, GENERATIONS = 90;
const step = (g) => g.map((row, y) => row.map((v, x) => {
  let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += g[(y + dy + H) % H][(x + dx + W) % W];
  return n === 3 || (v && n === 2) ? 1 : 0;
}));
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0b0f14' } },
  { type: 'canvas', name: 'life', width: 960, height: 540, duration: 6, seed: 11, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
    setup: (info) => {
      let g = Array.from({ length: H }, () => Array.from({ length: W }, () => (info.random() < 0.3 ? 1 : 0)));
      const all = [g]; for (let i = 1; i < GENERATIONS; i++) all.push((g = step(g)));
      return all;
    },
    draw: (ctx, t, info) => {
      const g = info.state[Math.min(info.state.length - 1, Math.floor(t * 15))];          // 15 generations a second
      ctx.fillStyle = '#7bd88f';
      g.forEach((row, y) => row.forEach((v, x) => { if (v) ctx.fillRect(x * 20 + 2, y * 20 + 2, 16, 16); }));
    } },
];
```

---

## Type, curves and charts in a canvas layer (type through a moving texture, text along a curve, bars that swap places)

The `canvas` layer (see the section above and `help canvas`) is also where text effects the text layer cannot do and live charts are drawn. `info.canvas(w, h)` makes sprites and masks in `setup`, `info.time` is the movie's clock, and `ease`, `noise`, `noise2`, `random`, `samplePath` are importable from `pixi-effects`. `check` does not see text drawn in a canvas: look at the sheet and at `--crop` enlargements.

**Type as a window onto something that moves.** Draw the words once into a canvas from `info.canvas` (in `setup`), draw them back first, then paint with `source-atop`: the paint shows only where the words are (two `fillText` under `destination-in` would intersect instead):

```js
// @recipe canvas-text-mask
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0d0a14' } },
  { type: 'canvas', name: 'window', width: 1100, height: 320, duration: 6, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
    setup: (info) => {                                                // the words, drawn once into a canvas of their own
      const word = info.canvas(1100, 320), c = word.getContext('2d');
      c.fillStyle = '#fff'; c.font = '900 280px "Arial Black", "Helvetica Neue", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LIGHT', 550, 160);
      return { word };
    },
    draw: (ctx, t, info) => {
      ctx.drawImage(info.state.word, 0, 0);                           // the words first: they are the window …
      ctx.globalCompositeOperation = 'source-atop';                   // … and what is drawn next appears only where they are
      ctx.fillStyle = '#2a1030'; ctx.fillRect(0, 0, 1100, 320);
      for (let k = 0; k < 14; k++) {                                  // bands of colour sliding through
        ctx.fillStyle = k % 2 ? '#ff4f1a' : '#ffb347';
        ctx.fillRect(((k * 90 + t * 160) % 1260) - 80, 0, 38, 320);
      }
    } },
];
```

**Text along a curve, and a line that draws on.** `samplePath(d)` walks SVG path data by length: `at(u)` is the point and the heading a fraction `u` along, `trim(a, b)` the part between two fractions. `ease('power2.out')` is the same easing a keyframe takes. Build the sampler once, outside `draw`:

```js
// @recipe canvas-text-on-path
const route = samplePath('M 140 560 C 340 120 940 120 1140 560');
const WORD = 'ALONG THE CURVE', EASE = ease('power2.out');
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101420' } },
  { type: 'canvas', name: 'along', duration: 6,
    draw: (ctx, t) => {
      const run = EASE(Math.min(1, t / 3));                           // 0 → 1: the line draws on, then the letters settle
      ctx.strokeStyle = '#ff4f1a'; ctx.lineWidth = 3; ctx.beginPath();
      for (const piece of route.trim(0, run)) { ctx.moveTo(piece[0], piece[1]); for (let i = 2; i < piece.length; i += 2) ctx.lineTo(piece[i], piece[i + 1]); }
      ctx.stroke();
      ctx.font = '700 54px Georgia, serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f4efe6';
      let d = 0;                                                      // distance along the route, in px
      for (const ch of WORD) {
        const w = ctx.measureText(ch).width;
        const u = (d + w / 2 + 90) / route.length - (1 - run) * 0.5;  // where this letter's middle is, a fraction along
        d += w + 4;
        if (u < 0 || u > 1) continue;
        const p = route.at(u);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.globalAlpha = run; ctx.fillText(ch, -w / 2, -30); ctx.restore();
      }
    } },
];
```

**Bars that swap places smoothly.** A bar's row is its rank averaged over the last third of a second, computed from `t` alone (the values at those earlier moments are a function of time too): when two bars change places they glide past each other, passing through one another for the length of the swap as in any bar race, nothing jumps, and a seek is exact:

```js
// @recipe canvas-bars
const NAMES = ['Oslo', 'Lima', 'Kyiv', 'Pune', 'Graz'], FROM = [40, 55, 30, 20, 45], TO = [60, 35, 70, 50, 25];
const BAR = 90, GAP = 28, EASE = ease('power2.inOut');
const valuesAt = (time) => FROM.map((a, i) => a + (TO[i] - a) * EASE(Math.min(1, Math.max(0, time) / 5)));
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101420' } },
  { type: 'canvas', name: 'race', width: 1000, height: 600, duration: 6, initial: { x: 140, y: 60 },
    draw: (ctx, t) => {
      const now = valuesAt(t), before = Array.from({ length: 8 }, (_, k) => valuesAt(t - k * 0.04));   // the last third of a second
      ctx.font = '700 34px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      now.forEach((value, i) => {
        const rank = before.reduce((sum, v) => sum + v.filter(other => other > v[i]).length, 0) / before.length;   // 0 = top
        const y = rank * (BAR + GAP);
        ctx.fillStyle = i === 2 ? '#ff4f1a' : '#4c5a78'; ctx.fillRect(160, y, value * 10, BAR);
        ctx.fillStyle = '#f4efe6'; ctx.textAlign = 'right'; ctx.fillText(NAMES[i], 140, y + BAR / 2);
        ctx.textAlign = 'left'; ctx.fillText(String(Math.round(value)), 160 + value * 10 + 14, y + BAR / 2);
      });
    } },
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
const EACH = 0.12;                                            // seconds between bars: 0.12 is a quick wave; EACH = DUR + 0.3 grows them one at a time
const PEAK_AT = Math.max(4, 0.4 + (data.length - 1) * EACH + DUR + 0.2);   // the highlight and the callout come after the last bar has grown
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
  const at = 0.4 + i * EACH;
  const h = CHART_H * value / NICE;
  sequences.push({
    type: 'shape', shape: 'rect', width: BAR_W, height: 0, cornerRadius: 8, anchorY: 1, at, colorSpace: 'oklab',
    initial: { x, y: BASE, fillColor: '#4f6df5' },
    keyframes: [
      { at: 0, to: { height: h }, duration: DUR, ease: EASE },
      ...(i === best ? [{ at: PEAK_AT - at, to: { fillColor: '#ffd166' }, duration: 0.5 }] : [{ at: PEAK_AT - at, to: { alpha: 0.45 }, duration: 0.5 }]),   // highlight the maximum at t = 4 s
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
sequences.push({ type: 'shape', shape: 'rect', width: PW, height: 52, cornerRadius: 26, at: PEAK_AT + 0.2, initial: { x: cx, y: cy, fillColor: '#ffd166', alpha: 0 },
                 keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }] });
sequences.push({ type: 'shape', shape: 'polygon', points: [[-10, 0], [10, 0], [0, 12]], at: PEAK_AT + 0.2, initial: { x: cx, y: cy + 32, fillColor: '#ffd166', alpha: 0 },
                 keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }] });
sequences.push({ type: 'text', text, at: PEAK_AT + 0.2, style: { fontSize: FS, fontWeight: 'bold', fill: '#1b1b2f' }, initial: { x: cx, y: cy, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
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

**A plain cut instead of a transition, generated images, music with no file:** scenes are layers one after the other (`at` = `i × L`) with no `transitions`; the images are the assets `p1…p3` (draw them with `placeholderPhoto`, recipe `placeholder-images`). The tune is written as text: at 96 bpm a beat is 0.625 s, so 24 beats are 15 s and every track has to add up to 24 (the check's `music` read-back shows each track's length).

```js
// @recipe slideshow-cuts
const N = 3, L = 5, total = N * L;
const sequences = Array.from({ length: N }, (_, i) =>
  kenBurns({ asset: 'p' + (i + 1), name: 'scene' + i, at: i * L, duration: L, motion: i % 2 ? 'position' : 'scale' }));
sequences.push({ type: 'audio', at: 0, volume: 0.7, duration: total, music: {
  bpm: 96,
  tracks: [
    { inst: 'pad',  notes: 'Am:4 F:4 C:4 G:4 Am:4 F:4' },                     // 6 chords x 4 beats = 24 beats = 15 s
    { inst: 'bass', notes: 'a1:4 f1:4 c2:4 g1:4 a1:4 f1:4' },
  ],
} });
return { sequences, duration: total };
```

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
const EASE = 'power3.out', AT = 0.3, DUR = 2;
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0f1424' } },
  { type: 'shape', shape: 'arc', name: 'track', radius: R, startAngle: 0, endAngle: 360,
    initial: { x: CX, y: CY, strokeColor: '#27304d', strokeWidth: 24 } },
  { type: 'shape', shape: 'arc', name: 'progress', radius: R, startAngle: -90, endAngle: -90, strokeCap: 'round',
    initial: { x: CX, y: CY, strokeColor: '#ffd166', strokeWidth: 24 },
    keyframes: [{ at: AT, to: { endAngle: -90 + 360 * TO }, duration: DUR, ease: EASE }] },
  { type: 'text', name: 'percent', text: '{value}%', format: { decimals: 0 },
    style: { fontSize: 72, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: CX, y: CY, anchorX: 0.5, anchorY: 0.5, value: 0 },
    keyframes: [{ at: AT, to: { value: TO * 100 }, duration: DUR, ease: EASE }] },
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

**Vertical Japanese (tategaki)** is one option: `vertical: true`. The characters go down a column and a new line is a new column to the LEFT, so `x` is the RIGHT edge of the first column. The commas sit at the upper right of their cell, and the long vowel mark and the brackets are turned a quarter, as in print.

```js
// @recipe vertical-text
const style = { fontFamily: 'Hiragino Mincho ProN, Yu Mincho, serif', fontSize: 56, fill: '#1c1a17' };
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#efe9dc' } },
  ...animateText('雨のあと、\nコーヒーは「ゆっくり」', style, { x: 900, y: 70, vertical: true, at: 0.3, duration: 5, in: 'fade', stagger: { each: 0.04 } }),
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
// @docs-only deck-in-page
// in the page: the deck is spread into init; the Presenter (or the Controller, which then shows the stops and a Present button) plays it
import { Movie } from 'pixi-effects';
import { deck, Presenter } from 'pixi-effects/present';     // (add "pixi-effects/present" to the import map)
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

## A rack focus (depth of field)

`focus` and `aperture` on the camera blur the `threeD` layers by how far they are from the sharp plane; the layer named in `focus` stays sharp. Writing `focus` alone is enough (`aperture` defaults to 30; 0 turns it off). A rack focus is a normal keyframe on `focus`, and a layer's name works there too (it means that layer's first `z`). Keep `aperture` at 30–60: 100 is extreme.

```js
// @recipe rack-focus
const word = (name, text, x, z, fill) => ({
  type: 'text', name, text, threeD: true, style: { fontSize: 120, fill, fontFamily: 'sans-serif', fontWeight: '700' },
  initial: { x, y: 360, z, anchorX: 0.5, anchorY: 0.5 },
});
return { duration: 5, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101626' } },
  { type: 'camera', initial: { focus: 'near', aperture: 40 },
    keyframes: [
      { at: 1, to: { focus: 'far' }, duration: 1, ease: 'power2.inOut' },          // near -> far
      { at: 3, to: { focus: 'near' }, duration: 1, ease: 'power2.inOut' },         // and back
    ] },
  word('far', 'FAR', 960, -600, '#6ec6ff'),
  word('mid', 'MID', 640, -200, '#ffd166'),
  word('near', 'NEAR', 320, 200, '#ef476f'),
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

## Light leaks and colour casts (blend modes)

`blendMode` mixes a layer with everything **below** it. A colour cast is one `soft-light` gradient over the whole picture, a light leak is a `color-dodge` glow that drifts across it, a vignette is a `multiply` radial gradient that goes from clear to dark. Each is ONE layer (a gradient), not a pile of shapes: the blend modes beyond `add` / `screen` / `multiply` cost a full-frame pass each. Over a dark picture a `color-dodge` glow turns the near-black into a muddy red disc: cut it to the bright subject with a matte (`mask: 'letters'`) and put the warm haze in a separate `screen` radial.

```js
// @recipe light-leak
const skyline = Array.from({ length: 9 }, (_, i) => ({
  type: 'shape', shape: 'rect', name: 'block-' + i, width: 90 + (i % 3) * 30, height: 160 + ((i * 53) % 190), anchorX: 0, anchorY: 1,
  initial: { x: 40 + i * 140, y: 650, fillColor: '#0d1220' },
}));
return { duration: 6, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, initial: { x: 0, y: 0 },
    fillGradient: { stops: [[0, '#2a3b66'], [0.55, '#8a5a78'], [1, '#e8a060']] } },
  ...skyline,
  // a colour cast: orange at the top, blue at the bottom, over everything above
  { type: 'shape', shape: 'rect', name: 'cast', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, blendMode: 'soft-light', initial: { x: 0, y: 0, alpha: 0 },
    fillGradient: { stops: [[0, '#ff9a3c'], [1, '#3c5bff']] },
    keyframes: [{ at: 0.5, to: { alpha: 0.9 }, duration: 2, ease: 'sine.inOut' }] },
  // a light leak: a strong source burning out toward white as it drifts in from the right
  { type: 'shape', shape: 'circle', name: 'leak', radius: 380, blendMode: 'color-dodge', initial: { x: 1500, y: 140 },
    fillGradient: { type: 'radial', stops: [[0, 'rgba(255,120,30,0.9)'], [1, 'rgba(255,120,30,0)']] },
    keyframes: [{ at: 1, to: { x: 900 }, duration: 3.5, ease: 'power2.out' }] },
  // a vignette: clear in the middle, dark at the corners
  { type: 'shape', shape: 'rect', name: 'vignette', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, blendMode: 'multiply', initial: { x: 0, y: 0 },
    fillGradient: { type: 'radial', radius: 0.8, stops: [[0.5, 'rgba(255,255,255,1)'], [1, 'rgba(60,60,80,1)']] } },
] };
```

---

## A matte shared by several layers (`mask: 'name'`)

Name a layer and write its name as the `mask` of the layers it should cut: the matte is drawn once and **not shown itself**. Here one band sweeps across three lines of text; one line is cut by brightness (`luma`) and one by the opposite of the band (`invert`), so it fills in where the others are cut.

```js
// @recipe shared-matte
const line = (y, text, mask, extra = {}) => ({
  type: 'text', text, mask, style: { fontSize: 120, fill: '#ffffff', fontWeight: 'bold' },
  initial: { x: 640, y, anchorX: 0.5, anchorY: 0.5 }, ...extra,
});
return { duration: 5, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#101626' } },
  // the matte: a bright band that grows to the right; it lives as long as the layers it cuts
  { type: 'shape', shape: 'rect', name: 'band', anchorX: 0, anchorY: 0, width: 0, height: 720,
    initial: { x: 140, y: 0, fillColor: '#ffffff' },
    keyframes: [{ at: 0.4, to: { width: 1000 }, duration: 2, ease: 'power2.inOut' }] },
  line(200, 'ONE MATTE', 'band'),
  line(360, 'SHARED BY', { layer: 'band', channel: 'luma' }),
  line(520, 'THREE LAYERS', { layer: 'band', invert: true }, { initial: { x: 640, y: 520, anchorX: 0.5, anchorY: 0.5, fillColor: '#ffd166' } }),
] };
```

---

## A luma wipe (a transition that follows a brightness map)

`{ kind: 'luma', map: 'radial' }` opens the next scene from the middle; `'linear'` sweeps left to right, `'diagonal'` corner to corner, or give the name of a grayscale image asset (dark parts change first). `softness` is the width of the soft edge and `flip` reverses the direction.

```js
// @recipe luma-wipe
const scene = (name, at, color, label) => ({
  type: 'composition', name, at, duration: 4, width: 1280, height: 720,
  sequences: [
    { type: 'shape', shape: 'rect', width: 1280, height: 720, initial: { x: 640, y: 360, fillColor: color } },
    { type: 'text', text: label, style: { fontSize: 120, fill: '#ffffff', fontWeight: 'bold' }, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 } },
  ],
});
return {
  sequences: [scene('a', 0, '#3b5bdb', 'One'), scene('b', 3, '#e64980', 'Two')],     // they overlap for 1 s: 3 to 4
  transitions: [{ kind: 'luma', from: 'a', to: 'b', at: 3, duration: 1, map: 'radial', softness: 0.15 }],
  duration: 7,
};
```

---

## A spotlight across a dark room (light and shadow)

An ambient light keeps the room from going black, a `spot` light sweeps across three cards and they throw shadows on the wall behind them. The shadow needs `castsShadows` on the light **and** on each card; `lookAtX` moves the beam and `x` moves the lamp with it.

```js
// @recipe spot-room
const card = (name, x, fill) => ({
  type: 'shape', shape: 'rect', name, width: 300, height: 200, anchorX: 0.5, anchorY: 0.5, threeD: true, castsShadows: true,
  initial: { x, y: 300, z: 0, fillColor: fill },
});
return { duration: 6, sequences: [
  { type: 'light', kind: 'ambient', initial: { intensity: 0.18 } },
  { type: 'light', kind: 'spot', castsShadows: true,
    initial: { x: 160, y: -120, z: 700, lookAtX: 260, lookAtY: 330, lookAtZ: 0, coneAngle: 34, coneFeather: 0.7, intensity: 1.1, shadowDiffusion: 14 },
    keyframes: [{ at: 0.5, to: { x: 1100, lookAtX: 1020 }, duration: 4.5, ease: 'sine.inOut' }] },
  // the wall, big and behind the cards (a room is layers in distance order: no depth buffer)
  { type: 'shape', shape: 'rect', name: 'wall', width: 1800, height: 900, anchorX: 0.5, anchorY: 0.5, threeD: true, initial: { x: 640, y: 300, z: -260, fillColor: '#6b7280' } },
  card('a', 300, '#e0a458'), card('b', 640, '#58a4e0'), card('c', 980, '#e05876'),
] };
```

---

## Fog that thickens with distance (camera fog)

Fog is the camera's (`fogNear`, `fogFar`, `fogColor`, `fogAmount`): `threeD` layers are mixed toward the fog colour by how far they are. 2D layers are not fogged, so the background is drawn in the fog colour and what is far dissolves into it.

```js
// @recipe fog-depth
const posts = Array.from({ length: 10 }, (_, i) => ({
  type: 'shape', shape: 'rect', name: 'post-' + i, width: 80, height: 420, anchorX: 0.5, anchorY: 1, threeD: true,
  initial: { x: 200 + (i % 2) * 880, y: 620, z: -i * 220, fillColor: '#1f2a44' },
}));
return { duration: 6, sequences: [
  { type: 'shape', shape: 'rect', name: 'sky', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#9fb4d6' } },
  { type: 'camera', initial: { fogNear: 900, fogFar: 2600, fogColor: '#9fb4d6', fogAmount: 0.95 },
    keyframes: [{ at: 0, to: { offsetZ: -700 }, duration: 6, ease: 'sine.inOut' }] },        // dolly in: the nearer posts come out of the mist
  ...posts,
] };
```

---

## A flowing colour field (a `shader` layer)

A shader is a layer drawn by a formula: write a Shadertoy `mainImage`. `iTime` is the layer's own clock, the `uniforms` are declared for you and keyframes move them (`'uniforms.speed'`, and a component of a colour as `'uniforms.tint.2'`). Opaque by default.

```js
// @recipe shader-plasma
return { duration: 6, sequences: [
  { type: 'shader', name: 'plasma',
    fragment: `
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy;
        float v = sin(uv.x * 9.0 + iTime * speed) + sin(uv.y * 7.0 - iTime * speed * 1.3) + sin((uv.x + uv.y) * 5.0 + iTime);
        vec3 deep = vec3(0.04, 0.02, 0.18);
        fragColor = vec4(mix(deep, tint, 0.5 + 0.25 * v), 1.0);
      }`,
    uniforms: { tint: '#ff7a3d', speed: 0.6 },
    keyframes: [{ at: 0, to: { 'uniforms.speed': 2, 'uniforms.tint.2': 0.9 }, duration: 6, ease: 'sine.inOut' }] },
  { type: 'text', text: 'PLASMA', style: { fontSize: 140, fill: '#ffffff', fontWeight: 'bold', letterSpacing: 12 }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 } },
] };
```

---

## Text seen through water (the `warp` filter)

`warp` bends a layer's picture: `kind: 'wave'` is a travelling wave (the surface of water, a flag), `kind: 'haze'` is drifting noise (heat shimmer). `strength` is the largest shift in px, `scale` the wavelength in px, `speed` how fast it moves (0 stands still). It follows the frame's time by itself, and its options move with keyframes by the filter's name.

```js
// @recipe warp-water
return { duration: 6, sequences: [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, initial: { x: 0, y: 0 },
    fillGradient: { stops: [[0, '#0b3a5c'], [1, '#021a2e']] } },
  { type: 'text', text: 'UNDER WATER', style: { fontSize: 120, fill: '#d8f3ff', fontWeight: 'bold', letterSpacing: 6 },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    filters: [{ type: 'warp', name: 'ripple', kind: 'wave', strength: 6, scale: 70, speed: 0.8, angle: 90 },
              { type: 'warp', kind: 'haze', strength: 3, scale: 30, speed: 0.4 }],
    keyframes: [{ at: 0, to: { 'filters.ripple.strength': 16 }, duration: 6, ease: 'sine.inOut' }] },
] };
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

## A gradient that moves (a turning fade, a drifting glow, letters that change colour)

A keyframe's `fillGradient` is partial: write only what moves. `colorSpace: 'oklch'` keeps the fade vivid.

```js
// @recipe gradient-shift
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', colorSpace: 'oklch', initial: { x: 'GW/2', y: 'GH/2' },
    fillGradient: { angle: 20, stops: [[0, '#1b2a6b'], [1, '#7b3fe4']] },
    keyframes: [{ at: 0, duration: 4, ease: 'sine.inOut', to: { fillGradient: { angle: 200, stops: [[0, '#7b3fe4'], [1, '#ff6a88']] } } }] },
  { type: 'shape', shape: 'circle', radius: 260, initial: { x: 'GW/2', y: 'GH/2' },
    fillGradient: { type: 'radial', center: [0.2, 0.2], radius: 0.3, stops: [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']] },
    keyframes: [{ at: 0, duration: 4, ease: 'sine.inOut', to: { fillGradient: { center: [0.8, 0.8], radius: 0.6 } } }] },
  { type: 'text', text: 'SHIFT', name: 'title', style: { fontSize: 220, fontWeight: '900' }, colorSpace: 'oklch',
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    fillGradient: { angle: 0, stops: [[0, '#ffd60a'], [1, '#22c55e']] },
    keyframes: [{ at: 0, duration: 4, to: { fillGradient: { angle: 180, stops: [[0, '#00e5ff'], [1, '#ff2d55']] } } }] },
];
```

---

## Film grain over the whole picture

`grain` is seeded, new every 1/`fps` s (24 by default), mid-tone weighted and the same on every GPU. Put it on the root `filters` for the film look, or on one layer. (`noise` is not grain: it is frozen and lifts blacks.) It costs video bitrate.

```js
// @recipe film-grain
// the scene is wrapped in a composition layer that carries the filter (on a whole movie, put the same filter in `composition: { filters: [...] }`)
const scene = [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#3a4a6b' } },
  { type: 'text', text: 'FILM', name: 'title', at: 0.3, duration: 3.7, style: { fontSize: 200, fontWeight: '900', fill: '#f4f1ea' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.8 }] },
];
return [{ type: 'composition', name: 'film', width: 'GW', height: 'GH', sequences: scene, filters: [{ type: 'grain', name: 'g', amount: 0.06, size: 2, color: 0.2 }] }];
```

---

## Generated placeholder images (no photos available)

Draw on a canvas and register `canvas.toDataURL()` as an asset (`data:` URLs work). Make the image at least canvas-sized (1920×1080 for a 1280×720 movie) so `kenBurns` zooms stay sharp.

```js
// @docs-only placeholder-images
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
// @docs-only metallic-three
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

## A glTF model that runs in the same space as the flat layers (`threeGltf`, `followCamera`)

A `three` layer is the free box: `threeGltf` and `threeFrameCamera` (from `pixi-effects/three`) only do the two things that are easy to get wrong by hand: pose the clip by the layer's time (`AnimationMixer.setTime`, never `mixer.update(dt)`: a seek and an export must give the same frame) and frame the whole model. With `followCamera` / `followLights` the composition's own `camera` and `light` layers drive the scene, so ONE `cameraPath()` or `orbit()` flies through the flat layers and the model together.

Rules to read before you copy:
- **Placement.** The scene is in composition pixels with y flipped: the composition point `(x, y, z)` is `object.position.set(x, -y, z)`. The middle of a 1280 × 720 composition is `position.set(640, -360, 0)`.
- **Size.** `fit(px)` scales the model so its longest side (its bounding box in the file's bind pose, which may be longer than a running pose) is `px` pixels. Size it against the other layers: a 480 px fox beside a 420 px title.
- **Facing.** glTF models usually face +z (toward the viewer). `object.rotation.y = Math.PI / 2` turns one to run toward +x.
- **Light.** With a `light` layer present, `threeD` text and shapes are lit too: a bright colour can blow out, and a dark one can sink. `lit: false` keeps a layer's own colour.
- **Order.** The three layer is an ordinary layer in the stack: flat `threeD` layers listed after it are drawn over it (a label), those before it are behind it (a title). Depth does not interleave them.
- **Clips.** `npx pixi-effects probe Fox.glb` lists the clip names and the size of the model before you write code.
- **The page.** The template's import map already has `three` and `three/addons/`; uncomment the `import { registerThree, threeGltf } from 'pixi-effects/three'` line and call `registerThree()` before `movie.init`. The `.glb` is fetched next to the page.

```js
// @docs-only gltf-in-space
// import { registerThree, threeGltf } from 'pixi-effects/three';   registerThree();   (before movie.init)
// composition 1280 x 720, 4 s
let fox;
return [
  { type: 'camera', keyframes: [{ at: 0, from: { x: 420, lookAtX: 'GW/2' }, to: { x: 860 }, duration: 4, ease: 'sine.inOut' }] },   // moves the text card AND the fox
  { type: 'light', kind: 'ambient', initial: { intensity: 0.7 } },
  { type: 'light', kind: 'parallel', initial: { x: 140, y: -260, z: 900, lookAtX: 'GW/2', lookAtY: 'GH/2', lookAtZ: 0, intensity: 1.2 } },
  { type: 'text', text: 'FOX', threeD: true, style: { fontSize: 420, fontWeight: '900', fill: '#ff7a1a' }, initial: { x: 'GW/2', y: 'GH/2', z: -500, anchorX: 0.5, anchorY: 0.5 } },
  { type: 'three', name: 'fox', followCamera: true, followLights: true,                 // a plain spec: the layer covers the composition and sits in the stack like any layer
    setup: async (ctx) => {
      fox = await threeGltf('Fox.glb', { animation: 'Run' });                            // a clip name, an index, or false (the bind pose); speed, offset, loop
      fox.fit(480);                                                                      // the longest side in px: the model is in metres, the scene in pixels
      fox.object.rotation.y = Math.PI / 2;                                               // faces +x
      fox.object.position.set(640, -400, 0);                                             // the composition point (640, 400), y flipped
      ctx.scene.add(fox.object);
    },
    update: (t) => fox.pose(t) },                                                        // the clip at the layer's time: a function of t
];
```

Without `followCamera` the layer keeps its own camera: `threeFrameCamera(ctx.camera, fox.object)` puts it where the whole model fits (a three-quarter view; `{ direction, margin }` change it). Shadows work too: give a light `castsShadows: true` and mark your meshes `castShadow` / `receiveShadow` (a wall that receives, a model that casts; `threeGltf` models cast with `model.object.traverse(o => { if (o.isMesh) o.castShadow = true; })`). Fog: `followFog: true`. A `three` wall under `MeshStandardMaterial` is much brighter than a flat card under the same light (three lights in linear light with physical materials, the composition shades sRGB values), so a flat 2D caption on a three wall can look dark: raise its colour, or give the wall a darker `color`, or make the wall a `MeshLambertMaterial` with three's colour management off (`npx pixi-effects help followLights`).

## A model running through a spotlight, with its shadow on a wall (`castsShadows` in three)

A dark room: a wall that RECEIVES the shadow, a model that CASTS it, one spot light that sweeps (a `light` layer with keyframes, so it moves like any layer), and a flat caption that the same light reveals. The light is the composition's; the layer mirrors it into three (`followLights`). A `three` wall under `MeshStandardMaterial` is brighter than a flat card under the same light (three lights in linear light, the composition shades sRGB values): pick the wall's `color` dark (a mid grey `0x6d717b` reads as a bright disc, not a dark room; `0x3f434b` is moody and the shadow still shows) and look at the picture. Placement, size and facing are as in `gltf-in-space` (`position.set(x, -y, z)`; `fit(px)`; `rotation.y = Math.PI / 2` runs the model toward +x); the `.glb` path is relative to the page.

```js
// @docs-only gltf-shadow-room
// import { registerThree, threeGltf } from 'pixi-effects/three';   registerThree();   import * as THREE from 'three';   (before movie.init)
// composition 1280 x 720, 5 s. The model faces +z in the file: rotation.y = PI / 2 runs it toward +x.
let fox;
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#030305' } },
  { type: 'light', kind: 'ambient', initial: { intensity: 0.05 } },
  { type: 'light', kind: 'spot', castsShadows: true, initial: { x: -160, y: 430, z: 560, lookAtX: 260, lookAtY: 340, lookAtZ: -100, coneAngle: 40, coneFeather: 0.7, intensity: 1.6, shadowDiffusion: 6 },
    keyframes: [{ at: 0.3, to: { x: 600, lookAtX: 1020 }, duration: 4.4, ease: 'sine.inOut' }] },      // the beam sweeps across the wall
  { type: 'three', name: 'world', followCamera: true, followLights: true,
    setup: async (ctx) => {
      fox = await threeGltf('Fox.glb', { animation: 'Run' });
      fox.fit(360); fox.object.rotation.y = Math.PI / 2;
      fox.object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });         // the model casts
      fox.object.position.set(150, -540, 0);                                                                   // the composition point (150, 540), y flipped: it runs on the floor
      ctx.scene.add(fox.object);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1400), new THREE.MeshStandardMaterial({ color: 0x3f434b, roughness: 0.95 }));
      wall.position.set(640, -330, -130); wall.receiveShadow = true; ctx.scene.add(wall);                      // the wall receives
    },
    update: (t) => { fox.pose(t); fox.object.position.x = 150 + 980 * Math.min(1, t / 4.6); } },              // placed from t: a function of the time
  { type: 'text', text: 'RUN THROUGH THE LIGHT', threeD: true, style: { fontSize: 46, fontWeight: '800', fill: '#ffffff', letterSpacing: 6 },
    initial: { x: 'GW/2', y: 330, z: -126, anchorX: 0.5, anchorY: 0.5 } },                                      // a flat caption just in front of the wall, lit by the same light
];
```

A moving, shadow-casting model is held to "a function of the time" by `check`: place it from `t` in `update` (as above) and let `threeGltf` load it (it draws a skinned mesh always: three culls it by a bounding sphere that does not follow it).

## Click a layer: what is under the pointer (`movie.pick`)

`movie.pick(x, y)` answers "what is drawn under this point, at the frame on screen" with no hit-testing code of yours: a flat layer by its own shape, a `threeD` card by its projected quad, a `three` layer by a ray (the hit says which object). `movie.canvasPoint(event)` turns a pointer event into canvas pixels, whatever size the canvas is shown at. Name the layers you want to react to.

```js
// @docs-only pick-click
// in the page, after movie.init(...): a click on the fox, on the title, or on the wall behind them
const canvas = document.getElementById('stage');
canvas.addEventListener('click', (event) => {
  const hit = movie.pick(...movie.canvasPoint(event));           // the layer on top of that point, or null
  if (!hit) return;
  if (hit.kind === 'three' && hit.three.object === 'fox') console.log('the fox, at distance', hit.three.distance);   // a three layer: the object the ray met
  else if (hit.name === 'title') movie.play();                    // a flat layer: by its name
});
movie.hover({ ignore: ['background'], cursor: true,           // enter / leave as callbacks (it follows a picture that moves under a still pointer)
  onEnter: (hit) => console.log('over', hit.name),
  onLeave: (hit) => console.log('left', hit.name) });
// a test, or an AI checking its own page, asks about a chosen frame:  await movie.snapshot(90);  movie.pick(640, 360)
```

`pick` reads the frame as the last draw left it (it takes no time and has no clock), so a paused movie answers for the frame it shows. A transparent corner of a picture still counts as the picture; dragging is built on `pick` too: recipe `drag-drop`.

## Drag a layer and drop it on a target (`pick` and variables)

A layer whose place is two variables moves when the page sets them: `movie.setVars({ cx, cy })` builds the composition again at the same frame (tens of milliseconds for a light composition; calls that fall behind are joined, so it is safe from `pointermove`). `pick` says what is taken (`only`) and what lies under it when it is let go (`ignore` the dragged layer). Listen on the window while it is held, so the pointer may leave the canvas. A heavy composition (a model to load again, a long sound) rebuilds slowly: for it, keep the dragged thing a light layer in the page's own overlay, and tell the movie only at the drop.

```js
// @docs-only drag-drop
// the composition: the card's place is the variables cx and cy; the zone is where it can be dropped
//   await movie.init({ canvas, width: 960, height: 540, vars: { cx: 200, cy: 200 }, composition: { sequences: [
//     { type: 'shape', shape: 'rect', name: 'zone', width: 280, height: 280, initial: { x: 760, y: 400, anchorX: 0.5, anchorY: 0.5, fillColor: '#2a3a66' } },
//     { type: 'shape', shape: 'rect', name: 'card', width: 200, height: 120, initial: { x: 'cx', y: 'cy', anchorX: 0.5, anchorY: 0.5, fillColor: '#f2c14e' } },
//   ] } });
//   movie.pause();                                    // a still picture: nothing plays while it is dragged
canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = movie.canvasPoint(e);
  if (!movie.pick(x, y, { only: ['card'] })) return;                 // only the card can be picked up
  const grip = { dx: movie.vars.cx - x, dy: movie.vars.cy - y };      // where in the card it was taken, so it does not jump
  const place = (ev) => { const [px, py] = movie.canvasPoint(ev); return movie.setVars({ cx: px + grip.dx, cy: py + grip.dy }); };
  const move = (ev) => { place(ev); };
  const up = async (ev) => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    await place(ev);                                                  // the card is where it was let go: now ask what is under it
    const [px, py] = movie.canvasPoint(ev);
    const under = movie.pick(px, py, { ignore: ['card'] });           // the dragged layer is not what it lies on
    if (under?.name === 'zone') await movie.setVars({ cx: 760, cy: 400 });   // snap into the zone
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});
movie.hover({ only: ['card'], cursor: 'grab' });                       // the cursor says it can be taken
```

## Subtitles from an SRT file

Subtitles are just text layers. The function reads a `.srt` (numbers, `00:00:01,000 --> 00:00:03,500`, the words) and returns one layer per cue: it appears and disappears over 0.12 s, sits 90 px above the bottom edge, wraps at 1000 px (about 80 % of a 1280 px picture) and has a black outline so it reads on any picture. Two cues that overlap in time are drawn on top of each other: split a long line into two lines in the `.srt` rather than relying on wrapping. Check the result with `pixi-effects check`; it reports text that is cut off by the edge.

```js
// @recipe subtitles
// SRT text -> one text layer per cue. Paste your .srt into SRT; the function does the rest.
const SRT = `1
00:00:00,500 --> 00:00:02,800
Hello, and welcome.

2
00:00:03,000 --> 00:00:05,500
Subtitles are just text layers
that appear and disappear.`;

function srt(text, { bottom = 90, size = 44, color = '#ffffff', width = 1000 } = {}) {
  const sec = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + +ms / 1000;
  return text.replace(/\r/g, '').trim().split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    const t = i < 0 ? null : lines[i].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!t) return [];
    const at = sec(t[1], t[2], t[3], t[4]), end = sec(t[5], t[6], t[7], t[8]);
    return [{
      type: 'text', name: `sub ${at.toFixed(2)}`, text: lines.slice(i + 1).join('\n'), at, duration: end - at,
      style: { fontFamily: 'Arial, sans-serif', fontSize: size, fontWeight: 'bold', fill: color, align: 'center', wordWrap: true, wordWrapWidth: width, stroke: { color: '#000000', width: 6 } },
      initial: { x: 'GW/2', y: `GH - ${bottom}`, anchorX: 0.5, anchorY: 1 },
      keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.12 }, { at: -0.12, to: { alpha: 0 }, duration: 0.12 }],
    }];
  });
}

return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1d2433' } },
  ...srt(SRT),
];
```

## One source, two formats (16:9 and 9:16), and a photo inside a region

Only when a vertical cut is wanted (ask first). It is not a crop of the wide one: write each scene as a function of a layout, switch with a query (`?f=9x16`), and render each format on its own: `npx pixi-effects check film.html --query f=9x16`, `npx pixi-effects render film.html --query f=9x16 -o film-9x16.mp4`. `photo()` fits a picture into any rectangle like CSS `cover` (scale from the image's own size, a mask for the rectangle); `scale: 'cover'` only fits the PARENT.

```js
// @docs-only two-formats
const PORTRAIT = new URLSearchParams(location.search).get('f') === '9x16';
const W = PORTRAIT ? 1080 : 1920, H = PORTRAIT ? 1920 : 1080, MX = PORTRAIT ? 76 : 150;      // margins: nothing important in the outer 5 %
const IMG = { hero: [1920, 1280] };                                                           // each photo's size (assets: [{ name: 'hero', src: '...' }])
const photo = (key, x, y, w, h, duration) => {
  const cover = Math.max(w / IMG[key][0], h / IMG[key][1]);
  return { type: 'image', asset: key, duration,
    mask: { type: 'shape', shape: 'rect', width: w, height: h, initial: { x: x + w / 2, y: y + h / 2, fillColor: '#fff' } },     // the mask lives in the parent's coordinates
    initial: { x: x + w / 2, y: y + h / 2, anchorX: 0.5, anchorY: 0.5, scale: cover },                                             // image anchors go in `initial`
    keyframes: [{ at: 0, to: { scale: cover * 1.1 }, duration, ease: 'sine.inOut' }] };                                             // a slow push
};
const scene = { type: 'composition', name: 'hook', at: 0, duration: 5.5, width: W, height: H, sequences: [
  photo('hero', 0, 0, W, H, 5.5),
  { type: 'text', text: 'Headline', initial: { x: MX, y: PORTRAIT ? 1150 : 620 }, style: { fontSize: PORTRAIT ? 100 : 112, fill: '#fff' } },   // wide: lower left; tall: lower third
] };
// movie.init({ width: W, height: H, composition: { sequences: [scene] } })
```

---

## A batch of videos from a table (one video per row)

A batch of videos is a loop outside the video. The page reads what changes from its address (`new URLSearchParams(location.search)`), and `pixi-effects render --query "name=Aiko&score=92"` opens it with those values. Names with spaces or non-Latin letters must be URL-encoded (`jq -sRr @uri` as below, or `encodeURIComponent` in Node). Each video starts its own browser, so N videos cost N start-ups: try one with `--draft` (half size, fast), then render the real ones. To make the pieces of one row differ in more than text, use the same values to pick colours or an image name.

```js
// @docs-only batch-page
// batch.html: the same video, with the words taken from the address (?name=Aiko&score=92)
const q = new URLSearchParams(location.search);
const NAME = q.get('name') ?? 'World';
const SCORE = q.get('score') ?? '0';
// ...then use NAME and SCORE in the text layers of your composition:
const sequences = [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#1d2433' } },
  { type: 'text', text: `Well done, ${NAME}!`, at: 0.3, duration: 3.7, style: { fontSize: 96, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: 'GW/2', y: 300, anchorX: 0.5, anchorY: 0.5 }, keyframes: [{ at: 0, from: { alpha: 0, y: 340 }, to: { alpha: 1, y: 300 }, duration: 0.6 }] },
  { type: 'text', text: `${SCORE} points`, at: 0.9, duration: 3.1, style: { fontSize: 64, fill: '#ffd166' },
    initial: { x: 'GW/2', y: 420, anchorX: 0.5, anchorY: 0.5 }, keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.6 }] },
];
```

```sh
# batch.sh: one video per row of table.csv (name,score). --draft first, to look; remove it for the real files.
mkdir -p out
while IFS=, read -r name score; do
  npx pixi-effects render batch.html --query "name=$(printf %s "$name" | jq -sRr @uri)&score=$score" -o "out/$name.mp4" --quiet
done < table.csv
```

---

## One film, several languages and colours (variables)

Declare what changes as `vars` and write `{name}` in the strings and the names as identifiers in the expressions. One page then makes every variant: a declared variable is set from the command line (`pixi-effects render film.html --var accent=#3949ab -o film-blue.mp4`; a name the page did not declare stops the run), the language below is picked by the page from the query (`--query lang=ja`, on `check` as well as `render`), and a page can switch live with `movie.setVars(...)`. Load the fonts of every language before the first build (pitfall 103); `check` says a variable nothing reads, and a `{name}` nobody declared.

```js
// @docs-only variants
const COPY = { en: { head: 'Spring sale', sub: 'Up to 40% off' }, ja: { head: '春のセール', sub: '最大40%オフ' } };
const lang = new URLSearchParams(location.search).get('lang') ?? 'en';
await movie.init({
  canvas, width: 1920, height: 1080, duration: 5,
  vars: { head: COPY[lang].head, sub: COPY[lang].sub, accent: '#e5399a', lift: 0 },        // numbers can be read in expressions, any value in {name}
  composition: { sequences: [
    { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#12151f' } },
    { type: 'text', text: '{head}', at: 0.3, duration: 4.7, style: { fontSize: 120, fontWeight: 'bold', fill: '{accent}' },
      initial: { x: 'GW/2', y: 'GH/2 - 40 - lift', anchorX: 0.5, anchorY: 0.5 }, keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.6 }] },
    { type: 'text', text: '{sub}', at: 0.9, duration: 4.1, style: { fontSize: 56, fill: '#ffffff' },
      initial: { x: 'GW/2', y: 'GH/2 + 80', anchorX: 0.5, anchorY: 0.5 }, keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.6 }] },
  ] },
});
// later, from a button: await movie.setVars({ head: COPY.ja.head, sub: COPY.ja.sub, accent: '#3949ab' });   // same frame, sound untouched
```

---

## A layout that follows the window (liquid)

`resize(w, h)` builds the composition again at that size, and every expression sees it as `W` / `H` / `GW` / `GH`: write the layout in those, never in pixels. For a different arrangement per shape (wide / tall) write the composition in a function of the size and hand it to `rebuild`. Watch a **box** that you size with CSS (`#box { width: 100vw; height: 100vh }`, the canvas inside it `width: 100%; height: 100%`), not the canvas: the movie sets the canvas's pixel size, and an observer on the canvas would see its own change and grow it again. `check --size 1920x1080,1080x1920` makes a contact sheet and a layout review for each size without a browser window.

```js
// @docs-only liquid-layout
const layout = (w, h) => {
  const tall = h > w;
  return { sequences: [
    { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#12151f' } },
    { type: 'text', text: 'Headline', style: { fontSize: tall ? 'GW * 0.12' : 'GH * 0.14', fontWeight: 'bold', fill: '#ffffff' },
      initial: { x: tall ? 'GW * 0.08' : 'GW/2', y: tall ? 'GH * 0.7' : 'GH/2', anchorX: tall ? 0 : 0.5, anchorY: 0.5 } },
  ] };
};
// <div id="box" style="width:100vw;height:100vh"><canvas id="stage" style="width:100%;height:100%;display:block"></canvas></div>
const box = document.getElementById('box');
const pixels = () => [Math.round(box.clientWidth * devicePixelRatio), Math.round(box.clientHeight * devicePixelRatio)];
const [w0, h0] = pixels();
await movie.init({ canvas, width: w0, height: h0, duration: 6, composition: layout(w0, h0) });
new ResizeObserver(() => {
  const [w, h] = pixels();
  movie.rebuild({ composition: layout(w, h), width: w, height: h }).catch(console.error);   // overlapping calls are joined: only the latest size is built
}).observe(box);
```

