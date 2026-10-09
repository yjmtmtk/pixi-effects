import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('"Use https://github.com/yjmtmtk/pixi-effects to make a video" works as a start', () => {
  const agents = read('AGENTS.md');
  const readme = read('README.md');

  it('the README opens with the one-sentence request and routes an AI to the right file for what it can do', () => {
    const top = readme.slice(0, readme.indexOf('Declarative composition and video rendering'));
    expect(top).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video');
    expect(top).toContain('AGENTS.md');
    expect(top).toContain('skills/pixi-effects/SKILL.md');
    expect(top).toContain('https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/CHAT.md');
  });

  it('tells an agent that supports skills the one command that registers pixi-effects, in the README, AGENTS.md and llms.txt', () => {
    for (const text of [readme, agents, read('llms.txt')]) expect(text).toContain('npx skills add yjmtmtk/pixi-effects');
    expect(readme).toContain('/plugin install pixi-effects --marketplace yjmtmtk/pixi-effects');
  });

  it('every repository file AGENTS.md sends an agent to exists, and every raw link points at a file that exists', () => {
    const files = [...agents.matchAll(/`((?:ai|docs|skills)\/[\w./-]+\.(?:md|html|mjs))`/g)].map(m => m[1]!);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(existsSync(resolve(root, f)), f).toBe(true);
    for (const m of agents.matchAll(/raw\.githubusercontent\.com\/yjmtmtk\/pixi-effects\/main\/([\w./-]+)/g)) expect(existsSync(resolve(root, m[1]!)), m[1]).toBe(true);
  });

  it('it names the two commands that check and export a video, and both are real bins of the package', () => {
    const bins = Object.keys(JSON.parse(read('package.json')).bin);
    for (const b of ['pixi-effects-check', 'pixi-effects-render']) {
      expect(agents).toContain(b);
      expect(bins).toContain(b);
    }
  });

  it('CLAUDE.md hands Claude Code the same file, so there is one source of truth', () => {
    expect(read('CLAUDE.md').trim()).toBe('@AGENTS.md');
  });

  it('the chat path and the shell path both exist in the package (ai/ ships to npm)', () => {
    const files: string[] = JSON.parse(read('package.json')).files ?? [];
    expect(files.some(f => f === 'ai' || f.startsWith('ai/'))).toBe(true);
  });
});
