// Generates examples/gallery/pieces.json from the `#piece-meta` block embedded in every
// examples/gallery/<id>.html. Run: node scripts/build-gallery.mjs   (a test fails when the committed file is stale)
//
// A piece is valid when its meta parses, has the fields below, and posters/<id>.jpg exists with an entry in posters/manifest.json.
// The poster TIME is the piece's own (`movie.init({ poster })`); `node scripts/make-posters.mjs` opens every piece, takes that picture and
// writes the manifest (poster frame + a hash of the page, so a poster that is out of date is noticed).
// Pieces are ordered by FEATURED (hand-picked rhythm for the top of the reel), then by title.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(here, '..');
export const GALLERY_DIR = 'examples/gallery';
export const MODELS = ['fable', 'opus', 'sonnet'];

// Hand-picked opening order: strong, varied posters first, aspect ratios interleaved so the
// masonry has rhythm. Anything not listed follows, sorted by title.
export const FEATURED = [
  'synthwave-drive',
  'ma',
  'aurora-logo',
  'social-quote-vertical',
  'kinetic-manifesto',
  'film-titles',
  'generative-orbits',
  'news-package',
  'aura-launch',
  'travel-slideshow',
  'sports-scoreboard',
  'data-story',
  'app-promo',
  'network-explainer',
  'transitions-reel',
  'countdown-newyear',
  'music-visualizer',
];

const META_RE = /<script[^>]*\bid=["']piece-meta["'][^>]*>([\s\S]*?)<\/script>/i;

const isPosInt = (v) => Number.isInteger(v) && v > 0;
const isPosNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The fingerprint of a piece's page: its poster is out of date when this differs from the one recorded in the manifest. */
export function posterHash(html) {
  return createHash('sha1').update(html).digest('hex');
}

/** Parse one piece. Returns { piece, stale? } or { errors: string[] }. `poster` is the piece's entry in posters/manifest.json. */
export function readPiece(id, html, { posterExists, notesExists, poster }) {
  const errors = [];
  const m = html.match(META_RE);
  if (!m) return { errors: [`${id}.html: no <script type="application/json" id="piece-meta"> block`] };

  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    return { errors: [`${id}.html: #piece-meta is not valid JSON (${e.message})`] };
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { errors: [`${id}.html: #piece-meta must be a JSON object`] };

  if (typeof meta.title !== 'string' || !meta.title.trim()) errors.push(`${id}.html: meta.title must be a non-empty string`);
  if (meta.subtitle !== undefined && typeof meta.subtitle !== 'string') errors.push(`${id}.html: meta.subtitle must be a string`);
  if (meta.tags !== undefined && !(Array.isArray(meta.tags) && meta.tags.every((t) => typeof t === 'string' && t.trim())))
    errors.push(`${id}.html: meta.tags must be an array of non-empty strings`);
  if (!isPosInt(meta.width)) errors.push(`${id}.html: meta.width must be a positive integer (got ${JSON.stringify(meta.width)})`);
  if (!isPosInt(meta.height)) errors.push(`${id}.html: meta.height must be a positive integer (got ${JSON.stringify(meta.height)})`);
  if (!isPosNum(meta.duration)) errors.push(`${id}.html: meta.duration must be a positive number of seconds (got ${JSON.stringify(meta.duration)})`);
  if (!MODELS.includes(meta.model)) errors.push(`${id}.html: meta.model must be one of ${MODELS.join(' | ')} (got ${JSON.stringify(meta.model)})`);
  if (!posterExists) errors.push(`${id}.html: poster missing — expected ${GALLERY_DIR}/posters/${id}.jpg (run node scripts/make-posters.mjs)`);
  if (!poster) errors.push(`${id}.html: no entry in ${GALLERY_DIR}/posters/manifest.json (run node scripts/make-posters.mjs --only ${id})`);

  if (errors.length) return { errors };

  return {
    piece: {
      id,
      title: meta.title.trim(),
      subtitle: (meta.subtitle ?? '').trim(),
      tags: (meta.tags ?? []).map((t) => t.trim()),
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      posterFrame: poster.posterFrame,
      model: meta.model,
      page: `${id}.html`,
      poster: `posters/${id}.jpg`,
      notes: notesExists ? `_notes/${id}.md` : null,
    },
    stale: poster.hash !== posterHash(html),
  };
}

export function sortPieces(pieces) {
  const rank = new Map(FEATURED.map((id, i) => [id, i]));
  return [...pieces].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
    const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
    if (ra !== rb) return ra - rb;
    return a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en');
  });
}

/**
 * Read every gallery piece under `root`. Throws an Error listing every problem when any piece is invalid.
 * Returns { pieces, json } where json is the exact text written to pieces.json.
 */
export function buildGallery(root = DEFAULT_ROOT) {
  const dir = resolve(root, GALLERY_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html').sort();
  if (files.length === 0) throw new Error(`build-gallery: no pieces found in ${dir}`);

  const manifestFile = join(dir, 'posters', 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const pieces = [];
  const errors = [];
  const warnings = [];
  for (const file of files) {
    const id = file.slice(0, -'.html'.length);
    const html = readFileSync(join(dir, file), 'utf8');
    const posterExists = existsSync(join(dir, 'posters', `${id}.jpg`));
    const notesExists = existsSync(join(dir, '_notes', `${id}.md`));
    const r = readPiece(id, html, { posterExists, notesExists, poster: manifest[id] });
    if (r.errors) errors.push(...r.errors);
    else {
      pieces.push(r.piece);
      if (r.stale) warnings.push(`${id}.html: its poster is out of date (run node scripts/make-posters.mjs --only ${id})`);
      if (!notesExists) warnings.push(`${id}.html: no stumble notes at ${GALLERY_DIR}/_notes/${id}.md`);
    }
  }
  if (errors.length) {
    throw new Error(`build-gallery: ${errors.length} problem${errors.length === 1 ? '' : 's'} — fix the piece(s) and run again:\n  - ${errors.join('\n  - ')}`);
  }

  const sorted = sortPieces(pieces);
  const json = JSON.stringify({ pieces: sorted }, null, 2) + '\n';
  return { pieces: sorted, json, warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { pieces, json, warnings } = buildGallery();
    const out = resolve(DEFAULT_ROOT, GALLERY_DIR, 'pieces.json');
    writeFileSync(out, json);
    for (const w of warnings) console.warn(`warning: ${w}`);
    const byModel = {};
    for (const p of pieces) byModel[p.model] = (byModel[p.model] ?? 0) + 1;
    console.log(`${GALLERY_DIR}/pieces.json — ${pieces.length} pieces (${Object.entries(byModel).map(([m, n]) => `${m} ${n}`).join(', ')})`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
