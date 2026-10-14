// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const scope: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'scripts/release-scope.mjs')).href);

/** The change of one file as `classify` sees it. `minus` / `plus`: the removed and added lines. */
const mod = (path: string, minus: string[] = [], plus: string[] = []) => ({ path, status: 'M', minus, plus });
const ctx = { oldVersion: '0.38.0', newVersion: '0.38.1' };

describe('release scope: when the heavy browser tests of a release can be left out', () => {
  it('only documents (the changelog, the README, AGENTS, SKILL.md, docs/*.md, the generated llms files) is docs-only', () => {
    const r = scope.classify([mod('CHANGELOG.md'), mod('README.md'), mod('AGENTS.md'), mod('skills/pixi-effects/SKILL.md'), mod('docs/dsl.md'), mod('llms.txt'), mod('llms-full.txt'), { path: 'docs/media.md', status: 'A', minus: [], plus: [] }], ctx);
    expect(r.mode).toBe('docs-only');
  });

  it('a version bump alone is docs-only: the pins of the package\'s own old version replaced by the new one, in any file', () => {
    const r = scope.classify([
      mod('index.html', ['<span>v0.38.0 · experimental</span>'], ['<span>v0.38.1 · experimental</span>']),
      mod('skills/pixi-effects/template.html', ['"pixi-effects": "https://cdn.jsdelivr.net/npm/pixi-effects@0.38.0/dist/index.js",'], ['"pixi-effects": "https://cdn.jsdelivr.net/npm/pixi-effects@0.38.1/dist/index.js",']),
      mod('package.json', ['  "version": "0.38.0",'], ['  "version": "0.38.1",']),
      mod('package-lock.json', ['  "version": "0.38.0",', '      "version": "0.38.0",'], ['  "version": "0.38.1",', '      "version": "0.38.1",']),
      mod('src/loader.css', ['/* pixi-effects 0.38.0 loader */'], ['/* pixi-effects 0.38.1 loader */']),
    ], ctx);
    expect(r.mode).toBe('docs-only');
  });

  it('anything else is full: source, tests, the tools, the gallery, the site, the recipes (they feed the tests), a script', () => {
    for (const p of ['src/core/Movie.ts', 'tests/tools/media.test.ts', 'ai/tools/media.mjs', 'examples/gallery/aiai-gasa.html', 'site/guide/export.md', 'site/landing/FACTS.md', 'skills/pixi-effects/reference/recipes.md', 'scripts/release-check.mjs', 'tsup.config.ts', 'index.html']) {
      const r = scope.classify([mod('CHANGELOG.md'), mod(p, ['a'], ['b'])], ctx);
      expect(r.mode, p).toBe('full');
      expect(r.reasons.join(' '), p).toContain(p);
    }
  });

  it('a version bump with another edit in the same file is full (the other edit is not a pin)', () => {
    const r = scope.classify([mod('skills/pixi-effects/template.html', ['pixi-effects@0.38.0/dist/index.js', 'fontSize: 40'], ['pixi-effects@0.38.1/dist/index.js', 'fontSize: 48'])], ctx);
    expect(r.mode).toBe('full');
  });

  it('only the package\'s OWN version counts: a dependency bumped in package.json is full, and so is any other number change', () => {
    expect(scope.classify([mod('package.json', ['    "mediabunny": "^1.61.3"'], ['    "mediabunny": "^1.62.0"'])], ctx).mode).toBe('full');
    expect(scope.classify([mod('package.json', ['  "version": "0.38.0",'], ['  "version": "0.39.0",'])], ctx).mode).toBe('full');   // not the version of this release
    expect(scope.classify([mod('index.html', ['v0.37.0'], ['v0.38.1'])], ctx).mode).toBe('full');
  });

  it('a dependency whose own number happens to be this release\'s old version is not a pin of this package: in the manifests only the "version" key counts', () => {
    expect(scope.classify([mod('package.json', ['    "other-tool": "0.38.0"'], ['    "other-tool": "0.38.1"'])], ctx).mode).toBe('full');
    expect(scope.classify([mod('package-lock.json', ['      "resolved": "https://x/other-0.38.0.tgz"'], ['      "resolved": "https://x/other-0.38.1.tgz"'])], ctx).mode).toBe('full');
  });

  it('lines that only trade places, or a change that names no version at all, are not a version bump (every changed line must carry the old version out and the new one in)', () => {
    expect(scope.classify([mod('src/a.ts', ['const a = 1;', 'const b = 2;'], ['const b = 2;', 'const a = 1;'])], ctx).mode).toBe('full');
    expect(scope.classify([mod('skills/pixi-effects/template.html', ['fontSize: 40'], ['fontSize: 40'])], ctx).mode).toBe('full');
    expect(scope.classify([mod('index.html', ['v0.38.0', 'untouched'], ['v0.38.1', 'untouched'])], ctx).mode).toBe('full');         // a line that is not a pin, even if it comes back the same
  });

  it('a file added, deleted or renamed outside the documents is full; a document that is added or deleted is fine', () => {
    expect(scope.classify([{ path: 'examples/_checks/new.html', status: 'A', minus: [], plus: [] }], ctx).mode).toBe('full');
    expect(scope.classify([{ path: 'src/old.ts', status: 'D', minus: [], plus: [] }], ctx).mode).toBe('full');
    expect(scope.classify([{ path: 'src/new.ts', status: 'R', minus: [], plus: [] }], ctx).mode).toBe('full');
    expect(scope.classify([{ path: 'docs/old.md', status: 'D', minus: [], plus: [] }, { path: 'docs/superpowers/specs/x.md', status: 'A', minus: [], plus: [] }], ctx).mode).toBe('docs-only');
  });

  it('no change since the last tag, no tag, or an unreadable version is full (when in doubt, run everything)', () => {
    expect(scope.classify([], ctx).mode).toBe('full');
    expect(scope.classify([mod('README.md')], { oldVersion: null, newVersion: '0.38.1' }).mode).toBe('full');
    expect(scope.classify([mod('README.md')], { oldVersion: '0.38.1', newVersion: '0.38.1' }).mode).toBe('docs-only');
  });

  it('the reasons name every file that makes it full (and only those)', () => {
    const r = scope.classify([mod('README.md'), mod('src/a.ts', ['1'], ['2']), mod('src/b.ts', ['1'], ['2'])], ctx);
    expect(r.mode).toBe('full');
    expect(r.reasons).toHaveLength(2);
  });
});

