import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeStops } from '../../src/core/stops';
import { nextStopAfter, previousStopBefore, stopAtOrBefore, pageStarts, pictureStops } from '../../src/present/stops';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

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
