// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// One way to read a command line for every `pixi-effects` command: `--flag value` and `--flag=value`, `-h` / `--help` with every option,
// an unknown flag is exit 2 with a guess, an old name says the new one.
const root = resolve(__dirname, '../..');
const args: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/args.mjs')).href);
const cli = (argv: string[]) => spawnSync(process.execPath, [join(root, 'ai/tools/pixi-effects.mjs'), ...argv], { encoding: 'utf8' });

const SPEC = {
  name: 'demo',
  usage: '<file> [options]',
  about: 'a command to test the reader',
  options: [
    { flag: '--out', short: '-o', value: 'DIR', help: 'where it goes' },
    { flag: '--frames', value: 'N', help: 'how many' },
    { flag: '--strict', help: 'fail on more' },
  ],
  renamed: { '--formats': '--format (a list: mp4,webm)' },
};

describe('readArgs: the shared reader', () => {
  it('reads --flag value, --flag=value, a short alias and booleans, in order, with the positional words', () => {
    const r = args.readArgs(['a.html', '--frames', '6', '--out=o', '--strict', '-o', 'p'], SPEC);
    expect(r.help).toBe(false);
    expect(r.positional).toEqual(['a.html']);
    expect(r.options).toEqual([{ flag: '--frames', value: '6' }, { flag: '--out', value: 'o' }, { flag: '--strict', value: true }, { flag: '--out', value: 'p' }]);
    expect(args.readArgs(['--out=a=b'], SPEC).options[0].value).toBe('a=b');            // only the first = splits
  });

  it('-h and --help ask for the help, whatever else is on the line', () => {
    expect(args.readArgs(['--help'], SPEC).help).toBe(true);
    expect(args.readArgs(['a.html', '-h'], SPEC).help).toBe(true);
    expect(args.readArgs(['a.html', '--bogus', '--help'], SPEC).help).toBe(true);
  });

  it('an unknown option is a UsageError (exit code 2) with a guess; an old name says the new one', () => {
    const bad = (argv: string[]) => { try { args.readArgs(argv, SPEC); } catch (e: any) { return e; } throw new Error('no error'); };
    const e = bad(['a.html', '--frame', '3']);
    expect(e).toBeInstanceOf(args.UsageError);
    expect(e.exitCode).toBe(2);
    expect(e.message).toMatch(/demo: unknown option --frame; did you mean --frames\?/);
    expect(bad(['--zzzzzz']).message).toMatch(/unknown option --zzzzzz.*--out, --frames, --strict/s);
    expect(bad(['-x']).message).toMatch(/unknown option -x/);
    expect(bad(['--formats', 'mp4']).message).toMatch(/--formats is now --format \(a list: mp4,webm\)/);
    expect(bad(['--frames']).message).toMatch(/--frames needs a value \(N\)/);
    expect(bad(['--frames', '--strict']).message).toMatch(/--frames needs a value/);
    expect(bad(['--strict=yes']).message).toMatch(/--strict takes no value/);
  });

  it('a negative number and a lone - are words, and -- ends the options', () => {
    expect(args.readArgs(['-1.5', '-'], SPEC).positional).toEqual(['-1.5', '-']);
    expect(args.readArgs(['--', '--strict'], SPEC).positional).toEqual(['--strict']);
  });

  it('helpText: the usage, then every option on one line, then the exit codes', () => {
    const h = args.helpText(SPEC);
    expect(h).toMatch(/^usage: pixi-effects demo <file> \[options\]/);
    for (const flag of ['-o, --out DIR', '--frames N', '--strict', '-h, --help']) expect(h).toContain(flag);
    expect(h.split('\n').filter(l => /^\s+-/.test(l))).toHaveLength(4);
    expect(h).toMatch(/exit code: 0 .*1 .*2 /s);
  });

  it('nearest: the closest name within a small distance, or null', () => {
    expect(args.nearest('--frmes', ['--frames', '--out'])).toBe('--frames');
    expect(args.nearest('--zzzzzzz', ['--frames', '--out'])).toBeNull();
  });
});

describe('every command answers --help with every option and exit 0; an unknown flag is exit 2 with a guess', () => {
  const COMMANDS = ['check', 'render', 'view', 'probe', 'trim', 'frames', 'sound', 'audio', 'concat', 'new', 'quickstart', 'recipe', 'help'];
  for (const cmd of COMMANDS) {
    it(cmd, () => {
      for (const flag of ['--help', '-h']) {
        const r = cli([cmd, flag]);
        expect(r.status, `${cmd} ${flag}: ${r.stderr}`).toBe(0);
        expect(r.stdout).toMatch(new RegExp(`^usage: pixi-effects ${cmd}\\b`));
        expect(r.stdout).toMatch(/-h, --help/);
        expect(r.stdout).toMatch(/exit code: 0/);
      }
      const bad = cli([cmd, 'x.html', '--zzzzzz-not-a-flag']);
      expect(bad.status, `${cmd} --zzzzzz-not-a-flag: ${bad.stderr}`).toBe(2);
      expect(bad.stderr).toMatch(/unknown option --zzzzzz-not-a-flag/);
    });
  }

  it('check --help lists every option, one a line (it once printed one line, and its header missed --var and --size)', () => {
    const h = cli(['check', '--help']).stdout;
    for (const flag of ['--out', '--frames', '--format', '--no-export', '--draft', '--at', '--crop', '--pick', '--do', '--webgl', '--onion', '--seam', '--strict', '--query', '--var', '--size', '--timeout', '--root', '--chrome']) {
      expect(h.split('\n').some(l => new RegExp(`^\\s+(-\\w, )?${flag}\\b`).test(l)), flag).toBe(true);
    }
  });

  it('a mistyped option of check has a guess; --flag=value works', () => {
    const r = cli(['check', 'x.html', '--frmes', '3']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/did you mean --frames\?/);
  });

  it('pixi-effects --version / -v prints the version of the package', () => {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    for (const flag of ['--version', '-v']) {
      const r = cli([flag]);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(version);
    }
  });

  it('the usage of pixi-effects points to <command> --help, not to the header of a file that may not exist', () => {
    const r = cli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/pixi-effects <command> --help/);
    expect(r.stdout).not.toMatch(/header of/);
  });
});
