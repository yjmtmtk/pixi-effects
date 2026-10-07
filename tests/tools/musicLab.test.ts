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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('examples/music-lab.html in a real browser', () => {
  it('lists the tunes, renders and plays one on a click, plays only one at a time, and saves a WAV', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'music-lab-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/music-lab.html` });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i++) { await check.sleep(250); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval(`document.querySelectorAll('.tune').length`)).toBe(8);
      expect(await cdp.eval(`document.querySelector('details pre').textContent.includes("inst: 'keys'")`)).toBe(true);        // the score is shown as source
      await cdp.eval(`document.querySelectorAll('.play')[2].click()`);
      for (let i = 0; i < 80; i++) { await check.sleep(250); if (await cdp.eval(`window.__lab.playing`).catch(() => null)) break; }
      expect(await cdp.eval(`window.__lab.playing`)).toBe('heroic');
      expect(await cdp.eval(`window.__lab.rendered.heroic`)).toBeGreaterThan(20);
      expect(await cdp.eval(`document.querySelectorAll('.tune.playing').length`)).toBe(1);
      expect(await cdp.eval(`document.querySelectorAll('.play')[2].getAttribute('aria-label')`)).toMatch(/^Stop/);
      expect(await cdp.eval(`document.querySelectorAll('.save')[2].hidden`)).toBe(false);
      await cdp.eval(`document.querySelectorAll('.play')[3].click()`);                       // another tune: the first stops
      for (let i = 0; i < 80; i++) { await check.sleep(250); if (await cdp.eval(`window.__lab.playing === 'jingle'`).catch(() => false)) break; }
      expect(await cdp.eval(`window.__lab.playing`)).toBe('jingle');
      expect(await cdp.eval(`document.querySelectorAll('.tune.playing').length`)).toBe(1);
      await cdp.eval(`document.querySelectorAll('.play')[3].click()`);                       // stop it
      expect(await cdp.eval(`window.__lab.playing`)).toBeNull();
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);
});
