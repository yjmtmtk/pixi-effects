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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('a 3D card whose children are animated, after a seek', () => {
  it('shows the state of the frame that was asked for after ONE seek (jump forward, back, and the same frame again), as playing forward does', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'card-seek-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/card-seek.html` });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i++) { await check.sleep(250); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      const r = await cdp.eval(`(async () => {
        const count = () => { const c = document.getElementById('stage'); const t = document.createElement('canvas'); t.width = c.width / 2; t.height = c.height / 2; const g = t.getContext('2d'); g.drawImage(c, 0, 0, t.width, t.height); const d = g.getImageData(0, 0, t.width, t.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 128) n++; return n; };
        const seekOnce = async (f) => { await movie.gotoFrame(f, true); return count(); };
        const pixels = {};
        for (const f of [0, 60, 30, 45, 45, 15, 0, 60, 60, 20]) pixels[f + '@' + Object.keys(pixels).length] = await seekOnce(f);
        // what a frame looks like when the movie arrives there in order (the reference)
        const reference = {};
        for (const f of [0, 15, 20, 30, 45, 60]) { for (let k = Math.max(0, f - 2); k <= f; k++) await movie.gotoFrame(k, true); await movie.gotoFrame(f, true); reference[f] = count(); }
        return { pixels, reference, logs: window.__logs };
      })()`);
      expect(r.logs).toEqual([]);
      const order = Object.keys(r.pixels);
      const frames = order.map(k => Number(k.split('@')[0]));
      order.forEach((k, i) => {
        const want = r.reference[frames[i]!]!;
        expect(Math.abs(r.pixels[k] - want), `seek #${i} to frame ${frames[i]}: ${r.pixels[k]} white pixels, the frame has ${want}`).toBeLessThanOrEqual(Math.max(40, want * 0.03));
      });
      expect(r.reference[0]).toBe(0);
      expect(r.reference[60]).toBeGreaterThan(2000);
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);
});
