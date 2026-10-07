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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the landing page in a real browser', () => {
  it('a click on "A real piece, live" loads the gallery piece AND plays it (same origin, as on the published site); the hero plays its own snippet', async () => {
    const { server, port } = await check.serve(root);                       // the repository root: /site/landing/index.html and /examples/gallery/…
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__GALLERY_BASE = '/examples/gallery/';` });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/site/landing/index.html` });
      await check.sleep(1500);
      expect(await cdp.eval(`!!document.getElementById('kmBtn')`)).toBe(true);
      await cdp.eval(`document.getElementById('kmBtn').click()`);
      let state: any = null;
      for (let i = 0; i < 120; i++) {
        await check.sleep(500);
        state = await cdp.eval(`(() => { const f = document.querySelector('#kmFacade iframe'); const w = f && f.contentWindow; return w && w.movie ? { ready: w.__ready === true, playing: w.movie.isPlaying, frame: w.movie.currentFrame } : { ready: false }; })()`).catch(() => null);
        if (state?.playing) break;
      }
      expect(state?.ready).toBe(true);
      expect(state?.playing).toBe(true);                                      // it plays: no second click in the frame
      await check.sleep(800);
      const later = await cdp.eval(`document.querySelector('#kmFacade iframe').contentWindow.movie.currentFrame`);
      expect(later).toBeGreaterThan(state.frame);                              // and it is moving

      // the hero: this exact snippet, running live after a click
      await cdp.eval(`document.getElementById('playBtn').click()`);
      let hero: any = null;
      for (let i = 0; i < 120; i++) {
        await check.sleep(500);
        hero = await cdp.eval(`window.heroMovie ? { playing: window.heroMovie.isPlaying, frame: window.heroMovie.currentFrame } : null`).catch(() => null);
        if (hero?.playing) break;
      }
      expect(hero?.playing).toBe(true);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);
});
