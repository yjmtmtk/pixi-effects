// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
// the hero loads the released library from the CDN: just before a release the pinned version is not published yet
const onCdn = await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${version}/dist/index.js`, { method: 'HEAD' }).then((r) => r.ok, () => false);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the landing page in a real browser', () => {
  it('a click on "A real piece, live" loads the gallery piece AND plays it (same origin, as on the published site); the hero plays its own snippet', async () => {
    const { server, port } = await check.serve(root);                       // the repository root: /index.html and /examples/gallery/…
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__GALLERY_BASE = '/examples/gallery/';` });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
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
      // and it is SEEN: the poster that stood in for the piece no longer covers it (it used to stay on top, with the piece playing behind it)
      const poster = await cdp.eval(`(() => { const i = document.querySelector('#kmFacade img'); return !i || !i.isConnected || getComputedStyle(i).display === 'none' || getComputedStyle(i).visibility === 'hidden' ? 'gone' : 'covering'; })()`);
      expect(poster).toBe('gone');

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

  it('loading the reel says how far it is (the stage and a percentage, a bar) and the page does not freeze while it loads', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__beat = []; let last = performance.now(); setInterval(() => { const n = performance.now(); window.__beat.push(n - last); last = n; }, 50);` });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
      await check.sleep(1500);
      await cdp.eval(`window.__beat.length = 0; document.getElementById('reelBtn').click()`);
      const labels = new Set<string>();
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await check.sleep(100);
        const t = await cdp.eval(`(document.querySelector('#reelFacade .ld span') || {}).textContent || ''`).catch(() => '');
        if (t) labels.add(t);
        ready = await cdp.eval(`!document.querySelector('#reelFacade .ld')`).catch(() => false);
      }
      expect(ready, [...labels].join(' | ')).toBe(true);
      expect([...labels].some((t) => /\d+ %/.test(t)), [...labels].join(' | ')).toBe(true);         // it said a number
      const worst = await cdp.eval(`Math.max(...window.__beat)`);
      expect(worst, 'the longest gap of the page while the reel loaded, in ms').toBeLessThan(1000);   // it was 4400 ms: the sound was made in one piece
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);

  it('the two films next to the reel play from a click: the page behind the poster loads, draws its first frame and logs no warning', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
      await check.sleep(1500);
      for (const [btn, facade, page] of [['inkBtn', 'inkFacade', 'ink-and-paper'], ['lightBtn', 'lightFacade', 'light-as-material']]) {
        await cdp.eval(`document.getElementById('${btn}').click()`);
        let ready = false;
        for (let i = 0; i < 400 && !ready; i++) {
          await check.sleep(100);
          ready = await cdp.eval(`!!document.querySelector('#${facade} iframe') && !document.querySelector('#${facade} .ld')`).catch(() => false);
        }
        expect(ready, `${page} loaded in its frame`).toBe(true);
        expect(await cdp.eval(`document.querySelector('#${facade} iframe').src`)).toContain(`examples/films/${page}.html`);
        expect(await cdp.eval(`document.querySelector('#${facade} iframe').contentWindow.__ready === true`), `${page} is ready`).toBe(true);
        expect(await cdp.eval(`JSON.stringify(document.querySelector('#${facade} iframe').contentWindow.__logs)`), `${page} logged nothing`).toBe('[]');
      }
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 180_000);

  it('fullscreen inside the film frame: the bar is zoomed to make up for the small frame, and that zoom goes away in fullscreen (the frame is not small any more) and comes back after', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });     // a narrow window: the frame is drawn smaller than its page
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
      await check.sleep(1500);
      await cdp.eval(`document.getElementById('inkBtn').click()`);
      let ready = false;
      for (let i = 0; i < 400 && !ready; i++) {
        await check.sleep(100);
        ready = await cdp.eval(`!!document.querySelector('#inkFacade iframe') && !document.querySelector('#inkFacade .ld')`).catch(() => false);
      }
      expect(ready, 'the film loaded in its frame').toBe(true);
      const zoom = () => cdp.eval(`(() => { const d = document.querySelector('#inkFacade iframe').contentDocument; const e = d.querySelector('.movie-controller > *'); return e ? Number(getComputedStyle(e).zoom) : null; })()`);
      const frameScale = () => cdp.eval(`(() => { const f = document.querySelector('#inkFacade iframe'); return f.getBoundingClientRect().width / f.offsetWidth; })()`);
      const before = await zoom();
      expect(await frameScale(), 'the frame is drawn smaller than its page').toBeLessThan(0.9);
      expect(before, 'so the bar is zoomed up').toBeGreaterThan(1.05);
      await cdp.eval(`document.getElementById('inkFacade').scrollIntoView({ block: 'center' })`);
      await check.sleep(500);
      // a real click (a user gesture) on the frame's own fullscreen button; the frame's page is drawn scaled, so the point is mapped to the top window
      const at: any = await cdp.eval(`(() => { const f = document.querySelector('#inkFacade iframe'); const d = f.contentDocument; const b = d.querySelector('.mc-fullscreen'); const r = b.getBoundingClientRect(), fr = f.getBoundingClientRect(), k = fr.width / f.offsetWidth; return { x: fr.left + (r.left + r.width / 2) * k, y: fr.top + (r.top + r.height / 2) * k }; })()`);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
      let inFs = false;
      for (let i = 0; i < 30 && !inFs; i++) { await check.sleep(200); inFs = await cdp.eval(`!!document.fullscreenElement`); }
      expect(inFs, 'the frame went fullscreen').toBe(true);
      await check.sleep(600);
      expect(await zoom(), 'in fullscreen the bar is at its own size').toBe(1);
      await cdp.eval(`document.exitFullscreen()`);
      for (let i = 0; i < 30 && inFs; i++) { await check.sleep(200); inFs = await cdp.eval(`!!document.fullscreenElement`); }
      await check.sleep(600);
      expect(await zoom(), 'after fullscreen the bar is zoomed for the small frame again').toBeGreaterThan(1.05);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 180_000);

  it('a poster in the gallery strip opens THAT piece in a player and plays it on the click; its link goes to that piece in the gallery; closing stops it', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'landing-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__GALLERY_BASE = '/examples/gallery/';` });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
      await check.sleep(1500);
      // every tile links to its own piece (the fallback without JavaScript, and what "open in a new tab" does)
      const links = await cdp.eval(`[...document.querySelectorAll('a.piece')].map(a => [a.querySelector('img').getAttribute('src').split('/').pop().replace('.jpg', ''), a.getAttribute('href')])`);
      expect(links.length).toBe(15);
      for (const [id, href] of links) expect(href, id).toBe(`examples/gallery/#${id}`);
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
      expect(state?.open_link).toBe('examples/gallery/#synthwave-drive');
      // the frame shows the piece's picture and nothing else: no scrollbars in the frame, the canvas fills it exactly
      const fit = await cdp.eval(`(() => { const f = document.querySelector('#player iframe'); const d = f.contentDocument; const c = d.querySelector('canvas'); const fr = document.getElementById('pframe').getBoundingClientRect(); const cr = c.getBoundingClientRect(), ir = f.getBoundingClientRect(), k = ir.width / f.clientWidth;      // the page is scaled to fit
        return { scrollsY: d.documentElement.scrollHeight > d.documentElement.clientHeight + 1, scrollsX: d.documentElement.scrollWidth > d.documentElement.clientWidth + 1,
                 dLeft: Math.round(ir.left + cr.left * k - fr.left), dTop: Math.round(ir.top + cr.top * k - fr.top), dW: Math.round(cr.width * k - fr.width), dH: Math.round(cr.height * k - fr.height) }; })()`);
      expect(fit.scrollsY).toBe(false);
      expect(fit.scrollsX).toBe(false);
      expect([fit.dLeft, fit.dTop, fit.dW, fit.dH].map(Math.abs).every(v => v <= 1), JSON.stringify(fit)).toBe(true);
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
