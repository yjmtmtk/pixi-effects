import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { buildLlms } from '../../scripts/build-llms.mjs';

const root = resolve(__dirname, '../..');

describe('llms.txt / llms-full.txt', () => {
  const { llms, full } = buildLlms() as { llms: string; full: string };

  it('are committed and up to date (run `npm run build:ai` after editing ai/ or docs/)', () => {
    expect(existsSync(resolve(root, 'llms.txt'))).toBe(true);
    expect(readFileSync(resolve(root, 'llms.txt'), 'utf8')).toBe(llms);
    expect(readFileSync(resolve(root, 'llms-full.txt'), 'utf8')).toBe(full);
  });

  it('llms.txt follows the llms.txt format: H1, blockquote summary, H2 sections of links', () => {
    expect(llms.startsWith('# pixi-effects\n')).toBe(true);
    expect(llms).toMatch(/\n> .+/);
    expect(llms.match(/^## /gm)?.length).toBeGreaterThanOrEqual(3);
    for (const m of llms.matchAll(/^- \[[^\]]+\]\((https:\/\/[^)]+)\)/gm)) expect(m[1]).toMatch(/^https:\/\//);
  });

  it('every repo file that llms.txt links to exists', () => {
    for (const m of llms.matchAll(/raw\.githubusercontent\.com\/yjmtmtk\/pixi-effects\/main\/([^)]+)\)/g)) {
      const rel = m[1]!;
      if (rel === 'llms-full.txt') continue;                // generated alongside
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
  });

  it('llms-full.txt contains every source document once', () => {
    for (const name of ['skills/pixi-effects/SKILL.md', 'skills/pixi-effects/reference/cheatsheet.md', 'skills/pixi-effects/reference/pitfalls.md', 'skills/pixi-effects/reference/recipes.md', 'skills/pixi-effects/reference/direction.md', 'docs/dsl.md', 'docs/api.md']) {
      expect(full.split(`===== ${name} =====`).length - 1).toBe(1);
    }
  });
});
