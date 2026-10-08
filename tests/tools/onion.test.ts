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

/** The onion image drawn back into a canvas; `at(x, y)` is the brightness (0-255) there. */
const READ = (opts: object) => `(async () => {
  const url = await movie.onionSkin(Object.assign({ as: 'dataURL' }, ${JSON.stringify(opts)}));
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const at = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return Math.round((d[0] + d[1] + d[2]) / 3); };
  return { width: img.width, height: img.height, bg: at(20, 20), centres: [160, 400, 640, 880, 1120].map(x => at(x, 360)), between: at(280, 360) };
})()`;

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('movie.onionSkin(), in a real browser', () => {
  it('shows the square at every sampled place, stronger the later it is; the still background stays itself', async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'onion-'));
    const { proc, cdp } = await check.launchChrome(chrome, dir);
    try {
      await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/onion.html` });
      for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
      expect(await cdp.eval('window.__ready === true')).toBe(true);

      const r = await cdp.eval(READ({ from: 0, to: 2, count: 5 }));
      expect([r.width, r.height]).toEqual([1280, 720]);
      expect(r.bg).toBeLessThanOrEqual(3);                                              // the background is not smeared
      for (const c of r.centres) expect(c).toBeGreaterThan(10);                         // the square is at all five places
      for (let i = 1; i < r.centres.length; i++) expect(r.centres[i]).toBeGreaterThan(r.centres[i - 1]);   // and the later, the stronger
      expect(r.between).toBeLessThan(r.centres[1]);                                     // between two places it is darker

      const one = await cdp.eval(READ({ from: 0, to: 2, count: 1 }));
      expect(one.centres[0]).toBeGreaterThan(200);                                      // one frame: the square itself, at its place at 0 s
      expect(one.centres[1]).toBeLessThanOrEqual(3);

      const half = await cdp.eval(READ({ scale: 0.5, count: 3 }));
      expect([half.width, half.height]).toEqual([640, 360]);

      const err = (opts: object) => cdp.eval(`movie.onionSkin(${JSON.stringify(opts)}).then(() => 'ok', e => e.message)`);
      expect(await err({ count: 100 })).toMatch(/count must be a whole number from 1 to 64/);
      expect(await err({ from: 2, to: 1 })).toMatch(/from must be before to/);
      expect(await err({ scale: 0 })).toMatch(/scale must be above 0 and at most 4/);
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
  }, 180000);
});
