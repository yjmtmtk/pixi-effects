import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Movie } from '../src/core/Movie';
import { Presenter } from '../src/Presenter';
import { normalizeStops } from '../src/core/stops';
import { Window as HappyWindow } from 'happy-dom';

type Listener = (...args: unknown[]) => void;

function fakeMovie(raw: Parameters<typeof normalizeStops>[0] = [{ at: 2, page: 'Intro' }, { at: 4 }, { at: 6, page: 'Two' }, { at: 8, page: 'Three' }], over: Record<string, unknown> = {}) {
  const listeners: Record<string, Listener[]> = {};
  const stops = normalizeStops(raw, 10, 30);
  const calls: Array<[string, ...unknown[]]> = [];
  const fake: Record<string, unknown> = {
    stops, isPlaying: false, currentFrame: 0, totalFrames: 300, frameRate: 30, duration: 10,
    get stopIndex() { return (fake as { _i: number })._i; }, _i: -1,
    get pageIndex() { const s = stops[(fake as { _i: number })._i]; return s ? s.pageIndex : -1; },
    get pageCount() { return stops.filter(s => s.pageStart).length; },
    get currentStop() { return stops[(fake as { _i: number })._i] ?? null; },
    async next() { calls.push(['next']); },
    async prev() { calls.push(['prev']); },
    async goToStop(i: number) { calls.push(['goToStop', i]); },
    async goToPage(n: number) { calls.push(['goToPage', n]); },
    async gotoFrame(f: number) { calls.push(['gotoFrame', f]); },
    async stopImages(o: { which?: string; onImage?: (i: unknown) => void }) {
      calls.push(['stopImages', o.which ?? 'pages']);
      const list = o.which === 'stops' ? stops : stops.filter(s => s.pageStart);
      const out = list.map(s => ({ stop: s, page: s.pageIndex, image: `data:img/${s.index}` }));
      for (const i of out) o.onImage?.(i);
      return out;
    },
    play() { calls.push(['play']); }, pause() { calls.push(['pause']); },
    on(e: string, fn: Listener) { (listeners[e] ??= []).push(fn); return fake; },
    off(e: string, fn: Listener) { const l = listeners[e]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } return fake; },
    emit(e: string, ...a: unknown[]) { for (const fn of [...(listeners[e] ?? [])]) fn(...a); },
    arriveAt(i: number) { (fake as { _i: number })._i = i; (fake as { emit: Function }).emit('stop', { index: i, stop: stops[i], pageIndex: stops[i]!.pageIndex }); },
    ...over,
  };
  return { movie: fake as unknown as Movie, f: fake as any, calls };
}
function stage(): HTMLCanvasElement {
  document.body.innerHTML = '<div class="stage" style="position:relative"><canvas id="stage" width="1280" height="720"></canvas></div>';
  return document.getElementById('stage') as HTMLCanvasElement;
}
const key = (k: string, extra: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const names = (calls: Array<[string, ...unknown[]]>) => calls.map(c => c[0] + (c.length > 1 ? `(${c.slice(1).join(',')})` : ''));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.querySelectorAll('style[data-movie-presenter]').forEach(n => n.remove()); });

describe('Presenter — keys', () => {
  it('next: ArrowRight, ArrowDown, Space, Enter and PageDown; back: ArrowLeft, ArrowUp, Backspace and PageUp', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    for (const k of ['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown']) key(k);
    for (const k of ['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp']) key(k);
    expect(names(calls)).toEqual(['next', 'next', 'next', 'next', 'next', 'prev', 'prev', 'prev', 'prev']);
    p.destroy();
  });

  it('Home goes to the first page, End to the last stop', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    key('Home'); key('End');
    expect(names(calls)).toEqual(['goToPage(0)', 'goToStop(3)']);
    p.destroy();
  });

  it('a page number then Enter jumps to that page (1-based for people); Enter alone is next', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    key('2'); key('Enter');
    key('Enter');
    expect(names(calls)).toEqual(['goToPage(1)', 'next']);
    key('1'); key('0'); key('Enter');                                          // page 10 does not exist: still asked for, the movie says so
    expect(names(calls).at(-1)).toBe('goToPage(9)');
    p.destroy();
  });

  it('typed digits that are not confirmed are forgotten after a moment', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    key('3');
    vi.advanceTimersByTime(3000);
    key('Enter');
    expect(names(calls)).toEqual(['next']);
    p.destroy();
  });

  it('keys typed into a text field, or with Ctrl / Alt / Meta, are left alone', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    const input = document.createElement('input'); document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    key('ArrowRight', { ctrlKey: true }); key('ArrowRight', { metaKey: true }); key('ArrowRight', { altKey: true });
    expect(calls).toEqual([]);
    p.destroy();
  });

  it('the keys it uses do not scroll the page', () => {
    const { movie } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true });
    document.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    p.destroy();
  });

  it('keyboard: false leaves the keys alone', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage(), keyboard: false });
    key('ArrowRight');
    expect(calls).toEqual([]);
    p.destroy();
  });
});

