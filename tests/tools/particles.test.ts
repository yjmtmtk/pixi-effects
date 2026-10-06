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

async function withPage<T>(mode: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const userDataDir = mkdtempSync(join(tmpdir(), 'particles-'));
  const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/particles.html?mode=${mode}` });
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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('particles(), in a real browser', () => {
  it('one particle follows its parabola, and is not drawn before it is born or after it dies', async () => {
    await withPage('one', async (cdp) => {
      const dot = (frame: number) => cdp.eval(`(async () => {
        const url = await movie.snapshot(${frame}, { as: 'dataURL' });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 128) { const p = i / 4; sx += p % c.width; sy += Math.floor(p / c.width); n++; }
        return n ? [sx / n, sy / n] : null; })()`);
      expect(await dot(0)).toBeNull();                                   // not born yet (0 s)
      const born = await dot(15);                                        // 0.5 s: at the start point
      expect(born[0]).toBeCloseTo(640, -1); expect(born[1]).toBeCloseTo(600, -1);
      const top = await dot(30);                                         // 1.0 s: the top of the arc, t = 0.5
      expect(top[0]).toBeCloseTo(640, -1); expect(top[1]).toBeCloseTo(525, -1);
      const back = await dot(45);                                        // 1.5 s: t = 1, back at the start height
      expect(back[1]).toBeCloseTo(600, -1);
      const lower = await dot(60);                                       // 2.0 s: t = 1.5, y = 600 - 450 + 675 = 825 (off the bottom) or nothing
      expect(lower === null || lower[1] > 700).toBe(true);
      expect(await dot(90)).toBeNull();                                  // 3.0 s: dead (it lived until 2.5 s)
    });
  }, 90_000);

  it('a burst is the same on every load and after any order of seeking', async () => {
    const frames = (order: number[]) => withPage('burst', async (cdp) => {
      const out: Record<number, string> = {};
      for (const f of order) out[f] = await cdp.eval(`movie.snapshot(${f}, { as: 'dataURL' })`);
      return out;
    });
    const a = await frames([20, 45, 70]);
    const b = await frames([70, 20, 45]);
    for (const f of [20, 45, 70]) { expect(a[f]!.length).toBeGreaterThan(1000); expect(b[f]).toBe(a[f]); }
    expect(a[20]).not.toBe(a[45]);
  }, 120_000);
});
