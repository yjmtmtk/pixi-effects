// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { stageSite } from '../../scripts/stage-site.mjs';

const root = resolve(__dirname, '../..');
const read = (f: string) => readFileSync(resolve(root, f), 'utf8');

describe('previewing the whole site locally', () => {
  it('has one command that stages the site and serves it (the staged folder is what Pages serves)', () => {
    expect(JSON.parse(read('package.json')).scripts.site).toBe('node scripts/preview-site.mjs');
    expect(existsSync(resolve(root, 'scripts/preview-site.mjs'))).toBe(true);
  });
  it('the maintainer guide names that command', () => {
    expect(read('site/README.md')).toContain('npm run site');
  });
  it('the staged site has no Guide, music lab or numbered tour', async () => {
    const out = join(tmpdir(), `site-${process.pid}`);
    try {
      await stageSite(out);
      expect(existsSync(join(out, 'guide'))).toBe(false);
      expect(existsSync(join(out, 'examples/_guide'))).toBe(false);
      expect(existsSync(join(out, 'examples/music-lab.html'))).toBe(false);
      expect(existsSync(join(out, 'examples/music-lab'))).toBe(false);
      const shipped = readdirSync(join(out, 'examples'));
      expect(shipped.filter((f) => /^\d\d-/.test(f) || ['index.html', 'examples.json', 'examples.css', '_checks'].includes(f))).toEqual([]);      // no numbered tour, no index, nothing test-only
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 60_000);
});