describe('Presenter — click, tap and swipe', () => {
  it('a click on the picture is next', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    canvas.click();
    expect(names(calls)).toEqual(['next']);
    expect(canvas.style.cursor).toBe('pointer');
    p.destroy();
    expect(canvas.style.cursor).toBe('');
  });

  it('clickToAdvance: false', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas, clickToAdvance: false });
    canvas.click();
    expect(calls).toEqual([]);
    p.destroy();
  });

  const pointer = (el: Element, type: string, x: number, y = 0) => el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y, pointerType: 'touch', button: 0 }));

  it('a swipe to the left is next and to the right is back, and the click that follows a swipe does nothing more', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    pointer(canvas, 'pointerdown', 300); pointer(canvas, 'pointerup', 180); canvas.click();
    pointer(canvas, 'pointerdown', 100); pointer(canvas, 'pointerup', 230); canvas.click();
    expect(names(calls)).toEqual(['next', 'prev']);
    p.destroy();
  });

  it('a tiny movement is a tap, not a swipe', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    pointer(canvas, 'pointerdown', 300); pointer(canvas, 'pointerup', 296); canvas.click();
    expect(names(calls)).toEqual(['next']);
    p.destroy();
  });

  it('swipe: false', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas, swipe: false, clickToAdvance: false });
    pointer(canvas, 'pointerdown', 300); pointer(canvas, 'pointerup', 100);
    expect(calls).toEqual([]);
    p.destroy();
  });
});

describe('Presenter — the page counter', () => {
  it('shows "page / pages" and follows the stops; before the first stop it shows the count with a dash', () => {
    const { movie, f } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    const counter = () => document.querySelector('.mp-counter')!.textContent;
    expect(counter()).toBe('– / 3');
    f.arriveAt(0); expect(counter()).toBe('1 / 3');
    f.arriveAt(1); expect(counter()).toBe('1 / 3');                             // a step of page 1
    f.arriveAt(2); expect(counter()).toBe('2 / 3');
    p.destroy();
  });

  it('shows the page name too, and a progress mark that follows the stops', () => {
    const { movie, f } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    f.arriveAt(2);
    expect(document.querySelector('.mp-title')!.textContent).toBe('Two');
    expect((document.querySelector('.mp-progress') as HTMLElement).style.getPropertyValue('--mp-fill')).toBe('0.75');   // stop 2 of 0..3 counted from 1: 3 of 4
    p.destroy();
  });

  it('indicator: false adds nothing to the page', () => {
    const { movie } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage(), indicator: false });
    expect(document.querySelector('.mp-counter')).toBeNull();
    p.destroy();
  });

  it('it fades out when nothing happens and comes back on a key press or a pointer move', () => {
    const { movie } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    const root = document.querySelector('.movie-presenter') as HTMLElement;
    key('ArrowRight');
    expect(root.getAttribute('data-idle')).toBe('false');
    vi.advanceTimersByTime(3000);
    expect(root.getAttribute('data-idle')).toBe('true');
    expect(canvas.style.cursor).toBe('none');                                  // and the pointer goes with it
    canvas.dispatchEvent(new Event('pointermove', { bubbles: true }));
    expect(root.getAttribute('data-idle')).toBe('false');
    p.destroy();
  });
});

