// @vitest-environment node
// A guide demo is shown in a frame of the guide's own proportions (16:9, 100 % of the article). A demo page whose content is taller than that frame
// scrolls inside it: the generated pages had `body { padding: 16px }` and an inline canvas, so every one of them scrolled by 20 px.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const demos = readdirSync(join(root, 'examples/_guide')).filter((f) => f.endsWith('.html')).sort();

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the generated guide demos fit their frame', () => {
  it('no demo page scrolls inside a 16:9 frame, at the article width and at a phone width', async () => {
    const srv = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'pixi-effects-demofit-'));
    const { proc, cdp } = await check.launchChrome(chrome, dir);
    const bad: string[] = [];
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      for (const [w, h] of [[880, 495], [360, 203]]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        for (const name of demos) {
          await cdp.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/examples/_guide/${name}` });
          await check.sleep(1500);
          // what a visitor sees: can the page be scrolled (content larger than the frame AND not clipped), and does the picture fill the frame exactly
          const r = await cdp.eval(`(() => {
            const de = document.documentElement, ov = (e) => getComputedStyle(e).overflow + ' ' + getComputedStyle(e).overflowY;
            const clipped = /hidden|clip/.test(ov(de)) || /hidden|clip/.test(ov(document.body));
            const c = document.querySelector('canvas').getBoundingClientRect();
            return { scrolls: !clipped && (de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1), dw: Math.round(c.width - innerWidth), dh: Math.round(c.height - innerHeight), top: Math.round(c.top), left: Math.round(c.left) };
          })()`);
          if (r.scrolls) bad.push(`${name} at ${w}x${h}: the page scrolls inside the frame`);
          if (Math.abs(r.dw) > 1 || Math.abs(r.dh) > 1 || r.top !== 0 || r.left !== 0) bad.push(`${name} at ${w}x${h}: the picture is ${r.dw} px wider and ${r.dh} px taller than the frame, at ${r.left},${r.top}`);
        }
      }
    } finally { proc.kill(); srv.server.close(); rmSync(dir, { recursive: true, force: true }); }
    expect(bad).toEqual([]);
  }, 300_000);
});
