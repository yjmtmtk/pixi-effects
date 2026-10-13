// Replace one gallery piece by another everywhere it is written down (or update a piece in place).
//
//   node scripts/gallery-swap.mjs <oldId> <new-page.html> [--id newId] [--notes notes.md] [--dry-run] [--no-posters]
//
// What it does: puts the new page into examples/gallery/ (its importmap pointed at the local build), removes the old page, its poster, its notes and
// its poster-manifest entry, replaces the row in MODELS.md, the card and the tally on the landing page (index.html), the entry in build-gallery.mjs's FEATURED,
// the `{{demo …}}` embeds in site/**/*.md and the model tally in site/landing/FACTS.md, then makes the new poster and regenerates pieces.json.
// It lists (and does not touch) what only a person can fix: prose that may describe the old piece, and any other mention outside the history files.
// With the SAME id it updates the piece in place (for example after music was added): the page is replaced and its poster is made again.
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve, basename, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPiece, MODELS, GALLERY_DIR, DEFAULT_ROOT } from './build-gallery.mjs';

const META_RE = /<script[^>]*\bid=["']piece-meta["'][^>]*>([\s\S]*?)<\/script>/i;
const ALLOWED_HOSTS = ['cdn.jsdelivr.net', 'esm.sh'];             // the importmap and the loader stylesheet; nothing else may be fetched
const HISTORY = [/^CHANGELOG\.md$/, /^docs\/superpowers\//, /^llms(-full)?\.txt$/, /^examples\/gallery\/pieces\.json$/, /^examples\/gallery\/posters\/manifest\.json$/, /^node_modules\//, /^dist\//, /^_site\//, /^\.git\//, /^examples\/gallery\/_notes\//, /^package-lock\.json$/];

const fmtDuration = (d) => `${Number.isInteger(d) ? d : String(d)} s`;

/** Landing-page card size for a piece's aspect ratio (what the existing cards use). */
export function cardSize(w, h) {
  if (w > h) return { width: 640, height: Math.round((640 * h) / w) };
  const width = w / h >= 0.75 ? 540 : 360;
  return { width, height: Math.round((width * h) / w) };
}

function readMeta(html) {
  const m = html.match(META_RE);
  if (!m) throw new Error('the page has no <script type="application/json" id="piece-meta"> block');
  try { return JSON.parse(m[1]); } catch (e) { throw new Error(`#piece-meta is not valid JSON (${e.message})`); }
}

/** Gallery rules the page must keep (see examples/gallery/BRIEF.md): metadata, 8 to 14 s, nothing fetched but the library and pixi / mediabunny imports. */
function checkPage(html, id) {
  const meta = readMeta(html);
  const r = readPiece(id, html, { posterExists: true, notesExists: true, poster: { posterFrame: 0, hash: '' } });
  if (r.errors) throw new Error(r.errors.join('; '));
  if (!(meta.duration >= 8 && meta.duration <= 14)) throw new Error(`the gallery keeps pieces to 8 to 14 s; this one is ${meta.duration} s`);
  const urls = [...html.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)].map((m) => m[0]);
  for (const u of urls) {
    const host = new URL(u).hostname;
    if (/fonts\.(googleapis|gstatic)\.com$/.test(host) || /@font-face/.test(html)) throw new Error(`the gallery has no web font (${u}): use system font stacks`);
    if (!ALLOWED_HOSTS.includes(host)) throw new Error(`the page fetches something from outside (${u}): a gallery piece is self-contained`);
  }
  return meta;
}

/** Point the three `pixi-effects*` importmap entries at the local build (what every gallery page does). */
export function localizeImportmap(html) {
  return html.replace(/("pixi-effects(?:\/[a-z]+)?"\s*:\s*)"https:\/\/cdn\.jsdelivr\.net\/npm\/pixi-effects@[^/"]+\/dist\/([A-Za-z]+\.js)"/g, '$1"../../dist/$2"');
}

function* walk(dir, base) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), rel = relative(base, p).split(sep).join('/');
    if (HISTORY.some((re) => re.test(rel))) continue;
    if (statSync(p).isDirectory()) yield* walk(p, base);
    else if (/\.(md|html|mjs|js|ts|json|txt)$/.test(name)) yield rel;
  }
}

function modelCounts(root) {
  const dir = resolve(root, GALLERY_DIR), counts = Object.fromEntries(MODELS.map((m) => [m, 0]));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html') && x !== 'index.html')) {
    try { counts[readMeta(readFileSync(join(dir, f), 'utf8')).model]++; } catch { /* a broken piece is build-gallery's problem */ }
  }
  return counts;
}