describe('Presenter — blackout, help, fullscreen', () => {
  it('B blacks the picture out, W whites it out, the same key again (or Escape) brings it back; navigation does not move underneath', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    const cover = document.querySelector('.mp-cover') as HTMLElement;
    key('b'); expect(cover.getAttribute('data-mode')).toBe('black');
    key('ArrowRight'); expect(calls).toEqual([]);                              // the first press only brings the picture back
    expect(cover.getAttribute('data-mode')).toBe('off');
    key('W'); expect(cover.getAttribute('data-mode')).toBe('white');
    key('w'); expect(cover.getAttribute('data-mode')).toBe('off');
    key('.'); expect(cover.getAttribute('data-mode')).toBe('black');
    key('Escape'); expect(cover.getAttribute('data-mode')).toBe('off');
    p.destroy();
  });

  it('? (and h) show and hide the list of keys', () => {
    const { movie } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    const help = document.querySelector('.mp-help') as HTMLElement;
    expect(help.getAttribute('data-open')).toBe('false');
    key('?'); expect(help.getAttribute('data-open')).toBe('true');
    expect(help.textContent).toMatch(/Space/); expect(help.textContent).toMatch(/Home/);
    key('Escape'); expect(help.getAttribute('data-open')).toBe('false');
    key('h'); expect(help.getAttribute('data-open')).toBe('true');
    p.destroy();
  });

  it('F asks the box around the canvas for fullscreen; the wrapper is tagged so the picture fills it', () => {
    const { movie } = fakeMovie();
    const canvas = stage();
    const box = canvas.parentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    const req = vi.fn(async () => {}); box.requestFullscreen = req;
    const p = new Presenter(movie, { canvas });
    expect(box.hasAttribute('data-pr-wrap')).toBe(true);
    key('f');
    expect(req).toHaveBeenCalledTimes(1);
    p.destroy();
    expect(box.hasAttribute('data-pr-wrap')).toBe(false);
  });
});

describe('Presenter — start, auto-advance, loop', () => {
  it('start() asks for fullscreen and plays to the first stop', async () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const box = canvas.parentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    box.requestFullscreen = vi.fn(async () => {});
    const p = new Presenter(movie, { canvas });
    await p.start();
    expect(box.requestFullscreen).toHaveBeenCalled();
    expect(names(calls)).toEqual(['stopImages(stops)', 'next']);                // the pictures are made BEFORE the audience sees anything
    p.destroy();
  });

  it('a stop with `advance` moves on by itself after that many seconds; a manual move cancels it', () => {
    const { movie, f, calls } = fakeMovie([{ at: 2, page: 'A', advance: 3 }, { at: 5 }, { at: 8, advance: 1 }]);
    const p = new Presenter(movie, { canvas: stage() });
    f.arriveAt(0);
    vi.advanceTimersByTime(2900); expect(calls).toEqual([]);
    vi.advanceTimersByTime(200); expect(names(calls)).toEqual(['next']);
    f.arriveAt(2);
    key('ArrowLeft');                                                          // the presenter steps back: the timer is gone
    vi.advanceTimersByTime(2000);
    expect(names(calls)).toEqual(['next', 'prev']);
    p.destroy();
  });

  it('autoAdvance: false ignores `advance`', () => {
    const { movie, f, calls } = fakeMovie([{ at: 2, page: 'A', advance: 1 }]);
    const p = new Presenter(movie, { canvas: stage(), autoAdvance: false });
    f.arriveAt(0); vi.advanceTimersByTime(5000);
    expect(calls).toEqual([]);
    p.destroy();
  });

  it('loop: when it runs off the end it goes back to the start and plays again', async () => {
    const { movie, f, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage(), loop: true });
    f.emit('ended');
    await vi.advanceTimersByTimeAsync(1500);
    expect(names(calls)).toEqual(['gotoFrame(0)', 'next']);
    p.destroy();
  });

  it('without loop the end is the end', async () => {
    const { movie, f, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    f.emit('ended');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([]);
    p.destroy();
  });
});

