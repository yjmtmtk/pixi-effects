// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// The Playground was removed as a feature at 1.0 (docs/superpowers/specs/2026-11-16-site-v1-design.md): nothing the repository ships
// may point to it, its WebMCP tools or its address. The changelog and the design history keep the story.
const root = resolve(__dirname, '../..');

function grep(pattern: string): string {
  try {
    return execSync(`git grep -n -i -E "${pattern}" -- . ':!CHANGELOG.md' ':!docs/superpowers' ':!docs/roadmap.md' ':!tests/docs/NoPlayground.test.ts' ':!package-lock.json'`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    if ((e as { status?: number }).status === 1) return '';                      // git grep: nothing matched
    throw e;
  }
}

describe('the Playground is gone', () => {
  it('no shipped file names the Playground or its WebMCP tools', () => {
    expect(grep('playground|webmcp')).toBe('');
  });
});
