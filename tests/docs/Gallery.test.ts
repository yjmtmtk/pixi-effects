// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { loadGallery } from '../../scripts/gallery.mjs';
// @ts-expect-error plain ESM script without types
import { REGIONS } from '../../scripts/sync-site.mjs';

// The landing page's gallery: pieces picked by the owner from the old gallery (2026-11-17), copied into site/gallery/ and played live on
// the page with the shared player. They are not one-sentence pieces, so they carry a title and a line, not a sentence.
const root = resolve(__dirname, '../..');
const pieces: any[] = loadGallery(root);
const ctx = { root: '', root_dir: root, current: 'home' };

describe('site/gallery/pieces.json', () => {
  it('lists pieces whose page and poster exist, with unique ids, a title, a line and a size', () => {
    expect(pieces.length).toBeGreaterThan(0);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
    for (const p of pieces) {
      expect(typeof p.title === 'string' && p.title.length > 0, p.id).toBe(true);
      expect(typeof p.subtitle === 'string' && p.subtitle.length > 0, p.id).toBe(true);
      expect(p.width > 0 && p.height > 0, p.id).toBe(true);
      expect(existsSync(resolve(root, 'site/gallery', p.page)), p.page).toBe(true);
      expect(existsSync(resolve(root, 'site/gallery', p.poster)), p.poster).toBe(true);
    }
  });

  it('every file a piece loads from beside it exists (the library from ../../dist, shared sound from ../_assets)', () => {
    for (const p of pieces) {
      const html = readFileSync(resolve(root, 'site/gallery', p.page), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      for (const m of html.matchAll(/['"](\.\.?\/[^'"]+)['"]/g)) {
        const ref = m[1]!;
        if (ref.startsWith('../../dist/')) continue;                       // the built library, staged at the site root
        expect(existsSync(resolve(root, 'site/gallery', ref)), `${p.page}: ${ref}`).toBe(true);
      }
    }
  });
});

describe('the gallery page (gallery/index.html)', () => {
  it('is a page of the site with the gallery region, marked current in the header, and its players point back up to site/gallery/', () => {
    const pages = JSON.parse(readFileSync(resolve(root, 'site/pages.json'), 'utf8')).pages;
    const entry = pages.find((p: any) => p.file === 'gallery/index.html');
    expect(entry).toBeTruthy();
    expect(entry.current).toBe('gallery');
    expect(entry.regions).toContain('gallery');
    const html = readFileSync(resolve(root, 'gallery/index.html'), 'utf8');
    expect(html).toContain('<!--site:gallery-->');
    expect(html).toMatch(/<a href="\.\.\/gallery\/" aria-current="page">Gallery<\/a>/);
    const first = html.match(/<figure class="live"[^>]*data-page="([^"]+)"/)![1];
    expect(first).toBe(`../site/gallery/${pieces[0].page}`);
    expect(html).toMatch(/<h1[^>]*>Gallery<\/h1>/);
  });
});

describe('the gallery region sync-site writes', () => {
  it('a card per piece, in order: a live player of its page, its poster at its own size, its title and its line', () => {
    const html = REGIONS['gallery'](ctx) as string;
    const pages = [...html.matchAll(/<figure class="live"[^>]*data-page="([^"]+)"/g)].map((m) => m[1]);
    expect(pages).toEqual(pieces.map((p) => `site/gallery/${p.page}`));
    for (const p of pieces) {
      expect(html).toContain(`src="site/gallery/${p.poster}"`);
      expect(html).toMatch(new RegExp(`src="site/gallery/${p.poster}"[^>]*width="${p.width}" height="${p.height}"`));
      expect(html).toContain(`aria-label="Play ${p.title.replace(/&/g, '&amp;')}"`);
    }
    expect(html).not.toMatch(/unedited|1 message/);
    const figs = [...html.matchAll(/<figure class="live"[^>]*>/g)].map((m) => m[0]);
    pieces.forEach((p, i) => {                                               // opens in a window at its own size (site/shared/live.js, data-modal)
      expect(figs[i]).toMatch(/ data-modal/);
      expect(figs[i]).toContain(`data-w="${p.width}" data-h="${p.height}"`);
      expect(figs[i]).toContain(`data-title="${p.title.replace(/&/g, '&amp;')}"`);
    });                         // not the one-sentence claim
  });
});
