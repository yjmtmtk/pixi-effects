import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { layoutSpans, expandSpans, spansMeta } from '../../src/text/spans';

const style = { fontSize: 20 };               // the mock: 10 px per character, 24 px per line
let said: string[] = [];
const warn = (m: string): void => { said.push(m); };
beforeEach(() => { said = []; });

describe('layoutSpans: where each piece of a line of spans goes', () => {
  it('pieces follow each other on a line by their measured widths (a leading space keeps its room)', () => {
    const L = layoutSpans(['AB', { text: 'CD', fill: '#ff0000' }, ' EF'], style, 'left', 'text', warn);
    expect(L.pieces.map(p => [p.text, p.x, p.y, p.width, p.line, p.start, p.length])).toEqual([
      ['AB', 0, 0, 20, 0, 0, 2], ['CD', 20, 0, 20, 0, 2, 2], [' EF', 40, 0, 30, 0, 4, 3],
    ]);
    expect(L.pieces[1]!.style).toEqual({ fill: '#ff0000' });                     // only what the span overrides
    expect(L.width).toBe(70);
    expect(L.height).toBe(24);
  });

  it('a newline inside a span starts the next line (and counts as a character, as in a text layer)', () => {
    const L = layoutSpans(['A\nBC', { text: 'D', fill: '#00f' }], style, 'left', 'text', warn);
    expect(L.pieces.map(p => [p.text, p.x, p.y, p.line, p.start])).toEqual([['A', 0, 0, 0, 0], ['BC', 0, 24, 1, 2], ['D', 20, 24, 1, 4]]);
    expect(L.chars).toBe(5);
    expect(L.height).toBe(48);
  });

  it('align moves each line on the width of the block: centre or right', () => {
    const lines = ['AB\nCDEF'];
    expect(layoutSpans(lines, style, 'center', 'text', warn).pieces.map(p => p.x)).toEqual([10, 0]);
    expect(layoutSpans(lines, style, 'right', 'text', warn).pieces.map(p => p.x)).toEqual([20, 0]);
  });

  it('a piece of only spaces is marked blank (it takes room and counts, but nothing is drawn for it)', () => {
    const L = layoutSpans(['A', '  ', 'B'], style, 'left', 'text', warn);
    expect(L.pieces.map(p => [p.text, p.x, p.blank])).toEqual([['A', 0, false], ['  ', 10, true], ['B', 30, false]]);
  });

  it('only what keeps the baseline may be overridden by a span; size, font and line height are said once and ignored', () => {
    const L = layoutSpans([{ text: 'A', fill: '#f00', fontWeight: '700', fontSize: 50 } as never, { text: 'B', fontSize: 60, fontFamily: 'Arial' } as never], style, 'left', 'text', warn);
    expect(L.pieces[0]!.style).toEqual({ fill: '#f00', fontWeight: '700' });
    expect(L.pieces[1]!.style).toEqual({});
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/fontSize, fontFamily/);
    expect(said[0]).toMatch(/style of the layer/);
  });

  it('a mistyped override key says what was meant', () => {
    layoutSpans([{ text: 'A', fil: '#f00' } as never], style, 'left', 'text', warn);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/"fil".*did you mean "fill"\?/);
  });

  it('a span that is not a string or { text } is skipped with a sentence; no spans at all lays out nothing', () => {
    const L = layoutSpans(['A', 5 as never, { fill: '#f00' } as never, 'B'], style, 'left', 'text', warn);
    expect(L.pieces.map(p => p.text)).toEqual(['A', 'B']);
    expect(said.length).toBe(2);
    said = [];
    expect(layoutSpans([], style, 'left', 'text', warn).pieces).toEqual([]);
    expect(said[0]).toMatch(/spans is empty/);
  });
});

describe('expandSpans: the text layer becomes one group of ordinary text layers', () => {
  const spec = {
    type: 'text', name: 'code', spans: ['AB', { text: 'CD', fill: '#ff0000' }], style: { fontSize: 20, fill: '#ffffff', align: 'left' },
    at: 1, duration: 3, initial: { x: 100, y: 50, alpha: 0.5 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1 }], blendMode: 'add',
  } as never;

  it('the group keeps the layer\'s name, time, properties, keyframes and picture keys; it is as big as the measured block', () => {
    const g = expandSpans(spec, warn);
    expect(g).toMatchObject({ type: 'composition', name: 'code', at: 1, duration: 3, width: 40, height: 24, blendMode: 'add', initial: { x: 100, y: 50, alpha: 0.5 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1 }] });
    expect(g).not.toHaveProperty('spans');
    expect(g).not.toHaveProperty('style');
  });

  it('every piece is a text layer with the layer\'s style plus its own overrides, at its measured place, named name.N', () => {
    const g = expandSpans(spec, warn) as { sequences: Array<Record<string, unknown>> };
    expect(g.sequences.map(s => [s.type, s.name, s.text])).toEqual([['text', 'code.0', 'AB'], ['text', 'code.1', 'CD']]);
    expect(g.sequences[1]).toMatchObject({ style: { fontSize: 20, fill: '#ff0000', align: 'left' }, initial: { x: 20, y: 0 } });
  });

  it('anchorX / anchorY of the layer become the group\'s pivot (0.5 centres the block on x, y, as it does a text)', () => {
    const g = expandSpans({ type: 'text', spans: ['ABCD'], style, initial: { x: 200, y: 100, anchorX: 0.5, anchorY: 0.5 } } as never, warn) as { initial: Record<string, number> };
    expect(g.initial).toMatchObject({ x: 200, y: 100, pivotX: 20, pivotY: 12 });
    expect(g.initial).not.toHaveProperty('anchorX');
  });

  it('text, fill, value and the like do not apply to a group: said once, with what to write, and taken out of the keyframes', () => {
    const g = expandSpans({ type: 'text', spans: ['A'], text: 'B', style, keyframes: [{ at: 0, to: { fill: '#f00', alpha: 1 }, duration: 1 }] } as never, warn) as { keyframes: Array<{ to: Record<string, unknown> }> };
    expect(g.keyframes[0]!.to).toEqual({ alpha: 1 });
    expect(said.some(m => /"text" is ignored.*spans/.test(m))).toBe(true);
    expect(said.some(m => /fill.*do not apply.*separate/.test(m))).toBe(true);
  });

  it('a typewriter (visibleChars) is remembered for the group, and its pieces start fully visible and typed; blank pieces draw nothing', () => {
    const typed = { type: 'text', name: 't', spans: ['A', '  ', 'BC'], style, initial: { visibleChars: 0 } } as never;
    const g = expandSpans(typed, warn) as { sequences: Array<{ initial: Record<string, number> }> };
    expect(g.sequences).toHaveLength(2);                                       // the blank piece is not a layer
    expect(g.sequences.map(s => s.initial.visibleChars)).toEqual([1, 2]);
    const meta = spansMeta.get(g as object)!;
    expect(meta.typed).toBe(true);
    expect(meta.pieces).toEqual([{ start: 0, length: 1 }, { start: 3, length: 2 }]);
  });

  it('without a typewriter the pieces are plain text layers (no counters)', () => {
    const g = expandSpans(spec, warn) as { sequences: Array<{ initial: Record<string, number> }> };
    expect(spansMeta.get(g as object)!.typed).toBe(false);
    expect(g.sequences[0]!.initial).not.toHaveProperty('visibleChars');
  });
});