describe('release scope, on a real git repository: from the last tag to now (commits, working tree and new files)', () => {
  const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-scope-'));
    git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
    const put = (p: string, text: string) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); };
    put('package.json', '{\n  "version": "0.1.0"\n}\n'); put('README.md', 'a\n'); put('src/a.ts', 'export const a = 1;\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'one'); git(dir, 'tag', 'v0.1.0');
    return { dir, put };
  };

  it('a README edit and the version bump, committed or not, are docs-only; a source edit after them makes it full', () => {
    const { dir, put } = make();
    try {
      put('README.md', 'changed\n'); put('package.json', '{\n  "version": "0.1.1"\n}\n');
      expect(scope.scopeSince(dir).mode).toBe('docs-only');                          // not committed yet
      git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'docs');
      const s = scope.scopeSince(dir);
      expect(s.mode).toBe('docs-only');
      expect(s.base).toBe('v0.1.0');
      put('src/a.ts', 'export const a = 2;\n');
      expect(scope.scopeSince(dir).mode).toBe('full');
      git(dir, 'checkout', '-q', 'src/a.ts');
      put('src/untracked.ts', 'export {};\n');                                       // a new file outside the documents
      expect(scope.scopeSince(dir).mode).toBe('full');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('no tag at all is full, and says so', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-scope-'));
    try {
      git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
      writeFileSync(join(dir, 'README.md'), 'a\n'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'one');
      const s = scope.scopeSince(dir);
      expect(s.mode).toBe('full');
      expect(s.reasons.join(' ')).toMatch(/no tag/i);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('npm run release:check --scope: the decision, said out loud, with nothing run', () => {
  const gate = join(root, 'scripts/release-check.mjs');
  const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const ask = (dir: string, ...flags: string[]) => execFileSync(process.execPath, [gate, '--scope', ...flags], { cwd: dir, encoding: 'utf8' });
  const repo = () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-gate-'));
    git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'package.json'), '{\n  "version": "0.1.0"\n}\n'); writeFileSync(join(dir, 'README.md'), 'a\n'); writeFileSync(join(dir, 'src/a.ts'), 'export {};\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'one'); git(dir, 'tag', 'v0.1.0');
    return dir;
  };

  it('says docs-only (and what it leaves out) for a document change, full with the file named for a source change, and --full forces full', () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, 'README.md'), 'b\n');
      const docs = ask(dir);
      expect(docs).toMatch(/docs-only/);
      expect(docs).toMatch(/browser tests are left out|skipped/i);
      expect(docs).toContain('v0.1.0');
      expect(docs).toContain('npm run test:fast');                                   // the unit and document tests still run
      expect(ask(dir, '--full')).toMatch(/full/);
      expect(ask(dir, '--full')).not.toMatch(/docs-only/);
      writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
      const full = ask(dir);
      expect(full).toMatch(/full/);
      expect(full).toContain('src/a.ts');
      expect(full).toContain('npx vitest run');                                      // everything
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

