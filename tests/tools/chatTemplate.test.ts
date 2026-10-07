// @vitest-environment node
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const template = readFileSync(join(root, 'ai/chat-template.html'), 'utf8');
const onCdn = await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${version}/dist/index.js`, { method: 'HEAD' }).then((r) => r.ok, () => false);
// the template loads the released library from the CDN: a feature that is not released yet (the music chunk) cannot run in it until it is
const cdnHasMusic = await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${version}/dist/index.js`).then((r) => r.text()).then((t) => /music-[A-Z0-9]+\.js/.test(t), () => false);
const chrome = check.findChrome();

describe('ai/chat-template.html', () => {
  it('pins this release, loads only from cdn.jsdelivr.net, and needs no stylesheet or esm.sh', () => {
    expect([...template.matchAll(/pixi-effects@([\d.]+)\//g)].map((m) => m[1])).toEqual([version, version, version]);
    const urls = [...template.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => new URL(m[0]).host);
    expect(urls.filter((h) => h !== 'cdn.jsdelivr.net' && h !== 'raw.githubusercontent.com')).toEqual([]);
    expect(template).not.toContain('<link');
    expect(template).toContain('EDIT FROM HERE');
    expect(template).toContain('EDIT UNTIL HERE');
  });
});

// the kind of sandbox a chat preview gives a page: scripts only from a short list of CDNs, no network for the page itself, only a Google Fonts stylesheet.
// 'unsafe-eval' stays allowed: PixiJS builds its shaders with `new Function`, and its CSP-safe build cannot be loaded from a CDN as one module graph.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'img-src data: blob:', 'media-src data: blob:', 'font-src data:', "connect-src 'none'", 'worker-src blob:',
].join('; ');

/** Open `html` in Chrome under the sandbox policy; resolves with what the page says once it is ready (or after 40 s), and runs `then` on the open page. */
async function inSandbox<T>(html: string, then?: (cdp: any) => Promise<T>) {
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': CSP }); res.end(html); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const userDataDir = mkdtempSync(join(tmpdir(), 'chat-template-'));
  const { proc, cdp } = await check.launchChrome(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    let ready = false;
    for (let i = 0; i < 160 && !ready; i++) { await check.sleep(250); ready = await cdp.eval('window.__ready === true').catch(() => false); }
    await check.sleep(300);
    const logs = await cdp.eval('JSON.stringify(window.__logs)');
    const box = await cdp.eval(`({ display: document.getElementById('problems').style.display, text: document.getElementById('problems-text').textContent })`);
    return { ready, logs, box, extra: then ? await then(cdp) : undefined };
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    await check.sleep(200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}

describe.skipIf(!chrome || !onCdn || process.env.SKIP_BROWSER_TESTS)('ai/chat-template.html in a sandbox like a chat preview', () => {
  it('runs under a strict content security policy: no warnings, ready, and it exports an mp4', async () => {
    const r = await inSandbox(template, (cdp) => cdp.eval(`(async () => { const b = await movie.render({ format: 'mp4' }); return { type: b.type, size: b.size }; })()`));
    expect(r.logs).toBe('[]');
    expect(r.ready).toBe(true);
    expect(r.box.display).toBe('');                                            // nothing to show
    expect(r.extra.type).toContain('video/mp4');
    expect(r.extra.size).toBeGreaterThan(2000);
  }, 120_000);

  it('a mistake in the video shows in the red box, ready to be pasted back to the AI', async () => {
    const bad = template.replace('frameRate: FPS,', 'fps: FPS,');
    expect(bad).not.toBe(template);
    const r = await inSandbox(bad);
    expect(r.box.display).toBe('block');
    expect(r.box.text).toMatch(/fps.*frameRate/s);
  }, 120_000);

  for (const [name, seconds] of [['chat-example', 8], ['chat-music', 22]] as const) it.skipIf(name === 'chat-music' && !cdnHasMusic)(`the worked example "${name}" in ai/CHAT.md is a working video when put in the template`, async () => {
    const md = readFileSync(join(root, 'ai/CHAT.md'), 'utf8');
    const example = new RegExp('```js\\n// @' + name + '\\n([\\s\\S]*?)```').exec(md)?.[1];
    expect(example).toBeTruthy();
    const start = template.indexOf('===================== EDIT FROM HERE');
    const from = template.indexOf('\n', start) + 1;
    const until = template.lastIndexOf('    // =====================');          // the line of the closing marker (the first mention is in the header comment)
    const page = template.slice(0, from) + example!.replace(/^/gm, '    ') + template.slice(until);
    const r = await inSandbox(page, (cdp) => cdp.eval('movie.duration'));
    expect(r.logs).toBe('[]');
    expect(r.ready).toBe(true);
    expect(r.extra).toBe(seconds);
    if (name === 'chat-music') {
      const sound = await inSandbox(page, (cdp) => cdp.eval(`(async () => { const r = movie.inspectAudio(); return { sources: r.sources.map(s => s.source), peak: r.peakDb, issues: r.issues }; })()`));
      expect(sound.extra.sources).toEqual(['music']);
      expect(sound.extra.peak).toBeGreaterThan(-20);
      expect(sound.extra.issues).toEqual([]);
    }
  }, 120_000);
});
