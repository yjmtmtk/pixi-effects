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

describe('site-links: more than href and src', () => {
  const make = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'links2-'));
    for (const [name, body] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), body); }
    return dir;
  };
  it('checks import-map targets, static and dynamic module imports, and srcset', () => {
    const dir = make({
      'ok.js': '', 'a/ok.png': '',
      'index.html': [
        '<script type="importmap">{ "imports": { "good": "./ok.js", "bad": "./gone.js", "cdn": "https://esm.sh/x" } }</script>',
        '<script type="module">import a from "./ok.js"; import b from "./missing-static.js"; const c = await import("./missing-dynamic.js"); import d from "good";</script>',
        '<img srcset="a/ok.png 1x, a/missing-2x.png 2x">',
      ].join('\n'),
    });
    try {
      const got = brokenLinks(dir).map((p: any) => p.ref).sort();
      expect(got).toEqual(['./gone.js', './missing-dynamic.js', './missing-static.js', 'a/missing-2x.png']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('still ignores code that only looks like a link: template strings and a script that builds markup', () => {
    const dir = make({ 'index.html': '<script>const h = `<a href="${x}.html">`; const u = "./not-an-import.js"; fetch(u);</script>' });
    try { expect(brokenLinks(dir)).toEqual([]); } finally { rmSync(dir, { recursive: true, force: true }); }
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
