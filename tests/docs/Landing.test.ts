import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// The 1.0 landing page (docs/superpowers/specs/2026-11-16-site-v1-design.md, "Pages · 1"; plan Task 7).
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('index.html');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const visibleWords = () => main.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--site:samples-[\s\S]*?<!--\/site:samples-[a-z]+-->/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(Boolean).length;

describe('the landing page (index.html at the repository root, deployed as the site root)', () => {
  it('has the sections of the design, in order: hero, the promo of this project, one sentence, a few more messages, start, for the curious', () => {
    const ids = ['hero', 'promo', 'one-sentence', 'refined', 'start', 'curious'];
    const at = ids.map((id) => main.indexOf(`id="${id}"`));
    at.forEach((i, n) => expect(i, ids[n]).toBeGreaterThan(-1));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('the hero says it in one line and carries the generated sentence tabs and player', () => {
    expect(main).toMatch(/<h1[^>]*>\s*One sentence\.\s*(<br>)?\s*A finished video\.\s*<\/h1>/);
    expect(main).toContain('<!--site:samples-hero-->');
  });

  it('section 2 is the literal message, with the generated promo', () => {
    expect(main).toMatch(/<h2[^>]*>Make a promo video for this project\.<\/h2>/);
    expect(main).toContain('<!--site:samples-promo-->');
  });

  it('carries the one-sentence cards and the refined cards', () => {
    expect(main).toContain('<!--site:samples-one-->');
    expect(main).toContain('<!--site:samples-refined-->');
  });

  it('gives the install command exactly once, as a chip with a copy button, in "Start"', () => {
    expect(html.split('npx skills add yjmtmtk/pixi-effects').length - 1).toBe(1);
    const start = main.slice(main.indexOf('id="start"'), main.indexOf('id="curious"'));
    expect(start).toMatch(/class="code-chip"[\s\S]*npx skills add yjmtmtk\/pixi-effects[\s\S]*<button[^>]*data-copy/);
  });

  it('points to the Lab and the For AI page, quietly, and to no removed page', () => {
    const curious = main.slice(main.indexOf('id="curious"'));
    expect(curious).toContain('href="lab/"');
    expect(curious).toContain('href="for-ai.html"');
    // the removed pages: the docs tests that grep every shipped file check them
  });

  it('stays short: at most 500 visible words of its own in <main> (the generated samples aside)', () => {
    expect(visibleWords()).toBeLessThanOrEqual(500);
  });

  it('stays small and loads nothing from third parties at page load (fonts, trackers, libraries)', () => {
    const css = read('site/landing/landing.css');
    expect(statSync(resolve(root, 'index.html')).size + css.length).toBeLessThan(130 * 1024);
    for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)) expect(m[0], 'same-site stylesheets only').toMatch(/href="(?!https?:|\/\/)[^"]+"/);
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/gi)) expect(m[1], 'same-site scripts only').not.toMatch(/^(https?:)?\/\//);
    expect(html).not.toMatch(/fonts\.googleapis|google-analytics|googletagmanager|importmap/i);
  });

  it('keeps its source facts next to it, and they match the repository: the browser table in FACTS.md is the README\'s', () => {
    expect(existsSync(resolve(root, 'site/landing/FACTS.md'))).toBe(true);
    expect(read('README.md')).toContain('Chrome 94+');
    expect(read('site/landing/FACTS.md')).toContain('Chrome 94+');
  });

  describe('how it looks when it is found or shared (description, Open Graph, Twitter card)', () => {
    const meta = (key: string, attr = 'name') => new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1];
    const SITE = 'https://yjmtmtk.github.io/pixi-effects/';

    it('has a search description of a sensible length that says what it is', () => {
      const d = meta('description')!;
      expect(d.length).toBeGreaterThanOrEqual(80);
      expect(d.length).toBeLessThanOrEqual(165);                         // search results cut at about 160
      expect(d).toMatch(/AI/);
      expect(d).toMatch(/MP4/);
    });

    it('has Open Graph and Twitter tags: title, description, url, an absolute image that exists, and its alt text', () => {
      expect(meta('og:title', 'property')).toBeTruthy();
      expect(meta('og:description', 'property')!.length).toBeGreaterThan(60);
      expect(meta('og:type', 'property')).toBe('website');
      expect(meta('og:url', 'property')).toBe(SITE);
      const image = meta('og:image', 'property')!;
      expect(image.startsWith(SITE)).toBe(true);
      expect(existsSync(resolve(root, image.slice(SITE.length)))).toBe(true);
      expect(meta('og:image:alt', 'property')!.length).toBeGreaterThan(20);
      expect(meta('twitter:card')).toBe('summary_large_image');
      expect(meta('twitter:image')).toBe(image);
    });

    it('has a canonical link and one theme colour (light only)', () => {
      expect(html).toContain(`<link rel="canonical" href="${SITE}">`);
      expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}">/i);
      expect(html).toMatch(/<meta name="color-scheme" content="light">/);
    });
  });
});