/**
 * @param {string} root the repository root
 * @param {{ oldId: string, file: string, newId?: string, notes?: string | null, dryRun?: boolean, posters?: boolean }} opts
 * @returns {Promise<{ changes: string[], review: string[] }>}
 */
export async function swapPiece(root, { oldId, file, newId, notes = null, dryRun = false, posters = true }) {
  const g = resolve(root, GALLERY_DIR);
  newId = newId ?? basename(file).replace(/\.html$/, '');
  const same = newId === oldId;
  if (!existsSync(join(g, `${oldId}.html`))) throw new Error(`no gallery piece "${oldId}" in ${GALLERY_DIR}/`);
  if (!same && existsSync(join(g, `${newId}.html`))) throw new Error(`a piece "${newId}" already exists: pick another id (--id) or use the same id as the old one to update it in place`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(newId)) throw new Error(`the id "${newId}" must be lowercase kebab-case`);

  const raw = readFileSync(file, 'utf8');
  const meta = checkPage(raw, newId);                                   // refuses before anything is changed
  const html = localizeImportmap(raw);
  const changes = [], review = [], writes = new Map(), removes = [];
  const rel = (p) => relative(root, p).split(sep).join('/');
  const queueWrite = (p, text, why) => { writes.set(p, text); changes.push(`${rel(p)}: ${why}`); };

  // 1. the files
  queueWrite(join(g, `${newId}.html`), html, same ? 'the piece is replaced (update in place)' : 'the new piece');
  if (!same) { removes.push(join(g, `${oldId}.html`)); changes.push(`${GALLERY_DIR}/${oldId}.html: removed`); }
  for (const f of [`posters/${oldId}.jpg`, ...(same ? [] : [`_notes/${oldId}.md`])]) if (existsSync(join(g, f))) { removes.push(join(g, f)); changes.push(`${GALLERY_DIR}/${f}: removed${f.startsWith('posters') && same ? ' (made again by make-posters)' : ''}`); }
  const manifestFile = join(g, 'posters/manifest.json');
  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')); delete manifest[oldId];
    queueWrite(manifestFile, JSON.stringify(manifest, null, 2) + '\n', `the poster entry of "${oldId}" is dropped (the new one is made by make-posters)`);
  }
  if (notes) { const dest = join(g, `_notes/${newId}.md`); changes.push(`${GALLERY_DIR}/_notes/${newId}.md: the author's notes`); writes.set(dest, readFileSync(notes, 'utf8')); }

  // 2. the places that list the piece
  // counts as they will be after the swap (nothing is written yet)
  const counts = (() => {                                              // counts as they will be after the swap
    const c = modelCounts(root);
    if (!existsSync(join(g, `${oldId}.html`))) return c;
    try { c[readMeta(readFileSync(join(g, `${oldId}.html`), 'utf8')).model]--; } catch { /* ignore */ }
    c[meta.model]++; return c;
  })();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tally = MODELS.filter((m) => counts[m] > 0).map((m) => `${m} ${counts[m]}`);

  const edit = (p, fn, why) => {
    const full = join(root, p); if (!existsSync(full)) return;
    const before = writes.get(full) ?? readFileSync(full, 'utf8'), after = fn(before);
    if (after !== before) queueWrite(full, after, why);
  };

  edit(`${GALLERY_DIR}/MODELS.md`, (t) => {
    const row = `| ${meta.model} | ${meta.title}${meta.subtitle ? ` — ${meta.subtitle}` : ''} | ${meta.width}×${meta.height} | ${newId}.html |`;
    const lines = t.split('\n').map((l) => (l.endsWith(`| ${oldId}.html |`) ? row : l));
    return lines.join('\n').replace(/Counts: [^\n]*\(\d+ pieces\)\./, `Counts: ${MODELS.map((m) => `${m} ${counts[m]}`).join(', ')} (${total} pieces).`);
  }, 'the row and the counts');

  edit('scripts/build-gallery.mjs', (t) => (same ? t : t.replace(new RegExp(`^(\\s*)'${oldId}',`, 'm'), `$1'${newId}',`)), 'FEATURED');

  const size = cardSize(meta.width, meta.height), alt = (meta.subtitle || meta.title).replace(/"/g, '&quot;');
  const card = `<a class="piece" href="examples/gallery/#${newId}" data-piece="${newId}"><figure style="margin:0"><div class="frame"><img src="examples/gallery/posters/${newId}.jpg" width="${size.width}" height="${size.height}" loading="lazy" alt="${alt}"></div><figcaption><b>${meta.title}</b><span>${meta.width}×${meta.height} · ${fmtDuration(meta.duration)} · ${meta.model}</span></figcaption></figure></a>`;
  edit('index.html', (t) => {
    let out = t.replace(new RegExp(`<a class="piece" href="examples/gallery/#${oldId}" data-piece="${oldId}">[\\s\\S]*?</a>`), card);
    out = out.replace(/(<span>written by )[^\n]*?(<\/span><span>\+)/, `$1${tally.map((x) => x.replace(/^(\S+) (\d+)$/, '<b>$1 $2</b>')).join(' · ')}$2`);
    return out.replace(/<span>\d+ pieces<\/span>/, `<span>${total} pieces</span>`);
  }, 'the card and the tally');

  edit('site/landing/FACTS.md', (t) => t.replace(/\(fable \d+[^)]*\)/, `(${MODELS.map((m) => `${m} ${counts[m]}`).join(', ')})`), 'the model tally');

  // 3. embeds in the guide, and a list of everything else for a person
  const embedRe = new RegExp(`\\{\\{demo examples/gallery/${oldId}\\.html\\}\\}`, 'g');
  for (const p of walk(root, root)) {
    if (p.startsWith(`${GALLERY_DIR}/${oldId}.html`) || p === `${GALLERY_DIR}/${newId}.html`) continue;
    const full = join(root, p), text = writes.get(full) ?? readFileSync(full, 'utf8');
    if (!same && p.endsWith('.md') && embedRe.test(text)) {
      embedRe.lastIndex = 0;
      queueWrite(full, text.replace(embedRe, `{{demo examples/gallery/${newId}.html}}`), 'the embed now shows the new piece');
      const lines = text.split('\n'); lines.forEach((l, i) => { if (new RegExp(`gallery/${oldId}\\.html`).test(l)) review.push(`${p}:${i + 1}: the text around this embed may describe the old piece "${oldId}"`); });
      continue;
    }
    if (same) continue;
    const lines = text.split('\n');
    lines.forEach((l, i) => { if (new RegExp(`(?<![\\w-])${oldId}(?![\\w-])`).test(l)) review.push(`${p}:${i + 1}: still names "${oldId}": ${l.trim().slice(0, 110)}`); });
  }

  if (dryRun) return { changes, review };
  for (const [p, text] of writes) writeFileSync(p, text);
  for (const p of removes) rmSync(p, { force: true });
  if (posters) {
    const { makePosters } = await import(pathToFileURL(join(fileURLToPath(new URL('.', import.meta.url)), 'make-posters.mjs')).href);
    await makePosters({ root, only: [newId], log: (m) => changes.push(`poster: ${m}`) });
    const { buildGallery } = await import(pathToFileURL(join(fileURLToPath(new URL('.', import.meta.url)), 'build-gallery.mjs')).href);
    const { json } = buildGallery(root); writeFileSync(join(g, 'pieces.json'), json); changes.push(`${GALLERY_DIR}/pieces.json: regenerated`);
  }
  return { changes, review };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const flags = new Set(['--dry-run', '--no-posters']), valued = new Set(['--id', '--notes']);
  const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
  if (positional.length < 2) {
    console.error('usage: node scripts/gallery-swap.mjs <oldId> <new-page.html> [--id newId] [--notes notes.md] [--dry-run] [--no-posters]');
    process.exit(1);
  }
  for (const a of args) if (a.startsWith('--') && !flags.has(a) && !valued.has(a)) { console.error(`gallery-swap: unknown option ${a}`); process.exit(1); }
  try {
    const { changes, review } = await swapPiece(DEFAULT_ROOT, { oldId: positional[0], file: resolve(positional[1]), newId: opt('--id'), notes: opt('--notes') ? resolve(opt('--notes')) : null, dryRun: args.includes('--dry-run'), posters: !args.includes('--no-posters') });
    console.log((args.includes('--dry-run') ? 'would change:\n' : 'changed:\n') + changes.map((c) => `  ${c}`).join('\n'));
    if (review.length) console.log('\nreview by hand (not changed):\n' + review.map((r) => `  ${r}`).join('\n'));
    if (args.includes('--no-posters') && !args.includes('--dry-run')) console.log(`\nnext: node scripts/make-posters.mjs --only ${opt('--id') ?? basename(positional[1]).replace(/\.html$/, '')} && node scripts/build-gallery.mjs && npm run test:changed`);
    else if (!args.includes('--dry-run')) console.log('\nnext: npm run build:ai (llms-full.txt) and npm run test:changed; read the review list above.');
  } catch (e) { console.error(`gallery-swap: ${e.message}`); process.exit(1); }
}
