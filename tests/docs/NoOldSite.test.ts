// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// The 1.0 site replaced the old gallery, films, showreel and interactive index (docs/superpowers/specs/2026-11-16-site-v1-design.md, "Removed";
// plan Task 10). Nothing shipped may point to them; the changelog and the design history keep the story.
const root = resolve(__dirname, '../..');

function grep(pattern: string): string {
  try {
    return execSync(`git grep -n -E "${pattern}" -- . ':!CHANGELOG.md' ':!docs/superpowers' ':!docs/roadmap.md' ':!docs/plans' ':!docs/specs' ':!tests/docs/NoOldSite.test.ts' ':!.gitignore'`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    if ((e as { status?: number }).status === 1) return '';
    throw e;
  }
}

describe('the pages before 1.0 are gone', () => {
  it('the folders are gone from the repository (git tracks nothing under examples/; ignored local files may stay on disk)', () => {
    expect(execSync('git ls-files examples', { cwd: root, encoding: 'utf8' }).trim()).toBe('');
  });

  it('nothing shipped points to them', () => {
    expect(grep('examples/(gallery|films|showreel|interactive|_assets)')).toBe('');
  });
});
