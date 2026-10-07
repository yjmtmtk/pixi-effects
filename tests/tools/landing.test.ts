// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
// the hero loads the released library from the CDN: just before a release the pinned version is not published yet
const onCdn = await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${version}/dist/index.js`, { method: 'HEAD' }).then((r) => r.ok, () => false);
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

      // the hero: this exact snippet, running live after a click (needs the released library on the CDN)
      if (onCdn) {
        await cdp.eval(`document.getElementById('playBtn').click()`);
        let hero: any = null;
        for (let i = 0; i < 120; i++) {
          await check.sleep(500);
          hero = await cdp.eval(`window.heroMovie ? { playing: window.heroMovie.isPlaying, frame: window.heroMovie.currentFrame } : null`).catch(() => null);
          if (hero?.playing) break;
        }
        expect(hero?.playing).toBe(true);
      }
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);

  it('a poster in the gallery strip opens THAT piece in a player and plays it on the click; its link goes to that piece in the gallery; closing stops it', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__GALLERY_BASE = '/examples/gallery/';` });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/site/landing/index.html` });
      await check.sleep(1500);
      // every tile links to its own piece (the fallback without JavaScript, and what "open in a new tab" does)
      const links = await cdp.eval(`[...document.querySelectorAll('a.piece')].map(a => [a.querySelector('img').getAttribute('src').split('/').pop().replace('.jpg', ''), a.getAttribute('href')])`);
      expect(links.length).toBe(16);
      for (const [id, href] of links) expect(href, id).toBe(`https://yjmtmtk.github.io/pixi-effects/examples/gallery/#${id}`);
      await cdp.eval(`document.querySelector('a.piece[data-piece="synthwave-drive"]').click()`);
      let state: any = null;
      for (let i = 0; i < 120; i++) {
        await check.sleep(500);
        state = await cdp.eval(`(() => { const d = document.getElementById('player'); const f = d && d.querySelector('iframe'); const w = f && f.contentWindow; return { open: !!(d && d.open), src: f ? f.getAttribute('src') : null, playing: !!(w && w.movie && w.movie.isPlaying), title: document.getElementById('ptitle').textContent, open_link: document.getElementById('popen').getAttribute('href') }; })()`).catch(() => null);
        if (state?.playing) break;
      }
      expect(state?.open).toBe(true);
      expect(state?.src).toBe('/examples/gallery/synthwave-drive.html');
      expect(state?.playing).toBe(true);
      expect(state?.title).toContain('Synthwave');
      expect(state?.open_link).toBe('https://yjmtmtk.github.io/pixi-effects/examples/gallery/#synthwave-drive');
      await cdp.eval(`document.getElementById('pclose').click()`);
      await check.sleep(300);
      expect(await cdp.eval(`({ open: document.getElementById('player').open, frames: document.querySelectorAll('#player iframe').length })`)).toEqual({ open: false, frames: 0 });
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);
});
