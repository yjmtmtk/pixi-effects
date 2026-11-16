// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The exit codes are a contract, the same for every command: 0 OK · 1 the work has problems or the job failed · 2 the command line is wrong.
const root = resolve(__dirname, '../..');
const cli = (argv: string[], cwd = root) => spawnSync(process.execPath, [join(root, 'ai/tools/pixi-effects.mjs'), ...argv], { encoding: 'utf8', cwd, timeout: 60_000 });
const args: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/args.mjs')).href);
const varArgs: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/varArgs.mjs')).href);

describe('exit code 1: the job failed (not the command line)', () => {
  it('a page that does not exist: check, render and view exit 1 with one sentence', () => {
    for (const cmd of ['check', 'render', 'view']) {
      const r = cli([cmd, 'no-such-page-here.html']);
      expect(r.status, `${cmd}: ${r.stderr}`).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`pixi-effects ${cmd} failed: page not found`));
    }
  });

  it('a Chrome that cannot be started: check and render exit 1 (it was 2, "bad usage")', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exit-chrome-'));
    writeFileSync(join(dir, 'p.html'), '<!doctype html><title>p</title>');
    for (const cmd of ['check', 'render']) {
      const r = cli([cmd, join(dir, 'p.html'), '--root', dir, '--chrome', join(dir, 'no-chrome')]);
      expect(r.status, `${cmd}: ${r.stderr}`).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`pixi-effects ${cmd} failed`));
    }
  });

  it('new: a page that already exists is 1; a recipe or a word nobody has is 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exit-new-'));
    expect(cli(['new', 'demo'], dir).status).toBe(0);
    expect(cli(['new', 'demo'], dir).status).toBe(1);
    expect(cli(['recipe', 'qwertyzzzz']).status).toBe(1);
    expect(cli(['help', 'qwertyzzzz']).status).toBe(1);
  });
});

describe('exit code 2: the command line is wrong', () => {
  it('a bad value is 2 for every command (new --size 1080 was 1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exit-bad-'));
    for (const argv of [
      ['new', 'bad', '--size', '1080'], ['new', 'bad', '--duration', 'long'],
      ['check', 'p.html', '--crop', '1,2'], ['check', 'p.html', '--var', 'lang'], ['check', 'p.html', '--size', '1080'],
      ['render', 'p.html', '--format', 'avi'], ['render', 'p.html', '-o', 'x.xyz'], ['render', 'p.html', '--var', '=en'],
      ['view', 'a.html', 'b.html'], ['frames', 'a.mp4', '--width', 'big'], ['check', 'p.html', '--out', 'p.mp4'], ['trim', 'a.mp4', 'soon', '2', '-o', 'b.mp4'],
    ]) {
      const r = cli(argv, dir);
      expect(r.status, `${argv.join(' ')}: ${r.stderr}`).toBe(2);
      expect(r.stderr, argv.join(' ')).toMatch(/^pixi-effects \w+: /);
    }
  });

  it('a missing page or file is 2', () => {
    for (const cmd of ['check', 'render', 'view', 'probe', 'frames', 'new']) expect(cli([cmd]).status, cmd).toBe(2);
  });

  it('--var and --size mistakes are UsageErrors, also the ones found once the page is open (a name the page does not declare)', () => {
    expect(() => varArgs.parseVar('lang')).toThrow(args.UsageError);
    expect(() => varArgs.parseSizes('1080')).toThrow(args.UsageError);
    expect(() => varArgs.coerceVars([['shfit', '1']], { shift: 0 })).toThrow(args.UsageError);
    expect(() => varArgs.coerceVars([['shift', 'a lot']], { shift: 0 })).toThrow(args.UsageError);
  });
});

describe('the contract is written where an agent reads it', () => {
  it('every --help ends with the three codes, and SKILL.md says them once', async () => {
    for (const cmd of ['check', 'render', 'view', 'probe', 'new']) expect(cli([cmd, '--help']).stdout).toMatch(/exit code: 0 OK · 1 .* · 2 the command line is wrong/);
    const { readFileSync } = await import('node:fs');
    const skill = readFileSync(join(root, 'skills/pixi-effects/SKILL.md'), 'utf8');
    expect(skill).toMatch(/exit code.*\b0\b.*\b1\b.*\b2\b/is);
    expect(skill).toMatch(/2[^\n]*command line is wrong/);
  });
});

describe('the Chrome path: one environment variable, CHROME_PATH', () => {
  it('no help and no message names CHROME= any more', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['README.md', 'docs/media.md', 'skills/pixi-effects/SKILL.md', 'skills/pixi-effects/reference/cheatsheet.md', 'AGENTS.md']) {
      expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/\bCHROME=|\$CHROME\b/);
    }
    for (const f of ['ai/tools/check.mjs', 'ai/tools/render.mjs', 'ai/tools/mediaBrowser.mjs', 'ai/tools/media.mjs', 'scripts/make-posters.mjs']) {
      expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/CHROME=(PATH|\/)|or CHROME\b(?!_)/);
    }
    for (const cmd of ['check', 'render', 'frames']) expect(cli([cmd, '--help']).stdout, cmd).toMatch(/CHROME_PATH/);
  });
});
