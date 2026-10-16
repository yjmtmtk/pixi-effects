// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// The player (Controller) around a plain canvas that the page sizes itself ("min(960px, 100%)", no positioned parent), in a real browser.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const metrics = (film: Film, width: number) => film.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
const sizes = (film: Film) => film.eval<{ canvasW: number; wrapW: number; canvasLeft: number; vw: number; wrapClass: string }>(`(() => {
  const c = document.getElementById('stage'), w = c.parentElement, r = e => e.getBoundingClientRect();
  return { wrapClass: w.className, canvasW: r(c).width, wrapW: r(w).width, canvasLeft: r(c).left, vw: innerWidth };
})()`);

runFilms('Controller: the player wraps the canvas without moving it, in a real browser', () => {
  it('a canvas sized "min(960px, 100%)" in a window wider than its attribute width: the wrapper is exactly as wide as the canvas and the canvas stays centred, and it follows the window', async () => {
    await withFilm('controller', async (film) => {
      await metrics(film, 1600); await sleep(400);
      const m = await sizes(film);
      expect(m.wrapClass).toContain('movie-controller-wrap');
      expect(m.canvasW).toBeCloseTo(960, 0);
      expect(m.wrapW, 'not 1280: no empty strip next to the picture').toBeCloseTo(m.canvasW, 0);
      expect(m.canvasLeft + m.canvasW / 2, 'in the middle of the window').toBeCloseTo(m.vw / 2, 0);
      await metrics(film, 700); await sleep(400);
      const small = await sizes(film);
      expect(small.canvasW).toBeLessThanOrEqual(small.vw);
      expect(small.wrapW).toBeCloseTo(small.canvasW, 0);
      await metrics(film, 1600); await sleep(400);
      const big = await sizes(film);
      expect(big.canvasW).toBeCloseTo(960, 0);
      expect(big.wrapW).toBeCloseTo(big.canvasW, 0);
    });
  }, 90_000);

  it('a browser without element fullscreen (iPhone Safari) shows no fullscreen button; a desktop browser does', async () => {
    const buttons = (beforeLoad?: string) => withFilm('controller', (film) => film.eval<number>("document.querySelectorAll('.mc-fullscreen').length"), beforeLoad ? { beforeLoad } : {});
    expect(await buttons()).toBe(1);
    expect(await buttons('delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;')).toBe(0);
  }, 90_000);

  it('the bar is blue by default and takes its colour and thickness from --mc-accent / --mc-track-height set in the page CSS', async () => {
    await withFilm('controller', async (film) => {
      const read = () => film.eval<{ fill: string; height: string; thumb: string }>(`(() => { const f = document.querySelector('.mc-progress-fill'), t = document.querySelector('.mc-progress-thumb'); const c = getComputedStyle(f); return { fill: c.backgroundColor, height: c.height, thumb: getComputedStyle(t).backgroundColor }; })()`);
      const before = await read();
      expect(before.fill).toBe('rgb(0, 122, 255)');                                // #007AFF
      expect(before.height).toBe('3px');
      await film.eval(`document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ':root { --mc-accent: rgb(255, 0, 128); --mc-track-height: 8px; }' })), 0`);
      await sleep(350);                                                            // the thickness animates (120 ms)
      const after = await read();
      expect(after.fill).toBe('rgb(255, 0, 128)');
      expect(after.thumb).toBe('rgb(255, 0, 128)');
      expect(after.height).toBe('8px');
    });
  }, 90_000);

  it('a real click on the picture plays and pauses it; a click on the bar button is still one toggle', async () => {
    await withFilm('controller', async (film) => {
      await metrics(film, 1400); await sleep(400);
      const click = async (x: number, y: number) => {
        await film.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await film.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await film.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await sleep(150);
      };
      const centreOf = (sel: string) => film.eval<{ x: number; y: number }>(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const playing = () => film.eval<boolean>('movie.isPlaying');
      const c = await centreOf('#stage');
      expect(await playing()).toBe(false);
      await click(c.x, c.y);                                                       // the middle of the picture
      expect(await playing()).toBe(true);
      await click(c.x, c.y);
      expect(await playing()).toBe(false);
      const b = await centreOf('.mc-play');                                        // the bar's own button: one click, one toggle
      await click(b.x, b.y);
      expect(await playing()).toBe(true);
      await click(b.x, b.y);
      expect(await playing()).toBe(false);
    });
  }, 90_000);
});