describe('Presenter — housekeeping', () => {
  it('says so when the movie has no stops (it still moves with next / prev)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { movie } = fakeMovie([]);
    const p = new Presenter(movie, { canvas: stage() });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no stops.*composition/s));
    p.destroy(); warn.mockRestore();
  });

  it('needs a canvas on the page; a misspelt option is named', () => {
    const { movie } = fakeMovie();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => new Presenter(movie, {} as never)).toThrow(/canvas/);
    const p = new Presenter(movie, { canvas: stage(), clickToAdvanc: false } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/clickToAdvanc.*clickToAdvance/s));
    p.destroy(); warn.mockRestore();
  });

  it('destroy removes its DOM, its listeners and its timers', () => {
    const { movie, calls } = fakeMovie();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    p.destroy();
    expect(document.querySelector('.movie-presenter')).toBeNull();
    key('ArrowRight'); canvas.click();
    expect(calls).toEqual([]);
    p.destroy();                                                               // twice is fine
  });

  it('wraps a canvas whose parent is not positioned, and puts it back on destroy', () => {
    document.body.innerHTML = '<canvas id="stage" width="1280" height="720"></canvas>';
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    const { movie } = fakeMovie();
    const p = new Presenter(movie, { canvas });
    expect(canvas.parentElement!.className).toContain('movie-presenter-wrap');
    p.destroy();
    expect(canvas.parentElement).toBe(document.body);
  });
});

describe('Presenter — the page overview (G)', () => {
  const open = () => document.querySelector('.mp-overview') as HTMLElement;
  const cells = () => [...document.querySelectorAll('.mp-cell')] as HTMLElement[];

  it('G opens a grid with one cell per page, numbered and named, the current page marked; G or Escape closes it', async () => {
    const { movie, f } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    f.arriveAt(2);                                                              // on page 2 ("Two")
    key('g');
    expect(open().getAttribute('data-open')).toBe('true');
    expect(cells().map(c => c.querySelector('.mp-cell-name')!.textContent)).toEqual(['Intro', 'Two', 'Three']);
    expect(cells().map(c => c.querySelector('.mp-cell-num')!.textContent)).toEqual(['1', '2', '3']);
    expect(cells().map(c => c.getAttribute('data-current'))).toEqual(['false', 'true', 'false']);
    key('G'); expect(open().getAttribute('data-open')).toBe('false');
    key('g'); key('Escape'); expect(open().getAttribute('data-open')).toBe('false');
    p.destroy();
  });

  it('the thumbnails are asked for once, fill in as they arrive, and are kept for the next time', async () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    key('g');
    await vi.advanceTimersByTimeAsync(10);
    expect(cells().map(c => c.querySelector('img')?.getAttribute('src'))).toEqual(['data:img/1', 'data:img/2', 'data:img/3']);       // each page's last stop, fully built
    key('g'); key('g');
    await vi.advanceTimersByTimeAsync(10);
    expect(calls.filter(c => c[0] === 'stopImages')).toEqual([['stopImages', 'stops']]);
    p.destroy();
  });

  it('opening it stops a movie that is playing', () => {
    const { movie, calls } = fakeMovie();
    (movie as unknown as { isPlaying: boolean }).isPlaying = true;
    const p = new Presenter(movie, { canvas: stage() });
    key('g');
    expect(names(calls)).toContain('pause');
    p.destroy();
  });

  it('arrow keys move the selection (over a grid of columns), Enter goes to that page and closes it', async () => {
    const { movie, f, calls } = fakeMovie([1, 2, 3, 4, 5, 6, 7].map(at => ({ at, page: `P${at}` })));
    const p = new Presenter(movie, { canvas: stage() });
    f.arriveAt(0);
    key('g');
    const cols = Number(getComputedStyle(open().querySelector('.mp-grid')!).getPropertyValue('--mp-cols') || (open().querySelector('.mp-grid') as HTMLElement).style.getPropertyValue('--mp-cols'));
    expect(cols).toBeGreaterThanOrEqual(2);
    key('ArrowRight'); key('ArrowRight');
    expect(cells().findIndex(c => c.getAttribute('data-selected') === 'true')).toBe(2);
    key('ArrowDown');
    expect(cells().findIndex(c => c.getAttribute('data-selected') === 'true')).toBe(Math.min(6, 2 + cols));
    key('ArrowUp'); key('ArrowLeft');
    expect(cells().findIndex(c => c.getAttribute('data-selected') === 'true')).toBe(1);
    key('Enter');
    expect(names(calls).filter(n => n.startsWith('goToPage'))).toEqual(['goToPage(1)']);
    expect(open().getAttribute('data-open')).toBe('false');
    p.destroy();
  });

  it('the selection stops at the first and last page', () => {
    const { movie, f } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    f.arriveAt(0); key('g');
    key('ArrowLeft'); key('ArrowUp');
    expect(cells().findIndex(c => c.getAttribute('data-selected') === 'true')).toBe(0);
    for (let i = 0; i < 9; i++) key('ArrowRight');
    expect(cells().findIndex(c => c.getAttribute('data-selected') === 'true')).toBe(2);
    p.destroy();
  });

  it('a click on a page goes to it and closes the overview', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    key('g');
    cells()[2]!.click();
    expect(names(calls).filter(n => n.startsWith('goToPage'))).toEqual(['goToPage(2)']);
    expect(open().getAttribute('data-open')).toBe('false');
    p.destroy();
  });

  it('while it is open, next / back keys do not move the presentation underneath', () => {
    const { movie, calls } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    key('g');
    key(' '); key('PageDown'); key('Backspace');
    expect(names(calls).filter(n => n === 'next' || n === 'prev')).toEqual([]);
    p.destroy();
  });

  it('a movie with no stops has no pages to show: G does nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { movie } = fakeMovie([]);
    const p = new Presenter(movie, { canvas: stage() });
    key('g');
    expect(open().getAttribute('data-open')).toBe('false');
    p.destroy(); warn.mockRestore();
  });

  it('G is in the list of keys', () => {
    const { movie } = fakeMovie();
    const p = new Presenter(movie, { canvas: stage() });
    expect(document.querySelector('.mp-help')!.textContent).toMatch(/overview/i);
    p.destroy();
  });
});

