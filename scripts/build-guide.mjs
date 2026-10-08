// Builds the human guide site: site/guide/*.md  →  <outDir>/*.html (one self-contained static page each, no client framework).
// Run: node scripts/build-guide.mjs [outDir]      (default: _site/guide; the Pages workflow runs it)
//
// A page is markdown with a front matter block (title, section, order, summary). Two directives are added to markdown:
//   {{demo path/to/page.html [16/9]}}   a lazy iframe of a page of this repo (examples/...), with an "open" link; the file must exist
//   {{code path/to/file lang}}          a real file of this repo as a code block (so the guide's code is the code that is tested)
// `../` links reach the rest of the site (examples/, dist/, ai/): the guide sits in <site>/guide/.
import { renderFooter, renderHead, renderHeader } from './site-parts.mjs';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, cpSync, copyFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { Marked } from 'marked';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(here, '..');
const SECTIONS = ['Start', 'Guides', 'Cookbook', 'More'];
const REPO = 'https://github.com/yjmtmtk/pixi-effects';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugify(text) {
  return String(text).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** `---\nkey: value\n---\nbody` → { meta, body }. title, section and order are required. */
export function parsePage(source, file = 'page') {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!m) throw new Error(`${file}: the page must start with a front matter block (--- title: … ---)`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[1] === 'order' ? Number(kv[2]) : kv[2].trim();
  }
  for (const key of ['title', 'section', 'order']) {
    if (meta[key] === undefined || Number.isNaN(meta[key])) throw new Error(`${file}: front matter needs "${key}"`);
  }
  if (!SECTIONS.includes(meta.section)) throw new Error(`${file}: section "${meta.section}" is not one of ${SECTIONS.join(', ')}`);
  return { meta, body: m[2] };
}

function fileOf(root, rel, what) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new Error(`${what}: ${rel} does not exist (paths are relative to the repository root)`);
  return p;
}

/** The gallery's entry for `examples/gallery/<page>.html` when it has a poster image, else null. */
function galleryPiece(root, path) {
  const m = /^examples\/gallery\/([^/]+\.html)$/.exec(path);
  const file = join(root, 'examples/gallery/pieces.json');
  if (!m || !existsSync(file)) return null;
  const piece = JSON.parse(readFileSync(file, 'utf8')).pieces.find(p => p.page === m[1]);
  return piece && piece.poster && existsSync(join(root, 'examples/gallery', piece.poster)) ? piece : null;
}

/** Markdown → { html, headings } with the two directives resolved. */
export function renderMarkdown(markdown, { root = DEFAULT_ROOT, demoBase = '../' } = {}) {
  const headings = [];
  const seen = new Map();
  const md = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        let id = slugify(plain.replace(/&[a-z]+;/g, ' ')) || 'section';
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id += '-' + (n + 1);
        if (depth === 2 || depth === 3) headings.push({ level: depth, id, text: plain.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') });
        return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = (lang || '').split(/\s/)[0];
        return `<pre><code class="language-${esc(language || 'text')}">${esc(text)}</code></pre>\n`;
      },
    },
  });
  const withDirectives = markdown
    .replace(/\{\{demo\s+(\S+)(?:\s+(\d+\s*\/\s*\d+))?\s*\}\}/g, (_, path, ratio) => {
      fileOf(root, path, '{{demo}}');
      const url = demoBase + path;
      const piece = galleryPiece(root, path);
      if (piece) {
        // A gallery piece is shown as its poster with a play button. Clicking loads the piece (no ?poster: it starts at 0:00) and plays it;
        // an iframe parked on the poster frame would play on from the middle.
        return `\n<figure class="demo"><div class="frame facade" data-embed="${esc(url)}" style="aspect-ratio:${piece.width}/${piece.height}"><img src="${esc(demoBase + 'examples/gallery/' + piece.poster)}" alt="Poster of ${esc(piece.title)}" loading="lazy"><button class="play" type="button" aria-label="Play the demo">▶</button></div><figcaption>Live demo · click to play · <a href="${esc(url)}">open it on its own page ↗</a></figcaption></figure>\n`;
      }
      const embed = url;
      return `\n<figure class="demo"><div class="frame" style="aspect-ratio:${(ratio || '16/9').replace(/\s/g, '')}"><iframe src="${esc(embed)}" loading="lazy" title="Live demo: ${esc(basename(path))}" allow="autoplay; fullscreen"></iframe></div><figcaption>Live demo · <a href="${esc(url)}">open it on its own page ↗</a></figcaption></figure>\n`;
    })
    .replace(/\{\{code\s+(\S+)\s+(\w+)\s*\}\}/g, (_, path, lang) => {
      const text = readFileSync(fileOf(root, path, '{{code}}'), 'utf8').replace(/\s+$/, '');
      return '\n```' + lang + '\n' + text + '\n```\n';
    });
  return { html: md.parse(withDirectives), headings };
}

