// The way every test film is opened: the shared Chrome of tests/support/browser.ts, the repository served, the film navigated and waited for.
// A film is tests/films/<name>.html; its test is the .test.ts beside it. See docs/superpowers/specs/2026-10-15-test-films-design.md.
import { describe } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as mb from 'mediabunny';
import { launchPage } from '../../support/browser';

const root = resolve(__dirname, '../../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** Films run only where browser tests run: a Chrome, a built dist/, and not `SKIP_BROWSER_TESTS` (CI sets it). */
export const filmsEnabled = !!chrome && built && !process.env.SKIP_BROWSER_TESTS;
export const runFilms = describe.skipIf(!filmsEnabled);

export interface Film {
  cdp: any;
  /** Run an expression in the page and return its (JSON-able) value; promises are awaited. */
  eval<T = any>(expression: string): Promise<T>;
  /** `movie.render(opts)` in the page, handed back as the real file. */
  render(opts?: object): Promise<Buffer>;
}

export async function withFilm<T>(name: string, fn: (film: Film) => Promise<T>, o: { query?: string; /** how long to wait for `window.__ready` (default 60) */ readySeconds?: number; /** a script run in the page before anything else on every load (e.g. to remove `navigator.gpu`) */ beforeLoad?: string } = {}): Promise<T> {
  const file = join(root, 'tests/films', `${name}.html`);
  if (!existsSync(file)) throw new Error(`film "${name}" not found: looked for tests/films/${name}.html`);
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'film-'));
  let proc: { kill(): void } | undefined;
  try {
    const page = await launchPage(chrome, dir);
    proc = page.proc; const cdp = page.cdp;
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    if (o.beforeLoad) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: o.beforeLoad });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/films/${name}.html${o.query ? `?${o.query}` : ''}` });
    let ready = false;
    const readySeconds = o.readySeconds ?? 60;
    for (let i = 0; i < readySeconds * 5 && !ready; i++) { ready = await cdp.eval('window.__ready === true').catch(() => false); if (!ready) await check.sleep(200); }
    if (!ready) throw new Error(`film "${name}" never became ready (${readySeconds} s); the page said: ${JSON.stringify(await cdp.eval('window.__logs').catch(() => null))}`);
    const film: Film = {
      cdp,
      eval: (expression) => cdp.eval(expression),
      render: async (opts = {}) => {
        const b64: string = await cdp.eval(`(async () => { const blob = await movie.render(${JSON.stringify(opts)}); const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); })()`);
        return Buffer.from(b64, 'base64');
      },
    };
    return await fn(film);
  } finally {
    try { proc?.kill(); } catch { /* gone */ }
    server.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* held a moment longer */ }
  }
}

/** What a file's picture really holds, counted from its packets: frames, the picture's own length, the frame numbers of the key packets, and the sound's length (null: no sound). */
export async function pictureFrames(file: Buffer): Promise<{ frames: number; seconds: number; keyFrames: number[]; audioSeconds: number | null }> {
  const input = new mb.Input({ source: new mb.BufferSource(new Uint8Array(file)), formats: mb.ALL_FORMATS });
  const v = (await input.getPrimaryVideoTrack())!;
  const a = await input.getPrimaryAudioTrack();
  const stamps: number[] = [], keys: number[] = [];
  for await (const p of new mb.EncodedPacketSink(v).packets(undefined, undefined, { metadataOnly: true })) { stamps.push(p.timestamp); if (p.type === 'key') keys.push(p.timestamp); }
  const sorted = [...stamps].sort((x, y) => x - y);
  const frameOf = (t: number) => sorted.findIndex((s) => Math.abs(s - t) < 1e-6);
  return { frames: stamps.length, seconds: await v.computeDuration(), keyFrames: keys.map(frameOf), audioSeconds: a ? await a.computeDuration() : null };
}
