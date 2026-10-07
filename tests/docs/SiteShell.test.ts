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

  it('the header has the brand and the four entrances, relative to the page, and marks the current one', () => {
    const h = renderHeader({ root: '../../', current: 'gallery' });
    expect(hrefs(h)).toEqual(expect.arrayContaining(['../../', '../../guide/', '../../examples/gallery/', '../../examples/', '../../examples/playground.html']));
    expect(NAV.map((n: any) => n.id)).toEqual(['guide', 'gallery', 'examples', 'playground']);
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toMatch(/<a href="\.\.\/\.\.\/examples\/gallery\/" aria-current="page">Gallery<\/a>/);
    expect(h).toContain('id="themeBtn"');
  });

  it('home marks the brand, an unknown current marks nothing', () => {
    expect(renderHeader({ root: '', current: 'home' })).toMatch(/class="brand"[^>]*aria-current="page"/);
    expect(renderHeader({ root: '', current: '' })).not.toContain('aria-current');
  });

  it('the footer links to every entrance, the repository, npm and the AI entry', () => {
    const f = renderFooter({ root: '../' });
    for (const need of ['../guide/', '../examples/gallery/', '../examples/', '../examples/playground.html', '../examples/music-lab.html', '../llms.txt', 'https://github.com/yjmtmtk/pixi-effects', 'https://www.npmjs.com/package/pixi-effects']) {
      expect(hrefs(f), need).toContain(need);
    }
  });

  it('the head loads the tokens, then the shared styles, then the script; the theme is applied before paint', () => {
    const h = renderHead({ root: '' });
    const order = ['site/shared/tokens.css', 'site/shared/site.css', 'site/shared/site.js'].map((s) => h.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).toContain("localStorage.getItem('pe-theme')");
  });
});

describe('sync-site: the pages carry the shared parts, up to date', () => {
  it('no page is stale (run `npm run site:sync` after editing site-parts.mjs)', () => {
    const { stale } = syncSite({ root, check: true });
    expect(stale).toEqual([]);
  });

  it('every page lists the three markers and a <main id="main">', () => {
    const pages = JSON.parse(readFileSync(resolve(root, 'site/pages.json'), 'utf8')).pages as Array<{ file: string }>;
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      const html = readFileSync(resolve(root, p.file), 'utf8');
      for (const name of ['head', 'header', 'footer']) expect(html, `${p.file} ${name}`).toMatch(new RegExp(`<!--site:${name}-->[\\s\\S]*<!--/site:${name}-->`));
      expect(html, p.file).toContain('<main id="main"');
    }
  });
});
