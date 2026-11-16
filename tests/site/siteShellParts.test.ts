// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { NAV, rootPrefix, renderHead, renderHeader, renderFooter } from '../../scripts/site-parts.mjs';
// @ts-expect-error plain ESM script without types
import { syncSite } from '../../scripts/sync-site.mjs';

const root = resolve(__dirname, '../..');
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('site-parts: the header, footer and head every page shares', () => {
  it('rootPrefix climbs one level per directory', () => {
    expect([0, 1, 2].map(rootPrefix)).toEqual(['', '../', '../../']);
  });

  it('the header has the brand, the entrances and GitHub, relative to the page, and marks the current one; there is no theme switch', () => {
    const h = renderHeader({ root: '../../', current: 'forai' });
    expect(hrefs(h)).toEqual(expect.arrayContaining(['../../', '../../for-ai.html', 'https://github.com/yjmtmtk/pixi-effects']));
    expect(NAV.map((n: any) => n.id)).toEqual(['forai']);                       // Lab joins when its page exists (plan Task 8)
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toMatch(/<a href="\.\.\/\.\.\/for-ai\.html" aria-current="page">For AI<\/a>/);
    expect(h).not.toContain('themeBtn');
  });

  it('home marks the brand, an unknown current marks nothing', () => {
    expect(renderHeader({ root: '', current: 'home' })).toMatch(/class="brand"[^>]*aria-current="page"/);
    expect(renderHeader({ root: '', current: '' })).not.toContain('aria-current');
  });

  it('the footer: GitHub, npm, CHANGELOG, the entrances, MIT and "made with PixiJS"', () => {
    const f = renderFooter({ root: '../' });
    for (const need of ['../for-ai.html', 'https://github.com/yjmtmtk/pixi-effects', 'https://www.npmjs.com/package/pixi-effects', 'https://github.com/yjmtmtk/pixi-effects/blob/main/CHANGELOG.md']) {
      expect(hrefs(f), need).toContain(need);
    }
    expect(f).toMatch(/MIT/);
    expect(f).toMatch(/made with PixiJS/i);
  });

  it('the footer follows NAV: an entrance added to NAV shows up in the footer without touching it', () => {
    NAV.push({ id: 'extra', label: 'Extra', href: 'extra/' });
    try { expect(hrefs(renderFooter({ root: '../' }))).toContain('../extra/'); } finally { NAV.pop(); }
  });

  it('the head loads the tokens, then the shared styles, then the live player; no theme script (light only)', () => {
    const h = renderHead({ root: '' });
    const order = ['site/shared/tokens.css', 'site/shared/site.css', 'site/shared/live.js'].map((s) => h.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).not.toContain('pe-theme');
  });
});

describe('sync-site: the pages carry the shared parts, up to date', () => {
  it('no page is stale (run `npm run site:sync` after editing site-parts.mjs)', () => {
    const { stale } = syncSite({ root, check: true });
    expect(stale).toEqual([]);
  });

  it('every page has its markers (all three unless the page lists `parts`) and a <main id="main">', () => {
    const pages = JSON.parse(readFileSync(resolve(root, 'site/pages.json'), 'utf8')).pages as Array<{ file: string; parts?: string[] }>;
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      const html = readFileSync(resolve(root, p.file), 'utf8');
      for (const name of p.parts ?? ['head', 'header', 'footer']) expect(html, `${p.file} ${name}`).toMatch(new RegExp(`<!--site:${name}-->[\\s\\S]*<!--/site:${name}-->`));
      expect(html, p.file).toContain('<main id="main"');
    }
  });
});
