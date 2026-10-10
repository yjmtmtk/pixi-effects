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
const run = describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS);

async function withPage<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'formats-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/render-formats.html?${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

/** Render in the page and report what the file is: its type, size, first bytes, and what mediabunny finds in it. */
const probe = (cdp: any, opts: object) => cdp.eval(`(async () => {
  try {
    const blob = await window.movie.render(${JSON.stringify(opts)});
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
    return { type: blob.type, size: blob.size, head: Array.from(head).map(c => String.fromCharCode(c)).join(''), video: v ? v.codec : null, audio: a ? a.codec : null, duration: await input.computeDuration() };
  } catch (e) { return { error: String(e.message || e) }; }
})()`);

run('render: sound-only formats and video options, on a real browser', () => {
  it('wav is only the sound: a RIFF file of the movie\'s length, with no picture', async () => {
    await withPage('', async (cdp) => {
      const r = await probe(cdp, { format: 'wav' });
      expect(r.error).toBeUndefined();
      expect(r.type).toBe('audio/wav');
      expect(r.head.startsWith('RIFF')).toBe(true);
      expect(r.video).toBeNull();
      expect(r.audio).toMatch(/pcm/);
      expect(r.duration).toBeGreaterThan(1.9);
      expect(r.duration).toBeLessThan(2.6);                     // the music's tail may run a little past the movie
      const part = await probe(cdp, { format: 'wav', range: [0.5, 1.5] });
      expect(part.duration).toBeGreaterThan(0.95);
      expect(part.duration).toBeLessThan(1.1);
    });
  }, 240000);

  it('ogg is Opus, only the sound; a movie with no sound says so instead of writing an empty file', async () => {
    await withPage('', async (cdp) => {
      const r = await probe(cdp, { format: 'ogg' });
      expect(r.error).toBeUndefined();
      expect(r.type).toMatch(/ogg/);
      expect(r.head.startsWith('OggS')).toBe(true);
      expect(r.audio).toBe('opus');
      expect(r.video).toBeNull();
    });
    await withPage('silent=1', async (cdp) => {
      const r = await probe(cdp, { format: 'wav' });
      expect(r.error).toMatch(/no sound to export/);
    });
  }, 240000);

  it('names the codec: hevc in an mp4, av1 in a webm, and the file really carries it', async () => {
    await withPage('', async (cdp) => {
      const hevc = await probe(cdp, { format: 'mp4', video: { codec: 'hevc' } });
      expect(hevc.error).toBeUndefined();
      expect(hevc.video).toBe('hevc');
      const av1 = await probe(cdp, { format: 'webm', video: { codec: 'av1' } });
      expect(av1.error).toBeUndefined();
      expect(av1.video).toBe('av1');
      const usual = await probe(cdp, { format: 'mp4' });
      expect(usual.video).toBe('avc');
    });
  }, 400000);

  it('a bitrate in bits a second is used: 300k makes a smaller file than 6M; "h264" and a bad hardware name are told what to write', async () => {
    await withPage('', async (cdp) => {
      const low = await probe(cdp, { format: 'mp4', video: { bitrate: '300k' } });
      const high = await probe(cdp, { format: 'mp4', video: { bitrate: 6_000_000 } });
      expect(low.size).toBeLessThan(high.size);
      expect((await probe(cdp, { format: 'mp4', video: { codec: 'h264' } })).error).toMatch(/did you mean "avc"/);
      expect((await probe(cdp, { format: 'mp4', video: { hardware: 'gpu' } })).error).toMatch(/prefer-hardware/);
      expect((await probe(cdp, { format: 'mp4', video: { bitrate: 'loud' } })).error).toMatch(/very-low.*8M/s);
      expect((await probe(cdp, { format: 'avi' })).error).toMatch(/wav, ogg/);
      await probe(cdp, { format: 'mp4', video: { bitrat: 1 } });
      expect((await cdp.eval('window.__logs')).some((l: string) => /bitrat/.test(l))).toBe(true);     // an unknown option is named
    });
  }, 400000);
});
