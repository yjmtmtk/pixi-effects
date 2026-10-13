// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import http from 'node:http';
const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const cli: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/pixi-effects.mjs')).href);

describe('the media commands: the command line', () => {
  it('routes probe, trim, frames and sound to media.mjs with the command word, and the usage text lists them', () => {
    for (const c of ['probe', 'trim', 'frames', 'sound']) expect(cli.route([c, 'a.mp4'])).toEqual({ tool: 'media.mjs', args: [c, 'a.mp4'] });
    expect(cli.route([]).usage).toMatch(/probe[\s\S]*trim[\s\S]*frames[\s\S]*sound/);
    expect(cli.route(['prob', 'a.mp4']).error).toMatch(/did you mean "probe"/);
  });

  it('parses a trim: file, start, end, -o; times may be 12.5 or 1:02.5', () => {
    const r = media.parseMediaArgs(['trim', 'in.mp4', '2.5', '1:02.5', '-o', 'out.mp4', '--exact']);
    expect(r).toMatchObject({ command: 'trim', file: 'in.mp4', opts: { start: 2.5, end: 62.5, out: 'out.mp4', exact: true } });
    expect(media.parseTime('1:02:03')).toBe(3723);
    expect(() => media.parseTime('a lot')).toThrow(/seconds/);
  });

  it('a usage mistake is exit code 2 with a sentence (no file, a missing -o, an unknown option with a guess, a path with spaces unquoted)', async () => {
    const lines: string[] = [];
    const io = { log: (s: string) => lines.push(s), err: (s: string) => lines.push(s) };
    expect(await media.runMedia(['probe'], io)).toBe(2);
    expect(await media.runMedia(['trim', 'in.mp4', '1', '2'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/-o/);
    expect(await media.runMedia(['frames', 'in.mp4', '--att', '1'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/did you mean --at/);
    expect(await media.runMedia(['probe', 'my', 'clip.mp4'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/quotes/);
  });

  it('an existing output file is only replaced with --force, and a missing folder is made', () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-out-'));
    try {
      const out = join(dir, 'a b', 'été.mp4');
      media.prepareOutput(out);                                                   // the folder is made
      expect(existsSync(join(dir, 'a b'))).toBe(true);
      writeFileSync(out, 'x');
      expect(() => media.prepareOutput(out)).toThrow(/already exists.*--force/);
      expect(() => media.prepareOutput(out, { force: true })).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the media commands: the local server', () => {
  it('serves a registered input with Range (exact bytes, 206), refuses an id nobody registered, and takes PUT only for a plain file name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-srv-'));
    const input = join(dir, 'été café 日本.bin');
    const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
    writeFileSync(input, bytes);
    const srv = await media.serveMedia({ inputs: new Map([['a1', input]]), outDir: join(dir, 'out') });
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      const r = await fetch(`${base}/__in/a1`, { headers: { range: 'bytes=10-19' } });
      expect(r.status).toBe(206);
      expect(r.headers.get('content-range')).toBe('bytes 10-19/1000');
      expect(Buffer.from(await r.arrayBuffer()).equals(bytes.subarray(10, 20))).toBe(true);
      const tail = await fetch(`${base}/__in/a1`, { headers: { range: 'bytes=-5' } });
      expect(Buffer.from(await tail.arrayBuffer()).equals(bytes.subarray(995))).toBe(true);
      const past = await fetch(`${base}/__in/a1`, { headers: { range: 'bytes=990-5000' } });          // an end past the file is the end of the file
      expect(past.headers.get('content-range')).toBe('bytes 990-999/1000');
      expect((await past.arrayBuffer()).byteLength).toBe(10);
      const whole = await fetch(`${base}/__in/a1`);
      expect(whole.status).toBe(200);
      expect((await whole.arrayBuffer()).byteLength).toBe(1000);
      expect((await fetch(`${base}/__in/zz`)).status).toBe(404);
      expect((await fetch(`${base}/__in/a1`, { headers: { range: 'bytes=5000-' } })).status).toBe(416);
      expect((await fetch(`${base}/__out/frame-1.png`, { method: 'PUT', body: 'png' })).status).toBe(204);
      expect(readFileSync(join(dir, 'out', 'frame-1.png'), 'utf8')).toBe('png');
      const raw = (path: string) => new Promise<number>((ok) => { const q = http.request({ host: '127.0.0.1', port: srv.port, path, method: 'PUT' }, (r) => { r.resume(); ok(r.statusCode!); }); q.end('x'); });
      const before = readdirSync(dir).sort().join();
      for (const p of ['/__out/..', '/__out/../x.png', '/__out/%2e%2e', '/other.png']) expect(await raw(p), p).toBeGreaterThanOrEqual(400);      // nothing is written outside out/
      expect(readdirSync(dir).sort().join()).toBe(before);
      expect((await fetch(`${base}/__out/a%2Fb.png`, { method: 'PUT', body: 'x' })).status).toBe(400);
      expect((await fetch(`${base}/__mb/mediabunny.min.mjs`)).status).toBe(200);
      expect((await fetch(`${base}/__lib/not-built.js`)).status).toBe(404);      // /__lib is dist/<name>.js and nothing else (the rest of the package folder is the plain static server, as in check and render)
    } finally { await srv.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
