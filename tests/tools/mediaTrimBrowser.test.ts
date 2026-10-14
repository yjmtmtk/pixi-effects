// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { colorsAt, chrome } from '../support/videoColors';
import * as mbm from 'mediabunny';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const fx = (n: string) => join(root, 'tests/fixtures/media', n);

// colors.mp4: second k is one flat colour: red, green, blue, yellow, magenta, cyan; key frames at 0, 2, 4 s.
describe.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS)('trim by copy: what a real browser shows of the cut file', () => {
  it('a cut that starts on a key frame shows the source\'s colours from its first frame (2–4 s: blue, then yellow)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'cut.mp4');
      await media.trimFile({ input: fx('colors.mp4'), start: 2, end: 4, out });
      const r = await colorsAt(out, [0, 0.5, 0.9, 1.15, 1.5, 1.9]);
      expect(Math.abs(r.duration - 2)).toBeLessThan(0.1);
      expect(r.at).toEqual({ 0: 'blue', 0.5: 'blue', 0.9: 'blue', 1.15: 'yellow', 1.5: 'yellow', 1.9: 'yellow' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('a cut asked to start BETWEEN key frames (3.3 s) starts on the next one (4 s) and shows only that colour (magenta) from its first frame: a plain file with no hidden pre-roll frames', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'cut.mp4');
      const t = await media.trimFile({ input: fx('colors.mp4'), start: 3.3, end: 4.9, out });
      expect(t.actual[0]).toBe(4);
      const r = await colorsAt(out, [0, 0.1, 0.3, 0.5, 0.8]);
      expect(r.first).toBeLessThan(0.05);                                       // the picture starts at 0, not after a gap
      expect(Math.abs(r.duration - 0.9)).toBeLessThan(0.1);
      expect(Object.values(r.at)).toEqual(['magenta', 'magenta', 'magenta', 'magenta', 'magenta']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('the same holds for webm', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'cut.webm');
      const t = await media.trimFile({ input: fx('colors.webm'), start: 2, end: 4, out });
      expect(t.actual[0]).toBe(2);
      const r = await colorsAt(out, [0.2, 1.5]);
      expect(r.at).toEqual({ 0.2: 'blue', 1.5: 'yellow' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('--exact starts on the frame asked for, between key frames (3.3 s: yellow until 4 s, then magenta), says it re-encoded, and reports the real start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'ex ñ.mp4');
      const t = await media.trimFile({ input: fx('colors.mp4'), start: 3.3, end: 4.9, out, exact: true });
      expect(t).toMatchObject({ mode: 'reencode', reencoded: true });
      expect(Math.abs(t.actual[0] - 3.3)).toBeLessThan(0.04);
      expect(t.tracks.join(' ')).toMatch(/video.*audio/);
      const r = await colorsAt(out, [0.05, 0.3, 0.6, 0.8, 1.2, 1.5]);
      expect(Math.abs(r.duration - 1.6)).toBeLessThan(0.15);
      expect(r.at).toEqual({ 0.05: 'yellow', 0.3: 'yellow', 0.6: 'yellow', 0.8: 'magenta', 1.2: 'magenta', 1.5: 'magenta' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('--exact can cut a range that has no key frame inside (2.5–3.5 s: blue, then yellow), which a copy refuses', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'short.mp4');
      const t = await media.trimFile({ input: fx('colors.mp4'), start: 2.5, end: 3.5, out, exact: true });
      expect(t.reencoded).toBe(true);
      const r = await colorsAt(out, [0.1, 0.4, 0.6, 0.9]);
      expect(r.at).toEqual({ 0.1: 'blue', 0.4: 'blue', 0.6: 'yellow', 0.9: 'yellow' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('--exact through the command: the text says re-encoded, the file exists, and a missing Chrome is a sentence', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const lines: string[] = [], errs: string[] = [];
      const io = { log: (s: string) => lines.push(s), err: (s: string) => errs.push(s) };
      expect(await media.runMedia(['trim', fx('colors.mp4'), '2.5', '3.5', '-o', join(dir, 'c.mp4'), '--exact'], io)).toBe(0);
      expect(lines.join('\n')).toMatch(/re-encoded: video avc/);
      expect(await media.runMedia(['trim', fx('colors.mp4'), '2.5', '3.5', '-o', join(dir, 'd.mp4'), '--exact', '--chrome', '/nonexistent/chrome'], io)).toBe(1);
      expect(errs.join('\n')).toMatch(/Chrome|chrome/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('--exact: picture and sound end together (the sound is not left running past the picture), the sound keeps its quality, and the reported end is the file\'s own', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'ex.mp4');
      const t = await media.trimFile({ input: fx('colors.mp4'), start: 2.5, end: 4.5, out, exact: true });
      const input = new mbm.Input({ source: new mbm.FilePathSource(out), formats: mbm.ALL_FORMATS });
      const v = (await input.getPrimaryVideoTrack())!, a = (await input.getPrimaryAudioTrack())!;
      const ve = await v.computeDuration(), ae = await a.computeDuration();
      expect(Math.abs(ae - ve)).toBeLessThan(0.03);
      expect(Math.abs(t.actual[1] - (t.actual[0] + ve))).toBeLessThan(0.05);
      expect(Math.abs(ve - 2)).toBeLessThan(0.08);
      // the sound was COPIED, not re-encoded: every audio packet of the cut is, byte for byte, one of the source's
      const bytes = async (file: string) => { const i = new mbm.Input({ source: new mbm.FilePathSource(file), formats: mbm.ALL_FORMATS }); const out = new Set<string>(); for await (const p of new mbm.EncodedPacketSink((await i.getPrimaryAudioTrack())!).packets()) out.add(Buffer.from(p.data).toString('base64')); return out; };
      const src = await bytes(fx('colors.mp4')), got = await bytes(out);
      expect(got.size).toBeGreaterThan(20);
      for (const b of got) expect(src.has(b)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);
});
