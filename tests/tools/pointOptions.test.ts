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
const run = describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS);

async function withPage(query: string, fn: (cdp: any) => Promise<void>): Promise<void> {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'pointopt-'));
    const { proc, cdp } = await launchPage(chrome, dir);
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/point-options.html${query}` });
      for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
      expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
      await fn(cdp);
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

run('a point option of a filter, on a real browser', () => {
  it("a `to` keyframe alone starts from the filter's own value, also after a rebuild (the author's spec is not written into)", async () => {
    await withPage('?toOnly=1', async (cdp) => {
      expect(await cdp.eval('redShift(30)'), 'the end: 15 px').toBeLessThan(-13.5);        // this writes the leaf of the point in place
      await cdp.eval('movie.rebuild()');
      expect(Math.abs(await cdp.eval('redShift(0)')), 'frame 0 after a rebuild').toBeLessThan(1);
      expect(await cdp.eval('redShift(15)'), 'half way after a rebuild').toBeLessThan(-6);
      expect(await cdp.eval('redShift(15)')).toBeGreaterThan(-9);
    });
  });

  it("'filters.s.red.x' moves the red copy of the picture: the point reaches the GPU, not only the object", async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'pointopt-'));
    const { proc, cdp } = await launchPage(chrome, dir);
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/point-options.html` });
      for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
      expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
      const at0 = await cdp.eval('redShift(0)'), at15 = await cdp.eval('redShift(15)'), at30 = await cdp.eval('redShift(30)');
      expect(Math.abs(at0), 'frame 0: no offset yet').toBeLessThan(1);
      expect(at15, 'half way (x = 15): the red copy has moved 7.5 px').toBeLessThan(-6);
      expect(at15).toBeGreaterThan(-9);
      expect(at30, 'the end (x = 30): 15 px').toBeLessThan(-13.5);
      expect(at30).toBeGreaterThan(-16.5);
      expect(await cdp.eval('JSON.stringify(window.__logs)'), 'no warning').toBe('[]');
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
  }, 120000);
});
