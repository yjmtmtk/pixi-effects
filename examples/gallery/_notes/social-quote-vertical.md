# social-quote-vertical — stumble notes
Model: sonnet   Cycles: 4   Result: works

## Went smoothly because the docs said so
- Masks live in the parent's coordinates and do not follow the layer: a static band-shaped rect mask per line + the text rising from y+96 to y gave a clean "line rises from behind a slit" reveal on the first try.
- `fillGradient` radial with alpha stops: soft drifting blobs and a vignette with zero filters; `repeat: 1, yoyo: true` gave slow looping drift with no per-frame code.
- Keyframe `at` local to the layer, `anchorX/Y`, text `style` (letterSpacing, fontStyle italic) all behaved as documented; `window.__logs` stayed `[]` throughout.
- contactSheet `times` + `columns` + `cellWidth` and `snapshot ... as: 'dataURL'` piped to save-image.py worked first time. Export: 720x1280 10 s mp4 = 873 KB in 6.6 s.

## Stumbles
### 1. inspect flags the big quote-mark vs the first line as overlapping   [LIBRARY-BUG / SPEC-ODD]
- tried: a 340 px Georgia opening quote mark (anchor 0.5) above a 96 px first line; the glyph itself is ~150 px above the line.
- happened: `text layers "quote-mark" and "line-1" overlap by 31% of the smaller one` at every frame after the line appears.
- cause: inspect uses the text's layout box (font ascent + descent, height 383 px for a 340 px font), but a quote glyph only fills the top ~35 % of that box, so the box overlaps the line below while the ink does not. Setting `style.lineHeight: 170` did not change the reported bounds.
- would have prevented it: measure ink bounds (or let `lineHeight` shrink the box), or a per-layer opt-out such as `inspect: false`; at least a docs line "a huge glyph's box is much taller than its ink; this overlap warning can be a false positive".
- left as is (visually verified clean).

### 2. Underline touching the descender of the last line   [MY-MISTAKE]
- tried: underline at lineY(last) + 72 using the "0.46 x size" nudge from pitfalls #12.
- happened: the "g" of "design" touched the rule.
- cause: descenders go below the line box centre by more than I estimated for an italic serif at 96 px.
- would have prevented it: pitfalls #12 could add "a descender reaches ~0.55 x size below the anchor-0.5 centre; put rules at centre + 0.9 x size".

### 3. Pager "pill" replaced dot 1 and the end state looked wrong   [MY-MISTAKE]
- Animating the pill over to dot 2 left slot 1 empty; added a dot-1 layer that fades in as the pill leaves. Not a library issue; shown here because "one shape morphs between slots" needs a second layer for the slot it leaves.

## Wished the library had
- Per-letter / per-line text splitting (line-by-line reveal is five hand-made text layers with five masks).
- A `mask` shorthand ("clip to my own band", `reveal: 'up'`) because a mask that does not follow the layer needs the band's coordinates spelled out for every line.
- Ink-based text bounds in `inspect`.
- Expression variable for time so the blob drift could be an ordinary sine instead of yoyo tweens.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// Lines rise from behind a slit: one text + one static band mask per line
LINES.forEach(([text, fill], i) => {
  const y = FIRST_Y + i * LINE_H, at = 1.25 + i * 0.42;
  sequences.push({
    type: 'text', name: 'line-' + (i + 1), text, at,
    style: { fontSize: 96, fill, fontFamily: 'Georgia, serif', letterSpacing: -1.5 },
    initial: { x: 76, y: y + 96, anchorX: 0, anchorY: 0.5 },
    mask: { type: 'shape', shape: 'rect', width: W, height: LINE_H + 8, initial: { x: W / 2, y, fillColor: '#ffffff' } },
    keyframes: [{ at: 0, to: { y }, duration: 0.95, ease: 'expo.out' }],
  });
});
// soft drifting blob: radial gradient circle, yoyo drift
const blob = (color, x, y, r, dx, dy) => ({ type: 'shape', shape: 'circle', radius: r, initial: { x, y },
  fillGradient: { type: 'radial', radius: 0.5, stops: [[0, color], [1, color.replace(/[\d.]+\)$/, '0)')]] },
  keyframes: [{ at: 0, to: { x: x + dx, y: y + dy }, duration: 5, ease: 'sine.inOut', repeat: 1, yoyo: true }] });
```
