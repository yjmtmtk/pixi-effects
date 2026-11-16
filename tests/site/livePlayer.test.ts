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

async function withFixture<T>(opts: { reduce?: boolean }, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'live-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1400, deviceScaleFactor: 1, mobile: false });
    if (opts.reduce) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${PAGE}` });
    await check.sleep(800);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const state = (cdp: any) => cdp.eval(`(() => Object.fromEntries(['hero', 'two', 'broken'].map(id => {
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
