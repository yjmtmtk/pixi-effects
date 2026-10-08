// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error plain ESM script without types
import { buildGuide } from '../../scripts/build-guide.mjs';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** Pages that carry the shared header (each task that moves a page onto the shared shell adds it here). */
const PAGES: Array<[string]> = [['index.html'], ['guide-preview/getting-started.html'], ['examples/index.html'], ['examples/music-lab.html'], ['examples/playground.html'], ['examples/gallery/index.html']];

async function withPage<T>(path: string, width: number, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'shell-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${path}` });
    await check.sleep(1200);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the shared header, in a real browser', () => {
  beforeAll(async () => { await buildGuide({ srcDir: join(root, 'site/guide'), outDir: join(root, 'guide-preview'), root }); });   // the guide is built, not stored
  for (const width of [390, 1440]) {
    it.each(PAGES)(`%s at ${width}px: the four entrances are all on screen, nothing scrolls sideways`, async (path) => {
      await withPage(path, width, async (cdp) => {
        const r = await cdp.eval(`(() => {
          const links = [...document.querySelectorAll('header.top nav a')].filter(a => a.offsetParent);
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            names: links.map(a => a.textContent.trim()),
            inside: links.every(a => { const b = a.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.height > 0; }),
            main: !!document.getElementById('main'),
            // the body hides sideways overflow, so scrollWidth alone cannot see a column that is wider than the screen
            mainRight: document.getElementById('main')?.getBoundingClientRect().right ?? 0,
            width: innerWidth,
          };
        })()`);
        expect(r.overflow).toBeLessThanOrEqual(0);
        expect(r.names).toEqual(expect.arrayContaining(['Guide', 'Gallery', 'Examples', 'Playground']));
        expect(r.inside).toBe(true);
        expect(r.main).toBe(true);
        expect(r.mainRight).toBeLessThanOrEqual(r.width + 1);
      });
    }, 30000);
  }

  it.each(PAGES)('%s: the theme button switches to a theme and the colour really changes', async (path) => {
    await withPage(path, 1440, async (cdp) => {
      const before = await cdp.eval(`({ bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.getAttribute('data-theme') })`);
      await cdp.eval(`(() => { const b = document.getElementById('themeBtn'); b.click(); b.click(); })()`);     // auto -> light -> dark
      const dark = await cdp.eval(`({ bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.getAttribute('data-theme') })`);
      await cdp.eval(`document.getElementById('themeBtn').click()`);                                                // -> auto
      await cdp.eval(`document.getElementById('themeBtn').click()`);                                                // -> light
      const light = await cdp.eval(`({ bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.getAttribute('data-theme') })`);
      expect(before.theme).toBe(null);
      expect(dark.theme).toBe('dark');
      expect(light.theme).toBe('light');
      expect(dark.bg).not.toBe(light.bg);
    });
  }, 30000);
});
