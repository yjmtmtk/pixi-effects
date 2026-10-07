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

