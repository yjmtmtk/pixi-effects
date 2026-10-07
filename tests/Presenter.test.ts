import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Movie } from '../src/core/Movie';
import { Presenter } from '../src/Presenter';
import { normalizeStops } from '../src/core/stops';

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
    expect(names(calls)).toEqual(['next']);
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
