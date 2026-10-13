// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chrome } from '../support/videoColors';

const root = resolve(__dirname, '../..');
const cli = join(root, 'ai/tools/pixi-effects.mjs');
const fx = (n: string) => join(root, 'tests/fixtures/media', n);
const built = existsSync(join(root, 'dist/sound.js'));
type Run = { code: number; stdout: string; stderr: string };
/** Runs the real command line with an environment of our choosing. */
const spawn = (args: string[], env: NodeJS.ProcessEnv = process.env): Promise<Run> =>
  promisify(execFile)(process.execPath, [cli, ...args], { env, timeout: 120_000, maxBuffer: 20_000_000 }).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }), (e: any) => ({ code: e.code ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }));
/** An environment where only node is on PATH: no ffmpeg, no ImageMagick, nothing. */
const bareEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ PATH: dirname(process.execPath), HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...extra });

describe('the media commands need no ffmpeg', () => {
  it('with only node on PATH (and ffmpeg shown to be missing there), probe, trim, frames and sound all work', async () => {
    const gone = await promisify(execFile)('ffmpeg', ['-version'], { env: bareEnv() }).then(() => 'found', () => 'missing');
    expect(gone).toBe('missing');
    const dir = mkdtempSync(join(tmpdir(), 'media-env-'));
    try {
      expect((await spawn(['probe', fx('colors.mp4')], bareEnv())).code).toBe(0);
      expect((await spawn(['trim', fx('colors.mp4'), '2', '4', '-o', join(dir, 'cut.mp4')], bareEnv())).code).toBe(0);
      if (chrome && built) {
        const f = await spawn(['frames', fx('colors.mp4'), '--at', '1', '-o', join(dir, 'f')], bareEnv({ CHROME_PATH: chrome }));
        expect(f.code, f.stderr).toBe(0);
        const s = await spawn(['sound', fx('colors.mp4')], bareEnv({ CHROME_PATH: chrome }));
        expect(s.code, s.stderr).toBe(0);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 180_000);
});

describe('without a browser: what still works and what says so', () => {
  it('probe and trim (copy) do not need Chrome; frames, sound and trim --exact exit 1 with a sentence that says Chrome was not found and what to do', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-env-'));
    try {
      const env = bareEnv();
      const no = ['--chrome', '/nonexistent/chrome'];                            // a CHROME_PATH that does not exist is ignored (as in check) and Chrome is found in its usual place: only an explicit --chrome can say there is none
      expect((await spawn(['probe', fx('colors.mp4')], env)).code).toBe(0);
      expect((await spawn(['trim', fx('colors.mp4'), '2', '4', '-o', join(dir, 'cut.mp4')], env)).code).toBe(0);
      for (const args of [['frames', fx('colors.mp4'), '-o', join(dir, 'f'), ...no], ['sound', fx('colors.mp4'), ...no], ['trim', fx('colors.mp4'), '2.5', '3.5', '-o', join(dir, 'e.mp4'), '--exact', ...no]]) {
        const r = await spawn(args, env);
        expect(r.code, args[0]).toBe(1);
        expect(r.stderr, args[0]).toMatch(/Chrome was not found/);
        expect(r.stderr, args[0]).toMatch(/--chrome|CHROME_PATH/);
        expect(r.stderr, args[0]).not.toMatch(/\n\s+at /);
        expect(r.stderr.trim().split('\n'), args[0]).toHaveLength(1);
      }
      expect(existsSync(join(dir, 'e.mp4'))).toBe(false);                      // a failed --exact leaves no file behind
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 180_000);
});

describe('bad input, for every command: one sentence naming the file, exit 1, no stack, no files', () => {
  it('a missing file, an empty file, a folder, a text file and a dead URL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-bad-'));
    try {
      writeFileSync(join(dir, 'empty.mp4'), '');
      writeFileSync(join(dir, 'notes.txt'), 'this is not a video, just some words '.repeat(50));
      const bad: Array<[string, RegExp]> = [[join(dir, 'nope.mp4'), /no such file/], [join(dir, 'empty.mp4'), /empty/], [dir, /folder/], [join(dir, 'notes.txt'), /not a media file/], ['http://127.0.0.1:1/x.mp4', /could not read/]];
      for (const [file, re] of bad) {
        for (const cmd of ['probe', 'trim', 'frames', 'sound']) {
          const args = cmd === 'trim' ? [cmd, file, '1', '2', '-o', join(dir, 'out.mp4')] : cmd === 'frames' || cmd === 'sound' ? [cmd, file, '-o', join(dir, 'o')] : [cmd, file];
          const r = await spawn(args);
          expect(r.code, `${cmd} ${file}`).toBe(1);
          expect(r.stderr, `${cmd} ${file}`).toMatch(re);
          expect(r.stderr, `${cmd} ${file}`).not.toMatch(/\n\s+at /);
          expect(r.stderr.trim().split('\n'), `${cmd} ${file}`).toHaveLength(1);
        }
      }
      expect(readdirSync(dir).sort()).toEqual(['empty.mp4', 'notes.txt']);       // nothing was written
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 300_000);
});

describe('a name with spaces and non-Latin letters', () => {
  it('works for all four commands, with the output in a folder that has such a name too', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-name-'));
    try {
      const odd = join(dir, 'été café 日本 clip.mp4'); copyFileSync(fx('colors.mp4'), odd);
      expect((await spawn(['probe', odd])).code).toBe(0);
      const t = await spawn(['trim', odd, '2', '4', '-o', join(dir, 'ünï côde', 'cut 切.mp4')]);
      expect(t.code, t.stderr).toBe(0);
      expect(existsSync(join(dir, 'ünï côde', 'cut 切.mp4'))).toBe(true);
      if (chrome && built) {
        const f = await spawn(['frames', odd, '--at', '1', '-o', join(dir, 'frames ñ')]);
        expect(f.code, f.stderr).toBe(0);
        expect(readdirSync(join(dir, 'frames ñ')).some(n => n.endsWith('.png'))).toBe(true);
        expect((await spawn(['sound', odd])).code).toBe(0);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 240_000);
});