describe('Presenter — the presenter view (P): a second window with the notes, the next picture and a timer', () => {
  const DECK = [{ at: 2, page: 'Intro', notes: 'Say hello.\nSlow down.' }, { at: 4 }, { at: 6, page: 'Two' }, { at: 8, page: 'Three', notes: 'Wrap up.' }];

  /** window.open stubbed: the "popup" is a second happy-dom window. */
  function popup() {
    const w = new HappyWindow() as any;
    w.closed = false; w.focus = vi.fn(); w.close = vi.fn(() => { w.closed = true; });
    const ctx = { drawImage: vi.fn() };
    w.HTMLCanvasElement.prototype.getContext = () => ctx;
    const open = vi.spyOn(window, 'open').mockReturnValue(w);
    return { w, ctx, open };
  }
  const q = (w: any, sel: string) => w.document.querySelector(sel) as HTMLElement;

  it('P opens it, shows where the talk is, the notes of the page and the picture of what comes next', async () => {
    const { movie, f } = fakeMovie(DECK);
    const { w, open } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    await p.ensureThumbs();
    f.arriveAt(0);
    key('p');
    expect(open).toHaveBeenCalledTimes(1);
    expect(q(w, '.pv-count').textContent).toBe('1 / 3');
    expect(q(w, '.pv-title').textContent).toBe('Intro');
    expect(q(w, '.pv-notes').textContent).toBe('Say hello.\nSlow down.');
    expect(q(w, '.pv-next').getAttribute('src')).toBe('data:img/1');                       // the next STOP (a step of this page)
    f.arriveAt(1);
    expect(q(w, '.pv-notes').textContent).toBe('Say hello.\nSlow down.');                 // still page 1: the same notes
    expect(q(w, '.pv-next').getAttribute('src')).toBe('data:img/2');
    f.arriveAt(2);
    expect(q(w, '.pv-count').textContent).toBe('2 / 3');
    expect(q(w, '.pv-notes').textContent).toBe('');                                          // page 2 has none
    expect(q(w, '.pv-notes').getAttribute('data-empty')).toBe('true');
    p.destroy();
  });

  it('on the last stop there is no next picture, only "End"', async () => {
    const { movie, f } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    await p.ensureThumbs();
    f.arriveAt(3);
    key('p');
    expect(q(w, '.pv-nextbox').getAttribute('data-end')).toBe('true');
    p.destroy();
  });

  it('before the first stop it shows the first page\'s notes and picture ("coming up")', async () => {
    const { movie } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    await p.ensureThumbs();
    key('p');
    expect(q(w, '.pv-count').textContent).toBe('– / 3');
    expect(q(w, '.pv-notes').textContent).toBe('Say hello.\nSlow down.');
    expect(q(w, '.pv-next').getAttribute('src')).toBe('data:img/0');
    p.destroy();
  });

  it('the pictures are made when the view opens if nobody made them yet, and the view fills in when they arrive', async () => {
    const { movie, f, calls } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    f.arriveAt(0);
    key('p');
    await vi.advanceTimersByTimeAsync(10);
    expect(calls.filter(c => c[0] === 'stopImages')).toHaveLength(1);
    expect(q(w, '.pv-next').getAttribute('src')).toBe('data:img/1');
    p.destroy();
  });

  it('P again closes it; a window the user closed can be opened again', () => {
    const { movie } = fakeMovie(DECK);
    const { w, open } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    key('p'); key('p');
    expect(w.close).toHaveBeenCalledTimes(1);
    key('p');
    expect(open).toHaveBeenCalledTimes(2);
    w.closed = true;                                                                         // the user closes the window
    key('p');
    expect(open).toHaveBeenCalledTimes(3);
    p.destroy();
  });

  it('the buttons in it are next and back', () => {
    const { movie, calls } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    key('p');
    q(w, '.pv-nextbtn').click(); q(w, '.pv-prev').click();
    expect(names(calls).filter(n => n === 'next' || n === 'prev')).toEqual(['next', 'prev']);
    p.destroy();
  });

  it('the keys work in the presenter view too (the presenter keeps their hands there)', () => {
    const { movie, calls } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    key('p');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(names(calls).filter(n => n === 'next' || n === 'prev')).toEqual(['next', 'prev']);
    p.destroy();
  });

  it('it mirrors the picture live: every frame the movie draws is copied into the view', () => {
    const { movie, f } = fakeMovie(DECK);
    const { ctx } = popup();
    const canvas = stage();
    const p = new Presenter(movie, { canvas });
    key('p');
    ctx.drawImage.mockClear();
    f.emit('frame', { frame: 12, totalFrames: 300 });
    f.emit('frame', { frame: 13, totalFrames: 300 });
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(ctx.drawImage.mock.calls[0]![0]).toBe(canvas);
    p.destroy();
    ctx.drawImage.mockClear();
    f.emit('frame', { frame: 14, totalFrames: 300 });
    expect(ctx.drawImage).not.toHaveBeenCalled();                                            // and stops when it is closed
  });

  it('the timer counts up from when the view opened, and reset sets it back to zero', () => {
    const { movie } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    key('p');
    expect(q(w, '.pv-timer').textContent).toBe('00:00');
    vi.advanceTimersByTime(65_000);
    expect(q(w, '.pv-timer').textContent).toBe('01:05');
    q(w, '.pv-reset').click();
    expect(q(w, '.pv-timer').textContent).toBe('00:00');
    vi.advanceTimersByTime(3000);
    expect(q(w, '.pv-timer').textContent).toBe('00:03');
    p.destroy();
  });

  it('a blocked popup is said out loud and nothing breaks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { movie } = fakeMovie(DECK);
    const p = new Presenter(movie, { canvas: stage() });
    key('p');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/popup/i));
    expect(p.openPresenterView()).toBeNull();
    p.destroy(); warn.mockRestore();
  });

  it('destroy closes the view and its timer; P is in the list of keys', () => {
    const { movie } = fakeMovie(DECK);
    const { w } = popup();
    const p = new Presenter(movie, { canvas: stage() });
    expect(document.querySelector('.mp-help')!.textContent).toMatch(/presenter view/i);
    key('p');
    p.destroy();
    expect(w.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
