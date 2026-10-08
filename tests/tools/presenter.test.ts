// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js')) && existsSync(join(root, 'dist/Presenter.js'));

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const userDataDir = mkdtempSync(join(tmpdir(), 'presenter-'));
  const { proc, cdp } = await launchPage(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 600, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/presenter.html${query}` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) { await check.sleep(250); ready = await cdp.eval('window.__ready === true').catch(() => false); }
    expect(ready).toBe(true);
    expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');
    return await fn(cdp);
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    await check.sleep(200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}
const press = async (cdp: any, key: string, code = key, vk = 0) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key.length === 1 ? key : undefined });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
};
const waitFor = async (cdp: any, expr: string, tries = 80) => { for (let i = 0; i < tries; i++) { if (await cdp.eval(expr).catch(() => false)) return true; await check.sleep(100); } return false; };
const state = (cdp: any) => cdp.eval(`({ frame: movie.currentFrame, playing: movie.isPlaying, stop: movie.stopIndex, page: movie.pageIndex, counter: document.querySelector('.mp-counter')?.textContent, title: document.querySelector('.mp-title')?.textContent })`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('Presenter, in a real browser', () => {
  it('the arrow key plays to the next stop and stops exactly on its frame; again, to the next; a key during playback skips to the stop', async () => {
    await withPage('', async (cdp) => {
      expect(await state(cdp)).toMatchObject({ frame: 0, playing: false, stop: -1, counter: '– / 3' });
      await press(cdp, 'ArrowRight', 'ArrowRight', 39);
      expect(await waitFor(cdp, 'movie.currentFrame === 30 && !movie.isPlaying')).toBe(true);        // 1 s at 30 fps
      expect(await state(cdp)).toMatchObject({ frame: 30, stop: 0, page: 0, counter: '1 / 3', title: 'A' });
      await press(cdp, 'ArrowRight', 'ArrowRight', 39);
      expect(await waitFor(cdp, 'movie.currentFrame === 60 && !movie.isPlaying')).toBe(true);        // the step at 2 s
      expect(await state(cdp)).toMatchObject({ frame: 60, stop: 1, page: 0, counter: '1 / 3' });       // still page 1
      await press(cdp, 'ArrowRight', 'ArrowRight', 39);                                                 // starts playing toward 3.5 s
      await check.sleep(250);
      expect((await state(cdp)).playing).toBe(true);
      await press(cdp, ' ', 'Space', 32);                                                                // press again: skip the rest
      expect(await waitFor(cdp, 'movie.currentFrame === 105 && !movie.isPlaying', 30)).toBe(true);
      expect(await state(cdp)).toMatchObject({ frame: 105, stop: 2, page: 1, counter: '2 / 3', title: 'B' });
    });
  }, 60_000);

  it('back jumps to the previous stop at once, Home to the first page, End to the last stop, and a number then Enter to that page', async () => {
    await withPage('', async (cdp) => {
      await cdp.eval('movie.goToStop(3)');
      expect(await waitFor(cdp, 'movie.currentFrame === 150')).toBe(true);
      await press(cdp, 'ArrowLeft', 'ArrowLeft', 37);
      expect(await waitFor(cdp, 'movie.currentFrame === 105')).toBe(true);
      await press(cdp, 'Home', 'Home', 36);
      expect(await waitFor(cdp, 'movie.currentFrame === 30')).toBe(true);
      await press(cdp, 'End', 'End', 35);
      expect(await waitFor(cdp, 'movie.currentFrame === 150')).toBe(true);
      await press(cdp, '2', 'Digit2', 50); await press(cdp, 'Enter', 'Enter', 13);
      expect(await waitFor(cdp, 'movie.currentFrame === 105')).toBe(true);
      expect((await state(cdp)).page).toBe(1);
    });
  }, 60_000);

  it('B blacks the picture out, a key brings it back without moving; the picture is really covered while it is black', async () => {
    await withPage('', async (cdp) => {
      await press(cdp, 'b', 'KeyB', 66);
      expect(await waitFor(cdp, `getComputedStyle(document.querySelector('.mp-cover')).opacity === '1'`)).toBe(true);        // (it fades in over a quarter of a second)
      await press(cdp, 'ArrowRight', 'ArrowRight', 39);
      await check.sleep(400);
      expect((await state(cdp)).frame).toBe(0);                                                        // it only brought the picture back
      expect(await cdp.eval(`document.querySelector('.mp-cover').getAttribute('data-mode')`)).toBe('off');
    });
  }, 60_000);

  it('a click on the picture is next', async () => {
    await withPage('', async (cdp) => {
      const box = await cdp.eval(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      expect(await waitFor(cdp, 'movie.currentFrame === 30 && !movie.isPlaying')).toBe(true);
    });
  }, 60_000);

  it('with the Controller, the seek bar has a mark per stop and a Present button hands the page to a Presenter; Escape gives it back', async () => {
    await withPage('?controller=1', async (cdp) => {
      expect(await cdp.eval(`document.querySelectorAll('.mc-stop-tick').length`)).toBe(4);
      expect(await cdp.eval(`[...document.querySelectorAll('.mc-stop-tick')].map(t => t.style.left)`)).toEqual(['16.666666666666664%', '33.33333333333333%', '58.333333333333336%', '83.33333333333334%'].map((v: string) => expect.any(String)));
      await cdp.eval(`document.querySelector('.mc-present').click()`);
      expect(await waitFor(cdp, `!!document.querySelector('.movie-presenter')`)).toBe(true);
      expect(await waitFor(cdp, 'movie.currentFrame === 30 && !movie.isPlaying')).toBe(true);          // start() played to the first stop
      expect(await cdp.eval(`getComputedStyle(document.querySelector('.movie-controller')).display`)).toBe('none');
      await press(cdp, 'Escape', 'Escape', 27);
      expect(await waitFor(cdp, `!document.querySelector('.movie-presenter')`)).toBe(true);
      expect(await cdp.eval(`getComputedStyle(document.querySelector('.movie-controller')).display`)).not.toBe('none');
    });
  }, 60_000);
  it('the overview (G): one picture per page, made before the talk by start(); a click on a page jumps to it', async () => {
    await withPage('', async (cdp) => {
      await cdp.eval('window.started = presenter.start()');
      expect(await waitFor(cdp, 'movie.currentFrame === 30 && !movie.isPlaying', 120)).toBe(true);          // it prepared the pictures, then played to the first stop
      await press(cdp, 'g', 'KeyG', 71);
      expect(await cdp.eval(`document.querySelector('.mp-overview').getAttribute('data-open')`)).toBe('true');
      const imgs = await cdp.eval(`[...document.querySelectorAll('.mp-cell img')].map(i => i.src.slice(0, 22))`);
      expect(imgs).toEqual(['data:image/jpeg;base64', 'data:image/jpeg;base64', 'data:image/jpeg;base64']);   // already there: nothing is made in front of the audience
      expect(await cdp.eval(`[...document.querySelectorAll('.mp-cell-name')].map(c => c.textContent)`)).toEqual(['A', 'B', 'C']);
      await cdp.eval(`document.querySelectorAll('.mp-cell')[2].click()`);
      expect(await waitFor(cdp, 'movie.currentFrame === 150 && movie.pageIndex === 2')).toBe(true);
      expect(await cdp.eval(`document.querySelector('.mp-overview').getAttribute('data-open')`)).toBe('false');
    });
  }, 90_000);

  it('the presenter view (P): a second window with the page, the notes, the next picture and next / back buttons that drive the talk', async () => {
    await withPage('', async (cdp) => {
      await cdp.eval('window.presenter.ensureThumbs()');
      expect(await waitFor(cdp, `window.presenter.thumbs.size === 4`, 120)).toBe(true);
      await press(cdp, 'p', 'KeyP', 80);
      expect(await waitFor(cdp, `window.__opened.length === 1 && !!window.__opened[0]`)).toBe(true);
      const view = (expr: string) => cdp.eval(`(() => { const d = window.__opened[0].document; return ${expr}; })()`);
      expect(await view(`d.querySelector('.pv-count').textContent`)).toBe('– / 3');
      expect(await view(`d.querySelector('.pv-notes').textContent`)).toBe('Note for page A');
      await press(cdp, 'ArrowRight', 'ArrowRight', 39);
      expect(await waitFor(cdp, 'movie.currentFrame === 30 && !movie.isPlaying')).toBe(true);
      expect(await view(`d.querySelector('.pv-count').textContent`)).toBe('1 / 3');
      expect(await view(`d.querySelector('.pv-title').textContent`)).toBe('A');
      expect(await view(`d.querySelector('.pv-next').src.slice(0, 22)`)).toBe('data:image/jpeg;base64');
      await view(`d.querySelector('.pv-nextbtn').click()`);                                               // the button in the speaker's window moves the talk
      expect(await waitFor(cdp, 'movie.currentFrame === 60 && !movie.isPlaying')).toBe(true);
      expect(await view(`d.querySelector('.pv-count').textContent`)).toBe('1 / 3');
      await view(`d.querySelector('.pv-prev').click()`);
      expect(await waitFor(cdp, 'movie.currentFrame === 30')).toBe(true);
      expect(await cdp.eval(`window.__opened[0].closed`)).toBe(false);
      await press(cdp, 'p', 'KeyP', 80);                                                                   // P again closes it
      expect(await waitFor(cdp, `window.__opened[0].closed === true`)).toBe(true);
    });
  }, 90_000);

  it('exportPDF: one PDF page per page of the deck', async () => {
    await withPage('', async (cdp) => {
      const r = await cdp.eval(`(async () => { const b = await movie.exportPDF({ title: 'check' }); const bytes = new Uint8Array(await b.arrayBuffer()); const s = new TextDecoder('latin1').decode(bytes);
        return { type: b.type, size: b.size, head: s.slice(0, 8), pages: (s.match(/\\/Type \\/Page\\b(?!s)/g) || []).length, frame: movie.currentFrame }; })()`);
      expect(r).toMatchObject({ type: 'application/pdf', head: '%PDF-1.4', pages: 3, frame: 0 });
      expect(r.size).toBeGreaterThan(3000);
    });
  }, 90_000);
  it('with the Controller alone: the play button plays to each stop and stops there, and the marks are easy to see', async () => {
    await withPage('?controller=1', async (cdp) => {
      await cdp.eval(`document.querySelector('.mc-play').click()`);
      expect(await waitFor(cdp, 'movie.currentFrame === 30 && !movie.isPlaying')).toBe(true);          // the first stop (1 s), not the end
      expect(await cdp.eval('movie.stopIndex')).toBe(0);
      await cdp.eval(`document.querySelector('.mc-play').click()`);
      expect(await waitFor(cdp, 'movie.currentFrame === 60 && !movie.isPlaying')).toBe(true);          // the step (2 s)
      await cdp.eval(`document.querySelector('.mc-play').click()`);
      await check.sleep(200);
      await cdp.eval(`document.querySelector('.mc-play').click()`);                                       // while playing toward 3.5 s: pause
      expect(await cdp.eval('movie.isPlaying')).toBe(false);
      const marks = await cdp.eval(`[...document.querySelectorAll('.mc-stop-tick')].map(t => { const r = t.getBoundingClientRect(); return { page: t.classList.contains('mc-stop-page'), w: Math.round(r.width), h: Math.round(r.height) }; })`);
      expect(marks).toHaveLength(4);
      const page = marks.find((m: any) => m.page), step = marks.find((m: any) => !m.page);
      expect(page.h).toBeGreaterThan(step.h);                                                            // a page start is the larger dot
      expect(page.w).toBe(page.h);                                                                       // round
      expect(step.h).toBeGreaterThanOrEqual(6);
    });
  }, 60_000);

  it('with the Controller: the download panel offers PDF, and downloads a real PDF with the deck\'s pages', async () => {
    await withPage('?controller=1', async (cdp) => {
      await cdp.eval(`window.__dl = null; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__dl = { type: b.type, size: b.size, name: null }; window.__blob = b; return make(b); };
        HTMLAnchorElement.prototype.click = function () { if (window.__dl) window.__dl.name = this.download; };`);
      const options = await cdp.eval(`[...document.querySelectorAll('.mc-settings-format option')].map(o => o.value)`);
      expect(options).toEqual(['mp4', 'webm', 'mov', 'pdf', 'pdf-steps']);
      await cdp.eval(`document.querySelector('.mc-export').click(); const f = document.querySelector('.mc-settings-format'); f.value = 'pdf'; f.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.mc-export-confirm').click();`);
      expect(await waitFor(cdp, `window.__dl && window.__dl.name`, 120)).toBe(true);
      const r = await cdp.eval(`(async () => { const s = new TextDecoder('latin1').decode(new Uint8Array(await window.__blob.arrayBuffer())); return { ...window.__dl, head: s.slice(0, 8), pages: (s.match(/\\/Type \\/Page\\b(?!s)/g) || []).length }; })()`);
      expect(r).toMatchObject({ type: 'application/pdf', head: '%PDF-1.4', pages: 3 });
      expect(r.name).toMatch(/\.pdf$/);
    });
  }, 90_000);
});
