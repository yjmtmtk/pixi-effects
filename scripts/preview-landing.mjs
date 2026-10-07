// node scripts/preview-landing.mjs [page.html]
//   no argument: every draft in site/landing/drafts/*.html  →  landing-preview/<name>.html  (+ an index.html that lists them)
//   with a page:  that page                                 →  landing-preview/index.html
// The page is put where it is deployed (the site root, next to examples/ and guide/), so its relative image links work, and the folder
// holds copies of the pictures it needs: open landing-preview/index.html in a browser (a file:// open works; so does `npx serve landing-preview`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'landing-preview');
const arg = process.argv[2];
const pages = arg
  ? [[ 'index', path.resolve(root, arg) ]]
  : fs.readdirSync(path.join(root, 'site/landing/drafts')).filter(f => f.endsWith('.html')).sort().map(f => [f.replace(/\.html$/, ''), path.join(root, 'site/landing/drafts', f)]);
for (const [, src] of pages) if (!fs.existsSync(src)) { console.error(`landing: ${src} does not exist`); process.exit(1); }
if (pages.length === 0) { console.error('landing: no pages (site/landing/drafts/*.html)'); process.exit(1); }

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const [name, src] of pages) fs.copyFileSync(src, path.join(out, `${name}.html`));
// the page only needs the pictures it links to (its live demos point at the published gallery)
const copyDir = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, path.join(out, to), { recursive: true }); else console.warn(`landing: ${path.relative(root, from)} is missing`); };
copyDir(path.join(root, 'examples/gallery/posters'), 'examples/gallery/posters');
copyDir(path.join(root, 'site/guide/assets'), 'guide/assets');
if (!arg) {
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Landing drafts</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;background:#f4f1ea;color:#16150f}@media(prefers-color-scheme:dark){body{background:#0b0d12;color:#eceef2}a{color:#ff8a70}}a{color:#c43316}</style>
<h1>Landing page drafts</h1><ul>${pages.map(([n]) => `<li><a href="${n}.html">${n}</a></li>`).join('')}</ul>`);
} else fs.renameSync(path.join(out, 'index.html'), path.join(out, 'index.html'));
console.log(`landing-preview/ ready (${pages.map(([n]) => `${n}.html`).join(', ')}) — open landing-preview/index.html`);
