// node scripts/preview-landing.mjs [site/landing/drafts/fable.html]  →  landing-preview/ : the page as it is deployed (at the site root, next to examples/ and guide/),
// so its relative image links work. Then serve the folder, e.g. `npx serve landing-preview`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(root, process.argv[2] ?? 'site/landing/index.html');
const out = path.join(root, 'landing-preview');
if (!fs.existsSync(src)) { console.error(`landing: ${src} does not exist`); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(src, path.join(out, 'index.html'));
// the page only needs the pictures it links to (its live demos point at the published gallery)
const copyDir = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, path.join(out, to), { recursive: true }); else console.warn(`landing: ${path.relative(root, from)} is missing`); };
copyDir(path.join(root, 'examples/gallery/posters'), 'examples/gallery/posters');
copyDir(path.join(root, 'site/guide/assets'), 'guide/assets');
console.log(`landing-preview/ ready from ${path.relative(root, src)}`);
