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

/** Render in the page with `opts`, then read the file back the way a player would: video metadata and decoded audio. */
const RENDER = (opts: object) => `(async () => {
  const blob = await movie.render(${JSON.stringify(opts)});
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.src = url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('no readable video')); setTimeout(() => rej(new Error('video metadata timeout')), 20000); });
  const info = { bytes: blob.size, video: { duration: v.duration, width: v.videoWidth, height: v.videoHeight } };
  try {
    const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await blob.arrayBuffer());
    const L = buf.getChannelData(0), sr = buf.sampleRate, peak = (a, b) => { let p = 0; for (let i = Math.floor(a * sr); i < Math.min(L.length, Math.floor(b * sr)); i++) p = Math.max(p, Math.abs(L[i])); return p; };
    info.audio = { duration: buf.duration, head: peak(0, 0.002), second: peak(0.2, 0.3), tail: peak(buf.duration - 0.002, buf.duration), before: peak(buf.duration - 0.3, buf.duration - 0.2) };
  } catch (e) { info.audio = { error: String(e.message || e) }; }
  return info;
})()`;

async function withMovie<T>(fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'range-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/render-range.html` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true')).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('render({ range, scale, draft }), in a real browser', () => {
  it('the whole movie as before; a range of seconds cuts the picture AND the sound; a named layer is its span', async () => {
    await withMovie(async (cdp) => {
      const full = await cdp.eval(RENDER({}));
      expect(Math.abs(full.video.duration - 4)).toBeLessThan(0.2);
      expect(Math.abs(full.audio.duration - 4)).toBeLessThan(0.2);

      const part = await cdp.eval(RENDER({ range: [1, 2.5] }));
      expect(Math.abs(part.video.duration - 1.5)).toBeLessThan(0.2);
      expect(Math.abs(part.audio.duration - 1.5)).toBeLessThan(0.2);                     // the audio is as long as the picture, not the whole movie
      expect(part.audio.head).toBeLessThan(0.02);                                         // a cut edge is faded (no click) ...
      expect(part.audio.second).toBeGreaterThan(0.01);                                    // ... and the sound is there right after it
      expect(part.audio.tail).toBeLessThan(part.audio.before);                            // the end fades out

      const title = await cdp.eval(RENDER({ range: 'title' }));
      expect(Math.abs(title.video.duration - 2)).toBeLessThan(0.2);
      expect(Math.abs(title.audio.duration - 2)).toBeLessThan(0.2);
    });
  }, 180000);

  it('scale and draft make the picture smaller (even sides) and the file smaller; the length is unchanged', async () => {
    await withMovie(async (cdp) => {
      const full = await cdp.eval(RENDER({}));
      const half = await cdp.eval(RENDER({ scale: 0.5 }));
      expect([half.video.width, half.video.height]).toEqual([160, 90]);
      expect(Math.abs(half.video.duration - full.video.duration)).toBeLessThan(0.1);
      const draft = await cdp.eval(RENDER({ draft: true }));
      expect([draft.video.width, draft.video.height]).toEqual([160, 90]);
      expect(draft.bytes).toBeLessThan(full.bytes);
      const odd = await cdp.eval(RENDER({ scale: 0.33 }));
      expect(odd.video.width % 2).toBe(0); expect(odd.video.height % 2).toBe(0);
    });
  }, 180000);

  it('says what is wrong with a range or a scale', async () => {
    await withMovie(async (cdp) => {
      const err = (opts: object) => cdp.eval(`movie.render(${JSON.stringify(opts)}).then(() => 'rendered', e => e.message)`);
      expect(await err({ range: [0, 9] })).toMatch(/goes past the end.*4 s long/);
      expect(await err({ range: 'nope' })).toMatch(/no layer named "nope".*title/);
      expect(await err({ range: [2, 1] })).toMatch(/must start before it ends/);
      expect(await err({ scale: 2 })).toMatch(/scale must be above 0 and at most 1/);
    });
  }, 120000);
});
