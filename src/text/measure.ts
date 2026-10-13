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
  /**
   * Vertical writing (tategaki): characters go down a column, a new line is a new column to the left. `x` is then the RIGHT edge of the first column and `y` the top
   * of a column (`align`: `'left'` keeps y at the top, `'center'` at the middle, `'right'` at the bottom). Only `by: 'chars'` has a vertical form. Each piece also gets
   * `cx` / `cy` (the centre of its cell, punctuation already moved to the upper right) and `rotation` (degrees: the long vowel mark, dashes, waves and brackets are turned
   * a quarter clockwise); place a text layer with `anchorX: 0.5, anchorY: 0.5` at `cx` / `cy` and `rotation: p.rotation`. `animateText(..., { vertical: true })` does all of it.
   */
  vertical?: boolean;
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
  /** Vertical text only: where the centre of the piece goes (a text layer with `anchorX: 0.5, anchorY: 0.5`). */
  cx?: number;
  cy?: number;
  /** Vertical text only: the turn in degrees the piece needs (0 or 90). */
  rotation?: number;
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
  warnUnknownOptions('splitText()', opts as Record<string, unknown>, ['by', 'x', 'y', 'align', 'vertical']);
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
  for (const [n, v] of [['x', x0], ['y', y0]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`splitText(): ${n} must be a number of pixels (e.g. ${n}: 640), got ${JSON.stringify(v)}: the pieces are placed by measuring, so an expression such as 'GW/2' cannot be used here. \`y\` is the top of the line.`);
  }
  if (text === '') return [];

  const ts = new TextStyle(style as never);
  if (opts.vertical) return splitVertical(text, style, ts, x0, y0, align, by);
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

/** 、 。 and their kin sit at the upper right of a vertical cell (in a horizontal text they are at the lower left). */
const PUNCT = new Set('、。，．､｡');
/** Small kana drift a little up and right in vertical text. */
const SMALL = new Set('ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ');
/** Turned a quarter clockwise in vertical text: the long vowel mark, dashes, waves, leaders and brackets. */
const TURNED = new Set('ー―—－～〜…‥（）()［］[]｛｝{}「」『』〈〉《》【】〔〕<>≪≫');

function splitVertical(text: string, style: MeasureStyle, ts: TextStyle, right: number, top: number, align: 'left' | 'center' | 'right', by: string): TextPiece[] {
  if (by !== 'chars') console.warn(`pixi-effects: splitText(): vertical text has only a "chars" form (by "${by}" has no vertical layout); using "chars"`);
  const em = typeof style.fontSize === 'number' ? style.fontSize : Number((ts as unknown as { fontSize?: unknown }).fontSize) || 26;
  const spacing = typeof style.letterSpacing === 'number' ? style.letterSpacing : 0;
  const cell = em + spacing;
  const lineHeight = CanvasTextMetrics.measureText('M', ts).lineHeight ?? CanvasTextMetrics.measureText('M', ts).height;
  const out: TextPiece[] = [];
  text.split('\n').forEach((line, lineNo) => {
    const chars = Array.from(line);
    const start = align === 'center' ? top - (chars.length * cell) / 2 : align === 'right' ? top - chars.length * cell : top;
    const column = right - lineHeight / 2 - lineNo * lineHeight;
    chars.forEach((ch, i) => {
      if (/\s/.test(ch)) return;                                                // a space takes its cell and is not a piece
      let cx = column, cy = start + i * cell + cell / 2;
      if (PUNCT.has(ch)) { cx += 0.5 * em; cy -= 0.5 * em; }
      else if (SMALL.has(ch)) { cx += 0.1 * em; cy -= 0.1 * em; }
      const width = widthOf(ch, ts);
      out.push({ text: ch, x: cx - width / 2, y: cy - lineHeight / 2, width, index: out.length, line: lineNo, cx, cy, rotation: TURNED.has(ch) ? 90 : 0 });
    });
  });
  return out;
}
