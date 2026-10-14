// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeLateVideo } from '../support/offsetVideo';
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

describe('probe: what is in a file', () => {
  const fx = (n: string) => join(root, 'tests/fixtures/media', n);
  const run = async (argv: string[]) => { const out: string[] = [], err: string[] = []; const code = await media.runMedia(argv, { log: (s: string) => out.push(s), err: (s: string) => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; };

  it('colors.mp4: container, H.264 320x180 at 30 fps, AAC, 6 s, no notes; the text fits 12 lines', async () => {
    const p = await media.probeFile(fx('colors.mp4'));
    expect(p.container).toMatch(/mp4/i);
    expect(Math.abs(p.duration - 6)).toBeLessThan(0.1);
    expect(p.bytes).toBeGreaterThan(10_000);
    expect(p.video).toHaveLength(1);
    expect(p.video[0]).toMatchObject({ codec: 'avc', width: 320, height: 180, rotation: 0, fpsVaries: false });
    expect(Math.abs(p.video[0].fps - 30)).toBeLessThan(0.5);
    expect(p.audio).toHaveLength(1);
    expect(p.audio[0]).toMatchObject({ codec: 'aac', channels: 2 });
    expect(p.notes).toEqual([]);
    const r = await run(['probe', fx('colors.mp4')]);
    expect(r.code).toBe(0);
    expect(r.out.split('\n').length).toBeLessThanOrEqual(12);
    expect(r.out).toMatch(/avc.*320.180/);
  });

  it('colors.webm is VP9 + Opus and colors.mov is a MOV', async () => {
    const w = await media.probeFile(fx('colors.webm'));
    expect([w.video[0].codec, w.audio[0].codec]).toEqual(['vp9', 'opus']);
    expect((await media.probeFile(fx('colors.mov'))).container).toMatch(/mov|quicktime/i);
  });

  it('rotated.mp4 says "rotated 90°", video-only.mp4 says "no audio", audio-only.m4a says "no video"', async () => {
    const r = await media.probeFile(fx('rotated.mp4'));
    expect(r.video[0].rotation).toBe(90);
    expect(r.notes.join(' ')).toMatch(/rotated 90°/);
    expect((await media.probeFile(fx('video-only.mp4'))).notes.join(' ')).toMatch(/no audio/);
    const a = await media.probeFile(fx('audio-only.m4a'));
    expect(a.video).toEqual([]);
    expect(a.notes.join(' ')).toMatch(/no video/);
  });

  it('a video whose first frame is not at 0 says where it starts (video[].first and a note), and the end of the video is its own, not rounded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-late-'));
    try {
      const late = join(dir, 'late.mp4');
      await writeLateVideo(fx('colors.mp4'), late, 0.5);
      const p = await media.probeFile(late);
      expect(Math.abs(p.video[0].first - 0.5)).toBeLessThan(0.01);
      expect(p.notes.join(' ')).toMatch(/video starts at 0\.5 s/);
      const plain = await media.probeFile(fx('video-only.mp4'));
      expect(plain.video[0].first).toBe(0);
      expect(plain.notes.join(' ')).not.toMatch(/video starts at/);
      expect(Math.abs(plain.video[0].end - (6 + 1 / 30))).toBeLessThan(0.002);          // 181 frames at 30 fps: the last frame is at 6.0 and ends at 6.0333, not 6.033
      expect(Math.abs(plain.video[0].frameGap - 1 / 30)).toBeLessThan(0.0005);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('--keyframes on a file with no video does not print an empty key-frame line', async () => {
    const r = await run(['probe', fx('audio-only.m4a'), '--keyframes']);
    expect(r.out).not.toMatch(/key packets at/);
    expect(JSON.parse((await run(['probe', fx('audio-only.m4a'), '--keyframes', '--json'])).out).keyframes).toEqual([]);
  });

  it('--keyframes lists the key packets (0, 2, 4 s); --json is the same facts as JSON', async () => {
    const p = await media.probeFile(fx('colors.mp4'), { keyframes: true });
    expect(p.keyframes.slice(0, 3)).toEqual([0, 2, 4]);
    const r = await run(['probe', fx('colors.mp4'), '--json', '--keyframes']);
    const j = JSON.parse(r.out);
    expect(j.video[0].codec).toBe('avc');
    expect(j.keyframes.slice(0, 3)).toEqual([0, 2, 4]);
  });

  it('a frame rate that varies is said (a clip whose frames come at uneven times)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-vfr-'));
    try {
      const mb = await import('mediabunny');
      const out = join(dir, 'vfr.mp4');
      const input = new mb.Input({ source: new mb.FilePathSource(fx('colors.mp4')), formats: mb.ALL_FORMATS });
      const track = (await input.getPrimaryVideoTrack())!;
      const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.FilePathTarget(out) });
      const src = new mb.EncodedVideoPacketSource('avc'); output.addVideoTrack(src); await output.start();
      let i = 0, first = true, cfg = await track.getDecoderConfig();
      let t = 0;
      for await (const p of new mb.EncodedPacketSink(track).packets()) {
        if (i++ > 90) break;
        await src.add(p.clone({ timestamp: t, duration: i % 2 ? 0.02 : 0.05 }), first ? { decoderConfig: cfg! } : undefined); first = false;
        t += i % 2 ? 0.02 : 0.05;
      }
      await output.finalize();
      const p = await media.probeFile(out);
      expect(p.video[0].fpsVaries).toBe(true);
      expect(p.notes.join(' ')).toMatch(/variable frame rate/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('bad input is exit 1 with one sentence naming the file: missing, empty, a folder, not media; no stack lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-bad-'));
    try {
      writeFileSync(join(dir, 'empty.mp4'), '');
      writeFileSync(join(dir, 'notes.txt'), 'this is not a video, just some words '.repeat(50));
      const cases: Array<[string, RegExp]> = [[join(dir, 'nope.mp4'), /no such file/], [join(dir, 'empty.mp4'), /empty/], [dir, /folder/], [join(dir, 'notes.txt'), /not a media file/]];
      for (const [file, re] of cases) {
        const r = await run(['probe', file]);
        expect(r.code, file).toBe(1);
        expect(r.err, file).toMatch(re);
        expect(r.err, file).not.toMatch(/\n\s+at /);
        expect(r.err.split('\n').length, file).toBeLessThanOrEqual(2);
      }
      const real = await promisify(execFile)(process.execPath, [join(root, 'ai/tools/pixi-effects.mjs'), 'probe', 'http://127.0.0.1:1/x.mp4']).then(() => ({ code: 0, stderr: '' }), (e: any) => ({ code: e.code, stderr: String(e.stderr) }));
      expect(real.code).toBe(1);                                                     // run as the command: mediabunny's own retry log would add stack lines here
      expect(real.stderr.trim().split('\n')).toHaveLength(1);
      const url = await run(['probe', 'http://127.0.0.1:1/x.mp4']);
      expect(url.code).toBe(1);
      expect(url.err).toMatch(/could not read http:\/\/127\.0\.0\.1:1\/x\.mp4/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('trim: a cut by copy, with the real times', () => {
  const fx = (n: string) => join(root, 'tests/fixtures/media', n);
  const run = async (argv: string[]) => { const out: string[] = [], err: string[] = []; const code = await media.runMedia(argv, { log: (s: string) => out.push(s), err: (s: string) => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; };
  const tmp = () => mkdtempSync(join(tmpdir(), 'media-trim-'));
  /** The packets of a track between two source times, as byte strings (for "the same bytes as the source"). */
  async function packets(file: string, kind: 'video' | 'audio', from: number, to: number, shift = 0) {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.FilePathSource(file), formats: mb.ALL_FORMATS });
    const track = kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack();
    const out: Array<{ t: number; data: string }> = [];
    for await (const p of new mb.EncodedPacketSink(track!).packets()) {
      const t = Math.round((p.timestamp + shift) * 1000) / 1000;
      if (t >= from - 1e-3 && t < to - 1e-3) out.push({ t, data: Buffer.from(p.data).toString('base64') });
    }
    return out;
  }

  it('from a key frame (2 s): got exactly 2–4 s, copied, and the video packets are byte for byte the source\'s', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'cut.mp4');
      const r = await media.trimFile({ input: fx('colors.mp4'), start: 2, end: 4, out });
      expect(r).toMatchObject({ actual: [2, 4], mode: 'copy', reencoded: false });
      expect(r.tracks.join(' ')).toMatch(/video.*audio/);
      expect(r.notes).toEqual([]);
      const src = await packets(fx('colors.mp4'), 'video', 0, 2, -2), got = await packets(out, 'video', 0, 2);        // the source's 2–4 s, moved to start at 0
      expect(got.length).toBe(src.length);
      expect(got.map(p => p.data)).toEqual(src.map(p => p.data));          // not re-encoded: the same bytes
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /** First timestamp and length of each track of a file, read back with mediabunny (what a player gets, not what a report says). */
  async function tracksOf(file: string) {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.FilePathSource(file), formats: mb.ALL_FORMATS });
    const out: Record<string, { first: number; end: number }> = {};
    for (const [name, t] of [['video', await input.getPrimaryVideoTrack()], ['audio', await input.getPrimaryAudioTrack()]] as const) if (t) out[name] = { first: await t.getFirstTimestamp(), end: await t.computeDuration() };
    return out;
  }

  it('between key frames (3.3 s): a copy cannot start there, so it starts on the NEXT key frame (4 s) and says so, in the report and in actual', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'cut.mp4');
      const r = await run(['trim', fx('colors.mp4'), '3.3', '4.9', '-o', out, '--json']);
      expect(r.code).toBe(0);
      const j = JSON.parse(r.out);
      expect(j.requested).toEqual([3.3, 4.9]);
      expect(j.actual).toEqual([4, 4.9]);
      expect(j.notes.join(' ')).toMatch(/next key frame.*4.*--exact/s);
      // the FILE is what the report says: picture and sound both start at 0 and last 0.9 s (a copy that kept the sound from 3.3 s, or put the picture at 0.7 s, is 1.6 s long)
      const t = await tracksOf(out);
      expect(t.video!.first).toBeLessThan(0.05);
      expect(t.audio!.first).toBeLessThan(0.05);
      expect(Math.abs(t.video!.end - 0.9)).toBeLessThan(0.05);
      expect(Math.abs(t.audio!.end - 0.9)).toBeLessThan(0.06);
      const text = (await run(['trim', fx('colors.mp4'), '3.3', '4.9', '-o', out, '--force'])).out;
      expect(text).toMatch(/asked 3\.3–4\.9 s, got 4–4\.9 s/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a copy that is refused leaves nothing behind and never touches a file that was already there (the output is made aside and moved into place only when it worked)', async () => {
    const dir = tmp();
    try {
      const keep = join(dir, 'keep.webm'); copyFileSync(fx('colors.webm'), keep);
      const before = readFileSync(keep);
      const r = await run(['trim', fx('colors.mp4'), '2', '4', '-o', keep, '--force']);      // an H.264 track cannot be copied into webm
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/cannot be cut by copy into \.webm/);
      expect(readFileSync(keep).equals(before)).toBe(true);
      const fresh = join(dir, 'new.webm');
      expect((await run(['trim', fx('colors.mp4'), '2', '4', '-o', fresh])).code).toBe(1);
      expect(existsSync(fresh)).toBe(false);
      expect(readdirSync(dir).sort()).toEqual(['keep.webm']);                                  // no half-written part files either
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a range with no key frame inside (2.5–3.5) is exit 1 naming --exact and the key frames around it; no file is left', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'cut.mp4');
      const r = await run(['trim', fx('colors.mp4'), '2.5', '3.5', '-o', out]);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/no key frame/);
      expect(r.err).toMatch(/--exact/);
      expect(existsSync(out)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('an end past the file is cut at the end of the file and said; start after end, a start past the file, an unknown output type, and the input as the output are refused with a sentence', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'cut.mp4');
      const past = await media.trimFile({ input: fx('colors.mp4'), start: 4, end: 99, out });
      expect(past.actual[0]).toBe(4);
      expect(past.actual[1]).toBeGreaterThan(5.9);
      expect(past.notes.join(' ')).toMatch(/end is past the file/);
      expect((await run(['trim', fx('colors.mp4'), '4', '2', '-o', out, '--force'])).err).toMatch(/start must be before end/);
      expect((await run(['trim', fx('colors.mp4'), '50', '60', '-o', out, '--force'])).err).toMatch(/past the end of the file \(6/);
      expect((await run(['trim', fx('colors.mp4'), '2', '4', '-o', join(dir, 'x.avi')])).err).toMatch(/\.mp4, \.mov/);
      const same = join(dir, 'same.mp4'); copyFileSync(fx('colors.mp4'), same);
      expect((await run(['trim', same, '2', '4', '-o', same, '--force'])).err).toMatch(/would overwrite the input/);
      expect((await run(['trim', fx('colors.mp4'), '2', '4', '-o', out])).err).toMatch(/already exists.*--force/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('works for a file whose name has spaces and non-Latin letters, into a folder that does not exist yet, and for webm and mov', async () => {
    const dir = tmp();
    try {
      const odd = join(dir, 'été café 日本.mp4'); copyFileSync(fx('colors.mp4'), odd);
      const r = await run(['trim', odd, '2', '4', '-o', join(dir, 'new folder', 'cut ñ.mp4')]);
      expect(r.code, r.err).toBe(0);
      expect(existsSync(join(dir, 'new folder', 'cut ñ.mp4'))).toBe(true);
      const w = await media.trimFile({ input: fx('colors.webm'), start: 2, end: 4, out: join(dir, 'w.webm') });
      expect(w.tracks.join(' ')).toMatch(/vp9/);
      const m = await media.trimFile({ input: fx('colors.mov'), start: 2, end: 4, out: join(dir, 'm.mov') });
      expect(m.actual).toEqual([2, 4]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the local server survives a bad input', () => {
  it('an input id that is a folder (or a file that vanished) is an error response and the server keeps answering', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-srv2-'));
    try {
      const file = join(dir, 'a.bin'); writeFileSync(file, Buffer.alloc(100, 7));
      const srv = await media.serveMedia({ inputs: new Map([['dir', dir], ['file', file]]), outDir: join(dir, 'out') });
      try {
        const base = `http://127.0.0.1:${srv.port}`;
        const r = await fetch(`${base}/__in/dir`).then(x => x.status, () => 'closed');
        expect(r === 'closed' || r >= 400).toBe(true);
        expect((await fetch(`${base}/__in/file`)).status).toBe(200);                      // still alive
      } finally { await srv.close(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
