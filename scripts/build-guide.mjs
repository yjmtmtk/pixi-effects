// Builds the human guide site: site/guide/*.md  →  <outDir>/*.html (one self-contained static page each, no client framework).
// Run: node scripts/build-guide.mjs [outDir]      (default: _site/guide; the Pages workflow runs it)
//
// A page is markdown with a front matter block (title, section, order, summary). Two directives are added to markdown:
//   {{demo path/to/page.html [16/9]}}   a lazy iframe of a page of this repo (examples/...), with an "open" link; the file must exist
//   {{code path/to/file lang}}          a real file of this repo as a code block (so the guide's code is the code that is tested)
// `../` links reach the rest of the site (examples/, dist/, ai/): the guide sits in <site>/guide/.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
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
      const embed = path.startsWith('examples/gallery/') ? url + '?poster' : url;      // gallery pieces park on their poster frame with ?poster
      return `\n<figure class="demo"><div class="frame" style="aspect-ratio:${(ratio || '16/9').replace(/\s/g, '')}"><iframe src="${esc(embed)}" loading="lazy" title="Live demo: ${esc(basename(path))}" allow="autoplay; fullscreen"></iframe></div><figcaption>Live demo · <a href="${esc(url)}">open it on its own page ↗</a></figcaption></figure>\n`;
    })
    .replace(/\{\{code\s+(\S+)\s+(\w+)\s*\}\}/g, (_, path, lang) => {
      const text = readFileSync(fileOf(root, path, '{{code}}'), 'utf8').replace(/\s+$/, '');
      return '\n```' + lang + '\n' + text + '\n```\n';
    });
  return { html: md.parse(withDirectives), headings };
}

