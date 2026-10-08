// @vitest-environment node
// Starting a browser costs about two seconds and a pile of LaunchServices entries; the browser tests share one browser per worker and
// give each test its own tab. This is what that has to keep true.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage, browserCount } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();

describe.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS || process.env.PE_FRESH_BROWSER)('the browser tests share one browser', () => {
  it('two tests get two tabs of the same browser, not two browsers', async () => {
    const portOf = (c: { ws: { url: string } }) => new URL(c.ws.url).port;      // a browser has one DevTools port
    const a = await launchPage(chrome, '/unused', []);
    const portA = portOf(a.cdp as never);
    a.proc.kill();
    const b = await launchPage(chrome, '/unused', []);
    expect(portOf(b.cdp as never), 'the second test started another browser').toBe(portA);
    const c = await launchPage(chrome, '/unused', []);                          // and a third tab at the same time
    expect(portOf(c.cdp as never)).toBe(portA);
    expect(browserCount()).toBeGreaterThanOrEqual(1);
    b.proc.kill(); c.proc.kill();
  }, 60000);

  it('a tab is a page of its own: what one test leaves in it is gone for the next (a new tab, a new server address)', async () => {
    const first = await check.serve(root);
    const a = await launchPage(chrome, '/unused', []);
    await a.cdp.send('Page.enable'); await a.cdp.send('Runtime.enable');
    await a.cdp.send('Page.navigate', { url: `http://127.0.0.1:${first.port}/ai/chat-template.html` });
    await check.sleep(800);
    await a.cdp.eval(`localStorage.setItem('left-behind', '1'); window.leaked = 1; 1`);
    a.proc.kill();
    const second = await check.serve(root);                          // every test starts its own server: another port is another origin
    const b = await launchPage(chrome, '/unused', []);
    await b.cdp.send('Page.enable'); await b.cdp.send('Runtime.enable');
    await b.cdp.send('Page.navigate', { url: `http://127.0.0.1:${second.port}/ai/chat-template.html` });
    await check.sleep(800);
    expect(await b.cdp.eval(`window.leaked === undefined && localStorage.getItem('left-behind') === null`)).toBe(true);
    b.proc.kill(); first.server.close(); second.server.close();
  }, 60000);

  it('closing a tab ends its connection; the other tab keeps working', async () => {
    const a = await launchPage(chrome, '/unused', []);
    const b = await launchPage(chrome, '/unused', []);
    await a.cdp.send('Runtime.enable'); await b.cdp.send('Runtime.enable');
    a.proc.kill();
    await check.sleep(500);
    await expect(a.cdp.eval('1')).rejects.toThrow(/closed/);
    expect(await b.cdp.eval('1 + 1')).toBe(2);
    b.proc.kill();
  }, 60000);

  it('a test that needs other browser flags gets a browser of its own', async () => {
    const a = await launchPage(chrome, '/unused', []);
    const afterA = browserCount();
    const b = await launchPage(chrome, '/unused', ['--disable-site-isolation-trials']);
    expect(browserCount()).toBe(afterA + 1);
    const c = await launchPage(chrome, '/unused', ['--disable-site-isolation-trials']);   // the same flags again: the same browser
    expect(browserCount()).toBe(afterA + 1);
    a.proc.kill(); b.proc.kill(); c.proc.kill();
  }, 60000);
});

describe.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS)('PE_FRESH_BROWSER=1 starts a browser per test again', () => {
  it('launchPage then starts a browser of its own (its profile directory is in use) and kill() stops it', async () => {
    const prev = process.env.PE_FRESH_BROWSER; process.env.PE_FRESH_BROWSER = '1';
    const dir = mkdtempSync(join(tmpdir(), 'fresh-'));
    const using = (): boolean => { try { return execFileSync('pgrep', ['-f', '--', `--user-data-dir=${dir}`]).toString().trim() !== ''; } catch { return false; } };
    try {
      const a = await launchPage(chrome, dir, []);
      expect(using()).toBe(true);
      a.proc.kill();
      for (let i = 0; i < 20 && using(); i++) await check.sleep(250);
      expect(using()).toBe(false);
    } finally { if (prev === undefined) delete process.env.PE_FRESH_BROWSER; else process.env.PE_FRESH_BROWSER = prev; rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  }, 60000);
});
