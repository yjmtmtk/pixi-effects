// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { brokenLinks } from '../../scripts/site-links.mjs';
// @ts-expect-error plain ESM script without types
import { stageSite } from '../../scripts/stage-site.mjs';

const root = resolve(__dirname, '../..');

describe('site-links: the checker', () => {
  it('reports a missing file, a root-absolute path and a directory without index.html; accepts the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-'));
    try {
      mkdirSync(join(dir, 'a'), { recursive: true });
      mkdirSync(join(dir, 'empty'));
      writeFileSync(join(dir, 'ok.html'), '<p>ok</p>');
      writeFileSync(join(dir, 'a', 'index.html'), '<p>a</p>');
      writeFileSync(join(dir, 'index.html'), [
        '<a href="ok.html#x">ok</a>', '<a href="a/">dir</a>', '<img src="a/../ok.html">',
        '<a href="https://example.com/x">external</a>', '<a href="#top">anchor</a>', '<a href="mailto:a@b.c">mail</a>',
        '<a href="https://yjmtmtk.github.io/pixi-effects/ok.html">own origin</a>',
        '<a href="missing.html">missing</a>', '<a href="/ok.html">root absolute</a>', '<a href="empty/">no index</a>',
        '<script>const s = `<a href="${x}.html">`;</script>',
      ].join('\n'));
      const got = brokenLinks(dir).map((p: any) => `${p.ref}|${p.reason}`).sort();
      expect(got).toEqual([
        '/ok.html|root-absolute path (breaks under /pixi-effects/)',
        'empty/|directory has no index.html',
        'missing.html|file not found',
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the staged site (what GitHub Pages serves)', () => {
  it('has no broken local link in any page', async () => {
    const out = mkdtempSync(join(tmpdir(), 'site-'));
    try {
      await stageSite(out, { root });
      const problems = brokenLinks(out).map((p: any) => `${p.page}: ${p.ref} (${p.reason})`);
      expect(problems).toEqual([]);
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 120000);
});
