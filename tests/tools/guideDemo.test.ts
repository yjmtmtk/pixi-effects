// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const guide: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'scripts/build-guide.mjs')).href);

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the guide\'s live demos, in a real browser', () => {
  it('a deck demo starts with the first click and stops at its first stop, not at the end', async () => {
    const out = join(root, 'guide-preview');
    await guide.buildGuide({ srcDir: join(root, 'site/guide'), outDir: out });
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'guide-demo-'));
    const { proc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/guide-preview/presenting.html` });
      await check.sleep(1500);
      await cdp.eval(`document.querySelector('.facade').click()`);
      const frame = () => cdp.eval(`(() => { const w = document.querySelector('.facade iframe')?.contentWindow; return w && w.movie ? { frame: w.movie.currentFrame, playing: w.movie.isPlaying, first: w.movie.stops[0]?.frame } : null; })()`).catch(() => null);
      let s: any = null;
      for (let i = 0; i < 120; i++) { await check.sleep(250); s = await frame(); if (s && s.first && s.frame >= s.first && !s.playing) break; }
      expect(s).toMatchObject({ playing: false });
      expect(s.frame).toBe(s.first);                                                   // exactly on the first stop
      await check.sleep(1500);
      expect((await frame()).frame).toBe(s.first);                                     // and it stays there
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
});
