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

async function withPage<T>(fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'cbez-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/cubic-bezier.html` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const CURVES = ['0.25,0.1,0.25,1', '0.42,0,1,1', '0,0,0.58,1', '0.42,0,0.58,1', '0.4,0,0.2,1', '0.34,1.56,0.64,1', '0.68,-0.6,0.32,1.6', '0,0,1,1', '1,0,0,1', '0,1,1,0', '0.8,0,0.2,1', '0.1,0.9,0.9,0.1'];

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('cubic-bezier, on a real browser', () => {
  it("is within 1e-4 of Chrome's own CSS easing on 12 curves (overshoot and degenerate ones included), 1001 samples each", async () => {
    await withPage(async (cdp) => {
      const worst: number = await cdp.eval(`(() => { let w = 0; for (const c of ${JSON.stringify(CURVES)}) { const s = 'cubic-bezier(' + c + ')'; for (let i = 0; i <= 1000; i++) w = Math.max(w, Math.abs(ours(s, i / 1000) - css(s, i / 1000))); } return w; })()`);
      console.log('worst difference from the CSS easing:', worst);
      expect(worst).toBeLessThan(1e-4);
      expect(await cdp.eval('window.__logs')).toEqual([]);
    });
  }, 120000);
});
