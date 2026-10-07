// node scripts/preview-landing.mjs [page.html]
//   no argument: site/landing/index.html (the landing page)  →  landing-preview/index.html
//   with a page:  that page                                  →  landing-preview/index.html
// The page is put where it is deployed (the site root, next to examples/ and guide/), so its relative image links work, and the folder
// holds copies of the pictures it needs: open landing-preview/index.html in a browser (a file:// open works; so does `npx serve landing-preview`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'landing-preview');
const arg = process.argv[2];
const src = path.resolve(root, arg ?? 'site/landing/index.html');
if (!fs.existsSync(src)) { console.error(`landing: ${src} does not exist`); process.exit(1); }
const pages = [['index', src]];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const [name, src] of pages) fs.copyFileSync(src, path.join(out, `${name}.html`));
// the page only needs the pictures it links to (its live demos point at the published gallery)
const copyDir = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, path.join(out, to), { recursive: true }); else console.warn(`landing: ${path.relative(root, from)} is missing`); };
copyDir(path.join(root, 'examples/gallery/posters'), 'examples/gallery/posters');
copyDir(path.join(root, 'site/guide/assets'), 'guide/assets');
console.log(`landing-preview/ ready (${pages.map(([n]) => `${n}.html`).join(', ')}) — open landing-preview/index.html`);
