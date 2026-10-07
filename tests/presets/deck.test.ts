import { describe, it, expect, vi } from 'vitest';
import { deck } from '../../src/presets/deck';

const box = (name: string) => ({ type: 'shape', shape: 'rect', name, width: 10, height: 10 }) as never;
const layers = (r: any) => r.composition.sequences as any[];

describe('deck(): pages laid out one after the other', () => {
  it('each page is a composition layer, placed after the one before; the movie is as long as all of them', () => {
    const r = deck({ pages: [{ name: 'One', duration: 3, sequences: [box('a')] }, { name: 'Two', duration: 4, sequences: [box('b')] }] });
    expect(r.duration).toBe(7);
    expect(layers(r).map(l => [l.type, l.name, l.at, l.duration])).toEqual([['composition', 'page-1', 0, 3], ['composition', 'page-2', 3, 4]]);
    expect(layers(r)[0].sequences).toHaveLength(1);                           // the page's own layers are inside, in the page's own time
    expect(r.composition.transitions).toBeUndefined();
  });

  it('a transition makes the next page start early, by its duration, and wires it with the existing transitions', () => {
    const r = deck({
      transition: { kind: 'slide', duration: 0.5, direction: 'left' } as never,
      pages: [{ duration: 3, sequences: [] }, { duration: 4, sequences: [] }, { duration: 2, sequences: [] }],
    });
    expect(layers(r).map(l => l.at)).toEqual([0, 2.5, 6]);
    expect(r.duration).toBe(8);                                               // 3 + 4 + 2 − 2 × 0.5
    expect(r.composition.transitions).toEqual([
      { kind: 'slide', direction: 'left', from: 'page-1', to: 'page-2', at: 2.5, duration: 0.5 },
      { kind: 'slide', direction: 'left', from: 'page-2', to: 'page-3', at: 6, duration: 0.5 },
    ]);
  });

  it('a page that has no stops of its own stops where its transition begins (the last page, at its end)', () => {
    const r = deck({ transition: { kind: 'crossfade', duration: 0.5 }, pages: [{ name: 'A', duration: 3, sequences: [] }, { name: 'B', duration: 4, sequences: [] }] });
    expect(r.composition.stops).toEqual([{ at: 2.5, page: 'A' }, { at: 6.5, page: 'B' }]);
  });

  it('stops are written in the page\'s own time and come out absolute; the first of a page begins the page, the others are steps', () => {
    const r = deck({ pages: [{ name: 'A', duration: 4, stops: [1, 2.5], sequences: [] }, { name: 'B', duration: 5, stops: [1.5], sequences: [] }] });
    expect(r.composition.stops).toEqual([{ at: 1, page: 'A' }, { at: 2.5 }, { at: 5.5, page: 'B' }]);
  });

  it('notes belong to the page\'s first stop and `advance` to its last', () => {
    const r = deck({ pages: [{ name: 'A', duration: 4, stops: [1, 2.5], notes: 'say hi', advance: 3, sequences: [] }] });
    expect(r.composition.stops).toEqual([{ at: 1, page: 'A', notes: 'say hi' }, { at: 2.5, advance: 3 }]);
  });

  it('a stop can be written as { at, pdf }: which moment stands for the page in a PDF (true) or is left out of it (false)', () => {
    const r = deck({ pages: [{ name: 'A', duration: 4, stops: [1, { at: 2, pdf: true }, { at: 3, pdf: false }], sequences: [] }] });
    expect(r.composition.stops).toEqual([{ at: 1, page: 'A' }, { at: 2, pdf: true }, { at: 3, pdf: false }]);
  });

  it('a page stop object with a misspelt key says so, and a bad time is still an error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deck({ pages: [{ name: 'A', duration: 4, stops: [{ at: 1, pdff: true } as never], sequences: [] }] });
    expect(warn.mock.calls.join('\n')).toMatch(/pdff.*pdf/s);
    expect(() => deck({ pages: [{ name: 'A', duration: 4, stops: [{ at: 9 }], sequences: [] }] })).toThrow(/outside the page/);
    warn.mockRestore();
  });

  it('a page without a name is still a page', () => {
    const r = deck({ pages: [{ duration: 2, sequences: [] }, { duration: 2, sequences: [] }] });
    expect(r.composition.stops).toEqual([{ at: 2, page: true }, { at: 4, page: true }]);
  });

  it('a page can set its own layer properties (a fade of the whole page, a background) and keeps them', () => {
    const r = deck({ pages: [{ duration: 3, sequences: [], initial: { alpha: 0 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.5 }] } as never] });
    expect(layers(r)[0].initial).toEqual({ alpha: 0 });
    expect(layers(r)[0].keyframes).toHaveLength(1);
  });

  it('other options of the composition pass through (the result is spread into movie.init)', () => {
    const r = deck({ pages: [{ duration: 2, sequences: [] }], background: '#123456' } as never) as any;
    expect(r.background).toBe('#123456');
  });
});

describe('deck(): mistakes are said out loud', () => {
  it('needs pages, each with a positive duration and a list of layers', () => {
    expect(() => deck({ pages: [] })).toThrow(/pages/);
    expect(() => deck({} as never)).toThrow(/pages/);
    expect(() => deck({ pages: [{ duration: 0, sequences: [] }] })).toThrow(/pages\[0\].*duration/s);
    expect(() => deck({ pages: [{ duration: 2 } as never] })).toThrow(/pages\[0\].*sequences/s);
  });

  it('a stop outside its page, or an unsorted list, is an error that names the page', () => {
    expect(() => deck({ pages: [{ name: 'A', duration: 3, stops: [4], sequences: [] }] })).toThrow(/"A".*stop 4.*3/s);
    expect(() => deck({ pages: [{ name: 'A', duration: 3, stops: [2, 1], sequences: [] }] })).toThrow(/"A".*order/s);
  });

  it('a transition as long as a page cannot work', () => {
    expect(() => deck({ transition: { kind: 'crossfade', duration: 3 }, pages: [{ duration: 3, sequences: [] }, { duration: 3, sequences: [] }] })).toThrow(/transition.*3.*shorter/s);
  });

  it('a transition with no duration, and a misspelt option', () => {
    expect(() => deck({ transition: { kind: 'crossfade' } as never, pages: [{ duration: 3, sequences: [] }] })).toThrow(/transition.*duration/s);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deck({ pages: [{ duration: 2, sequences: [], nots: 'x' } as never] });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/nots.*notes/s));
    warn.mockRestore();
  });
});
