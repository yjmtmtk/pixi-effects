import { CanvasTextMetrics, TextStyle } from 'pixi.js';
import { suggestName, warnUnknownOptions } from '../core/options';

/** A text style as written in a `text` layer's `style` (numbers, not expressions, for the fields that size the text). */
export type MeasureStyle = Record<string, unknown>;

export interface TextSize {
  width: number;
  height: number;
  /** Number of lines. */
  lines: number;
}

export interface SplitOptions {
  /** What a piece is: one visible character (default), one word, or one line. */
  by?: 'chars' | 'words' | 'lines';
  /** Where the text goes: `x` is its left edge, or its centre / right edge with `align`. Default 0. */
  x?: number;
  /** Top of the first line. Default 0. */
  y?: number;
  /** How each line sits on `x`. Default `'left'`. */
  align?: 'left' | 'center' | 'right';
}

export interface TextPiece {
  text: string;
  /** Left edge of the piece, for a text layer with `anchorX: 0` (the default for text). */
  x: number;
  /** Top of the piece's line, for a text layer with `anchorY: 0`. */
  y: number;
  width: number;
  /** Position in the returned list, 0-based. */
  index: number;
  /** Which line (0-based) the piece is on. */
  line: number;
}

const BY = ['chars', 'words', 'lines'] as const;
const ALIGN = ['left', 'center', 'right'] as const;

const widthOf = (text: string, style: TextStyle): number => CanvasTextMetrics.measureText(text, style).width;

/**
 * How big `text` is drawn with `style`: the same numbers a text layer with that style has, measured with the font the
 * renderer will use. A web font must be loaded first (`await document.fonts.load('24px "Name"')`), or the width is a
 * fallback font's.
 */
export function measureText(text: string, style: MeasureStyle = {}): TextSize {
  const m = CanvasTextMetrics.measureText(text, new TextStyle(style as never));
  return { width: m.width, height: m.height, lines: text.split('\n').length };
}

/**
 * Cut `text` into characters, words or lines and give each piece the x / y it needs so that one text layer per piece
 * (same `style`, `anchorX: 0`, `anchorY: 0`) reads exactly like the whole text: per-letter and per-word animation without
 * measuring anything by hand. Kerning is kept (a piece's x is the measured width of everything before it). Whitespace is
 * not returned as a piece, but it takes its room. Lines are split on `\n` and go down by the style's line height.
 *
 * ```js
 * splitText('Hello world', style, { by: 'words', x: 640, y: 300, align: 'center' })
 *   .map(p => ({ type: 'text', text: p.text, style, initial: { x: p.x, y: p.y, alpha: 0 }, at: 0.2 * p.index, ... }))
 * ```
 */
export function splitText(text: string, style: MeasureStyle = {}, opts: SplitOptions = {}): TextPiece[] {
  warnUnknownOptions('splitText()', opts as Record<string, unknown>, ['by', 'x', 'y', 'align']);
  let by = opts.by ?? 'chars';
  if (!(BY as readonly string[]).includes(by)) {
    const g = suggestName(String(by), BY);
    console.warn(`pixi-effects: splitText(): by "${by}" is not one of ${BY.map(b => `"${b}"`).join(', ')}${g ? ` — did you mean "${g}"?` : ''}; using "chars"`);
    by = 'chars';
  }
  let align = opts.align ?? 'left';
  if (!(ALIGN as readonly string[]).includes(align)) {
    const g = suggestName(String(align), ALIGN);
    console.warn(`pixi-effects: splitText(): align "${align}" is not one of ${ALIGN.join(', ')}${g ? ` — did you mean "${g}"?` : ''}; using "left"`);
    align = 'left';
  }
  const x0 = opts.x ?? 0, y0 = opts.y ?? 0;
  if (text === '') return [];

  const ts = new TextStyle(style as never);
  const lineHeight = CanvasTextMetrics.measureText('M', ts).lineHeight ?? CanvasTextMetrics.measureText('M', ts).height;
  const sentinel = widthOf('|', ts);                       // measuring "prefix|" − "|" keeps trailing spaces in the prefix
  const out: TextPiece[] = [];

  text.split('\n').forEach((line, lineNo) => {
    const lineWidth = widthOf(line, ts);
    const left = align === 'center' ? x0 - lineWidth / 2 : align === 'right' ? x0 - lineWidth : x0;
    const y = y0 + lineNo * lineHeight;
    const advance = (upTo: number): number => (upTo === 0 ? 0 : widthOf(line.slice(0, upTo) + '|', ts) - sentinel);

    // [start, end) of every piece on this line
    const spans: Array<[number, number]> = [];
    if (by === 'lines') {
      if (line.trim() !== '') spans.push([0, line.length]);
    } else if (by === 'words') {
      for (const m of line.matchAll(/\S+/g)) spans.push([m.index!, m.index! + m[0].length]);
    } else {
      for (let i = 0; i < line.length; i++) if (!/\s/.test(line[i]!)) spans.push([i, i + 1]);
    }
    for (const [a, b] of spans) {
      const piece = line.slice(a, b);
      out.push({ text: piece, x: left + advance(a), y, width: widthOf(piece, ts), index: out.length, line: lineNo });
    }
  });
  return out;
}
