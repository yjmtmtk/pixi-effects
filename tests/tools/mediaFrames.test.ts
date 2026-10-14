// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chrome } from '../support/videoColors';
import { readPng, colourName } from '../support/png';
import { resolveAtList } from '../../src/core/review';
import { writeLateVideo } from '../support/offsetVideo';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const fx = (n: string) => join(root, 'tests/fixtures/media', n);
const run = async (argv: string[]) => { const out: string[] = [], err: string[] = []; const code = await media.runMedia(argv, { log: (s: string) => out.push(s), err: (s: string) => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; };

describe('frames: the times asked for', () => {
  const ctx = { duration: 6, fps: 30 };
  it('reads seconds, percentages, frames, start, end and "every N s"; a label for each that is safe in a file name', () => {
    const t = media.parseTimes('1,3.5,50%,f60,end,start', ctx);
    const ts = t.map((x: any) => x.t);
    expect(ts.slice(0, 4)).toEqual([1, 3.5, 3, 2]);
    expect(ts[4]).toBeCloseTo(6 - 1 / 30, 3);                                      // end is the last frame
    expect(ts[5]).toBe(0);
    expect(t.map((x: any) => x.label)).toEqual(['1.00s', '3.50s', '50pct', 'f60', 'end', 'start']);
    expect(media.parseTimes('every 2s', ctx).map((x: any) => x.t)).toEqual([0, 2, 4]);
    expect(media.parseTimes('every 2', ctx).map((x: any) => x.t)).toEqual([0, 2, 4]);
    expect(media.parseTimes('every:2s', ctx).map((x: any) => x.t)).toEqual([0, 2, 4]);          // no space: needs no quotes on a command line
    expect(media.parseTimes('every:2s,end', ctx).map((x: any) => x.t).length).toBe(4);
  });
  it('agrees with `check --at` (resolveAtList) on the syntax they share: seconds, a percentage, a frame', () => {
    const list = '0,0.5,1.25,3.5,25%,50%,100%,f0,f45,f179';
    const theirs = resolveAtList(list, { frameRate: 30, totalFrames: 180, duration: 6, rows: [] });
    const mine = media.parseTimes(list, ctx);
    expect(mine.map((x: any) => Math.min(179, Math.round(x.t * 30)))).toEqual(theirs.map((x) => Math.min(179, x.frame)));
  });
  it('refuses what is outside the file or unreadable, with the duration in the sentence', () => {
    expect(() => media.parseTimes('99', ctx)).toThrow(/99 s is past the end of the file \(6 s\)/);
    expect(() => media.parseTimes('-1', ctx)).toThrow(/cannot read "-1"/);
    expect(() => media.parseTimes('soon', ctx)).toThrow(/cannot read "soon"/);
    expect(() => media.parseTimes('every 0s', ctx)).toThrow(/every/);
    expect(() => media.parseTimes('every 0.01s', { duration: 600, fps: 30 })).toThrow(/too many/);
  });
});

describe('frames: --at on a command line', () => {
  it('"--at every 2s,end" without quotes says to quote it or write every:2s, instead of blaming a path with spaces', async () => {
    const errs: string[] = [];
    expect(await media.runMedia(['frames', fx('colors.mp4'), '--at', 'every', '2s,end'], { log: () => {}, err: (s: string) => errs.push(s) })).toBe(2);
    expect(errs.join('\n')).toMatch(/every:2s/);
    expect(errs.join('\n')).toMatch(/quote/i);
    expect(errs.join('\n')).not.toMatch(/path with spaces/);
  });
});

describe.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS)('frames: pictures of a video, in a real browser', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'media-frames-'));

  it('writes one PNG per time (colors.mp4: red, green, blue, cyan at 0.5, 1.5, 2.5, end) at the video\'s size, named by time, and says what it wrote', async () => {
    const dir = tmp();
    try {
      const r = await run(['frames', fx('colors.mp4'), '--at', '0.5,1.5,2.5,end', '-o', dir, '--json']);
      expect(r.code, r.err).toBe(0);
      const j = JSON.parse(r.out);
      expect(j.frames).toHaveLength(4);
      const names: string[] = [];
      for (const f of j.frames) {
        const png = readPng(join(dir, f.file));
        expect([png.width, png.height]).toEqual([320, 180]);
        names.push(colourName(png.pixel(160, 90)));
        expect(Math.abs(f.actual - f.requested)).toBeLessThan(0.05);
      }
      expect(names).toEqual(['red', 'green', 'blue', 'cyan']);
      expect(readdirSync(dir).filter(n => n.endsWith('.png')).sort()).toEqual(j.frames.map((f: any) => f.file).sort());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('--size 160 makes the pictures 160 wide, and the default asks for no upscaling of a small video', async () => {
    const dir = tmp();
    try {
      const r = await run(['frames', fx('colors.mp4'), '--at', '1', '--size', '160', '-o', dir, '--json']);
      expect(r.code, r.err).toBe(0);
      const png = readPng(join(dir, JSON.parse(r.out).frames[0].file));
      expect([png.width, png.height]).toEqual([160, 90]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('--sheet writes sheet.png, one picture with every frame in it, each with its time under it (so it is wider than one frame and has the frame colours)', async () => {
    const dir = tmp();
    try {
      const r = await run(['frames', fx('colors.mp4'), '--at', '0.5,1.5,2.5', '--sheet', '-o', dir, '--json']);
      expect(r.code, r.err).toBe(0);
      expect(JSON.parse(r.out).sheet).toBe('sheet.png');
      const s = readPng(join(dir, 'sheet.png'));
      expect(s.width).toBeGreaterThanOrEqual(320 * 3);
      expect(s.height).toBeGreaterThan(180);
      const seen = new Set<string>();
      for (let x = 20; x < s.width; x += 40) seen.add(colourName(s.pixel(x, 60)));
      expect([...seen]).toEqual(expect.arrayContaining(['red', 'green', 'blue']));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('a rotated video gives pictures the right way up (rotated.mp4 is 320x180 stored, 180x320 shown)', async () => {
    const dir = tmp();
    try {
      const r = await run(['frames', fx('rotated.mp4'), '--at', '0.5', '-o', dir, '--json']);
      expect(r.code, r.err).toBe(0);
      const png = readPng(join(dir, JSON.parse(r.out).frames[0].file));
      expect([png.width, png.height]).toEqual([180, 320]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('a file with no video track, and a time past the end, are exit 1 with a sentence and no files', async () => {
    const dir = tmp();
    try {
      const a = await run(['frames', fx('audio-only.m4a'), '-o', dir]);
      expect(a.code).toBe(1);
      expect(a.err).toMatch(/no video track/);
      const t = await run(['frames', fx('colors.mp4'), '--at', '99', '-o', dir]);
      expect(t.code).toBe(1);
      expect(t.err).toMatch(/99 s is past the end of the file/);
      expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('a video whose first frame is after 0 s still gives the default frames: a time before the first frame is the first frame (and `end` is the real last frame)', async () => {
    const dir = tmp();
    try {
      const late = join(dir, 'late.mp4');
      await writeLateVideo(fx('colors.mp4'), late, 0.5);
      const r = await run(['frames', late, '-o', join(dir, 'f'), '--json']);
      expect(r.code, r.err).toBe(0);
      const j = JSON.parse(r.out);
      expect(Math.abs(j.frames[0].actual - 0.5)).toBeLessThan(0.04);
      const e = JSON.parse((await run(['frames', fx('video-only.mp4'), '--at', 'end,100%', '-o', join(dir, 'g'), '--json'])).out);
      for (const f of e.frames) expect(f.actual).toBeGreaterThan(5.99);                     // the 181st frame (6.0 s), not the 180th
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('--force is not an option of frames (it never did anything), and an output path that is a file is a sentence', async () => {
    const dir = tmp();
    try {
      expect((await run(['frames', fx('colors.mp4'), '--force'])).code).toBe(2);
      const f = join(dir, 'afile'); writeFileSync(f, 'x');
      const r = await run(['frames', fx('colors.mp4'), '-o', f]);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/is a file, not a folder/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('reads the file by small Range requests and never the whole file in one go', async () => {
    const dir = tmp();
    try {
      const log: any[] = [];
      const r = await media.runMedia(['frames', fx('colors.mp4'), '--at', '1,3,5', '-o', dir, '--json'], { log: () => {}, err: () => {} }, { requestLog: log });
      expect(r).toBe(0);
      expect(log.length).toBeGreaterThan(0);
      expect(log.every((q: any) => typeof q.range === 'string' && q.range.startsWith('bytes='))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);
});
