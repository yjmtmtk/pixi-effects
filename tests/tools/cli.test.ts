import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
// @ts-expect-error plain ESM script without types
import { route } from '../../ai/tools/pixi-effects.mjs';

const root = resolve(__dirname, '../..');

describe('pixi-effects <check|render|view> — one command that is also the package name, so `npx pixi-effects check` works', () => {
  it('routes a subcommand to its tool and passes every other argument on untouched', () => {
    expect(route(['check', 'my.html', '--at', '1,2', '--out', 'o'])).toEqual({ tool: 'check.mjs', args: ['my.html', '--at', '1,2', '--out', 'o'] });
    expect(route(['render', 'a.html', '-o', 'a.mp4'])).toEqual({ tool: 'render.mjs', args: ['a.html', '-o', 'a.mp4'] });
    expect(route(['view', 'a.html'])).toEqual({ tool: 'view.mjs', args: ['a.html'] });
  });

  it('prints the usage for no command or --help, and says what to type for a mistyped one', () => {
    expect(route([]).usage).toMatch(/pixi-effects check/);
    expect(route(['--help']).usage).toMatch(/render/);
    const r = route(['chek', 'a.html']);
    expect(r.error).toMatch(/unknown command "chek".*did you mean "check"/s);
    expect(route(['rendr']).error).toMatch(/did you mean "render"/);
    expect(route(['zzz']).error).toMatch(/check, render, view/);
  });

  it('is a real bin of the package, named like the package', () => {
    const pkg = JSON.parse(execFileSync('cat', [resolve(root, 'package.json')], { encoding: 'utf8' }));
    expect(pkg.bin['pixi-effects']).toBe('ai/tools/pixi-effects.mjs');
  });

  it('runs: with no command it exits 2 and prints the usage; with a bad one it exits 2 and names the command', () => {
    const a = spawnSync('node', [resolve(root, 'ai/tools/pixi-effects.mjs')], { encoding: 'utf8' });
    expect(a.status).toBe(2);
    expect(a.stderr + a.stdout).toMatch(/pixi-effects check/);
    const b = spawnSync('node', [resolve(root, 'ai/tools/pixi-effects.mjs'), 'chek'], { encoding: 'utf8' });
    expect(b.status).toBe(2);
    expect(b.stderr).toMatch(/did you mean "check"/);
  });

  it('every bin runs through a symlink, which is how npm installs it (it once printed nothing and exited 0)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bins-'));
    for (const name of ['pixi-effects', 'check', 'render', 'view']) {
      const link = join(dir, name);
      symlinkSync(resolve(root, `ai/tools/${name === 'pixi-effects' ? 'pixi-effects' : name}.mjs`), link);
      const r = spawnSync(link, [], { encoding: 'utf8' });
      expect(r.status, `${name} exit`).toBe(2);
      expect(r.stdout + r.stderr, `${name} output`).toMatch(/usage|pixi-effects/i);
    }
  });
});
