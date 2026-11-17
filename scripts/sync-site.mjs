// Writes the shared parts into every page listed in site/pages.json, between its <!--site:NAME-->…<!--/site:NAME--> markers.
//   node scripts/sync-site.mjs            write
//   node scripts/sync-site.mjs --check    write nothing; exit 1 and list the pages that are out of date
// A page may list `parts` (default head, header, footer) and extra `regions` (see REGIONS) in site/pages.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderFooter, renderHead, renderHeader, rootPrefix } from './site-parts.mjs';
import { renderHero, renderPromo, renderRefined } from './samples.mjs';
import { renderGallery } from './gallery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Extra regions a page may ask for in site/pages.json (`regions: ["recipe-list"]`): name → (ctx) => html. */
export const REGIONS = {};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Every id of the AI recipes (`// @recipe <id>` in recipes.md), for the For AI page. */
REGIONS['recipe-list'] = ({ root_dir }) => {
  const md = readFileSync(join(root_dir, 'skills/pixi-effects/reference/recipes.md'), 'utf8');
  const ids = [...md.matchAll(/\/\/ @recipe ([^\n]+)/g)].map((m) => esc(m[1].trim()));
  return `<ul class="recipe-ids">\n${ids.map((id) => `<li><code>${id}</code></li>`).join('\n')}\n</ul>`;
};
/** The samples (site/samples/samples.json), as static HTML: the hero's tabs and player, the promo, the refined cards. */
REGIONS['samples-hero'] = renderHero;
REGIONS['samples-promo'] = renderPromo;
REGIONS['samples-refined'] = renderRefined;
/** The gallery (site/gallery/pieces.json): pieces picked from the old gallery, each a live player. */
REGIONS['gallery'] = renderGallery;
/** The Lab's "light" block: the comparison piece as a page and as an MP4, and the player the page loads once (lab/sizes.json, measured by scripts/lab-sizes.mjs). */
REGIONS['lab-sizes'] = ({ root_dir }) => {
  const s = JSON.parse(readFileSync(join(root_dir, 'lab/sizes.json'), 'utf8'));
  const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
  const top = Math.max(s.html, s.mp4, s.player);
  const w = (b) => `${Math.max(1, Math.round((b / top) * 100))}%`;
  return `<div class="sizes">
  <div class="size"><span class="size-name">The page</span><span class="bar page" style="--w:${w(s.html)}"></span><b>${kb(s.html)}</b></div>
  <div class="size"><span class="size-name">The MP4</span><span class="bar mp4" style="--w:${w(s.mp4)}"></span><b>${kb(s.mp4)}</b></div>
  <div class="size"><span class="size-name">Its player</span><span class="bar player" style="--w:${w(s.player)}"></span><b>${Math.round(s.player / 1024)} KB</b></div>
  <p class="size-note">The same 6 seconds at 640 × 360. The page needs its player, PixiJS and pixi-effects, which a browser loads once for the whole site (measured on the wire, from the CDNs). Every further video is a few KB, and it plays at 4K without growing.</p>
</div>`;
};
export function syncSite({ root = ROOT, check = false } = {}) {
  const { pages } = JSON.parse(readFileSync(join(root, 'site/pages.json'), 'utf8'));
  const stale = [], written = [];
  for (const page of pages) {
    const file = join(root, page.file);
    const depth = page.file.split('/').length - 1;
    const ctx = { root: rootPrefix(depth), current: page.current ?? '', root_dir: root, page };
    const all = { head: renderHead(ctx), header: renderHeader(ctx), footer: renderFooter(ctx) };
    const parts = {};
    for (const name of page.parts ?? ['head', 'header', 'footer']) parts[name] = all[name];
    for (const name of page.regions ?? []) {
      if (!REGIONS[name]) throw new Error(`${page.file}: unknown region "${name}"`);
      parts[name] = REGIONS[name](ctx);
    }
    const before = readFileSync(file, 'utf8');
    let html = before;
    for (const [name, body] of Object.entries(parts)) {
      const re = new RegExp(`(<!--site:${name}-->)[\\s\\S]*?(<!--/site:${name}-->)`);
      if (!re.test(html)) throw new Error(`${page.file}: no <!--site:${name}-->…<!--/site:${name}--> markers (add them where the part belongs)`);
      html = html.replace(re, (_m, open, close) => `${open}\n${body}\n${close}`);
    }
    if (html !== before) { stale.push(page.file); if (!check) { writeFileSync(file, html); written.push(page.file); } }
  }
  return { stale, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const { stale, written } = syncSite({ check });
  if (check && stale.length) { console.error(`out of date (run \`npm run site:sync\`): ${stale.join(', ')}`); process.exit(1); }
  console.log(check ? 'site parts are up to date' : written.length ? `synced: ${written.join(', ')}` : 'nothing to sync');
}
