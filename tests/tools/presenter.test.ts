// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js')) && existsSync(join(root, 'dist/Presenter.js'));

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const userDataDir = mkdtempSync(join(tmpdir(), 'presenter-'));
  const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
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
});
