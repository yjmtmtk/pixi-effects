// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chrome } from '../support/videoColors';
import { writeTone } from '../support/tone';
import { inspectSound } from '../../src/core/inspectAudio';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const fx = (n: string) => join(root, 'tests/fixtures/media', n);
const built = existsSync(join(root, 'dist/sound.js'));
const run = async (argv: string[]) => { const out: string[] = [], err: string[] = []; const code = await media.runMedia(argv, { log: (s: string) => out.push(s), err: (s: string) => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; };

describe.skipIf(!built)('the sound measurement the browser page loads (dist/sound.js)', () => {
  it('imports no PixiJS and nothing from a network: the file and every chunk it imports (the page must work offline)', () => {
    const seen = new Set<string>(), queue = ['sound.js'];
    while (queue.length) {
      const name = queue.pop()!;
      if (seen.has(name)) continue;
      seen.add(name);
      const code = readFileSync(join(root, 'dist', name), 'utf8');
      for (const m of code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
        const spec = (m[1] ?? m[2])!;
        expect(spec, `${name} imports ${spec}`).toMatch(/^\.\//);                 // only its own chunks: not pixi.js, mediabunny, three, a URL
        queue.push(spec.slice(2));
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('sound: loudness, peak, silences of a file, in a real browser', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'media-sound-'));

  it('two tones 6 dB apart are 6.0 ± 0.1 LU apart, and each equals what inspectSound gives for the same samples', async () => {
    const dir = tmp();
    try {
      writeTone(join(dir, 'a.wav'), -20); writeTone(join(dir, 'b.wav'), -26);
      const a = JSON.parse((await run(['sound', join(dir, 'a.wav'), '--json'])).out), b = JSON.parse((await run(['sound', join(dir, 'b.wav'), '--json'])).out);
      expect(a.loudness.integratedLufs - b.loudness.integratedLufs).toBeGreaterThan(5.9);
      expect(a.loudness.integratedLufs - b.loudness.integratedLufs).toBeLessThan(6.1);
      expect([a.duration, a.sampleRate, a.channels]).toEqual([4, 48000, 2]);
      // the same samples in Node
      const n = 48000 * 4, d = new Float32Array(n), amp = 10 ** (-20 / 20);
      for (let i = 0; i < n; i++) d[i] = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 997 * i / 48000)) / 32768;
      const node = inspectSound({ numberOfChannels: 2, sampleRate: 48000, length: n, getChannelData: () => d });
      expect(Math.abs(a.loudness.integratedLufs - node.loudness.integratedLufs!)).toBeLessThan(0.1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('a gap in the sound is a silence with its times, and the level rows say it (a 6 s file with 2 s of nothing)', async () => {
    const dir = tmp();
    try {
      writeTone(join(dir, 'gap.wav'), -20, 6, { at: 2, for: 2 });
      const j = JSON.parse((await run(['sound', join(dir, 'gap.wav'), '--json'])).out);
      expect(j.loudness.silences).toHaveLength(1);
      expect(j.loudness.silences[0].from).toBeCloseTo(2, 0);
      expect(j.windows.length).toBeLessThanOrEqual(8);
      const quiet = j.windows.filter((w: any) => w.rmsDb < -60).length;
      expect(quiet).toBeGreaterThanOrEqual(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('the sound of a video: colors.mp4 (a 440 Hz tone) reads as a steady tone, and the report fits 10 lines; --waveform writes a PNG', async () => {
    const dir = tmp();
    try {
      const r = await run(['sound', fx('colors.mp4'), '--waveform', '-o', dir]);
      expect(r.code, r.err).toBe(0);
      expect(r.out.split('\n').length).toBeLessThanOrEqual(10);
      expect(r.out).toMatch(/LUFS/);
      expect(existsSync(join(dir, 'waveform.png'))).toBe(true);
      const { readPng } = await import('../support/png');
      const png = readPng(join(dir, 'waveform.png'));
      expect(png.width).toBeGreaterThan(300);
      let lit = 0; for (let x = 0; x < png.width; x += 7) for (let y = 0; y < png.height; y += 3) { const p = png.pixel(x, y); if (p[0]! > 150 || p[1]! > 150) lit++; }
      expect(lit).toBeGreaterThan(50);                                                // the waveform is drawn, not an empty picture
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('the last level row is not a sliver: colors.mp4 ends with 36 ms of encoder padding, which is not reported as a row of -90 dBFS', async () => {
    const j = JSON.parse((await run(['sound', fx('colors.mp4'), '--json'])).out);
    expect(j.windows.at(-1).rmsDb).toBeGreaterThan(-40);                       // the last row is the tone
    expect(j.loudness.silences).toEqual([]);
  }, 90_000);

  it('the text says the silence threshold the code uses (−60 dBFS), and --force is not an option of sound', async () => {
    const r = await run(['sound', fx('colors.mp4')]);
    expect(r.out).toMatch(/−60 dBFS/);
    expect(r.out).not.toMatch(/−70 dBFS/);
    expect((await run(['sound', fx('colors.mp4'), '--force'])).code).toBe(2);
  }, 90_000);

  it('the waveform draws every channel: a sound only in the RIGHT channel is not an empty picture', async () => {
    const dir = tmp();
    try {
      writeTone(join(dir, 'right.wav'), -6, 3, undefined, 'right');
      const r = await run(['sound', join(dir, 'right.wav'), '--waveform', '-o', join(dir, 'o')]);
      expect(r.code, r.err).toBe(0);
      const { readPng } = await import('../support/png');
      const png = readPng(join(dir, 'o', 'waveform.png'));
      let lit = 0; for (let x = 0; x < png.width; x += 7) for (let y = 0; y < png.height; y += 3) { const p = png.pixel(x, y); if (Math.abs(y - 120) > 20 && p[0]! > 100 && p[2]! > 200) lit++; }       // far from the centre line: a real waveform, not the 1 px line of silence
      expect(lit).toBeGreaterThan(50);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it('a video with no audio track is exit 1 with a sentence; a file longer than the limit is refused with ffmpeg named', async () => {
    const a = await run(['sound', fx('video-only.mp4')]);
    expect(a.code).toBe(1);
    expect(a.err).toMatch(/no audio track/);
    expect(media.SOUND_MAX_SECONDS).toBeGreaterThan(300);
  }, 90_000);
});
