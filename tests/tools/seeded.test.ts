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

/** load the check page with a seed; return snapshots (data URLs) of the frames, taken in the given order */
async function frames(seed: number, order: number[]): Promise<Record<number, string>> {
  const { server, port } = await check.serve(root);
  const userDataDir = mkdtempSync(join(tmpdir(), 'seeded-'));
  const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/seeded.html?seed=${seed}` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval('window.__ready === true').catch(() => false); }
    expect(ready).toBe(true);
    expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');
    const out: Record<number, string> = {};
    for (const f of order) out[f] = await cdp.eval(`movie.snapshot(${f}, { as: 'dataURL' })`);
    return out;
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    await check.sleep(200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('seeded randomness, in a real browser', () => {
  it('the same seed gives the same pixels on every load and after any order of seeking; another seed gives another picture', async () => {
    const a = await frames(1, [10, 40, 75]);
    const b = await frames(1, [75, 10, 40]);                 // another load, another order
    const c = await frames(2, [10, 40, 75]);
    for (const f of [10, 40, 75]) {
      expect(a[f]!.length).toBeGreaterThan(1000);
      expect(b[f]).toBe(a[f]);
      expect(c[f]).not.toBe(a[f]);
    }
    expect(a[10]).not.toBe(a[40]);                           // and it does move
  }, 120_000);
});
