// @vitest-environment node
// The DevTools client must never wait for ever: a Chrome that is gone (killed, crashed) turned a test into a hang that only a timeout ended.
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

/** the part of a WebSocket the client uses */
function fakeSocket() {
  const sent: string[] = [];
  const ws: any = { sent, send: (s: string) => { sent.push(s); }, close() { ws.onclose?.({}); } };
  return ws;
}

describe('Cdp: no call waits for a browser that is gone', () => {
  it('a call in flight is rejected, with a message that says the connection closed, when the socket closes', async () => {
    const ws = fakeSocket(); const cdp = new check.Cdp(ws);
    const pending = cdp.send('Runtime.evaluate', { expression: '1' });
    ws.onclose({});
    await expect(pending).rejects.toThrow(/connection to Chrome closed/);
  });
  it('a call made after the socket closed is rejected at once', async () => {
    const ws = fakeSocket(); const cdp = new check.Cdp(ws);
    ws.onclose({});
    await expect(cdp.send('Page.enable')).rejects.toThrow(/connection to Chrome closed/);
    expect(ws.sent).toEqual([]);                                  // nothing was sent to a dead socket
  });
  it('an answer still resolves the call, and a socket error also rejects what is waiting', async () => {
    const ws = fakeSocket(); const cdp = new check.Cdp(ws);
    const ok = cdp.send('Page.enable');
    ws.onmessage({ data: JSON.stringify({ id: 1, result: { done: true } }) });
    await expect(ok).resolves.toEqual({ done: true });
    const waiting = cdp.send('Page.reload');
    ws.onerror?.({});
    ws.onclose({});
    await expect(waiting).rejects.toThrow(/connection to Chrome closed/);
  });
  it('a time limit is opt-in (a render takes minutes): with one, a call that is never answered is rejected', async () => {
    const ws = fakeSocket(); const cdp = new check.Cdp(ws);
    cdp.timeout = 50;
    await expect(cdp.send('Page.enable')).rejects.toThrow(/did not answer Page\.enable in 50 ms/);
    const long = new check.Cdp(fakeSocket());                     // no limit by default
    let settled = false; long.send('Page.enable').then(() => { settled = true; }, () => { settled = true; });
    await new Promise((r) => setTimeout(r, 80));
    expect(settled).toBe(false);
  });
});
