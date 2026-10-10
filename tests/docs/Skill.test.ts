import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '../..');
const dir = resolve(root, 'skills/pixi-effects');
const read = (p: string) => readFileSync(join(dir, p), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string; files: string[] };
const walk = (d: string): string[] => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const SKIP = /node_modules|\/\.git\/|\/\.claude\/|\/dist\/|\/\.superpowers\/|\/_site\/|\/\.playwright-mcp\/|\/guide-preview\//;

describe('skills/pixi-effects — what an agent installs', () => {
  const skill = read('SKILL.md');
  const fm = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(skill);

  it('is the only SKILL.md in the repository, and ships in the npm package', () => {
    const found = walk(root).filter(f => f.endsWith('/SKILL.md') && !SKIP.test(f));
    expect(found.map(f => f.slice(root.length + 1))).toEqual(['skills/pixi-effects/SKILL.md']);
    expect(pkg.files).toContain('skills');
  });

  it('has the frontmatter every agent reads: name = folder, a broad description of at most 1000 characters', () => {
    expect(fm).not.toBeNull();
    expect(fm![1]).toBe('pixi-effects');
    expect(fm![2]!.length).toBeLessThanOrEqual(1000);
    for (const w of ['video', 'motion graphics', 'animated title', 'lower third', 'promo', 'chart', 'slideshow']) expect(fm![2]!.toLowerCase(), w).toContain(w);
  });

  it('sends a film to reference/direction.md, which is renderer-neutral and names the files an agent must write', () => {
    expect(skill).toContain('reference/direction.md');
    expect(existsSync(join(dir, 'reference/direction.md'))).toBe(true);
    const direction = read('reference/direction.md');
    for (const f of ['brief.md', 'style-guide.md', 'shotlist.md']) expect(direction, f).toContain(f);
    for (const dirName of ['assets/', 'src/', 'reviews/', 'out/']) expect(direction, dirName).toContain(dirName);
    expect(direction).not.toMatch(/npx |ai\/tools|check\.mjs|render\.mjs|pixi-effects check/);                       // the commands live in SKILL.md, so the guide can be lifted out for any renderer
    expect(direction).toMatch(/stop and ask/i);                                                                          // a missing real asset is a blocker, not an invitation to invent
    expect(direction).toMatch(/three largest defects/i);
    expect(direction).toMatch(/do not make a format nobody asked for/i);
  });

  it('is a plain YAML scalar: no ": " and no " #" in the description (the skills CLI refuses the whole skill with "Nested mappings are not allowed")', () => {
    expect(fm![2]).not.toMatch(/: | #/);
    expect(fm![2]).not.toMatch(/^["'>|\[{&*!%@`-]/);
  });

  it('names the library in its second sentence, so a user of another tool can see why it fired', () => {
    expect(fm![2]!.split(/(?<=\.)\s/)[1]).toContain('pixi-effects');
  });

  it('says which version it was written for, and the template pins that version', () => {
    expect(skill).toContain(`Written for pixi-effects ${pkg.version}`);
    expect(read('template.html')).toContain(`pixi-effects@${pkg.version}/dist/index.js`);
  });

  it('the starter page preloads the library while the page is parsed, so a long load starts early', () => {
    const html = read('template.html');
    expect(html.indexOf('rel="modulepreload"')).toBeGreaterThan(html.indexOf('type="importmap"'));   // after the import map: a browser that reads one map must see it first
    expect(html).toMatch(/<link rel="modulepreload" href="https:\/\/cdn\.jsdelivr\.net\/npm\/pixi-effects@[\d.]+\/dist\/index\.js"/);
  });

  it('has no path that only exists inside the repository', () => {
    for (const f of walk(dir)) {
      if (!/\.(md|html|py)$/.test(f)) continue;
      expect(readFileSync(f, 'utf8').replace(/https?:\/\/\S+/g, ''), f).not.toMatch(/node ai\/|(?<!pixi-effects\/)ai\/tools\/|ai\/reference\/|ai\/template|\.\.\/\.\.\/dist|docs\/dsl\.md/);
    }
  });

  it('never tells an agent to run a bin by a bare `npx pixi-effects-…` (npm 404s: the bin name is not a package; `npx pixi-effects check` works)', () => {
    for (const f of [...walk(dir), resolve(root, 'README.md'), resolve(root, 'AGENTS.md'), resolve(root, 'llms.txt')]) {
      if (!/\.(md|html|py|txt)$/.test(f)) continue;
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/npx pixi-effects-(check|render|view)/);
    }
  });

  it('does not list files that are not in the installed folder (the chat guide and the tools live elsewhere)', () => {
    const text = skill.replace(/https?:\/\/\S+/g, '').replace(/node_modules\/pixi-effects\/ai\/tools\/[\w.-]+/g, '');
    expect(text).not.toMatch(/CHAT\.md|chat-template\.html|(^|[^\w/])tools\/[\w.-]+/m);
  });

  it('keeps out of a project that already uses another video tool', () => {
    expect(fm![2]).toMatch(/not for a project that already uses another video tool/i);
  });

  it('every file SKILL.md points to is in the folder, and it stays under 500 lines', () => {
    expect(skill.split('\n').length).toBeLessThan(500);
    for (const m of skill.matchAll(/`((?:reference|scripts)\/[\w./-]+|template\.html)`/g)) expect(existsSync(join(dir, m[1]!)), m[1]).toBe(true);
  });
});

describe('the Claude Code plugin manifest', () => {
  const plugin = JSON.parse(readFileSync(resolve(root, '.claude-plugin/plugin.json'), 'utf8'));
  const market = JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'));
  it('is one plugin under one name, at the package version, whose skills folder exists', () => {
    expect(plugin.name).toBe('pixi-effects');
    expect(plugin.version).toBe(pkg.version);
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual([plugin.name]);
    expect(market.plugins[0].source).toBe('./');
    expect(market.owner?.name).toBeTruthy();
    expect(existsSync(join(root, 'skills/pixi-effects/SKILL.md'))).toBe(true);
  });
});
