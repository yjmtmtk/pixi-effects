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

async function withSpring<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'spring-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/spring.html${query}` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const FRAMES = [0, 8, 10, 12, 14, 16, 18, 20, 24, 30, 45, 60, 90];
const snap = (cdp: any, f: number) => cdp.eval(`movie.snapshot(${f}, { as: 'dataURL' })`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('spring easing, on a real browser', () => {
  it('every frame is the same going forwards, by jumps and backwards (position, scale, alpha, colour, chained keyframes, a yoyo)', async () => {
    await withSpring('', async (cdp) => {
      const fwd: string[] = [];
      for (const f of FRAMES) fwd.push(await snap(cdp, f));
      const order = [90, 45, 8, 0, 30, 16, 12, 60, 24, 10, 20, 14, 18, 45];
      const jumped = new Map<number, string>();
      for (const f of order) jumped.set(f, await snap(cdp, f));
      for (const [f, s] of jumped) expect(s, `frame ${f} after jumping`).toBe(fwd[FRAMES.indexOf(f)]);
      const back: string[] = [];
      for (const f of [...FRAMES].reverse()) back.unshift(await snap(cdp, f));
      expect(back).toEqual(fwd);
      expect(await cdp.eval('window.__logs')).toEqual([]);
    });
  }, 240000);

  it('the slider overshoots its target (1050) and settles on it: the spring really springs', async () => {
    await withSpring('', async (cdp) => {
      const xs: number[] = [];
      for (let f = 0; f <= 60; f++) {
        xs.push(await cdp.eval(`movie.inspect(${f}, { layers: 'all' }).then(r => { const l = r.layers.find(l => l.name === 'slider'); return l.bounds.x + l.bounds.width / 2; })`));
      }
      const peak = Math.max(...xs);
      expect(peak).toBeGreaterThan(1050 * 1.08);                                // an under-damped spring (zeta 0.46) goes past by about 19 %
      expect(Math.abs(xs[xs.length - 1]! - 1050)).toBeLessThan(1050 * 0.01);    // and rests on the target
      expect(xs[0]).toBeCloseTo(150, 0);
    });
  }, 240000);

  it('two malformed springs are each said once (and a seek does not say them again)', async () => {
    await withSpring('?bad', async (cdp) => {
      for (const f of [0, 30, 60, 10, 0]) await snap(cdp, f);
      const logs: string[] = await cdp.eval('window.__logs');
      expect(logs.filter((l) => l.includes('unknown ease "spring(1, 170'))).toHaveLength(1);
      expect(logs.filter((l) => l.includes('unknown ease "spring.floppy'))).toHaveLength(1);
      expect(logs.find((l) => l.includes('unknown ease "spring.floppy'))).toMatch(/no preset "floppy"/);
    });
  }, 120000);
});
