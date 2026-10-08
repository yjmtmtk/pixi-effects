// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const share: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/share.js')).href);

describe('share links: the code in the address, packed', () => {
  it('round-trips code, including non-Latin text, newlines and $ patterns', async () => {
    const code = "const W = 1280;\n// 日本語のコメント ✓\nconst s = '$&$1';\n" + 'x'.repeat(5000);
    expect(await share.decode(await share.encode(code))).toBe(code);
  });
  it('the packed text is address-safe (base64url: no + / = characters) and shorter than the code for real code', async () => {
    const code = 'const sequences = [' + '{ type: "text", text: "hello" },'.repeat(50) + '];';
    const s = await share.encode(code);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeLessThan(code.length / 2);
  });
  it('codeFromHash reads #code=…, and is null for any other hash', async () => {
    const url = await share.shareUrl('const a = 1;', 'https://x.example/playground.html');
    expect(url.startsWith('https://x.example/playground.html#code=')).toBe(true);
    expect(await share.codeFromHash(url.slice(url.indexOf('#')))).toBe('const a = 1;');
    expect(await share.codeFromHash('')).toBeNull();
    expect(await share.codeFromHash('#other=1')).toBeNull();
  });
  it('broken input is an error that says so, not a crash', async () => {
    await expect(share.decode('not-valid-@@@')).rejects.toThrow(/link/i);
    await expect(share.decode('AAAA')).rejects.toThrow(/link/i);
  });
  it('a link that unpacks to something huge is refused (a packed bomb)', async () => {
    const bomb = await share.encode('0'.repeat(share.MAX_DECODED * 3));
    await expect(share.decode(bomb)).rejects.toThrow(/too large/i);
  });
  it('code at the limit still opens; one byte over does not', async () => {
    const edge = 'a'.repeat(share.MAX_DECODED);
    expect(await share.decode(await share.encode(edge))).toBe(edge);
    await expect(share.decode(await share.encode(edge + 'b'))).rejects.toThrow(/too large/i);
  });
  it('a #code= hash that is not packed text (a link pasted with a stray ")" or "." on the end) is an error that says so, not "no code"', async () => {
    const good = (await share.shareUrl('const a = 1;', 'x')).slice(1);
    await expect(share.codeFromHash(good + ')')).rejects.toThrow(/link/i);
    await expect(share.codeFromHash(good + '.')).rejects.toThrow(/link/i);
    await expect(share.codeFromHash('#code=abc def')).rejects.toThrow(/link/i);
    await expect(share.codeFromHash('#code=')).rejects.toThrow(/link/i);
  });
});
