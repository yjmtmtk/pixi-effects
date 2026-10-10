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

async function withPage<T>(fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'relative-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/relative-values.html` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

/** A layer's left / top / alpha at a frame, through movie.inspect. */
const probe = (cdp: any, frame: number, name: string) => cdp.eval(`window.movie.inspect(${frame}, { layers: 'all' }).then(r => { const l = (r.layers ?? r).find(x => x.name === ${JSON.stringify(name)}); return l ? { x: l.bounds?.x ?? l.x, y: l.bounds?.y ?? l.y, w: l.bounds?.width ?? l.width, alpha: l.alpha } : null; })`);

run('relative keyframe values, in a real movie', () => {
  it('from "-=200" slides in from 200 to the left of where the layer stands; "+=100" twice stacks; no warning, in any order of seeking', async () => {
    await withPage(async (cdp) => {
      const order = [0, 15, 30, 45, 60, 30, 0, 60, 15];
      const slide: Record<number, number> = {}, stack: Record<number, number> = {};
      for (const f of order) { const s = await probe(cdp, f, 'slide'); const k = await probe(cdp, f, 'stack'); slide[f] = s.x; stack[f] = k.x; }
      expect(slide[0]).toBeCloseTo(300, 0);
      expect(slide[15]).toBeCloseTo(400, 0);
      expect(slide[30]).toBeCloseTo(500, 0);
      expect(slide[60]).toBeCloseTo(500, 0);
      expect(stack[0]).toBeCloseTo(100, 0);
      expect(stack[30]).toBeCloseTo(200, 0);
      expect(stack[60]).toBeCloseTo(300, 0);
      expect(await cdp.eval('window.__logs')).toEqual([]);
    });
  }, 240000);

  it('works on alpha, on a text layer\'s scale and y (PixiPlugin shorthands included)', async () => {
    await withPage(async (cdp) => {
      const fade = await probe(cdp, 30, 'fade');
      expect(fade.alpha).toBeCloseTo(0.5, 2);
      const g0 = await probe(cdp, 0, 'grow'), g1 = await probe(cdp, 30, 'grow');
      expect(g1.y - g0.y).toBeCloseTo(100, 0);
      expect(g1.w / g0.w).toBeCloseTo(2, 1);
    });
  }, 240000);
});
