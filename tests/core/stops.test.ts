import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeStops, nextStopAfter, previousStopBefore, stopAtOrBefore, pageStarts, pictureStops } from '../../src/core/stops';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('normalizeStops', () => {
  it('no stops is an empty list', () => {
    expect(normalizeStops(undefined, 10, 30)).toEqual([]);
    expect(normalizeStops([], 10, 30)).toEqual([]);
  });

  it('numbers are stops; each gets its frame; with no `page` anywhere every stop is its own page', () => {
    const s = normalizeStops([2, 5, 8.5], 10, 30);
    expect(s.map(x => [x.index, x.at, x.frame, x.pageIndex, x.pageStart])).toEqual([[0, 2, 60, 0, true], [1, 5, 150, 1, true], [2, 8.5, 255, 2, true]]);
  });

  it('objects carry a page name, notes and an auto-advance; a stop with `page` starts a page, the others are steps of it', () => {
    const s = normalizeStops([
      { at: 2, page: 'Intro', notes: 'say hello' },
      { at: 4 },
      { at: 5.5 },
      { at: 8, page: 'The problem', advance: 3 },
    ], 10, 30);
    expect(s.map(x => [x.pageStart, x.pageIndex, x.page])).toEqual([[true, 0, 'Intro'], [false, 0, 'Intro'], [false, 0, 'Intro'], [true, 1, 'The problem']]);
    expect(s[0]!.notes).toBe('say hello');
    expect(s[3]!.advance).toBe(3);
    expect(s[1]!.notes).toBeUndefined();
  });

  it('`page: true` starts an unnamed page', () => {
    const s = normalizeStops([{ at: 1, page: true }, { at: 2 }, { at: 3, page: true }], 10, 30);
    expect(s.map(x => [x.pageStart, x.pageIndex, x.page])).toEqual([[true, 0, null], [false, 0, null], [true, 1, null]]);
  });

  it('the first stop always starts a page, even if the author forgot `page` on it', () => {
    const s = normalizeStops([{ at: 1 }, { at: 2 }, { at: 3, page: 'Two' }], 10, 30);
    expect(s.map(x => [x.pageStart, x.pageIndex])).toEqual([[true, 0], [false, 0], [true, 1]]);
  });

  it('is sorted, a negative time counts back from the end, and two stops on one frame are one', () => {
    const s = normalizeStops([8, 2, -1, 2.01], 10, 30);
    expect(s.map(x => x.at)).toEqual([2, 8, 9]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/same frame/));
  });

  it('a stop outside the movie, or not a number, is dropped with a warning that names it', () => {
    const s = normalizeStops([3, 12, Number.NaN, '4' as never, { at: Infinity }], 10, 30);
    expect(s.map(x => x.at)).toEqual([3]);
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/12/);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('a stop at the very end is allowed (the last page of a deck often is)', () => {
    expect(normalizeStops([10], 10, 30)[0]!.frame).toBe(300);
  });

  it('warns about a misspelt key on a stop object', () => {
    normalizeStops([{ at: 1, pge: 'x' } as never], 10, 30);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/pge.*page/s));
  });

  it('a bad advance (negative, not a number) is ignored with a warning', () => {
    const s = normalizeStops([{ at: 1, advance: -2 }, { at: 2, advance: 'x' as never }], 10, 30);
    expect(s[0]!.advance).toBeUndefined(); expect(s[1]!.advance).toBeUndefined();
    expect(warn.mock.calls.length).toBe(2);
  });
});

describe('looking things up', () => {
  const stops = normalizeStops([{ at: 2, page: 'A' }, { at: 4 }, { at: 6, page: 'B' }, { at: 8 }], 10, 30);

  it('nextStopAfter: the first stop beyond a frame', () => {
    expect(nextStopAfter(stops, 0)!.index).toBe(0);
    expect(nextStopAfter(stops, 60)!.index).toBe(1);            // standing ON stop 0, the next is stop 1
    expect(nextStopAfter(stops, 61)!.index).toBe(1);
    expect(nextStopAfter(stops, 240)).toBeNull();
  });

  it('previousStopBefore: the last stop before a frame', () => {
    expect(previousStopBefore(stops, 60)).toBeNull();
    expect(previousStopBefore(stops, 120)!.index).toBe(0);      // standing ON stop 1, back is stop 0
    expect(previousStopBefore(stops, 121)!.index).toBe(1);
  });

  it('stopAtOrBefore: where the playhead is, in stops', () => {
    expect(stopAtOrBefore(stops, 59)).toBeNull();
    expect(stopAtOrBefore(stops, 60)!.index).toBe(0);
    expect(stopAtOrBefore(stops, 130)!.index).toBe(1);
  });

  it('pageStarts: the stop that begins each page', () => {
    expect(pageStarts(stops).map(s => s.index)).toEqual([0, 2]);
    expect(pageStarts([])).toEqual([]);
  });
});

describe('the `pdf` flag of a stop', () => {
  const deckStops = (extra: Record<number, object>) => normalizeStops(
    [{ at: 2, page: 'A', ...extra[0] }, { at: 3, ...extra[1] }, { at: 4, ...extra[2] }, { at: 6, page: 'B', ...extra[3] }, { at: 7, ...extra[4] }] as never, 10, 30);

  it('is kept on the stop, and a value that is not true / false is ignored with a warning that names it', () => {
    const s = normalizeStops([{ at: 2, pdf: false }, { at: 4, pdf: true }, { at: 6, pdf: 'yes' as never }], 10, 30);
    expect(s.map(x => x.pdf)).toEqual([false, true, undefined]);
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/stops\[2\].*pdf.*true or false/);
  });

  it('pages: the last stop of each page, as before, when nothing is flagged', () => {
    expect(pictureStops(deckStops({}), { which: 'pages' }).map(s => s.index)).toEqual([2, 4]);
    expect(pictureStops(deckStops({}), { which: 'pages', pick: 'first' }).map(s => s.index)).toEqual([0, 3]);
  });

  it('pages: a stop flagged pdf: true is the page\'s picture, wherever it is in the page', () => {
    expect(pictureStops(deckStops({ 1: { pdf: true } }), { which: 'pages' }).map(s => s.index)).toEqual([1, 4]);
  });

  it('pages: pdf: false stops are skipped when picking the last (or first) one', () => {
    expect(pictureStops(deckStops({ 2: { pdf: false } }), { which: 'pages' }).map(s => s.index)).toEqual([1, 4]);
    expect(pictureStops(deckStops({ 0: { pdf: false } }), { which: 'pages', pick: 'first' }).map(s => s.index)).toEqual([1, 3]);
  });

  it('a page whose stops are all pdf: false still has a picture for a page list, and none for a PDF', () => {
    const s = deckStops({ 3: { pdf: false }, 4: { pdf: false } });
    expect(pictureStops(s, { which: 'pages' }).map(x => x.index)).toEqual([2, 4]);
    expect(pictureStops(s, { which: 'pages', pdf: true }).map(x => x.index)).toEqual([2]);
  });

  it('stops: every stop, except those flagged pdf: false when the pictures are for a PDF', () => {
    const s = deckStops({ 1: { pdf: false } });
    expect(pictureStops(s, { which: 'stops' }).map(x => x.index)).toEqual([0, 1, 2, 3, 4]);
    expect(pictureStops(s, { which: 'stops', pdf: true }).map(x => x.index)).toEqual([0, 2, 3, 4]);
  });
});
