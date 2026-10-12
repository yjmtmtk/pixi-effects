# `spans`: colour and style inside one text layer (0.32)

Status: approved 2026-10-12 with both recommendations: the `spans` key (not a helper), and `visibleChars` across spans included in 0.32. Evidence: the typewriter-terminal opener of two 45-second films (2026-10-12) streamed coloured code and needed one text layer per token, laid out by hand.

## The common case (one line for the AI)

```js
{ type: 'text', name: 'code', style: { fontFamily: 'Menlo', fontSize: 30, fill: '#e8f5e8' },
  spans: [{ text: 'type', fill: '#7fa07f' }, ': ', { text: "'text'", fill: '#ffd166', fontWeight: '700' }, ',\n  at: 0.5'],
  initial: { x: 120, y: 200 } }
```

`spans` replaces `text`. A span is a string (the layer's own `style`) or `{ text, ...overrides }`. Everything else of a text layer is unchanged: `name`, `at`, `duration`, `initial`, `keyframes` (`x`, `y`, `alpha`, `scale`, `rotation` …), `filters`, `mask`, `blendMode`, `threeD`. `\n` inside a span text starts a new line.

## What it becomes (so it stays plain data and nothing new is drawn)

At build time, before the layer is made, the spec is expanded into a **composition layer holding one ordinary text layer per piece** (a piece is the part of a span that sits on one line), the same technique as `splitText()` (each piece's x is the measured width of what is before it; whitespace keeps its room; lines go down by the style's line height). The group carries the author's `name`, `at`, `duration`, `initial`, `keyframes`, `filters`, `mask`, `blendMode`, `threeD`; the pieces are named `<name>.0`, `<name>.1` … so `inspect` and the timeline view show them. The group's size is the measured block, so `w` / `h` in expressions mean what they mean for a text layer, and `anchorX` / `anchorY` in `initial` (0.5 to centre) work as they do on text (they become the group's pivot).

Lines are aligned by `style.align` (`left`, `center`, `right`; the default is `center` like every text layer, so a code block writes `align: 'left'`).

## Rules and warnings (the gate: a build-time sentence for the mistake an AI will make)

- Overrides may change what is drawn without changing the baseline: `fill`, `stroke`, `fontWeight`, `fontStyle`, `fontVariant`, `letterSpacing`, `dropShadow`. `fontSize`, `fontFamily`, `lineHeight`, `wordWrap`, `align` on a span move the baseline or the width of the line, so they are not allowed there: said once ("put it on the layer's style; one size per layer"), ignored.
- `text` together with `spans` warns (`spans` wins). An empty `spans`, a span without a string `text`, an unknown override key (did-you-mean) each warn once.
- Keyframes on `text`, `fill`, `visibleChars`, `value` do not apply to a spans layer (it is a group): said once, with what to write instead (a separate text layer, or `animateText`). **Open choice 2** below.
- Measuring needs the font loaded, as for `splitText` (`await document.fonts.load(...)` first for a web font): the cheatsheet line says so.
- `{name}` variables inside a span's text are resolved before the layout, so a rebuild re-lays the line.

## Checkable without eyes

`inspect` lists the pieces with their bounds and colours; `check` reports a spans layer's cut-off like any layer. A test measures the pieces on a real browser (positions are sums of the measured widths) and reads pixels for the colours.

## Not in this release

Per-span size or font, wrapping a span across the width (`wordWrap`), animating one span (use `animateText` with `styleFor`, or write separate layers), links, emoji presentation.

## Decided (2026-10-12)

1. **Form: the `spans` key** of the text layer, expanded by the library at build time.
2. **Typewriter across spans: included.** A `visibleChars` keyframe on a spans layer counts every character of the spans in order (newlines count, as in a text layer); each piece shows `clamp(total - characters before it, 0, its length)`. Implemented by a `SpansSequence` (a composition) that owns the counter and tells its pieces; whitespace-only pieces draw nothing but keep their room and their count.
