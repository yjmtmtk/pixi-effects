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
    const srcs = [...html.matchAll(/(?:src|data-src|srcset)="((?:examples|guide)\/[^"]+\.(?:jpg|png|webp))"/g)].map(m => m[1]!);
    expect(srcs.length).toBeGreaterThan(15);
    const missing = [...new Set(srcs)].filter(s => !existsSync(resolve(root, s.startsWith('guide/') ? `site/${s}` : s)));
    expect(missing).toEqual([]);
  });

  it('says the current release (bump it with the other pins when you release)', () => {
    const mentioned = [...html.matchAll(/v?(\d+\.\d+\.\d+)/g)].map(m => m[1]!).filter(v => /^0\.\d+\.\d+$/.test(v));
    expect(mentioned.length).toBeGreaterThan(2);
    expect(new Set(mentioned)).toEqual(new Set([version]));
  });

  it('has the one-sentence start, and it is the README\'s sentence', () => {
    const plain = html.replace(/<[^>]+>/g, '');                       // the sentence is built from spans (the ending swaps)
    expect(plain).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video:');
    expect(read('README.md')).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video');
    expect(html).toContain('AGENTS.md');
    expect(html).toContain('ai/CHAT.md');
  });

  it('compares fairly: the other two projects linked, the date, an honest "not pixi-effects when", and no benchmark claim', () => {
    expect(html).toContain('https://www.remotion.dev/');
    expect(html).toContain('https://fframes.studio/');
    expect(html).toMatch(/checked 2026-10-07/i);
    expect(html).toMatch(/Not pixi-effects when/i);
    expect(html).toMatch(/not been benchmarked against either tool/i);
    expect(html).not.toMatch(/\b(fastest|raw render speed)\b/i);               // no ranking of speed without a measurement of our own
    expect(html).not.toMatch(/\b(faster|fastest) than (remotion|fframes)\b/i);
  });

  it('credits the mediabunny benchmark with its real numbers and says what it is (and is not)', () => {
    expect(html).toContain('https://github.com/Vanilagy/fframes-mediabunny-benchmark');
    expect(html).toContain('13.8 s against 17.7 s');
    expect(html).toMatch(/not a pixi-effects one/i);
    expect(html).toMatch(/105–115 frames per second/);                       // measured on the author's M1 Pro (see FACTS.md)
  });

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

