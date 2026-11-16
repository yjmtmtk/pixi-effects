// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

// The Lab page in a real browser (plan Task 8): the live pane redraws at the zoomed size, a variable changes the picture, the touchable pieces start.
const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function withLab<T>(fn: (cdp: any) => Promise<T>, opts: { reduce?: boolean } = {}): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'lab-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    if (opts.reduce) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/lab/index.html` });
    await check.sleep(1000);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

/** Wait until the live frame of a block reports ready; returns false on a timeout. */
const readyIn = async (cdp: any, sel: string, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cdp.eval(`(() => { const f = document.querySelector(${JSON.stringify(sel)}); return !!(f && f.contentWindow && f.contentWindow.__ready === true); })()`)) return true;
    await check.sleep(200);
  }
  return false;
};

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the Lab in a real browser', () => {
  it('at zoom 4 the live pane draws its canvas at about 4 times the pixels (the MP4 pane only stretches)', async () => {
    await withLab(async (cdp) => {
      await cdp.eval(`document.getElementById('sharp').scrollIntoView()`);
      expect(await readyIn(cdp, '#sharp iframe')).toBe(true);
      const width = () => cdp.eval(`document.querySelector('#sharp iframe').contentWindow.movie.width`);
      const w1 = await width();
      await cdp.eval(`(() => { const r = document.querySelector('#sharp input[type="range"]'); r.value = '4'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      let w4 = w1;
      for (let i = 0; i < 40 && w4 < w1 * 3.9; i++) { await check.sleep(150); w4 = await width(); }
      expect(w4).toBeGreaterThanOrEqual(w1 * 3.9);
    });
  }, 60000);

  it('typing a title changes the live picture (a variable: setVars)', async () => {
    await withLab(async (cdp) => {
      await cdp.eval(`document.getElementById('live-edit').scrollIntoView()`);
      expect(await readyIn(cdp, '#live-edit iframe')).toBe(true);
      const titleWidth = () => cdp.eval(`(async () => { const m = document.querySelector('#live-edit iframe').contentWindow.movie; const r = await m.inspect(m.currentFrame); const t = r.layers.find(l => l.name === 'title'); return t && t.bounds ? t.bounds.width : 0; })()`);
      const before = await titleWidth();
      expect(before).toBeGreaterThan(0);
      await cdp.eval(`(() => { const i = document.querySelector('#live-edit input[type="text"]'); i.value = 'Hello Lab'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      let title = '';
      for (let i = 0; i < 40 && title !== 'Hello Lab'; i++) {
        await check.sleep(150);
        title = await cdp.eval(`document.querySelector('#live-edit iframe').contentWindow.movie.vars.title`);
      }
      expect(title).toBe('Hello Lab');
      expect(Math.abs((await titleWidth()) - before), 'the title is drawn again, at its new width').toBeGreaterThan(5);
    });
  }, 60000);

  it('each touchable piece starts live on a click and reports ready', async () => {
    await withLab(async (cdp) => {
      const n: number = await cdp.eval(`document.querySelectorAll('#touch figure.live').length`);
      expect(n).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < n; i++) {
        await cdp.eval(`document.querySelectorAll('#touch figure.live .live-play')[${i}].click()`);
        expect(await readyIn(cdp, `#touch figure.live:nth-of-type(${i + 1}) iframe`), `piece ${i}`).toBe(true);
      }
    });
  }, 90000);

  it('the live panes play (the page is a video, not a still frame) beside the playing MP4', async () => {
    await withLab(async (cdp) => {
      await cdp.eval(`document.getElementById('sharp').scrollIntoView()`);
      expect(await readyIn(cdp, '#sharp iframe')).toBe(true);
      let s: any = {};
      for (let i = 0; i < 30 && !(s.page && s.mp4); i++) {
        await check.sleep(150);
        s = await cdp.eval(`({ page: document.querySelector('#sharp iframe').contentWindow.movie.isPlaying, mp4: !document.querySelector('#sharp video').paused })`);
      }
      expect(s).toEqual({ page: true, mp4: true });
    });
  }, 60000);

  it('with prefers-reduced-motion nothing plays by itself, and one button plays and pauses both panes', async () => {
    await withLab(async (cdp) => {
      await cdp.eval(`document.getElementById('sharp').scrollIntoView()`);
      expect(await readyIn(cdp, '#sharp iframe')).toBe(true);
      await check.sleep(800);
      const still = await cdp.eval(`({ page: document.querySelector('#sharp iframe').contentWindow.movie.isPlaying, mp4: !document.querySelector('#sharp video').paused })`);
      expect(still).toEqual({ page: false, mp4: false });
      await cdp.eval(`document.querySelector('#sharp [data-play-panes]').click()`);
      let s: any = {};
      for (let i = 0; i < 30 && !(s.page && s.mp4); i++) {
        await check.sleep(150);
        s = await cdp.eval(`({ page: document.querySelector('#sharp iframe').contentWindow.movie.isPlaying, mp4: !document.querySelector('#sharp video').paused })`);
      }
      expect(s).toEqual({ page: true, mp4: true });
      await cdp.eval(`document.querySelector('#sharp [data-play-panes]').click()`);
      await check.sleep(400);
      expect(await cdp.eval(`({ page: document.querySelector('#sharp iframe').contentWindow.movie.isPlaying, mp4: !document.querySelector('#sharp video').paused })`)).toEqual({ page: false, mp4: false });
    }, { reduce: true });
  }, 60000);

  it('a pane that cannot start keeps its poster and says so (never an empty box), and stops trying', async () => {
    await withLab(async (cdp) => {
      await cdp.eval(`(() => { const f = document.querySelector('#live-edit iframe'); f.src = '../tests/site/fixtures/broken.html'; })()`);
      let note = '';
      for (let i = 0; i < 60 && !note; i++) { await check.sleep(200); note = await cdp.eval(`(document.querySelector('#live-edit .live-note') || {}).textContent || ''`); }
      expect(note).toMatch(/could not play it live/);
      expect(await cdp.eval(`getComputedStyle(document.querySelector('#live-edit img')).display !== 'none'`)).toBe(true);
    });
  }, 30000);
});