const FACADE_JS = `document.querySelectorAll('.facade').forEach(function (f) {
  f.addEventListener('click', function () {
    if (f.dataset.loaded) return; f.dataset.loaded = '1'; f.classList.add('loading');
    var ifr = document.createElement('iframe'); ifr.title = 'Live demo'; ifr.allow = 'autoplay; fullscreen'; ifr.src = f.dataset.embed; f.appendChild(ifr);
    var tries = 0;
    (function wait() {                                                    // when the piece is ready: rewind to 0:00 and play (this click allows the sound); a deck plays to its first stop
      var w = null; try { w = ifr.contentWindow; } catch (e) { /* still loading */ }
      if (w && w.__ready === true && w.movie) {
        Promise.resolve(w.movie.gotoFrame(0, true)).then(function () { if (w.movie.stops && w.movie.stops.length) w.movie.next(); else w.movie.play(); f.classList.remove('loading'); f.classList.add('live'); });
        return;
      }
      if (++tries > 200) { f.classList.remove('loading'); f.classList.add('live'); return; }
      setTimeout(wait, 100);
    })();
  });
});`;

const COPY_JS = `document.querySelectorAll('article pre').forEach(function (pre) { var b = document.createElement('button'); b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy';
  b.onclick = function () { navigator.clipboard.writeText(pre.querySelector('code').textContent).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200); }); }; pre.appendChild(b); });`;

function navHtml(pages, current) {
  const out = [];
  for (const section of SECTIONS) {
    const list = pages.filter(p => p.meta.section === section);
    if (!list.length) continue;
    out.push(`<h4>${esc(section)}</h4>`);
    for (const p of list) out.push(`<a href="${p.file}.html"${p.file === current ? ' aria-current="page"' : ''}>${esc(p.meta.title)}</a>`);
  }
  return out.join('\n');
}

function pageHtml(page, pages, i, rendered) {
  const prev = pages[i - 1], next = pages[i + 1];
  const toc = rendered.headings.filter(h => h.level <= 3);
  const tocHtml = toc.filter(h => h.level === 2).length >= 3
    ? `<div class="toc"><b>On this page</b><ul>${toc.map(h => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></div>` : '';
  const summary = page.meta.summary ? `<p class="lead">${esc(page.meta.summary)}</p>` : '';
  const ctx = { root: '../', current: 'guide' };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.meta.title)} — pixi-effects guide</title>
<meta name="description" content="${esc(page.meta.summary || 'pixi-effects guide')}">
${renderHead(ctx)}
<link rel="stylesheet" href="guide.css">
</head>
<body>
${renderHeader(ctx)}
<details class="mobile-nav"><summary>Menu</summary>${navHtml(pages, page.file)}</details>
<div class="layout"><aside class="side">${navHtml(pages, page.file)}</aside>
<main id="main"><article>
<h1>${esc(page.meta.title)}</h1>
${summary}${tocHtml}
${rendered.html}
<nav class="pager">${prev ? `<a class="prev" href="${prev.file}.html"><small>Previous</small>${esc(prev.meta.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.file}.html"><small>Next</small>${esc(next.meta.title)}</a>` : '<span></span>'}</nav>
</article></main></div>
${renderFooter(ctx)}
<script>${COPY_JS}
${FACADE_JS}</script>
</body></html>
`;
}

/** Build every page of `srcDir` into `outDir`. Returns { pages } in reading order. */
export async function buildGuide({ srcDir, outDir, root = DEFAULT_ROOT, demoBase = '../' }) {
  const files = readdirSync(srcDir).filter(f => f.endsWith('.md'));
  const pages = files.map(f => ({ file: f.slice(0, -3), ...parsePage(readFileSync(join(srcDir, f), 'utf8'), f) }));
  pages.sort((a, b) => SECTIONS.indexOf(a.meta.section) - SECTIONS.indexOf(b.meta.section) || a.meta.order - b.meta.order || a.file.localeCompare(b.file));
  mkdirSync(outDir, { recursive: true });
  if (existsSync(join(srcDir, 'assets'))) cpSync(join(srcDir, 'assets'), join(outDir, 'assets'), { recursive: true });   // images of the pages
  pages.forEach((p, i) => {
    const rendered = renderMarkdown(p.body, { root, demoBase });
    writeFileSync(join(outDir, `${p.file}.html`), pageHtml(p, pages, i, rendered));
  });
  copyFileSync(join(root, 'site/guide/guide.css'), join(outDir, 'guide.css'));                  // the guide's own styles (colours, header and footer are the site's)
  return { pages: pages.map(p => ({ file: p.file, meta: p.meta })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = resolve(process.argv[2] ?? join(DEFAULT_ROOT, '_site/guide'));
  const { pages } = await buildGuide({ srcDir: join(DEFAULT_ROOT, 'site/guide'), outDir });
  console.log(`guide: ${pages.length} pages → ${outDir}`);
}
