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
const built = existsSync(join(root, 'dist/index.js'));

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const userDataDir = mkdtempSync(join(tmpdir(), 'blur-'));
  const { proc, cdp } = await launchPage(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/motion-blur.html${query}` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
    expect(ready).toBe(true);
    expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');
    return await fn(cdp);
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    await check.sleep(200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}

/** the row y = 360 of a snapshot: first / last lit pixel, how many are fully white, how many are in between, and the brightness-weighted centre */
const row = (expr: string) => (cdp: any) => cdp.eval(`(async () => {
  const url = await ${expr};
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 360, c.width, 1).data; let x0 = -1, x1 = -1, full = 0, partial = 0, sum = 0, wsum = 0;
  for (let x = 0; x < c.width; x++) { const v = d[x * 4]; if (v > 8) { if (x0 < 0) x0 = x; x1 = x; } if (v > 245) full++; else if (v > 8) partial++; sum += v; wsum += v * x; }
  return { x0, x1, full, partial, centre: wsum / sum, mass: sum / 255 };
})()`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('motion blur, in a real browser', () => {
  it('a snapshot with motion blur smears a fast square along its path, around the frame time, keeping its brightness', async () => {
    await withPage('', async (cdp) => {
      const sharp = await row(`movie.snapshot(30, { as: 'dataURL' })`)(cdp);
      expect(sharp.partial).toBeLessThanOrEqual(2);                              // no blur of its own
      expect(sharp.x1 - sharp.x0 + 1).toBeGreaterThan(78); expect(sharp.x1 - sharp.x0 + 1).toBeLessThan(82);
      const blur = await row(`movie.snapshot(30, { as: 'dataURL', motionBlur: { samples: 8, shutter: 1 } })`)(cdp);
      const width = blur.x1 - blur.x0 + 1;
      expect(width).toBeGreaterThan(94); expect(width).toBeLessThan(106);        // 80 + the 20 px it moves while the shutter is open
      expect(blur.partial).toBeGreaterThan(14);                                  // soft edges: grey, not just white and black
      expect(blur.full).toBeGreaterThan(50); expect(blur.full).toBeLessThan(66); // the solid core: 80 − 20
      expect(Math.abs(blur.centre - sharp.centre)).toBeLessThan(1.5);            // centred on the frame time
      expect(Math.abs(blur.mass - sharp.mass) / sharp.mass).toBeLessThan(0.03);  // the same amount of light
      expect(await cdp.eval('movie.currentFrame')).toBe(30);                     // and the playhead is on the frame it was asked for
      const after = await row(`movie.snapshot(30, { as: 'dataURL' })`)(cdp);     // the stage is the sharp frame again
      expect(after.partial).toBeLessThanOrEqual(2);
    });
  }, 90_000);

  it('movie.init({ motionBlur }) is the default for snapshot, and a call can turn it off', async () => {
    await withPage('?mb=true', async (cdp) => {
      const byDefault = await row(`movie.snapshot(30, { as: 'dataURL' })`)(cdp);
      expect(byDefault.x1 - byDefault.x0 + 1).toBeGreaterThan(94);
      const off = await row(`movie.snapshot(30, { as: 'dataURL', motionBlur: false })`)(cdp);
      expect(off.x1 - off.x0 + 1).toBeLessThan(82);
      expect(await cdp.eval('JSON.stringify(movie.motionBlur)')).toBe('{"samples":8,"shutter":1}');
    });
  }, 90_000);

  it('contactSheet and render accept it; a render finishes with the stage on the last frame and reports progress', async () => {
    await withPage('', async (cdp) => {
      const sheet = await cdp.eval(`movie.contactSheet({ count: 3, as: 'dataURL', motionBlur: 4 }).then(u => u.startsWith('data:image/png') && u.length)`);
      expect(sheet).toBeGreaterThan(1000);
      const r = await cdp.eval(`(async () => {
        let events = 0; movie.on('progress', () => events++);
        const blob = await movie.render({ format: 'mp4', motionBlur: { samples: 3, shutter: 0.5 } });
        return { size: blob.size, events, frame: movie.currentFrame, total: movie.totalFrames };
      })()`);
      expect(r.size).toBeGreaterThan(2000);
      expect(r.events).toBe(r.total + 1);
      expect(r.frame).toBe(r.total);
    });
  }, 180_000);

  it('a bad setting says which option is wrong', async () => {
    await withPage('', async (cdp) => {
      const msg = await cdp.eval(`movie.snapshot(0, { as: 'dataURL', motionBlur: { samples: 1 } }).then(() => 'ok', e => e.message)`);
      expect(msg).toMatch(/motionBlur samples.*2 to 64/);
    });
  }, 90_000);
});
