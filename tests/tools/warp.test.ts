// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(fn: (cdp: any) => Promise<T>, query = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'light-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/warp.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

import { warpOffset } from '../../src/filters/Warp';
const mine = (logs: string[]) => logs.filter(l => l.includes('pixi-effects:') && !l.includes('WebGPU'));
const mkWith = async (cdp: any, sequences: unknown[], extra: Record<string, unknown> = {}) => {
  const src: string = await cdp.eval('stripes()');
  await cdp.eval(`mk(${JSON.stringify({ assets: [{ name: 'stripes', src }], composition: { sequences }, ...extra })})`);
};
const picture = (filters: unknown[], extra: Record<string, unknown> = {}) => ({ type: 'image', name: 'pic', asset: 'stripes', initial: { x: 0, y: 0 }, filters, ...extra });
/** The centres of the white runs of a row (the red channel above half), between two x. */
const runs = (row: number[], x0: number, x1: number): number[] => {
  const out: number[] = []; let start = -1;
  for (let x = x0; x <= x1; x++) {
    const on = row[x]! > 128;
    if (on && start < 0) start = x;
    if ((!on || x === x1) && start >= 0) { out.push((start + (on ? x : x - 1)) / 2 + 0.5); start = -1; }
  }
  return out;
};
type O = { strength: number; scale: number; speed: number; angle: number; seed: number };
/** Where the white stripe k (centre 20k + 5 in the picture) must be seen in row y: the picture is read at x + dx, so the stripe appears at its centre − dx. */
function expectedCentre(kind: 'wave' | 'haze', k: number, y: number, t: number, o: O, pad: number): number {
  let c = 20 * k + 5;
  for (let i = 0; i < 6; i++) c = 20 * k + 5 - warpOffset(kind, c + pad, y + pad, t, o).dx;       // a fixed point: dx depends on where the stripe is seen
  return c;
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('warp filter, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  it('wave: every stripe is where the reference says in every row (the picture is read at x + dx)', async () => {
    await withPage(async (cdp) => {
      const o: O = { strength: 8, scale: 90, speed: 0, angle: 90, seed: 0 };
      await mkWith(cdp, [picture([{ type: 'warp', kind: 'wave', ...o }])]);
      const u = await cdp.eval('snap(0)');
      let checked = 0;
      for (const y of [30, 52, 75, 97, 120, 142]) {
        const seen = runs(await cdp.eval(`row(${JSON.stringify(u)}, ${y})`), 40, 200);
        for (const k of [3, 4, 5, 6]) {
          const want = expectedCentre('wave', k, y, 0, o, Math.ceil(o.strength));
          const nearest = seen.reduce((b, c) => (Math.abs(c - want) < Math.abs(b - want) ? c : b), 1e9);
          expect(Math.abs(nearest - want), `row ${y}, stripe ${k}: seen ${seen.join(', ')} want ${want.toFixed(1)}`).toBeLessThanOrEqual(1.5);
          checked++;
        }
      }
      expect(checked).toBe(24);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('strength 0 does not touch the picture: the same pixels as a layer with no filter', async () => {
    await withPage(async (cdp) => {
      await mkWith(cdp, [picture([])]);
      const plain = await cdp.eval('snap(0)');
      await mkWith(cdp, [picture([{ type: 'warp', strength: 0 }])]);
      const zero = await cdp.eval('snap(0)');
      expect(await cdp.eval(`diff(${JSON.stringify(plain)}, ${JSON.stringify(zero)})`)).toBe(0);
    });
  });

  it('haze: the stripes follow the reference noise (a fixed pattern at speed 0, a seed makes another)', async () => {
    await withPage(async (cdp) => {
      const o: O = { strength: 6, scale: 40, speed: 0, angle: 0, seed: 1 };
      await mkWith(cdp, [picture([{ type: 'warp', kind: 'haze', ...o }])]);
      const u = await cdp.eval('snap(0)');
      for (const y of [30, 60, 90, 120, 150]) {
        const seen = runs(await cdp.eval(`row(${JSON.stringify(u)}, ${y})`), 40, 200);
        for (const k of [3, 4, 5, 6]) {
          const want = expectedCentre('haze', k, y, 0, o, Math.ceil(o.strength));
          const nearest = seen.reduce((b, c) => (Math.abs(c - want) < Math.abs(b - want) ? c : b), 1e9);
          expect(Math.abs(nearest - want), `row ${y}, stripe ${k}: seen ${seen.join(', ')} want ${want.toFixed(1)}`).toBeLessThanOrEqual(2);
        }
      }
      await mkWith(cdp, [picture([{ type: 'warp', kind: 'haze', ...o, seed: 2 }])]);
      const other = await cdp.eval('snap(0)');
      expect(await cdp.eval(`diff(${JSON.stringify(u)}, ${JSON.stringify(other)})`)).toBeGreaterThan(100);
    });
  });

  it('time moves the wave, the frame decides it: a later frame matches the reference at its own time, and every seek order agrees', async () => {
    await withPage(async (cdp) => {
      const o: O = { strength: 8, scale: 90, speed: 1, angle: 90, seed: 0 };
      await mkWith(cdp, [picture([{ type: 'warp', kind: 'wave', ...o }])], { duration: 2 });
      const u = await cdp.eval('snap(20)');                                          // 20 / 30 s
      const y = 75;
      const seen = runs(await cdp.eval(`row(${JSON.stringify(u)}, ${y})`), 40, 200);
      for (const k of [3, 4, 5, 6]) {
        const want = expectedCentre('wave', k, y, 20 / 30, o, 8);
        const nearest = seen.reduce((b, c) => (Math.abs(c - want) < Math.abs(b - want) ? c : b), 1e9);
        expect(Math.abs(nearest - want), `stripe ${k}: seen ${seen.join(', ')} want ${want.toFixed(1)}`).toBeLessThanOrEqual(1.5);
      }
      const orders = await cdp.eval('orders([0, 7, 15, 20, 30, 38, 45, 52, 59])');
      expect(orders.bwdMax).toBe(0); expect(orders.jmpMax).toBe(0);
    });
  });

  it('the options move with keyframes by the filter\'s name (strength 0 to 8 over two seconds)', async () => {
    await withPage(async (cdp) => {
      await mkWith(cdp, [picture([{ type: 'warp', name: 'w', kind: 'wave', strength: 0, scale: 90, speed: 0, angle: 90 }], { keyframes: [{ at: 0, to: { 'filters.w.strength': 8 }, duration: 2, ease: 'none' }] })], { duration: 2 });
      const u = await cdp.eval('snap(30)');                                          // 1 s: strength 4
      const o: O = { strength: 4, scale: 90, speed: 0, angle: 90, seed: 0 };
      const seen = runs(await cdp.eval(`row(${JSON.stringify(u)}, 75)`), 40, 200);
      for (const k of [3, 4, 5]) {
        const want = expectedCentre('wave', k, 75, 0, o, 0);                         // the padding follows the strength: only its value at the time matters (4 → pad 4), checked below with both
        const nearest = seen.reduce((b, c) => (Math.abs(c - want) < Math.abs(b - want) ? c : b), 1e9);
        const alt = expectedCentre('wave', k, 75, 0, o, 4);
        const best = Math.min(Math.abs(nearest - want), Math.abs(nearest - alt));
        expect(best, `stripe ${k}: seen ${seen.join(', ')}`).toBeLessThanOrEqual(1.5);
      }
      const o0 = await cdp.eval('orders([0, 15, 30, 45, 59])');
      expect(o0.bwdMax).toBe(0); expect(o0.jmpMax).toBe(0);
    });
  });

  it('with motion blur on, the sub-frames of one frame share its time: every seek order gives the same pictures', async () => {
    await withPage(async (cdp) => {
      await mkWith(cdp, [picture([{ type: 'warp', kind: 'haze', strength: 6, scale: 40, speed: 1 }])], { duration: 2, motionBlur: true });
      const o = await cdp.eval('orders([0, 10, 20, 30, 40, 59])');
      expect(o.bwdMax).toBe(0); expect(o.jmpMax).toBe(0);
    });
  });

  it('on a threeD layer it still bends the picture, without a warning', async () => {
    await withPage(async (cdp) => {
      await mkWith(cdp, [picture([], { threeD: true })]);
      const plain = await cdp.eval('snap(0)');
      await mkWith(cdp, [picture([{ type: 'warp', kind: 'wave', strength: 8, scale: 90, angle: 90 }], { threeD: true })]);
      const warped = await cdp.eval('snap(0)');
      expect(await cdp.eval(`diff(${JSON.stringify(plain)}, ${JSON.stringify(warped)})`)).toBeGreaterThan(100);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });
});
