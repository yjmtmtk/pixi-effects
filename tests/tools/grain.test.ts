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
  const dir = mkdtempSync(join(tmpdir(), 'grain-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/grain.html?${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const grab = (cdp: any, f: number, opts = {}) => cdp.eval(`grab(${f}, ${JSON.stringify(opts)})`);
const stat = (cdp: any, ...a: unknown[]) => cdp.eval(`stat(${a.map((x) => JSON.stringify(x)).join(', ')})`);
const run = describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS);

run('the grain filter, on a real browser', () => {
  it('amount is the standard deviation at mid-grey (0.08 → 20.4 of 255, 0.02 → 5.1), the mean does not move, and size does not change it', async () => {
    for (const [q, want] of [['amount=0.08&size=1.5', 20.4], ['amount=0.08&size=1', 20.4], ['amount=0.08&size=3', 20.4], ['amount=0.02&size=1.5', 5.1]] as const) {
      await withPage(`grain=1&${q}`, async (cdp) => {
        await grab(cdp, 10);
        const s = await stat(cdp);
        expect(s.std, q).toBeGreaterThan(want - 1.2);
        expect(s.std, q).toBeLessThan(want + 1.2);
        expect(Math.abs(s.mean), `${q} mean`).toBeLessThan(0.7);
      });
    }
  }, 240000);

  it('colour grain is independent per channel (each channel has the same spread, and the channels differ); mono grain is the same on all channels', async () => {
    await withPage('grain=1&color=1', async (cdp) => {
      await grab(cdp, 10);
      const [r, g] = [await stat(cdp, 0), await stat(cdp, 1)];
      expect(r.std).toBeGreaterThan(19); expect(r.std).toBeLessThan(22);
      expect(g.std).toBeGreaterThan(19);
      expect(await cdp.eval(`(() => { const d = __last; let diff = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1]) diff++; return diff / (d.length / 4); })()`)).toBeGreaterThan(0.5);
    });
    await withPage('grain=1&color=0', async (cdp) => {
      await grab(cdp, 10);
      expect(await cdp.eval(`(() => { const d = __last; let diff = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) diff++; return diff; })()`)).toBe(0);
    });
  }, 240000);

  it('black and white are untouched, and a dark grey is not lifted (the grain fades out toward the ends)', async () => {
    for (const c of ['000000', 'ffffff']) {
      await withPage(`grain=1&c=${c}`, async (cdp) => {
        await grab(cdp, 10);
        const base = c === '000000' ? 0 : 255;
        expect((await stat(cdp, 0, base)).std).toBe(0);
      });
    }
    await withPage('grain=1&c=202020', async (cdp) => {
      await grab(cdp, 10);
      const s = await stat(cdp, 0, 32);
      expect(Math.abs(s.mean)).toBeLessThan(0.6);                              // no lift
      expect(s.std).toBeLessThan(0.08 * 255 * 0.6);                            // and weaker than at mid-grey: 4L(1-L) at 0.125 is 0.44
    });
  }, 240000);

  it('a frame is the same picture reached forwards, after jumps and going back (and a different grain frame is a different picture)', async () => {
    await withPage('grain=1&seed=2', async (cdp) => {
      await grab(cdp, 10); await cdp.eval(`keep('a')`);
      await grab(cdp, 90); await grab(cdp, 11);
      await grab(cdp, 10); await cdp.eval(`keep('b')`);
      expect(await cdp.eval(`same('a', 'b')`)).toBe(0);
      await grab(cdp, 119); await grab(cdp, 10); await cdp.eval(`keep('c')`);
      expect(await cdp.eval(`same('a', 'c')`)).toBe(0);
      await grab(cdp, 20); await cdp.eval(`keep('d')`);
      expect(await cdp.eval(`same('a', 'd')`)).toBeGreaterThan(1000);
    });
  }, 240000);

  it('another seed is another pattern (no correlation) and the same seed is the same pattern on a new page', async () => {
    const take = (seed: number) => withPage(`grain=1&seed=${seed}`, async (cdp) => { await grab(cdp, 10); return cdp.eval('Array.from(__last)'); });
    const [a, a2, b] = [await take(0), await take(0), await take(1)];
    expect(a2).toEqual(a);
    const n = a.length / 4; let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < a.length; i += 4) { const u = a[i] - 128, v = b[i] - 128; sxy += u * v; sxx += u * u; syy += v * v; }
    expect(Math.abs(sxy / Math.sqrt(sxx * syy)), `over ${n} pixels`).toBeLessThan(0.05);
  }, 240000);

  it('fps 24 in a 30 fps movie: frames 10 and 11 share a grain frame, 11 / 12 / 13 are new patterns; fps 0 is one still pattern', async () => {
    await withPage('grain=1&fps=24', async (cdp) => {
      for (const f of [10, 11, 12, 13]) { await grab(cdp, f); await cdp.eval(`keep('f${f}')`); }
      expect(await cdp.eval(`same('f10', 'f11')`)).toBe(0);
      expect(Math.abs(await cdp.eval(`corr('f11', 'f12')`))).toBeLessThan(0.05);
      expect(Math.abs(await cdp.eval(`corr('f12', 'f13')`))).toBeLessThan(0.05);
    });
    await withPage('grain=1&fps=0', async (cdp) => {
      await grab(cdp, 10); await cdp.eval(`keep('a')`); await grab(cdp, 100); await cdp.eval(`keep('b')`);
      expect(await cdp.eval(`same('a', 'b')`)).toBe(0);
    });
  }, 240000);

  it('WebGL and WebGPU draw the same grain (integer maths): no value differs by more than 1 (float rounding), and under 0.05 % differ at all', async () => {
    const take = (q: string) => withPage(`grain=1&seed=3&${q}`, async (cdp) => { await grab(cdp, 10); return cdp.eval('Array.from(__last)'); });
    const [gpu, gl] = [await take(''), await take('gl=1')];
    let diff = 0, max = 0; for (let i = 0; i < gpu.length; i++) if (gpu[i] !== gl[i]) { diff++; max = Math.max(max, Math.abs(gpu[i] - gl[i])); }
    expect(max, 'the largest difference').toBeLessThanOrEqual(1);
    expect(diff / gpu.length, `${diff} of ${gpu.length}`).toBeLessThan(0.0005);
  }, 240000);

  it('on a layer (a composition) and on the root the grain is the same size; the root grain covers the whole picture', async () => {
    for (const mode of ['root', 'layer']) {
      await withPage(`grain=1&mode=${mode}`, async (cdp) => {
        await grab(cdp, 10);
        for (const region of [[0, 0, 320, 180], [320, 0, 320, 180], [0, 180, 320, 180], [320, 180, 320, 180]]) {
          const s = await stat(cdp, 0, 128, region);
          expect(s.std, `${mode} ${region}`).toBeGreaterThan(19); expect(s.std).toBeLessThan(22);
        }
      });
    }
  }, 240000);

  it('a keyframe on filters.g.amount moves the grain: the spread grows as the amount goes from 0.08 to 0.2', async () => {
    await withPage('grain=1&mode=layer&amountTo=0.2', async (cdp) => {
      const sd: number[] = [];
      for (const f of [0, 40, 80, 119]) { await grab(cdp, f); sd.push((await stat(cdp)).std); }
      expect(sd[0]!).toBeGreaterThan(18); expect(sd[0]!).toBeLessThan(23);
      expect(sd[1]!).toBeGreaterThan(sd[0]! + 4); expect(sd[2]!).toBeGreaterThan(sd[1]! + 4); expect(sd[3]!).toBeGreaterThan(sd[2]! + 2);
      expect(sd[3]!).toBeGreaterThan(44);                                      // 0.2 × 255 = 51, a little less from clipping
    });
  }, 240000);

  it('motion blur sub-frames share one grain frame: the grain does not average away (the spread is the same with 2 and with 16 samples)', async () => {
    await withPage('grain=1', async (cdp) => {
      const sd: number[] = [];
      for (const mb of [false, 2, 16]) { await grab(cdp, 10, { motionBlur: mb }); sd.push((await stat(cdp)).std); }
      expect(sd[1]!).toBeGreaterThan(sd[0]! - 1.5); expect(sd[2]!).toBeGreaterThan(sd[0]! - 1.5);
      expect(await cdp.eval('window.__logs')).toEqual([]);
    });
  }, 240000);

  it('the grain of a frame does not depend on where the playhead was: a motion-blurred frame is the same after frame 90 as after frame 9', async () => {
    await withPage('grain=1&seed=2', async (cdp) => {
      await grab(cdp, 90); await grab(cdp, 10, { motionBlur: 2 }); await cdp.eval(`keep('after90')`);
      await grab(cdp, 9); await grab(cdp, 10, { motionBlur: 2 }); await cdp.eval(`keep('after9')`);
      expect(await cdp.eval(`same('after90', 'after9')`)).toBe(0);
      expect((await stat(cdp)).std).toBeGreaterThan(15);                       // and there is grain in it
    });
  }, 240000);

  it('a grain layer inside a threeD card shows the grain of the frame that is drawn, not of the frame before', async () => {
    await withPage('grain=1&seed=2&mode=card', async (cdp) => {
      await grab(cdp, 90); await grab(cdp, 10); await cdp.eval(`keep('after90')`);
      await grab(cdp, 9); await grab(cdp, 10); await cdp.eval(`keep('after9')`);
      await grab(cdp, 11); await grab(cdp, 10); await cdp.eval(`keep('after11')`);
      expect(await cdp.eval(`same('after90', 'after9')`)).toBe(0);
      expect(await cdp.eval(`same('after90', 'after11')`)).toBe(0);
      expect((await stat(cdp)).std).toBeGreaterThan(15);
    });
  }, 240000);
});
