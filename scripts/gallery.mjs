// The landing page's gallery: pieces picked by the owner from the old gallery (2026-11-17), in site/gallery/ (their pages, posters and
// pieces.json). sync-site writes them into index.html as static HTML (region "gallery"), each a live player of its own page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The pieces, in the order they are shown. */
export function loadGallery(root) {
  return JSON.parse(readFileSync(join(root, 'site/gallery/pieces.json'), 'utf8')).pieces;
}

/** A card per piece: the shared live player (poster first, the page on a click), its title and its line. */
export function renderGallery(ctx) {
  const pieces = ctx.gallery ?? loadGallery(ctx.root_dir);
  const at = (f) => `${ctx.root}site/gallery/${f}`;
  return pieces.map((p) => `<article class="sample card gallery-card" id="gallery-${esc(p.id)}">
<figure class="live" data-page="${esc(at(p.page))}" data-modal data-w="${p.width}" data-h="${p.height}" data-title="${esc(p.title)}" data-line="${esc(p.subtitle)}" style="--ar:${(p.width / p.height).toFixed(4)}">
  <img src="${esc(at(p.poster))}" alt="${esc(p.title)}: ${esc(p.subtitle)}" width="${p.width}" height="${p.height}" loading="lazy">
  <button class="live-play" type="button" aria-label="Play ${esc(p.title)}">▶</button>
</figure>
<div class="sample-body">
  <h3 class="gallery-title">${esc(p.title)}</h3>
  <p class="gallery-line">${esc(p.subtitle)}</p>
</div>
</article>`).join('\n');
}
