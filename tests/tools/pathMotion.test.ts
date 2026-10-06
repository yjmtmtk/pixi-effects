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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('followPath() and path morph, in a real browser', () => {
  it('the dot is on the route at every frame it is checked at, and the square is half way when morph is 0.5', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'pathmotion-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/path-motion.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');

      // bounding box of the pixels that pass `test` in a snapshot of the frame
      const box = (frame: number, test: string) => cdp.eval(`(async () => {
        const url = await movie.snapshot(${frame}, { as: 'dataURL' });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        for (let i = 0; i < d.length; i += 4) { const r = d[i], gr = d[i + 1], b = d[i + 2]; if (${test}) { const p = i / 4, x = p % c.width, y = Math.floor(p / c.width); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
        return x1 < 0 ? null : { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1 };
      })()`);
      const red = 'r > 200 && gr < 60 && b < 60', white = 'r > 200 && gr > 200 && b > 200';

      for (const [frame, x, y] of [[0, 100, 600], [30, 600, 600], [60, 1100, 600], [75, 1100, 350], [90, 1100, 100]] as const) {
        const d = await box(frame, red);
        expect(d.cx, `frame ${frame}`).toBeCloseTo(x, -1);                 // within 5 px
        expect(d.cy, `frame ${frame}`).toBeCloseTo(y, -1);
      }

      const a = await box(0, white);                                       // the square as drawn from `d`
      expect(a.cx).toBeCloseTo(500, -1); expect(a.w).toBeGreaterThan(195); expect(a.w).toBeLessThan(205);
      const mid = await box(30, white);                                    // morph 0.5: 550..750
      expect(mid.cx).toBeCloseTo(650, -1); expect(mid.w).toBeGreaterThan(195); expect(mid.w).toBeLessThan(205);
      const end = await box(60, white);                                    // morph 1: 700..900
      expect(end.cx).toBeCloseTo(800, -1);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
});
