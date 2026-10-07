---
title: Cookbook
section: Cookbook
order: 1
summary: Complete, tested recipes with live demos. Copy one, change the numbers.
---

Every recipe below is the **body of the `sequences` list** (or an object with `sequences`, `transitions` and `duration`), is run by the project's tests, and has a live piece that uses the same ideas. Put the result in `composition` of `movie.init`. They assume a 1280×720 movie.

## A title card

A title that rises in, a line that draws itself under it, and a sound.

```js
// @recipe title-card
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101424' } },
  { type: 'text', text: 'Spring Collection', style: { fontSize: 110, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: 'GW/2', y: 330, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0.3, from: { alpha: 0, y: 380 }, to: { alpha: 1, y: 330 }, duration: 0.9, ease: 'power3.out' }] },
  { type: 'shape', shape: 'line', from: [420, 420], to: [860, 420], trimEnd: 0, strokeCap: 'round', at: 1,
    initial: { strokeColor: '#ffd166', strokeWidth: 8 }, keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 1, ease: 'power2.inOut' }] },
  { type: 'audio', sfx: 'swoosh', at: 0.3 },
];
```

{{demo examples/gallery/aurora-logo.html}}

## A lower third

A name bar that slides in from the left, with the name and a role, and slides out at the end.

```js
// @recipe lower-third
const T = 4;
return [
  { type: 'shape', shape: 'rect', name: 'bar', width: 520, height: 110, cornerRadius: 10, anchorX: 0, anchorY: 0.5, duration: T,
    initial: { x: 80, y: 600, fillColor: '#3b5bdb' },
    keyframes: [{ at: 0, from: { x: -560 }, to: { x: 80 }, duration: 0.6, ease: 'power3.out' }, { at: -0.6, to: { x: -560 }, duration: 0.6, ease: 'power3.in' }] },
  { type: 'text', text: 'Mika Sato', duration: T, style: { fontSize: 42, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: 112, y: 580, anchorX: 0, anchorY: 0.5 },
    keyframes: [{ at: 0.3, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.4 }, { at: -0.6, to: { alpha: 0 }, duration: 0.3 }] },
  { type: 'text', text: 'Head of Design', duration: T, style: { fontSize: 24, fill: '#dbe4ff' },
    initial: { x: 112, y: 622, anchorX: 0, anchorY: 0.5 },
    keyframes: [{ at: 0.4, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.4 }, { at: -0.6, to: { alpha: 0 }, duration: 0.3 }] },
];
```

{{demo examples/gallery/news-package.html}}

## Numbers that count up

```js
// @recipe count-up
const stats = [['Users', 24800], ['Countries', 62], ['Uptime %', 99.9]];
return stats.flatMap(([label, value], i) => [
  { type: 'text', text: '{value}', format: { grouping: true, decimals: value % 1 ? 1 : 0 }, at: 0.2 + i * 0.3,
    style: { fontSize: 110, fontWeight: 'bold', fill: '#ffffff' },
    initial: { x: 240 + i * 400, y: 330, anchorX: 0.5, anchorY: 0.5, value: 0 },
    keyframes: [{ at: 0, to: { value }, duration: 2, ease: 'power2.out' }] },
  { type: 'text', text: label, at: 0.2 + i * 0.3, style: { fontSize: 28, fill: '#9fb3d9' },
    initial: { x: 240 + i * 400, y: 410, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.6 }] },
]);
```

{{demo examples/gallery/data-story.html}}

## A bar chart from data

```js
// @recipe bar-chart
const data = [['Mon', 42], ['Tue', 68], ['Wed', 55], ['Thu', 90], ['Fri', 74]];
const MAX = Math.max(...data.map(d => d[1]));
return data.flatMap(([day, v], i) => {
  const x = 240 + i * 200, h = (v / MAX) * 360;
  return [
    { type: 'shape', shape: 'rect', width: 120, height: h, anchorX: 0.5, anchorY: 1, at: 0.2 + i * 0.15,
      initial: { x, y: 560, fillColor: '#4cc9f0', scaleY: 0 },
      keyframes: [{ at: 0, to: { scaleY: 1 }, duration: 0.8, ease: 'back.out(1.4)' }] },
    { type: 'text', text: day, style: { fontSize: 26, fill: '#9fb3d9' }, initial: { x, y: 595, anchorX: 0.5, anchorY: 0.5 } },
  ];
});
```

