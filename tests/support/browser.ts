// A browser for the browser tests, shared. Starting Chrome costs about two seconds (start-up and the page's modules, fetched afresh for a
// new profile) and registers a dozen helper processes with macOS; a full run started it hundreds of times. Now each test worker starts one
// browser per set of flags, and every test gets a tab of it (a new tab costs milliseconds and the cache is shared). The call has the shape
// of `check.launchChrome(chrome, dir, args)` and returns the same `{ proc, cdp }`, so a test changes by one word: `proc.kill()` closes the tab.
// `PE_FRESH_BROWSER=1` brings back one browser per test (to tell a problem of the sharing from a problem of the test).
import { afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Cdp = { send(method: string, params?: object): Promise<any>; eval(expression: string): Promise<any>; on(fn: (m: any) => void): void; ws: { close(): void }; closed: boolean };
interface Shared { proc: { kill(): boolean }; port: number; browser: Cdp; dir: string }

const checkUrl = pathToFileURL(resolve(__dirname, '../../ai/tools/check.mjs')).href;
const check: any = await import(/* @vite-ignore */ checkUrl);
const shared = new Map<string, Promise<Shared>>();

async function start(chrome: string, args: string[]): Promise<Shared> {
  const dir = mkdtempSync(join(tmpdir(), 'pe-shared-'));
  const { proc, port, endpoint } = await check.launchChrome(chrome, dir, args);
  const ws = new WebSocket(endpoint);
  await new Promise<void>((ok, bad) => { ws.onopen = () => ok(); ws.onerror = () => bad(new Error('could not connect to the browser')); });
  return { proc, port, dir, browser: new check.Cdp(ws) };
}

/** Number of browsers this worker has started (for the tests of this helper). */
export const browserCount = (): number => shared.size;

/** Stop every browser this worker started. Also done when the worker ends (the launcher's watchdog), and registered below. */
export async function closeAll(): Promise<void> {
  const all = [...shared.values()]; shared.clear();
  for (const p of all) { try { const s = await p; s.browser.ws.close(); s.proc.kill(); rmSync(s.dir, { recursive: true, force: true }); } catch { /* it never started */ } }
}
afterAll(closeAll);

/**
 * Like `check.launchChrome(chrome, dir, extraArgs)` → `{ proc, cdp }`: `cdp` talks to a new tab; `proc.kill()` closes that tab (the
 * browser stays for the next test). `dir` is only used when `PE_FRESH_BROWSER` is set.
 */
export async function launchPage(chrome: string, dir: string, extraArgs: string[] = []): Promise<{ proc: { kill(): boolean }; cdp: Cdp }> {
  if (process.env.PE_FRESH_BROWSER) return check.launchChrome(chrome, dir, extraArgs);
  const key = JSON.stringify(extraArgs);
  let entry = shared.get(key);
  if (!entry) { entry = start(chrome, extraArgs); shared.set(key, entry); entry.catch(() => shared.delete(key)); }
  const { port, browser } = await entry;
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
  await new Promise<void>((ok, bad) => { ws.onopen = () => ok(); ws.onerror = () => bad(new Error('could not connect to the new tab')); });
  const cdp: Cdp = new check.Cdp(ws);
  return {
    cdp,
    proc: { kill: () => { browser.send('Target.closeTarget', { targetId }).catch(() => {}); try { ws.close(); } catch { /* closed */ } return true; } },
  };
}
