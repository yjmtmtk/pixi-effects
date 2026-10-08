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

/** Open examples/_checks/mask-bugs.html?case=… (optionally forcing WebGL), and return the picture as RGBA bytes plus `at(x, y)` brightness readers. */
async function picture(query: string): Promise<{ rgba: number[]; backend: string }> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'maskbugs-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/mask-bugs.html?${query}` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), 'the page became ready').toBe(true);
    const out = await cdp.eval(`(async () => {
      await movie.gotoFrame(0, true);
      const url = await movie.snapshot(0, { as: 'dataURL' });
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return { rgba: Array.from(g.getImageData(0, 0, c.width, c.height).data), backend: movie.app.renderer.name || String(movie.app.renderer.type) };
    })()`);
    return out;
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const W = 640;
const px = (p: { rgba: number[] }, x: number, y: number): [number, number, number] => { const i = (y * W + x) * 4; return [p.rgba[i]!, p.rgba[i + 1]!, p.rgba[i + 2]!]; };
const bright = (c: [number, number, number]) => (c[0] + c[1] + c[2]) / 3;
const isBackground = (c: [number, number, number]) => Math.abs(c[0] - 16) < 12 && Math.abs(c[1] - 16) < 12 && Math.abs(c[2] - 32) < 14;

/** Frame 15 of the `moving` scene reached after playing to the end, and fresh: they must be the same picture. */
async function seekPair(query: string): Promise<{ fresh: number[]; afterSeek: number[] }> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'maskseek-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/mask-bugs.html?${query}` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    return await cdp.eval(`(async () => {
      const read = async () => { const url = await movie.snapshot(15, { as: 'dataURL' }); const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return Array.from(g.getImageData(0, 0, c.width, c.height).data); };
      await movie.gotoFrame(15, true); const fresh = await read();
      await movie.gotoFrame(29, true); await movie.gotoFrame(2, true);
      const afterSeek = await read();
      return { fresh, afterSeek };
    })()`);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('masks, in a real browser (both backends)', () => {
  it('an alpha mask that moves gives the same picture at a frame whether you get there fresh or by seeking back (and the hole is where the mask is)', async () => {
    const { fresh, afterSeek } = await seekPair('case=moving');
    let differing = 0;
    for (let i = 0; i < fresh.length; i++) if (fresh[i] !== afterSeek[i]) differing++;
    expect(differing).toBe(0);
    // at frame 15 the hole's centre is at x = 200 + 240 * 15 / 30 = 320: the middle of the text shows the background there
    const at = (x: number, y: number) => { const i = (y * W + x) * 4; return [fresh[i]!, fresh[i + 1]!, fresh[i + 2]!] as [number, number, number]; };
    expect(isBackground(at(320, 180))).toBe(true);
  }, 120000);

  for (const backend of ['', '&gl']) {
    const label = backend ? 'WebGL' : 'default (WebGPU first)';

    it(`${label}: a text mask cuts out the LETTERS, not their bounding box`, async () => {
      const plain = await picture(`case=textPlain${backend}`);
      const masked = await picture(`case=text${backend}`);
      let differing = 0, letterPixels = 0, boxWhite = 0;
      for (let y = 0; y < 360; y++) for (let x = 0; x < W; x++) {
        const a = bright(px(plain, x, y)), b = bright(px(masked, x, y));
        if (a > 200) letterPixels++;
        if (b > 200) boxWhite++;
        if (Math.abs(a - b) > 60) differing++;
      }
      expect(letterPixels, 'the letters are on the picture').toBeGreaterThan(5000);
      expect(boxWhite / letterPixels, 'the masked rectangle shows about as much white as the letters themselves').toBeLessThan(1.25);
      expect(differing / letterPixels, 'and in the same places').toBeLessThan(0.12);
    }, 120000);

    it(`${label}: an inverted mask inside a masked group leaves a ring, and nothing outside the outer mask`, async () => {
      const p = await picture(`case=inverted${backend}`);
      expect(isBackground(px(p, 320, 180)), 'inside the hole (inverted mask): background').toBe(true);
      expect(px(p, 320 + 90, 180)[0], 'on the ring between the hole and the outer edge: red').toBeGreaterThan(200);
      expect(isBackground(px(p, 30, 30)), 'outside the outer mask: background, not the layer').toBe(true);
      expect(isBackground(px(p, 600, 330)), 'far outside: background').toBe(true);
    }, 120000);
  }
});
