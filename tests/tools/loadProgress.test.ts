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

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'loadprogress-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/load-progress.html?${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const run = describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS);

run('loading progress, on a real browser', () => {
  it('a movie of 120 layers reports its build: events rise from 0 to 1, the layers are counted, the loader shows each step, and every stage is timed', async () => {
    await withPage('n=120', async (cdp) => {
      const events = await cdp.eval('window.__events') as Array<{ stage: string; loaded: number; total: number; progress: number; shownPercent: string | null; shownStage: string | null }>;
      expect(events.length).toBeGreaterThanOrEqual(120);                                      // one per layer, at least
      expect(events.at(-1)!.progress).toBe(1);
      for (let i = 1; i < events.length; i++) expect(events[i]!.progress).toBeGreaterThanOrEqual(events[i - 1]!.progress);
      const build = events.filter(e => e.stage === 'build');
      expect(build.at(-1)!.total).toBe(120);
      expect(build.at(-1)!.loaded).toBe(120);
      const shown = events.filter(e => e.shownStage);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.some(e => e.shownStage === 'BUILDING LAYERS')).toBe(true);
      for (const e of shown) expect(Number(e.shownPercent)).toBe(Math.round(e.progress * 100));
      const stages = await cdp.eval('window.movie.loadStages') as Record<string, number>;
      expect(Object.keys(stages).sort()).toEqual(['assets', 'build', 'frames', 'sound']);
      expect(stages.build).toBeGreaterThan(0);
    });
  }, 180000);

  it('the movie is the same with or without a loader to feed (all 120 layers are in the picture)', async () => {
    const withLoader = await withPage('n=120', cdp => cdp.eval('window.movie.inspect(0).then(r => r.layers?.length ?? r.length ?? -1)'));
    const without = await withPage('n=120&fast=1', cdp => cdp.eval('window.movie.inspect(0).then(r => r.layers?.length ?? r.length ?? -1)'));
    expect(withLoader).toBe(without);
    expect(withLoader).toBeGreaterThanOrEqual(120);
  }, 180000);
});
