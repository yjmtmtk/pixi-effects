// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js')) && existsSync(join(root, 'dist/loader.css'));

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const userDataDir = mkdtempSync(join(tmpdir(), 'loader-'));
  const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/loader.html${query}` });
    await check.sleep(500);
    return await fn(cdp);
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    await check.sleep(200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}
const waitFor = async (cdp: any, expr: string, tries = 100) => { for (let i = 0; i < tries; i++) { if (await cdp.eval(expr).catch(() => false)) return true; await check.sleep(150); } return false; };

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the shared loader, in a real browser', () => {
  it('is on screen and animating while the movie loads, then init fades it out and removes it', async () => {
    await withPage('', async (cdp) => {
      const during = await cdp.eval(`(() => {
        const l = document.getElementById('loader'); const cs = getComputedStyle(l, '::before');
        return { there: !!l, position: getComputedStyle(l).position, ready: window.__ready === true, anim: cs.animationName, label: getComputedStyle(l, '::after').content };
      })()`);
      expect(during).toMatchObject({ there: true, position: 'absolute', ready: false, anim: 'pe-loader-spin' });
      expect(during.label).toBe('"LOADING"');
      expect(await waitFor(cdp, 'window.__ready === true')).toBe(true);
      expect(await waitFor(cdp, `!document.getElementById('loader')`)).toBe(true);        // faded out, then removed
    });
  }, 60_000);

  it('the looks: pulse and bar have their own animations, custom has no drawing of its own and keeps its content', async () => {
    for (const [look, anim] of [['pulse', 'pe-loader-pulse'], ['bar', 'pe-loader-bar']] as const) {
      await withPage(`?look=${look}`, async (cdp) => {
        expect(await cdp.eval(`getComputedStyle(document.getElementById('loader'), '::before').animationName`)).toBe(anim);
      });
    }
    await withPage('?look=custom', async (cdp) => {
      const r = await cdp.eval(`(() => { const l = document.getElementById('loader'); return { before: getComputedStyle(l, '::before').content, mine: !!document.getElementById('mine') }; })()`);
      expect(r).toEqual({ before: 'none', mine: true });
      expect(await waitFor(cdp, `!document.getElementById('loader')`)).toBe(true);        // a custom loader is dismissed all the same
    });
  }, 120_000);

  it('only animates transform and opacity on the real page too: every running animation targets one of them', async () => {
    await withPage('', async (cdp) => {
      const props = await cdp.eval(`(() => {
        const names = new Set();
        for (const a of document.getAnimations()) for (const f of a.effect.getKeyframes()) for (const k of Object.keys(f)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(k)) names.add(k);
        return [...names];
      })()`);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect(['transform', 'opacity']).toContain(p);
    });
  }, 60_000);

  it('when init fails it stops, says so and stays on screen', async () => {
    await withPage('?fail=1', async (cdp) => {
      expect(await waitFor(cdp, 'typeof window.__failed === "string"')).toBe(true);
      const r = await cdp.eval(`(() => { const l = document.getElementById('loader'); return l && { state: l.getAttribute('data-state'), label: l.getAttribute('data-label'), anim: getComputedStyle(l, '::before').animationName }; })()`);
      expect(r).toEqual({ state: 'error', label: 'COULD NOT LOAD', anim: 'none' });
    });
  }, 60_000);

  it('a variable set on an ancestor (the box the canvas sits in) restyles the loader', async () => {
    await withPage('?bg=1', async (cdp) => {
      expect(await cdp.eval(`getComputedStyle(document.getElementById('loader')).backgroundColor`)).toBe('rgb(255, 0, 0)');
    });
  }, 60_000);

  it('a page with no loader works as before', async () => {
    await withPage('?plain=1', async (cdp) => {
      expect(await waitFor(cdp, 'window.__ready === true')).toBe(true);
    });
  }, 60_000);

  it('the stylesheet in dist is the source file', () => {
    expect(readFileSync(join(root, 'dist/loader.css'), 'utf8')).toBe(readFileSync(join(root, 'src/loader.css'), 'utf8'));
  });
});
