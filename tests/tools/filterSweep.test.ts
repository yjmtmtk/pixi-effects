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

/** The filters the docs recommend: each one must show up, and look the same on WebGPU and WebGL. (`glitch` is random: it only has to show up.) */
const VERIFIED = ['glow', 'outline', 'dropShadow', 'bevel', 'bloom', 'pixelate', 'crt', 'rgbSplit', 'dot', 'radialBlur', 'glitch'];
const RANDOM = new Set(['glitch']);

/** The share of pixels whose largest channel differs by more than 24 (of 255). */
const share = (a: number[], b: number[]): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24) n++;
  return n / (a.length / 4);
};

async function grabAll(types: string[], webgl: boolean): Promise<Record<string, { pix: number[]; backend: string; logs: string[] }>> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'filtersweep-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  const out: Record<string, { pix: number[]; backend: string; logs: string[] }> = {};
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    for (const t of types) {
      for (let attempt = 0; attempt < 3; attempt++) {                          // a CDN hiccup is not a filter's fault
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/films/filter-sweep.html?f=${t}${webgl ? '&backend=webgl' : ''}&r=${Math.random()}` });
        for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(250); }
        if (await cdp.eval('window.__ready === true').catch(() => false)) break;
      }
      expect(await cdp.eval('window.__ready === true'), `${t}: ${JSON.stringify(await cdp.eval('window.__logs').catch(() => []))}`).toBe(true);
      out[t] = { pix: await cdp.eval('window.grab()'), backend: await cdp.eval('window.backend'), logs: await cdp.eval('window.__logs') };
    }
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
  return out;
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the recommended named filters, on a real browser: visible, and the same on WebGPU and WebGL', () => {
  it('every filter changes the picture on both backends, and (but the random one) looks the same on the two', async () => {
    const types = ['none', ...VERIFIED];
    const gpu = await grabAll(types, false);
    const gl = await grabAll(types, true);
    expect(gl.none!.backend).toMatch(/webgl/i);                                  // the forced run really is on WebGL
    const rows: string[] = [];
    for (const t of VERIFIED) {
      const onGpu = share(gpu[t]!.pix, gpu.none!.pix), onGl = share(gl[t]!.pix, gl.none!.pix), between = share(gpu[t]!.pix, gl[t]!.pix);
      rows.push(`${t}: changes ${onGpu.toFixed(3)} (${gpu[t]!.backend}) / ${onGl.toFixed(3)} (webgl), the two differ by ${between.toFixed(3)}`);
      expect(onGpu, `${t} on ${gpu[t]!.backend} must change the picture`).toBeGreaterThan(0.004);
      expect(onGl, `${t} on WebGL must change the picture`).toBeGreaterThan(0.004);
      if (!RANDOM.has(t)) expect(between, `${t}: WebGPU and WebGL must agree`).toBeLessThan(0.08);      // pixelate differs by block edges (3 %); a filter that does nothing on one backend differs by 30 % or more
      expect(gpu[t]!.logs.concat(gl[t]!.logs), `${t} warns`).toEqual([]);
    }
    console.log(`[filters]\n${rows.join('\n')}`);
  }, 400_000);
});
