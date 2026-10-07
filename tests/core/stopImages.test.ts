import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('../../src/core/Renderer', () => ({ exportFrames: vi.fn() }));
import { Movie } from '../../src/core/Movie';
import { normalizeStops } from '../../src/core/stops';

/** A "ready" Movie without a GPU; taking a picture of a frame is stubbed (the frame it is asked for is recorded). */
function movieWith(raw: Parameters<typeof normalizeStops>[0]) {
  const m = new Movie();
  const a = m as unknown as Record<string, any>;
  Object.assign(a, { _initState: 'ready', totalFrames: 300, frameRate: 30, duration: 10 });
  a.timeline = gsap.timeline({ paused: true }).add(gsap.to({}, { duration: 10 }));
  a._rootSequence = {}; a.app = {};
  a._awaitVideoFrames = async () => {}; a._updateSpace = () => {}; a._renderNow = () => {};
  a.stops = normalizeStops(raw, 10, 30);
  const asked: Array<[number, any]> = [];
  a._captureFrame = async (frame: number, o: any) => { asked.push([frame, o]); return `img@${frame}`; };
  return { m, a, asked };
}
const DECK = [{ at: 2, page: 'A' }, 3, { at: 5, page: 'B' }, 6, 7, { at: 9, page: 'C' }];       // frames 60 90 150 180 210 270

beforeEach(() => { vi.restoreAllMocks(); });

describe('movie.stopImages()', () => {
  it('by default one picture per page, of the page\'s LAST stop (the page fully built)', async () => {
    const { m } = movieWith(DECK);
    const imgs = await m.stopImages({ as: 'dataURL' });
    expect(imgs.map(i => [i.page, i.stop.index, i.image])).toEqual([[0, 1, 'img@90'], [1, 4, 'img@210'], [2, 5, 'img@270']]);
  });

  it('pick: "first" takes the first stop of each page instead', async () => {
    const { m } = movieWith(DECK);
    const imgs = await m.stopImages({ pick: 'first', as: 'dataURL' });
    expect(imgs.map(i => i.stop.index)).toEqual([0, 2, 5]);
  });

  it('which: "stops" is one picture per stop', async () => {
    const { m } = movieWith(DECK);
    const imgs = await m.stopImages({ which: 'stops', as: 'dataURL' });
    expect(imgs.map(i => i.stop.frame)).toEqual([60, 90, 150, 180, 210, 270]);
    expect(imgs.map(i => i.page)).toEqual([0, 0, 1, 1, 1, 2]);
  });

  it('passes the picture options on, and a blur is off unless asked for (thumbnails are for looking, not for the file)', async () => {
    const { m, asked } = movieWith(DECK);
    await m.stopImages({ scale: 0.25, type: 'image/jpeg', quality: 0.7, as: 'dataURL' });
    expect(asked[0]![1]).toMatchObject({ scale: 0.25, type: 'image/jpeg', quality: 0.7, as: 'dataURL', motionBlur: false });
    asked.length = 0;
    await m.stopImages({ motionBlur: 4, as: 'dataURL' });
    expect(asked[0]![1].motionBlur).toBe(4);
  });

  it('onImage is called as each picture is ready, in order (a page list can fill in as it goes)', async () => {
    const { m } = movieWith(DECK);
    const seen: number[] = [];
    await m.stopImages({ as: 'dataURL', onImage: i => seen.push(i.page) });
    expect(seen).toEqual([0, 1, 2]);
  });

  it('leaves the playhead where it was, paused, and does not announce seeks', async () => {
    const { m, a } = movieWith(DECK);
    await m.gotoFrame(120, true);
    const seeks: string[] = [];
    m.on('seeking', () => seeks.push('seeking'));
    await m.stopImages({ as: 'dataURL' });
    expect(m.currentFrame).toBe(120);
    expect(m.isPlaying).toBe(false);
    expect(seeks).toEqual([]);
    expect(a._atPoster).toBe(false);
  });

  it('pauses a movie that is playing before it starts', async () => {
    const { m } = movieWith(DECK);
    const pause = vi.spyOn(m, 'pause');
    await m.stopImages({ as: 'dataURL' });
    expect(pause).toHaveBeenCalled();
  });

  it('a movie with no stops has nothing to show: an empty list', async () => {
    const { m } = movieWith([]);
    expect(await m.stopImages({ as: 'dataURL' })).toEqual([]);
  });

  it('says which option is misspelt', async () => {
    const { m } = movieWith(DECK);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await m.stopImages({ sacle: 0.5, as: 'dataURL' } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/sacle.*scale/s));
  });
});

describe('movie.exportPDF()', () => {
  const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), c => c.charCodeAt(0));

  it('is one PDF page per page of the deck (the last stop of each, fully built), as JPEG, at the canvas size', async () => {
    const { m, a, asked } = movieWith(DECK);
    Object.assign(a, { width: 1280, height: 720 });
    a._captureFrame = async (frame: number, o: any) => { asked.push([frame, o]); return new Blob([JPEG], { type: 'image/jpeg' }); };
    const pdf = await m.exportPDF({ title: 'Talk' });
    expect(pdf.type).toBe('application/pdf');
    const s = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toMatch(/\/Count 3/);
    expect(s).toContain('/MediaBox [0 0 960 540]');
    expect(s).toContain('/Title (Talk)');
    expect(asked.map(x => x[0])).toEqual([90, 210, 270]);
    expect(asked[0]![1]).toMatchObject({ type: 'image/jpeg', as: 'blob' });
  });

  it('which: "stops" makes a page of every stop', async () => {
    const { m, a } = movieWith(DECK);
    Object.assign(a, { width: 1280, height: 720 });
    a._captureFrame = async () => new Blob([JPEG], { type: 'image/jpeg' });
    const s = new TextDecoder('latin1').decode(new Uint8Array(await (await m.exportPDF({ which: 'stops' })).arrayBuffer()));
    expect(s).toMatch(/\/Count 6/);
  });

  it('a stop flagged pdf: true is the page\'s picture, and pdf: false stops stay out of "every step"', async () => {
    const raw = [{ at: 2, page: 'A' }, { at: 3, pdf: true }, { at: 4 }, { at: 5, page: 'B' }, { at: 6, pdf: false }, { at: 8, page: 'C', pdf: false }];     // frames 60 90 120 150 180 240
    const mk = () => {
      const r = movieWith(raw);
      Object.assign(r.a, { width: 1280, height: 720 });
      r.a._captureFrame = async (frame: number, o: any) => { r.asked.push([frame, o]); return new Blob([JPEG], { type: 'image/jpeg' }); };
      return r;
    };
    const one = mk();
    await one.m.exportPDF();
    expect(one.asked.map(x => x[0])).toEqual([90, 150]);                      // A: the flagged one; B: its last stop that is not false; C: nothing to show, left out
    const every = mk();
    await every.m.exportPDF({ which: 'stops' });
    expect(every.asked.map(x => x[0])).toEqual([60, 90, 120, 150]);
    const thumbs = mk();
    await thumbs.m.stopImages({ as: 'dataURL' });
    expect(thumbs.asked.map(x => x[0])).toEqual([90, 150, 240]);              // a page list still shows every page
  });

  it('a movie with no stops has nothing to put in a PDF, and says how to fix that', async () => {
    const { m } = movieWith([]);
    await expect(m.exportPDF()).rejects.toThrow(/no stops.*composition/s);
  });
});
