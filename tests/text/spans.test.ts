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

describe('layoutSpans: a stroke belongs to the layer', () => {
  it('a span with its own stroke is said once and the stroke is ignored (a stroke shifts a piece by half its width, so the pieces would not line up)', () => {
    const L = layoutSpans(['A', { text: 'B', stroke: { color: '#000', width: 8 } } as never], style, 'left', 'text', warn);
    expect(L.pieces[1]!.style).toEqual({});
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/stroke/);
    expect(said[0]).toMatch(/style of the layer/);
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
    expect(g.sequences[1]).toMatchObject({ style: { fontFamily: 'Arial', fontSize: 20, fill: '#ff0000', align: 'left' }, initial: { x: 20, y: 0 } });
  });

  it('the pieces are measured with the style a text layer is DRAWN with: its defaults (Arial 36, white, centred) fill in what the layer does not say', () => {
    const g = expandSpans({ type: 'text', spans: ['AB', 'CD'], style: {} } as never, warn) as { sequences: Array<{ style: Record<string, unknown>; initial: { x: number } }>; width: number };
    expect(g.sequences[0]!.style).toMatchObject({ fontFamily: 'Arial', fontSize: 36, fill: '#ffffff', align: 'center' });
    expect(g.sequences[1]!.initial.x).toBe(36);                       // the mock: 18 px per character at 36, so AB is 36 wide (it was measured at 26 and the pieces overlapped)
    expect(g.width).toBe(72);
  });

  it('numbers written as expressions or variables are resolved BEFORE measuring, and the pieces get the numbers (not the expression, which would resolve against the small group)', () => {
    const g = expandSpans({ type: 'text', spans: ['AB', 'CD'], style: { fontSize: 'H * 0.1', fill: '#fff' } } as never, warn, { H: 200, W: 400 }) as { sequences: Array<{ style: Record<string, unknown>; initial: { x: number } }> };
    expect(g.sequences[1]!.initial.x).toBe(20);                       // fontSize 20: 10 px per character
    expect(g.sequences.map(q => q.style.fontSize)).toEqual([20, 20]);
    const v = expandSpans({ type: 'text', spans: ['AB', 'CD'], style: { fontSize: 'size' } } as never, warn, { size: 30 }) as { sequences: Array<{ initial: { x: number } }> };
    expect(v.sequences[1]!.initial.x).toBe(30);
  });

  it('a size that cannot be resolved is said, and the default is measured and drawn (never NaN)', () => {
    const g = expandSpans({ type: 'text', spans: ['AB', 'CD'], style: { fontSize: 'nowhere * 2' } } as never, warn, { H: 200 }) as { sequences: Array<{ style: Record<string, unknown>; initial: { x: number } }> };
    expect(said.some(m => /fontSize/.test(m) && /36/.test(m))).toBe(true);
    expect(g.sequences[0]!.style.fontSize).toBe(36);
    expect(g.sequences[1]!.initial.x).toBe(36);
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

  it('keys of a text that a group cannot carry are said, not dropped silently: fillGradient, format, colorSpace', () => {
    expandSpans({ type: 'text', spans: ['A'], style, fillGradient: { angle: 0, stops: [[0, '#f00'], [1, '#00f']] }, format: { decimals: 1 }, colorSpace: 'oklab' } as never, warn);
    const m = said.find(x => /do not apply to a spans layer/.test(x))!;
    expect(m).toMatch(/fillGradient/);
    expect(m).toMatch(/format/);
    expect(m).toMatch(/colorSpace/);
  });

  it('an anchor that is an expression, or is animated, is said (the anchor becomes the block\'s pivot, set once)', () => {
    const g = expandSpans({ type: 'text', spans: ['AB'], style, initial: { anchorX: 'w / 2', anchorY: 0.5 }, keyframes: [{ at: 0, to: { anchorY: 1 }, duration: 1 }] } as never, warn) as { initial: Record<string, unknown> };
    expect(said.some(m => /initial\.anchorX "w \/ 2" must be a number/.test(m))).toBe(true);
    expect(said.some(m => /anchorY cannot be keyframed/.test(m))).toBe(true);
    expect(g.initial).not.toHaveProperty('anchorX');
    expect(g.initial.pivotY).toBe(12);
  });

  it('style.wordWrap and style.leading do not apply (the lines are the \\n of the spans): said, and taken out of the pieces', () => {
    const g = expandSpans({ type: 'text', spans: ['AB'], style: { fontSize: 20, wordWrap: true, wordWrapWidth: 100, leading: 6 } } as never, warn) as { sequences: Array<{ style: Record<string, unknown> }> };
    expect(said.some(m => /style\.wordWrap, style\.wordWrapWidth, style\.leading do not apply/.test(m))).toBe(true);
    expect(g.sequences[0]!.style).not.toHaveProperty('wordWrap');
    expect(g.sequences[0]!.style).not.toHaveProperty('wordWrapWidth');
    expect(g.sequences[0]!.style).not.toHaveProperty('leading');
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
