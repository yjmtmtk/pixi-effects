// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const pieces = JSON.parse(readFileSync(join(root, 'examples/gallery/pieces.json'), 'utf8')).pieces as Array<{ id: string; model: string }>;

async function withGallery<T>(hash: string, width: number, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'gallery-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/gallery/${hash}` });
    for (let i = 0; i < 80; i++) { if (await cdp.eval(`document.querySelectorAll('#grid .piece').length`).catch(() => 0)) break; await check.sleep(150); }
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const shown = `[...document.querySelectorAll('#grid .piece')].filter(li => !li.hidden).length`;

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the gallery, in a real browser (behaviour that must survive any restyle)', () => {
  it('shows one tile per piece, and nothing scrolls sideways at 390 and 1440', async () => {
    for (const w of [390, 1440]) {
      await withGallery('', w, async (cdp) => {
        const r = await cdp.eval(`({ tiles: document.querySelectorAll('#grid .piece').length, overflow: document.documentElement.scrollWidth - innerWidth, mainRight: document.getElementById('main') ? document.getElementById('main').getBoundingClientRect().right : document.querySelector('main').getBoundingClientRect().right, w: innerWidth })`);
        expect(r.tiles).toBe(pieces.length);
        expect(r.overflow).toBeLessThanOrEqual(0);
        expect(r.mainRight).toBeLessThanOrEqual(r.w + 1);
      });
    }
  }, 60000);

  it('a model filter keeps only that model\'s pieces, and "all" brings every piece back', async () => {
    await withGallery('', 1440, async (cdp) => {
      const model = pieces.some((p) => p.model === 'opus') ? 'opus' : pieces[0]!.model;
      const want = pieces.filter((p) => p.model === model).length;
      await cdp.eval(`document.querySelector('#model-seg button[data-model="${model}"]').click()`);
      await check.sleep(300);
      expect(await cdp.eval(shown)).toBe(want);
      await cdp.eval(`document.querySelector('#model-seg button[data-model="all"]').click()`);
      await check.sleep(300);
      expect(await cdp.eval(shown)).toBe(pieces.length);
    });
  }, 60000);

  it('a click on a tile opens the theatre with that piece (and #id in the address); Escape closes it', async () => {
    await withGallery('', 1440, async (cdp) => {
      const id = await cdp.eval(`document.querySelector('#grid .piece').dataset.id`);
      await cdp.eval(`document.querySelector('#grid .piece a.card').click()`);
      await check.sleep(800);
      expect(await cdp.eval(`document.getElementById('theatre').open`)).toBe(true);
      expect(await cdp.eval(`location.hash`)).toBe(`#${id}`);
      expect(await cdp.eval(`document.getElementById('th-title').textContent.length > 0`)).toBe(true);
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      await check.sleep(500);
      expect(await cdp.eval(`document.getElementById('theatre').open`)).toBe(false);
    });
  }, 60000);

  it('a #id in the address opens that piece at once; next moves to another piece', async () => {
    const id = pieces[1]!.id;
    await withGallery(`#${id}`, 1440, async (cdp) => {
      await check.sleep(800);
      expect(await cdp.eval(`document.getElementById('theatre').open`)).toBe(true);
      const t1 = await cdp.eval(`document.getElementById('th-title').textContent`);
      await cdp.eval(`document.querySelector('#theatre [data-next]').click()`);
      await check.sleep(600);
      expect(await cdp.eval(`document.getElementById('th-title').textContent`)).not.toBe(t1);
    });
  }, 60000);
});

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the gallery uses the shared shell', () => {
  it('has the shared header (four entrances, Gallery current), the shared footer and the model colours from the tokens', async () => {
    await withGallery('', 1440, async (cdp) => {
      const r = await cdp.eval(`({
        current: document.querySelector('header.top nav a[aria-current="page"]')?.textContent,
        footer: !!document.querySelector('footer.site-foot'),
        main: !!document.getElementById('main'),
        tokens: getComputedStyle(document.documentElement).getPropertyValue('--model-opus').trim(),
        sheets: [...document.styleSheets].map(s => s.href || '').filter(Boolean).map(h => h.split('/').slice(-2).join('/')),
      })`);
      expect(r.current).toBe('Gallery');
      expect(r.footer).toBe(true);
      expect(r.main).toBe(true);
      expect(r.tokens).not.toBe('');
      expect(r.sheets).toEqual(expect.arrayContaining(['shared/tokens.css', 'shared/site.css', 'gallery/gallery.css']));
    });
  }, 60000);
});
