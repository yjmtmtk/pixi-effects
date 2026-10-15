import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('for-ai.html');

describe('for-ai.html (the one page for AI)', () => {
  it('has the sentence, the reading list and the tools', () => {
    const plain = html.replace(/<[^>]+>/g, '');
    expect(plain).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video:');
    for (const need of ['AGENTS.md', 'SKILL.md', 'llms.txt', 'llms-full.txt', 'ai/CHAT.md', 'npx skills add yjmtmtk/pixi-effects', 'pixi-effects help', 'pixi-effects recipe', 'pixi-effects check', 'pixi-effects render']) expect(plain, need).toContain(need);
  });
  it('lists every AI recipe id, generated (a stale list fails sync-site --check)', () => {
    const ids = [...read('skills/pixi-effects/reference/recipes.md').matchAll(/\/\/ @recipe ([^\n]+)/g)].map(m => m[1]!.trim());
    expect(ids.length).toBeGreaterThan(40);
    for (const id of ids) expect(html, id).toContain(`<code>${id}</code>`);
  });
  it('says nothing about other tools and links nothing from the root with a leading slash', () => {
    expect(html).not.toMatch(/remotion|fframes/i);
    expect(html).not.toMatch(/(?:href|src)="\//);
  });
});
