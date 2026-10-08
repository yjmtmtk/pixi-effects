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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('animateText(), in a real browser', () => {
  it('the pieces, once arrived, read exactly like the whole text; while arriving only some are there', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'animtext-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/animate-text.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');

      // lit pixels in the top band (the whole text, y 100..230) and the bottom band (the pieces, y 400..530), and how many differ
      const bands = (frame: number) => cdp.eval(`(async () => {
        const url = await movie.snapshot(${frame}, { as: 'dataURL' });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width;
        let topLit = 0, botLit = 0, differ = 0;
        const box = () => ({ x0: 1e9, x1: -1, y0: 1e9 }), topBox = box(), botBox = box();
        for (let y = 0; y < 150; y++) for (let x = 0; x < W; x++) {
          const a = d[((100 + y) * W + x) * 4], b = d[((400 + y) * W + x) * 4];
          if (a > 128) { topLit++; topBox.x0 = Math.min(topBox.x0, x); topBox.x1 = Math.max(topBox.x1, x); topBox.y0 = Math.min(topBox.y0, 100 + y); }
          if (b > 128) { botLit++; botBox.x0 = Math.min(botBox.x0, x); botBox.x1 = Math.max(botBox.x1, x); botBox.y0 = Math.min(botBox.y0, 400 + y); }
          if (Math.abs(a - b) > 96) differ++;
        }
        return { topLit, botLit, differ, topBox, botBox };
      })()`);

      const done = await bands(90);                                  // 3 s: every piece has arrived
      expect(done.topLit).toBeGreaterThan(2000);
      // the same picture: a letter stroke is ~12 px wide, so a 1 px shift would differ by ~17 %; half-pixel anti-aliasing is ~6 %
      expect(done.differ / done.topLit).toBeLessThan(0.12);
      for (const k of ['x0', 'x1'] as const) expect(Math.abs(done.topBox[k] - done.botBox[k])).toBeLessThanOrEqual(2);
      expect(Math.abs(done.botBox.y0 - done.topBox.y0 - 300)).toBeLessThanOrEqual(2);
      const early = await bands(8);                                  // 0.27 s: only the first letters have started
      expect(early.botLit).toBeLessThan(done.botLit * 0.5);
      expect(early.topLit).toBeGreaterThan(2000);                    // (the whole text is there from the start)
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
});
