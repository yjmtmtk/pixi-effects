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

run('the first picture after init, on a real browser', () => {
  it('shows the movie at its start before anything seeks: a set at 0 is applied, a layer that starts later is hidden', async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'firstframe-'));
    const { proc, cdp } = await launchPage(chrome, dir);
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/first-frame.html` });
      for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
      expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
      const state = await cdp.eval(`(() => { const c = window.movie._rootSequence._children; const t = n => c.find(s => s.spec.name === n).target; return JSON.stringify({ x: t('box').x, y: t('box').y, later: t('later').renderable }); })()`);
      expect(JSON.parse(state)).toEqual({ x: 300, y: 100, later: false });
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
  }, 120000);
});
