// @vitest-environment node
// The condition for shipping a warning about a key: every page the tests themselves call correct (the test films) runs
// with NOT ONE warning. A lint that cries wolf on a correct movie is worse than none.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
/** Pages that are not correct movies on purpose, or that are not movies: left out, each with its reason. */
const NOT_CORRECT: Record<string, string> = {
  'tests/films/three-budget.html': 'holds 20 three layers by default, to see the budget warning',
};
const htmlIn = (dir: string) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.html') && !NOT_CORRECT[`${dir}/${f}`]).sort().map((f) => `${dir}/${f}`);
const pieces = htmlIn('tests/films');
const COLLECT = `(() => { window.__nfw = []; for (const k of ['warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { window.__nfw.push(k + ': ' + a.map(x => (x && x.message) || String(x)).join(' ')); o(...a); }; } window.addEventListener('error', e => window.__nfw.push('uncaught: ' + e.message)); })();`;

const LANES = 4;                                                         // tabs working through the pages at the same time

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('no false warnings on any page the repository shows as correct', () => {
  it(`runs the ${pieces.length} test films with no warning at all`, async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'nfw-'));
    const all = pieces;
    const bad: string[] = [];
    // one tab per lane; a lane takes the next page when it is done with its page (pages cost very different times)
    let next = 0;
    const lane = async (): Promise<void> => {
      const { proc, cdp } = await launchPage(chrome, dir);
      try {
        await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECT });
        for (let i = next++; i < all.length; i = next++) {
          const page = all[i]!;
          await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
          let ready = false;
          for (let k = 0; k < 150 && !ready; k++) { await check.sleep(100); ready = await cdp.eval('window.__ready === true || !!(window.movie && window.movie.isReady)').catch(() => false); }
          await check.sleep(ready ? 300 : 3500);                           // a page that does not announce itself gets time to build
          const logs: string[] = await cdp.eval('window.__nfw || []').catch(() => ['(no collector: the page did not load)']);
          const own = logs.filter((l) => !/favicon|Failed to load resource/.test(l));
          if (own.length) bad.push(`${page}: ${own.slice(0, 3).map((l) => l.slice(0, 200)).join(' | ')}${own.length > 3 ? ` (+${own.length - 3})` : ''}`);
        }
      } finally { proc.kill(); }
    };
    try { await Promise.all(Array.from({ length: LANES }, lane)); }
    finally { server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
    expect(bad).toEqual([]);
  }, 600000);
});
