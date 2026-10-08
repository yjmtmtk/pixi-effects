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
  const dir = mkdtempSync(join(tmpdir(), 'tremap-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/time-remap.html` });
    for (let i = 0; i < 600; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }       // up to 2 minutes: the page renders its own clip first
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const near = (got: number, want: number, pct = 3): void => {
  expect(got, `${got} Hz vs ${want} Hz`).toBeGreaterThan(want * (1 - pct / 100));
  expect(got, `${got} Hz vs ${want} Hz`).toBeLessThan(want * (1 + pct / 100));
};
const audio = (extra: Record<string, unknown>) => JSON.stringify({ type: 'audio', asset: 'tone', ...extra });
const withTone = (cdp: any, duration: number, sequences: string, assets = `[{ name: 'tone', src: toneUrl(440, 4) }]`) =>
  cdp.eval(`mk({ duration: ${duration}, assets: ${assets}, composition: { sequences: [${sequences}] } })`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('time remap of sound, on a real browser', () => {
  it('an audio file: speed 2 doubles the pitch, speed 0.5 halves it, backward plays a sweep from high to low', async () => {
    await withPage(async (cdp) => {
      await withTone(cdp, 3, audio({ speed: 2 }));
      near(await cdp.eval('mixHz(0.2, 1.4)'), 880);
      await withTone(cdp, 3, audio({ speed: 0.5, duration: 3 }));
      near(await cdp.eval('mixHz(0.2, 2.8)'), 220);
      // (a different asset name: pixi keeps the first file loaded under a name, so 'tone' would still be the 440 Hz one)
      await withTone(cdp, 4, JSON.stringify({ type: 'audio', asset: 'sweep', speed: -1 }), `[{ name: 'sweep', src: chirpUrl(200, 1000, 4) }]`);
      expect(await cdp.eval('mixHz(0.1, 0.4)')).toBeGreaterThan(900);
      expect(await cdp.eval('mixHz(3.6, 3.9)')).toBeLessThan(300);
    });
  }, 300000);

  it('a freeze (time held at one value) is silent', async () => {
    await withPage(async (cdp) => {
      await withTone(cdp, 2, audio({ duration: 2, keyframes: [{ at: 0, from: { time: 1 }, to: { time: 1 }, duration: 2 }] }));
      expect(await cdp.eval('mixRms(0.3, 1.9)')).toBeLessThan(1e-3);
      await withTone(cdp, 2, audio({ duration: 2 }));
      expect(await cdp.eval('mixRms(0.3, 1.9)')).toBeGreaterThan(0.3);                  // the same layer without the freeze is loud: the silence is the remap's
    });
  }, 300000);

  it('an audio file inside a composition at speed 2 is twice as high', async () => {
    await withPage(async (cdp) => {
      await withTone(cdp, 2, JSON.stringify({ type: 'composition', duration: 2, speed: 2, sequences: [{ type: 'audio', asset: 'tone' }] }));
      near(await cdp.eval('mixHz(0.2, 1.8)'), 880);
    });
  }, 300000);

  it('an sfx inside a composition follows its clock: half as high at 0.5x, and heard at the END when the composition runs backward', async () => {
    await withPage(async (cdp) => {
      const comp = (extra: Record<string, unknown>) => JSON.stringify({ type: 'composition', duration: 4, ...extra, sequences: [{ type: 'audio', sfx: 'chime' }] });
      await withTone(cdp, 4, comp({}));
      const plain: number = await cdp.eval('mixHz(0, 1.4)');
      await withTone(cdp, 4, comp({ speed: 0.5 }));
      near(await cdp.eval('mixHz(0, 2.8)') / plain, 0.5, 10);
      await withTone(cdp, 4, comp({ speed: -1 }));                                       // the chime is local 0..1.4: at movie time 4 - 1.4 .. 4, backward
      expect(await cdp.eval('mixRms(0, 2.4)')).toBeLessThan(1e-3);
      expect(await cdp.eval('mixRms(2.8, 3.9)')).toBeGreaterThan(0.005);
    });
  }, 300000);

  it('inspectAudio says when a sound inside a remapped composition plays in the MOVIE\'s time (no false "after the movie ends")', async () => {
    await withPage(async (cdp) => {
      await withTone(cdp, 4, JSON.stringify({ type: 'composition', duration: 4, speed: 0.5, sequences: [{ type: 'audio', asset: 'tone', duration: 2 }] }));
      const r = await cdp.eval('movie.inspectAudio()');
      expect(r.sources[0].start).toBeCloseTo(0, 1);
      expect(r.sources[0].end).toBeCloseTo(4, 1);                                        // local 0..2 at half speed = movie 0..4
      expect(r.issues.filter((i: string) => /after the movie ends|cut off/.test(i))).toEqual([]);
    });
  }, 300000);

  it('duration not given: an audio file at speed 2 lasts half its length, at speed -1 all of it', async () => {
    await withPage(async (cdp) => {
      await withTone(cdp, 6, audio({ speed: 2 }));
      let s = (await cdp.eval('movie.inspectAudio()')).sources[0];
      expect(s.end - s.start).toBeCloseTo(2, 2);
      await withTone(cdp, 6, audio({ speed: -1 }));
      s = (await cdp.eval('movie.inspectAudio()')).sources[0];
      expect(s.end - s.start).toBeCloseTo(4, 2);
    });
  }, 300000);

  it('a looped file at speed 2 keeps sounding after one pass of the file', async () => {
    await withPage(async (cdp) => {
      await withTone(cdp, 3, JSON.stringify({ type: 'audio', asset: 'short', loop: true, speed: 2, duration: 3 }), `[{ name: 'short', src: toneUrl(440, 1) }]`);
      near(await cdp.eval('mixHz(1.2, 2.8)'), 880);                                      // the 1 s file is used up after 0.5 s
    });
  }, 300000);
});
