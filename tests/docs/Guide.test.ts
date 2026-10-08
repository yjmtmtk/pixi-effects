import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
// @ts-expect-error plain ESM script without types
import { buildGuide, parsePage, renderMarkdown, slugify } from '../../scripts/build-guide.mjs';

const root = resolve(__dirname, '../..');
const guideDir = join(root, 'site/guide');

describe('build-guide: markdown with a few directives', () => {
  it('slugify makes stable heading ids', () => {
    expect(slugify('Your first video (5 minutes)')).toBe('your-first-video-5-minutes');
    expect(slugify('  A & B  ')).toBe('a-b');
  });

  it('parsePage reads the front matter and returns the body', () => {
    const p = parsePage('---\ntitle: Hello\nsection: Start\norder: 2\nsummary: A page\n---\n# Body\n');
    expect(p.meta).toEqual({ title: 'Hello', section: 'Start', order: 2, summary: 'A page' });
    expect(p.body.trim()).toBe('# Body');
  });

  it('parsePage says which field is missing', () => {
    expect(() => parsePage('---\ntitle: x\n---\nbody', 'a.md')).toThrow(/a\.md.*section/s);
    expect(() => parsePage('no front matter', 'b.md')).toThrow(/b\.md.*front matter/s);
  });

  it('headings get ids and anchors, code is escaped and keeps its language, and a table renders', () => {
    const { html, headings } = renderMarkdown('## Two words\n\n```js\nconst a = "<b>";\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', { root, demoBase: '../' });
    expect(html).toContain('<h2 id="two-words">');
    expect(html).toContain('class="language-js"');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('<table>');
    expect(headings).toEqual([{ level: 2, id: 'two-words', text: 'Two words' }]);
  });

  it('{{demo}} of a gallery piece is its poster with a play button, not the piece: it loads and plays from 0:00 when clicked', () => {
    const { html } = renderMarkdown('{{demo examples/gallery/blueprint-house.html}}', { root, demoBase: '../' });
    expect(html).toContain('class="frame facade"');
    expect(html).toContain('src="../examples/gallery/posters/blueprint-house.jpg"');           // the poster, shown first
    expect(html).toContain('data-embed="../examples/gallery/blueprint-house.html"');            // what is loaded on click: no ?poster, so it starts at the beginning
    expect(html).not.toContain('?poster');
    expect(html).toContain('<button class="play"');
    expect(html).toContain('aspect-ratio:1280/720');                                            // from the piece's own size (pieces.json)
    expect(html).not.toContain('<iframe');                                                      // nothing heavy until the reader asks
    expect(html).toContain('href="../examples/gallery/blueprint-house.html"');                  // and a link to open it on its own
  });

  it('a gallery piece that is not 16:9 gets its own aspect ratio', () => {
    const { pieces } = JSON.parse(readFileSync(join(root, 'examples/gallery/pieces.json'), 'utf8')) as { pieces: Array<{ width: number; height: number; page: string }> };
    const odd = pieces.find(p => p.width !== 1280 || p.height !== 720);
    expect(odd).toBeTruthy();
    const { html } = renderMarkdown(`{{demo examples/gallery/${odd!.page}}}`, { root, demoBase: '../' });
    expect(html).toContain(`aspect-ratio:${odd!.width}/${odd!.height}`);
  });

  it('{{demo}} of any other page is a lazy iframe (those pages start at 0:00 on their own); a missing page is an error', () => {
    const { html } = renderMarkdown('{{demo examples/03-shapes.html}}', { root, demoBase: '../' });
    expect(html).toContain('<iframe');
    expect(html).toContain('src="../examples/03-shapes.html"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('href="../examples/03-shapes.html"');
    expect(() => renderMarkdown('{{demo examples/gallery/nope.html}}', { root, demoBase: '../' })).toThrow(/nope\.html/);
  });

  it('{{code path lang}} puts a real file into the page, escaped', () => {
    const { html } = renderMarkdown('{{code examples/_guide/first-video.html html}}', { root, demoBase: '../' });
    expect(html).toContain('language-html');
    expect(html).toContain('&lt;canvas');
    expect(() => renderMarkdown('{{code examples/_guide/missing.html html}}', { root, demoBase: '../' })).toThrow(/missing\.html/);
  });
});

describe('build-guide: assets', () => {
  it('copies <srcDir>/assets next to the pages, so a page can show images', async () => {
    const src = mkdtempSync(join(tmpdir(), 'guide-src-'));
    mkdirSync(join(src, 'assets'));
    writeFileSync(join(src, 'assets', 'pic.txt'), 'hello');
    writeFileSync(join(src, 'a.md'), '---\ntitle: A\nsection: Start\norder: 1\n---\n![a picture](assets/pic.txt)\n');
    const out = join(mkdtempSync(join(tmpdir(), 'guide-out-')), 'guide');
    await buildGuide({ srcDir: src, outDir: out, root });
    expect(readFileSync(join(out, 'assets', 'pic.txt'), 'utf8')).toBe('hello');
    expect(readFileSync(join(out, 'a.html'), 'utf8')).toContain('<img src="assets/pic.txt" alt="a picture"');
  });
});

describe('build-guide: the shared shell', () => {
  it('every page carries the shared head, header and footer, the guide styles, and the guide entrance is current', async () => {
    const out = mkdtempSync(join(tmpdir(), 'guide-'));
    const { pages } = await buildGuide({ srcDir: guideDir, outDir: out });
    expect(existsSync(join(out, 'guide.css'))).toBe(true);
    for (const p of pages as Array<{ file: string }>) {
      const html = readFileSync(join(out, `${p.file}.html`), 'utf8');
      expect(html, p.file).toContain('href="../site/shared/tokens.css"');
      expect(html, p.file).toContain('href="guide.css"');
      expect(html, p.file).toContain('<main id="main"');
      expect(html, p.file).toMatch(/<a href="\.\.\/guide\/" aria-current="page">Guide<\/a>/);
      expect(html, p.file).toContain('class="site-foot"');
      expect(html, p.file).not.toContain('<style>');
    }
  });
});

describe('the guide (site/guide)', () => {
  let out = '';
  let pages: Array<{ file: string; meta: { title: string; section: string; order: number } }> = [];
  beforeAll(async () => {
    const site = mkdtempSync(join(tmpdir(), 'guide-site-'));
    out = join(site, 'guide');
    pages = (await buildGuide({ srcDir: guideDir, outDir: out, root })).pages;
  });

  it('has the pages a newcomer needs: start, concepts, the feature guides, a cookbook, working with AI and a FAQ', () => {
    const names = pages.map(p => p.file);
    for (const n of ['index', 'getting-started', 'concepts', 'text', 'shapes', 'images-video', 'audio', 'filters', 'transitions', 'depth', 'export', 'player', 'review', 'cookbook', 'with-ai', 'faq']) {
      expect(names, `missing page ${n}`).toContain(n);
    }
  });

  it('every page is written, has a title, and the navigation lists every page', () => {
    for (const p of pages) {
      const html = readFileSync(join(out, `${p.file}.html`), 'utf8');
      expect(html).toContain(`<title>${p.meta.title.replace(/&/g, '&amp;')}`);
      for (const q of pages) expect(html, `${p.file} should link to ${q.file}`).toContain(`href="${q.file}.html"`);
    }
  });

  it('every internal link and every demo resolves (guide pages, anchors, files of this repo)', () => {
    const missing: string[] = [];
    const idsOf = new Map<string, Set<string>>();
    for (const p of pages) idsOf.set(p.file, new Set([...readFileSync(join(out, `${p.file}.html`), 'utf8').matchAll(/ id="([^"]+)"/g)].map(m => m[1]!)));
    for (const p of pages) {
      const html = readFileSync(join(out, `${p.file}.html`), 'utf8');
      for (const m of html.matchAll(/(?:href|src|data-embed)="([^"]+)"/g)) {
        const url = m[1]!;
        if (/^(https?:|mailto:|data:|#$)/.test(url)) continue;
        const [pathPart, hash] = url.split('#');
        if (pathPart === '') { if (!idsOf.get(p.file)!.has(hash!)) missing.push(`${p.file}: #${hash}`); continue; }
        if (pathPart === '../guide/') continue;                                  // the guide itself, built into <site>/guide/ (the staged-site link check covers it)
        if (pathPart!.startsWith('../')) {                                      // the rest of the site: examples / dist / ai / docs, which are the repo's folders
          if (!existsSync(join(root, pathPart!.slice(3)))) missing.push(`${p.file}: ${url}`);
        } else if (pathPart!.endsWith('.html')) {
          const name = pathPart!.slice(0, -5);
          if (!idsOf.has(name)) missing.push(`${p.file}: ${url}`);
          else if (hash && !idsOf.get(name)!.has(hash)) missing.push(`${p.file}: ${url}`);
        } else if (!existsSync(join(out, pathPart!))) missing.push(`${p.file}: ${url}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no leftover directives or placeholders; every code block has a language', () => {
    for (const f of readdirSync(guideDir).filter(f => f.endsWith('.md'))) {
      const md = readFileSync(join(guideDir, f), 'utf8');
      expect(md, f).not.toMatch(/\bTODO\b|\bTBD\b|\bXXX\b|lorem ipsum/i);
      for (const m of md.matchAll(/^```(\w*)\s*$/gm)) {
        // an opening fence has a language, a closing one is the empty one that follows: count them in pairs
      }
      const fences = [...md.matchAll(/^```(\S*)\s*$/gm)].map(m => m[1]);
      for (let i = 0; i < fences.length; i += 2) expect(fences[i], `${f}: a code block without a language`).not.toBe('');
    }
    for (const p of pages) expect(readFileSync(join(out, `${p.file}.html`), 'utf8'), p.file).not.toMatch(/\{\{/);
  });

  it('the first-video page pins the current release on the CDN (bump it with README and ai/template.html when you release)', () => {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    const page = readFileSync(join(root, 'examples/_guide/first-video.html'), 'utf8');
    expect([...page.matchAll(/pixi-effects@([\d.]+)\//g)].map(m => m[1])).toEqual([version, version]);
  });

  it('the pages are ordered by section and order, and each (but the ends) has previous / next links', () => {
    const html = readFileSync(join(out, `${pages[1]!.file}.html`), 'utf8');
    expect(html).toContain('class="prev"');
    expect(html).toContain('class="next"');
    expect(readFileSync(join(out, `${pages[0]!.file}.html`), 'utf8')).not.toContain('class="prev"');
  });
});