const CSS = `
:root { --bg:#fbfaf7; --panel:#ffffff; --ink:#1d2433; --dim:#65708a; --line:#e3dfd4; --accent:#3b5bdb; --accent-ink:#ffffff; --code:#f1eee6; --code-ink:#1d2433; --demo:#0b0f1a; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e1320; --panel:#131a2b; --ink:#e8eefc; --dim:#93a1c2; --line:#242f4a; --accent:#8fa8ff; --accent-ink:#0e1320; --code:#0a0f1c; --code-ink:#e6ecff; --demo:#000; } }
* { box-sizing: border-box; }
html { scroll-padding-top: 76px; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
a { color:var(--accent); text-underline-offset:3px; }
header.top { position:sticky; top:0; z-index:5; background:var(--panel); border-bottom:1px solid var(--line); display:flex; align-items:center; gap:18px; padding:12px 20px; }
header.top .brand { font-weight:700; color:var(--ink); text-decoration:none; font-size:17px; letter-spacing:-.01em; }
header.top nav.links { margin-left:auto; display:flex; gap:16px; font-size:14px; }
header.top nav.links a { color:var(--dim); text-decoration:none; } header.top nav.links a:hover { color:var(--ink); }
.layout { max-width:1180px; margin:0 auto; display:grid; grid-template-columns:240px minmax(0,1fr); gap:40px; padding:28px 20px 80px; }
aside.side { position:sticky; top:84px; align-self:start; max-height:calc(100vh - 100px); overflow:auto; font-size:14.5px; }
aside.side h4 { margin:18px 0 6px; font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); font-weight:600; }
aside.side h4:first-child { margin-top:0; }
aside.side a { display:block; padding:5px 10px; color:var(--ink); text-decoration:none; border-radius:6px; }
aside.side a:hover { background:var(--code); }
aside.side a[aria-current="page"] { background:var(--accent); color:var(--accent-ink); font-weight:600; }
details.mobile-nav { display:none; }
article { min-width:0; max-width:780px; }
article h1 { font-size:2.1rem; line-height:1.2; margin:0 0 .4em; letter-spacing:-.02em; }
article h2 { font-size:1.45rem; margin:2.2em 0 .5em; letter-spacing:-.01em; padding-top:.4em; border-top:1px solid var(--line); }
article h3 { font-size:1.12rem; margin:1.8em 0 .4em; }
article .anchor { margin-left:.4em; color:var(--dim); text-decoration:none; opacity:0; font-weight:400; } article h2:hover .anchor, article h3:hover .anchor { opacity:1; }
article p.lead { font-size:1.15rem; color:var(--dim); margin-top:0; }
article code { background:var(--code); padding:.12em .38em; border-radius:4px; font:.9em ui-monospace,"SF Mono",Menlo,Consolas,monospace; }
article pre { position:relative; background:var(--code); color:var(--code-ink); padding:14px 16px; border-radius:10px; overflow:auto; line-height:1.5; border:1px solid var(--line); }
article pre code { background:none; padding:0; font-size:13.5px; }
article pre button.copy { position:absolute; top:8px; right:8px; font:12px system-ui; padding:3px 9px; border-radius:6px; border:1px solid var(--line); background:var(--panel); color:var(--dim); cursor:pointer; opacity:0; }
article pre:hover button.copy { opacity:1; }
article table { border-collapse:collapse; width:100%; font-size:14.5px; display:block; overflow-x:auto; }
article th, article td { border-bottom:1px solid var(--line); padding:8px 12px; text-align:left; vertical-align:top; }
article th { color:var(--dim); font-weight:600; font-size:13px; }
article blockquote { margin:1.2em 0; padding:.2em 1.1em; border-left:4px solid var(--accent); background:var(--panel); border-radius:0 8px 8px 0; color:var(--ink); }
article img { max-width:100%; height:auto; border-radius:10px; border:1px solid var(--line); }
article figure.shot { margin:1.6em 0; } article figure.shot figcaption { font-size:13px; color:var(--dim); margin-top:6px; }
article figure.demo { margin:1.6em 0; }
article figure.demo .frame { background:var(--demo); border-radius:10px; overflow:hidden; border:1px solid var(--line); }
article figure.demo iframe { width:100%; height:100%; border:0; display:block; }
article figure.demo figcaption { font-size:13px; color:var(--dim); margin-top:6px; }
nav.pager { display:flex; justify-content:space-between; gap:16px; margin-top:56px; padding-top:20px; border-top:1px solid var(--line); }
nav.pager a { flex:1; padding:14px 16px; border:1px solid var(--line); border-radius:10px; background:var(--panel); text-decoration:none; color:var(--ink); }
nav.pager a small { display:block; color:var(--dim); font-size:12px; } nav.pager a.next { text-align:right; } nav.pager a:hover { border-color:var(--accent); }
.toc { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 16px; margin:1.2em 0 2em; font-size:14.5px; }
.toc b { font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); }
.toc ul { margin:6px 0 2px; padding-left:18px; } .toc li.l3 { margin-left:14px; list-style:circle; }
footer.foot { max-width:1180px; margin:0 auto; padding:0 20px 40px; color:var(--dim); font-size:13px; }
@media (max-width: 860px) { .layout { grid-template-columns:1fr; gap:0; } aside.side { display:none; } details.mobile-nav { display:block; margin:0 20px; max-width:780px; } header.top nav.links { display:none; }
  details.mobile-nav { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px 14px; margin-top:16px; } details.mobile-nav a { display:block; padding:6px 0; color:var(--ink); text-decoration:none; } }
`;

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
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.meta.title)} — pixi-effects guide</title>
<meta name="description" content="${esc(page.meta.summary || 'pixi-effects guide')}">
<style>${CSS}</style></head>
<body>
<header class="top"><a class="brand" href="index.html">pixi-effects</a>
  <nav class="links"><a href="../examples/gallery/">Gallery</a><a href="../examples/playground.html">Playground</a><a href="${REPO}/blob/main/docs/dsl.md">Reference</a><a href="${REPO}">GitHub</a></nav></header>
<details class="mobile-nav"><summary>Menu</summary>${navHtml(pages, page.file)}</details>
<div class="layout"><aside class="side">${navHtml(pages, page.file)}</aside>
<article>
<h1>${esc(page.meta.title)}</h1>
${summary}${tocHtml}
${rendered.html}
<nav class="pager">${prev ? `<a class="prev" href="${prev.file}.html"><small>Previous</small>${esc(prev.meta.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.file}.html"><small>Next</small>${esc(next.meta.title)}</a>` : '<span></span>'}</nav>
</article></div>
<footer class="foot">pixi-effects is MIT licensed · <a href="${REPO}">source</a> · <a href="https://www.npmjs.com/package/pixi-effects">npm</a> · <a href="../examples/gallery/">gallery</a></footer>
<script>${COPY_JS}</script>
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
  return { pages: pages.map(p => ({ file: p.file, meta: p.meta })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = resolve(process.argv[2] ?? join(DEFAULT_ROOT, '_site/guide'));
  const { pages } = await buildGuide({ srcDir: join(DEFAULT_ROOT, 'site/guide'), outDir });
  console.log(`guide: ${pages.length} pages → ${outDir}`);
}
