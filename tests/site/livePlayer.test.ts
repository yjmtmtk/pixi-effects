// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error plain ESM script without types
import { launchPage } from '../support/browser';

// The live player of the 1.0 site (site/shared/live.js; docs/superpowers/plans/2026-11-16-site-v1.md, Task 5): a poster first, then the
// piece itself in an iframe, playing live. One at a time; nothing starts by itself under prefers-reduced-motion; a piece that cannot start
// leaves its poster and says so (never an empty box).
const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const PAGE = 'tests/site/fixtures/live.html';

async function withFixture<T>(opts: { reduce?: boolean; width?: number; height?: number }, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'live-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: opts.width ?? 800, height: opts.height ?? 1400, deviceScaleFactor: 1, mobile: false });
    if (opts.reduce) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${PAGE}` });
    await check.sleep(800);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const state = (cdp: any) => cdp.eval(`(() => Object.fromEntries(['hero', 'two', 'tall', 'own', 'broken'].map(id => {
  const f = document.getElementById(id), i = f.querySelector('iframe');
  return [id, { iframe: i ? i.getAttribute('src') : null, live: f.classList.contains('is-live'), ready: f.classList.contains('is-ready'),
    playing: !!(i && i.contentWindow && i.contentWindow.movie && i.contentWindow.movie.isPlaying), note: (f.querySelector('.live-note') || {}).textContent || '',
    poster: !!f.querySelector('img') && getComputedStyle(f.querySelector('img')).display !== 'none' }];
})))()`);

async function until(cdp: any, cond: (s: any) => boolean, ms = 20000): Promise<any> {
  const t0 = Date.now();
  let s = await state(cdp);
  while (!cond(s) && Date.now() - t0 < ms) { await check.sleep(150); s = await state(cdp); }
  return s;
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the live player (site/shared/live.js)', () => {
  it('a click plays the piece live: the poster gives way to an iframe of data-page, and the movie plays', async () => {
    await withFixture({ reduce: true }, async (cdp) => {                         // reduced motion: the hero does not start by itself here
      expect((await state(cdp)).two.iframe).toBe(null);
      await cdp.eval(`document.querySelector('#two .live-play').click()`);
      const s = await until(cdp, (x) => x.two.ready && x.two.playing);
      expect(s.two.iframe).toBe('../../films/animate-text.html');
      expect(s.two.ready).toBe(true);
      expect(s.two.playing).toBe(true);
    });
  }, 60000);

  it('only one plays at a time: starting the second puts the first back to its poster', async () => {
    await withFixture({ reduce: true }, async (cdp) => {
      await cdp.eval(`document.querySelector('#hero .live-play').click()`);
      await until(cdp, (x) => x.hero.ready);
      await cdp.eval(`document.querySelector('#two .live-play').click()`);
      const s = await until(cdp, (x) => x.two.ready);
      expect(s.two.iframe).not.toBe(null);
      expect(s.hero.iframe).toBe(null);
      expect(s.hero.live).toBe(false);
      expect(s.hero.poster).toBe(true);
    });
  }, 60000);

  it('the autoplay one starts by itself when seen; with prefers-reduced-motion it waits for a click', async () => {
    await withFixture({}, async (cdp) => {
      const s = await until(cdp, (x) => x.hero.ready);
      expect(s.hero.iframe).not.toBe(null);
    });
    await withFixture({ reduce: true }, async (cdp) => {
      await check.sleep(2500);
      expect((await state(cdp)).hero.iframe).toBe(null);
    });
  }, 60000);

  it('the picture fills the frame, whatever the page around the canvas does (a vertical page capped at 420px with padding)', async () => {
    await withFixture({ reduce: true }, async (cdp) => {
      await cdp.eval(`document.querySelector('#tall .live-play').click()`);
      await until(cdp, (x) => x.tall.ready);
      const r = await cdp.eval(`(() => { const i = document.querySelector('#tall iframe'), w = i.contentWindow, c = w.document.getElementById('stage').getBoundingClientRect();
        return { fw: i.clientWidth, fh: i.clientHeight, x: c.left, y: c.top, w: c.width, h: c.height }; })()`);
      expect(r.fw).toBeGreaterThan(500);
      expect(Math.abs(r.x)).toBeLessThan(1.5);
      expect(Math.abs(r.y)).toBeLessThan(1.5);
      expect(Math.abs(r.w - r.fw)).toBeLessThan(1.5);
      expect(Math.abs(r.h - r.fh)).toBeLessThan(1.5);
    });
  }, 60000);

  const modal = (cdp: any) => cdp.eval(`(() => { const d = document.querySelector('dialog.live-modal'); const f = d && d.querySelector('figure.live'); const i = f && f.querySelector('iframe');
    return { open: !!(d && d.open), page: i ? i.getAttribute('src') : null, w: f ? f.clientWidth : 0, h: f ? f.clientHeight : 0, ready: !!(f && f.classList.contains('is-ready')),
      title: d ? (d.querySelector('.live-modal-title') || {}).textContent : null, cardIframe: !!document.querySelector('#modal iframe'),
      focus: document.activeElement && document.activeElement.getAttribute('aria-label') }; })()`);

  it('data-modal: a click opens the piece in a window over the page at its own size (1280 x 720 on a big screen), not in the small card', async () => {
    await withFixture({ reduce: true, width: 1600, height: 1000 }, async (cdp) => {
      await cdp.eval(`document.querySelector('#modal .live-play').click()`);
      const t0 = Date.now(); let m = await modal(cdp);
      while (!(m.open && m.ready) && Date.now() - t0 < 20000) { await check.sleep(150); m = await modal(cdp); }
      expect(m.open).toBe(true);
      expect(m.page).toBe('../../films/animate-text.html');
      expect(m.ready).toBe(true);
      expect([m.w, m.h]).toEqual([1280, 720]);
      expect(m.title).toBe('The modal one');
      expect(m.cardIframe).toBe(false);
    });
  }, 60000);

  it('data-modal: on a small screen the window shrinks to fit, keeping the shape; Escape closes it, stops the piece and gives the focus back', async () => {
    await withFixture({ reduce: true }, async (cdp) => {                         // 800 px wide
      await cdp.eval(`document.querySelector('#modal .live-play').focus(); document.querySelector('#modal .live-play').click()`);
      const t0 = Date.now(); let m = await modal(cdp);
      while (!m.open && Date.now() - t0 < 10000) { await check.sleep(100); m = await modal(cdp); }
      expect(m.w).toBeLessThan(800);
      expect(m.w).toBeGreaterThan(700);
      expect(Math.abs(m.w / m.h - 1280 / 720)).toBeLessThan(0.01);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await check.sleep(300);
      m = await modal(cdp);
      expect(m.open).toBe(false);
      expect(m.page).toBe(null);
      expect(m.focus).toBe('Play the modal one');
    });
  }, 60000);

  it('data-modal: a page laid out like the old gallery (.pe-stage, a centring grid) still fills the window: the canvas is the whole frame', async () => {
    await withFixture({ reduce: true, width: 1600, height: 1000 }, async (cdp) => {
      await cdp.eval(`document.querySelector('#pe .live-play').click()`);
      const t0 = Date.now(); let r: any = null;
      while (Date.now() - t0 < 20000) {
        r = await cdp.eval(`(() => { const f = document.querySelector('dialog.live-modal figure.live'); if (!f || !f.classList.contains('is-ready')) return null;
          const c = f.querySelector('iframe').contentWindow.document.getElementById('stage').getBoundingClientRect();
          return { fw: f.clientWidth, fh: f.clientHeight, x: c.left, y: c.top, w: c.width, h: c.height }; })()`);
        if (r) break; await check.sleep(150);
      }
      expect(r).not.toBe(null);
      expect([r.fw, r.fh]).toEqual([1280, 720]);
      expect(Math.abs(r.x) + Math.abs(r.y)).toBeLessThan(1.5);
      expect(Math.abs(r.w - r.fw) + Math.abs(r.h - r.fh)).toBeLessThan(2);
    });
  }, 60000);

  it('data-modal: a tall window (a square piece on a short screen) keeps its close button and its caption on the screen', async () => {
    await withFixture({ reduce: true, width: 1280, height: 800 }, async (cdp) => {
      await cdp.eval(`(() => { const f = document.querySelector('#modal'); f.setAttribute('data-w', '1080'); f.setAttribute('data-h', '1080'); f.querySelector('.live-play').click(); })()`);
      await check.sleep(400);
      const r = await cdp.eval(`(() => { const d = document.querySelector('dialog.live-modal'); const c = d.querySelector('.live-modal-close').getBoundingClientRect(); const b = d.getBoundingClientRect();
        return { closeTop: c.top, closeBottom: c.bottom, boxTop: b.top, boxBottom: b.bottom, vh: innerHeight }; })()`);
      expect(r.closeTop).toBeGreaterThanOrEqual(0);
      expect(r.boxTop).toBeGreaterThanOrEqual(0);
      expect(r.boxBottom).toBeLessThanOrEqual(r.vh);
    });
  }, 60000);

  it('while a piece gets ready, its frame says so (a "Loading" note over the poster); the note goes when it plays, and when it fails', async () => {
    await withFixture({ reduce: true }, async (cdp) => {
      const note = (id: string) => cdp.eval(`(() => { const n = document.querySelector('#${id} .live-loading'); return n ? { text: n.textContent.trim(), shown: getComputedStyle(n).display !== 'none', role: n.getAttribute('role') } : null; })()`);
      await cdp.eval(`document.querySelector('#two .live-play').click()`);
      const early = await note('two');
      expect(early).toEqual({ text: 'Loading', shown: true, role: 'status' });
      await until(cdp, (x) => x.two.ready);
      expect(await note('two')).toBe(null);
      await cdp.eval(`document.querySelector('#broken .live-play').click()`);
      await until(cdp, (x) => x.broken.note !== '', 20000);
      expect(await note('broken')).toBe(null);
    });
  }, 60000);

  it('a piece with the library\'s own loader (.pe-loader) shows it while it gets ready: the frame is seen at once, the site\'s note steps aside', async () => {
    await withFixture({ reduce: true }, async (cdp) => {
      await cdp.eval(`document.querySelector('#own .live-play').click()`);
      const look = () => cdp.eval(`(() => { const f = document.querySelector('#own'), i = f.querySelector('iframe'); const d = i && i.contentDocument;
        const l = d && d.querySelector('.pe-loader');
        return { seen: !!i && getComputedStyle(i).opacity === '1', ready: f.classList.contains('is-ready'), site: !!f.querySelector('.live-loading'),
          own: !!l && !l.classList.contains('pe-loader--done') && d.defaultView.getComputedStyle(l).display !== 'none' }; })()`);
      const t0 = Date.now(); let r = await look();
      while (!(r.seen && r.own) && Date.now() - t0 < 2000) { await check.sleep(50); r = await look(); }
      expect(r).toEqual({ seen: true, ready: false, site: false, own: true });
      await until(cdp, (x) => x.own?.ready ?? false);
    });
  }, 60000);

  it('a piece that cannot start leaves its poster and says so (never an empty box)', async () => {
    await withFixture({ reduce: true }, async (cdp) => {
      await cdp.eval(`document.querySelector('#broken .live-play').click()`);
      const s = await until(cdp, (x) => x.broken.note !== '', 10000);
      expect(s.broken.iframe).toBe(null);
      expect(s.broken.poster).toBe(true);
      expect(s.broken.note).toMatch(/could not play it live/);
    });
  }, 30000);
});
