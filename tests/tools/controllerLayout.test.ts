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
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/controller-wrap.html` });
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

  it('a browser without element fullscreen (iPhone Safari) shows no fullscreen button; a desktop browser does', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'ctl-fs-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      const open = async (without: boolean) => {
        await cdp.send('Page.navigate', { url: 'about:blank' });
        if (without) {
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;' });
          await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
        }
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/gallery/blueprint-house.html?fs=${without ? 'no' : 'yes'}` });
        let ready = false;
        for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
        expect(ready).toBe(true);
        return cdp.eval("document.querySelectorAll('.mc-fullscreen').length");
      };
      expect(await open(false)).toBe(1);
      expect(await open(true)).toBe(0);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);

  it('the bar is blue by default and takes its colour and thickness from --mc-accent / --mc-track-height set in the page CSS', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'ctl-theme-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/gallery/blueprint-house.html?theme=1` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      const read = () => cdp.eval(`(() => { const f = document.querySelector('.mc-progress-fill'), t = document.querySelector('.mc-progress-thumb'); const c = getComputedStyle(f); return { fill: c.backgroundColor, height: c.height, thumb: getComputedStyle(t).backgroundColor }; })()`);
      const before = await read();
      expect(before.fill).toBe('rgb(0, 122, 255)');                                // #007AFF
      expect(before.height).toBe('3px');
      await cdp.eval(`document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ':root { --mc-accent: rgb(255, 0, 128); --mc-track-height: 8px; }' })), 0`);
      await check.sleep(350);                                                  // the thickness animates (120 ms)
      const after = await read();
      expect(after.fill).toBe('rgb(255, 0, 128)');
      expect(after.thumb).toBe('rgb(255, 0, 128)');
      expect(after.height).toBe('8px');
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
  it('a real click on the picture plays and pauses it; a click on the bar button is still one toggle', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'ctl-click-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/gallery/blueprint-house.html` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      const click = async (x: number, y: number) => {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await check.sleep(150);
      };
      const centreOf = (sel: string) => cdp.eval(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

      const c = await centreOf('#stage');
      expect(await cdp.eval('movie.isPlaying')).toBe(false);
      await click(c.x, c.y);                                                   // the middle of the picture
      expect(await cdp.eval('movie.isPlaying')).toBe(true);
      await click(c.x, c.y);
      expect(await cdp.eval('movie.isPlaying')).toBe(false);

      const b = await centreOf('.mc-play');                                    // the bar's own button: one click, one toggle
      await click(b.x, b.y);
      expect(await cdp.eval('movie.isPlaying')).toBe(true);
      await click(b.x, b.y);
      expect(await cdp.eval('movie.isPlaying')).toBe(false);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 60_000);
});
