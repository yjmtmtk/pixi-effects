// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const photo = readdirSync(join(root, 'examples/_assets/photos')).find((f) => /\.(jpe?g|png)$/i.test(f));

async function withRunner<T>(fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/sandbox-runner.html` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), 'the runner page became ready').toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const run = (cdp: any, code: string) => cdp.eval(`runner.run(${JSON.stringify(code)})`);
const call = (cdp: any, cmd: string, args: object = {}) => cdp.eval(`runner.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then(r => ({ ok: true, r }), e => ({ ok: false, error: e.message }))`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the Playground\'s sandboxed runner, on a real browser', () => {
  it('runs the default code: module imports, the movie, and the bridge (status, review, look, onion, render)', async () => {
    await withRunner(async (cdp) => {
      const status = await run(cdp, await cdp.eval('window.defaultCode'));
      expect(status).toMatchObject({ ready: true, duration: 6, width: 1280 });
      const before = (await call(cdp, 'status')).r.frame;
      const review = await call(cdp, 'review');
      expect(review.ok, review.error).toBe(true);
      expect((await call(cdp, 'status')).r.frame, 'review leaves the playhead where it was').toBe(before);
      expect(review.r.frames).toBeGreaterThan(10);
      expect(review.r.problems).toEqual([]);
      expect(review.r.audio).toBeNull();
      const look = await call(cdp, 'look', { count: 3 });
      expect(look.r.image.startsWith('data:image/png')).toBe(true);
      const onion = await call(cdp, 'onion', { from: 0, to: 2, count: 3 });
      expect(onion.r.image.startsWith('data:image/png')).toBe(true);
      const draft = await call(cdp, 'render', { draft: true, range: [0, 2] });
      expect(draft.ok, draft.error).toBe(true);
      expect(draft.r.bytes).toBeGreaterThan(1000);                              // WebCodecs encoding works inside the sandbox
      expect((await call(cdp, 'seek', { frame: 30 })).r.ready).toBe(true);
    });
  }, 240000);

  it('the code in the frame cannot reach the page, the site\'s storage or the address of the top window', async () => {
    await withRunner(async (cdp) => {
      const title = await cdp.eval('document.title');
      const code = `const sequences = [];
for (const [name, fn] of [['parent.document', () => parent.document.title], ['localStorage', () => localStorage.getItem('x')], ['top.location', () => { top.location = 'about:blank'; }]]) {
  try { fn(); window.__add('LEAK ' + name); } catch (e) { window.__add('blocked: ' + name); }
}
const W = 640, H = 360, FPS = 30, DURATION = 1, BACKGROUND = '#000000', POSTER = 0;`;
      const status = await run(cdp, code);
      const logs: string[] = status.logs;
      expect(logs.filter((l) => l.startsWith('LEAK'))).toEqual([]);
      expect(logs.filter((l) => l.startsWith('blocked:'))).toHaveLength(3);
      expect(await cdp.eval('document.title')).toBe(title);
      expect(await cdp.eval('location.pathname')).toBe('/examples/_checks/sandbox-runner.html');
    });
  }, 120000);

  it('refuses what it does not know and what is not running', async () => {
    await withRunner(async (cdp) => {
      const early = await call(cdp, 'status');
      expect(early.ok).toBe(false);
      expect(early.error).toMatch(/press Run/);
      await run(cdp, await cdp.eval('window.defaultCode'));
      const bad = await call(cdp, 'eval', { code: 'alert(1)' });
      expect(bad.ok).toBe(false);
      expect(bad.error).toMatch(/unknown command "eval"/);
    });
  }, 120000);

  it('a command sent while the movie is still starting is refused with a clear message, never left hanging', async () => {
    await withRunner(async (cdp) => {
      const code = await cdp.eval('window.defaultCode');
      const r = await cdp.eval(`(async () => {
        const started = runner.run(${JSON.stringify(code)});
        const early = await runner.call('review').then(() => 'answered', (e) => e.message);
        const status = await started;
        return { early, ready: status.ready, later: await runner.call('status').then((x) => x.ready, (e) => e.message) };
      })()`);
      expect(r.early).toMatch(/still starting/);
      expect(r.ready).toBe(true);
      expect(r.later).toBe(true);                                               // and once it is ready, commands are answered
    });
  }, 120000);

  it('a movie that never becomes ready (an endless loop in its code) is given up on: the run settles with a reason and the frame is gone', async () => {
    await withRunner(async (cdp) => {
      const r = await cdp.eval(`(async () => {
        const rn = runnerWith({ startTimeoutMs: 2500 });
        const t0 = performance.now();
        const status = await rn.run("const W = 640, H = 360, FPS = 30, DURATION = 2, BACKGROUND = '#000', POSTER = 1; const sequences = (() => { for (;;) {} })();");
        const frames = document.querySelectorAll('#host iframe').length;
        const after = await rn.call('status').then(() => 'answered', (e) => e.message);
        return { ready: status.ready, failed: status.failed, secs: Math.round((performance.now() - t0) / 100) / 10, frames, after };
      })()`);
      expect(r.ready).toBe(false);
      expect(r.failed).toMatch(/did not become ready/);
      expect(r.secs).toBeLessThan(8);
      expect(r.frames).toBe(0);
      expect(r.after).toMatch(/press Run/);                                       // not stuck on "still starting"
    });
  }, 120000);

  it('a command the frame does not answer in time is given up on with a clear message (it must not block an agent\'s queue for ever)', async () => {
    await withRunner(async (cdp) => {
      const r = await cdp.eval(`(async () => {
        const rn = runnerWith({ commandTimeoutMs: 5 });
        await rn.run(window.defaultCode);
        const slow = await rn.call('review').then(() => 'answered', (e) => e.message);
        return slow;
      })()`);
      expect(r).toMatch(/did not answer/);
    });
  }, 120000);

  it('assets resolve from the examples folder, and sound goes through the mix', async () => {
    await withRunner(async (cdp) => {
      const code = `const W = 640, H = 360, FPS = 30, DURATION = 2, BACKGROUND = '#000000', POSTER = 1;
const INIT = { assets: [{ name: 'bg', src: '_assets/photos/${photo}' }] };
const sequences = [
  { type: 'image', asset: 'bg', initial: { x: 0, y: 0 } },
  { type: 'audio', sfx: 'pop', at: 0.2 },
];`;
      const status = await run(cdp, code);
      expect(status.failed, JSON.stringify(status.logs)).toBeUndefined();
      expect(status.ready).toBe(true);
      const review = await call(cdp, 'review');
      expect(review.r.audio).not.toBeNull();
      expect(review.r.audio.sources.length).toBeGreaterThan(0);
    });
  }, 120000);
});
