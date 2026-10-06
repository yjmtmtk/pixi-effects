// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the last frame, in a real browser', () => {
  it('a layer that lasts to the end of the movie is still drawn in the very last frame (it used to be an empty frame)', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'lastframe-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      // the poster page: a white square crosses the canvas from x = 100 (0 s) to x = 1100 (4 s) and lives for the whole 4 s
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/poster.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      const centre = (frame: string) => cdp.eval(`(async () => {
        const url = await movie.snapshot(${frame}, { as: 'dataURL' });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let sx = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 128) { sx += (i / 4) % c.width; n++; }
        return n ? sx / n : null; })()`);
      const before = await centre('movie.totalFrames - 1');
      const last = await centre('movie.totalFrames');
      expect(before).not.toBeNull();
      expect(last).not.toBeNull();                                         // the final frame is not empty
      expect(last as number).toBeCloseTo(1100, -1);                        // and the square is at its end position
      // with motion blur too
      const blurred = await cdp.eval(`(async () => { const u = await movie.snapshot(movie.totalFrames, { as: 'dataURL', motionBlur: 4 }); return u.length; })()`);
      expect(blurred).toBeGreaterThan(1000);
      const lit = await cdp.eval(`(async () => {
        const url = await movie.snapshot(movie.totalFrames, { as: 'dataURL', motionBlur: { samples: 4, shutter: 1 } });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 360, c.width, 1).data; let m = 0;
        for (let x = 0; x < c.width; x++) m = Math.max(m, d[x * 4]);
        return m; })()`);
      expect(lit).toBeGreaterThan(200);                                    // not half-faded: no sample of the last frame falls after the end
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
});
