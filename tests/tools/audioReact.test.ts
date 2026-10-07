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

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('audio-reactive, in a real browser', () => {
  it('a real music file is analysed (tempo, beats, a level that moves) the same way every time, and a layer on the beat is bigger on a beat than between beats', async () => {
    const { server, port } = await check.serve(root);
    const userDataDir = mkdtempSync(join(tmpdir(), 'audiofx-'));
    const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/audio-react.html` });
      let ready = false;
      for (let i = 0; i < 160 && !ready; i++) { await check.sleep(250); ready = await cdp.eval('window.__ready === true').catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');

      const env = await cdp.eval('window.env');
      expect(env.frames).toBe(480);                                         // 16 s at 30 fps, one value per frame (+1)
      expect(env.duration).toBeGreaterThan(15.9); expect(env.duration).toBeLessThan(16.1);
      expect(env.bpm).toBeGreaterThan(100); expect(env.bpm).toBeLessThan(140);
      expect(env.beats.length).toBeGreaterThan(20);
      expect(Math.max(...env.level)).toBe(1);
      expect(Math.min(...env.level)).toBeLessThan(0.7);                     // it is not flat: the music has loud and quiet moments

      // the same file analysed again gives the same numbers
      const same = await cdp.eval(`(async () => { const { audioEnvelope } = await import('../../dist/index.js'); const a = await audioEnvelope('../_assets/bgm.mp3'); return JSON.stringify(Array.from(a.beats)) === JSON.stringify(window.env.beats) && Array.from(a.series.level).every((v, i) => v === window.env.level[i]); })()`);
      expect(same).toBe(true);

      // the circle: how many white pixels on the frame of a beat, and on a frame 0.3 s after it (the pulse has decayed)
      const size = (frame: number) => cdp.eval(`(async () => {
        const url = await movie.snapshot(${frame}, { as: 'dataURL' });
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 128) n++;
        return n; })()`);
      const beat = env.beats.find((b: number) => b > 1 && b < 6 && !env.beats.some((o: number) => o > b && o < b + 0.35))!;
      const onBeat = await size(Math.round(beat * 30)), later = await size(Math.round((beat + 0.3) * 30));
      expect(onBeat).toBeGreaterThan(later * 1.8);                          // scale 3 on the beat against ~1 after the pulse has fallen
    } finally {
      try { proc.kill(); } catch { /* gone */ }
      server.close();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);
});
