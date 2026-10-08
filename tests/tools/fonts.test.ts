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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('movie.inspectFonts(), in a real browser', () => {
  it('names the layers none of whose fonts is available, and the web fonts that failed to load', async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
    const { proc, cdp } = await check.launchChrome(chrome, dir);
    try {
      await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/fonts.html` });
      for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
      expect(await cdp.eval('window.__ready === true')).toBe(true);
      const r = await cdp.eval('JSON.stringify(movie.inspectFonts())').then(JSON.parse);
      expect(r.missing).toEqual([{ layer: 'missing', family: 'ThisFontDoesNotExist123, NopeNope' }]);        // ok-arial / ok-georgia are not in it
      expect(r.failed).toEqual(['Broken']);
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
  }, 120000);
});
