// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (f: string) => readFileSync(resolve(root, f), 'utf8');

describe('previewing the whole site locally', () => {
  it('has one command that stages the site and serves it (the guide is built, so the repository root alone has no /guide/)', () => {
    expect(JSON.parse(read('package.json')).scripts.site).toBe('node scripts/preview-site.mjs');
    expect(existsSync(resolve(root, 'scripts/preview-site.mjs'))).toBe(true);
  });
  it('the maintainer guide names that command, and says a built guide picks up header changes only when rebuilt', () => {
    const readme = read('site/README.md');
    expect(readme).toContain('npm run site');
    expect(readme).not.toMatch(/every link works as it does on Pages/);
    expect(readme).toMatch(/guide[^\n]*rebuil|rebuil[^\n]*guide/i);
  });
});
