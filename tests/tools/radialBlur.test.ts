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

async function signal(query: string): Promise<{ sum: number; backend: string }> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'radialblur-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/radial-blur.html${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return { sum: await cdp.eval('window.signal(30)'), backend: await cdp.eval('window.backend') };
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

// pixi-filters 6.1.5 writes the radial blur's kernel size as an i32 but its WGSL reads an f32: on WebGPU (the default backend) the blur was skipped and `radialBlur` did nothing.
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '&backend=webgl']])('radialBlur, on a real browser (%s)', (_label, extra) => {
  it('spreads the bar out: the brightness left in its box falls well below the unfiltered picture', async () => {
    const off = await signal(`?m=off${extra}`);
    const on = await signal(`?m=on${extra}`);
    if (extra) expect(on.backend).toMatch(/webgl/i);                                   // the forced run really is on WebGL
    console.log(`[radialBlur] backend ${on.backend}: ${Math.round(on.sum)} with the blur, ${Math.round(off.sum)} without`);
    expect(on.sum, `backend ${on.backend}`).toBeLessThan(off.sum * 0.8);
  }, 200_000);
});
