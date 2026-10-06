# pixi-effects recipes

Copy, adapt, run. Every block marked `@recipe` is a function body that **returns the composition's `sequences`** (or `{ sequences, transitions, duration }`); the repo's tests build each one and fail on any warning, so they stay correct. Blocks marked `@docs-only` need a browser (canvas / three.js) and are not executed by the tests.

Assumed canvas: 1280×720 @ 30 fps. `kenBurns` and `withFade` come from `pixi-effects`.

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

Text cannot change its content over time. Show one text layer per value, each alive for a single frame; the last one stays.

```js
// @recipe count-up
const FPS = 30, FROM = 0, TO = 2480, AT = 1, DUR = 1.2;
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
const frames = Math.round(DUR * FPS);
const sequences = [];
for (let f = 0; f <= frames; f++) {
  const value = Math.round(FROM + (TO - FROM) * easeOutCubic(f / frames));
  sequences.push({
    type: 'text', text: value.toLocaleString('en-US'),
    at: AT + f / FPS,
    ...(f < frames ? { duration: 1 / FPS } : {}),        // every number lives one frame; the final one stays
    style: { fontSize: 96, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  });
}
return sequences;
```

If a bar must stay locked to a counter, snap every `at` / `duration` to `1/FPS` and derive both from the same JS easing function (per-frame `set` keyframes) instead of mixing a tween with computed positions.

---

## Data-driven bar chart

Generate the whole spec from the data. Bars grow from the baseline: `anchorY: 1` and a `height` keyframe.

```js
// @recipe bar-chart
const data = [['Mon', 12], ['Tue', 30], ['Wed', 22], ['Thu', 41], ['Fri', 35]];
const max = Math.max(...data.map(d => d[1]));
const BASE = 600, CHART_H = 380, BAR_W = 90, GAP = 40;
const x0 = (1280 - (data.length * BAR_W + (data.length - 1) * GAP)) / 2;
const sequences = [];
data.forEach(([label, value], i) => {
  const x = x0 + i * (BAR_W + GAP) + BAR_W / 2;
  const at = 0.4 + i * 0.12;
  sequences.push({
    type: 'shape', shape: 'rect', width: BAR_W, height: 0, cornerRadius: 8, anchorY: 1, at,
    initial: { x, y: BASE, fillColor: value === max ? '#ffd166' : '#4f6df5' },
    keyframes: [{ at: 0, to: { height: CHART_H * value / max }, duration: 0.9, ease: 'power3.out' }],
  });
  sequences.push({
    type: 'text', text: label, at, style: { fontSize: 26, fill: '#aab4d4' },
    initial: { x, y: BASE + 16, anchorX: 0.5, anchorY: 0 },
  });
});
sequences.push({ type: 'shape', shape: 'rect', width: 1000, height: 2, anchorX: 0.5, anchorY: 0.5, initial: { x: 'GW/2', y: BASE, fillColor: '#445' } });
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

There is no orbit helper: sample a circle into short linear keyframes. Because `z` is specified, it no longer follows `fov` — if you also animate `fov` for a dolly zoom, set `z = (H/2)/tan(fov/2)` yourself in the same keyframes. Under a dolly zoom only the `z = 0` plane stays fixed: keep the hero content at `z = 0` and near content at small `z`.

```js
// @recipe camera-orbit
const R = 989, CX = 640, CY = 360, DUR = 6, STEPS = 60, SWEEP = 0.9;       // R ≈ default camera distance at 720p, fov 40
const angle = i => -SWEEP / 2 + SWEEP * i / STEPS;
const keyframes = [];
for (let i = 0; i < STEPS; i++) {
  const a = angle(i + 1);
  keyframes.push({ at: DUR * i / STEPS, to: { x: CX + R * Math.sin(a), z: R * Math.cos(a) }, duration: DUR / STEPS, ease: 'none' });
}
const card = (x, z, color) => ({
  type: 'shape', shape: 'rect', width: 300, height: 200, cornerRadius: 20, threeD: true,
  initial: { x, y: CY, z, fillColor: color },
});
return [
  { type: 'camera', initial: { x: CX + R * Math.sin(angle(0)), y: CY, z: R * Math.cos(angle(0)), lookAtX: CX, lookAtY: CY, lookAtZ: 0 }, keyframes },
  card(300, -300, '#3a6ea5'), card(640, 0, '#d96a3a'), card(980, 300, '#38a169'),
];
```

A call-to-action or any overlay that must stay screen-aligned should be a plain 2D layer (no `threeD`) placed last: it ignores the camera and stays on top.

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
return { sequences, transitions, duration: total };
```

Source images should be at least canvas-sized (`kenBurns` zooms in): draw generated images at 1920×1080 for a 1280×720 movie.

---

## Looping motion (no `repeat`)

Generate the keyframes in a loop.

```js
// @recipe pulse
const keyframes = [];
for (let i = 0; i < 6; i++) {
  keyframes.push({ at: i, to: { scale: 1.15 }, duration: 0.5, ease: 'sine.inOut' },
                 { at: i + 0.5, to: { scale: 1 }, duration: 0.5, ease: 'sine.inOut' });
}
return [{ type: 'shape', shape: 'circle', radius: 40, duration: 6, initial: { x: 'GW/2', y: 'GH/2', fillColor: '#ff3b3b' }, keyframes }];
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

## Gradients and vignettes (no gradient fill exists)

Draw one on a canvas and register it as an image asset (`data:` URLs work), or stack bands / low-alpha circles. Make the image canvas-sized.

```js
// @docs-only
function radialGradientAsset(name, inner, outer, w = 1280, h = 720) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  return { name, src: c.toDataURL() };
}
// movie.init({ assets: [radialGradientAsset('vignette', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)')], composition: { sequences: [
//   ...content, { type: 'image', asset: 'vignette', initial: { x: 0, y: 0 } },   // last = on top
// ] } })
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
