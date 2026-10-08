// @vitest-environment node
// The condition for shipping a warning about a key: every page this repository shows as correct (the gallery, the numbered examples) runs
// with NOT ONE warning. A key lint that cries wolf on a correct piece is worse than none.
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
const pieces = (JSON.parse(readFileSync(join(root, 'examples/gallery/pieces.json'), 'utf8')).pieces as Array<{ id: string }>).map((p) => `examples/gallery/${p.id}.html`);
const numbered = ['01-hello', '02-keyframes', '03-shapes', '04-media', '05-composition-mask', '06-filters', '07-transitions', '08-presets-export', '09-audio', '10-three', '11-depth', '12-title-motion', '13-sfx', '14-draw-on'].map((n) => `examples/${n}.html`);
const COLLECT = `(() => { window.__nfw = []; for (const k of ['warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { window.__nfw.push(k + ': ' + a.map(x => (x && x.message) || String(x)).join(' ')); o(...a); }; } window.addEventListener('error', e => window.__nfw.push('uncaught: ' + e.message)); })();`;

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('no false warnings on any page the repository shows as correct', () => {
  it(`runs the ${pieces.length} gallery pieces and the ${numbered.length} numbered examples with no warning at all`, async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'nfw-'));
    const { proc, cdp } = await launchPage(chrome, dir);
    const bad: string[] = [];
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECT });
      for (const page of [...pieces, ...numbered]) {
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
        let ready = false;
        for (let i = 0; i < 150 && !ready; i++) { await check.sleep(200); ready = await cdp.eval('window.__ready === true || !!(window.movie && window.movie.isReady)').catch(() => false); }
        await check.sleep(ready ? 400 : 6000);                               // a page that does not announce itself gets time to build
        const logs: string[] = await cdp.eval('window.__nfw || []').catch(() => ['(no collector: the page did not load)']);
        const own = logs.filter((l) => !/favicon|Failed to load resource/.test(l));
        if (own.length) bad.push(`${page}: ${own.slice(0, 3).map((l) => l.slice(0, 200)).join(' | ')}${own.length > 3 ? ` (+${own.length - 3})` : ''}`);
      }
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
    expect(bad).toEqual([]);
  }, 900000);
});
