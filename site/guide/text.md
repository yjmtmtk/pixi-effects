---
title: Text
section: Guides
order: 1
summary: Styled text, counters, a typewriter, changing words, and per-letter animation in one call.
---

A text layer is `type: 'text'` with a `text` and a `style`. `style` takes the PixiJS text style fields you would expect: `fontSize`, `fontFamily`, `fontWeight`, `fill`, `letterSpacing`, `lineHeight`, `align`, `wordWrap` with `wordWrapWidth`, `stroke`, `dropShadow`.

```js
{ type: 'text', text: 'Launch day', style: { fontSize: 96, fontWeight: '800', fill: '#ffffff', fontFamily: 'system-ui, sans-serif' },
  initial: { x: 'GW / 2', y: 'GH / 2', anchorX: 0.5, anchorY: 0.5 } }
```

- The default anchor is the **top-left**; set `anchorX` / `anchorY` to `0.5` to place the *centre* at `x, y`.
- Colour is `style.fill` (and the `fill` keyframe animates it); the text's size is available to expressions as `w` and `h` after the style is applied.
- Use **system fonts** (`system-ui`, `Georgia`, `ui-monospace`…) unless you load a web font first: `await document.fonts.load('48px "My Font"')` before `movie.init`.
- A `dropShadow` glow is clipped unless you give the text `padding` of at least twice its `blur`.

{{demo examples/gallery/kinetic-manifesto.html}}

## Counters

A text layer has one number you can animate, `value`, printed wherever the text contains `{value}`:

```js
{ type: 'text', text: '{value} users', format: { decimals: 0, grouping: true },
  style: { fontSize: 72, fill: '#fff' }, initial: { x: 100, y: 100, value: 0 },
  keyframes: [{ at: 0.5, to: { value: 2480 }, duration: 2, ease: 'power2.out' }] }       // 0 users … 2,480 users
```

`format` takes `decimals`, `grouping` (thousands separators) and `pad` (zero-pad: `pad: 2` shows `05`, so a clock is `text: '18:42:{value}'`).

{{demo examples/gallery/countdown-newyear.html}}

## Typewriter and changing words

`visibleChars` shows only the first N characters; animate it from 0 to the length with an `'none'` ease and you have a typewriter. A keyframe `set: { text: '…' }` swaps the whole string at a moment, and swaps it back when you scrub backwards:

```js
{ type: 'text', text: 'No masks, no per-letter layers.', style: { fontSize: 40, fontFamily: 'ui-monospace, monospace', fill: '#fff' },
  initial: { x: 120, y: 520, anchorX: 0, anchorY: 0.5, visibleChars: 0 },       // left-anchored: it grows to the right
  keyframes: [{ at: 0, to: { visibleChars: 30 }, duration: 2.4, ease: 'none' }] }

{ type: 'text', text: '3', style: { fontSize: 150, fill: '#ffd166' }, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
  keyframes: [{ at: 1, set: { text: '2' } }, { at: 2, set: { text: '1' } }, { at: 3, set: { text: 'Go!' } }] }
```

Anchor a typewriter on its **left** edge, or each new letter re-centres the line. `visibleChars` counts characters as you see them (an emoji is one). `to` and `from` cannot animate a string: use `set`.

{{demo examples/14-draw-on.html}}

## Gradient letters

A text layer takes a `fillGradient` for its letters, and a keyframe can move it (the same partial gradient as on a shape):

```js
{ type: 'text', text: 'GRADIENT', style: { fontSize: 200, fontWeight: '900' }, anchorX: 0.5, anchorY: 0.5, initial: { x: 640, y: 360 },
  colorSpace: 'oklch', fillGradient: { angle: 0, stops: [[0, '#ff2d55'], [1, '#0ea5e9']] },
  keyframes: [{ at: 0, duration: 2, to: { fillGradient: { angle: 180, stops: [[0, '#ffd60a'], [1, '#22c55e']] } } }] }
```

The letters are drawn again on every change (about 0.4 ms for a line at 1080p), so a long page of animated gradient text costs more than one headline.

## Per-letter and per-word animation

`animateText()` does it in one call (`x` and `y` are pixel numbers, not expressions, and `y` is the top of the line): one text layer per character, word or line, laid out exactly like the whole text, arriving (and leaving) in a wave. Letters turn and scale about their own centre. The result is plain layers: spread it into `sequences`. `duration` is how long until every piece is gone, and `out` leaves **from that end** (it has no `at` of its own): to be gone at 8 s, with `at: 0.4`, write `duration: 7.6`.

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

| Option | Notes |
| ------ | ----- |
| `duration` | **required**: seconds from `at` until every piece is gone, the last one included (an error says how long the wave needs) |
| `in` | how a piece arrives: `'rise'` (default), `'drop'`, `'fade'`, `'pop'`, `'zoom'`, `'slide'`, `'spin'`, your own `{ from, to, duration, ease }` (`x` / `y` in `from` are offsets from the resting place), a preset with changes `{ preset: 'rise', duration: 0.9 }`, or `false` |
| `out` | how it leaves, in the same wave: the same choices; a preset runs backwards. Default none |
| `stagger` | the wave: `{ each, amount, from, grid, ease, seed }`, see [Motion](motion.html#waves-stagger). Default `{ each: 0.04 }` |
| `idle` | a seeded drift between the entrance and the exit, each piece its own: `{ y: 4, rotation: 1, freq: 1 }` |
| `styleFor` | `piece => ({ fill: … })`: a different style for some pieces |
| `by`, `x`, `y`, `align`, `name`, `at` | as for `splitText`; layers are named `<name>-0`, `<name>-1`, … |

If you want full control, cut the text yourself with `splitText` (it measures with the renderer's own fonts, so the pieces line up exactly like the whole text) and make one text layer per piece:

```js
// @recipe split-letters
const style = { fontSize: 110, fontWeight: 'bold', fill: '#ffffff' };
const pieces = splitText('Kinetic', style, { by: 'chars', x: 640, y: 300, align: 'center' });
return pieces.map(p => ({
  type: 'text', text: p.text, style, at: 0.15 * p.index,
  initial: { x: p.x, y: p.y, alpha: 0 },
  keyframes: [{ at: 0, from: { alpha: 0, y: p.y + 60 }, to: { alpha: 1, y: p.y }, duration: 0.5, ease: 'back.out(2)' }],
}));
```

`splitText(text, style, { by: 'chars' | 'words' | 'lines', x, y, align })` returns `{ text, x, y, width, index, line }` for each piece; use `measureText(text, style)` to size a background pill from the real width. Load a web font first if you use one.

## Things that go wrong

- **Text is cut off or off-screen.** Run the [review tools](review.html): `movie.inspect()` reports text that leaves the canvas, is cut by an edge, or overlaps other text. Centred text needs `anchorX: 0.5`.
- **A glow is clipped.** Add `padding` to the style (at least twice the blur).
- **The font is not the one you asked for.** A web font must be loaded before `init`; otherwise the browser's fallback font is measured and drawn.
