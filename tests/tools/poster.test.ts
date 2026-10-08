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
const built = existsSync(join(root, 'dist/index.js'));
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('movie poster time, in a real browser', () => {
  it('the canvas shows the poster frame while the playhead is at 0, play starts from 0, and posterImage is that picture', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'poster-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/poster.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');

      // where is the white square on the canvas? (the scan runs along y = 360)
      // (read after two animation frames: a WebGL canvas read at a random moment can be blank, the ticker draws it every frame)
      const squareX = `(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const c = document.getElementById('stage'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
        const g = t.getContext('2d'); g.drawImage(c, 0, 0); const row = g.getImageData(0, 360, t.width, 1).data; let first = -1, last = -1;
        for (let x = 0; x < t.width; x++) if (row[x * 4] > 200) { if (first < 0) first = x; last = x; } return first < 0 ? -1 : (first + last) / 2; })()`;

      const info = await cdp.eval('({ poster: movie.poster, posterFrame: movie.posterFrame, frame: movie.currentFrame, playing: movie.isPlaying })');
      expect(info).toEqual({ poster: 3, posterFrame: 90, frame: 0, playing: false });
      expect(Math.abs((await cdp.eval(squareX)) - 850)).toBeLessThan(6);                       // the poster picture: 3 s of 4 -> x = 850

      // the picture is what posterImage returns, and asking for it does not disturb the display
      const imgOk = await cdp.eval(`(async () => { const url = await movie.posterImage({ as: 'dataURL' }); return url.startsWith('data:image/png'); })()`);
      expect(imgOk).toBe(true);
      expect(Math.abs((await cdp.eval(squareX)) - 850)).toBeLessThan(6);
      expect(await cdp.eval('movie.currentFrame')).toBe(0);

      // play starts from the beginning
      await cdp.eval('movie.play()');
      await check.sleep(350);
      const during = await cdp.eval(`(async () => ({ frame: movie.currentFrame, x: await ${squareX} }))()`);
      expect(during.frame).toBeLessThan(25);
      expect(during.x).toBeLessThan(500);                                                      // near the start, not at 850
      await cdp.eval('movie.pause()');
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);

  it('a movie without a poster option shows frame 0 as before', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'poster-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/poster.html?noposter` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval('movie.poster')).toBeNull();
      expect(await cdp.eval('movie.posterFrame')).toBeNull();
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 60_000);
});
