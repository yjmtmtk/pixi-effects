import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('index.html');
const version: string = JSON.parse(read('package.json')).version;

describe('the landing page (index.html at the repository root, deployed as the site root)', () => {
  it('gives an agent the one command that registers the skill, once, near the one-sentence request', () => {
    expect(html.split('npx skills add yjmtmtk/pixi-effects').length - 1).toBe(1);
  });

  it('is staged as the Pages site root by the stage script, which the workflow runs', () => {
    expect(read('.github/workflows/pages.yml')).toContain('node scripts/stage-site.mjs _site');
    expect(read('scripts/stage-site.mjs')).toContain("copy('index.html')");
  });

  it('every picture it links to exists, from the repository root (which is the site root)', () => {
    const srcs = [...html.matchAll(/(?:src|data-src|srcset)="((?:examples)\/[^"]+\.(?:jpg|png|webp))"/g)].map(m => m[1]!);
    expect(srcs.length).toBeGreaterThan(15);
    const missing = [...new Set(srcs)].filter(s => !existsSync(resolve(root, s)));
    expect(missing).toEqual([]);
  });

  it('says the current release (bump it with the other pins when you release)', () => {
    const mentioned = [...html.matchAll(/v?(\d+\.\d+\.\d+)/g)].map(m => m[1]!).filter(v => /^0\.\d+\.\d+$/.test(v));
    expect(mentioned.length).toBeGreaterThanOrEqual(2);      // the importmap pin and the status line
    expect(new Set(mentioned)).toEqual(new Set([version]));
  });

  it('has the one-sentence start, and it is the README\'s sentence', () => {
    const plain = html.replace(/<[^>]+>/g, '');                       // the sentence is built from spans (the ending swaps)
    expect(plain).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video:');
    expect(read('README.md')).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video');
    expect(read('for-ai.html')).toContain('AGENTS.md');                 // the reading list lives on the For AI page
    expect(read('for-ai.html')).toContain('ai/CHAT.md');
  });

  const mainText = () => html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/g, ' ').replace(/<p class="(?:fmeta|tally|sr)"[\s\S]*?<\/p>/g, ' ')    // labels and captions are not copy
    .replace(/<[^>]+>/g, ' ');
  it('is short: at most 400 visible words in <main>, captions and labels aside (measured 381 on 2026-10-15; it was 3,420)', () => {
    expect(mainText().split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(400);
  });
  it('shows, it does not teach: no Guide link, no comparison, no music lab, and the removed sections are gone', () => {
    expect(html).not.toMatch(/href="(?:\.\/)?guide\//);
    expect(html).not.toMatch(/remotion|fframes|music-lab/i);
    for (const id of ['get', 'ai', 'compare', 'start']) expect(html, id).not.toContain(`<section id="${id}"`);
    for (const id of ['reel', 'films', 'one', 'gallery', 'interactive', 'way']) expect(html, id).toMatch(new RegExp(`id="${id}"`));
  });
  it('keeps both films at the top, before the sentence', () => {
    expect(html.indexOf('id="films"')).toBeGreaterThan(0);
    expect(html.indexOf('id="films"')).toBeLessThan(html.indexOf('id="one"'));
    expect(html).toContain('examples/films/ink-and-paper.html');
    expect(html).toContain('examples/films/light-as-material.html');
  });
  it('points to the For AI page', () => { expect(html).toContain('href="for-ai.html"'); });

  it('runs its hero demo from the snippet it shows: one source, shown and executed (no second copy of the data)', () => {
    expect(html).toContain('importmap');
    expect(html).toContain('pixi-effects@' + version);
    expect(html).toMatch(/textContent/);
  });

  it('stays small and loads nothing from third parties at page load (fonts, trackers, libraries): only on a click', () => {
    const css = readFileSync(resolve(root, 'site/landing/landing.css'), 'utf8');
    expect(statSync(resolve(root, 'index.html')).size + css.length).toBeLessThan(130 * 1024);
    for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)) expect(m[0], 'same-site stylesheets only').toMatch(/href="(?!https?:|\/\/)[^"]+"/);
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/gi)) expect(m[1], 'same-site scripts only').not.toMatch(/^(https?:)?\/\//);
    expect(html).not.toMatch(/fonts\.googleapis|google-analytics|googletagmanager/i);
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
      expect(d).toMatch(/plain objects|plain data/i);
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

    it('has a canonical link and a theme colour for each scheme', () => {
      expect(html).toContain(`<link rel="canonical" href="${SITE}">`);
      expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)">/i);
      expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)">/i);
    });
  });
});

