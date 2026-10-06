// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js')) && existsSync(join(root, 'dist/Controller.js'));
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('Controller — the player wraps the canvas without moving it, in a real browser', () => {
  it('a canvas sized "min(960px, 100%)" in a window wider than its attribute width: the wrapper is exactly as wide as the canvas and the canvas stays centred', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'ctl-layout-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/gallery/blueprint-house.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      const m = await cdp.eval(`(() => {
        const c = document.getElementById('stage'), w = c.parentElement;
        const r = e => e.getBoundingClientRect();
        return { wrapClass: w.className, canvasW: r(c).width, wrapW: r(w).width, canvasLeft: r(c).left, vw: innerWidth };
      })()`);
      expect(m.wrapClass).toContain('movie-controller-wrap');
      expect(m.canvasW).toBeCloseTo(960, 0);
      expect(m.wrapW).toBeCloseTo(m.canvasW, 0);                              // not 1280: no empty strip next to the picture
      expect(m.canvasLeft + m.canvasW / 2).toBeCloseTo(m.vw / 2, 0);          // the picture is in the middle of the window

      // and it follows the window when it gets smaller, and grows back
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
      await check.sleep(400);
      const small = await cdp.eval(`(() => { const c = document.getElementById('stage'), w = c.parentElement; return { c: c.getBoundingClientRect().width, w: w.getBoundingClientRect().width, vw: innerWidth }; })()`);
      expect(small.c).toBeLessThanOrEqual(small.vw);
      expect(small.w).toBeCloseTo(small.c, 0);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      await check.sleep(400);
      const big = await cdp.eval(`(() => { const c = document.getElementById('stage'), w = c.parentElement; return { c: c.getBoundingClientRect().width, w: w.getBoundingClientRect().width }; })()`);
      expect(big.c).toBeCloseTo(960, 0);
      expect(big.w).toBeCloseTo(big.c, 0);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 60_000);
});