## A slideshow with transitions and music

Scene `i` starts at `i × (L − T)` and overlaps the next by the transition length `T`; the total is `n × (L − T) + T`.

```js
// @recipe slideshow
const photos = ['p1', 'p2', 'p3'], L = 4, T = 1, STEP = L - T;
const kinds = ['crossfade', 'wipe', 'zoom'];
const total = photos.length * STEP + T;
const sequences = photos.map((asset, i) => kenBurns({ asset, name: 'scene' + i, at: i * STEP, duration: L, motion: i % 2 ? 'position' : 'scale' }));
const transitions = photos.slice(1).map((_, i) => ({
  kind: kinds[i % kinds.length], from: 'scene' + i, to: 'scene' + (i + 1), at: (i + 1) * STEP, duration: T,
  ...(kinds[i % kinds.length] === 'wipe' ? { direction: 'left' } : {}),
}));
photos.forEach((_, i) => sequences.push(withFade({
  type: 'text', text: 'Scene ' + (i + 1), at: i * STEP + 0.5, duration: L - 1.5,
  style: { fontSize: 44, fill: '#ffffff', dropShadow: { color: '#000000', blur: 6, distance: 2, alpha: 0.7 } },
  initial: { x: 'GW/2', y: 600, anchorX: 0.5, anchorY: 0.5 },
}, { in: 0.4, out: 0.4 })));
transitions.forEach(tr => sequences.push({ type: 'audio', sfx: 'swoosh', at: tr.at + tr.duration / 2 - 0.16 }));
return { sequences, transitions, duration: total };
```

{{demo examples/gallery/travel-slideshow.html}}

## Terminal lines that type themselves

```js
// @recipe typewriter
const lines = ['$ npm install pixi-effects', 'added 4 packages in 3s', '$ npx pixi-effects-render movie.html', 'rendered movie.mp4 (12 s)'];
const CPS = 22;
let at = 0.5;
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#0b0f14' } },
  ...lines.map((text, i) => {
    const start = at;
    at += text.length / CPS + 0.4;
    return { type: 'text', text, at: start, style: { fontSize: 34, fontFamily: 'ui-monospace, Menlo, monospace', fill: text.startsWith('$') ? '#7bd88f' : '#cdd6e0' },
      initial: { x: 90, y: 150 + i * 70, anchorX: 0, anchorY: 0.5, visibleChars: 0 },
      keyframes: [{ at: 0, to: { visibleChars: text.length }, duration: text.length / CPS, ease: 'none' }] };
  }),
];
```

{{demo examples/gallery/typewriter-terminal.html}}

## Confetti, the same every time

`particles()` makes one layer per piece with a seeded start, speed, size, colour, spin and life, so the confetti is the same on every run and in every export. Give it a seed and it stays that way; another seed is another take.

```js
// @recipe confetti
return particles({ count: 90, at: 0.2, emit: 1.2, life: [3, 4.5], area: { x: 640, y: -20, width: 1280 }, angle: [80, 100], speed: [150, 350],
  gravity: 120, size: [5, 9], shape: 'rect', spin: [-300, 300], fade: { out: 0.6 }, name: 'confetti', seed: 7,
  colors: ['#ff5c8a', '#ffd166', '#4cc9f0', '#7bd88f', '#c77dff'] });
```

{{demo examples/gallery/birthday-card.html}}

## Words that arrive one at a time

```js
// @recipe word-reveal
const style = { fontSize: 96, fontWeight: 'bold', fill: '#ffffff' };
return splitText('Make it move', style, { by: 'words', x: 640, y: 330, align: 'center' }).map(p => ({
  type: 'text', text: p.text, style, at: 0.25 * p.index,
  initial: { x: p.x, y: p.y },
  keyframes: [{ at: 0, from: { alpha: 0, y: p.y + 50, scale: 0.8 }, to: { alpha: 1, y: p.y, scale: 1 }, duration: 0.5, ease: 'back.out(1.8)' }],
}));
```

## More

The [gallery](../examples/gallery/) has thirty-seven complete pieces, each one a single HTML file you can open and read. More guides for what you are making: [Presenting](presenting.html) (a talk as one movie; `quiet-hours` in the gallery is a five-page one, press Present), [Audio](audio.html#visuals-that-follow-the-music) (the picture following the music, with `audioEnvelope()` and `react()`) and [Motion](motion.html). The [DSL reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/dsl.md) lists every property.
