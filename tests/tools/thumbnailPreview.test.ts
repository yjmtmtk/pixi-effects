// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/Controller.js'));
const run = describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS);

async function withPage(query: string, fn: (cdp: any) => Promise<void>): Promise<void> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'thumbpreview-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/thumbnail.html${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

/** A real mouse move to a point of the seek bar (0 = its left end, 1 = its right end), then wait for the preview to be drawn. */
async function hover(cdp: any, fraction: number): Promise<void> {
  const at = await cdp.eval(`(() => { const r = document.querySelector('.mc-progress').getBoundingClientRect(); return { x: r.left + 12 + (r.width - 24) * ${fraction}, y: r.top + r.height / 2 }; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 3, y: at.y - 40 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await check.sleep(400);
}

run('the seek-bar preview of the player bar (thumbnails: true), in a real browser', () => {
  it('is not there unless asked for: no element, nothing drawn when the pointer moves over the bar', async () => {
    await withPage('?ui=0', async (cdp) => {
      await hover(cdp, 0.5);
      expect(await cdp.eval(`document.querySelectorAll('.mc-preview').length`)).toBe(0);
    });
  }, 120_000);

  it('shows the picture of the frame under the pointer and its time, the same picture movie.thumbnail() makes, and leaves the playhead and the canvas alone', async () => {
    await withPage('?ui=1', async (cdp) => {
      await cdp.eval(`window.movie.gotoFrame(20, true)`); await check.sleep(300);
      const before = await cdp.eval(`(() => { const m = window.movie; const c = document.createElement('canvas'); c.width = 160; c.height = 90; c.getContext('2d').drawImage(m.app.canvas, 0, 0, 160, 90); return Array.from(c.getContext('2d').getImageData(0, 0, 160, 90).data); })()`);
      await hover(cdp, 0.75);
      const r = await cdp.eval(`(() => { const p = document.querySelector('.mc-preview'); const c = p && p.querySelector('canvas'); const t = p && p.querySelector('.mc-preview-time'); const rootRect = document.querySelector('.movie-controller').getBoundingClientRect(), pr = p.getBoundingClientRect();
        return { shown: p.getAttribute('data-show'), w: c.width, h: c.height, time: t.textContent, insideRoot: pr.left >= rootRect.left - 0.5 && pr.right <= rootRect.right + 0.5, frame: window.movie.currentFrame }; })()`);
      expect(r.shown).toBe('1');
      expect(r.w).toBeGreaterThan(100);
      expect(r.h).toBeGreaterThan(50);
      expect(r.time).toMatch(/^0:0[2-3]$/);                                 // 75 % of a 4 s movie
      expect(r.insideRoot).toBe(true);
      expect(r.frame).toBe(20);
      const after = await cdp.eval(`(() => { const m = window.movie; const c = document.createElement('canvas'); c.width = 160; c.height = 90; c.getContext('2d').drawImage(m.app.canvas, 0, 0, 160, 90); return Array.from(c.getContext('2d').getImageData(0, 0, 160, 90).data); })()`);
      let changed = 0; for (let i = 0; i < before.length; i += 4) if (Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2])) > 8) changed++;
      expect(changed, 'the picture on the canvas changed').toBe(0);
      // the preview is the thumbnail of the frame under the pointer (the bar's own bucket: within a few frames), not an empty canvas
      const filled = await cdp.eval(`(() => { const c = document.querySelector('.mc-preview canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++; return n / (d.length / 4); })()`);
      expect(filled).toBeGreaterThan(0.5);
    });
  }, 120_000);

  it('stays inside the bar at both ends and goes away when the pointer leaves', async () => {
    await withPage('?ui=1', async (cdp) => {
      for (const fraction of [0.0, 1.0]) {
        await hover(cdp, fraction);
        const inside = await cdp.eval(`(() => { const rootRect = document.querySelector('.movie-controller').getBoundingClientRect(), pr = document.querySelector('.mc-preview').getBoundingClientRect(); return pr.left >= rootRect.left - 0.5 && pr.right <= rootRect.right + 0.5; })()`);
        expect(inside, `at ${fraction}`).toBe(true);
      }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await check.sleep(300);
      expect(await cdp.eval(`document.querySelector('.mc-preview').getAttribute('data-show')`)).not.toBe('1');
    });
  }, 120_000);

  it('stays inside the bar when a page zooms the bar\'s children (the landing page does, for small embedded films)', async () => {
    await withPage('?ui=1', async (cdp) => {
      await cdp.eval(`(() => { const st = document.createElement('style'); st.textContent = '.movie-controller > * { zoom: 2; }'; document.head.appendChild(st); })()`);
      for (const fraction of [0.0, 0.5, 1.0]) {
        await hover(cdp, fraction);
        const inside = await cdp.eval(`(() => { const rootRect = document.querySelector('.movie-controller').getBoundingClientRect(), pr = document.querySelector('.mc-preview').getBoundingClientRect(); return pr.left >= rootRect.left - 1 && pr.right <= rootRect.right + 1; })()`);
        expect(inside, `at ${fraction}`).toBe(true);
      }
    });
  }, 120_000);

  it('does not keep asking when a picture can never be made (thumbnail() throws)', async () => {
    await withPage('?ui=1', async (cdp) => {
      await cdp.eval(`window.__calls = 0; window.movie.thumbnail = async () => { window.__calls++; throw new Error('never'); };`);
      await hover(cdp, 0.5);
      await check.sleep(1200);
      expect(await cdp.eval(`window.__calls`), 'thumbnail() was asked again and again').toBeLessThanOrEqual(2);
      expect(await cdp.eval(`document.querySelector('.mc-preview').getAttribute('data-show')`)).not.toBe('1');
    });
  }, 120_000);

  it('is off by itself for a movie with variables: no preview even with thumbnails: true', async () => {
    await withPage('?ui=1&vars=1', async (cdp) => {
      await hover(cdp, 0.5);
      expect(await cdp.eval(`(document.querySelector('.mc-preview') || { getAttribute: () => null }).getAttribute('data-show')`)).not.toBe('1');
      expect(await cdp.eval(`window.movie.thumbnailsOff`)).toBe('variables');
    });
  }, 120_000);

  it('destroy() takes the preview away with the bar', async () => {
    await withPage('?ui=1', async (cdp) => {
      await cdp.eval(`window.controller.destroy()`);
      expect(await cdp.eval(`document.querySelectorAll('.mc-preview').length`)).toBe(0);
    });
  }, 120_000);
});
