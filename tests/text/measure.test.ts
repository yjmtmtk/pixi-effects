import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { measureText, splitText } from '../../src/text/measure';

const style = { fontSize: 20 };               // the mock: 10 px per character, 24 px per line
beforeEach(() => { vi.restoreAllMocks(); });

describe('measureText', () => {
  it('is the width and height the same style gives a text layer', () => {
    expect(measureText('ABCDE', style)).toMatchObject({ width: 50, height: 24 });
    expect(measureText('AB\nCDEF', style)).toMatchObject({ width: 40, height: 48, lines: 2 });
    expect(measureText('AB', { fontSize: 20, letterSpacing: 4 }).width).toBe(28);
  });
});

describe('splitText', () => {
  it('by chars (the default): one piece per visible character at its own x; spaces take room but are not returned', () => {
    const p = splitText('AB C', style);
    expect(p.map(q => [q.text, q.x, q.width, q.index])).toEqual([['A', 0, 10, 0], ['B', 10, 10, 1], ['C', 30, 10, 2]]);
    expect(p.every(q => q.y === 0 && q.line === 0)).toBe(true);
  });

  it('by words', () => {
    expect(splitText('AB CD', style, { by: 'words' }).map(q => [q.text, q.x, q.width])).toEqual([['AB', 0, 20], ['CD', 30, 20]]);
  });

  it('x / y place the line; align centres or right-aligns each line on x', () => {
    expect(splitText('AB CD', style, { by: 'words', x: 100, y: 40 }).map(q => [q.x, q.y])).toEqual([[100, 40], [130, 40]]);
    expect(splitText('AB CD', style, { by: 'words', x: 100, align: 'center' }).map(q => q.x)).toEqual([75, 105]);   // the line is 50 wide
    expect(splitText('AB CD', style, { by: 'words', x: 100, align: 'right' }).map(q => q.x)).toEqual([50, 80]);
  });

  it('lines go down by the line height, each aligned on its own width', () => {
    const p = splitText('AB\nCDEF', style, { x: 100, y: 10, align: 'center' });
    expect(p.map(q => [q.text, q.x, q.y, q.line])).toEqual([
      ['A', 90, 10, 0], ['B', 100, 10, 0],
      ['C', 80, 34, 1], ['D', 90, 34, 1], ['E', 100, 34, 1], ['F', 110, 34, 1],
    ]);
    expect(splitText('AB\nCDEF', style, { by: 'lines', x: 100, align: 'center' }).map(q => [q.text, q.x, q.y, q.width])).toEqual([['AB', 90, 0, 20], ['CDEF', 80, 24, 40]]);
  });

  it('letterSpacing is part of the advance', () => {
    expect(splitText('ABC', { fontSize: 20, letterSpacing: 4 }).map(q => q.x)).toEqual([0, 14, 28]);
  });

  it('empty text gives no pieces; unknown options and values warn with a suggestion', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(splitText('', style)).toEqual([]);
    splitText('AB', style, { by: 'letters' as never });
    splitText('AB', style, { alignment: 'center' } as never);
    const msgs = warn.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => m.includes('by') && m.includes('"chars"'))).toBe(true);
    expect(msgs.some(m => m.includes('alignment') && m.includes('align'))).toBe(true);
  });
});

describe('splitText(): x and y are pixel numbers', () => {
  it("an expression string is an error that says what to write instead (the pieces are placed by measuring)", () => {
    expect(() => splitText('Hello', { fontSize: 20 }, { x: 'GW/2' as never })).toThrow(/splitText\(\): x must be a number of pixels.*expression/s);
    expect(() => splitText('Hello', { fontSize: 20 }, { y: 'GH/2' as never })).toThrow(/y must be a number of pixels/);
  });
});

describe('splitText vertical: true (tategaki)', () => {
  // the mock: fontSize 20 → a cell of 20 px down, 24 px between columns; a glyph is 10 px wide
  const v = (text: string, opts: Record<string, unknown> = {}) => splitText(text, style, { vertical: true, x: 100, y: 10, ...opts });
  const centre = (p: { cx?: number; cy?: number }) => [p.cx, p.cy];

  it('stacks the characters downward, centred in a column whose RIGHT edge is x, one cell of font size each (x / y of a piece place it with anchor 0, cx / cy with anchor 0.5)', () => {
    const p = v('ABC');
    expect(p.map(centre)).toEqual([[88, 20], [88, 40], [88, 60]]);
    expect(p.map(q => [q.x, q.y])).toEqual([[83, 8], [83, 28], [83, 48]]);
    expect(p.map(q => [q.text, q.index, q.line, q.rotation])).toEqual([['A', 0, 0, 0], ['B', 1, 0, 0], ['C', 2, 0, 0]]);
  });

  it('a new line is a new column to the LEFT of the last one (the line height apart)', () => {
    const p = v('AB\nCD');
    expect(p.map(centre)).toEqual([[88, 20], [88, 40], [64, 20], [64, 40]]);
    expect(p.map(q => q.line)).toEqual([0, 0, 1, 1]);
  });

  it('a space takes a cell and is not returned; letterSpacing adds to the cell', () => {
    expect(v('A B').map(centre)).toEqual([[88, 20], [88, 60]]);
    expect(splitText('AB', { fontSize: 20, letterSpacing: 4 }, { vertical: true, x: 100, y: 10 }).map(centre)).toEqual([[88, 22], [88, 46]]);
  });

  it('align puts y at the top of the column (left, the default), its middle (center) or its bottom (right)', () => {
    expect(v('ABCD', { y: 100 }).map(q => q.cy)).toEqual([110, 130, 150, 170]);
    expect(v('ABCD', { y: 100, align: 'center' }).map(q => q.cy)).toEqual([70, 90, 110, 130]);
    expect(v('ABCD', { y: 100, align: 'right' }).map(q => q.cy)).toEqual([30, 50, 70, 90]);
  });

  it('、 and 。 sit at the upper right of their cell, small kana a little up and right', () => {
    const p = v('A、。っ');
    expect(centre(p[1]!)).toEqual([98, 30]);                                  // (88 + 10, 40 − 10)
    expect(centre(p[2]!)).toEqual([98, 50]);
    expect(centre(p[3]!)).toEqual([90, 78]);                                  // (88 + 2, 80 − 2)
    expect(p.map(q => q.rotation)).toEqual([0, 0, 0, 0]);
  });

  it('the long vowel mark, dashes, waves and brackets are turned a quarter clockwise', () => {
    const p = v('ー「」—〜');
    expect(p.map(q => q.rotation)).toEqual([90, 90, 90, 90, 90]);
    expect(p.map(q => q.cx)).toEqual([88, 88, 88, 88, 88]);                   // they stay in the column
  });

  it('by "words" or "lines" has no vertical form: it is said, and characters are used', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(v('AB CD', { by: 'words' }).map(q => q.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/vertical.*chars/));
  });

  it('horizontal pieces carry no cx / cy / rotation (nothing changes for text written across)', () => {
    expect(splitText('AB', style)[0]).toEqual({ text: 'A', x: 0, y: 0, width: 10, index: 0, line: 0 });
  });
});
