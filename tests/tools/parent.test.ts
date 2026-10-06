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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('null layers and parent, in a real browser', () => {
  it('a child rides its null layer: it turns with it, scales with it, and a chain of nulls adds up', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'parent-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/parent.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');

      // centre of the pixels whose colour passes `test`, in a snapshot of the frame
      const centre = (frame: number, test: string) => cdp.eval(`(async () => {
        const url = await movie.snapshot(${frame}, { as: 'dataURL' });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const r = d[i], gr = d[i + 1], b = d[i + 2]; if (${test}) { const p = i / 4; sx += p % c.width; sy += Math.floor(p / c.width); n++; } }
        return n ? [sx / n, sy / n, n] : null; })()`);
      const white = 'r > 200 && gr > 200 && b > 200', red = 'r > 200 && gr < 60 && b < 60';

      const w0 = await centre(0, white);                       // 0 s: (840, 360)
      expect(w0[0]).toBeCloseTo(840, -1); expect(w0[1]).toBeCloseTo(360, -1);
      const w2 = await centre(60, white);                      // 2 s, turned 90 degrees: (640, 560)
      expect(w2[0]).toBeCloseTo(640, -1); expect(w2[1]).toBeCloseTo(560, -1);

      // the red tip: 100 px up from the null's origin at 0 s; the whole rig has turned 90 deg at 2 s (up -> right); the arm has not scaled yet
      const r0 = await centre(0, red);
      expect(r0[0]).toBeCloseTo(640, -1); expect(r0[1]).toBeCloseTo(260, -1);
      const r2 = await centre(60, red);
      expect(r2[0]).toBeCloseTo(740, -1); expect(r2[1]).toBeCloseTo(360, -1);
      // at 3 s the arm has scaled to 2: the tip is 200 px out
      const r3 = await centre(90, red);
      expect(r3[0]).toBeCloseTo(840 + 0, -1); expect(r3[1]).toBeCloseTo(360, -1);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
});
