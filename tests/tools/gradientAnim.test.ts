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

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'gradient-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/gradient-anim.html${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const snap = (cdp: any, f: number) => cdp.eval(`movie.snapshot(${f}, { as: 'dataURL' })`);
const FRAMES = [0, 15, 30, 45, 60];
/** every frame forwards, then after jumps, then backwards: they must all be the same picture */
async function sameEverywhere(cdp: any): Promise<void> {
  const fwd: Record<number, string> = {};
  for (const f of FRAMES) fwd[f] = await snap(cdp, f);
  for (const f of [60, 45, 0, 30, 15, 45, 60, 0, 30, 15, 45]) expect(await snap(cdp, f), `frame ${f} after jumping`).toBe(fwd[f]);
  for (const f of [...FRAMES].reverse()) expect(await snap(cdp, f), `frame ${f} going back`).toBe(fwd[f]);
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('animated fillGradient, on a real browser', () => {
  it('shapes (linear and radial) and text: every frame is the same forwards, by jumps and backwards', async () => {
    await withPage('', sameEverywhere);
  }, 240000);

  it('the same under motion blur', async () => {
    await withPage('?mb=1', sameEverywhere);
  }, 240000);

  it('the gradient really changes: the demo at the start and at the end are different pictures, and the logs are empty', async () => {
    await withPage('', async (cdp) => {
      expect(await snap(cdp, 0)).not.toBe(await snap(cdp, 59));
      expect(await cdp.eval('window.__logs')).toEqual([]);
    });
  }, 120000);

  it('the mistakes of ?mode=bad are said once each, at build, and a seek does not say them again', async () => {
    await withPage('?mode=bad', async (cdp) => {
      for (const f of [0, 15, 29, 5, 0, 20]) await snap(cdp, f);
      const logs: string[] = await cdp.eval('window.__logs');
      const count = (re: RegExp) => logs.filter((l) => re.test(l)).length;
      expect(count(/same number of stops as the gradient has \(2, got 3\)/)).toBe(1);
      expect(count(/fillGradient\.angel.*did you mean "angle"/s)).toBe(1);
      expect(count(/give it a fillGradient first/)).toBe(1);
      expect(count(/"fillGradient\.angle".*write fillGradient: \{ angle \}/s)).toBe(1);
      expect(count(/"gradientAngle".*write fillGradient: \{ angle \}/s)).toBe(1);
    });
  }, 120000);

  it('stop colours follow colorSpace: green to magenta is grey in the middle in rgb and vivid in oklch', async () => {
    await withPage('?mode=color', async (cdp) => {
      const px = (x: number, y: number) => cdp.eval(`(async () => {
        const img = new Image(); img.src = await movie.snapshot(30, { as: 'dataURL' }); await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return Array.from(g.getImageData(${x}, ${y}, 1, 1).data);
      })()`);
      const sat = ([r, g, b]: number[]) => Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
      const rgb = await px(520, 540), ok = await px(1360, 540);
      expect(sat(ok), `rgb ${rgb} vs oklch ${ok}`).toBeGreaterThan(sat(rgb) + 60);
    });
  }, 120000);

  it('no leak: fifty animated gradients make fifty painters at build and not one more after many seeks; text does not make painters', async () => {
    await withPage('?mode=many&n=50', async (cdp) => {
      expect(await cdp.eval('globalThis.__gradientPainters')).toBe(50);
      for (let i = 0; i < 40; i++) await snap(cdp, (i * 7) % 60);
      expect(await cdp.eval('globalThis.__gradientPainters')).toBe(50);
      await cdp.eval('movie.destroy()');
      expect(await cdp.eval('globalThis.__gradientPainters || 0')).toBe(0);
    });
  }, 240000);
});
